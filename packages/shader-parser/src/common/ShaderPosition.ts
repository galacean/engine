/** Mutable zero-based source position used by the parser. @internal */
export class ShaderPosition {
  index: number;
  line: number;
  column: number;

  /** Replaces the position coordinates. @internal */
  set(index: number, line: number, column: number): void {
    this.index = index;
    this.line = line;
    this.column = column;
  }
}
