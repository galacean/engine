/**
 *  The current phase of the pointer.
 */
export enum PointerPhase {
  /** A Pointer pressed on the screen. */
  Down,
  /** A pointer moved on the screen. */
  Move,
  /** A Pointer pressed on the screen but hasn't moved. */
  Stationary,
  /** A pointer was lifted from the screen. */
  Up,
  /** The system cancelled tracking for the pointer. */
  Leave
}
