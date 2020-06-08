import { RenderBufferDepthFormat } from "./RenderBufferDepthFormat";
import { Texture } from "./Texture";

/**
 * 类应用于渲染深度纹理。
 */
export class RenderDepthTexture extends Texture {
  /**
   * 格式。
   */
  get format(): RenderBufferDepthFormat {
    return 0;
  }

  /**
   * 自动生成多级纹理。
   */
  get autoGenerateMipmaps(): boolean {
    return false;
  }
  set autoGenerateMipmaps(value: boolean) {}

  /**
   * 构造渲染深度纹理。
   * @param width - 宽
   * @param height - 高
   * @param format - 格式
   * @param mipmap - 是否使用多级纹理
   */
  constructor(width: number, height: number, format: RenderBufferDepthFormat, mipmap: boolean = false) {
    super();
  }

  // /**
  //  * 根据指定区域获得像素颜色。
  //  * @param x - 区域起始X坐标
  //  * @param y - 区域起始Y坐标
  //  * @param width - 区域宽
  //  * @param height - 区域高
  //  * @param out - 颜色数据
  //  */
  // getPixels(x: number, y: number, width: number, height: number, out: Color[]): void {

  // }
}
