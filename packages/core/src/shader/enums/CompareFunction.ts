/**
 * Depth/Stencil comparison function.
 * @remarks Specifies a function that compares incoming pixel depth/stencil to the current depth/stencil buffer value.
 */
export enum CompareFunction {
  /** never pass. */
  Never,
  /** pass if the incoming value is less than the depth/stencil buffer value. */
  Less,
  /** pass if the incoming value equals the depth/stencil buffer value. */
  Equal,
  /** pass if the incoming value is less than or equal to the depth/stencil buffer value. */
  LessEqual,
  /** pass if the incoming value is greater than the depth/stencil buffer value. */
  Greater,
  /** pass if the incoming value is not equal to the depth/stencil buffer value. */
  NotEqual,
  /** pass if the incoming value is greater than or equal to the depth/stencil buffer value. */
  GreaterEqual,
  /** always pass. */
  Always
}
