/**
 * Determines which type of shadows should be used.
 */
export enum ShadowType {
  /** Disable Shadows. */
  None,
  /** Hard Shadows Only. */
  Hard,
  /** Cast "soft" shadows with low range. */
  SoftLow,
  /** Cast "soft" shadows with large range. */
  SoftHigh
}
