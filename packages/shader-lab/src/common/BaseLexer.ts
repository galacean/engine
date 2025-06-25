import { Logger } from "@galacean/engine";
import { ShaderPosition, ShaderRange } from ".";
import { GSErrorName } from "../GSError";
import { ShaderLab } from "../ShaderLab";
import { ShaderLabUtils } from "../ShaderLabUtils";
import { BaseToken } from "./BaseToken";

export type OnToken = (token: BaseToken, scanner: BaseLexer) => void;

/**
 * @internal
 */
export abstract class BaseLexer {
  static isDigit(charCode: number): boolean {
    return charCode >= 48 && charCode <= 57; // 0-9
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

  protected static _isWhiteSpaceChar(charCode: number, includeBreak: boolean): boolean {
    // Space || Tab
    if (charCode === 32 || charCode === 9) {
      return true;
    }
    return includeBreak && (charCode === 10 || charCode === 13); // \n || \r
  }

  protected _currentIndex = 0;
  protected _source: string;

  // #if _VERBOSE
  protected _column = 0;
  protected _line = 0;
  // #endif

  get currentIndex(): number {
    return this._currentIndex;
  }

  get source(): string {
    return this._source;
  }

  // #if _VERBOSE
  get line() {
    return this._line;
  }

  get column() {
    return this._column;
  }
  // #endif

  constructor(source?: string) {
    this._source = source;
  }

  setSource(source: string): void {
    this._source = source;
    this._currentIndex = 0;
    // #if _VERBOSE
    this._line = this._column = 0;
    // #endif
  }

  getShaderPosition(backOffset: number): ShaderPosition {
    return ShaderLab.createPosition(
      this._currentIndex - backOffset,
      // #if _VERBOSE
      this._line,
      this._column - backOffset
      // #endif
    );
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
    // #if _VERBOSE
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
    // #endif
    this._currentIndex += count;
  }

  skipSpace(includeLineBreak: boolean): void {
    while (BaseLexer._isWhiteSpaceChar(this.getCurCharCode(), includeLineBreak)) {
      this.advance(1);
    }
  }

  skipCommentsAndSpace(): void {
    const source = this._source;
    const length = source.length;
    let index = this._currentIndex;

    while (index < length) {
      // Skip whitespace
      while (index < length && BaseLexer._isWhiteSpaceChar(source.charCodeAt(index), true)) {
        index++;
      }

      // Check for comments: 47 is '/'
      if (index + 1 >= length || source.charCodeAt(index) !== 47) break;

      const nextChar = source.charCodeAt(index + 1);
      if (nextChar === 47) {
        // Single line comment: 10 is '\n', 13 is '\r'
        index += 2;
        while (index < length) {
          const charCode = source.charCodeAt(index);
          if (charCode === 10 || charCode === 13) break;
          index++;
        }
      } else if (nextChar === 42) {
        // Multi-line comment: 42 is '*'
        index += 2;
        while (index + 1 < length && !(source.charCodeAt(index) === 42 && source.charCodeAt(index + 1) === 47)) {
          index++;
        }
        index += 2; // Skip '*/'
      } else {
        break; // Not a comment, stop
      }
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
    const error = ShaderLabUtils.createGSError(msgs.join(" "), GSErrorName.ScannerError, this._source, pos);
    // #if _VERBOSE
    Logger.error(error!.toString());
    // #endif
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
