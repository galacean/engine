export class ShaderPosition {
  index: number;
  line: number;
  column: number;

  set(index: number, line: number, column: number) {
    this.index = index;
    this.line = line;
    this.column = column;
  }
}
