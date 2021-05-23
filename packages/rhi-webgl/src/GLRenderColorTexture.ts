import {
  IPlatformRenderColorTexture,
  Logger,
  RenderBufferColorFormat,
  RenderColorTexture,
  TextureCubeFace
} from "@oasis-engine/core";
import { GLTexture } from "./GLTexture";
import { WebGLRenderer } from "./WebGLRenderer";

/**
 * The texture in WebGL platform is used for the output of color information in off-screen rendering.
 */
export class GLRenderColorTexture extends GLTexture implements IPlatformRenderColorTexture {
  /**
   * Create render color texture in WebGL platform.
   */
  constructor(rhi: WebGLRenderer, texture: RenderColorTexture) {
    super(rhi, texture, texture.isCube ? rhi.gl.TEXTURE_CUBE_MAP : rhi.gl.TEXTURE_2D);

    /** @ts-ignore */
    const { format, _mipmap, width, height, isCube } = texture;

    const isWebGL2 = this._isWebGL2;

    if (!GLTexture._supportRenderBufferColorFormat(format, rhi)) {
      throw new Error(`RenderBufferColorFormat is not supported:${RenderBufferColorFormat[format]}`);
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

    this._formatDetail = GLTexture._getRenderBufferColorFormatDetail(format, this._gl, isWebGL2);
    this._initMipmap(isCube);
  }

  /**
   * Get the pixel color buffer according to the specified cube face and area.
   * @param face - You can choose which cube face to read if it's cube texture
   * @param x - X coordinate of area start
   * @param y - Y coordinate of area start
   * @param width - Area width
   * @param height - Area height
   * @param out - Color buffer
   * @param mipLevel - Set mip level the data want to get from
   */
  getPixelBuffer(
    face: TextureCubeFace | null,
    x: number,
    y: number,
    width: number,
    height: number,
    out: ArrayBufferView,
    mipLevel: number
  ): void {
    super._getPixelBuffer(face, x, y, width, height, out, mipLevel);
  }
}
