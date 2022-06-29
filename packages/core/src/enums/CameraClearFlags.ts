/**
 * Camera clear flags enumeration.
 */
export enum CameraClearFlags {
  /* Do nothing. */
  None = 0,
  /* Clear color with scene background. */
  Color = 1,
  /* Clear depth only. */
  Depth = 2,
  /* Clear depth only. */
  Stencil = 4,

  /* Clear color with scene background and depth. */
  ColorDepth = 3,
  /* Clear color with scene background and stencil. */
  ColorStencil = 5,
  /* Clear depth and stencil. */
  DepthStencil = 6,

  /* Clear color with scene background, depth, and stencil. */
  All = 7
}
