import { Lexer } from "../lexer/Lexer";
import type { ChunkOutputCache, IncludeMap } from "../Preprocessor";
import {
  normalizeShaderSourceFile,
  parseShaderPassWith,
  shaderSourceBaseURL,
  type ParsedShaderPass
} from "./ParsedShaderPass";
import { ShaderTargetParser } from "./ShaderTargetParser";

/**
 * Parses one shader pass using the runtime lexer and semantic policy.
 * @param source - GLSL source for one ShaderLab pass.
 * @param includeMap - Canonical include paths mapped to chunk sources.
 * @param cache - Request-owned expanded-include cache.
 * @param sourceFile - Canonical root source path used for relative includes and error attribution.
 * @returns Request-owned parser output suitable for GLES generation.
 * @internal
 */
export function parseRuntimeShaderPass(
  source: string,
  includeMap: IncludeMap,
  cache: ChunkOutputCache,
  sourceFile?: string
): ParsedShaderPass {
  const normalizedSourceFile = normalizeShaderSourceFile(sourceFile);
  return parseShaderPassWith(
    source,
    includeMap,
    cache,
    shaderSourceBaseURL(normalizedSourceFile),
    (expandedSource, macroDefineList) => new Lexer(expandedSource, macroDefineList),
    (expandedSource) => ShaderTargetParser.create(undefined, undefined, expandedSource),
    normalizedSourceFile
  );
}
