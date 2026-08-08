import type { BaseToken } from "../common/BaseToken";
import type { MacroDefineList } from "../Preprocessor";
import { Preprocessor, type ChunkOutputCache, type IncludeMap } from "../Preprocessor";
import { ShaderClueIR, type ShaderSourceMapSegment } from "../ir";
import type { ShaderTargetParser } from "./ShaderTargetParser";

const SHADER_ROOT_URL = "shaders://root/";

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
  const normalized = normalizeShaderSourceFile(sourceFile);
  if (!normalized) return "";
  try {
    return new URL(normalized).href;
  } catch {
    return new URL(normalized, SHADER_ROOT_URL).href;
  }
}

/** Immutable parser output shared by analysis and backend generation. @internal */
export interface ParsedShaderPass {
  /** Neutral typed IR, or `null` when parsing could not produce a program. */
  readonly ir: ShaderClueIR | null;
  /** Source after recursive `#include` expansion. */
  readonly expandedSource: string;
  /** Mapping from expanded offsets to original Shader and ShaderChunk sources. */
  readonly sourceMap: readonly ShaderSourceMapSegment[];
  /** Preprocessor, syntax, and parser-semantic errors. */
  readonly errors: readonly Error[];
}

/** @internal */
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
 * @returns Immutable parsed-pass data.
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
  const frozenSourceMap = Object.freeze(sourceMap.map((segment) => Object.freeze({ ...segment })));
  return Object.freeze({
    ir: program ? Object.freeze(new ShaderClueIR(program, expandedSource, frozenSourceMap)) : null,
    expandedSource,
    sourceMap: frozenSourceMap,
    errors: Object.freeze([...preprocessErrors, ...parser.errors])
  });
}
