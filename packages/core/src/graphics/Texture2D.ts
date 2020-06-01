import { Texture } from "./Texture";
import { TextureFormat } from "./TextureFormat";

/**
 * 2D纹理类。
 */
export class Texture2D extends Texture {
  /**
   * 纹理的格式。
   */
  get format(): TextureFormat {
    return null;
  }

  /**
   * 构建一个2D纹理。
   * @param width - 宽
   * @param height - 高
   * @param format - 格式
   * @param mipmap - 是否使用多级纹理
   */
  constructor(width: number, height: number, format: TextureFormat, mipmap: boolean = true) {
    super();
  }

  /**
   * 通过颜色缓冲数据和指定区域设置像素,如果mipmap属性为true会自动生成多级纹理数据。
   * @param colorBuffer - 颜色缓冲数据
   * @param x - 数据起始X坐标
   * @param y - 数据起始Y坐标
   * @param width - 数据宽度
   * @param height - 数据高度
   */
  setPixelBuffer(colorBuffer: ArrayBufferView, x?: number, y?: number, width?: number, height?: number): void;

  /**
   * 通过颜色缓冲数据、指定区域和纹理层级设置像素，同样适用于压缩格式。
   * @param pixelBuffer - 颜色缓冲数据
   * @param x - 数据起始X坐标
   * @param y - 数据起始Y坐标
   * @param width - 数据宽度
   * @param height - 数据高度
   * @param miplevel - 纹理层级
   */
  setPixelBuffer(
    colorBuffer: ArrayBufferView,
    x?: number,
    y?: number,
    width?: number,
    height?: number,
    miplevel?: number
  );

  /**
   * @internal
   */
  setPixelBuffer(
    colorBuffer: ArrayBufferView,
    x?: number,
    y?: number,
    width?: number,
    height?: number,
    miplevel: number = 0
  ): void {}

  /**
   * 通过图源和指定区域设置像素,如果mipmap属性为true会自动生成多级纹理数据。
   * @param imageSource - 纹理源
   * @param flipY - 是否翻转Y轴
   * @param premultiplyAlpha - 是否预乘透明通道
   * @param x - 区域起始X坐标
   * @param y - 区域起始Y坐标
   */
  setImageSource(
    imageSource: TexImageSource,
    flipY?: boolean,
    premultiplyAlpha?: boolean,
    x?: number,
    y?: number
  ): void;

  /**
   * 通过图源、指定区域和纹理层级设置像素。
   * @param imageSource - 纹理源
   * @param flipY - 是否翻转Y轴
   * @param premultiplyAlpha - 是否预乘透明通道
   * @param x - 区域起始X坐标
   * @param y - 区域起始Y坐标
   * @param miplevel - 多级纹理层级
   */
  setImageSource(
    imageSource: TexImageSource,
    flipY?: boolean,
    premultiplyAlpha?: boolean,
    x?: number,
    y?: number,
    miplevel?: number
  ): void;

  /**
   * @internal
   */
  setImageSource(
    imageSource: TexImageSource,
    flipY: boolean = false,
    premultiplyAlpha: boolean = false,
    x?: number,
    y?: number,
    miplevel: number = 0
  ): void {}

  // /**
  //  * 根据坐标和纹理层级填充像素颜色。
  //  * @param x - 像素
  //  * @param y - 层级
  //  * @param color - 颜色
  //  * @param miplevel - 多级纹理层级
  //  */
  // setPixel(x: number, y: number, color: Color, miplevel: number): void;

  // /**
  //  * 根据指定区域和纹理层级设置颜色。
  //  * @param colors - 颜色集合
  //  * @param x - 区域起始X坐标
  //  * @param y - 区域起始Y坐标
  //  * @param width - 区域宽
  //  * @param height - 区域高
  //  * @param miplevel - 多级纹理层级
  //  */
  // setPixels(colors: Color[], x: number, y: number, width: number, height: number, miplevel: number): void;

  // /**
  // * 应用之前所有的像素变更操作，比较耗费性能。
  // * @param recalculateMipmap - 是否根据第0级level重新计算多级纹理
  // */
  // apply(recalculateMipmap: boolean): void;
}
