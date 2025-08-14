import { IBaseSymbol } from "./IBaseSymbol";
import { SymbolTable } from "./SymbolTable";

export class SymbolTableStack<S extends IBaseSymbol, T extends SymbolTable<S>> {
  stack: T[] = [];

  /**
   * @internal
   */
  _isInMacroBranch = false;

  get scope(): T {
    return this.stack[this.stack.length - 1];
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
    this.scope.insert(symbol, this._isInMacroBranch);
  }

  lookup(symbol: S, includeMacro = false): S | undefined {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const symbolTable = this.stack[i];
      const result = symbolTable.getSymbol(symbol, includeMacro);
      if (result) return result;
    }
    return undefined;
  }
}
