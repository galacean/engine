import { Engine } from "../Engine";
import { IPlatformTexture2D } from "../renderingHardwareInterface";
import { TextureFilterMode } from "./enums/TextureFilterMode";
import { TextureFormat } from "./enums/TextureFormat";
import { TextureWrapMode } from "./enums/TextureWrapMode";
import { Texture } from "./Texture";

/**
 * 2D纹理。
 */
export class Texture2D extends Texture {
  _format: TextureFormat;
  _platformTexture: IPlatformTexture2D;

  /**
   * 纹理的格式。
   */
  get format(): TextureFormat {
    return this._format;
  }

  /**
   * 构建一个2D纹理。
   * @param engine - 所属引擎
   * @param width - 宽
   * @param height - 高
   * @param format - 格式，默认值 `TextureFormat.R8G8B8A8`
   * @param mipmap - 是否使用多级纹理
   */
  constructor(
    engine: Engine,
    width: number,
    height: number,
    format: TextureFormat = TextureFormat.R8G8B8A8,
    mipmap: boolean = true
  ) {
    super(engine);

    this._mipmap = mipmap;
    this._width = width;
    this._height = height;
    this._format = format;
    this._mipmapCount = this._getMipmapCount();

    this._platformTexture = engine._hardwareRenderer.createPlatformTexture2D(this);

    this.filterMode = TextureFilterMode.Bilinear;
    this.wrapModeU = this.wrapModeV = TextureWrapMode.Repeat;
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
    this._platformTexture.setPixelBuffer(colorBuffer, mipLevel, x, y, width, height);
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
    this._platformTexture.setImageSource(imageSource, mipLevel, flipY, premultiplyAlpha, x, y);
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
    this._platformTexture.getPixelBuffer(x, y, width, height, out);
  }
}
