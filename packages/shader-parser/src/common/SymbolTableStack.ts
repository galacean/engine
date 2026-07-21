import { BranchSignature, EMPTY_BRANCH } from "./BaseToken";
import { IBaseSymbol } from "./IBaseSymbol";
import { SymbolTable } from "./SymbolTable";

export class SymbolTableStack<S extends IBaseSymbol, T extends SymbolTable<S>> {
  stack: T[] = [];

  /**
   * @internal
   */
  _macroLevel = 0;

  /**
   * Live branch signature of the position currently being parsed. Set by the parser to the current
   * AST node's branch during `semanticAnalyze`. `insert` stamps this on new symbols so declarations
   * carry their branch. `lookup` / `lookupAll` NEVER read it — callers pass `callsiteBranch`
   * explicitly, opting in per site. Redefinition checks use the stamped declaration branches to
   * distinguish mutually exclusive arms and canonical include guards from declarations that can
   * coexist.
   */
  _currentBranch: BranchSignature = EMPTY_BRANCH;

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
   * @returns Whether the declaration conflicts with an existing declaration in this scope.
   */
  insert(symbol: S): boolean {
    // Local shader code can rely on caller-owned macro exclusivity that is absent from the source.
    // Apply possible-coexistence diagnostics only to global declarations; unconditional collisions
    // keep their legacy error behavior in every scope.
    const diagnoseBranchConflict = this.stack.length === 1;
    return this.scope.insert(symbol, this.isInMacroBranch, this._currentBranch, diagnoseBranchConflict);
  }

  lookup(symbol: S, includeMacro = false, callsiteBranch?: BranchSignature): S | undefined {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const symbolTable = this.stack[i];
      const result = symbolTable.getSymbol(symbol, includeMacro, callsiteBranch);
      if (result) return result;
    }
    return undefined;
  }

  /**
   * Collect every visible matching symbol from the nearest lexical scope.
   * @param symbol - Symbol shape used for name and kind matching.
   * @param includeMacro - Whether legacy lookups include declarations from macro branches.
   * @param out - Reusable output array.
   * @param callsiteBranch - Branch signature used for branch-aware visibility filtering.
   * @returns The supplied output array containing visible matches.
   */
  lookupAll(symbol: S, includeMacro = false, out: S[], callsiteBranch?: BranchSignature): S[] {
    out.length = 0;
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const symbolTable = this.stack[i];
      symbolTable._getSymbols(symbol, includeMacro, out, callsiteBranch);
      // Match `lookup`: lexical shadowing stops at the nearest scope, while branch/overload
      // alternatives inside that scope remain available for ambiguity checks.
      if (out.length > 0) break;
    }
    return out;
  }
}
