import { SymbolInfo, SymbolTable } from "../parser/symbolTable";
import { ASTNode } from "./AST";

export class ShaderData {
  symbolTable: SymbolTable<SymbolInfo>;

  vertexMain: ASTNode.FunctionDefinition;
  fragmentMain: ASTNode.FunctionDefinition;

  globalPrecisions: ASTNode.PrecisionSpecifier[] = [];

  globalMacroDeclarations: ASTNode.GlobalDeclaration[] = [];

  getOuterGlobalMacroDeclarations(): ASTNode.GlobalDeclaration[] {
    return this.globalMacroDeclarations.filter((node) => node.parent instanceof ASTNode.GLShaderProgram);
  }
}
