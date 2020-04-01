import { GLTexture } from "./GLTexture";
import { GLRenderHardware } from "./GLRenderHardware";
import { Texture2D } from "@alipay/o3-material";
import { CompressedTexture2D } from "@alipay/o3-compressed-texture";
import { Logger } from "@alipay/o3-base";

/**
 * GL 2D贴图资源管理
 * @private
 */
export class GLTexture2D extends GLTexture {
  constructor(rhi: GLRenderHardware, config) {
    super(rhi, config, rhi.gl.TEXTURE_2D);
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
    const config = this._config as Texture2D;

    if (!config.isCompressed) {
      if (config.needUpdateWholeTexture && config.image) {
        super.setPixelStore();
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, config.image);

        super.generateMipmap();
        config.needUpdateWholeTexture = false;
      } else if (config.updateSubRects && config.updateSubRects.length > 0) {
        super.setPixelStore();
        for (let i = config.updateSubRects.length - 1; i >= 0; i--) {
          this.updateSubTexture(gl, config, config.updateSubRects[i], config.updateSubImageData[i]);
        }
        super.generateMipmap();
        config.updateSubRects = [];
        config.updateSubImageData = [];
      }
    } else if (config.isCompressed && config.needUpdateWholeTexture) {
      const compressedConfig = config as CompressedTexture2D;
      if (!this.rhi.canIUseCompressedTextureInternalFormat(compressedConfig.internalFormat)) {
        Logger.warn("GLTexture2D: Attempt to load unsupport compressed texture format");
      }
      const mipmaps = compressedConfig.mipmaps;
      if (mipmaps) {
        super.setPixelStore();
        for (let i = 0; i < mipmaps.length; i++) {
          const mipmap = mipmaps[i];
          gl.compressedTexImage2D(
            gl.TEXTURE_2D,
            i,
            compressedConfig.internalFormat,
            mipmap.width,
            mipmap.height,
            0,
            mipmap.data
          );
        }
      }
      config.needUpdateWholeTexture = false;
    }
  }

  /**
   * 刷新指定区域的纹理
   * @param {object} textSubRect
   * @private
   */
  updateSubTexture(gl, texture, texSubRect, texSubImageData) {
    const imageData =
      texSubImageData || texture.getImageData(texSubRect.x, texSubRect.y, texSubRect.width, texSubRect.height);
    if (imageData) {
      gl.texSubImage2D(this._type, 0, texSubRect.x, texSubRect.y, gl.RGBA, gl.UNSIGNED_BYTE, imageData);
    }
  }
}
