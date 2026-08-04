import { BranchSignature, DeclarationCoexistence, EMPTY_BRANCH } from "./BaseToken";
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

  // #if _VERBOSE
  /** Whether insert/lookups retain analyzer-grade macro branch facts. */
  branchAnalysisEnabled = false;
  // #endif

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
    // #if _VERBOSE
    return this.scope.insert(symbol, this.isInMacroBranch, branchSignature, this.branchAnalysisEnabled);
    // #else
    return this.scope.insert(symbol, this.isInMacroBranch, branchSignature);
    // #endif
  }

  // prettier-ignore
  lookup(
    symbol: S,
    includeMacro = false
    // #if _VERBOSE
    , callsiteBranch?: BranchSignature
    // #endif
  ): S | undefined {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const symbolTable = this.stack[i];
      // prettier-ignore
      const result = symbolTable.getSymbol(
        symbol,
        includeMacro
        // #if _VERBOSE
        , callsiteBranch
        // #endif
      );
      if (result) return result;
    }
    return undefined;
  }

  // #if _VERBOSE
  /** Whether any lexical scope contains an equal symbol, regardless of macro-branch visibility. */
  hasSymbol(symbol: S): boolean {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      if (this.stack[i].hasSymbol(symbol)) return true;
    }
    return false;
  }
  // #endif

  /**
   * Collect every matching symbol from the nearest lexical scope.
   * @param symbol - Symbol shape used for name and kind matching.
   * @param includeMacro - Whether lookups include declarations from macro branches without a callsite branch.
   * @param out - Reusable output array.
   * @param callsiteBranch - Branch signature used for branch-aware visibility filtering.
   * @returns The supplied output array containing visible matches.
   */
  // prettier-ignore
  lookupAll(
    symbol: S,
    includeMacro = false,
    out: S[]
    // #if _VERBOSE
    , callsiteBranch?: BranchSignature
    // #endif
  ): S[] {
    out.length = 0;
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const symbolTable = this.stack[i];
      // prettier-ignore
      symbolTable._getSymbols(
        symbol,
        includeMacro,
        out
        // #if _VERBOSE
        , callsiteBranch
        // #endif
      );
      // Match `lookup`: lexical shadowing stops at the nearest scope, while branch/overload
      // alternatives inside that scope remain available for ambiguity checks.
      if (out.length > 0) break;
    }
    return out;
  }
}
