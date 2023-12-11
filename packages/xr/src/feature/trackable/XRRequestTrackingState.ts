/**
 * @internal
 * Enum for the state of a request to track a trackable.
 */
export enum XRRequestTrackingState {
  None,
  Submitted,
  Resolved,
  Rejected,
  Destroyed,
  WaitingDestroy
}
