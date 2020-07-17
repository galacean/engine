import { WebGLRenderer } from "./WebGLRenderer";
import { GLTexture } from "./GLTexture";

/**
 * GL CubeMap 资源管理
 * @private
 */
export class GLTextureCubeMap extends GLTexture {
  constructor(rhi: WebGLRenderer, config) {
    super(rhi, config, rhi.gl.TEXTURE_CUBE_MAP);
  }

  /**
   * 绑定到指定的texture index
   * @private
   */
  activeBinding(textureIndex) {
    super.activeBinding(textureIndex);
  }
}
