import { ShaderTargetParser } from "./ShaderTargetParser";
import type { ChunkOutputCache, IncludeMap } from "../Preprocessor";
import { AnalyzerLexer } from "../lexer/AnalyzerLexer";
import { branchAnalysis } from "../common/BranchAnalysis";
import { createAnalyzerSemanticDiagnostics } from "./AnalyzerSemanticDiagnostics";
import type { ShaderSourceMapSegment } from "../ir";
import { parseShaderPassWith, type ParsedShaderPassData } from "./ParsedShaderPass";
import { normalizeShaderSourceFile, shaderSourceBaseURL } from "./ShaderIncludePath";

/** Maps a range in expanded pass text back to its source chunk. */
export type PreprocessSourceMapSegment = ShaderSourceMapSegment;

/**
 * Parses one shader pass into neutral IR and parse-stage diagnostics.
 * @param source - GLSL source for the shader pass.
 * @param includeMap - Include-path lookup table.
 * @param cache - Cache for expanded include chunks.
 * @param sourceFile - Canonical path of the root Shader source.
 * @param sourceScopeStarts - Start offsets of inherited ShaderLab content layers.
 * @returns Neutral IR, diagnostics, and preprocessed pass text.
 */
export function parseShaderPass(
  source: string,
  includeMap: IncludeMap,
  cache: ChunkOutputCache,
  sourceFile?: string,
  sourceScopeStarts?: readonly number[]
): ParsedShaderPassData {
  const normalizedSourceFile = normalizeShaderSourceFile(sourceFile);
  return parseShaderPassWith(
    source,
    includeMap,
    cache,
    shaderSourceBaseURL(normalizedSourceFile),
    (expandedSource, macroDefineList) => new AnalyzerLexer(expandedSource, macroDefineList),
    (expandedSource) =>
      ShaderTargetParser.create(
        branchAnalysis,
        createAnalyzerSemanticDiagnostics(expandedSource),
        expandedSource,
        undefined,
        true,
        true
      ),
    normalizedSourceFile,
    undefined,
    true,
    sourceScopeStarts
  );
}
