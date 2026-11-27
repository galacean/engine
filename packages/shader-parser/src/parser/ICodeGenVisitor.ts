import type { ASTNode, TreeNode } from "./AST";
import type { NodeChild } from "./types";

/** AST nodes call back into the code generator through this interface, so AST stays decoupled from the concrete `CodeGenVisitor`. */
export interface ICodeGenVisitor {
  cache(node: TreeNode, code: string): string;
  getCachedCode(node: TreeNode): string | undefined;
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
  /**
   * Emits a type occurrence using the backend's declaration rules.
   * @param node - Type occurrence with its captured declarations.
   * @returns Generated type source.
   */
  visitTypeSpecifier(node: ASTNode.TypeSpecifier): string;
  visitStructSpecifier(node: ASTNode.StructSpecifier): string;
  visitFunctionDefinition(node: ASTNode.FunctionDefinition): string;

  // Optional multi-backend AST hooks (backends like WGSLVisitor override these; GLES falls back to defaultCodeGen).
  visitUniformBlock?(node: ASTNode.UniformBlock): string;
  visitStorageBlock?(node: ASTNode.StorageBlock): string;
  visitStorageTextureDeclaration?(node: ASTNode.StorageTextureDeclaration): string;
  visitPrecisionSpecifier?(node: ASTNode.PrecisionSpecifier): string;
  visitParameterDeclaration?(node: ASTNode.ParameterDeclaration): string;
  visitInitDeclaratorList?(node: ASTNode.InitDeclaratorList): string;
  visitInitializer?(node: ASTNode.Initializer): string;
  visitInitializerList?(node: ASTNode.InitializerList): string;
  visitSelectionStatement?(node: ASTNode.SelectionStatement): string;
  visitIterationStatement?(node: ASTNode.IterationStatement): string;
  visitCompoundStatement?(node: ASTNode.CompoundStatement): string;
  visitCompoundStatementNoScope?(node: ASTNode.CompoundStatementNoScope): string;
  visitExpressionStatement?(node: ASTNode.ExpressionStatement): string;
  visitPrimaryExpression?(node: ASTNode.PrimaryExpression): string;
  visitUnaryExpression?(node: ASTNode.UnaryExpression): string;
  visitBinaryExpression?(node: ASTNode.ExpressionAstNode): string;
  visitAssignmentExpression?(node: ASTNode.AssignmentExpression): string;
  visitConditionalExpression?(node: ASTNode.ConditionalExpression): string;
  visitExpression?(node: ASTNode.Expression): string;
  visitFunctionCallGeneric?(node: ASTNode.FunctionCallGeneric): string;
}
