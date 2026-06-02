import { ShaderPosition, ShaderRange } from ".";
import { GSErrorName } from "../GSError";
import { ShaderCompilerUtils } from "../ShaderCompilerUtils";
import { BaseToken } from "./BaseToken";

export type OnToken = (token: BaseToken, scanner: BaseLexer) => void;

/**
 * @internal
 */
export abstract class BaseLexer {
  static isDigit(charCode: number): boolean {
    return charCode >= 48 && charCode <= 57; // 0-9
  }

  static isHexDigit(charCode: number): boolean {
    return (
      (charCode >= 48 && charCode <= 57) || // 0-9
      (charCode >= 65 && charCode <= 70) || // A-F
      (charCode >= 97 && charCode <= 102) // a-f
    );
  }

  // Check if character is alphabetic or underscore (valid word start)
  static isAlpha(charCode: number): boolean {
    return (
      charCode === 95 || // _
      (charCode >= 65 && charCode <= 90) || // A-Z
      (charCode >= 97 && charCode <= 122) // a-z
    );
  }

  // Check if character is alphanumeric (alpha + digit)
  static isAlnum(charCode: number): boolean {
    return BaseLexer.isAlpha(charCode) || BaseLexer.isDigit(charCode);
  }

  static isPreprocessorStartChar(charCode: number): boolean {
    return charCode === 35; // #
  }

  /**
   * If `i` points at the start of a `/* … *\/` block comment, return the index
   * just past the closing `*\/`. Otherwise return `i` unchanged. If the
   * comment is unterminated, returns `len` (clamped, never overshoots).
   * Single source of truth for block-comment scanning across the lexer.
   */
  protected static _skipBlockComment(src: string, i: number, len: number): number {
    if (src.charCodeAt(i) !== 47 /* '/' */ || i + 1 >= len || src.charCodeAt(i + 1) !== 42 /* '*' */) return i;
    let j = i + 2;
    while (j + 1 < len) {
      if (src.charCodeAt(j) === 42 && src.charCodeAt(j + 1) === 47) return j + 2;
      j++;
    }
    return len;
  }

  /**
   * If `i` points at the start of a `//` line comment, return the index of the
   * terminating newline (or `len` at EOF). The newline itself is NOT consumed
   * — callers decide whether `\n` is whitespace or a logical separator.
   * Otherwise return `i` unchanged.
   */
  protected static _skipLineComment(src: string, i: number, len: number): number {
    if (src.charCodeAt(i) !== 47 /* '/' */ || i + 1 >= len || src.charCodeAt(i + 1) !== 47) return i;
    let j = i + 2;
    while (j < len) {
      const c = src.charCodeAt(j);
      if (c === 10 || c === 13) break;
      j++;
    }
    return j;
  }

  static isWhiteSpaceChar(charCode: number, includeBreak: boolean): boolean {
    // Space || Tab
    if (charCode === 32 || charCode === 9) {
      return true;
    }
    return includeBreak && (charCode === 10 || charCode === 13); // \n || \r
  }

  protected _currentIndex = 0;
  protected _source: string;

  protected _column = 0;
  protected _line = 0;

  get currentIndex(): number {
    return this._currentIndex;
  }

  get source(): string {
    return this._source;
  }

  get line() {
    return this._line;
  }

  get column() {
    return this._column;
  }

  constructor(source?: string) {
    this._source = source;
  }

  setSource(source: string): void {
    this._source = source;
    this._currentIndex = 0;
    this._line = this._column = 0;
  }

  getShaderPosition(backOffset = 0): ShaderPosition {
    return ShaderCompilerUtils.createPosition(this._currentIndex - backOffset, this._line, this._column - backOffset);
  }

  isEnd(): boolean {
    return this._currentIndex >= this._source.length;
  }

  getCurChar(): string {
    return this._source[this._currentIndex];
  }

  getCurCharCode(): number {
    return this._source.charCodeAt(this._currentIndex);
  }

  advance(count: number): void {
    const source = this._source;
    const startIndex = this._currentIndex;
    for (let i = 0; i < count; i++) {
      if (source[startIndex + i] === "\n") {
        this._line += 1;
        this._column = 0;
      } else {
        this._column += 1;
      }
    }
    this._currentIndex += count;
  }

  skipSpace(includeLineBreak: boolean): void {
    while (BaseLexer.isWhiteSpaceChar(this.getCurCharCode(), includeLineBreak)) {
      this.advance(1);
    }
  }

  skipCommentsAndSpace(): void {
    const source = this._source;
    const length = source.length;
    let index = this._currentIndex;

    while (index < length) {
      // Whitespace including newlines — `\n` is just a separator in the
      // top-level (non-directive) scan path.
      while (index < length && BaseLexer.isWhiteSpaceChar(source.charCodeAt(index), true)) {
        index++;
      }
      const afterBlock = BaseLexer._skipBlockComment(source, index, length);
      if (afterBlock !== index) {
        index = afterBlock;
        continue;
      }
      const afterLine = BaseLexer._skipLineComment(source, index, length);
      if (afterLine !== index) {
        index = afterLine;
        continue;
      }
      break;
    }

    this.advance(index - this._currentIndex);
  }

  peek(to: number): string {
    const offset = this._currentIndex;
    return this._source.substring(offset, offset + to);
  }

  scanLexeme(lexeme: string): void {
    this.skipCommentsAndSpace();
    const length = lexeme.length;
    const peek = this.peek(length);
    if (peek !== lexeme) {
      this.throwError(this.getShaderPosition(0), `Expect lexeme "${lexeme}", but got "${peek}"`);
    }
    this.advance(length);
  }

  scanTwoExpectedLexemes(lexeme1: string, lexeme2: string): string | null {
    this.skipCommentsAndSpace();

    // Check first lexeme
    if (this.peek(lexeme1.length) === lexeme1) {
      this.advance(lexeme1.length);
      return lexeme1;
    }

    // Check second lexeme
    if (this.peek(lexeme2.length) === lexeme2) {
      this.advance(lexeme2.length);
      return lexeme2;
    }

    return null;
  }

  throwError(pos: ShaderPosition | ShaderRange, ...msgs: any[]) {
    const error = ShaderCompilerUtils.createGSError(msgs.join(" "), GSErrorName.ScannerError, this._source, pos);
    console.error(error!.toString());
    throw error;
  }

  scanPairedChar(left: string, right: string, balanced: boolean, skipLeading: boolean): string {
    if (!skipLeading) {
      this.scanLexeme(left);
    }

    const start = this._currentIndex;
    const source = this._source;
    const sourceLength = source.length;

    let currentIndex = this._currentIndex;
    if (balanced) {
      let level = 1;
      while (currentIndex < sourceLength) {
        const currentChar = source[currentIndex];
        if (currentChar === right && --level === 0) {
          break;
        } else if (currentChar === left) {
          level++;
        }
        currentIndex++;
      }
    } else {
      while (currentIndex < sourceLength) {
        if (source[currentIndex] === right) {
          break;
        }
        currentIndex++;
      }
    }

    this.advance(currentIndex + 1 - this._currentIndex);

    return source.substring(start, currentIndex);
  }

  abstract scanToken(onToken?: OnToken): void;
}
