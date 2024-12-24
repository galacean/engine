import { Logger } from "@galacean/engine";
import { TokenType } from "../common";
import { BaseSymbolTable, IBaseSymbol } from "../common/BaseSymbolTable";

export interface ISymbol extends IBaseSymbol {
  type: number;
  value?: any;
}

export default class SymbolTable extends BaseSymbolTable<ISymbol> {
  override insert(sm: ISymbol): void {
    const entry = this._table.get(sm.ident) ?? [];
    for (let i = 0; i < entry.length; i++) {
      if (entry[i].type === sm.type) {
        Logger.warn("replace symbol:", sm.ident);
        entry[i] = sm;
        return;
      }
    }
    entry.push(sm);
    this._table.set(sm.ident, entry);
  }

  lookupByType(ident: string, type: TokenType): ISymbol | undefined {
    const entry = this._table.get(ident);
    if (entry) {
      for (let length = entry.length, i = 0; i < length; i++) {
        const item = entry[i];
        if (item.type === type) return item;
      }
    }
  }
}
