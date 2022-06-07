/**
 * Sprite Dirty Flag.
 */
export enum SpriteDirtyFlag {
  none = 0x0,
  texture = 0x1,
  positions = 0x2,
  uvs = 0x4,
  uvsSliced = 0x8,
  all = 0xf
}
