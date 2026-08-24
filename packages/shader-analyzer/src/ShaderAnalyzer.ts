import {
  ChunkOutputCache,
  mapExpandedShaderRange,
  normalizeShaderSourceFile,
  parseShaderPass,
  ShaderCoreInfo,
  ShaderSourceParser,
  type ParsedShaderPass,
  type PreprocessSourceMapSegment
} from "@galacean/engine-shader-parser/internal/analyzer";
import type { ShaderRange } from "@galacean/engine-shader-parser/internal/analyzer";
import type { IShaderPassSource, IShaderSource, IStatement } from "@galacean/engine-design";
import { normalizeShaderIncludeKey } from "@galacean/engine-design";
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
}

/**
 * One analyzer-parsed pass retained for first-party backend generation.
 * @internal
 */
export interface AnalyzedShaderPass {
  /** Request-owned immutable parser result. */
  readonly parsed: ParsedShaderPass;
  /** Vertex entry function name declared by the ShaderLab pass. */
  readonly vertexEntry: string;
  /** Fragment entry function name declared by the ShaderLab pass. */
  readonly fragmentEntry: string;
}

/**
 * Analysis result that retains parser output for a same-request codegen consumer.
 * @internal
 */
export interface ShaderAnalysisUnit extends AnalysisResult {
  /** Parsed passes in ShaderLab source order. */
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
    return Object.freeze({ diagnostics: ShaderAnalyzer._analyzeSource(source, options) });
  }

  /**
   * Analyzes source while retaining the request-owned parsed passes for codegen reuse.
   * @param source - ShaderLab source to analyze.
   * @param options - Include sources and optional root source location.
   * @returns Diagnostics and the exact parsed passes used to produce them.
   * @internal
   */
  static _analyzeWithParsedPasses(source: string, options?: AnalyzerOptions): ShaderAnalysisUnit {
    const parsedPasses: AnalyzedShaderPass[] = [];
    const diagnostics = ShaderAnalyzer._analyzeSource(source, options, parsedPasses);
    return Object.freeze({
      diagnostics,
      parsedPasses: Object.freeze(parsedPasses.map((pass) => Object.freeze(pass)))
    });
  }

  private static _analyzeSource(
    source: string,
    options?: AnalyzerOptions,
    parsedPasses?: AnalyzedShaderPass[]
  ): readonly Diagnostic[] {
    const includeMap = normalizeIncludeMap(options?.includeMap);
    const sourceFile = normalizeShaderSourceFile(options?.sourceFile);
    const chunkOutputCache: ChunkOutputCache = new Map();
    const diagnostics: Diagnostic[] = [];

    try {
      const sourceResult = ShaderSourceParser.parseWithErrors(source);
      const shaderSource: IShaderSource = sourceResult.shaderSource;
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
            parsedPasses
          );
        }
      }
    } catch (e) {
      diagnostics.push(gseErrorToDiagnostic(e instanceof Error ? e : new Error(String(e))));
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
    parsedPasses?: AnalyzedShaderPass[]
  ): void {
    if (pass.contents.trim().length === 0) return;

    const { vertexEntry, fragmentEntry } = pass;
    const passDiagnostics: Diagnostic[] = [];
    let shouldSkipSemanticValidation = false;
    let expandedSource: string | undefined;
    let preprocessSourceMap: readonly PreprocessSourceMapSegment[] = [];
    try {
      const parsed = parseShaderPass(pass.contents, includeMap, chunkOutputCache, sourceFile);
      const { ir, errors } = parsed;
      parsedPasses?.push({ parsed, vertexEntry, fragmentEntry });
      expandedSource = parsed.expandedSource;
      preprocessSourceMap = parsed.sourceMap;
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
      if (ir && !shouldSkipSemanticValidation) {
        const coreInfo = ShaderCoreInfo.create(ir, vertexEntry, fragmentEntry);
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
    } catch (e) {
      passDiagnostics.push(gseErrorToDiagnostic(e instanceof Error ? e : new Error(String(e))));
    }

    const sourceMap = createPassSourceMap(statements);
    for (const diagnostic of passDiagnostics) {
      if (expandedSource !== undefined && diagnostic.relatedSource === expandedSource) {
        remapExpandedDiagnostic(diagnostic, preprocessSourceMap);
      }
      if (sourceMap.generatedSource === pass.contents && diagnostic.relatedSource === pass.contents) {
        remapDiagnostic(diagnostic, sourceMap.segments, source);
      }
      diagnostic.sourceFile ??= sourceFile;
      diagnostics.push(diagnostic);
    }
  }
}

function normalizeIncludeMap(includeMap?: ShaderIncludeMap): ShaderIncludeMap {
  if (!includeMap) return Object.create(null);
  const normalized: Record<string, string | undefined> = Object.create(null);
  for (const inputKey of Object.keys(includeMap)) {
    const key = normalizeShaderIncludeKey(inputKey);
    if (Object.prototype.hasOwnProperty.call(normalized, key)) {
      throw new Error(`Shader include key collision after normalization: "${inputKey}" resolves to "${key}".`);
    }
    Object.defineProperty(normalized, key, {
      value: includeMap[inputKey],
      enumerable: true,
      configurable: false,
      writable: false
    });
  }
  return new Proxy(normalized, {
    get(target, property): string | undefined {
      if (typeof property !== "string") return undefined;
      if (Object.prototype.hasOwnProperty.call(target, property)) return target[property];
      const source = includeMap[property];
      const value = typeof source === "string" ? source : undefined;
      Object.defineProperty(target, property, {
        value,
        enumerable: true,
        configurable: false,
        writable: false
      });
      return value;
    }
  });
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
