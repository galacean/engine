import { TypeAny } from "../../common";
import { BaseSymbolTable } from "../../common/BaseSymbolTable";
import { ASTNode } from "../AST";
import { FnSymbol } from "./FnSymbol";
import { ESymbolType, SymbolInfo } from "./SymbolInfo";

export class SymbolTable extends BaseSymbolTable<SymbolInfo> {
  override symbolEqualCheck(exist: SymbolInfo, newSymbol: SymbolInfo): boolean {
    if (exist.symbolType !== newSymbol.symbolType) return false;
    if (newSymbol.symbolType === ESymbolType.FN) {
      if (!newSymbol.astNode && !newSymbol.signature) return true;

      const existParams = (exist.astNode as ASTNode.FunctionDefinition).protoType.paramSig;
      const newSymbolParams =
        newSymbol.signature ?? (newSymbol.astNode as ASTNode.FunctionDefinition).protoType.paramSig;
      if (existParams.length !== newSymbolParams.length) return false;
      for (let i = 0; i < existParams.length; i++) {
        if (existParams[i] === TypeAny || newSymbolParams[i] === TypeAny) continue;
        if (existParams[i] !== newSymbolParams[i]) return false;
      }
    }
    return true;
  }

  getAllFnSymbols(fnIdent: string): FnSymbol[] {
    const entries = this._table.get(fnIdent) ?? [];
    return entries.filter((item) => item.symbolType === ESymbolType.FN) as FnSymbol[];
  }
}
