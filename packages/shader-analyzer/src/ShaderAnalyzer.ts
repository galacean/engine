import {
  ChunkOutputCache,
  parseShaderPass,
  ShaderCoreInfo,
  ShaderCompilerUtils,
  ShaderSourceParser,
  type PreprocessSourceMapSegment
} from "@galacean/engine-shader-parser/internal/verbose";
import type { ShaderRange } from "@galacean/engine-shader-parser/internal/verbose";
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
 * Keys use the same root-relative convention as compiler include resolution; an undefined value
 * represents a known path whose source is unavailable.
 */
export type ShaderIncludeMap = Readonly<Record<string, string | undefined>>;

/**
 * Controls include resolution and source attribution for one analysis request.
 */
export interface AnalyzerOptions {
  /** `#include` lookup table; keys are include paths, values are chunk sources. */
  includeMap?: ShaderIncludeMap;
  /** Base URL used to resolve relative `#include` paths. */
  basePathForIncludeKey?: string;
  /** Logical file name attached to diagnostics. */
  file?: string;
}

/**
 * Contains every structured diagnostic produced for one ShaderLab document.
 */
export interface AnalysisResult {
  /** Structured diagnostics from shader-source structure parsing and per-pass GLSL analysis. */
  diagnostics: Diagnostic[];
}

/**
 * Analyzes ShaderLab source and GLSL semantics without generating backend source.
 *
 * The analyzer consumes verbose parser facts independently from runtime compilation, so its
 * diagnostics cannot alter or block GLES code generation.
 */
export class ShaderAnalyzer {
  /**
   * Analyzes shader source.
   * @param source - ShaderLab source to analyze.
   * @param options - Analysis options.
   * @returns Structured diagnostics.
   */
  analyze(source: string, options?: AnalyzerOptions): AnalysisResult {
    const includeMap = options?.includeMap ?? {};
    const chunkOutputCache: ChunkOutputCache = new Map();
    const diagnostics: Diagnostic[] = [];

    try {
      diagnostics.push(...validatePreprocessorExpressions(source, options?.file));
      ShaderCompilerUtils.clearAllShaderCompilerObjectPool();
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
          this._analyzePass(
            pass,
            statements,
            source,
            diagnostics,
            includeMap,
            chunkOutputCache,
            options?.basePathForIncludeKey,
            options?.file,
            skipSemanticValidation
          );
        }
      }
    } catch (e) {
      diagnostics.push(gseErrorToDiagnostic(e instanceof Error ? e : new Error(String(e))));
    }

    if (options?.file) {
      for (const diagnostic of diagnostics) diagnostic.file ??= options.file;
    }
    return { diagnostics };
  }

  private _analyzePass(
    pass: IShaderPassSource,
    statements: readonly IStatement[],
    source: string,
    diagnostics: Diagnostic[],
    includeMap: ShaderIncludeMap,
    chunkOutputCache: ChunkOutputCache,
    basePathForIncludeKey: string | undefined,
    file: string | undefined,
    skipSemanticValidation: boolean
  ): void {
    const { vertexEntry, fragmentEntry } = pass;
    const passDiagnostics: Diagnostic[] = [];
    let passText: string | undefined;
    let preprocessSourceMap: PreprocessSourceMapSegment[] = [];
    try {
      const parsed = parseShaderPass(pass.contents, includeMap, chunkOutputCache, basePathForIncludeKey);
      const { ir, errors } = parsed;
      passText = parsed.passText;
      preprocessSourceMap = parsed.sourceMap;
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
      if (passText !== undefined && diagnostic.relatedSource === passText) {
        remapPreprocessedDiagnostic(diagnostic, preprocessSourceMap);
      }
      if (sourceMap.generatedSource === pass.contents && diagnostic.relatedSource === pass.contents) {
        remapDiagnostic(diagnostic, sourceMap.segments, source);
      }
      diagnostic.file ??= file;
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
  if (endSegment && endSegment.source === startSegment.source && endSegment.file === startSegment.file) {
    endOffset = endSegment.sourceStart + diagnostic.range.end.offset - endSegment.generatedStart;
  }
  diagnostic.range = {
    start: positionAt(startSegment.source, startOffset),
    end: positionAt(startSegment.source, endOffset)
  };
  diagnostic.relatedSource = startSegment.source;
  diagnostic.file = startSegment.file ?? diagnostic.file;
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
