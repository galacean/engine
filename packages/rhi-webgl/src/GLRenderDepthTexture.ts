import { IPlatformRenderDepthTexture, Logger, RenderBufferDepthFormat, RenderDepthTexture } from "@oasis-engine/core";
import { GLTexture } from "./GLTexture";
import { WebGLRenderer } from "./WebGLRenderer";

/**
 * The texture in WebGL platform is used for the output of depth information in off-screen rendering.
 */
export class GLRenderDepthTexture extends GLTexture implements IPlatformRenderDepthTexture {
  /**
   * Create render depth texture in WebGL platform.
   */
  constructor(rhi: WebGLRenderer, texture: RenderDepthTexture) {
    super(rhi, texture, texture.isCube ? rhi.gl.TEXTURE_CUBE_MAP : rhi.gl.TEXTURE_2D);

    /** @ts-ignore */
    const { format, _mipmap, width, height, isCube } = texture;
    const isWebGL2 = this._isWebGL2;

    if (!GLTexture._supportRenderBufferDepthFormat(format, rhi, true)) {
      throw new Error(`RenderBufferDepthFormat is not supported:${RenderBufferDepthFormat[format]}`);
    }

    if (isCube && width !== height) {
      throw new Error("The cube texture must have the same width and height");
    }

    if (_mipmap && !isWebGL2 && (!GLTexture._isPowerOf2(width) || !GLTexture._isPowerOf2(height))) {
      Logger.warn(
        "non-power-2 texture is not supported for mipmap in WebGL1,and has automatically downgraded to non-mipmap"
      );

      /** @ts-ignore */
      texture._mipmap = false;
      /** @ts-ignore */
      texture._mipmapCount = texture._getMipmapCount();
    }

    this._formatDetail = GLTexture._getRenderBufferDepthFormatDetail(format, this._gl, isWebGL2);
    this._initMipmap(isCube);
  }
}
