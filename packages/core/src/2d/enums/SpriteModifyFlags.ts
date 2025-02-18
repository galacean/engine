/**
 * Sprite Property Dirty Flag.
 */
export enum SpriteModifyFlags {
  /** The texture of sprite changes. */
  texture = 0x1,
  /** The size of sprite changes. */
  size = 0x2,
  /** The rotation of sprite changes. */
  atlasRotate = 0x4,
  /** The atlasRegion of sprite changes. */
  atlasRegion = 0x8,
  /** The atlasRegionOffset of sprite changes. */
  atlasRegionOffset = 0x10,
  /** The region of sprite changes. */
  region = 0x20,
  /** The pivot of sprite changes. */
  pivot = 0x40,
  /** The border of sprite changes. */
  border = 0x80,
  /** The sprite destroyed. */
  destroy = 0x100
}
