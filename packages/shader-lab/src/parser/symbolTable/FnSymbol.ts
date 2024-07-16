import { ASTNode } from "../AST";
import { SymbolDataType } from "./SymbolDataType";
import { ESymbolType, SymbolInfo } from "./SymbolInfo";

export class FnSymbol extends SymbolInfo {
  declare astNode: ASTNode.FunctionDefinition;

  constructor(lexeme: string, astNode: ASTNode.FunctionDefinition) {
    const type = new SymbolDataType(
      astNode.protoType.returnType.type,
      astNode.protoType.returnType.typeSpecifier.lexeme
    );
    super(lexeme, ESymbolType.FN, astNode, type);
  }
}
