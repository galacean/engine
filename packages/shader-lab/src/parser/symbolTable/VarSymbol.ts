import { ASTNode } from "../AST";
import { SymbolDataType } from "./SymbolDataType";
import { ESymbolType, SymbolInfo } from "./SymbolInfo";

export class VarSymbol extends SymbolInfo {
  declare astNode:
    | ASTNode.Initializer
    | ASTNode.ParameterDeclarator
    | ASTNode.InitDeclaratorList
    | ASTNode.VariableDeclaration;

  readonly isGlobalVariable: boolean;

  constructor(
    ident: string,
    dataType: SymbolDataType,
    isGlobalVariable: boolean,
    initAst:
      | ASTNode.Initializer
      | ASTNode.ParameterDeclarator
      | ASTNode.InitDeclaratorList
      | ASTNode.VariableDeclaration
  ) {
    super(ident, ESymbolType.VAR, initAst, dataType);
    this.isGlobalVariable = isGlobalVariable;
  }
}
