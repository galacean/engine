export default class Position {
  index: number;
  line: number;
  column: number;

  constructor(index: number, line: number, column: number) {
    this.index = index;
    this.line = line;
    this.column = column;
  }

  /** @returns new position with offset */
  offset(count: number) {
    return new Position(this.index + count, this.line, this.column + count);
  }

  toString() {
    return `Pos<line ${this.line}, column ${this.column}, index ${this.index}>`;
  }
}
