/**
 * Select how gradients will be evaluated.
 */
export enum GradientMode {
  /** Find the 2 keys adjacent to the requested evaluation time, and linearly interpolate between them to obtain a blended color. */
  Blend = 0,
  /** Return a fixed color, by finding the first key whose time value is greater than the requested evaluation time. */
  Fixed = 1
}
