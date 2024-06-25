import Position from "./Position";

export default class LocRange {
  readonly start: Position;
  readonly end: Position;

  constructor(start: Position, end: Position) {
    this.start = start;
    this.end = end;
  }

  // #if _DEVELOPMENT
  toString() {
    return `Loc<start: line ${this.start.line}, column ${this.start.column}; end: line ${this.end.line}, column ${this.end.column}>`;
  }
  // #endif
}
