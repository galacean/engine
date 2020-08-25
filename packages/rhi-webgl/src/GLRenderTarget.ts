import { GLAsset } from "./GLAsset";
import { WebGLRenderer } from "./WebGLRenderer";
import { RenderTarget } from "@alipay/o3-core";

/**
 * GL 层的 RenderTarget 资源管理和渲染调用处理
 * @class
 * @private
 */
export class GLRenderTarget extends GLAsset {
  private readonly renderTarget: RenderTarget;

  constructor(rhi: WebGLRenderer, renderTarget: RenderTarget) {
    super(rhi, renderTarget);

    this.renderTarget = renderTarget;
  }

  /**
   * 激活 RenderTarget 对象，后续的内容将会被渲染到当前激活 RenderTarget 对象上
   * @private
   */
  public activeRenderTarget() {
    const gl = this.rhi.gl;
    const { width, height } = this.renderTarget;

    this.renderTarget._activeRenderTarget();
    gl.viewport(0.0, 0.0, width, height);
  }

  /**
   * 设置渲染到立方体纹理的面
   * @param {number} faceIndex - gl.TEXTURE_CUBE_MAP_POSITIVE_X + faceIndex
   * */
  public setRenderTargetFace(faceIndex: number) {
    this.renderTarget._setRenderTargetFace(faceIndex);
  }

  /** blit FBO */
  blitRenderTarget() {
    if (this.renderTarget._MSAAFrameBuffer) {
      this.renderTarget._blitRenderTarget();
      return;
    }
  }

  /**
   * 释放 GL 资源
   * @private
   */
  finalize() {}
}
