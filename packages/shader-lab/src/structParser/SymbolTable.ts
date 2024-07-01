import { BaseSymbolTable, IBaseSymbol } from "../BaseSymbolTable";

export interface ISymbol extends IBaseSymbol {
  type: number;
  value?: any;
}

export default class SymbolTable extends BaseSymbolTable<ISymbol> {
  override symbolEqualCheck(s1: ISymbol, s2: ISymbol): boolean {
    return s1.type === s2.type;
  }
}
