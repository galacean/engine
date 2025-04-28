/**
 * The anti-aliasing mode.
 */
export enum AntiAliasing {
  /* Disable anti-aliasing. */
  None,
  /* Fast approximate anti-aliasing, it detects and smooths jagged edges based on luminance contrast in the final rendered image. */
  FXAA
}
