import { WebGLRenderer } from "./WebGLRenderer";
import { GLTexture } from "./GLTexture";

/**
 * GL 2D贴图资源管理
 * @private
 */
export class GLTexture2D extends GLTexture {
  constructor(rhi: WebGLRenderer, config) {
    super(rhi, config, rhi.gl.TEXTURE_2D);
  }

  /**
   * 绑定到指定的texture index
   * @private
   */
  activeBinding(textureIndex) {
    super.activeBinding(textureIndex);
  }
}
