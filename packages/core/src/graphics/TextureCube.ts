import { Texture } from "./Texture";
import { TextureCubeFace } from "./TextureCubeFace";
import { TextureFormat } from "./TextureFormat";

/**
 * 立方体纹理。
 */
export class TextureCube extends Texture {
  /**
   * 创建立方体纹理。
   * @param size - 尺寸
   * @param format - 格式
   * @param mipmap - 是否使用分级纹理
   */
  constructor(size: number, format: TextureFormat = TextureFormat.R8G8B8A8, mipmap: boolean = false) {
    super();
  }

  // /**
  //  * 根据指定立方体面、坐标和纹理层级填充像素颜色。
  //  * @param face - 立方体面
  //  * @param x - 像素
  //  * @param y - 层级
  //  * @param color - 颜色
  //  * @param miplevel - 分级纹理层级
  //  */
  // setPixel(face: TextureCubeFace, x: number, y: number, color: Color, miplevel: number): void;

  // /**
  //  * 根据指定立方体面、区域和纹理层级设置颜色。
  //  * @param face - 立方体面
  //  * @param colors - 颜色集合
  //  * @param miplevel - 分级纹理层级
  //  * @param x - 区域起始X坐标
  //  * @param y - 区域起始Y坐标
  //  * @param width - 区域宽
  //  * @param height - 区域高
  //  */
  // setPixels(face: TextureCubeFace, colors: Color[], miplevel: number, x: number, y: number, width: number, height: number): void;

  /**
   * 根据指定立方体面、区域和纹理层级设置像素数据，同样适用于压缩格式。
   * @param face - 立方体面
   * @param colorBuffer - 颜色缓冲
   * @param miplevel - 分级纹理层级
   * @param x - 区域起始X坐标
   * @param y - 区域起始Y坐标
   * @param width - 区域宽
   * @param height - 区域高
   */
  setPixelsBuffer(
    face: TextureCubeFace,
    colorBuffer: ArrayBufferView,
    miplevel: number = 0,
    x?: number,
    y?: number,
    width?: number,
    height?: number
  ): void {}

  /**
   * 根据指定立方体面、区域和纹理层级设置图源。
   * @param face - 立方体面
   * @param imageSource - 纹理源
   * @param miplevel - 分级纹理层级
   * @param flipY - 是否翻转Y轴
   * @param premultipltAlpha - 是否预乘透明通道
   * @param x - 区域起始X坐标
   * @param y - 区域起始Y坐标
   */
  setImageSource(
    face: TextureCubeFace,
    imageSource: TexImageSource,
    miplevel: number = 0,
    flipY: boolean = false,
    premultiplyAlpha: boolean = false,
    x?: number,
    y?: number
  ): void {}

  // /**
  //  * 应用之前所有的像素变更操作，比较耗费性能。
  //  * @param recalculateMipmap - 是否根据第0级level重新计算分级纹理
  //  */
  // apply(recalculateMipmap: boolean): void;

  /**
   * 根据第0级数据生成多级纹理。
   */
  generateMipmaps(): void {}
}
