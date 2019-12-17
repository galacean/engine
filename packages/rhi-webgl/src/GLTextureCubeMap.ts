import { GLTexture } from "./GLTexture";
import { CubeMapFace } from "@alipay/o3-base";
import { GLRenderHardware } from "./GLRenderHardware";
import { TextureCubeMap } from "@alipay/o3-material";

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
    const config = this._config as TextureCubeMap;
    const images = config.images;
    let needGenerateMipmap = false;

    super.setPixelStore();
    for (let f = 0; f < CubeMapFace.length; f++) {
      for (let level = 0; level < images.length; level++) {
        if (config.needUpdateWholeTexture || config.needUpdateCubeTextureFace[f]) {
          config.needUpdateCubeTextureFace[f] = false;
          needGenerateMipmap = true;
          gl.texImage2D(CubeMapFace[f], level, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, images[level][f]);
        }
      }
    }
    if (needGenerateMipmap) {
      super.generateMipmap();
    }

    config.needUpdateWholeTexture = false;
  }
}
