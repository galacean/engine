/**
 * The way to handle the situation where wrapped text is too tall to fit in the height.
 */
export enum TextVerticalOverflow {
  /** Overflow when the text is too tall */
  Overflow = 0,
  /** Truncate with height when the text is too tall */
  Truncate = 1
}
