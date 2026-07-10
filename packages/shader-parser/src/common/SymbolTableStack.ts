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
   * explicitly, opting in per site. This keeps redefinition checks (`FunctionDefinition`, global
   * `variable_declaration`) on the pre-branch legacy semantics — critical for the `#ifndef X_INCLUDED
   * / #define X_INCLUDED` include-guard pattern, where two textual copies of a chunk sit in the
   * same syntactic branch but only one runs at runtime.
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

  insert(symbol: S): boolean {
    return this.scope.insert(symbol, this.isInMacroBranch, this._currentBranch);
  }

  lookup(symbol: S, includeMacro = false, callsiteBranch?: BranchSignature): S | undefined {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const symbolTable = this.stack[i];
      const result = symbolTable.getSymbol(symbol, includeMacro, callsiteBranch);
      if (result) return result;
    }
    return undefined;
  }

  lookupAll(symbol: S, includeMacro = false, out: S[], callsiteBranch?: BranchSignature): S[] {
    out.length = 0;
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const symbolTable = this.stack[i];
      symbolTable._getSymbols(symbol, includeMacro, out, callsiteBranch);
    }
    return out;
  }
}
