import { SymbolTable } from "../../common/SymbolTable";
import { FnSymbol } from "./FnSymbol";
import { ESymbolType, SymbolInfo } from "./SymbolInfo";

export class TargetSymbolTable extends SymbolTable<SymbolInfo> {
  getAllFnSymbols(fnIdent: string): FnSymbol[] {
    const entries = this._table.get(fnIdent) ?? [];
    return entries.filter((item) => item.type === ESymbolType.FN) as FnSymbol[];
  }
}
