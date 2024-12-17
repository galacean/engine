import { ETokenType, ShaderRange, ShaderPosition } from ".";
import { ShaderLab } from "../ShaderLab";
import { ParserUtils } from "../Utils";
import { BaseToken } from "./BaseToken";

export type OnToken = (token: BaseToken, scanner: BaseScanner) => void;

export default class BaseScanner {
  private static _spaceCharsWithBreak = [" ", "\t", "\n"];
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

  // #if _EDITOR
  protected _column = 0;
  protected _line = 0;
  // #endif

  get current(): number {
    return this._currentIndex;
  }

  get source(): string {
    return this._source;
  }

  get curPosition(): ShaderPosition {
    return ShaderLab.createPosition(
      this._currentIndex,
      // #if _EDITOR
      this._column,
      this._line
      // #endif
    );
  }

  protected readonly _keywordsMap: Map<string, number>;

  constructor(source: string, kws: Map<string, number> = new Map()) {
    this._source = source;
    this._keywordsMap = kws;
  }

  isEnd(): boolean {
    return this._currentIndex >= this._source.length;
  }

  getCurChar(): string {
    return this._source[this._currentIndex];
  }

  advance(count = 1): void {
    for (let i = 0; i < count; i++) {
      this._advance();
    }
  }

  /**
   * @internal
   */
  _advance(): void {
    if (this.isEnd()) {
      return;
    }

    this._currentIndex++;

    // #if _EDITOR
    if (this.getCurChar() === "\n") {
      this._line += 1;
      this._column = 0;
    } else {
      this._column += 1;
    }
    // #endif
  }

  skipSpace(includeLineBreak: boolean): void {
    const spaceChars = includeLineBreak ? BaseScanner._spaceCharsWithBreak : BaseScanner._spaceChars;
    let curChar = this.getCurChar();

    while (BaseScanner._checkIsIn(curChar, spaceChars)) {
      this._advance();
      curChar = this.getCurChar();
    }
  }

  skipCommentsAndSpace(): ShaderRange | undefined {
    this.skipSpace(true);
    if (this.peek(2) === "//") {
      const start = this.curPosition;
      this.advance(2);
      // single line comments
      while (this.getCurChar() !== "\n" && !this.isEnd()) this._advance();
      this.skipCommentsAndSpace();
      return ShaderLab.createRange(start, this.curPosition);
    } else if (this.peek(2) === "/*") {
      const start = this.curPosition;
      this.advance(2);
      //  multi-line comments
      while (this.peek(2) !== "*/" && !this.isEnd()) this._advance();
      this.advance(2);
      this.skipCommentsAndSpace();
      return ShaderLab.createRange(start, this.curPosition);
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
      ParserUtils.throw(this._currentIndex, `Expect ${text}, got ${peek}`);
    }
    this.advance(text.length);
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

  scanToken(onToken?: OnToken, splitCharRegex = /\w/) {
    this.skipCommentsAndSpace();
    const start = this.curPosition;
    if (this.isEnd()) return;
    while (splitCharRegex.test(this.getCurChar()) && !this.isEnd()) this._advance();
    const end = this.curPosition;

    if (start.index === end.index) {
      this._advance();
      const token = BaseToken.pool.get();
      token.set(ETokenType.NOT_WORD, this._source[start.index], start);
      onToken?.(token, this);
      return token;
    }

    const lexeme = this._source.substring(start.index, end.index);
    const tokenType = this._keywordsMap.get(lexeme) ?? ETokenType.ID;
    const range = ShaderLab.createRange(start, end);
    const token = BaseToken.pool.get();
    token.set(tokenType, lexeme, range);
    onToken?.(token, this);
    return token;
  }
}
