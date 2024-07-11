import { IPoolElement } from "@galacean/engine";

export class ShaderPosition implements IPoolElement {
  index: number;
  // #if _EDITOR
  line?: number;
  column?: number;
  // #endif

  setX(
    index: number,
    /** #if _EDITOR */
    line?: number,
    column?: number
    /** #endif */
  ) {
    this.index = index;
    /** #if _EDITOR */
    this.line = line;
    this.column = column;
    /** #endif */
  }

  dispose(): void {
    this.index = 0;
    this.line = 0;
    this.column = 0;
  }
}
