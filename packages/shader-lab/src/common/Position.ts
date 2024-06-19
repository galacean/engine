export default class Position {
  index: number;
  // #if _DEBUG
  line: number;
  column: number;
  // #endif

  constructor(
    index: number,
    // #if _DEBUG
    line: number,
    column: number
    // #endif
  ) {
    this.index = index;
    // #if _DEBUG
    this.line = line;
    this.column = column;
    // #endif
  }

  /** @returns new position with offset */
  offset(count: number) {
    return new Position(
      this.index + count,
      // #if _DEBUG
      this.line,
      this.column + count
      // #endif
    );
  }

  // #if _DEBUG
  toString() {
    return `Pos<line ${this.line}, column ${this.column}, index ${this.index}>`;
  }
  // #endif
}
