/**
 * Wrapping mode of the texture.
 */
export enum TextureWrapMode {
  /** Clampping mode. use the color of edge pixels beyond the texture boundary. */
  Clamp = 0,
  /** Repeating mode. tiling will be repeated if it exceeds the texture boundary. */
  Repeat = 1,
  /** Mirror repeat mode. tiling will be mirrored and repeated if it exceeds the texture boundary. */
  Mirror = 2
}
