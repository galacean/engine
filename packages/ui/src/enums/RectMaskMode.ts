/** Area retained by a RectMask2D. Nested masks intersect their retained areas. */
export enum RectMaskMode {
  /** Keep the rectangle interior. */
  Inside = 0,
  /** Keep the exterior of the rectangle. */
  Outside = 1
}
