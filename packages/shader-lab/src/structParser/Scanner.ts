import BaseScanner from "../common/BaseScanner";

export default class Scanner extends BaseScanner {
  constructor(source: string, kws: Map<string, number> = new Map()) {
    super(source, "ShaderStructScanner", kws);
  }

  /**
   * split by space
   */
  scanWord(): string {
    this.skipCommentsAndSpace();
    const start = this._current;
    while (/\S/.test(this.curChar()) && !this.isEnd()) this._advance();
    return this._source.substring(start, this._current);
  }

  scanNumber(): number {
    this.skipCommentsAndSpace();
    const start = this._current;
    while (/[0-9]/.test(this.curChar())) this._advance();
    if (this.curChar() === ".") {
      this._advance();
      while (/[0-9]/.test(this.curChar())) this._advance();
    }
    return Number(this._source.substring(start, this._current));
  }
}
