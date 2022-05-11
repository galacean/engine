/**
 * Render buffer depth format enumeration.
 */
export enum RenderBufferDepthFormat {
  /** Render to depth buffer,engine will automatically select the supported precision. */
  Depth,
  /** Render to depth stencil buffer, engine will automatically select the supported precision. */
  DepthStencil,
  /** Render to stencil buffer. */
  Stencil,

  /** Force 16-bit depth buffer. */
  Depth16,
  /** Force 24-bit depth buffer. */
  Depth24,
  /** Force 32-bit depth buffer. */
  Depth32,
  /** Force 16-bit depth + 8-bit stencil buffer. */
  Depth24Stencil8,
  /** Force 32-bit depth + 8-bit stencil buffer. */
  Depth32Stencil8
}
