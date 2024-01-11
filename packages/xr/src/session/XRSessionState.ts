/**
 * The state of an XRSession.
 */
export enum XRSessionState {
  /** Not initialized. */
  None,
  /** Initialized but not started. */
  Initialized,
  /** Running. */
  Running,
  /** Paused. */
  Paused
}
