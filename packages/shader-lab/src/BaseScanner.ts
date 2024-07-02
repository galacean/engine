import BaseError from "./BaseError";
import { BaseToken } from "./BaseToken";
import { IIndexRange, Position, ETokenType } from "./common";

export type OnToken = (token: BaseToken, scanner: BaseScanner) => void;

export default class BaseScanner extends BaseError {
  protected _current = 0;
  get current() {
    return this._current;
  }

  // #if _DEVELOPMENT
  protected _column = 0;
  protected _line = 0;
  // #endif

  protected _source: string;
  get source() {
    return this._source;
  }

  get curPosition(): Position {
    return {
      index: this._current,
      // #if _DEVELOPMENT
      column: this._column,
      line: this._line
      // #endif
    };
  }

  protected readonly _keywordsMap: Map<string, number>;

  constructor(source: string, name?: string, kws: Map<string, number> = new Map()) {
    super(name ?? "BaseScanner");
    this._source = source;
    this._keywordsMap = kws;
  }

  isEnd() {
    return this._current >= this._source.length;
  }

  curChar() {
    return this._source[this._current];
  }

  advance(count = 1) {
    for (let i = 0; i < count; i++) {
      this._advance();
    }
  }

  _advance() {
    if (this.isEnd()) return;
    // #if _DEVELOPMENT
    if (this.curChar() === "\n") {
      this._line += 1;
      this._column = 0;
    } else {
      this._column += 1;
    }
    // #endif
    this._current++;
  }

  skipSpace(includeLineBreak = true) {
    const spaces = includeLineBreak ? [" ", "\t", "\n"] : [" ", "\t"];
    while (spaces.indexOf(this.curChar()) != -1) {
      this._advance();
    }
  }

  skipCommentsAndSpace(): IIndexRange | undefined {
    this.skipSpace();
    if (this.peek(2) === "//") {
      const start = this.curPosition;
      this.advance(2);
      // single line comments
      while (this.curChar() !== "\n") this._advance();
      this.skipCommentsAndSpace();
      return { start, end: this.curPosition };
    } else if (this.peek(2) === "/*") {
      const start = this.curPosition;
      this.advance(2);
      //  multi-line comments
      while (this.peek(2) !== "*/" && !this.isEnd()) this._advance();
      this.advance(2);
      this.skipCommentsAndSpace();
      return { start, end: this.curPosition };
    }
  }

  peek(to = 1, from = 0) {
    return this._source.substring(this._current + from, this._current + to + from);
  }

  scanText(text: string) {
    this.skipCommentsAndSpace();
    const peek = this.peek(text.length);
    if (peek !== text) {
      this.throw(this._current, `Expect ${text}, got ${peek}`);
    }
    this.advance(text.length);
  }

  scanPairedText(left: string, right: string, balanced = false, skipLeading = false) {
    if (!skipLeading) {
      this.scanText(left);
    }
    const start = this._current;
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
    return this._source.substring(start, this._current - right.length);
  }

  scanToken(onToken?: OnToken, splitCharRegex = /\w/) {
    this.skipCommentsAndSpace();
    const start = this.curPosition;
    if (this.isEnd()) return;
    while (splitCharRegex.test(this.curChar()) && !this.isEnd()) this._advance();
    const end = this.curPosition;

    if (start.index === end.index) {
      this._advance();
      const token = new BaseToken(ETokenType.NOT_WORD, this._source[start.index], start);
      onToken?.(token, this);
      return token;
    }

    const lexeme = this._source.substring(start.index, end.index);
    const tokenType = this._keywordsMap.get(lexeme) ?? ETokenType.ID;
    const token = new BaseToken(tokenType, lexeme, { start, end });
    onToken?.(token, this);
    return token;
  }
}
