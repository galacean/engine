import { RenderTextureColorFormat } from "./RenderTextureColorFormat";
import { RenderTextureDepthFormat } from "./RenderTextureDepthFormat";
import { Texture } from "./Texture";
import { RenderBuffer } from "./RenderBuffer";

/**
 * 类应用于渲染纹理。
 */
export class RenderTexture extends Texture {
  /**
   * 颜色格式。
   */
  get colorFormat(): RenderTextureColorFormat {
    //TODO:
    return 0;
  }

  /**
   * 深度格式。
   */
  get depthFormat(): RenderTextureDepthFormat {
    //TODO:
    return 0;
  }

  /**
   * 自动生成多级纹理。
   */
  get autoGenerateMipmaps(): boolean {
    //TODO:
    return false;
  }
  set autoGenerateMipmaps(value: boolean) {}

  /**
   * 颜色缓冲。
   */
  get colorBuffer(): RenderBuffer {
    //TODO:
    return null;
  }

  /**
   * 深度缓冲。
   */
  get depthBuffer(): RenderBuffer {
    //TODO:
    return 0;
  }

  /**
   * 构造渲染纹理。
   * @param width - 宽
   * @param height - 高
   * @param colorFormat - 颜色格式
   * @param depthFormat - 深度格式
   */
  constructor(
    width: number,
    height: number,
    colorFormat: RenderTextureColorFormat,
    depthFormat: RenderTextureDepthFormat
  ) {
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

  /**
   * 根据指定区域获得像素颜色缓冲。
   * @param x - 区域起始X坐标
   * @param y - 区域起始Y坐标
   * @param width - 区域宽
   * @param height - 区域高
   * @param out - 颜色数据缓冲
   */
  getPixelsBuffer(x: number, y: number, width: number, height: number, out: ArrayBufferView): void {}

  /**
   * 生成多级纹理。
   */
  generateMipmaps(): void {}
}
