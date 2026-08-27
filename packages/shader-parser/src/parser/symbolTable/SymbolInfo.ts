import { IBaseSymbol } from "../../common/IBaseSymbol";
import { BranchSignature, EMPTY_BRANCH } from "../../common/BaseToken";
import { GalaceanDataType, TypeAny } from "../../common/types";
import { ASTNode } from "../AST";
import { SymbolDataType } from "./SymbolDataType";

export enum ESymbolType {
  VAR,
  FN,
  STRUCT,
  Any
}

export type SymbolAstNode =
  | ASTNode.Initializer
  | ASTNode.StructSpecifier
  | ASTNode.FunctionDefinition
  | ASTNode.ParameterDeclarator
  | ASTNode.InitDeclaratorList
  | ASTNode.VariableDeclaration;

export class SymbolInfo implements IBaseSymbol {
  sourceScope = 0;
  /**
   * Snapshot of the `#ifdef` stack at the declaration site. Empty means the declaration is
   * unconditional (top-level). Non-empty means the declaration is only active when every
   * constraint holds. `SymbolTable.getSymbol` filters candidates by
   * `isBranchVisibleFrom(this.branchSignature, callsiteBranch)` — a reference inside a mutually
   * exclusive branch never sees this symbol; a reference inside the same or a nested branch
   * does. Mirrors `codegen`'s per-branch symbol visibility.
   */
  branchSignature: BranchSignature = EMPTY_BRANCH;

  constructor(
    public ident: string,
    public type: ESymbolType,
    public astNode?: SymbolAstNode,
    public dataType?: SymbolDataType,
    public paramSignature?: GalaceanDataType[],
    public isInMacroBranch = false
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

  equal(symbol: SymbolInfo): boolean {
    if (symbol.type !== ESymbolType.Any && this.type !== symbol.type) return false;
    if (this.type === ESymbolType.FN) {
      if (!symbol.astNode && !symbol.paramSignature) return true;

      const params = (<ASTNode.FunctionDefinition>this.astNode).protoType.paramSig;
      const comparedParams = symbol.paramSignature ?? (<ASTNode.FunctionDefinition>symbol.astNode).protoType.paramSig;
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
