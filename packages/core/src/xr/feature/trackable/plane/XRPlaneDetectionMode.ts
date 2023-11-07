/**
 * Enumerates valid modes of plane to detect.
 */
export enum XRPlaneDetectionMode {
  /** Plane detection is disabled. */
  None = 0,
  /** Plane detection will only detect horizontal planes. */
  Horizontal = 0b1,
  /** Plane detection will only detect vertical planes. */
  Vertical = 0b10,
  /** Plane detection will detect both horizontal and vertical planes. */
  EveryThing = 0b11
}
