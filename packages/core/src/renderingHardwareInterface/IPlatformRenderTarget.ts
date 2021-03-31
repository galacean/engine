import { TextureCubeFace } from "../texture";

/**
 * Off-screen rendering target specification.
 */
export interface IPlatformRenderTarget {
  /**
   * Set which face of the cube texture to render to.
   * @param faceIndex - Cube texture face
   */
  setRenderTargetFace(faceIndex: TextureCubeFace): void;

  /**
   * Blit FBO.
   */
  blitRenderTarget(): void;

  /**
   * Destroy render target.
   */
  destroy(): void;
}
