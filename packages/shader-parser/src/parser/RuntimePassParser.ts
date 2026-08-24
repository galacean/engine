import { branchAnalysis } from "../common/BranchAnalysis";
import { AnalyzerLexer } from "../lexer/AnalyzerLexer";
import { Lexer } from "../lexer/Lexer";
import type { ChunkOutputCache, IncludeMap } from "../Preprocessor";
import {
  normalizeShaderSourceFile,
  parseShaderPassWith,
  shaderSourceBaseURL,
  type ParsedShaderPass
} from "./ParsedShaderPass";
import { ShaderTargetParser } from "./ShaderTargetParser";
import type { ParserObjectPool } from "../ParserObjectPool";
import { createCompilerSemanticDiagnostics } from "./AnalyzerSemanticDiagnostics";

/**
 * Creates the lean parser used by runtime shader compilation.
 * @param objectPool - Compiler-owned allocator for synchronous parser requests.
 * @returns Reusable runtime parser without authoring diagnostics.
 * @internal
 */
export function createRuntimeShaderTargetParser(objectPool?: ParserObjectPool): ShaderTargetParser {
  return ShaderTargetParser.create(undefined, undefined, undefined, objectPool);
}

/**
 * Creates the offline compiler parser that shares proven macro facts with the analyzer.
 * @param objectPool - Compiler-owned allocator for synchronous parser requests.
 * @returns Reusable parser whose proven macro declaration conflicts block export.
 * @internal
 */
export function createValidatedShaderTargetParser(objectPool?: ParserObjectPool): ShaderTargetParser {
  return ShaderTargetParser.create(
    branchAnalysis,
    createCompilerSemanticDiagnostics(""),
    undefined,
    objectPool,
    true,
    false
  );
}

/**
 * Parses one shader pass using the lean runtime lexer.
 * @param source - GLSL source for one ShaderLab pass.
 * @param includeMap - Canonical include paths mapped to chunk sources.
 * @param cache - Request-owned expanded-include cache.
 * @param sourceFile - Canonical root source path used for relative includes and error attribution.
 * @param objectPool - Compiler-owned pool used only while synchronously consuming this pass.
 * @param runtimeParser - Compiler-owned parser whose source is replaced for each pass.
 * @param trackSourceMap - Whether include-source locations must be retained for diagnostics.
 * @returns Request-owned parser output suitable for GLES generation.
 * @internal
 */
export function parseRuntimeShaderPass(
  source: string,
  includeMap: IncludeMap,
  cache: ChunkOutputCache,
  sourceFile?: string,
  objectPool?: ParserObjectPool,
  runtimeParser?: ShaderTargetParser,
  trackSourceMap = objectPool === undefined
): ParsedShaderPass {
  const normalizedSourceFile = normalizeShaderSourceFile(sourceFile);
  return parseShaderPassWith(
    source,
    includeMap,
    cache,
    shaderSourceBaseURL(normalizedSourceFile),
    (expandedSource, macroDefineList, parserObjectPool) => new Lexer(expandedSource, macroDefineList, parserObjectPool),
    (expandedSource, parserObjectPool) => {
      const parser = runtimeParser ?? createRuntimeShaderTargetParser(parserObjectPool);
      parser.setSource(expandedSource);
      return parser;
    },
    normalizedSourceFile,
    objectPool,
    trackSourceMap
  );
}

/**
 * Parses one shader pass for offline export with proven macro-conflict validation.
 * @param source - Shader pass source before include expansion.
 * @param includeMap - Canonical include paths mapped to chunk sources.
 * @param cache - Compiler-owned expanded-include cache.
 * @param sourceFile - Canonical root source path used for includes and attribution.
 * @param objectPool - Compiler-owned synchronous parse allocator.
 * @param parser - Reusable validated parser.
 * @returns Parsed pass with source-mapped blocking errors.
 * @internal
 */
export function parseValidatedShaderPass(
  source: string,
  includeMap: IncludeMap,
  cache: ChunkOutputCache,
  sourceFile: string | undefined,
  objectPool: ParserObjectPool,
  parser: ShaderTargetParser
): ParsedShaderPass {
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
    true
  );
}
