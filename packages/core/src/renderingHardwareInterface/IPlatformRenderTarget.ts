import { TextureCubeFace } from "../texture";

/**
 * 离屏渲染目标规范。
 */
export interface IPlatformRenderTarget {
  /**
   * 设置渲染到立方体纹理的哪个面
   * @param faceIndex - 立方体纹理面
   */
  setRenderTargetFace(faceIndex: TextureCubeFace): void;

  /**
   * Blit FBO.
   */
  _blitRenderTarget(): void;

  /**
   * 销毁。
   */
  destroy(): void;
}
