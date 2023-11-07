/**
 * The state of an XRSession.
 */
export enum XRSessionState {
  /** Not initialized. */
  NotInitialized,
  /** Initialized but not started. */
  Initialized,
  /** Running. */
  Running,
  /** Paused. */
  Paused
}
