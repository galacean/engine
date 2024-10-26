/**
 * Sprite Property Dirty Flag.
 */
export enum SpriteModifyFlags {
  texture = 0x1,
  size = 0x2,
  atlasRotate = 0x4,
  atlasRegion = 0x8,
  atlasRegionOffset = 0x10,
  region = 0x20,
  pivot = 0x40,
  border = 0x80,
  destroy = 0x100
}
