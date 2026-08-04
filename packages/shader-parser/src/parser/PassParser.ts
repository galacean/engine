import { ShaderTargetParser } from "./ShaderTargetParser";
import { Preprocessor, type ChunkOutputCache, type IncludeMap } from "../Preprocessor";
import { AnalyzerLexer } from "../lexer/AnalyzerLexer";
import { branchAnalysis } from "../common/BranchAnalysis";
import { analyzerSemanticDiagnostics } from "./AnalyzerSemanticDiagnostics";
import { ShaderCompilerUtils } from "../ShaderCompilerUtils";
import { ShaderClueIR, type ShaderSourceMapSegment } from "../ir";

let _parser: ShaderTargetParser;

/** Maps a range in expanded pass text back to its source chunk. */
export type PreprocessSourceMapSegment = ShaderSourceMapSegment;

/**
 * Parses one shader pass into neutral IR and parse-stage diagnostics.
 * @param source - GLSL source for the shader pass.
 * @param includeMap - Include-path lookup table.
 * @param cache - Cache for expanded include chunks.
 * @param basePathForIncludeKey - Base URL for relative include paths.
 * @returns Neutral IR, diagnostics, and preprocessed pass text.
 */
export function parseShaderPass(
  source: string,
  includeMap: IncludeMap,
  cache: ChunkOutputCache,
  basePathForIncludeKey = ""
): {
  ir: ShaderClueIR | null;
  errors: Error[];
  passText: string;
  sourceMap: PreprocessSourceMapSegment[];
} {
  _parser ??= ShaderTargetParser.create(branchAnalysis, analyzerSemanticDiagnostics);
  const macroDefineList = {};
  const {
    content: passText,
    errors: preprocessErrors,
    sourceMap
  } = Preprocessor.parseWithErrors(source, basePathForIncludeKey, includeMap, cache);
  const tokens = new AnalyzerLexer(passText, macroDefineList).tokenize();
  ShaderCompilerUtils.processingPassText = passText;
  try {
    const program = _parser.parse(tokens, macroDefineList);
    const ir = program ? new ShaderClueIR(program, passText, sourceMap) : null;
    return { ir, errors: [...preprocessErrors, ..._parser.errors], passText, sourceMap };
  } finally {
    ShaderCompilerUtils.processingPassText = undefined;
  }
}
