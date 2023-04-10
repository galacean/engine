/**
 * Sprite's drawing mode enumeration.
 */
export enum SpriteDrawMode {
  /** Overall scaling when modifying size. */
  Simple,
  /** When modifying the size of the renderer, it scales to fill the range according to the sprite border settings. */
  Sliced,
  /** When modifying the size of the renderer, it will tile to fill the range according to the sprite border settings. */
  Tiled
}
