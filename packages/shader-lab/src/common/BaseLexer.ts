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
  private static _spaceCharsWithBreak = [" ", "\t", "\n", "\r"];
  private static _spaceChars = [" ", "\t"];
  private static _checkIsIn(checked: string, chars: string[]): boolean {
    for (let i = 0; i < chars.length; i++) {
      if (checked === chars[i]) {
        return true;
      }
      continue;
    }
    return false;
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
    const spaceChars = includeLineBreak ? BaseLexer._spaceCharsWithBreak : BaseLexer._spaceChars;
    let curChar = this.getCurChar();

    while (BaseLexer._checkIsIn(curChar, spaceChars)) {
      this._advance();
      curChar = this.getCurChar();
    }
  }

  skipCommentsAndSpace(): ShaderRange | undefined {
    this.skipSpace(true);
    if (this.peek(2) === "//") {
      const start = this.getCurPosition();
      this.advance(2);
      // single line comments
      let curChar = this.getCurChar();
      while (curChar !== "\n" && curChar !== "\r" && !this.isEnd()) {
        this._advance();
        curChar = this.getCurChar();
      }
      this.skipCommentsAndSpace();
      return ShaderLab.createRange(start, this.getCurPosition());
    } else if (this.peek(2) === "/*") {
      const start = this.getCurPosition();
      this.advance(2);
      //  multi-line comments
      while (this.peek(2) !== "*/" && !this.isEnd()) this._advance();
      this.advance(2);
      this.skipCommentsAndSpace();
      return ShaderLab.createRange(start, this.getCurPosition());
    }
  }

  peek(to: number): string {
    const offset = this._currentIndex;
    return this._source.substring(offset, offset + to);
  }

  scanText(text: string) {
    this.skipCommentsAndSpace();
    const peek = this.peek(text.length);
    if (peek !== text) {
      this.throwError(this.getCurPosition(), `Expect text "${text}", but got "${peek}"`);
    }
    this.advance(text.length);
  }

  throwError(pos: ShaderPosition | ShaderRange, ...msgs: any[]) {
    const error = ShaderLabUtils.createGSError(msgs.join(" "), GSErrorName.ScannerError, this._source, pos);
    // #if _VERBOSE
    Logger.error(error!.toString());
    // #endif
    throw error;
  }

  scanPairedText(left: string, right: string, balanced = false, skipLeading = false) {
    if (!skipLeading) {
      this.scanText(left);
    }
    const start = this._currentIndex;
    let level = balanced ? 1 : 0;
    while (this.peek(right.length) !== right || level !== 0) {
      if (this.isEnd()) return;
      if (balanced) {
        if (this.peek(left.length) === left) {
          level += 1;
          this.advance(left.length);
          continue;
        } else if (this.peek(right.length) === right) {
          level -= 1;
          if (level === 0) break;
          this.advance(right.length);
          continue;
        }
      }
      this.advance(right.length);
    }
    this.advance(right.length);
    return this._source.substring(start, this._currentIndex - right.length);
  }

  abstract scanToken(onToken?: OnToken): void;
}
