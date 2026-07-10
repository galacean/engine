import { BranchSignature, EMPTY_BRANCH, isBranchVisibleFrom } from "./BaseToken";
import { IBaseSymbol } from "./IBaseSymbol";

export class SymbolTable<T extends IBaseSymbol> {
  private _table: Map<string, T[]> = new Map();

  // Returns true when an equal non-macro symbol already existed in this scope and was replaced (a redefinition).
  insert(symbol: T, isInMacroBranch = false, branchSignature: BranchSignature = EMPTY_BRANCH): boolean {
    symbol.isInMacroBranch = isInMacroBranch;
    symbol.branchSignature = branchSignature;

    const entry = this._table.get(symbol.ident) ?? [];
    for (let i = 0, n = entry.length; i < n; i++) {
      if (entry[i].isInMacroBranch) continue;
      if (entry[i].equal(symbol)) {
        entry[i] = symbol;
        return true;
      }
    }

    entry.push(symbol);
    this._table.set(symbol.ident, entry);
    return false;
  }

  /**
   * Look up a symbol visible from `callsiteBranch`. A candidate `item` is visible when
   * `Lexer.isVisibleFrom(item.branchSignature, callsiteBranch)` — same or nested branch, or item is
   * unconditional. When `callsiteBranch` is undefined, fall back to the legacy behaviour
   * (`!includeMacro` filters out macro-branch entries) — used by codegen and by paths that predate
   * branch propagation. Iterates from latest inserted → returns first visible match.
   */
  getSymbol(symbol: T, includeMacro = false, callsiteBranch?: BranchSignature): T | undefined {
    const entry = this._table.get(symbol.ident);
    if (entry) {
      for (let i = entry.length - 1; i >= 0; i--) {
        const item = entry[i];
        if (callsiteBranch !== undefined) {
          if (!isBranchVisibleFrom(item.branchSignature ?? EMPTY_BRANCH, callsiteBranch)) continue;
        } else if (!includeMacro && item.isInMacroBranch) {
          continue;
        }
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
   * Same visibility semantics as `getSymbol`, but collects every visible matching candidate.
   */
  _getSymbols(symbol: T, includeMacro = false, out: T[], callsiteBranch?: BranchSignature): T[] {
    const entry = this._table.get(symbol.ident);

    if (entry) {
      for (let i = entry.length - 1; i >= 0; i--) {
        const item = entry[i];
        if (callsiteBranch !== undefined) {
          if (!isBranchVisibleFrom(item.branchSignature ?? EMPTY_BRANCH, callsiteBranch)) continue;
        } else if (!includeMacro && item.isInMacroBranch) {
          continue;
        }
        if (item.equal(symbol)) out.push(item);
      }
    }

    return out;
  }

  /** Iterate every registered symbol. Order within a name bucket is insertion order. */
  forEach(callback: (symbol: T) => void): void {
    for (const entries of this._table.values()) {
      for (let i = 0, n = entries.length; i < n; i++) {
        callback(entries[i]);
      }
    }
  }
}
