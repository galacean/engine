import { TextureCubeFace } from "../texture";

/**
 * Off-screen rendering target specification.
 */
export interface IPlatformRenderTarget {
  /**
   * Set which face and mipLevel of the cube texture to render to.
   * @param faceIndex - Cube texture face
   * @param mipLevel - Set mip level the data want to write
   */
  setRenderTargetInfo(faceIndex: TextureCubeFace, mipLevel: number): void;

  /**
   * Blit FBO.
   */
  blitRenderTarget(): void;

  /**
   * Destroy render target.
   */
  destroy(): void;
}
