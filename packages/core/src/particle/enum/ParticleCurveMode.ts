/**
 * The particle curve mode.
 */
export enum ParticleCurveMode {
  /** Use a single constant for the MinMaxCurve. */
  Constant,
  /** Use a single curve for the MinMaxCurve. */
  Curve,
  /** Use a random value between 2 constants for the MinMaxCurve. */
  TwoConstants,
  /** Use a random value between 2 curves for the MinMaxCurve. */
  TwoCurves
}
