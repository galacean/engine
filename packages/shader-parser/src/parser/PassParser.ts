import { ShaderTargetParser } from "./ShaderTargetParser";
import type { ChunkOutputCache, IncludeMap } from "../Preprocessor";
import { AnalyzerLexer } from "../lexer/AnalyzerLexer";
import { branchAnalysis } from "../common/BranchAnalysis";
import { createAnalyzerSemanticDiagnostics } from "./AnalyzerSemanticDiagnostics";
import type { ShaderSourceMapSegment } from "../ir";
import {
  normalizeShaderSourceFile,
  parseShaderPassWith,
  shaderSourceBaseURL,
  type ParsedShaderPass
} from "./ParsedShaderPass";

/** Maps a range in expanded pass text back to its source chunk. */
export type PreprocessSourceMapSegment = ShaderSourceMapSegment;

/**
 * Parses one shader pass into neutral IR and parse-stage diagnostics.
 * @param source - GLSL source for the shader pass.
 * @param includeMap - Include-path lookup table.
 * @param cache - Cache for expanded include chunks.
 * @param sourceFile - Canonical path of the root Shader source.
 * @returns Neutral IR, diagnostics, and preprocessed pass text.
 */
export function parseShaderPass(
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
    (expandedSource, macroDefineList) => new AnalyzerLexer(expandedSource, macroDefineList),
    (expandedSource) =>
      ShaderTargetParser.create(branchAnalysis, createAnalyzerSemanticDiagnostics(expandedSource), expandedSource),
    normalizedSourceFile
  );
}
