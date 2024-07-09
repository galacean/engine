import { IShaderPosition } from "@galacean/engine-design";

export class ShaderPosition implements IShaderPosition {
  index: number;
  // #if _EDITOR
  line?: number;
  column?: number;
  // #endif

  constructor(
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
}
