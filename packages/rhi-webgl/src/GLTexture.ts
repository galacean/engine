import { Texture } from "@oasis-engine/core";
import { WebGLRenderer } from "./WebGLRenderer";

/**
 * @private
 */
export class GLTexture {
  protected _gl;
  private _glTexture: WebGLTexture;
  protected _config: Texture;
  protected _type;

  constructor(rhi: WebGLRenderer, config: Texture, type) {
    this._gl = rhi.gl;
    this._glTexture = config._glTexture;
    this._config = config;
    this._type = type;
  }

  get glTexture() {
    return this._glTexture;
  }

  activeBinding(textureIndex) {
    const gl = this._gl;

    gl.activeTexture(gl.TEXTURE0 + textureIndex);
    gl.bindTexture(this._type, this._glTexture);
  }

  /**
   * Release gl resource.
   * @private
   */
  finalize() {}
}
