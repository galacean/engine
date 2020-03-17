import { GLAsset } from "./GLAsset";
import { GLRenderHardware } from "./GLRenderHardware";
import { Texture } from "@alipay/o3-material";

/**
 * 管理贴图对象
 * @class
 * @private
 */
export class GLTexture extends GLAsset {
  protected _gl;
  private _glTexture: WebGLTexture;
  protected _config: Texture;
  protected _type;
  constructor(rhi: GLRenderHardware, config: Texture, type) {
    super(rhi, config);
    this._gl = rhi.gl;
    this._glTexture = rhi.gl.createTexture(); // WebGLTexture
    this._config = config;
    this._type = type;
  }

  /**
   * 内部的WebGLTexture对象
   * @readonly
   * @private
   */
  get glTexture() {
    return this._glTexture;
  }

  /**
   * 绑定到指定的 TEXTURE UNIT
   * @private
   */
  activeBinding(textureIndex) {
    const gl = this._gl;

    gl.activeTexture(gl.TEXTURE0 + textureIndex);
    gl.bindTexture(this._type, this._glTexture);
  }

  /**
   * gl.pixelStorei 相关操作，updateTexture 前进行
   * */
  setPixelStore() {
    const gl = this._gl;
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, +this._config.flipY);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, +this._config.premultiplyAlpha);
  }

  /**
   * 设置纹理参数
   * @private
   */
  setFilters() {
    const gl = this._gl;

    if (this._config.needUpdateFilers) {
      this._config.needUpdateFilers = false;
      gl.texParameteri(this._type, gl.TEXTURE_MAG_FILTER, this._config.filterMag);
      gl.texParameteri(this._type, gl.TEXTURE_MIN_FILTER, this._config.filterMin);
      gl.texParameteri(this._type, gl.TEXTURE_WRAP_S, this._config.wrapS);
      gl.texParameteri(this._type, gl.TEXTURE_WRAP_T, this._config.wrapT);
    }
  }

  /**
   * 生成纹理贴图
   * @private
   */
  generateMipmap() {
    if (this._config.canMipmap) {
      this._gl.generateMipmap(this._type);
    }
  }

  /**
   * 释放 GL 资源
   * @private
   */
  finalize() {
    const gl = this._gl;
    if (this._glTexture) {
      gl.deleteTexture(this._glTexture);
      this._glTexture = null;
    }
    this._config.resetState();
  }
}
