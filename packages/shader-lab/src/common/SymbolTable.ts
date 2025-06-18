import { Logger } from "@galacean/engine";
import { IBaseSymbol } from "./IBaseSymbol";

export class SymbolTable<T extends IBaseSymbol> {
  /** @internal */
  _table: Map<string, T[]> = new Map();

  insert(symbol: T): void {
    const entry = this._table.get(symbol.ident) ?? [];
    for (let i = 0, n = entry.length; i < n; i++) {
      if (entry[i].equal(symbol)) {
        Logger.warn("Replace symbol:", symbol.ident);
        entry[i] = symbol;
        return;
      }
    }
    entry.push(symbol);
    this._table.set(symbol.ident, entry);
  }

  lookup(symbol: T): T | undefined {
    const entry = this._table.get(symbol.ident);
    if (entry) {
      for (let n = entry.length, i = 0; i < n; i++) {
        const item = entry[i];
        if (item.equal(symbol)) return item;
      }
    }
  }
}
