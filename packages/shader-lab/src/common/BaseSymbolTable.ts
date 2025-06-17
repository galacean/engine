import { Logger } from "@galacean/engine";
import { IBaseSymbol } from "./IBaseSymbol";

export abstract class BaseSymbolTable<T extends IBaseSymbol> {
  protected _table: Map<string, T[]> = new Map();

  insert(symbol: T): void {
    const entry = this._table.get(symbol.ident) ?? [];
    for (let i = 0; i < entry.length; i++) {
      if (entry[i].equal(symbol)) {
        Logger.warn("Replace symbol:", symbol.ident);
        entry[i] = symbol;
        return;
      }
    }
    entry.push(symbol);
    this._table.set(symbol.ident, entry);
  }

  abstract lookup(identifier: string, type?: any): T | undefined;
}
