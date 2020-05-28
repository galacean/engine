import { GLCapabilityType, Logger } from "@alipay/o3-base";
import { CompressedTexture2D } from "@alipay/o3-compressed-texture";
import { Texture2D } from "@alipay/o3-material";
import { GLRenderHardware } from "./GLRenderHardware";
import { GLTexture } from "./GLTexture";

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
    const { isWebGL2 } = this.rhi;
    const config = this._config as Texture2D;
    const {
      isCompressed,
      needUpdateWholeTexture,
      updateSubRects,
      updateSubImageData,
      image,
      isFloat,
      isRaw,
      width,
      height
    } = config;
    if (!isCompressed) {
      if (needUpdateWholeTexture && image) {
        super.setPixelStore();
        /** 源数据 */
        if (isRaw) {
          if (isFloat) {
            if (!this.rhi.canIUse(GLCapabilityType.textureFloat)) {
              Logger.warn("监测到当前环境不支持浮点纹理！");
              return;
            } else {
              gl.texImage2D(
                gl.TEXTURE_2D,
                0,
                isWebGL2 ? gl.RGBA32F : gl.RGBA,
                width,
                height,
                0,
                gl.RGBA,
                gl.FLOAT,
                image
              );
            }
          } else {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, image);
          }
          /**  image */
        } else {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
          super.generateMipmap();
          if (!config._isReadable) {
            var img: HTMLImageElement = config._image;
            img.src = "";
            img.onload = null;
            img.onerror = null;
            config._image = null;
          }
        }

        config.needUpdateWholeTexture = false;
      } else if (updateSubRects && updateSubRects.length > 0) {
        super.setPixelStore();
        for (let i = updateSubRects.length - 1; i >= 0; i--) {
          this.updateSubTexture(gl, config, updateSubRects[i], updateSubImageData[i]);
        }
        super.generateMipmap();
        config.updateSubRects = [];
        config.updateSubImageData = [];
      }
      /** compressed */
    } else if (isCompressed && needUpdateWholeTexture) {
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
