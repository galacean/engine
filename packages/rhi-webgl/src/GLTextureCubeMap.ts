import { IPlatformTextureCubeMap, Logger, TextureCubeFace, TextureCubeMap, TextureFormat } from "@oasis-engine/core";
import { GLTexture } from "./GLTexture";
import { WebGLRenderer } from "./WebGLRenderer";

export class GLTextureCubeMap extends GLTexture implements IPlatformTextureCubeMap {
  /**
   * @internal
   * 向下兼容 WebGL1.0。
   */
  private _compressedFaceFilled: number[] = [0, 0, 0, 0, 0, 0];

  constructor(rhi: WebGLRenderer, textureCube: TextureCubeMap) {
    super(rhi, textureCube, rhi.gl.TEXTURE_CUBE_MAP);

    const { _format, _mipmap, width: size } = textureCube;
    const isWebGL2 = this._isWebGL2;

    if (!GLTexture._supportTextureFormat(_format, rhi)) {
      throw new Error(`Texture format is not supported:${TextureFormat[_format]}`);
    }

    if (_mipmap && !isWebGL2 && !GLTexture._isPowerOf2(size)) {
      Logger.warn(
        "non-power-2 texture is not supported for mipmap in WebGL1,and has automatically downgraded to non-mipmap"
      );
      textureCube._mipmap = false;
    }

    this._formatDetail = GLTexture._getFormatDetail(_format, this._gl, isWebGL2);
    (this._formatDetail.isCompressed && !isWebGL2) || this._initMipmap(true);
  }

  /**
   * 通过指定立方体面、像素缓冲数据、区域和纹理层级设置像素，同样适用于压缩格式。
   * 压缩纹理在 WebGL1 时必须先填满纹理，才能写子区域
   * @param face - 立方体面
   * @param colorBuffer - 颜色缓冲
   * @param mipLevel - 多级纹理层级
   * @param x - 区域起始X坐标
   * @param y - 区域起始Y坐标
   * @param width - 区域宽。如果为空的话 width 为 mipLevel 对应的宽度减去 x , mipLevel 对应的宽度为 Math.max(1, this.width >> mipLevel)
   * @param height - 区域高。如果为空的话 height 为 mipLevel 对应的高度减去 y , mipLevel 对应的高度为 Math.max(1, this.height >> mipLevel)
   */
  setPixelBuffer(
    face: TextureCubeFace,
    colorBuffer: ArrayBufferView,
    mipLevel: number = 0,
    x?: number,
    y?: number,
    width?: number,
    height?: number
  ): void {
    const gl = this._gl;
    const isWebGL2 = this._isWebGL2;
    const { internalFormat, baseFormat, dataType, isCompressed } = this._formatDetail;
    const mipSize = Math.max(1, this._texture.width >> mipLevel);

    x = x || 0;
    y = y || 0;
    width = width || mipSize - x;
    height = height || mipSize - y;

    this._bind();

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 0);

    if (isCompressed) {
      const mipBit = 1 << mipLevel;
      if (isWebGL2 || this._compressedFaceFilled[face] & mipBit) {
        gl.compressedTexSubImage2D(
          gl.TEXTURE_CUBE_MAP_POSITIVE_X + face,
          mipLevel,
          x,
          y,
          width,
          height,
          internalFormat,
          colorBuffer
        );
      } else {
        gl.compressedTexImage2D(
          gl.TEXTURE_CUBE_MAP_POSITIVE_X + face,
          mipLevel,
          internalFormat,
          width,
          height,
          0,
          colorBuffer
        );
        this._compressedFaceFilled[face] |= mipBit;
      }
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

    this._unbind();
  }

  /**
   * 通过指定立方体面、图源、区域和纹理层级设置像素。
   * @param face - 立方体面
   * @param imageSource - 纹理源
   * @param mipLevel - 多级纹理层级
   * @param flipY - 是否翻转Y轴
   * @param premultipltAlpha - 是否预乘透明通道
   * @param x - 区域起始X坐标
   * @param y - 区域起始Y坐标
   */
  setImageSource(
    face: TextureCubeFace,
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
    gl.texSubImage2D(
      gl.TEXTURE_CUBE_MAP_POSITIVE_X + face,
      mipLevel,
      x || 0,
      y || 0,
      baseFormat,
      dataType,
      imageSource
    );
    this._unbind();
  }

  /**
   * 根据立方体面和指定区域获得像素颜色缓冲。
   * @param face - 可以选择读取第几个面
   * @param x - 区域起始X坐标
   * @param y - 区域起始Y坐标
   * @param width - 区域宽
   * @param height - 区域高
   * @param out - 颜色数据缓冲
   */
  getPixelBuffer(
    face: TextureCubeFace,
    x: number,
    y: number,
    width: number,
    height: number,
    out: ArrayBufferView
  ): void {
    if (this._formatDetail.isCompressed) {
      throw new Error("Unable to read compressed texture");
    }
    super._getPixelBuffer(face, x, y, width, height, out);
  }
}
