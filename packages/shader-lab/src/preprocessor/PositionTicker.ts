/** @internal */
export class PositionTicker {
  private _line: number;
  get line() {
    return this._line;
  }
  private _character: number;
  get character() {
    return this._character;
  }
  private _index: number;
  get index() {
    return this._index;
  }
  private _tickEnd: number;

  constructor(tickEnd: number, position?: IPosition) {
    this._line = position?.line ?? 0;
    this._character = position?.character ?? -1;
    this._index = position?.index ?? -1;
    this._tickEnd = tickEnd;
  }

  tick(lineBreak: boolean) {
    if (this.isEnd()) return false;

    this._index++;
    if (lineBreak) {
      this._line++;
      this._character = 0;
    } else {
      this._character++;
    }
    return true;
  }

  isEnd() {
    return this._index >= this._tickEnd;
  }

  toPosition(offset = 0): IPosition {
    return { index: this._index + offset, character: this._character + offset, line: this._line };
  }
}
