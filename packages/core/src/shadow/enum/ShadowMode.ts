/**
 * Determines which type of shadows should be used.
 */
export enum ShadowMode {
  /** Disable Shadows. */
  None,
  /** Hard Shadows Only. */
  Hard,
  /** Cast "soft" shadows (with bi-linear interpolation). */
  Soft,
  /** Cast "soft" shadows (with bi-linear PCF filtering). */
  VerySoft
}
