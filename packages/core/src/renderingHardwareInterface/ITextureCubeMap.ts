import { TextureCubeFace } from "../texture";
import { ITexture } from "./ITexture";

/**
 * 立方体纹理接口规范。
 */
export interface ITextureCubeMap extends ITexture {
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
    mipLevel?: number,
    x?: number,
    y?: number,
    width?: number,
    height?: number
  ): void;

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
    mipLevel?: number,
    flipY?: boolean,
    premultiplyAlpha?: boolean,
    x?: number,
    y?: number
  ): void;

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
  ): void;
}
