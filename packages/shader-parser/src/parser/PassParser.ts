import { ASTNode } from "./AST";
import { ShaderTargetParser } from "./ShaderTargetParser";
import { Preprocessor } from "../Preprocessor";
import type { ChunkOutputCache, IncludeMap } from "../Preprocessor";
import { Lexer } from "../lexer/Lexer";
import { ShaderCompilerUtils } from "../ShaderCompilerUtils";

let _parser: ShaderTargetParser;

/**
 * Drive preprocess → lex → parse for one pass's GLSL source, returning the AST program
 * and parse-stage diagnostics. Lets consumers obtain an AST without touching the
 * preprocessor / lexer / LALR parser directly. `processingPassText` is reset on exit;
 * callers that run a later AST pass (codegen/IO) re-set it from the returned `passText`.
 */
export function parseShaderPass(
  source: string,
  includeMap: IncludeMap,
  cache: ChunkOutputCache
): { program: ASTNode.GLShaderProgram | null; errors: Error[]; passText: string } {
  _parser ??= ShaderTargetParser.create();
  const macroDefineList = {};
  const passText = Preprocessor.parse(source, "", includeMap, cache);
  const tokens = new Lexer(passText, macroDefineList).tokenize();
  ShaderCompilerUtils.processingPassText = passText;
  try {
    const program = _parser.parse(tokens, macroDefineList);
    return { program, errors: [..._parser.errors], passText };
  } finally {
    ShaderCompilerUtils.processingPassText = undefined;
  }
}
