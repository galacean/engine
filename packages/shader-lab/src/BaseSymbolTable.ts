import { Logger } from "./Logger";

export interface IBaseSymbol {
  ident: string;
}

/**
 * The base class of `SymbolTable`
 */
export abstract class BaseSymbolTable<T extends IBaseSymbol> {
  private _table: Map<string, T[]> = new Map();
  private _logger: Logger;

  constructor(name?: string) {
    this._logger = new Logger(name ?? "SymbolTable");
  }

  /**
   * Check the equality of two symbol.
   */
  abstract symbolEqualCheck(s1: T, s2: T): boolean;

  insert(sm: T) {
    const entry = this._table.get(sm.ident) ?? [];
    for (const item of entry) {
      if (this.symbolEqualCheck(item, sm)) {
        this._logger.error("Redefined symbol:", sm.ident);
        return;
      }
    }
    entry.push(sm);
    this._table.set(sm.ident, entry);
  }

  lookup(sm: T) {
    const entry = this._table.get(sm.ident) ?? [];
    for (const item of entry) {
      if (this.symbolEqualCheck(item, sm)) return item;
    }
  }
}

export class SymbolTableStack<T extends IBaseSymbol> {
  private _stack: BaseSymbolTable<T>[] = [];

  private get _scope() {
    return this._stack[this._stack.length - 1];
  }

  newScope(scope: BaseSymbolTable<T>) {
    this._stack.push(scope);
  }

  dropScope() {
    this._stack.pop();
  }

  insert(sm: T) {
    this._scope.insert(sm);
  }

  lookup(sm: T) {
    return this._scope.lookup(sm);
  }
}
