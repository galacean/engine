/**
 * Sprite's tiling mode enumeration.
 * Only works in `SpriteDrawMode.tiled` mode.
 */
export enum SpriteTileMode {
  /** SpriteRenderer will tile continuously. */
  Continuous,
  /** When the fractional part of the tiling multiple is greater than or equal to `SpriteRenderer.tileStretchValue`,
   * a tile will be added，and the number of tiles can only be an integer. */
  Adaptive
}
