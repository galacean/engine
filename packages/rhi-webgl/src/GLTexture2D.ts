import GLTexture from "./GLTexture";

/**
 * GL 2D贴图资源管理
 * @private
 */
export class GLTexture2D extends GLTexture {
  constructor({ gl }, config) {
    super(gl, config, gl.TEXTURE_2D);
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
    if (config.updateWholeTexture && config.image) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, config.image);

      super.generateMipmap();
      config.updateWholeTexture = false;
    } else if (config.updateSubRects.length > 0) {
      for (let i = config.updateSubRects.length - 1; i >= 0; i--) {
        this.updateSubTexture(gl, config, config.updateSubRects[i], config.updateSubImageData[i]);
      }
      super.generateMipmap();
      config.updateSubRects = [];
      config.updateSubImageData = [];
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
