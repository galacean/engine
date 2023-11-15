/**
 * Enumerates modes of plane in XR.
 */
export enum XRPlaneMode {
  /** None. */
  None = 0,
  /** Horizontal */
  Horizontal = 0b1,
  /** Vertical */
  Vertical = 0b10,
  /** Includes horizontal and vertical. */
  EveryThing = 0b11
}
