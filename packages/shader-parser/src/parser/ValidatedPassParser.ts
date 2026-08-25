import { branchAnalysis } from "../common/BranchAnalysis";
import { AnalyzerLexer } from "../lexer/AnalyzerLexer";
import type { ChunkOutputCache, IncludeMap } from "../Preprocessor";
import type { ParserObjectPool } from "../ParserObjectPool";
import { createCompilerSemanticDiagnostics } from "./AnalyzerSemanticDiagnostics";
import { parseShaderPassWith, type ParsedShaderPassData } from "./ParsedShaderPass";
import { normalizeShaderSourceFile, shaderSourceBaseURL } from "./ShaderIncludePath";
import { ShaderTargetParser } from "./ShaderTargetParser";

/**
 * Creates the offline parser that shares proven macro facts with authoring analysis.
 * @param objectPool - Precompiler-owned allocator for synchronous parser requests.
 * @returns Reusable parser whose proven semantic conflicts block artifact generation.
 * @internal
 */
export function createValidatedShaderTargetParser(objectPool?: ParserObjectPool): ShaderTargetParser {
  return ShaderTargetParser.create(
    branchAnalysis,
    createCompilerSemanticDiagnostics(""),
    undefined,
    objectPool,
    true,
    true
  );
}

/**
 * Parses one shader pass for offline export with proven macro-conflict validation.
 * @param source - Shader pass source before include expansion.
 * @param includeMap - Canonical include paths mapped to chunk sources.
 * @param cache - Precompiler-owned expanded-include cache.
 * @param sourceFile - Canonical root source path used for includes and attribution.
 * @param objectPool - Precompiler-owned synchronous parse allocator.
 * @param parser - Reusable validated parser.
 * @param sourceScopeStarts - Start offsets of inherited ShaderLab content layers.
 * @returns Parsed pass with source-mapped blocking errors.
 * @internal
 */
export function parseValidatedShaderPass(
  source: string,
  includeMap: IncludeMap,
  cache: ChunkOutputCache,
  sourceFile: string | undefined,
  objectPool: ParserObjectPool,
  parser: ShaderTargetParser,
  sourceScopeStarts?: readonly number[]
): ParsedShaderPassData {
  const normalizedSourceFile = normalizeShaderSourceFile(sourceFile);
  return parseShaderPassWith(
    source,
    includeMap,
    cache,
    shaderSourceBaseURL(normalizedSourceFile),
    (expandedSource, macroDefineList, parserObjectPool) =>
      new AnalyzerLexer(expandedSource, macroDefineList, parserObjectPool),
    (expandedSource) => {
      parser.setSource(expandedSource);
      return parser;
    },
    normalizedSourceFile,
    objectPool,
    true,
    sourceScopeStarts
  );
}
