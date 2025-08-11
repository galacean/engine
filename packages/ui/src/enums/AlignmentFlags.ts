/**
 * Horizontal alignment flags used by UITransform widget.
 */
export enum HorizontalAlignmentFlags {
  /** No horizontal alignment (position.x and size.x are not driven by widget). */
  None = 0,
  /** Align to parent's left edge; uses `left` margin. */
  Left = 0x1,
  /** Align to parent's right edge; uses `right` margin. */
  Right = 0x2,
  /** Stretch between left/right; uses `left` & `right` margins to derive width; position anchored by left. */
  LeftAndRight = 0x3,
  /** Align to parent's center horizontally; uses `center` offset (px). */
  Center = 0x4
}

/**
 * Vertical alignment flags used by UITransform widget.
 */
export enum VerticalAlignmentFlags {
  /** No vertical alignment (position.y and size.y are not driven by widget). */
  None = 0,
  /** Align to parent's top edge; uses `top` margin. */
  Top = 0x1,
  /** Align to parent's bottom edge; uses `bottom` margin. */
  Bottom = 0x2,
  /** Stretch between top/bottom; uses `top` & `bottom` margins to derive height; position anchored by bottom. */
  TopAndBottom = 0x3,
  /** Align to parent's center vertically; uses `middle` offset (px). */
  Middle = 0x4
}
