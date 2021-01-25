/**
 * Blend operation function.
 * @remarks defines how a new pixel is combined with a pixel.
 */
export enum BlendOperation {
  /** src + dst. */
  Add,
  /** src - dst. */
  Subtract,
  /** dst - src. */
  ReverseSubtract,
  /** Minimum of source and destination. */
  Min,
  /** Maximum of source and destination. */
  Max
}
