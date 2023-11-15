/**
 * Enum for XR tracked update flag.
 */
export enum XRTrackedUpdateFlag {
  /** The object that was not tracked in the previous frame was tracked in this frame. */
  Added,
  /** Both the previous frame and this frame are tracked */
  Updated,
  /** The object that was tracked in the previous frame is not tracked in this frame. */
  Removed
}
