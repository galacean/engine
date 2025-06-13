import { Logger } from "@galacean/engine";
import { GalaceanDataType, TypeAny } from "../../common";
import { BaseSymbolTable } from "../../common/BaseSymbolTable";
import { ASTNode } from "../AST";
import { FnSymbol } from "./FnSymbol";
import { StructSymbol } from "./StructSymbol";
import { ESymbolType, SymbolAstNode, SymbolInfo } from "./SymbolInfo";
import { VarSymbol } from "./VarSymbol";

export class TargetSymbolTable extends BaseSymbolTable<SymbolInfo> {
  override insert(sm: SymbolInfo): void {
    const entry = this._table.get(sm.ident) ?? [];
    for (let i = 0; i < entry.length; i++) {
      if (this._haveSameTypeSymbol(entry[i], sm.symbolType, sm.paramSignature, sm.astNode)) {
        Logger.warn("replace symbol:", sm.ident);
        entry[i] = sm;
        return;
      }
    }
    entry.push(sm);
    this._table.set(sm.ident, entry);
  }

  lookup<T extends ESymbolType>(
    ident: string,
    symbolType: T,
    signature?: GalaceanDataType[],
    astNode?: ASTNode.FunctionDefinition
  ): T extends ESymbolType.FN
    ? FnSymbol
    : T extends ESymbolType.STRUCT
      ? StructSymbol
      : T extends ESymbolType.VAR
        ? VarSymbol
        : SymbolInfo {
    const entry = this._table.get(ident);
    if (entry) {
      for (let length = entry.length, i = 0; i < length; i++) {
        const item = entry[i];
        if (this._haveSameTypeSymbol(item, symbolType, signature, astNode)) return <any>item;
      }
    }
  }

  getAllFnSymbols(fnIdent: string): FnSymbol[] {
    const entries = this._table.get(fnIdent) ?? [];
    return entries.filter((item) => item.symbolType === ESymbolType.FN) as FnSymbol[];
  }

  private _haveSameTypeSymbol(
    item: SymbolInfo,
    symbolType: ESymbolType,
    paramSignature?: GalaceanDataType[],
    astNode?: SymbolAstNode
  ): boolean {
    if (item.symbolType !== symbolType) return false;
    if (item.symbolType === ESymbolType.FN) {
      if (!astNode && !paramSignature) return true;

      const params = (<ASTNode.FunctionDefinition>item.astNode).protoType.paramSig;
      const comparedParams = paramSignature ?? (<ASTNode.FunctionDefinition>astNode).protoType.paramSig;
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
