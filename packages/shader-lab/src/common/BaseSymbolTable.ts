import { Logger } from "../Logger";
import { GalaceanDataType } from "./types";

export interface IBaseSymbol {
  readonly ident: string;
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
  abstract symbolEqualCheck(exist: T, newSymbol: T): boolean;

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

  lookup<R = T>(sm: T & { signature?: GalaceanDataType[] }): R {
    const entry = this._table.get(sm.ident) ?? [];
    for (const item of entry) {
      if (this.symbolEqualCheck(item, sm)) return item as unknown as R;
    }
  }
}

export class SymbolTableStack<T extends IBaseSymbol> {
  private _stack: BaseSymbolTable<T>[] = [];

  get _scope() {
    return this._stack[this._stack.length - 1];
  }

  newScope(scope: BaseSymbolTable<T>) {
    this._stack.push(scope);
  }

  clear() {
    this._stack.length = 0;
  }

  dropScope() {
    this._stack.pop();
  }

  insert(sm: T) {
    this._scope.insert(sm);
  }

  lookup(sm: T & { signature?: GalaceanDataType[] }) {
    for (let i = this._stack.length - 1; i >= 0; i--) {
      const scope = this._stack[i];
      const ret = scope.lookup(sm);
      if (ret) return ret;
    }
  }
}
