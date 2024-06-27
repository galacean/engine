import { ETokenType, TokenType } from "../common/types";

export default class LexerUtils {
  static isNum(char: string) {
    return /\d/.test(char);
  }

  static isLetter(char: string) {
    return /\w/.test(char);
  }

  static isAlpha(char: string) {
    return /[a-zA-Z_]/.test(char);
  }

  static isNumOrLetter(char: string) {
    return /(\d|\w)/.test(char);
  }

  static isKeyword(tt: TokenType) {
    return tt < ETokenType.ID;
  }
}
