export interface IVector3 {
  x: number;
  y: number;
  z: number;
}
export interface IVector2 {
  x: number;
  y: number;
}

export interface IVector4 {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface IColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * Legacy asset reference format used by material/animation loaders.
 * Scene/prefab v2 format uses AssetRef { $ref } from scene-format/types instead.
 */
export type IAssetRef = { key?: string; refId: string };
