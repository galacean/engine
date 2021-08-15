import { TextureFormat } from "../../texture";

/**
 * The original data type of the atlas.
 */
export interface AtlasConfig {
  /** Version of Atlas. */
  version: number;
  /** Texture format. */
  format: TextureFormat;
  /** The sub atlas array, each sub atlas contains multiple sprites. */
  atlasItems: {
    /** The url of the sub atlas. */
    img: string;
    /** Sprites contained in the sub atlas. */
    sprites: AtlasSprite[];
  }[];
}

/**
 * The original data type of each sprite.
 */
export interface AtlasSprite {
  /** The name the sprite. */
  name: string;
  /** The original size of the sprite. */
  originalSize: { w: number; h: number };
  /** Whether to rotate 90 degrees clockwise. */
  atlasRotated: boolean;
  /** The range of the sprites on the big picture. */
  atlasRegion: { x: number; y: number; w: number; h: number };
  /** If there is trimming, the offset of the sprite relative to the original sprite. */
  atlasRegionOffset: { x: number; y: number };
  region: { x: number; y: number; w: number; h: number };
  pivot: { x: number; y: number };
  pixelsPerUnit: number;
}
