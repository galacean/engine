/** Vertical alignment mode. */
export enum VerticalAlignmentMode {
  /** No vertical alignment. */
  None = 0,
  /** Top-aligned, `alignTop` drives `position.y`. */
  Top = 0x1,
  /** Bottom-aligned, `alignBottom` drives `position.y`. */
  Bottom = 0x2,
  /** Vertical stretch, `alignTop` and `alignBottom` drive `position.y` and `size.y`. */
  TopAndBottom = 0x3,
  /** Middle-aligned, `alignMiddle` drives `position.y`. */
  Middle = 0x4
}
