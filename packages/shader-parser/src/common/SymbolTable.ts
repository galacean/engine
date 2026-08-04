import { EMPTY_BRANCH } from "./BaseToken";
import type { BranchSignature, DeclarationCoexistence } from "./BaseToken";
// #if _VERBOSE
import { canBranchesOverlap, getDeclarationCoexistence, isBranchVisibleFrom } from "./BaseToken";
// #endif
import { IBaseSymbol } from "./IBaseSymbol";

export class SymbolTable<T extends IBaseSymbol> {
  private _table: Map<string, T[]> = new Map();

  /**
   * Insert a symbol and report whether it conflicts with an existing declaration.
   * Branch declarations are retained even on conflict because codegen needs every arm.
   * @param symbol - Symbol to insert.
   * @param isInMacroBranch - Whether the declaration is inside a macro branch.
   * @param branchSignature - Macro conditions at the declaration site.
   * @returns Whether an equal declaration conflicts, is exclusive, or has unresolved branch overlap.
   */
  // prettier-ignore
  insert(
    symbol: T,
    isInMacroBranch = false,
    branchSignature: BranchSignature = EMPTY_BRANCH
    // #if _VERBOSE
    , branchAnalysisEnabled = true
    // #endif
  ): Exclude<DeclarationCoexistence, "exclusive"> | "none" {
    symbol.isInMacroBranch = isInMacroBranch;
    symbol.branchSignature = branchSignature;

    const entry = this._table.get(symbol.ident) ?? [];
    // #if _VERBOSE
    if (!branchAnalysisEnabled) {
      return this._insertWithoutBranchAnalysis(entry, symbol);
    }

    let conflict: Exclude<DeclarationCoexistence, "exclusive"> | "none" = "none";
    for (let i = 0, n = entry.length; i < n; i++) {
      const existing = entry[i];
      if (!existing.equal(symbol)) continue;

      const existingBranch = existing.branchSignature ?? EMPTY_BRANCH;
      if (existingBranch.length === 0 && branchSignature.length === 0) {
        entry[i] = symbol;
        return "coexist";
      }

      const coexistence = getDeclarationCoexistence(existingBranch, branchSignature);
      if (coexistence === "coexist") conflict = "coexist";
      else if (coexistence === "unknown" && conflict === "none") conflict = "unknown";
    }

    entry.push(symbol);
    this._table.set(symbol.ident, entry);
    return conflict;
    // #else
    return this._insertWithoutBranchAnalysis(entry, symbol);
    // #endif
  }

  private _insertWithoutBranchAnalysis(entry: T[], symbol: T): Exclude<DeclarationCoexistence, "exclusive"> | "none" {
    for (let i = 0, n = entry.length; i < n; i++) {
      if (entry[i].isInMacroBranch || !entry[i].equal(symbol)) continue;
      entry[i] = symbol;
      return "coexist";
    }
    entry.push(symbol);
    this._table.set(symbol.ident, entry);
    return "none";
  }

  /**
   * Look up a symbol visible from `callsiteBranch`. A candidate `item` is visible when
   * `isBranchVisibleFrom(item.branchSignature, callsiteBranch)` — same or nested branch, or item is
   * unconditional. Without a callsite branch, `includeMacro` controls whether macro-branch entries
   * are eligible. Iterates from latest inserted to first visible match.
   */
  // prettier-ignore
  getSymbol(
    symbol: T,
    includeMacro = false
    // #if _VERBOSE
    , callsiteBranch?: BranchSignature
    // #endif
  ): T | undefined {
    const entry = this._table.get(symbol.ident);
    if (entry) {
      for (let i = entry.length - 1; i >= 0; i--) {
        const item = entry[i];
        let visible = includeMacro || !item.isInMacroBranch;
        // #if _VERBOSE
        if (callsiteBranch !== undefined) {
          visible = isBranchVisibleFrom(item.branchSignature ?? EMPTY_BRANCH, callsiteBranch);
        }
        // #endif
        if (!visible) continue;
        if (item.equal(symbol)) return item;
      }
    }
  }

  getSymbols(symbol: T, includeMacro = false, out: T[]): T[] {
    out.length = 0;
    this._getSymbols(symbol, includeMacro, out);

    return out;
  }

  // #if _VERBOSE
  /** Whether this scope contains an equal symbol without applying macro-branch visibility rules. */
  hasSymbol(symbol: T): boolean {
    const entry = this._table.get(symbol.ident);
    if (!entry) return false;
    for (let i = 0, n = entry.length; i < n; i++) {
      if (entry[i].equal(symbol)) return true;
    }
    return false;
  }
  // #endif

  /**
   * @internal
   * Collect every matching declaration that can coexist with the callsite. Consumers combine this
   * candidate set with `canBranchesCoverCallsite` before accepting an unconditional reference.
   */
  // prettier-ignore
  _getSymbols(
    symbol: T,
    includeMacro = false,
    out: T[]
    // #if _VERBOSE
    , callsiteBranch?: BranchSignature
    // #endif
  ): T[] {
    const entry = this._table.get(symbol.ident);

    if (entry) {
      for (let i = entry.length - 1; i >= 0; i--) {
        const item = entry[i];
        let visible = includeMacro || !item.isInMacroBranch;
        // #if _VERBOSE
        if (callsiteBranch !== undefined) {
          visible = canBranchesOverlap(item.branchSignature ?? EMPTY_BRANCH, callsiteBranch);
        }
        // #endif
        if (!visible) continue;
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
