import { TextureCubeFace } from "../texture";

/**
 * 离屏渲染目标规范。
 */
export interface IPlatformRenderTarget {
  /**
   * 激活 RenderTarget 对象
   * 如果开启 MSAA,则激活 MSAA FBO,后续进行 this._blitRenderTarget() 进行交换 FBO
   * 如果未开启 MSAA,则激活主 FBO
   */
  _activeRenderTarget(): void;

  /**
   * 设置渲染到立方体纹理的哪个面
   * @param faceIndex - 立方体纹理面
   */
  _setRenderTargetFace(faceIndex: TextureCubeFace): void;

  /**
   * Blit FBO.
   */
  _blitRenderTarget(): void;

  /**
   * 销毁。
   */
  destroy(): void;
}
