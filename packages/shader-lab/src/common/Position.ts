export class Position {
  index: number;
  // #if _DEVELOPMENT
  line?: number;
  column?: number;
  // #endif

  constructor(
    index: number,
    /** #if _DEVELOPMENT */
    line?: number,
    column?: number
    /** #endif */
  ) {
    this.index = index;
    /** #if _DEVELOPMENT */
    this.line = line;
    this.column = column;
    /** #endif */
  }
}
