import { ETokenType, TokenType } from "../common/types";

export default class LexerUtils {
  static numRegex = /\d/;
  static letterRegex = /\w/;
  static alphaRegex = /[a-zA-Z_]/;
  static numOrLetterRegex = /(\d|\w)/;

  static isNum(char: string) {
    return this.numRegex.test(char);
  }

  static isLetter(char: string) {
    return this.letterRegex.test(char);
  }

  static isAlpha(char: string) {
    return this.alphaRegex.test(char);
  }

  static isNumOrLetter(char: string) {
    return this.numOrLetterRegex.test(char);
  }

  static isKeyword(tt: TokenType) {
    return tt < ETokenType.ID;
  }
}
