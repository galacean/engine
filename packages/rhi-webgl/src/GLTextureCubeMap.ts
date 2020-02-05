import { GLTexture } from "./GLTexture";
import { CubeMapFace } from "@alipay/o3-base";
import { GLRenderHardware } from "./GLRenderHardware";

/**
 * GL CubeMap 资源管理
 * @private
 */
export class GLTextureCubeMap extends GLTexture {
  constructor(rhi: GLRenderHardware, config) {
    super(rhi, config, rhi.gl.TEXTURE_CUBE_MAP);
  }

  /**
   * 绑定到指定的texture index
   * @private
   */
  activeBinding(textureIndex) {
    super.activeBinding(textureIndex);
    // 刷新纹理
    this.updateTexture();
    super.setFilters();
  }

  /**
   * 更新纹理内容
   * @private
   */
  updateTexture() {
    const gl = this._gl;
    const config = this._config;
    const images = config.images;

    for (let f = 0; f < CubeMapFace.length; f++) {
      for (let level = 0; level < images.length; level++) {
        if (config.updateWholeTexture) {
          gl.texImage2D(CubeMapFace[f], level, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, images[level][f]);
        }
      }
    }
    if (config.updateWholeTexture) {
      super.generateMipmap();
    }

    config.updateWholeTexture = false;
  }
}
