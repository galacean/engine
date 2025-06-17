import { Logger } from "@galacean/engine";
import { TokenType } from "../common";
import { BaseSymbolTable } from "../common/BaseSymbolTable";
import { ShaderSourceSymbol } from "./ShaderSourceSymbol";

export default class ShaderSourceSymbolTable extends BaseSymbolTable<ShaderSourceSymbol> {
  override insert(sm: ShaderSourceSymbol): void {
    const entry = this._table.get(sm.ident) ?? [];
    for (let i = 0; i < entry.length; i++) {
      if (entry[i].type === sm.type) {
        Logger.warn("replace symbol:", sm.ident);
        entry[i] = sm;
        return;
      }
    }
    entry.push(sm);
    this._table.set(sm.ident, entry);
  }

  lookup(ident: string, type: TokenType): ShaderSourceSymbol | undefined {
    const entry = this._table.get(ident);
    if (entry) {
      for (let length = entry.length, i = 0; i < length; i++) {
        const item = entry[i];
        if (item.type === type) return item;
      }
    }
  }
}
