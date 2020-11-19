import { TextureCubeFace } from "../texture";
import { IPlatformTexture } from "./IPlatformTexture";

/**
 * 渲染颜色纹理接口规范。
 */
export interface IPlatformRenderColorTexture extends IPlatformTexture {
  /**
   * 根据立方体面和指定区域获得颜色像素缓冲。
   * @param face - 如果是立方体纹理，可以选择读取第几个面;立方体纹理读取面，isCube=true时生效
   * @param x - 区域起始X坐标
   * @param y - 区域起始Y坐标
   * @param width - 区域宽
   * @param height - 区域高
   * @param out - 颜色像素缓冲
   */
  getPixelBuffer(
    face: TextureCubeFace | null,
    x: number,
    y: number,
    width: number,
    height: number,
    out: ArrayBufferView
  ): void;
}
