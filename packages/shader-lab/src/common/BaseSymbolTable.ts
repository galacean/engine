import { Logger } from "@galacean/engine";
import { GalaceanDataType } from "./types";

export interface IBaseSymbol {
  readonly ident: string;
}

/**
 * The base class of `SymbolTable`
 */
export abstract class BaseSymbolTable<T extends IBaseSymbol = IBaseSymbol> {
  protected _table: Map<string, T[]> = new Map();

  /**
   * Check the equality of two symbol.
   */
  abstract symbolEqualCheck(exist: T, newSymbol: T): boolean;

  insert(sm: T) {
    const entry = this._table.get(sm.ident) ?? [];
    for (let i = 0; i < entry.length; i++) {
      if (this.symbolEqualCheck(entry[i], sm)) {
        Logger.warn("replace symbol:", sm.ident);
        entry[i] = sm;
        return;
      }
    }
    entry.push(sm);
    this._table.set(sm.ident, entry);
  }

  lookup<R = T>(sm: T): R | undefined {
    const entry = this._table.get(sm.ident);
    if (entry) {
      for (let length = entry.length, i = 0; i < length; i++) {
        const item = entry[i];
        if (this.symbolEqualCheck(item, sm)) return item as unknown as R;
      }
    }
  }
}

export class SymbolTableStack<S extends IBaseSymbol, T extends BaseSymbolTable<S>> {
  private _stack: T[] = [];

  get _scope() {
    return this._stack[this._stack.length - 1];
  }

  newScope(scope: T) {
    this._stack.push(scope);
  }

  clear() {
    this._stack.length = 0;
  }

  dropScope() {
    this._stack.pop();
  }

  insert(sm: S) {
    this._scope.insert(sm);
  }

  lookup(sm: S) {
    for (let i = this._stack.length - 1; i >= 0; i--) {
      const scope = this._stack[i];
      const ret = scope.lookup(sm);
      if (ret) return ret;
    }
  }
}
