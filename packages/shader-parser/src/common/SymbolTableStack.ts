import { BranchSignature, DeclarationCoexistence, EMPTY_BRANCH } from "./BaseToken";
import type { BranchSemantics } from "./BranchSemantics";
import { isLexicalBranchVisibleFrom } from "./BranchIdentity";
import { IBaseSymbol } from "./IBaseSymbol";
import { SymbolTable } from "./SymbolTable";

export class SymbolTableStack<S extends IBaseSymbol, T extends SymbolTable<S>> {
  stack: T[] = [];

  /**
   * @internal
   */
  _macroLevel = 0;

  /**
   * Branch signature stamped on declarations at the current parser position. Lookups receive their
   * callsite branch explicitly.
   */
  _currentBranch: BranchSignature = EMPTY_BRANCH;

  /** Analyzer-only branch operations; absent on the runtime compiler path. */
  branchSemantics?: BranchSemantics;

  get scope(): T {
    return this.stack[this.stack.length - 1];
  }

  get isInMacroBranch(): boolean {
    return this._macroLevel > 0;
  }

  pushScope(scope: T): void {
    this.stack.push(scope);
  }

  clear(): void {
    this.stack.length = 0;
    // Working state, not just the stack: a parse that bails inside a macro branch leaves this
    // non-zero, so a failed compile would make the next one think it is in a macro branch.
    this._macroLevel = 0;
    this._currentBranch = EMPTY_BRANCH;
  }

  popScope(): T | undefined {
    return this.stack.pop();
  }

  /**
   * Insert a symbol into the current lexical scope.
   * @param symbol - Symbol to insert.
   * @param branchSignature - Macro branch at the declaration token.
   * @returns Whether the declaration conflicts, is exclusive, or has unresolved branch overlap.
   */
  insert(
    symbol: S,
    branchSignature: BranchSignature = this._currentBranch
  ): Exclude<DeclarationCoexistence, "exclusive"> | "none" {
    return this.scope.insert(symbol, this.isInMacroBranch, branchSignature, this.branchSemantics);
  }

  lookup(symbol: S, includeMacro = false, callsiteBranch?: BranchSignature): S | undefined {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const symbolTable = this.stack[i];
      const result = symbolTable.getSymbol(symbol, includeMacro, callsiteBranch, this.branchSemantics);
      if (result) return result;
    }
    return undefined;
  }

  /** Whether any lexical scope contains an equal symbol, regardless of macro-branch visibility. */
  hasSymbol(symbol: S): boolean {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      if (this.stack[i].hasSymbol(symbol)) return true;
    }
    return false;
  }

  /**
   * Collect every matching symbol from the nearest lexical scope.
   * @param symbol - Symbol shape used for name and kind matching.
   * @param includeMacro - Whether lookups include declarations from macro branches without a callsite branch.
   * @param out - Reusable output array.
   * @param callsiteBranch - Branch signature used for branch-aware visibility filtering.
   * @returns The supplied output array containing visible matches.
   */
  lookupAll(symbol: S, includeMacro = false, out: S[], callsiteBranch?: BranchSignature): S[] {
    out.length = 0;
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const symbolTable = this.stack[i];
      symbolTable._getSymbols(symbol, includeMacro, out, callsiteBranch, this.branchSemantics);
      // Match `lookup`: lexical shadowing stops at the nearest scope, while branch/overload
      // alternatives inside that scope remain available for ambiguity checks.
      if (out.length > 0) break;
    }
    return out;
  }

  /**
   * Collects semantic candidates from the nearest scope and runtime-owner candidates from outer fallback scopes.
   * @param symbol - Symbol shape used for name and kind matching.
   * @param includeMacro - Whether lookups include declarations from macro branches without a callsite branch.
   * @param out - Reusable output array receiving candidates from the nearest matching scope.
   * @param runtimeFallbacks - Reusable output array receiving outer declarations that may own a runtime reference.
   * @param callsiteBranch - Branch signature used for branch-aware visibility filtering.
   * @returns The supplied `out` array containing semantic candidates from the nearest matching scope.
   */
  lookupAllWithRuntimeFallbacks(
    symbol: S,
    includeMacro: boolean,
    out: S[],
    runtimeFallbacks: S[],
    callsiteBranch?: BranchSignature
  ): S[] {
    out.length = 0;
    runtimeFallbacks.length = 0;

    for (let i = this.stack.length - 1; i >= 0; i--) {
      if (!out.length) {
        this.stack[i]._getSymbols(symbol, includeMacro, out, callsiteBranch, this.branchSemantics);
        if (!out.length) continue;
        if (this._runtimeCandidatesCoverCallsite(out, callsiteBranch)) break;
      } else {
        const fallbackStart = runtimeFallbacks.length;
        this.stack[i]._getSymbols(symbol, includeMacro, runtimeFallbacks, callsiteBranch, this.branchSemantics);
        if (
          runtimeFallbacks.length > fallbackStart &&
          this._runtimeCandidatesCoverCallsite(runtimeFallbacks, callsiteBranch)
        ) {
          break;
        }
      }
    }

    return out;
  }

  private _runtimeCandidatesCoverCallsite(candidates: readonly S[], callsiteBranch?: BranchSignature): boolean {
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      if (
        !candidate.isInMacroBranch ||
        (callsiteBranch && isLexicalBranchVisibleFrom(candidate.branchSignature ?? EMPTY_BRANCH, callsiteBranch))
      ) {
        return true;
      }
    }
    return false;
  }
}
