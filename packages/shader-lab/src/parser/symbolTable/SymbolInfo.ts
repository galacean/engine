import { IBaseSymbol } from "../../common/BaseSymbolTable";
import { GalaceanDataType } from "../../common/types";
import { ASTNode } from "../AST";
import { SymbolDataType } from "./SymbolDataType";

export enum ESymbolType {
  VAR,
  FN,
  STRUCT
}

export type SymbolAstNode =
  | ASTNode.Initializer
  | ASTNode.StructSpecifier
  | ASTNode.FunctionDefinition
  | ASTNode.ParameterDeclarator
  | ASTNode.InitDeclaratorList
  | ASTNode.VariableDeclaration;

export class SymbolInfo implements IBaseSymbol {
  constructor(
    public readonly ident: string,
    public readonly symbolType: ESymbolType,
    public readonly astNode?: SymbolAstNode,
    public readonly dataType?: SymbolDataType,
    public readonly paramSignature?: GalaceanDataType[]
  ) {}
}
