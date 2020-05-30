import { RenderColorTexture } from "./RenderColorTexture";
import { RenderDepthTexture } from "./RenderDepthTexture";
import { RenderTextureDepthFormat } from "./RenderTextureDepthFormat";

/**
 * 用于离屏幕渲染的渲染目标。
 */
export class RenderTarget {
  /**
   * 颜色纹理数量。
   */
  get colorTextureCount(): number {
    return -1;
  }

  /**
   * 深度纹理。
   */
  get depthTexture(): RenderDepthTexture {
    return null;
  }

  /**
   * 通过颜色纹理和深度格式创建渲染目标。
   * @param width - 宽
   * @param height - 高
   * @param colorTexture - 颜色纹理
   * @param depthTexture - 深度格式
   */
  constructor(width: number, height: number, colorTexture: RenderColorTexture, depthFormat: RenderTextureDepthFormat);

  /**
   * 通过颜色纹理和深度纹理创建渲染目标。
   * @param width - 宽
   * @param height - 高
   * @param colorTexture - 颜色纹理
   * @param depthTexture - 深度纹理
   */
  constructor(width: number, height: number, colorTexture: RenderColorTexture, depthTexture: RenderDepthTexture);

  /**
   * 通过颜色纹理数组和深度格式创建渲染目标。
   * @param width - 宽
   * @param height - 高
   * @param colorTextures - 颜色纹理数组
   * @param depthFormat - 深度格式
   */
  constructor(
    width: number,
    height: number,
    colorTextures: Array<RenderColorTexture>,
    depthFormat: RenderTextureDepthFormat
  );

  /**
   * 通过颜色纹理数组和深度纹理创建渲染目标。
   * @param width - 宽
   * @param height - 高
   * @param colorTextures - 颜色纹理数组
   * @param depthFormat - 深度纹理
   */
  constructor(
    width: number,
    height: number,
    colorTextures: Array<RenderColorTexture>,
    depthTexture: RenderDepthTexture
  );

  /**
   * @internal
   */
  constructor(
    width: number,
    height: number,
    renderTexture: RenderColorTexture | Array<RenderColorTexture>,
    depth: RenderDepthTexture | RenderTextureDepthFormat
  ) {}

  /**
   * 通过索引获取颜色纹理。
   * @param index
   */
  getColorTexture(index: number = 0): RenderColorTexture {
    return null;
  }
}
