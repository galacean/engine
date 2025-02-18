import { IPoolElement } from "@galacean/engine";

export class ShaderPosition implements IPoolElement {
  index: number;
  // #if _VERBOSE
  line: number;
  column: number;
  // #endif

  set(
    index: number,
    // #if _VERBOSE
    line: number,
    column: number
    // #endif
  ) {
    this.index = index;
    // #if _VERBOSE
    this.line = line;
    this.column = column;
    // #endif
  }

  dispose(): void {
    this.index = 0;
    // #if _VERBOSE
    this.line = 0;
    this.column = 0;
    // #endif
  }
}
