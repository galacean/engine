import { ASTNode } from "../AST";
import { SymbolDataType } from "./SymbolDataType";
import { ESymbolType, SymbolInfo } from "./SymbolInfo";
import type { VarSymbol } from "./VarSymbol";

export class FnSymbol extends SymbolInfo {
  declare astNode: ASTNode.FunctionDefinition;
  readonly localVariables: readonly VarSymbol[];
  readonly calledFunctions: readonly FnSymbol[];

  constructor(
    lexeme: string,
    astNode: ASTNode.FunctionDefinition,
    localVariables: readonly VarSymbol[] = [],
    calledFunctions: readonly FnSymbol[] = []
  ) {
    const type = new SymbolDataType(
      astNode.protoType.returnType.type,
      astNode.protoType.returnType.typeSpecifier.lexeme,
      undefined,
      astNode.protoType.returnType.typeSpecifier.structDeclarations
    );
    super(lexeme, ESymbolType.FN, astNode, type);
    this.localVariables = localVariables.slice();
    this.calledFunctions = calledFunctions.slice();
  }
}
