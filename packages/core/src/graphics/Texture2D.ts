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
    //TODO:
    return null;
  }

  /**
   * 构建一个2D纹理。
   * @param width - 宽
   * @param height - 高
   * @param format - 格式
   * @param mipmap - 是否使用分级纹理
   */
  constructor(width: number, height: number, format: TextureFormat, mipmap: boolean) {
    super();
  }

  // /**
  //  * 根据坐标和纹理层级填充像素颜色。
  //  * @param x - 像素
  //  * @param y - 层级
  //  * @param color - 颜色
  //  * @param miplevel - 分级纹理层级
  //  */
  // setPixel(x: number, y: number, color: Color, miplevel: number): void;

  // /**
  //  * 根据指定区域和纹理层级设置颜色。
  //  * @param colors - 颜色集合
  //  * @param x - 区域起始X坐标
  //  * @param y - 区域起始Y坐标
  //  * @param width - 区域宽
  //  * @param height - 区域高
  //  * @param miplevel - 分级纹理层级
  //  */
  // setPixels(colors: Color[], x: number, y: number, width: number, height: number, miplevel: number): void;

  /**
   * 根据指定区域和纹理层级设置像素数据，同样适用于压缩格式。
   * @param colorBuffer - 颜色缓冲
   * @param miplevel - 分级纹理层级
   * @param x - 区域起始X坐标
   * @param y - 区域起始Y坐标
   * @param width - 区域宽
   * @param height - 区域高
   */
  setPixelsBuffer(
    colorBuffer: ArrayBufferView,
    miplevel: number,
    x: number,
    y: number,
    width: number,
    height: number
  ): void {}

  /**
   * 根据指定区域和纹理层级设置图源。
   * @param imageSource - 纹理源
   * @param miplevel - 分级纹理层级
   * @param x - 区域起始X坐标
   * @param y - 区域起始Y坐标
   * @param flipY - 是否翻转Y轴
   * @param premultipltAlpha - 是否预乘透明通道
   */
  setImageSource(
    imageSource: TexImageSource,
    miplevel: number,
    x: number,
    y: number,
    flipY: boolean,
    premultipltAlpha: boolean
  ): void {}

  // /**
  // * 应用之前所有的像素变更操作，比较耗费性能。
  // * @param recalculateMipmap - 是否根据第0级level重新计算分级纹理
  // */
  // apply(recalculateMipmap: boolean): void;

  /**
   * 根据第0级数据生成多级纹理。
   */
  generateMipmaps(): void {}
}
