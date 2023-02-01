/**
 * Sprite's tiling mode enumeration.
 * Only works in `SpriteDrawMode.tiled` mode.
 */
export enum SpriteTileMode {
  /** SpriteRenderer will tile continuously. */
  Continuous,
  /** When the size of the intermediate expansion is greater than or equal to `SpriteRenderer._tileStretchValue`, 
   * a tile will be added，and the number of tiles can only be an integer. */ 
  Adaptive
}
