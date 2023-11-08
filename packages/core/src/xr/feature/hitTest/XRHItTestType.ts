/**
 * Enum for the types of hit test that can be performed.
 * Note: currently only supports plane.
 */
export enum XRHitTestType {
  /** None */
  None = 0,
  /** Tracked plane. */
  Plane = 0b1,
  /** Tracked mesh. */
  Mesh = 0b10,
  /** Tracked anchor. */
  Anchor = 0b100,
  /** All tracked objects. */
  All = 0b111
}
