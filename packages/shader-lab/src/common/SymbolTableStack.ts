import { IBaseSymbol } from "./IBaseSymbol";
import { SymbolTable } from "./SymbolTable";

export class SymbolTableStack<S extends IBaseSymbol, T extends SymbolTable<S>> {
  stack: T[] = [];

  /**
   * @internal
   */
  _macroLevel = 0;

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
  }

  popScope(): T | undefined {
    return this.stack.pop();
  }

  insert(symbol: S): void {
    this.scope.insert(symbol, this.isInMacroBranch);
  }

  lookup(symbol: S, includeMacro = false): S | undefined {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const symbolTable = this.stack[i];
      const result = symbolTable.getSymbol(symbol, includeMacro);
      if (result) return result;
    }
    return undefined;
  }

  lookupAll(symbol: S, includeMacro = false, out: S[]): S[] {
    out.length = 0;
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const symbolTable = this.stack[i];
      symbolTable._getSymbols(symbol, includeMacro, out);
    }
    return out;
  }
}
