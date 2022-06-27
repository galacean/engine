/**
 * Camera clear flags enumeration.
 */
export enum CameraClearFlags {
  /* Do nothing. */
  None = 0,
  /* Clear color only. */
  Color = 1,
  /* Clear depth only. */
  Depth = 2,
  /* Clear depth only. */
  Stencil = 4,

  /* Clear color and depth from background. */
  ColorDepth = 3,
  /* Clear color and stencil from background. */
  ColorStencil = 5,
  /* Clear depth and stencil from background. */
  DepthStencil = 6,

  /** Clear stencil, depth and color from background. */
  All = 7
}
