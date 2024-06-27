import BaseError from "./BaseError";
import { BaseToken } from "./BaseToken";
import { IIndexRange } from "./preprocessor/IndexRange";

export default class BaseScanner extends BaseError {
  protected _current = 0;
  get current() {
    return this._current;
  }

  protected _source: string;
  get source() {
    return this._source;
  }

  constructor(source: string, name?: string) {
    super(name ?? "BaseScanner");
    this._source = source;
  }

  isEnd() {
    return this._current >= this._source.length;
  }

  curChar() {
    return this._source[this._current];
  }

  protected advance(count = 1) {
    this._current = Math.min(this._source.length, this._current + count);
  }

  protected _advance() {
    if (this.isEnd()) return;
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
      const start = this._current;
      this.advance(2);
      // single line comments
      while (this.curChar() !== "\n") this._advance();
      this.skipCommentsAndSpace();
      return { start, end: this._current };
    } else if (this.peek(2) === "/*") {
      const start = this._current;
      this.advance(2);
      //  multi-line comments
      while (this.peek(2) !== "*/" && !this.isEnd()) this._advance();
      this.advance(2);
      this.skipCommentsAndSpace();
      return { start, end: this._current };
    }
  }

  peek(to = 1) {
    return this._source.substring(this._current, this._current + to);
  }

  scanText(text: string) {
    this.skipCommentsAndSpace();
    const peek = this.peek(text.length);
    if (peek !== text) {
      this.throw(this._current, `Expected ${text}, got ${peek}.`);
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
}
