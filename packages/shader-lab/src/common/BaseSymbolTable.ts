export interface IBaseSymbol {
  readonly ident: string;
}

/**
 * The base class of `SymbolTable`
 */
export abstract class BaseSymbolTable<T extends IBaseSymbol = IBaseSymbol> {
  /** @internal */
  _table: Map<string, T[]> = new Map();

  abstract insert(sm: T): void;
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
}
