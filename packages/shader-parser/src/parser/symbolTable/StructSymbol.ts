import { ASTNode } from "../AST";
import { ESymbolType, SymbolInfo } from "./SymbolInfo";

export class StructSymbol extends SymbolInfo {
  declare astNode: ASTNode.StructSpecifier;

  constructor(lexeme: string, astNode: ASTNode.StructSpecifier) {
    super(lexeme, ESymbolType.STRUCT, astNode);
  }
}
