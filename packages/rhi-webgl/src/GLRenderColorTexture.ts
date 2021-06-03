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
   */
  getPixelBuffer(
    face: TextureCubeFace | null,
    x: number,
    y: number,
    width: number,
    height: number,
    out: ArrayBufferView
  ): void {
    super._getPixelBuffer(face, x, y, width, height, out);
  }

  /**
   * Setting pixels data through cube face,color buffer data, designated area and texture mipmapping level.
   * @param face - You can choose which cube face to write if it's cube texture
   * @param colorBuffer - Color buffer data
   * @param mipLevel - Texture mipmapping level
   * @param x - X coordinate of area start
   * @param y -  Y coordinate of area start
   * @param width - Data width.if it's empty, width is the width corresponding to mipLevel minus x , width corresponding to mipLevel is Math.max(1, this.width >> mipLevel)
   * @param height - Data height.if it's empty, height is the height corresponding to mipLevel minus y , height corresponding to mipLevel is Math.max(1, this.height >> mipLevel)
   */
  setPixelBuffer(
    face: TextureCubeFace | null,
    colorBuffer: ArrayBufferView,
    mipLevel?: number,
    x?: number,
    y?: number,
    width?: number,
    height?: number
  ): void {
    const gl = this._gl;
    const { baseFormat, dataType } = this._formatDetail;
    const mipSize = Math.max(1, this._texture.width >> mipLevel);

    x = x || 0;
    y = y || 0;
    width = width || mipSize - x;
    height = height || mipSize - y;

    this._bind();

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);

    if (face == null) {
      gl.texSubImage2D(this._target, mipLevel, x, y, width, height, baseFormat, dataType, colorBuffer);
    } else {
      gl.texSubImage2D(
        gl.TEXTURE_CUBE_MAP_POSITIVE_X + face,
        mipLevel,
        x,
        y,
        width,
        height,
        baseFormat,
        dataType,
        colorBuffer
      );
    }
  }

  /**
   * Setting pixels data through cube face, TexImageSource, designated area and texture mipmapping level.
   * @param face - You can choose which cube face to write if it's cube texture
   * @param imageSource - The source of texture
   * @param mipLevel - Texture mipmapping level
   * @param flipY - Whether to flip the Y axis
   * @param premultipltAlpha - Whether to premultiply the transparent channel
   * @param x - X coordinate of area start
   * @param y - Y coordinate of area start
   */
  setImageSource(
    face: TextureCubeFace | null,
    imageSource: TexImageSource,
    mipLevel?: number,
    flipY?: boolean,
    premultiplyAlpha?: boolean,
    x?: number,
    y?: number
  ): void {
    const gl = this._gl;
    const { baseFormat, dataType } = this._formatDetail;

    this._bind();

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, +flipY);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, +premultiplyAlpha);

    if (face == null) {
      gl.texSubImage2D(this._target, mipLevel, x || 0, y || 0, baseFormat, dataType, imageSource);
    } else {
      gl.texSubImage2D(
        gl.TEXTURE_CUBE_MAP_POSITIVE_X + face,
        mipLevel,
        x || 0,
        y || 0,
        baseFormat,
        dataType,
        imageSource
      );
    }
  }
}
