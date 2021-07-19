import { TextureFormat } from "../../texture";
import { SpriteMeshType } from "../enums/SpriteMeshType";

/**
 * The original data type of the atlas.
 */
export interface AtlasConfig {
  // The big picture array, each big picture contains multiple sprites.
  AtlasItems: {
    // The url of the big picture.
    img: string;
    // The size of the big picture.
    size: number[];
    // Sprites contained in the big picture.
    frames: { [key: string]: AtlasFrame };
  }[];
  // Version of Atlas Packaging Tool.
  version: number;
  // Texture format.
  format: TextureFormat;
}

/**
 * The original data type of each sprite.
 */
export interface AtlasFrame {
  // Sprite's mesh type.
  meshType: SpriteMeshType;
  // The original size of the sprite.
  sourceSize: { w: number; h: number };
  // The range of the sprites on the big picture
  atlasRegion: { x: number; y: number; w: number; h: number };
  // If there is trimming, the offset of the sprite relative to the original sprite.
  offset: { x: number; y: number };
  region: { x: number; y: number; w: number; h: number };
  pivot: { x: number; y: number };
  pixelsPerUnit: number;
  vertices: number[][];
  uv: number[][];
  triangles: number[];
}
