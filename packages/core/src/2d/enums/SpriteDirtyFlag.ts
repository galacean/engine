/**
 * Sprite Dirty Flag.
 */
export enum SpriteDirtyFlag {
  none = 0x0,
  texture = 0x1,
  region = 0x2,
  border = 0x4,
  atlas = 0x8,
  all = 0xf
}
