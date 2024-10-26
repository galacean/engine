import { AssetType } from "../../asset/AssetType";
import { TextureFilterMode, TextureFormat, TextureWrapMode } from "../../texture";

/**
 * The original data type of the atlas.
 */
export interface AtlasConfig {
  mipmap?: boolean;
  wrapModeV?: TextureWrapMode;
  wrapModeU?: TextureWrapMode;
  filterMode?: TextureFilterMode;
  anisoLevel?: number;
  /** Version of Atlas. */
  version: number;
  /** Texture format. */
  format: TextureFormat;
  /** The sub atlas array, each sub atlas contains multiple sprites. */
  atlasItems: {
    /** The url of the sub atlas. */
    img: string;
    /** Image type. */
    type: AssetType;
    /** Sprites contained in the sub atlas. */
    sprites: AtlasSprite[];
  }[];
}

/**
 * The original data type of each sprite.
 */
export interface AtlasSprite {
  /** Temp solution. */
  id: number;
  /** The name the sprite. */
  name: string;
  /** Whether to rotate 90 degrees clockwise. */
  atlasRotated: boolean;
  /** The range of the sprites on the big picture. */
  atlasRegion: { x: number; y: number; w: number; h: number };
  /** If there is trimming, the size of the blank area on the four sides. */
  atlasRegionOffset: { x: number; y: number; z: number; w: number };
  region: { x: number; y: number; w: number; h: number };
  pivot: { x: number; y: number };
  border: { x: number; y: number; z: number; w: number };
  pixelsPerUnit: number;
  width: number;
  height: number;
}
