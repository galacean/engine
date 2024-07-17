/**
 * The state of an XRSession.
 */
export enum XRSessionState {
  /** Not initialized. */
  None,
  /** Requesting the session. */
  Requesting,
  /** Initialized but not started. */
  Initialized,
  /** Running. */
  Running,
  /** Paused. */
  Paused
}
