import { ASTNode } from "./AST";
import { ShaderTargetParser } from "./ShaderTargetParser";
import { Preprocessor } from "../Preprocessor";
import type { ChunkOutputCache, IncludeMap } from "../Preprocessor";
import { Lexer } from "../lexer/Lexer";
import { ShaderCompilerUtils } from "../ShaderCompilerUtils";

let _parser: ShaderTargetParser;

/**
 * Parses one shader pass into an AST and parse-stage diagnostics.
 * @param source - GLSL source for the shader pass.
 * @param includeMap - Include-path lookup table.
 * @param cache - Cache for expanded include chunks.
 * @param basePathForIncludeKey - Base URL for relative include paths.
 * @returns Parsed program, diagnostics, and preprocessed pass text.
 */
export function parseShaderPass(
  source: string,
  includeMap: IncludeMap,
  cache: ChunkOutputCache,
  basePathForIncludeKey = ""
): { program: ASTNode.GLShaderProgram | null; errors: Error[]; passText: string } {
  _parser ??= ShaderTargetParser.create();
  const macroDefineList = {};
  const { content: passText, errors: preprocessErrors } = Preprocessor.parseWithErrors(
    source,
    basePathForIncludeKey,
    includeMap,
    cache
  );
  const tokens = new Lexer(passText, macroDefineList).tokenize();
  ShaderCompilerUtils.processingPassText = passText;
  try {
    const program = _parser.parse(tokens, macroDefineList);
    return { program, errors: [...preprocessErrors, ..._parser.errors], passText };
  } finally {
    ShaderCompilerUtils.processingPassText = undefined;
  }
}
