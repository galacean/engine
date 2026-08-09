import type { BaseToken } from "../common/BaseToken";
import { ShaderPosition } from "../common/ShaderPosition";
import { ShaderRange } from "../common/ShaderRange";
import { GSError, GSErrorName } from "../GSError";
import type { MacroDefineList } from "../Preprocessor";
import { Preprocessor, type ChunkOutputCache, type IncludeMap } from "../Preprocessor";
import { ShaderClueIR, type ShaderSourceMapSegment } from "../ir";
import type { ShaderTargetParser } from "./ShaderTargetParser";

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
    return normalized.slice(SHADER_ROOT_URL.length) || undefined;
  }
  if (!ABSOLUTE_URL_PATTERN.test(normalized)) {
    return normalized.replace(/^\/+/, "") || undefined;
  }
  try {
    return new URL(normalized).href;
  } catch {
    return normalized.replace(/^\/+/, "") || undefined;
  }
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
  /** Preprocessor and syntax errors that prevent backend generation. */
  readonly blockingErrors: readonly Error[];
}

/**
 * Formats a parsed-pass error against its original Shader or ShaderChunk source.
 * @param error - Error emitted from preprocessing or parsing.
 * @param parsed - Parsed pass containing the expanded-source mapping.
 * @returns Human-readable error text prefixed with the canonical source file when available.
 * @internal
 */
export function formatParsedShaderError(error: Error, parsed: ParsedShaderPass): string {
  let mappedError = error;
  if (error instanceof GSError && error.source === parsed.expandedSource) {
    const location = error.location;
    const sourceRange = "start" in location ? location : { start: location, end: location };
    const startSegment = findSourceMapSegment(sourceRange.start.index, parsed.sourceMap, false);
    if (startSegment) {
      const endSegment = findSourceMapSegment(sourceRange.end.index, parsed.sourceMap, true);
      const startOffset = startSegment.sourceStart + sourceRange.start.index - startSegment.generatedStart;
      const endOffset =
        endSegment?.source === startSegment.source && endSegment.sourceFile === startSegment.sourceFile
          ? endSegment.sourceStart + sourceRange.end.index - endSegment.generatedStart
          : startOffset;
      const start = shaderPositionAt(startSegment.source, startOffset);
      const end = shaderPositionAt(startSegment.source, endOffset);
      const mappedLocation = new ShaderRange();
      mappedLocation.set(start, end);
      mappedError = new GSError(
        error.name as GSErrorName,
        error.message,
        mappedLocation,
        startSegment.source,
        startSegment.sourceFile ?? error.file,
        error.code
      );
    }
  }
  const sourceFile = mappedError instanceof GSError ? mappedError.file : undefined;
  return sourceFile ? `${sourceFile}: ${mappedError.toString()}` : mappedError.toString();
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
 * @returns Request-owned parsed-pass data whose public containers are read-only.
 * @internal
 */
export function parseShaderPassWith(
  source: string,
  includeMap: IncludeMap,
  cache: ChunkOutputCache,
  basePathForIncludeKey: string,
  createLexer: (expandedSource: string, macroDefineList: MacroDefineList) => ShaderPassLexer,
  createParser: (expandedSource: string) => ShaderTargetParser,
  sourceFile?: string
): ParsedShaderPass {
  const macroDefineList: MacroDefineList = {};
  const {
    content: expandedSource,
    errors: preprocessErrors,
    sourceMap
  } = Preprocessor.parseWithErrors(source, basePathForIncludeKey, includeMap, cache, sourceFile);
  const tokens = createLexer(expandedSource, macroDefineList).tokenize();
  const parser = createParser(expandedSource);
  const program = parser.parse(tokens, macroDefineList);
  for (const segment of sourceMap) Object.freeze(segment);
  const frozenSourceMap = Object.freeze(sourceMap);
  const errors =
    preprocessErrors.length || parser.errors.length
      ? Object.freeze([...preprocessErrors, ...parser.errors])
      : EMPTY_ERRORS;
  let blockingErrors = EMPTY_ERRORS;
  if (preprocessErrors.length || parser.blockingErrors.length) {
    blockingErrors =
      parser.errors.length === parser.blockingErrors.length
        ? errors
        : Object.freeze([...preprocessErrors, ...parser.blockingErrors]);
  }
  return Object.freeze({
    ir: program ? Object.freeze(new ShaderClueIR(program, expandedSource, frozenSourceMap)) : null,
    expandedSource,
    sourceMap: frozenSourceMap,
    errors,
    blockingErrors
  });
}
