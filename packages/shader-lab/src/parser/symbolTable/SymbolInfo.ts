import { IBaseSymbol } from "../../common/IBaseSymbol";
import { GalaceanDataType, TypeAny } from "../../common/types";
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

  equal(other: SymbolInfo): boolean {
    if (this.symbolType !== other.symbolType) return false;
    if (this.symbolType === ESymbolType.FN) {
      if (!other.astNode && !other.paramSignature) return true;

      const params = (<ASTNode.FunctionDefinition>this.astNode).protoType.paramSig;
      const comparedParams = other.paramSignature ?? (<ASTNode.FunctionDefinition>other.astNode).protoType.paramSig;
      const length = params?.length;
      if (length !== comparedParams?.length) return false;
      for (let i = 0; i < length; i++) {
        const t1 = params[i],
          t2 = comparedParams[i];
        if (t1 === TypeAny || t2 === TypeAny) continue;
        if (t1 !== t2) return false;
      }
      return true;
    }
    return true;
  }
}
