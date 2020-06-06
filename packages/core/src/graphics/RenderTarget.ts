import { RenderBufferDepthFormat } from "./RenderBufferDepthFormat";
import { RenderColorTexture } from "./RenderColorTexture";
import { RenderDepthTexture } from "./RenderDepthTexture";

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
  get depthTexture(): RenderDepthTexture | null {
    return null;
  }

  /**
   * 抗锯齿级别。
   * 如果设置的抗锯齿级别大于硬件支持的最大级别，将使用硬件的最大级别。
   */
  get antiAliasing(): number {
    return 0;
  }

  /**
   * 是否为立方体渲染目标。
   */
  get isCube(): boolean {
    return false;
  }

  /**
   * 通过颜色纹理和深度格式创建渲染目标，使用内部深度缓冲，无法获取深度纹理。
   * @param width - 宽
   * @param height - 高
   * @param colorTexture - 颜色纹理
   * @param depthFormat - 深度格式
   * @param isCube -是否为立方体渲染目标，如果为true宽高必须相等
   */
  constructor(
    width: number,
    height: number,
    colorTexture: RenderColorTexture,
    depthFormat: RenderBufferDepthFormat,
    isCube?: boolean
  );

  /**
   * 通过颜色纹理和深度纹理创建渲染目标,如果颜色纹理为null，则无法获取颜色纹理。
   * @param width - 宽
   * @param height - 高
   * @param colorTexture - 颜色纹理
   * @param depthTexture - 深度纹理
   * @param isCube -是否为立方体渲染目标，如果为true宽高必须相等
   */
  constructor(
    width: number,
    height: number,
    colorTexture: RenderColorTexture | null,
    depthTexture: RenderDepthTexture,
    isCube?: boolean
  );

  /**
   * 通过颜色纹理数组和深度格式创建渲染目标，使用内部深度缓冲，无法获取深度纹理。
   * @param width - 宽
   * @param height - 高
   * @param colorTextures - 颜色纹理数组
   * @param depthFormat - 深度格式
   * @param isCube -是否为立方体渲染目标，如果为true宽高必须相等
   */
  constructor(
    width: number,
    height: number,
    colorTextures: Array<RenderColorTexture>,
    depthFormat: RenderBufferDepthFormat,
    isCube?: boolean
  );

  /**
   * 通过颜色纹理数组和深度纹理创建渲染目标。
   * @param width - 宽
   * @param height - 高
   * @param colorTextures - 颜色纹理数组
   * @param depthTexture - 深度纹理
   * @param isCube -是否为立方体渲染目标，如果为true宽高必须相等
   */
  constructor(
    width: number,
    height: number,
    colorTextures: Array<RenderColorTexture>,
    depthTexture: RenderDepthTexture,
    isCube?: boolean
  );

  /**
   * @internal
   */
  constructor(
    width: number,
    height: number,
    renderTexture: RenderColorTexture | Array<RenderColorTexture> | null,
    depth: RenderDepthTexture | RenderBufferDepthFormat,
    isCube: boolean = false
  ) {}

  /**
   * 通过索引获取颜色纹理。
   * @param index
   */
  getColorTexture(index: number = 0): RenderColorTexture | null {
    return null;
  }
}
