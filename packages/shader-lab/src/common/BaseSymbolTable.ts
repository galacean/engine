export interface IBaseSymbol {
  readonly ident: string;
}

/**
 * The base class of `SymbolTable`
 */
export abstract class BaseSymbolTable<T extends IBaseSymbol = IBaseSymbol> {
  protected _table: Map<string, T[]> = new Map();

  abstract insert(sm: T): void;
  abstract lookup(identifier: string, type?: any): T | undefined;
}

export class SymbolTableStack<S extends IBaseSymbol, T extends BaseSymbolTable<S>> {
  stack: T[] = [];

  get _scope() {
    return this.stack[this.stack.length - 1];
  }

  pushScope(scope: T) {
    this.stack.push(scope);
  }

  clear() {
    this.stack.length = 0;
  }

  popScope() {
    this.stack.pop();
  }

  insert(sm: S) {
    this._scope.insert(sm);
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
