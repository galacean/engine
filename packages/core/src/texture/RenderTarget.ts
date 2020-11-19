import { EngineObject } from "../base";
import { Engine } from "../Engine";
import { IPlatformRenderTarget } from "../renderingHardwareInterface";
import { RenderBufferDepthFormat } from "./enums/RenderBufferDepthFormat";
import { TextureCubeFace } from "./enums/TextureCubeFace";
import { RenderColorTexture } from "./RenderColorTexture";
import { RenderDepthTexture } from "./RenderDepthTexture";

/**
 * 用于离屏幕渲染的渲染目标。
 */
export class RenderTarget extends EngineObject {
  _platformRenderTarget: IPlatformRenderTarget;
  _colorTextures: RenderColorTexture[];
  _depth: RenderDepthTexture | RenderBufferDepthFormat | null;
  _antiAliasing: number;

  /** @internal */
  private _width: number;
  /** @internal */
  private _height: number;
  /** @internal */
  private _depthTexture: RenderDepthTexture | null;

  /** 渲染目标宽。 */
  get width(): number {
    return this._width;
  }

  /** 渲染目标高。 */
  get height(): number {
    return this._height;
  }

  /**
   * 颜色纹理数量。
   */
  get colorTextureCount(): number {
    return this._colorTextures.length;
  }

  /**
   * 深度纹理。
   */
  get depthTexture(): RenderDepthTexture | null {
    return this._depthTexture;
  }

  /**
   * 抗锯齿级别。
   * 如果设置的抗锯齿级别大于硬件支持的最大级别，将使用硬件的最大级别。
   */
  get antiAliasing(): number {
    return this._antiAliasing;
  }

  /**
   * 通过颜色纹理和深度格式创建渲染目标，使用内部深度缓冲，无法获取深度纹理。
   * @param engine - 所属引擎
   * @param width - 宽
   * @param height - 高
   * @param colorTexture - 颜色纹理
   * @param depthFormat - 深度格式,默认 RenderBufferDepthFormat.Depth,自动选择精度
   * @param antiAliasing - 抗锯齿级别,默认 1
   */
  constructor(
    engine: Engine,
    width: number,
    height: number,
    colorTexture: RenderColorTexture,
    depthFormat?: RenderBufferDepthFormat | null,
    antiAliasing?: number
  );

  /**
   * 通过颜色纹理和深度纹理创建渲染目标。不传颜色纹理时，只生成深度纹理。
   * @param engine - 所属引擎
   * @param width - 宽
   * @param height - 高
   * @param colorTexture - 颜色纹理
   * @param depthTexture - 深度纹理
   * @param antiAliasing - 抗锯齿级别,默认 1
   */
  constructor(
    engine: Engine,
    width: number,
    height: number,
    colorTexture: RenderColorTexture | null,
    depthTexture: RenderDepthTexture,
    antiAliasing?: number
  );

  /**
   * 通过颜色纹理数组和深度格式创建渲染目标，使用内部深度缓冲，无法获取深度纹理。
   * @param engine - 所属引擎
   * @param width - 宽
   * @param height - 高
   * @param colorTextures - 颜色纹理数组
   * @param depthFormat - 深度格式,默认 RenderBufferDepthFormat.Depth,自动选择精度
   * @param antiAliasing - 抗锯齿级别,默认 1
   */
  constructor(
    engine: Engine,
    width: number,
    height: number,
    colorTextures: RenderColorTexture[],
    depthFormat?: RenderBufferDepthFormat | null,
    antiAliasing?: number
  );

  /**
   * 通过颜色纹理数组和深度纹理创建渲染目标。
   * @param engine - 所属引擎
   * @param width - 宽
   * @param height - 高
   * @param colorTextures - 颜色纹理数组
   * @param depthTexture - 深度纹理
   * @param antiAliasing - 抗锯齿级别,默认 1
   */
  constructor(
    engine: Engine,
    width: number,
    height: number,
    colorTextures: RenderColorTexture[],
    depthTexture: RenderDepthTexture,
    antiAliasing?: number
  );

  /**
   * @internal
   */
  constructor(
    engine: Engine,
    width: number,
    height: number,
    renderTexture: RenderColorTexture | Array<RenderColorTexture> | null,
    depth: RenderDepthTexture | RenderBufferDepthFormat | null = RenderBufferDepthFormat.Depth,
    antiAliasing: number = 1
  ) {
    super(engine);

    this._width = width;
    this._height = height;
    this._antiAliasing = antiAliasing;
    this._depth = depth;

    if (renderTexture) {
      this._colorTextures = renderTexture instanceof Array ? renderTexture.slice() : [renderTexture];
    } else {
      this._colorTextures = [];
    }

    if (depth instanceof RenderDepthTexture) {
      this._depthTexture = depth;
    }

    this._platformRenderTarget = engine._hardwareRenderer.createPlatformRenderTarget(this);
  }

  /**
   * 通过索引获取颜色纹理。
   * @param index
   */
  public getColorTexture(index: number = 0): RenderColorTexture | null {
    return this._colorTextures[index];
  }

  /**
   * @override
   */
  destroy() {
    this._platformRenderTarget.destroy();
    this._platformRenderTarget = null;
    this._colorTextures.length = 0;
    this._depthTexture = null;
  }

  /**
   * 激活 RenderTarget 对象
   * 如果开启 MSAA,则激活 MSAA FBO,后续进行 this._blitRenderTarget() 进行交换 FBO
   * 如果未开启 MSAA,则激活主 FBO
   */
  public _activeRenderTarget(): void {
    this._platformRenderTarget._activeRenderTarget();
  }

  /**
   * 设置渲染到立方体纹理的哪个面
   * @param faceIndex - 立方体纹理面
   */
  public _setRenderTargetFace(faceIndex: TextureCubeFace): void {
    this._platformRenderTarget._setRenderTargetFace(faceIndex);
  }

  /**
   * Blit FBO.
   */
  public _blitRenderTarget(): void {
    this._platformRenderTarget._blitRenderTarget();
  }
}
