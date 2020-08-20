import { GLAsset } from "./GLAsset";
import { WebGLRenderer } from "./WebGLRenderer";
import { Texture } from "@alipay/o3-core";

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

  constructor(rhi: WebGLRenderer, config: Texture, type) {
    super(rhi, config);

    this._gl = rhi.gl;
    this._glTexture = config._glTexture;
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
   * 释放 GL 资源
   * @private
   */
  finalize() {}
}
