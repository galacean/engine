import type { ASTNode } from "./AST";
import type { NodeChild } from "./types";

/** AST nodes call back into the code generator through this interface, so AST stays decoupled from the concrete `CodeGenVisitor`. */
export interface ICodeGenVisitor {
  defaultCodeGen(children: NodeChild[]): string;
  visitPostfixExpression(node: ASTNode.PostfixExpression): string;
  visitVariableIdentifier(node: ASTNode.VariableIdentifier): string;
  visitFunctionCall(node: ASTNode.FunctionCall): string;
  visitMacroCallFunction(node: ASTNode.MacroCallFunction): string;
  visitStatementList(node: ASTNode.StatementList): string;
  visitMacroDefine(node: ASTNode.MacroDefine): string;
  visitSingleDeclaration(node: ASTNode.SingleDeclaration): string;
  visitGlobalVariableDeclaration(node: ASTNode.VariableDeclaration): string;
  visitDeclaration(node: ASTNode.Declaration): string;
  visitFunctionParameterList(node: ASTNode.FunctionParameterList): string;
  visitFunctionHeader(node: ASTNode.FunctionHeader): string;
  visitJumpStatement(node: ASTNode.JumpStatement): string;
  visitFunctionIdentifier(node: ASTNode.FunctionIdentifier): string;
  visitStructSpecifier(node: ASTNode.StructSpecifier): string;
  visitFunctionDefinition(node: ASTNode.FunctionDefinition): string;
}
