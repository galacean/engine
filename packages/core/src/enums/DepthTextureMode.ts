/**
 * Depth texture mode.
 */
export enum DepthTextureMode {
  /* No depth texture. */
  None,
  /* Generate depth texture by pre-pass rendering. */
  PrePass
  // /* Generate depth texture by copy depth buffer after opaque pass. */
  // CopyAfterOpaque
}
