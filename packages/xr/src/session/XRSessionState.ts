/**
 * The state of an XRSession.
 */
export enum XRSessionState {
  /** Not initialized. */
  None,
  /** Initializing session. */
  Initializing,
  /** Initialized but not started. */
  Initialized,
  /** Running. */
  Running,
  /** Paused. */
  Paused
}
