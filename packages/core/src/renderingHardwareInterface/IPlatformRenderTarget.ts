import { TextureCubeFace } from "../texture";

/**
 * Off-screen rendering target specification.
 */
export interface IPlatformRenderTarget {
  /**
   * Set which face and mipLevel of the cube texture to render to.
   * @param mipLevel - Set mip level the data want to write
   * @param faceIndex - Cube texture face
   */
  activeRenderTarget(mipLevel: number, faceIndex?: TextureCubeFace): void;

  /**
   * Blit FBO.
   * @param discardMSAA - When true, invalidates the MSAA read framebuffer attachments immediately after resolve
   */
  blitRenderTarget(discardMSAA?: boolean): void;

  /**
   * Destroy render target.
   */
  destroy(): void;
}
