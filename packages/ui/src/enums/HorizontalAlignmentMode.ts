/** Horizontal alignment mode. */
export enum HorizontalAlignmentMode {
  /** No horizontal alignment. */
  None = 0,
  /** Left-aligned, `alignLeft` drives `position.x`. */
  Left = 0x1,
  /** Right-aligned, `alignRight` drives `position.x`. */
  Right = 0x2,
  /** Horizontal stretch, `alignLeft` and `alignRight` drive `position.x` and `size.x`. */
  LeftAndRight = 0x3,
  /** Center-aligned, `alignCenter` drives `position.x`. */
  Center = 0x4
}
