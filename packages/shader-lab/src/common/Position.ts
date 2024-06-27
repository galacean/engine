export default class Position {
  index: number;
  // #if _DEVELOPMENT
  line: number;
  column: number;
  // #endif

  constructor(
    index: number,
    // #if _DEVELOPMENT
    line: number,
    column: number
    // #endif
  ) {
    this.index = index;
    // #if _DEVELOPMENT
    this.line = line;
    this.column = column;
    // #endif
  }

  /** @returns new position with offset */
  offset(count: number) {
    return new Position(
      this.index + count,
      // #if _DEVELOPMENT
      this.line,
      this.column + count
      // #endif
    );
  }

  // #if _DEVELOPMENTMENT
  toString() {
    return `Pos<line ${this.line}, column ${this.column}, index ${this.index}>`;
  }
  // #endif
}
