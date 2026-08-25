import {
  branchAnalysis,
  ChunkOutputCache,
  createParsedShaderPass,
  mapExpandedShaderRange,
  normalizeShaderIncludeMap,
  normalizeShaderSourceFile,
  parseShaderPass,
  ShaderCoreInfo,
  ShaderSourceParser,
  type PreprocessSourceMapSegment
} from "@galacean/engine-shader-parser/internal/analyzer";
import type { ShaderRange } from "@galacean/engine-shader-parser/internal/analyzer";
import type { ParsedShaderPass } from "@galacean/engine-shader-parser/shared";
import type { IShaderPassSource, IShaderSource, IStatement } from "@galacean/engine-design";
import type { Diagnostic } from "./Diagnostic";
import { DiagnosticType } from "./Diagnostic";
import { gseErrorToDiagnostic } from "./convert";
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
  /** Optional project path or absolute URL used as the relative-include base and for diagnostic attribution. */
  sourceFile?: string;
}

/**
 * Contains every structured diagnostic produced for one ShaderLab document.
 */
export interface AnalysisResult {
  /** Structured diagnostics from shader-source structure parsing and per-pass GLSL analysis. */
  readonly diagnostics: readonly Diagnostic[];
  /**
   * Opaque parsed non-UsePass entries in document order, reusable by `ShaderCompiler.generate()`.
   * Empty when the ShaderLab document has structural parse errors.
   */
  readonly passes: readonly ParsedShaderPass[];
}

/**
 * Analyzes ShaderLab source and GLSL semantics without generating backend source.
 *
 * Parser-owned definite failures remain attached to reusable pass handles so backend admission reaches the same
 * conclusion. Analyzer-only validation stays independent from GLES code generation.
 */
export class ShaderAnalyzer {
  private constructor() {}

  /**
   * Analyzes shader source.
   * @param source - ShaderLab source to analyze.
   * @param options - Analysis options.
   * @returns Structured diagnostics and reusable parsed-pass handles.
   * @throws Error when include keys collide after normalization or `sourceFile` is not a valid absolute URL.
   */
  static analyze(source: string, options?: AnalyzerOptions): AnalysisResult {
    const passes: ParsedShaderPass[] = [];
    const diagnostics = ShaderAnalyzer._analyzeSource(source, passes, options);
    return Object.freeze({
      diagnostics,
      passes: Object.freeze(passes)
    });
  }

  private static _analyzeSource(
    source: string,
    parsedPasses: ParsedShaderPass[],
    options?: AnalyzerOptions
  ): readonly Diagnostic[] {
    const includeMap = normalizeShaderIncludeMap(options?.includeMap);
    const sourceFile = normalizeShaderSourceFile(options?.sourceFile);
    const chunkOutputCache: ChunkOutputCache = new Map();
    const diagnostics: Diagnostic[] = [];

    const sourceResult = ShaderSourceParser.parseWithErrors(source);
    const shaderSource: IShaderSource = sourceResult.shaderSource;
    const retainParsedPasses = sourceResult.errors.length === 0;
    diagnostics.push(...sourceResult.errors.map((error) => gseErrorToDiagnostic(error)));
    for (const subShader of shaderSource.subShaders) {
      for (const pass of subShader.passes) {
        if (pass.isUsePass) continue;
        const statements = shaderSource.pendingContents.concat(subShader.pendingContents, pass.pendingContents);
        ShaderAnalyzer._analyzePass(
          pass,
          statements,
          source,
          diagnostics,
          includeMap,
          chunkOutputCache,
          sourceFile,
          retainParsedPasses ? parsedPasses : undefined
        );
      }
    }

    if (sourceFile) {
      for (const diagnostic of diagnostics) diagnostic.sourceFile ??= sourceFile;
    }
    return Object.freeze(diagnostics);
  }

  private static _analyzePass(
    pass: IShaderPassSource,
    statements: readonly IStatement[],
    source: string,
    diagnostics: Diagnostic[],
    includeMap: ShaderIncludeMap,
    chunkOutputCache: ChunkOutputCache,
    sourceFile: string | undefined,
    parsedPasses?: ParsedShaderPass[]
  ): void {
    if (pass.contents.trim().length === 0 && (!pass.vertexEntry || !pass.fragmentEntry)) return;

    const { vertexEntry, fragmentEntry } = pass;
    const passDiagnostics: Diagnostic[] = [];
    let shouldSkipSemanticValidation = false;
    const parsed = parseShaderPass(pass.contents, includeMap, chunkOutputCache, sourceFile, pass.contentScopeStarts);
    const { ir, errors } = parsed;
    const coreInfo = ir
      ? ShaderCoreInfo.create(ir, vertexEntry, fragmentEntry, branchAnalysis.getDeclarationCoexistence)
      : undefined;
    parsedPasses?.push(createParsedShaderPass(parsed, vertexEntry, fragmentEntry, coreInfo));
    for (const error of errors) {
      const diagnostic = gseErrorToDiagnostic(error);
      if (diagnostic.code === DiagnosticType.PreprocessorError) shouldSkipSemanticValidation = true;
      if (
        !shouldSkipSemanticValidation ||
        diagnostic.code === DiagnosticType.SyntaxError ||
        diagnostic.code === DiagnosticType.PreprocessorError
      ) {
        passDiagnostics.push(diagnostic);
      }
    }
    if (ir && coreInfo && !shouldSkipSemanticValidation) {
      const analysisInfo = new ShaderAnalysisInfo(ir, coreInfo);
      passDiagnostics.push(...ShaderValidator.validate(analysisInfo).map((error) => gseErrorToDiagnostic(error)));
      passDiagnostics.push(
        ...ShaderIOValidator.validate(
          analysisInfo,
          pass.vertexEntryLocation as ShaderRange | undefined,
          pass.fragmentEntryLocation as ShaderRange | undefined,
          source
        ).map((error) => gseErrorToDiagnostic(error))
      );
    }

    const sourceMap = createPassSourceMap(statements);
    for (const diagnostic of passDiagnostics) {
      if (diagnostic.relatedSource === parsed.expandedSource) {
        remapExpandedDiagnostic(diagnostic, parsed.sourceMap);
      }
      if (sourceMap.generatedSource === pass.contents && diagnostic.relatedSource === pass.contents) {
        remapDiagnostic(diagnostic, sourceMap.segments, source);
      }
      diagnostic.sourceFile ??= sourceFile;
      diagnostics.push(diagnostic);
    }
  }
}

function remapExpandedDiagnostic(diagnostic: Diagnostic, segments: readonly PreprocessSourceMapSegment[]): void {
  const mapped = mapExpandedShaderRange(diagnostic.range.start.offset, diagnostic.range.end.offset, segments);
  if (!mapped) return;
  diagnostic.range = {
    start: {
      offset: mapped.start.index,
      line: mapped.start.line + 1,
      column: mapped.start.column + 1
    },
    end: {
      offset: mapped.end.index,
      line: mapped.end.line + 1,
      column: mapped.end.column + 1
    }
  };
  diagnostic.relatedSource = mapped.source;
  diagnostic.sourceFile = mapped.sourceFile ?? diagnostic.sourceFile;
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
