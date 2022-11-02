/**
 * Define the compare mode of depth texture.
 */
export enum TextureDepthCompareFunction {
  /** never pass. */
  Never,
  /** pass if the compare value is less than the sample value. */
  Less,
  /** pass if the compare value equals the sample value. */
  Equal,
  /** pass if the compare value is less than or equal to the sample value. */
  LessEqual,
  /** pass if the compare value is greater than the sample value. */
  Greater,
  /** pass if the compare value is not equal to the sample value. */
  NotEqual,
  /** pass if the compare value is greater than or equal to the sample value. */
  GreaterEqual,
  /** always pass. */
  Always
}
