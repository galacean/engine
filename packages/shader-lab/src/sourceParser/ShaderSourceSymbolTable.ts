import { TokenType } from "../common";
import { BaseSymbolTable, IBaseSymbol } from "../common/BaseSymbolTable";

export interface ISymbol extends IBaseSymbol {
  type: number;
  value?: any;
}

export default class ShaderSourceSymbolTable extends BaseSymbolTable<ISymbol> {
  override insert(sm: ISymbol): void {
    const entry = this._table.get(sm.ident) ?? [];
    for (let i = 0; i < entry.length; i++) {
      if (entry[i].type === sm.type) {
        throw `Symbol ${sm.ident} already exists.`;
      }
    }
    entry.push(sm);
    this._table.set(sm.ident, entry);
  }

  lookup(ident: string, type: TokenType): ISymbol | undefined {
    const entry = this._table.get(ident);
    if (entry) {
      for (let length = entry.length, i = 0; i < length; i++) {
        const item = entry[i];
        if (item.type === type) return item;
      }
    }
  }
}
