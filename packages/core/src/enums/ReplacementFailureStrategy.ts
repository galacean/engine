/**
 * The strategy to use when a shader replacement fails.
 */
export enum ReplacementFailureStrategy {
  /** Keep the original shader. */
  KeepOriginalShader,
  /** Do not render. */
  DoNotRender
}
