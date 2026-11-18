import { TextureFormat } from "./TextureFormat";

/**
 * @deprecated Please use `TextureFormat` instead.
 *
 * Render buffer depth format enumeration.
 */
export enum RenderBufferDepthFormat {
  /** Render to depth buffer,engine will automatically select the supported precision. */
  Depth = TextureFormat.Depth,
  /** Render to stencil buffer. */
  Stencil = TextureFormat.Stencil,
  /** Render to depth stencil buffer, engine will automatically select the supported precision. */
  DepthStencil = TextureFormat.DepthStencil,

  /** Force 16-bit depth buffer. */
  Depth16 = TextureFormat.Depth16,
  /** Force 24-bit depth buffer. */
  Depth24 = TextureFormat.Depth24,
  /** Force 32-bit depth buffer. */
  Depth32 = TextureFormat.Depth32,
  /** Force 16-bit depth + 8-bit stencil buffer. */
  Depth24Stencil8 = TextureFormat.Depth24Stencil8,
  /** Force 32-bit depth + 8-bit stencil buffer. */
  Depth32Stencil8 = TextureFormat.Depth32Stencil8
}
