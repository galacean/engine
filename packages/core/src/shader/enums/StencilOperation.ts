/**
 * Stencil operation mode.
 * @remarks sets the front and/or back-facing stencil test actions.
 */
export enum StencilOperation {
  /** Keeps the current value. */
  Keep,
  /** Sets the stencil buffer value to 0. */
  Zero,
  /** Sets the stencil buffer value to the reference value. */
  Replace,
  /** Increments the current stencil buffer value. Clamps to the maximum representable unsigned value. */
  IncrementSaturate,
  /** Decrements the current stencil buffer value. Clamps to 0. */
  DecrementSaturate,
  /** Inverts the current stencil buffer value bitwise. */
  Invert,
  /** Increments the current stencil buffer value. Wraps stencil buffer value to zero when incrementing the maximum representable unsigned value. */
  IncrementWrap,
  /** Decrements the current stencil buffer value. Wraps stencil buffer value to the maximum representable unsigned value when decrementing a stencil buffer value of 0. */
  DecrementWrap
}
