import { Vector2 } from "@galacean/engine-math";

/**
 * @internal
 */
export interface CharInfo {
  char: string;
  x: number;
  y: number;
  w: number;
  h: number;
  offsetX: number;
  offsetY: number;
  xAdvance: number;
  ascent: number;
  descent: number;
  index: number;
  data?: Uint8Array;
  uvs: Vector2[];
  bufferOffset?: Vector2;
}
