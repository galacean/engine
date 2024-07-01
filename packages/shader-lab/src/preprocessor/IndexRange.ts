export interface Position {
  index: number;
  // #if _DEVELOPMENT
  line?: number;
  column?: number;
  // #endif
}

export interface IIndexRange {
  start: Position;
  end: Position;
}
