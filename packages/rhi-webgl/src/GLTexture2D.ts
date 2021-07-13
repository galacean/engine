import { IPlatformTexture2D, Logger, Texture2D, TextureFormat } from "@oasis-engine/core";
import { GLTexture } from "./GLTexture";
import { WebGLRenderer } from "./WebGLRenderer";

/**
 * Texture 2d in WebGL platform.
 */
export class GLTexture2D extends GLTexture implements IPlatformTexture2D {
  /**
   * Backward compatible with WebGL1.0.
   */
  private _compressedMipFilled: number = 0;

  /**
   * Create texture2D in WebGL platform.
   */
  constructor(rhi: WebGLRenderer, texture2D: Texture2D) {
    super(rhi, texture2D, rhi.gl.TEXTURE_2D);

    /** @ts-ignore */
    const { format, _mipmap, width, height } = texture2D;
    const isWebGL2 = this._isWebGL2;

    if (!GLTexture._supportTextureFormat(format, rhi)) {
      throw new Error(`Texture format is not supported:${TextureFormat[format]}`);
    }

    if (_mipmap && !isWebGL2 && (!GLTexture._isPowerOf2(width) || !GLTexture._isPowerOf2(height))) {
      Logger.warn(
        "non-power-2 texture is not supported for mipmap in WebGL1,and has automatically downgraded to non-mipmap"
      );

      /** @ts-ignore */
      texture2D._mipmap = false;
      /** @ts-ignore */
      texture2D._mipmapCount = texture2D._getMipmapCount();
    }

    this._formatDetail = GLTexture._getFormatDetail(format, this._gl, isWebGL2);
    (this._formatDetail.isCompressed && !isWebGL2) || this._initMipmap(false);
  }

  /**
   * Setting pixels data through color buffer data, designated area and texture mipmapping level,it's also applicable to compressed formats.
   * @remarks If it is the WebGL1.0 platform and the texture format is compressed, the first upload must be filled with textures.
   * @param colorBuffer - Color buffer data
   * @param mipLevel - Texture mipmapping level
   * @param x - X coordinate of area start
   * @param y - Y coordinate of area start
   * @param width - Data width. if it's empty, width is the width corresponding to mipLevel minus x , width corresponding to mipLevel is Math.max(1, this.width >> mipLevel)
   * @param height - Data height. if it's empty, height is the height corresponding to mipLevel minus y , height corresponding to mipLevel is Math.max(1, this.height >> mipLevel)
   */
  setPixelBuffer(
    colorBuffer: ArrayBufferView,
    mipLevel: number = 0,
    x?: number,
    y?: number,
    width?: number,
    height?: number
  ): void {
    const gl = this._gl;
    const isWebGL2: boolean = this._isWebGL2;
    const { internalFormat, baseFormat, dataType, isCompressed } = this._formatDetail;
    const mipWidth = Math.max(1, this._texture.width >> mipLevel);
    const mipHeight = Math.max(1, this._texture.height >> mipLevel);

    x = x || 0;
    y = y || 0;
    width = width || mipWidth - x;
    height = height || mipHeight - y;

    this._bind();

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);

    if (isCompressed) {
      const mipBit = 1 << mipLevel;
      if (isWebGL2 || this._compressedMipFilled & mipBit) {
        gl.compressedTexSubImage2D(this._target, mipLevel, x, y, width, height, internalFormat, colorBuffer);
      } else {
        gl.compressedTexImage2D(this._target, mipLevel, internalFormat, width, height, 0, colorBuffer);
        this._compressedMipFilled |= mipBit;
      }
    } else {
      gl.texSubImage2D(this._target, mipLevel, x, y, width, height, baseFormat, dataType, colorBuffer);
    }
  }

  /**
   * Setting pixels data through TexImageSource, designated area and texture mipmapping level.
   * @param imageSource - The source of texture
   * @param mipLevel - Texture mipmapping level
   * @param flipY - Whether to flip the Y axis
   * @param premultiplyAlpha - Whether to premultiply the transparent channel
   * @param x - X coordinate of area start
   * @param y - Y coordinate of area start
   */
  setImageSource(
    imageSource: TexImageSource,
    mipLevel: number = 0,
    flipY: boolean = false,
    premultiplyAlpha: boolean = false,
    x?: number,
    y?: number
  ): void {
    const gl = this._gl;
    const { baseFormat, dataType } = this._formatDetail;

    this._bind();
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, +flipY);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, +premultiplyAlpha);
    gl.texSubImage2D(this._target, mipLevel, x || 0, y || 0, baseFormat, dataType, imageSource);
  }

  /**
   * Get the pixel color buffer according to the specified area.
   * @param x - X coordinate of area start
   * @param y - Y coordinate of area start
   * @param width - Area width
   * @param height - Area height
   * @param out - Color buffer
   * @param mipLevel - Set mip level the data want to get from
   */
  getPixelBuffer(x: number, y: number, width: number, height: number, out: ArrayBufferView, mipLevel: number): void {
    if (this._formatDetail.isCompressed) {
      throw new Error("Unable to read compressed texture");
    }
    super._getPixelBuffer(null, x, y, width, height, out, mipLevel);
  }
}
