/**
 * Texture mapping mode for trails.
 */
export enum TrailTextureMode {
  /** Map the texture once along the entire length of the trail. */
  Stretch = 0,
  /** Repeat the texture along the trail based on its length in world units. */
  Tile = 1
}

