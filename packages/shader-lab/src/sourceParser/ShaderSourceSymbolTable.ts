import { TokenType } from "../common";
import { BaseSymbolTable } from "../common/BaseSymbolTable";
import { ShaderSourceSymbol } from "./ShaderSourceSymbol";

export default class ShaderSourceSymbolTable extends BaseSymbolTable<ShaderSourceSymbol> {
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
