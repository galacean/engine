/**
 * Render buffer depth format enumeration.
 */
export enum RenderBufferDepthFormat {
  /** Render to depth buffer,engine will automatically select the supported precision. */
  Depth = 0,
  /** Render to depth stencil buffer, engine will automatically select the supported precision. */
  DepthStencil = 1,
  /** Render to stencil buffer. */
  Stencil = 2,

  /** Force 16-bit depth buffer. */
  Depth16 = 3,
  /** Force 24-bit depth buffer. */
  Depth24 = 4,
  /** Force 32-bit depth buffer. */
  Depth32 = 5,
  /** Force 16-bit depth + 8-bit stencil buffer. */
  Depth24Stencil8 = 6,
  /** Force 32-bit depth + 8-bit stencil buffer. */
  Depth32Stencil8 = 7
}
