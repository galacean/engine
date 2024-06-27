import { BaseToken } from "../Token";
import { EPpKeyword, EPpToken } from "./constants";

type PpTokenType = EPpToken | EPpKeyword;

export default class PpToken<T extends PpTokenType = PpTokenType> extends BaseToken<T> {
  /** The length of lexeme */
  get length() {
    return this.lexeme.length;
  }

  // #if _DEVELOPMENT
  override toString() {
    return `<${EPpKeyword[this.type] ?? EPpToken[this.type]}, ${this.lexeme}>`;
  }
  // #endif
}

export const EOF = new PpToken(EPpToken.EOF, "/EOF");
