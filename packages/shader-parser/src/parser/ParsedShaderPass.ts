import type { BaseToken } from "../common/BaseToken";
import { normalizeShaderIncludeKey, type PreprocessorExpressionParseResult } from "@galacean/engine-design";
import { ShaderPosition } from "../common/ShaderPosition";
import { ShaderRange } from "../common/ShaderRange";
import { GSError, GSErrorName } from "../GSError";
import type { MacroDefineList } from "../Preprocessor";
import { Preprocessor, type ChunkOutputCache, type IncludeMap } from "../Preprocessor";
import { ShaderClueIR, type ShaderSourceMapSegment } from "../ir";
import type { ShaderTargetParser } from "./ShaderTargetParser";
import type { ParserObjectPool } from "../ParserObjectPool";

const SHADER_ROOT_URL = "shaders://root/";
const ABSOLUTE_URL_PATTERN = /^[A-Za-z][A-Za-z\d+.-]*:/;
const EMPTY_ERRORS: readonly Error[] = Object.freeze([]);

/**
 * Converts a caller-provided source location into the canonical form stored in source maps.
 * @param sourceFile - Project-relative path, project-root path, or absolute URL.
 * @returns Canonical source location, or `undefined` when no location was supplied.
 */
export function normalizeShaderSourceFile(sourceFile?: string): string | undefined {
  if (!sourceFile) return undefined;
  const normalized = sourceFile.trim().replace(/\\/g, "/");
  if (!normalized) return undefined;
  if (normalized.startsWith(SHADER_ROOT_URL)) {
    return normalized === SHADER_ROOT_URL ? undefined : normalizeShaderIncludeKey(normalized);
  }
  if (!ABSOLUTE_URL_PATTERN.test(normalized)) {
    return normalizeShaderIncludeKey(normalized);
  }
  return new URL(normalized).href;
}

/**
 * Creates the internal URL used to resolve relative includes from a canonical source location.
 * @param sourceFile - Project path or absolute URL returned by `normalizeShaderSourceFile`.
 * @returns Base URL for include resolution, or an empty string when no source location exists.
 */
export function shaderSourceBaseURL(sourceFile?: string): string {
  if (!sourceFile) return "";
  if (!ABSOLUTE_URL_PATTERN.test(sourceFile)) {
    return new URL(sourceFile, SHADER_ROOT_URL).href;
  }
  return new URL(sourceFile).href;
}

/**
 * Request-owned parser output shared read-only by analysis and backend generation.
 * @internal
 */
export interface ParsedShaderPass {
  /** Neutral typed IR, or `null` when parsing could not produce a program. */
  readonly ir: ShaderClueIR | null;
  /** Source after recursive `#include` expansion. */
  readonly expandedSource: string;
  /** Mapping from expanded offsets to original Shader and ShaderChunk sources. */
  readonly sourceMap: readonly ShaderSourceMapSegment[];
  /** Preprocessor, syntax, and parser-semantic errors. */
  readonly errors: readonly Error[];
  /** Complete preprocessor expression trees keyed by normalized directive text. */
  readonly preprocessorExpressions: ReadonlyMap<string, PreprocessorExpressionParseResult>;
  /** Preprocessor and syntax errors that prevent backend generation. */
  readonly blockingErrors: readonly Error[];
}

/**
 * Original source and range resolved from an expanded shader-pass range.
 * @internal
 */
export interface MappedShaderSourceRange {
  readonly source: string;
  readonly sourceFile?: string;
  readonly start: ShaderPosition;
  readonly end: ShaderPosition;
}

/**
 * Maps one expanded pass range to the Shader or ShaderChunk that produced it.
 * @param startOffset - Zero-based start offset in expanded source.
 * @param endOffset - Zero-based exclusive end offset in expanded source.
 * @param segments - Parser-owned include source map.
 * @returns Original source and local range, or `undefined` outside mapped text.
 * @internal
 */
export function mapExpandedShaderRange(
  startOffset: number,
  endOffset: number,
  segments: readonly ShaderSourceMapSegment[]
): MappedShaderSourceRange | undefined {
  const startSegment = findSourceMapSegment(startOffset, segments, false);
  if (!startSegment) return undefined;
  const endSegment = findSourceMapSegment(endOffset, segments, true);
  const mappedStartOffset = startSegment.sourceStart + startOffset - startSegment.generatedStart;
  const mappedEndOffset =
    endSegment?.source === startSegment.source && endSegment.sourceFile === startSegment.sourceFile
      ? endSegment.sourceStart + endOffset - endSegment.generatedStart
      : mappedStartOffset;
  return {
    source: startSegment.source,
    sourceFile: startSegment.sourceFile,
    start: shaderPositionAt(startSegment.source, mappedStartOffset),
    end: shaderPositionAt(startSegment.source, mappedEndOffset)
  };
}

function mapExpandedShaderError(
  error: Error,
  expandedSource: string,
  segments: readonly ShaderSourceMapSegment[]
): Error {
  if (!(error instanceof GSError) || error.source !== expandedSource) return error;
  const location = error.location;
  const range = "start" in location ? location : { start: location, end: location };
  const mapped = mapExpandedShaderRange(range.start.index, range.end.index, segments);
  if (!mapped) return error;
  const mappedLocation = new ShaderRange();
  mappedLocation.set(mapped.start, mapped.end);
  return new GSError(
    error.name as GSErrorName,
    error.message,
    mappedLocation,
    mapped.source,
    mapped.sourceFile ?? error.file,
    error.code
  );
}

function findSourceMapSegment(
  offset: number,
  segments: readonly ShaderSourceMapSegment[],
  isEnd: boolean
): ShaderSourceMapSegment | undefined {
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

function shaderPositionAt(source: string, offset: number): ShaderPosition {
  let line = 0;
  let column = 0;
  for (let index = 0; index < offset; index++) {
    if (source.charCodeAt(index) === 10) {
      line++;
      column = 0;
    } else {
      column++;
    }
  }
  const position = new ShaderPosition();
  position.set(offset, line, column);
  return position;
}

/**
 * Minimal token source consumed by the shared pass parser.
 * @internal
 */
export interface ShaderPassLexer {
  readonly expressionErrors: readonly GSError[];
  readonly preprocessorExpressions: ReadonlyMap<string, PreprocessorExpressionParseResult>;
  tokenize(): Generator<BaseToken, BaseToken>;
}

/**
 * Runs the shared preprocessing and parser pipeline with a caller-selected lexer/parser policy.
 * @param source - GLSL source for one ShaderLab pass.
 * @param includeMap - Canonical include paths mapped to chunk sources.
 * @param cache - Request-owned cache of expanded chunks.
 * @param basePathForIncludeKey - Internal base URL for resolving relative includes.
 * @param createLexer - Creates the runtime or analyzer lexer for the expanded source.
 * @param createParser - Creates a request-owned parser backed by shared immutable grammar tables.
 * @param sourceFile - Optional canonical root location for relative includes and attribution.
 * @param objectPool - Optional pool for a synchronous consumer that does not retain parsed passes.
 * @param trackSourceMap - Whether to retain include-source mapping for this parse.
 * @returns Request-owned parsed-pass data whose public containers are read-only.
 * @internal
 */
export function parseShaderPassWith(
  source: string,
  includeMap: IncludeMap,
  cache: ChunkOutputCache,
  basePathForIncludeKey: string,
  createLexer: (
    expandedSource: string,
    macroDefineList: MacroDefineList,
    objectPool?: ParserObjectPool
  ) => ShaderPassLexer,
  createParser: (expandedSource: string, objectPool?: ParserObjectPool) => ShaderTargetParser,
  sourceFile?: string,
  objectPool?: ParserObjectPool,
  trackSourceMap = true
): ParsedShaderPass {
  objectPool?.reset();
  const macroDefineList: MacroDefineList = {};
  const {
    content: expandedSource,
    errors: preprocessErrors,
    sourceMap
  } = Preprocessor.parseWithErrors(source, basePathForIncludeKey, includeMap, cache, sourceFile, trackSourceMap);
  const lexer = createLexer(expandedSource, macroDefineList, objectPool);
  const tokens = lexer.tokenize();
  const parser = createParser(expandedSource, objectPool);
  const program = parser.parse(tokens, macroDefineList);
  for (const segment of sourceMap) Object.freeze(segment);
  const frozenSourceMap = Object.freeze(sourceMap);
  const mappedParserErrors = parser.errors.map((error) =>
    mapExpandedShaderError(error, expandedSource, frozenSourceMap)
  );
  const mappedExpressionErrors = lexer.expressionErrors.map((error) =>
    mapExpandedShaderError(error, expandedSource, frozenSourceMap)
  );
  const errors =
    preprocessErrors.length || mappedExpressionErrors.length || mappedParserErrors.length
      ? Object.freeze([...preprocessErrors, ...mappedExpressionErrors, ...mappedParserErrors])
      : EMPTY_ERRORS;
  const parserBlockingErrors = parser.semanticErrorsBlockCodegen ? parser.errors : parser.blockingErrors;
  let blockingErrors = EMPTY_ERRORS;
  if (preprocessErrors.length || mappedExpressionErrors.length || parserBlockingErrors.length) {
    if (parser.errors.length === parserBlockingErrors.length) {
      blockingErrors = errors;
    } else {
      const mappedParserBlockingErrors = parserBlockingErrors.map((error) =>
        mapExpandedShaderError(error, expandedSource, frozenSourceMap)
      );
      blockingErrors = Object.freeze([...preprocessErrors, ...mappedExpressionErrors, ...mappedParserBlockingErrors]);
    }
  }
  return Object.freeze({
    ir: program ? Object.freeze(new ShaderClueIR(program, expandedSource, frozenSourceMap)) : null,
    expandedSource,
    sourceMap: frozenSourceMap,
    preprocessorExpressions: lexer.preprocessorExpressions,
    errors,
    blockingErrors
  });
}
