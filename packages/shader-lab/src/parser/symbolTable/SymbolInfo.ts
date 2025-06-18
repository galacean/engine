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
    public ident: string,
    public type: ESymbolType,
    public astNode?: SymbolAstNode,
    public dataType?: SymbolDataType,
    public paramSignature?: GalaceanDataType[]
  ) {}

  set(
    ident: string,
    symbolType: ESymbolType,
    astNode?: SymbolAstNode,
    dataType?: SymbolDataType,
    paramSignature?: GalaceanDataType[]
  ) {
    this.ident = ident;
    this.type = symbolType;
    this.astNode = astNode;
    this.dataType = dataType;
    this.paramSignature = paramSignature;
  }

  equal(other: SymbolInfo): boolean {
    if (this.type !== other.type) return false;
    if (this.type === ESymbolType.FN) {
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
