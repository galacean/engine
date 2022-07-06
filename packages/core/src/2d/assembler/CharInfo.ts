import { Texture2D } from "../../texture";

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
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  ascent: number;
  descent: number;
}

/**
 * @internal
 */
export interface CharInfoWithTexture {
  texture: Texture2D;
  charInfo: CharInfo;
}
