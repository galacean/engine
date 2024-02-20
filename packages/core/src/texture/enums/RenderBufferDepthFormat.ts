/**
 * @deprecated Please use `TextureFormat` instead.
 * 
 * Render buffer depth format enumeration.
 */
export enum RenderBufferDepthFormat {
  /** Render to depth buffer,engine will automatically select the supported precision. */
  Depth = 27,
  /** Render to stencil buffer. */
  Stencil = 28,
  /** Render to depth stencil buffer, engine will automatically select the supported precision. */
  DepthStencil = 29,

  /** Force 16-bit depth buffer. */
  Depth16 = 30,
  /** Force 24-bit depth buffer. */
  Depth24 = 31,
  /** Force 32-bit depth buffer. */
  Depth32 = 32,
  /** Force 16-bit depth + 8-bit stencil buffer. */
  Depth24Stencil8 = 33,
  /** Force 32-bit depth + 8-bit stencil buffer. */
  Depth32Stencil8 = 34
}
