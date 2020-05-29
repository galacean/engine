import { CubeMapFace, Logger } from "@alipay/o3-base";
import { CompressedTextureCubeMap } from "@alipay/o3-compressed-texture";
import { TextureCubeMap } from "@alipay/o3-material";
import { GLRenderHardware } from "./GLRenderHardware";
import { GLTexture } from "./GLTexture";

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
    let config = this._config as TextureCubeMap;
    if (config.isCompressed) {
      this.updateCompressedTexture();
    } else {
      const images = config.images;
      if (config.needUpdateWholeTexture || config.needUpdateCubeTextureFace.includes(true)) {
        super.setPixelStore();
        for (let f = 0; f < CubeMapFace.length; f++) {
          for (let level = 0; level < images.length; level++) {
            if (config.needUpdateWholeTexture || config.needUpdateCubeTextureFace[f]) {
              config.needUpdateCubeTextureFace[f] = false;
              gl.texImage2D(CubeMapFace[f], level, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, images[level][f]);
            }
          }
        }
        super.generateMipmap();
      }
      if (!config._isReadable) {
        config._images = null;
      }
    }

    config.needUpdateWholeTexture = false;
  }

  /**
   * 更新压缩纹理内容
   * @private
   */
  private updateCompressedTexture() {
    const gl = this._gl;
    const compressedConfig = this._config as CompressedTextureCubeMap;
    const mipmapsFaces = compressedConfig.mipmapsFaces;
    if (compressedConfig.needUpdateWholeTexture || compressedConfig.needUpdateCubeTextureFace.includes(true)) {
      if (!this.rhi.canIUseCompressedTextureInternalFormat(compressedConfig.internalFormat)) {
        Logger.warn("GLTextureCubeMap: Attempt to load unsupport compressed texture format");
      }
      super.setPixelStore();
      for (let f = 0; f < CubeMapFace.length; f++) {
        if (compressedConfig.needUpdateWholeTexture || compressedConfig.needUpdateCubeTextureFace[f]) {
          const mipmapsFace = mipmapsFaces[f];
          for (let level = 0; level < mipmapsFace.length; level++) {
            const mipmap = mipmapsFace[level];
            gl.compressedTexImage2D(
              CubeMapFace[f],
              level,
              compressedConfig.internalFormat,
              mipmap.width,
              mipmap.height,
              0,
              mipmap.data
            );
          }
          compressedConfig.needUpdateCubeTextureFace[f] = false;
        }
      }
    }
  }
}
