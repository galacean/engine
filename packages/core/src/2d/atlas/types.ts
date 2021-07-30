import { TextureFormat } from "../../texture";

/**
 * The original data type of the atlas.
 */
export interface AtlasConfig {
  /** The big picture array, each big picture contains multiple sprites. */
  atlasItems: {
    /** The url of the big picture. */
    img: string;
    /** The size of the big picture. */
    size: number[];
    /** Sprites contained in the big picture. */
    sprites: AtlasSprite[];
  }[];
  /** Version of Atlas */
  version: number;
  /** Texture format. */
  format: TextureFormat;
}

/**
 * The original data type of each sprite.
 */
export interface AtlasSprite {
  /** The name the sprite. */
  name: string;
  /** The original size of the sprite. */
  sourceSize: { w: number; h: number };
  /** The range of the sprites on the big picture */
  atlasRegion: { x: number; y: number; w: number; h: number };
  /** If there is trimming, the offset of the sprite relative to the original sprite. */
  atlasRegionOffset: { x: number; y: number };
  region: { x: number; y: number; w: number; h: number };
  pivot: { x: number; y: number };
  pixelsPerUnit: number;
  vertices: number[][];
  uv: number[][];
  triangles: number[];
}
