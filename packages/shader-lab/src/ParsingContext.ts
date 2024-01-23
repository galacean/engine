/** @internal */
export interface IPositionOffset {
  /** Offset of the first character of the Token. 0-indexed. */
  index: number;
  line: number;
}

/** @internal */
export default class ParsingContext {
  private _parseString: string;
  get parseString(): string {
    return this._parseString;
  }

  private _positionOffsetList: IPositionOffset[] = [];
  get positionOffsetList() {
    return this._positionOffsetList;
  }

  constructor(input: string) {
    this._parseString = input;
  }

  balanceGroups(title: string) {
    let balance = 0;
    let start = -1;
    let end = -1;
    let line = 0;
    for (let i = 0; i < this._parseString.length; i++) {
      if (this._parseString.substring(i, i + title.length) === title) {
        start = i;
      }
      if (start < 0) continue;

      if (this._parseString[i] === "{") {
        balance++;
      } else if (this._parseString[i] === "}") {
        if (--balance === 0) {
          end = i + 1;
          break;
        }
      } else if (this._parseString[i] === "\n") {
        line++;
      }
    }
    if (start >= 0) return { start, end, line };
  }

  filterString(title: string) {
    let range = this.balanceGroups(title);
    if (range) {
      this._parseString = this._parseString.slice(0, range.start) + this._parseString.slice(range.end);
      this._positionOffsetList.push({ index: range.start, line: range.line });
    }
  }

  getTextLineOffsetAt(index: number) {
    let offset = 0;
    for (const item of this._positionOffsetList) {
      if (index >= item.index) {
        offset += item.line;
      }
    }
    return offset;
  }
}
