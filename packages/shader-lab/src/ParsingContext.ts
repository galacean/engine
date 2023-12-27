import { IPosition } from "./ast-node";

export interface IPositionOffset {
  /** Offset of the first character of the Token. 0-indexed. */
  index: number;
  line: number;
}

export default class ParsingContext {
  static editorPropertiesRegex = /EditorProperties\s+\{[^}]*?\}\s*/;
  static editorMacrosRegex = /EditorMacros\s+\{[^}]*?\}\s*/;

  private _parseString: string;
  get parseString(): string {
    return this._parseString;
  }

  constructor(input: string) {
    this._parseString = input;
  }

  private _positionOffsetList: IPositionOffset[] = [];
  get positionOffsetList() {
    return this._positionOffsetList;
  }

  filterString(regex: RegExp) {
    const matched = this._parseString.match(regex);
    if (matched) {
      const index = matched.index;
      const content = matched[0];
      let line = 0;
      for (let i = 0; i < content.length; i++) {
        if (content.charAt(i) === "\n") line++;
      }
      const curOffset = { index, line };
      this._positionOffsetList.push(curOffset);

      this._parseString =
        this._parseString.slice(0, curOffset.index) + this._parseString.slice(curOffset.index + matched[0].length);
    }
  }

  getTextLinenOffsetAt(index: number) {
    let offset = 0;
    for (const item of this._positionOffsetList) {
      if (index >= item.index) {
        offset += item.line;
      }
    }
    return offset;
  }
}
