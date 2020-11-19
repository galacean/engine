import { IPlatformTexture2D, Logger, Texture2D, TextureFormat } from "@oasis-engine/core";
import { GLTexture } from "./GLTexture";
import { WebGLRenderer } from "./WebGLRenderer";

export class GLTexture2D extends GLTexture implements IPlatformTexture2D {
  /**
   * @internal
   * 向下兼容 WebGL1.0。
   */
  private _compressedMipFilled: number = 0;

  constructor(rhi: WebGLRenderer, texture2D: Texture2D) {
    super(rhi, texture2D, rhi.gl.TEXTURE_2D);

    const { _format, _mipmap, width, height } = texture2D;
    const isWebGL2 = this._isWebGL2;

    if (!GLTexture._supportTextureFormat(_format, rhi)) {
      throw new Error(`Texture format is not supported:${TextureFormat[_format]}`);
    }

    if (_mipmap && !isWebGL2 && (!GLTexture._isPowerOf2(width) || !GLTexture._isPowerOf2(height))) {
      Logger.warn(
        "non-power-2 texture is not supported for mipmap in WebGL1,and has automatically downgraded to non-mipmap"
      );
      texture2D._mipmap = false;
    }

    this._formatDetail = GLTexture._getFormatDetail(_format, this._gl, isWebGL2);
    (this._formatDetail.isCompressed && !isWebGL2) || this._initMipmap(false);
  }

  /**
   * 通过颜色缓冲数据、指定区域和纹理层级设置像素，同样适用于压缩格式。
   * @remarks 如果为WebGL1.0平台且纹理格式为压缩格式，第一次上传必须填满纹理。
   * @param pixelBuffer - 颜色缓冲数据
   * @param mipLevel - 纹理层级
   * @param x - 数据起始X坐标
   * @param y - 数据起始Y坐标
   * @param width - 数据宽度。如果为空的话 width 为 mipLevel 对应的宽度减去 x , mipLevel 对应的宽度为 Math.max(1, this.width >> mipLevel)
   * @param height - 数据高度。如果为空的话 height 为 mipLevel 对应的高度减去 y , mipLevel 对应的高度为 Math.max(1, this.height >> mipLevel)
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

    this._unbind();
  }

  /**
   * 通过图源、指定区域和纹理层级设置像素。
   * @param imageSource - 纹理源
   * @param mipLevel - 多级纹理层级
   * @param flipY - 是否翻转Y轴
   * @param premultiplyAlpha - 是否预乘透明通道
   * @param x - 区域起始X坐标
   * @param y - 区域起始Y坐标
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
    this._unbind();
  }

  /**
   * 根据指定区域获得像素颜色缓冲。
   * @param x - 区域起始X坐标
   * @param y - 区域起始Y坐标
   * @param width - 区域宽
   * @param height - 区域高
   * @param out - 颜色数据缓冲
   */
  getPixelBuffer(x: number, y: number, width: number, height: number, out: ArrayBufferView): void {
    if (this._formatDetail.isCompressed) {
      throw new Error("Unable to read compressed texture");
    }
    super._getPixelBuffer(null, x, y, width, height, out);
  }
}
