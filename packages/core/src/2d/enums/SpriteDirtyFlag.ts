/**
 * Sprite Dirty Flag.
 */
export enum SpriteDirtyFlag {
  none = 0x0,
  texture = 0x1,
  region = 0x2,
  pivot = 0x4,
  border = 0x8,
  atlas = 0x10,
  all = 0x1f
}
