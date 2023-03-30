import { Vector2 } from "@oasis-engine/math";

/**
 * @internal
 */
export interface CharInfo {
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
}
