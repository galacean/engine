/**
 * The way to handle the situation where the text is too wide to fit in the width.
 */
export enum TextHorizontalOverflow {
  /** Overflow when the text is too wide */
  Overflow = 0,
  /** wrap with width when the text is too wide */
  Wrap = 1
}

/**
 * The way to handle the situation where wrapped text is too tall to fit in the height.
 */
export enum TextVerticalOverflow {
  /** Overflow when the text is too tall */
  Overflow = 0,
  /** Truncate with height when the text is too tall */
  Truncate = 1
}
