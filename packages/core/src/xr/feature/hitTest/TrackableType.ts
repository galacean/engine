/**
 * Enum for the types of hit test that can be performed.
 * Note: currently only supports plane.
 */
export enum TrackableType {
  /** None */
  None = 0,
  /** Tracked plane. */
  Plane = 0x1,
  /** All tracked objects. */
  All = 0x1
}
