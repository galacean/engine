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
  private static _isWhiteSpaceChar(char: string, includeBreak: boolean): boolean {
    if (char === " " || char === "\t") {
      return true;
    }
    return includeBreak && (char === "\n" || char === "\r");
  }

  protected _currentIndex = 0;
  protected _source: string;

  // #if _VERBOSE
  protected _column = 0;
  protected _line = 0;
  // #endif

  get current(): number {
    return this._currentIndex;
  }

  get source(): string {
    return this._source;
  }

  getCurPosition(): ShaderPosition {
    return ShaderLab.createPosition(
      this._currentIndex,
      // #if _VERBOSE
      this._line,
      this._column
      // #endif
    );
  }

  // #if _VERBOSE
  get line() {
    return this._line;
  }

  get column() {
    return this._column;
  }
  // #endif

  constructor(source: string) {
    this._source = source;
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

  advance(count = 1): void {
    // #if _VERBOSE
    for (let i = 0; i < count; i++) {
      this._advance();
    }
    // #else
    this._currentIndex += count;
    // #endif
  }

  _advance(): void {
    // #if _VERBOSE
    if (this.getCurChar() === "\n") {
      this._line += 1;
      this._column = 0;
    } else {
      this._column += 1;
    }
    // #endif

    this._currentIndex++;
  }

  skipSpace(includeLineBreak: boolean): void {
    let curChar = this.getCurChar();
    while (BaseLexer._isWhiteSpaceChar(curChar, includeLineBreak)) {
      this._advance();
      curChar = this.getCurChar();
    }
  }

  skipCommentsAndSpace(): void {
    this.skipSpace(true);
    if (this.peek(2) === "//") {
      // Single line comments
      this.advance(2);
      let curChar = this.getCurChar();
      while (curChar !== "\n" && curChar !== "\r" && !this.isEnd()) {
        this._advance();
        curChar = this.getCurChar();
      }
      this.skipCommentsAndSpace();
    } else if (this.peek(2) === "/*") {
      // Multi-line comments
      this.advance(2);
      while (this.peek(2) !== "*/" && !this.isEnd()) {
        this._advance();
      }
      this.advance(2);
      this.skipCommentsAndSpace();
    }
  }

  peek(to: number): string {
    const offset = this._currentIndex;
    return this._source.substring(offset, offset + to);
  }

  scanText(text: string): void {
    this.skipCommentsAndSpace();
    const length = text.length;
    const peek = this.peek(length);
    if (peek !== text) {
      this.throwError(this.getCurPosition(), `Expect text "${text}", but got "${peek}"`);
    }
    this.advance(length);
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
      this.scanText(left);
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
