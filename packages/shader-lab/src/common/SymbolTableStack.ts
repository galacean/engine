import { BaseSymbolTable } from "./BaseSymbolTable";
import { IBaseSymbol } from "./IBaseSymbol";

export class SymbolTableStack<S extends IBaseSymbol, T extends BaseSymbolTable<S>> {
  stack: T[] = [];

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
    this.scope.insert(symbol);
  }

  lookup(identifier: string, type?: any): S | undefined {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const symbolTable = this.stack[i];
      const result = symbolTable.lookup(identifier, type);
      if (result) return result;
    }
    return undefined;
  }
}
