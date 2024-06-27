import BaseScanner from "../BaseScanner";

export default class Scanner extends BaseScanner {
  constructor(source: string) {
    super(source, "ShaderStructScanner");
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
}
