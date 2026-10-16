/**
 * Mutable zero-based source position used by the parser.
 * @internal
 */
export class ShaderPosition {
  /** Zero-based UTF-16 source offset. */
  index: number;
  /** Zero-based source line. */
  line: number;
  /** Zero-based source column. */
  column: number;

  /**
   * Replaces the position coordinates.
   * @param index - Zero-based UTF-16 source offset.
   * @param line - Zero-based source line.
   * @param column - Zero-based source column.
   * @internal
   */
  set(index: number, line: number, column: number): void {
    this.index = index;
    this.line = line;
    this.column = column;
  }
}
