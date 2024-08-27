import BaseScanner from "../common/BaseScanner";

export default class Scanner extends BaseScanner {
  constructor(source: string, kws: Map<string, number> = new Map()) {
    super(source, kws);
  }

  /**
   * split by space
   */
  scanWord(): string {
    this.skipCommentsAndSpace();
    const start = this._currentIndex;
    while (/\S/.test(this.getCurChar()) && !this.isEnd()) this._advance();
    return this._source.substring(start, this._currentIndex);
  }

  scanNumber(): number {
    this.skipCommentsAndSpace();
    const start = this._currentIndex;
    while (/[0-9]/.test(this.getCurChar())) this._advance();
    if (this.getCurChar() === ".") {
      this._advance();
      while (/[0-9]/.test(this.getCurChar())) this._advance();
    }
    return Number(this._source.substring(start, this._currentIndex));
  }

  scanToCharacter(char: string): void {
    while (this.getCurChar() !== char) {
      this._advance();
    }
    this._advance();
  }
}
