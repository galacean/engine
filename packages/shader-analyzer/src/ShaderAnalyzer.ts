import {
  ChunkOutputCache,
  normalizeShaderSourceFile,
  parseShaderPass,
  ShaderCoreInfo,
  ShaderSourceParser,
  type ParsedShaderPass,
  type PreprocessSourceMapSegment
} from "@galacean/engine-shader-parser/internal/analyzer";
import type { ShaderRange } from "@galacean/engine-shader-parser/internal/analyzer";
import type { IShaderPassSource, IShaderSource, IStatement } from "@galacean/engine-design";
import type { Diagnostic } from "./Diagnostic";
import { DiagnosticType } from "./Diagnostic";
import { gseErrorToDiagnostic } from "./convert";
import { validatePreprocessorExpressions } from "./PreprocessorExpressionValidator";
import { ShaderValidator } from "./ShaderValidator";
import { ShaderAnalysisInfo } from "./ShaderAnalysisInfo";
import { ShaderIOValidator } from "./ShaderIOValidator";
import { positionAt } from "./sourcePosition";

/**
 * Maps canonical shader include paths to source chunks.
 *
 * Keys are project-root paths for normal includes. Relative includes from an absolute `sourceFile`
 * use their resolved absolute URLs. An undefined value represents a known path whose source is unavailable.
 */
export type ShaderIncludeMap = Readonly<Record<string, string | undefined>>;

/**
 * Controls include resolution and source attribution for one analysis request.
 */
export interface AnalyzerOptions {
  /** `#include` lookup table using canonical project paths or resolved absolute URLs. */
  includeMap?: ShaderIncludeMap;
  /** Project path or absolute URL of the complete root Shader; required only for relative root includes. */
  sourceFile?: string;
}

/**
 * Contains every structured diagnostic produced for one ShaderLab document.
 */
export interface AnalysisResult {
  /** Structured diagnostics from shader-source structure parsing and per-pass GLSL analysis. */
  readonly diagnostics: readonly Diagnostic[];
}

/** Parsed pass retained by the internal combined analysis/codegen path. @internal */
export interface AnalyzedShaderPass {
  readonly parsed: ParsedShaderPass;
  readonly vertexEntry: string;
  readonly fragmentEntry: string;
}

/** Analyzer result that lets first-party tooling reuse the same Parser IR for codegen. @internal */
export interface ShaderAnalysisUnit extends AnalysisResult {
  readonly parsedPasses: readonly AnalyzedShaderPass[];
}

/**
 * Analyzes ShaderLab source and GLSL semantics without generating backend source.
 *
 * The analyzer consumes parser facts through the analyzer-support entry independently from runtime compilation, so its
 * diagnostics cannot alter or block GLES code generation.
 */
export class ShaderAnalyzer {
  private constructor() {}

  /**
   * Analyzes shader source.
   * @param source - ShaderLab source to analyze.
   * @param options - Analysis options.
   * @returns Structured diagnostics.
   */
  static analyze(source: string, options?: AnalyzerOptions): AnalysisResult {
    return Object.freeze({ diagnostics: ShaderAnalyzer._analyze(source, options).diagnostics });
  }

  /**
   * Analyzes a ShaderLab document and retains its immutable parsed passes for first-party codegen reuse.
   * @param source - ShaderLab source to analyze.
   * @param options - Include sources and optional root source path.
   * @returns Diagnostics and parsed passes produced by the same parser calls.
   * @internal
   */
  static _analyze(source: string, options?: AnalyzerOptions): ShaderAnalysisUnit {
    const includeMap = options?.includeMap ?? {};
    const sourceFile = normalizeShaderSourceFile(options?.sourceFile);
    const chunkOutputCache: ChunkOutputCache = new Map();
    const diagnostics: Diagnostic[] = [];
    const parsedPasses: AnalyzedShaderPass[] = [];

    try {
      diagnostics.push(...validatePreprocessorExpressions(source, sourceFile));
      const sourceResult = ShaderSourceParser.parseWithErrors(source);
      const shaderSource: IShaderSource = sourceResult.shaderSource;
      diagnostics.push(...sourceResult.errors.map((error) => gseErrorToDiagnostic(error)));
      for (const subShader of shaderSource.subShaders) {
        for (const pass of subShader.passes) {
          if (pass.isUsePass) continue;
          const statements = shaderSource.pendingContents.concat(subShader.pendingContents, pass.pendingContents);
          const skipSemanticValidation = diagnostics.some(
            (diagnostic) =>
              diagnostic.code === DiagnosticType.PreprocessorError &&
              statements.some(
                (statement) =>
                  diagnostic.range.start.offset >= statement.range.start.index &&
                  diagnostic.range.start.offset <= statement.range.end.index
              )
          );
          ShaderAnalyzer._analyzePass(
            pass,
            statements,
            source,
            diagnostics,
            parsedPasses,
            includeMap,
            chunkOutputCache,
            sourceFile,
            skipSemanticValidation
          );
        }
      }
    } catch (e) {
      diagnostics.push(gseErrorToDiagnostic(e instanceof Error ? e : new Error(String(e))));
    }

    if (sourceFile) {
      for (const diagnostic of diagnostics) diagnostic.sourceFile ??= sourceFile;
    }
    return Object.freeze({
      diagnostics: Object.freeze(diagnostics.slice()),
      parsedPasses: Object.freeze(parsedPasses.map((pass) => Object.freeze(pass)))
    });
  }

  private static _analyzePass(
    pass: IShaderPassSource,
    statements: readonly IStatement[],
    source: string,
    diagnostics: Diagnostic[],
    parsedPasses: AnalyzedShaderPass[],
    includeMap: ShaderIncludeMap,
    chunkOutputCache: ChunkOutputCache,
    sourceFile: string | undefined,
    skipSemanticValidation: boolean
  ): void {
    const { vertexEntry, fragmentEntry } = pass;
    const passDiagnostics: Diagnostic[] = [];
    let expandedSource: string | undefined;
    let preprocessSourceMap: readonly PreprocessSourceMapSegment[] = [];
    try {
      const parsed = parseShaderPass(pass.contents, includeMap, chunkOutputCache, sourceFile);
      const { ir, errors } = parsed;
      expandedSource = parsed.expandedSource;
      preprocessSourceMap = parsed.sourceMap;
      parsedPasses.push({ parsed, vertexEntry, fragmentEntry });
      for (const error of errors) {
        const diagnostic = gseErrorToDiagnostic(error);
        if (
          !skipSemanticValidation ||
          diagnostic.code === DiagnosticType.SyntaxError ||
          diagnostic.code === DiagnosticType.PreprocessorError
        ) {
          passDiagnostics.push(diagnostic);
        }
      }
      if (ir && !skipSemanticValidation) {
        const coreInfo = ShaderCoreInfo.create(ir, vertexEntry, fragmentEntry);
        const analysisInfo = new ShaderAnalysisInfo(ir, coreInfo);
        passDiagnostics.push(...ShaderValidator.validate(analysisInfo).map((error) => gseErrorToDiagnostic(error)));
        passDiagnostics.push(
          ...ShaderIOValidator.validate(
            analysisInfo,
            pass.vertexEntryLocation as ShaderRange | undefined,
            pass.fragmentEntryLocation as ShaderRange | undefined
          ).map((error) => gseErrorToDiagnostic(error))
        );
      }
    } catch (e) {
      passDiagnostics.push(gseErrorToDiagnostic(e instanceof Error ? e : new Error(String(e))));
    }

    const sourceMap = createPassSourceMap(statements);
    for (const diagnostic of passDiagnostics) {
      if (expandedSource !== undefined && diagnostic.relatedSource === expandedSource) {
        remapPreprocessedDiagnostic(diagnostic, preprocessSourceMap);
      }
      if (sourceMap.generatedSource === pass.contents && diagnostic.relatedSource === pass.contents) {
        remapDiagnostic(diagnostic, sourceMap.segments, source);
      }
      diagnostic.sourceFile ??= sourceFile;
      diagnostics.push(diagnostic);
    }
  }
}

function remapPreprocessedDiagnostic(diagnostic: Diagnostic, segments: readonly PreprocessSourceMapSegment[]): void {
  const startSegment = findPreprocessSegment(diagnostic.range.start.offset, segments, false);
  if (!startSegment) return;
  const endSegment = findPreprocessSegment(diagnostic.range.end.offset, segments, true);
  const startOffset = startSegment.sourceStart + diagnostic.range.start.offset - startSegment.generatedStart;
  let endOffset = startOffset;
  if (endSegment && endSegment.source === startSegment.source && endSegment.sourceFile === startSegment.sourceFile) {
    endOffset = endSegment.sourceStart + diagnostic.range.end.offset - endSegment.generatedStart;
  }
  diagnostic.range = {
    start: positionAt(startSegment.source, startOffset),
    end: positionAt(startSegment.source, endOffset)
  };
  diagnostic.relatedSource = startSegment.source;
  diagnostic.sourceFile = startSegment.sourceFile ?? diagnostic.sourceFile;
}

function findPreprocessSegment(
  offset: number,
  segments: readonly PreprocessSourceMapSegment[],
  isEnd: boolean
): PreprocessSourceMapSegment | undefined {
  for (const segment of segments) {
    if (
      offset >= segment.generatedStart &&
      (isEnd ? offset <= segment.generatedEnd && offset > segment.generatedStart : offset < segment.generatedEnd)
    ) {
      return segment;
    }
  }
  const last = segments[segments.length - 1];
  return last && offset === last.generatedEnd ? last : undefined;
}

interface SourceMapSegment {
  generatedStart: number;
  generatedEnd: number;
  sourceStart: number;
}

function createPassSourceMap(statements: readonly IStatement[]): {
  generatedSource: string;
  segments: SourceMapSegment[];
} {
  const segments: SourceMapSegment[] = [];
  let generatedSource = "";
  for (let index = 0; index < statements.length; index++) {
    if (index > 0) generatedSource += "\n";
    const statement = statements[index];
    const generatedStart = generatedSource.length;
    generatedSource += statement.content;
    segments.push({
      generatedStart,
      generatedEnd: generatedSource.length,
      sourceStart: statement.range.start.index
    });
  }
  return { generatedSource, segments };
}

function remapDiagnostic(diagnostic: Diagnostic, segments: readonly SourceMapSegment[], source: string): void {
  const start = remapOffset(diagnostic.range.start.offset, segments);
  if (start === undefined) return;
  const end = remapOffset(diagnostic.range.end.offset, segments) ?? start;
  diagnostic.range = { start: positionAt(source, start), end: positionAt(source, end) };
  diagnostic.relatedSource = source;
}

function remapOffset(offset: number, segments: readonly SourceMapSegment[]): number | undefined {
  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index];
    if (offset >= segment.generatedStart && offset <= segment.generatedEnd) {
      return segment.sourceStart + offset - segment.generatedStart;
    }
  }
}
