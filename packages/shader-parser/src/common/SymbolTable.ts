import { EMPTY_BRANCH } from "./BaseToken";
import type { BranchSignature, DeclarationCoexistence } from "./BaseToken";
import type { BranchSemantics } from "./BranchSemantics";
import { getLexicalDeclarationCoexistence } from "./BranchIdentity";
import { canInheritanceBranchesCover } from "../preprocessor/PreprocessorCondition";
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
  insert(
    symbol: T,
    isInMacroBranch = false,
    branchSignature: BranchSignature = EMPTY_BRANCH,
    branchSemantics?: BranchSemantics
  ): Exclude<DeclarationCoexistence, "exclusive"> | "none" {
    symbol.isInMacroBranch = isInMacroBranch;
    symbol.branchSignature = branchSignature;

    const entry = this._table.get(symbol.ident) ?? [];
    const sourceScope = symbol.sourceScope ?? 0;
    if (sourceScope > 0) {
      for (let i = entry.length - 1; i >= 0; i--) {
        const existing = entry[i];
        const inheritedScope = existing.sourceScope ?? 0;
        if (!existing.equal(symbol) || inheritedScope >= sourceScope) continue;
        const alternatives = [branchSignature];
        for (const candidate of entry) {
          if ((candidate.sourceScope ?? 0) > inheritedScope && candidate.equal(symbol)) {
            alternatives.push(candidate.branchSignature ?? EMPTY_BRANCH);
          }
        }
        if (canInheritanceBranchesCover(alternatives, existing.branchSignature ?? EMPTY_BRANCH)) {
          entry.splice(i, 1);
        }
      }
    }

    if (!branchSemantics) {
      return this._insertWithoutBranchAnalysis(entry, symbol);
    }

    let conflict: Exclude<DeclarationCoexistence, "exclusive"> | "none" = "none";
    for (let i = 0, n = entry.length; i < n; i++) {
      const existing = entry[i];
      if (!existing.equal(symbol)) continue;
      // Later descendants can complete the collective coverage of an inherited declaration.
      if ((existing.sourceScope ?? 0) < sourceScope) continue;

      const existingBranch = existing.branchSignature ?? EMPTY_BRANCH;
      if (existingBranch.length === 0 && branchSignature.length === 0) {
        entry[i] = symbol;
        return "coexist";
      }

      const coexistence = branchSemantics.getDeclarationCoexistence(existingBranch, branchSignature);
      if (coexistence === "coexist") conflict = "coexist";
      else if (coexistence === "unknown" && conflict === "none") conflict = "unknown";
    }

    entry.push(symbol);
    this._table.set(symbol.ident, entry);
    return conflict;
  }

  private _insertWithoutBranchAnalysis(entry: T[], symbol: T): Exclude<DeclarationCoexistence, "exclusive"> | "none" {
    for (let i = 0, n = entry.length; i < n; i++) {
      if (
        entry[i].isInMacroBranch ||
        (entry[i].sourceScope ?? 0) !== (symbol.sourceScope ?? 0) ||
        !entry[i].equal(symbol)
      )
        continue;
      entry[i] = symbol;
      return "coexist";
    }
    entry.push(symbol);
    this._table.set(symbol.ident, entry);
    return "none";
  }

  /**
   * Classifies remaining inherited conflicts after all narrower declarations have been inserted.
   * @param symbol - Narrower declaration whose deferred diagnostic is being resolved.
   * @param branchSemantics - Analyzer-owned coexistence classification.
   * @returns The conflict remaining after collective inheritance coverage has been applied.
   * @internal
   */
  getInheritedConflict(
    symbol: T,
    branchSemantics: BranchSemantics
  ): Exclude<DeclarationCoexistence, "exclusive"> | "none" {
    const entry = this._table.get(symbol.ident);
    if (!entry?.includes(symbol)) return "none";
    let conflict: Exclude<DeclarationCoexistence, "exclusive"> | "none" = "none";
    for (const existing of entry) {
      if ((existing.sourceScope ?? 0) >= (symbol.sourceScope ?? 0) || !existing.equal(symbol)) continue;
      const coexistence = branchSemantics.getDeclarationCoexistence(
        existing.branchSignature ?? EMPTY_BRANCH,
        symbol.branchSignature ?? EMPTY_BRANCH
      );
      if (coexistence === "coexist") return "coexist";
      if (coexistence === "unknown") conflict = "unknown";
    }
    return conflict;
  }

  /**
   * Look up a symbol visible from `callsiteBranch`. A candidate `item` is visible when
   * `isBranchVisibleFrom(item.branchSignature, callsiteBranch)` — same or nested branch, or item is
   * unconditional. Without a callsite branch, `includeMacro` controls whether macro-branch entries
   * are eligible. Iterates from latest inserted to first visible match.
   */
  getSymbol(
    symbol: T,
    includeMacro = false,
    callsiteBranch?: BranchSignature,
    branchSemantics?: BranchSemantics
  ): T | undefined {
    const entry = this._table.get(symbol.ident);
    if (entry) {
      for (let i = entry.length - 1; i >= 0; i--) {
        const item = entry[i];
        let visible = includeMacro || !item.isInMacroBranch;
        if (branchSemantics && callsiteBranch !== undefined) {
          visible = branchSemantics.isBranchVisibleFrom(item.branchSignature ?? EMPTY_BRANCH, callsiteBranch);
        }
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
  _getSymbols(
    symbol: T,
    includeMacro = false,
    out: T[],
    callsiteBranch?: BranchSignature,
    branchSemantics?: BranchSemantics
  ): T[] {
    const entry = this._table.get(symbol.ident);

    if (entry) {
      for (let i = entry.length - 1; i >= 0; i--) {
        const item = entry[i];
        let visible = includeMacro || !item.isInMacroBranch;
        if (callsiteBranch !== undefined) {
          visible = branchSemantics
            ? branchSemantics.canBranchesOverlap(item.branchSignature ?? EMPTY_BRANCH, callsiteBranch)
            : getLexicalDeclarationCoexistence(item.branchSignature ?? EMPTY_BRANCH, callsiteBranch) !== "exclusive";
        }
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
