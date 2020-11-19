import { Engine } from "../Engine";
import { IPlatformTextureCubeMap } from "../renderingHardwareInterface";
import { TextureCubeFace } from "./enums/TextureCubeFace";
import { TextureFilterMode } from "./enums/TextureFilterMode";
import { TextureFormat } from "./enums/TextureFormat";
import { TextureWrapMode } from "./enums/TextureWrapMode";
import { Texture } from "./Texture";

/**
 * 立方体纹理。
 * @todo 日后调整为TextureCube命名
 */
export class TextureCubeMap extends Texture {
  _format: TextureFormat;
  _platformTexture: IPlatformTextureCubeMap;

  /**
   * 纹理的格式。
   */
  get format(): TextureFormat {
    return this._format;
  }

  /**
   * 创建立方体纹理。
   * @param engine - 所属引擎
   * @param size - 尺寸
   * @param format - 格式，默认 TextureFormat.R8G8B8A8
   * @param mipmap - 是否使用多级纹理
   */
  constructor(engine: Engine, size: number, format: TextureFormat = TextureFormat.R8G8B8A8, mipmap: boolean = true) {
    super(engine);

    this._mipmap = mipmap;
    this._width = size;
    this._height = size;
    this._format = format;
    this._mipmapCount = this._getMipmapCount();

    this._platformTexture = engine._hardwareRenderer.createPlatformTextureCubeMap(this);

    this.filterMode = TextureFilterMode.Bilinear;
    this.wrapModeU = this.wrapModeV = TextureWrapMode.Clamp;
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
    this._platformTexture.setPixelBuffer(face, colorBuffer, mipLevel, x, y, width, height);
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
    this._platformTexture.setImageSource(face, imageSource, mipLevel, flipY, premultiplyAlpha, x, y);
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
    this._platformTexture.getPixelBuffer(face, x, y, width, height, out);
  }
}
