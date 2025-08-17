import { Logger } from "@galacean/engine";
import { IBaseSymbol } from "./IBaseSymbol";

export class SymbolTable<T extends IBaseSymbol> {
  /** @internal */
  _table: Map<string, T[]> = new Map();

  insert(symbol: T, isInMacroBranch = false): void {
    symbol.isInMacroBranch = isInMacroBranch;

    const entry = this._table.get(symbol.ident) ?? [];
    for (let i = 0, n = entry.length; i < n; i++) {
      if (entry[i].isInMacroBranch) continue;
      if (entry[i].equal(symbol)) {
        Logger.warn("Replace symbol:", symbol.ident);
        entry[i] = symbol;
        return;
      }
    }

    entry.push(symbol);
    this._table.set(symbol.ident, entry);
  }

  getSymbol(symbol: T, includeMacro = false): T | undefined {
    const entry = this._table.get(symbol.ident);
    if (entry) {
      for (let i = entry.length - 1; i >= 0; i--) {
        const item = entry[i];
        if (!includeMacro && item.isInMacroBranch) continue;
        if (item.equal(symbol)) return item;
      }
    }
  }

  getSymbols(symbol: T, includeMacro = false, out: T[]): T[] {
    out.length = 0;
    this._getSymbols(symbol, includeMacro, out);

    return out;
  }

  /**
   * @internal
   */
  _getSymbols(symbol: T, includeMacro = false, out: T[]): T[] {
    const entry = this._table.get(symbol.ident);

    if (entry) {
      for (let i = entry.length - 1; i >= 0; i--) {
        const item = entry[i];
        if (!includeMacro && item.isInMacroBranch) continue;
        if (item.equal(symbol)) out.push(item);
      }
    }

    return out;
  }
}
