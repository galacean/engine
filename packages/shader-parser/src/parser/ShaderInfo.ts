import { ShaderRange } from "../common";
import { SymbolInfo, SymbolTable } from "../parser/symbolTable";
import { ASTNode } from "./AST";

export class ShaderData {
  symbolTable: SymbolTable<SymbolInfo>;

  vertexMain: ASTNode.FunctionDefinition;
  fragmentMain: ASTNode.FunctionDefinition;

  /** Source locations where `gl_FragColor` is referenced — a parse-time clue for the MRT-conflict check. */
  glFragColorReferences: ShaderRange[] = [];

  globalPrecisions: ASTNode.PrecisionSpecifier[] = [];

  globalMacroDeclarations: ASTNode.GlobalDeclaration[] = [];

  getOuterGlobalMacroDeclarations(): ASTNode.GlobalDeclaration[] {
    return this.globalMacroDeclarations.filter((node) => node.parent instanceof ASTNode.GLShaderProgram);
  }
}
