import {
  BranchSignature,
  canBranchesOverlap,
  canDeclarationsCoexist,
  EMPTY_BRANCH,
  isBranchVisibleFrom
} from "./BaseToken";
import { IBaseSymbol } from "./IBaseSymbol";

export class SymbolTable<T extends IBaseSymbol> {
  private _table: Map<string, T[]> = new Map();

  /**
   * Insert a symbol and report whether it conflicts with an existing declaration.
   * Branch declarations are retained even on conflict because codegen needs every arm.
   * @param symbol - Symbol to insert.
   * @param isInMacroBranch - Whether the declaration is inside a macro branch.
   * @param branchSignature - Macro conditions at the declaration site.
   * @param diagnoseBranchConflict - Whether possible coexistence across macro branches is an error.
   * @returns Whether an equal declaration conflicts in this scope.
   */
  insert(
    symbol: T,
    isInMacroBranch = false,
    branchSignature: BranchSignature = EMPTY_BRANCH,
    diagnoseBranchConflict = true
  ): boolean {
    symbol.isInMacroBranch = isInMacroBranch;
    symbol.branchSignature = branchSignature;

    const entry = this._table.get(symbol.ident) ?? [];
    let redefined = false;
    for (let i = 0, n = entry.length; i < n; i++) {
      const existing = entry[i];
      if (!existing.equal(symbol)) continue;

      const existingBranch = existing.branchSignature ?? EMPTY_BRANCH;
      if (existingBranch.length === 0 && branchSignature.length === 0) {
        entry[i] = symbol;
        return true;
      }

      if (diagnoseBranchConflict && canDeclarationsCoexist(existingBranch, branchSignature)) redefined = true;
    }

    entry.push(symbol);
    this._table.set(symbol.ident, entry);
    return redefined;
  }

  /**
   * Look up a symbol visible from `callsiteBranch`. A candidate `item` is visible when
   * `isBranchVisibleFrom(item.branchSignature, callsiteBranch)` — same or nested branch, or item is
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

  /** Whether this scope contains an equal symbol without applying macro-branch visibility rules. */
  hasSymbol(symbol: T): boolean {
    const entry = this._table.get(symbol.ident);
    if (!entry) return false;
    for (let i = 0, n = entry.length; i < n; i++) {
      if (entry[i].equal(symbol)) return true;
    }
    return false;
  }

  /**
   * @internal
   * Collect every matching declaration that can coexist with the callsite. Consumers combine this
   * candidate set with `canBranchesCoverCallsite` before accepting an unconditional reference.
   */
  _getSymbols(symbol: T, includeMacro = false, out: T[], callsiteBranch?: BranchSignature): T[] {
    const entry = this._table.get(symbol.ident);

    if (entry) {
      for (let i = entry.length - 1; i >= 0; i--) {
        const item = entry[i];
        if (callsiteBranch !== undefined) {
          if (!canBranchesOverlap(item.branchSignature ?? EMPTY_BRANCH, callsiteBranch)) continue;
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
