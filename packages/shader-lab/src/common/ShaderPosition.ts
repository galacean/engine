import { IPoolElement } from "@galacean/engine";

export class ShaderPosition implements IPoolElement {
  index: number;
  line: number;
  column: number;

  set(index: number, line: number, column: number) {
    this.index = index;
    this.line = line;
    this.column = column;
  }

  dispose(): void {
    this.index = 0;
    this.line = 0;
    this.column = 0;
  }
}
