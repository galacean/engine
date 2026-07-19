/**
 * The way to handle the situation where the text is too large to fit in the bounds.
 */
export enum OverflowMode {
  /** Overflow when the text is too tall */
  Overflow = 0,
  /** Truncate with height when the text is too tall */
  Truncate = 1,
  /** Shrink the font size until the text fits within the bounds (both width and height) */
  Shrink = 2
}
