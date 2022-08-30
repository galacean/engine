/**
 * Determines which type of shadows should be used.
 */
export enum ShadowMode {
  /** Disable Shadows. */
  None,
  /** Hard Shadows Only. */
  Hard,
  /** Cast "soft" shadows (with 4x PCF filtering). */
  SoftLow,
  /** Cast "soft" shadows (with 9x PCF filtering). */
  SoftHigh
}
