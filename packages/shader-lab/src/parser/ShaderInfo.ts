import { SymbolInfo, SymbolTable } from "../parser/symbolTable";
import { ASTNode } from "./AST";

export class ShaderData {
  symbolTable: SymbolTable<SymbolInfo>;

  vertexMain: ASTNode.FunctionDefinition;
  fragmentMain: ASTNode.FunctionDefinition;

  globalPrecisions: ASTNode.PrecisionSpecifier[] = [];

  globalMacroStatements: ASTNode.GlobalMacroIfStatement[] = [];

  getOuterGlobalMacroStatements(): ASTNode.GlobalMacroIfStatement[] {
    return this.globalMacroStatements.filter((node) => node.parent.parent instanceof ASTNode.GLShaderProgram);
  }
}
