import { PositionTicker } from "./PositionTicker";
import { TextToken } from "./TextToken";

/** @internal */
export class Tokenizer {
  static readonly splitterRegex = /[^#\w.]/;

  private _text: string;
  private _posTicker: PositionTicker;
  private _scanningChars: string[] = [];

  private _scannedToken?: TextToken;

  constructor(text: string) {
    this._text = text;
    this._posTicker = new PositionTicker(text.length);
  }

  get curChar() {
    return this._text[this._posTicker.index];
  }

  get curIndex() {
    return this._posTicker.index;
  }

  scanChunk(terminator: ChunkTerminator, opts?: Partial<IScanningChunkOptions>): IScanningResult<string> {
    this._scanningChars.length = 0;
    const terminate = () => {
      if (typeof terminator === "string") {
        return terminator === this.curChar;
      }
      return terminator(this.curChar);
    };

    let spacing = true;
    while (this.scanTick() && !terminate()) {
      // Ignore comments
      if (this._text.substring(this._posTicker.index, this._posTicker.index + 2) === "//") break;
      if (opts?.skipHeadingSpace && spacing && /\s/.test(this.curChar)) continue;

      spacing = false;
      this._scanningChars.push(this.curChar);
    }

    if (opts?.keepTerminator && !this._posTicker.isEnd()) this._scanningChars.push(this.curChar);
    return { res: this._scanningChars.join(""), end: this._posTicker.isEnd() };
  }

  scanToken(): IScanningResult<TextToken> {
    this._scanningChars.length = 0;
    if (this._scannedToken) {
      const token = this._scannedToken;
      this._scannedToken = undefined;
      return { res: token, end: this._posTicker.isEnd() };
    }

    while (true) {
      this.scanTick();
      if (this._posTicker.isEnd()) break;

      if (Tokenizer.splitterRegex.test(this.curChar)) {
        return { res: this.getToken(), end: this._posTicker.isEnd() };
      } else {
        this._scanningChars.push(this.curChar);
      }
    }
    return { res: this.getToken(), end: true };
  }

  /**
   * Left & right char must be splitter
   */
  scanTokenBetweenPair(leftChar: string, rightChar: string): IScanningResult<TextToken[]> {
    while (this.curChar !== leftChar) {
      if (!/\s/.test(this.curChar))
        throw `Unexpected character "${this.curChar}" at line ${this._posTicker.line}, column ${this._posTicker.character}`;
      this.scanTick();
    }
    let level = 1;
    const res: TextToken[] = [];

    while (level > 0) {
      const { res: token, end } = this.scanToken();
      if (end) return { res, end };
      if (token) res.push(token);
      if (this.curChar === leftChar) level++;
      else if (this.curChar === rightChar) level--;
    }
    return { res, end: this._posTicker.isEnd() };
  }

  scanChunkBetweenPair(leftChar: string, rightChar: string): IScanningResult<TextToken> {
    while (this.curChar !== leftChar) {
      if (!/\s/.test(this.curChar))
        throw `Unexpected character "${this.curChar}" at line ${this._posTicker.line}, column ${this._posTicker.character}`;
      this.scanTick();
    }
    const start = this._posTicker.toPosition();
    let level = 1;
    const res: string[] = [];

    while (true) {
      if (!this.scanTick()) return { end: true };
      if (this.curChar === leftChar) {
        if (leftChar === rightChar) level--;
        else level++;
      } else if (this.curChar === rightChar) level--;
      if (level === 0) break;
      res.push(this.curChar);
    }
    const end = this._posTicker.toPosition(1);
    return { res: new TextToken(res.join(""), start, end), end: this._posTicker.isEnd() };
  }

  splitBy(separator: string) {
    const ret: TextToken[] = [];
    this._scanningChars.length = 0;
    let lvl = 0;
    while (this.scanTick()) {
      if (this.curChar === "(") lvl++;
      else if (this.curChar === ")") lvl--;

      if (this.curChar === separator && lvl === 0) {
        ret.push(this.getToken());
      } else {
        this._scanningChars.push(this.curChar);
      }
    }
    const remain = this.getToken();
    if (remain) ret.push(remain);

    return ret;
  }

  private getToken(): TextToken | undefined {
    if (this._scanningChars.length) {
      const token = this._scanningChars.join("");
      const end = this._posTicker.toPosition();
      const start = this._posTicker.toPosition(-this._scanningChars.length);

      this._scanningChars.length = 0;

      return new TextToken(token, start, end);
    }
  }

  private scanTick() {
    return this._posTicker.tick(this.curChar === "\n");
  }
}
