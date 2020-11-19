import { IPlatformRenderDepthTexture, Logger, RenderBufferDepthFormat, RenderDepthTexture } from "@oasis-engine/core";
import { GLTexture } from "./GLTexture";
import { WebGLRenderer } from "./WebGLRenderer";

export class GLRenderDepthTexture extends GLTexture implements IPlatformRenderDepthTexture {
  constructor(rhi: WebGLRenderer, texture: RenderDepthTexture) {
    super(rhi, texture, texture._isCube ? rhi.gl.TEXTURE_CUBE_MAP : rhi.gl.TEXTURE_2D);

    const { _format, _mipmap, width, height, _isCube } = texture;
    const isWebGL2 = this._isWebGL2;

    if (!GLTexture._supportRenderBufferDepthFormat(_format, rhi, true)) {
      throw new Error(`RenderBufferDepthFormat is not supported:${RenderBufferDepthFormat[_format]}`);
    }

    if (_isCube && width !== height) {
      throw new Error("The cube texture must have the same width and height");
    }

    if (_mipmap && !isWebGL2 && (!GLTexture._isPowerOf2(width) || !GLTexture._isPowerOf2(height))) {
      Logger.warn(
        "non-power-2 texture is not supported for mipmap in WebGL1,and has automatically downgraded to non-mipmap"
      );
      texture._mipmap = false;
    }

    this._formatDetail = GLTexture._getRenderBufferDepthFormatDetail(_format, this._gl, isWebGL2);
    this._initMipmap(_isCube);
  }
}
