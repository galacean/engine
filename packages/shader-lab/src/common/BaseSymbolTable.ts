import { IBaseSymbol } from "./IBaseSymbol";

export abstract class BaseSymbolTable<T extends IBaseSymbol = IBaseSymbol> {
  protected _table: Map<string, T[]> = new Map();

  abstract insert(sm: T): void;
  abstract lookup(identifier: string, type?: any): T | undefined;
}
