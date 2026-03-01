import { GraphicsResource } from "../asset/GraphicsResource";
import { Engine } from "../Engine";
import { IPlatformRenderTarget } from "../renderingHardwareInterface";
import { RenderBufferDepthFormat } from "./enums/RenderBufferDepthFormat";
import { TextureFormat } from "./enums/TextureFormat";
import { Texture } from "./Texture";
import { TextureUtils } from "./TextureUtils";

/**
 * The render target used for off-screen rendering.
 */
export class RenderTarget extends GraphicsResource {
  /** @internal */
  _platformRenderTarget: IPlatformRenderTarget;

  /** @internal */
  _depth: Texture | TextureFormat | null;
  /** @internal */
  _antiAliasing: number;
  /** @internal */
  _depthFormat: TextureFormat | null = null;

  private _autoGenerateMipmaps: boolean = true;
  private _width: number;
  private _height: number;
  private _colorTextures: Texture[];
  private _depthTexture: Texture | null = null;
  private _renderbufferGpuMemorySize: number = 0;

  /**
   * Whether to automatically generate multi-level textures.
   */
  get autoGenerateMipmaps(): boolean {
    return this._autoGenerateMipmaps;
  }

  set autoGenerateMipmaps(value: boolean) {
    this._autoGenerateMipmaps = value;
  }

  /**
   * Render target width.
   */
  get width(): number {
    return this._width;
  }

  /**
   * Render target height.
   */
  get height(): number {
    return this._height;
  }

  /**
   * Render color texture count.
   */
  get colorTextureCount(): number {
    return this._colorTextures.length;
  }

  /**
   * Depth texture.
   */
  get depthTexture(): Texture | null {
    return this._depthTexture;
  }

  /**
   * Anti-aliasing level.
   * @remarks If the anti-aliasing level set is greater than the maximum level supported by the hardware, the maximum level of the hardware will be used.
   */
  get antiAliasing(): number {
    return this._antiAliasing;
  }

  /**
   * Create a render target through color texture and depth format.
   * @param engine - Define the engine to use for this off-screen rendering
   * @param width - Render target width
   * @param height - Render target height
   * @param colorTexture - Render color texture
   * @param depthFormat - Depth format. default TextureFormat.Depth, engine will automatically select the supported precision
   * @param antiAliasing - Anti-aliasing level, default is 1
   */
  constructor(
    engine: Engine,
    width: number,
    height: number,
    colorTexture: Texture,
    depthFormat?: TextureFormat | null | RenderBufferDepthFormat,
    antiAliasing?: number
  );

  /**
   * Create a render target through color texture and depth format.
   * @remarks If the color texture is not transmitted, only the depth texture is generated.
   * @param engine - Define the engine to use for this off-screen rendering
   * @param width - Render target width
   * @param height - Render target height
   * @param colorTexture - Render color texture
   * @param depthTexture - Render depth texture
   * @param antiAliasing - Anti-aliasing level, default is 1
   */
  constructor(
    engine: Engine,
    width: number,
    height: number,
    colorTexture: Texture | null,
    depthTexture: Texture,
    antiAliasing?: number
  );

  /**
   * Create a render target with color texture array and depth format.
   * @param engine - Define the engine to use for this off-screen rendering
   * @param width - Render target width
   * @param height - Render target height
   * @param colorTextures - Render color texture array
   * @param depthFormat - Depth format. default TextureFormat.Depth,engine will automatically select the supported precision
   * @param antiAliasing - Anti-aliasing level, default is 1
   */
  constructor(
    engine: Engine,
    width: number,
    height: number,
    colorTextures: Texture[],
    depthFormat?: TextureFormat | null | RenderBufferDepthFormat,
    antiAliasing?: number
  );

  /**
   * Create a render target with color texture array and depth texture.
   * @param engine - Define the engine to use for this off-screen rendering
   * @param width - Render target width
   * @param height - Render target height
   * @param colorTextures - Render color texture array
   * @param depthTexture - Depth texture
   * @param antiAliasing - Anti-aliasing level, default is 1
   */
  constructor(
    engine: Engine,
    width: number,
    height: number,
    colorTextures: Texture[],
    depthTexture: Texture,
    antiAliasing?: number
  );

  /**
   * @internal
   */
  constructor(
    engine: Engine,
    width: number,
    height: number,
    renderTexture: Texture | Texture[] | null,
    depth: Texture | null | TextureFormat | RenderBufferDepthFormat = TextureFormat.Depth,
    antiAliasing: number = 1
  ) {
    super(engine);

    this._width = width;
    this._height = height;
    this._antiAliasing = antiAliasing;
    this._depth = <Texture | null | TextureFormat>depth;

    if (renderTexture) {
      const colorTextures = renderTexture instanceof Array ? renderTexture.slice() : [renderTexture];
      for (let i = 0, n = colorTextures.length; i < n; i++) {
        const colorTexture = colorTextures[i];
        if (colorTexture._isDepthTexture) {
          throw "Render texture can't use depth format.";
        }
        colorTexture._addReferCount(1);
      }
      this._colorTextures = colorTextures;
    } else {
      this._colorTextures = [];
    }

    if (depth instanceof Texture) {
      if (!depth._isDepthTexture) {
        throw "Depth texture must use depth format.";
      }
      this._depthTexture = depth;
      this._depthTexture._addReferCount(1);
      this._depthFormat = depth.format;
    } else if (typeof depth === "number") {
      this._depthFormat = <TextureFormat>depth;
    }

    // Create platform render target first, which may downgrade antiAliasing to device max
    this._platformRenderTarget = engine._hardwareRenderer.createPlatformRenderTarget(this);

    // Calculate renderbuffer memory after platform creation, using the actual (possibly downgraded) antiAliasing
    const renderbufferMemory = this._calculateRenderbufferMemory();
    this._renderbufferGpuMemorySize = renderbufferMemory;
    engine._renderingStatistics._textureMemory += renderbufferMemory;
  }

  /**
   * Get the render color texture by index.
   * @param index - Render color texture index
   */
  getColorTexture(index: number = 0): Texture | null {
    return this._colorTextures[index] ?? null;
  }

  /**
   * Generate the mipmap of each attachment texture of the renderTarget according to the configuration.
   */
  generateMipmaps(): void {
    if (this._autoGenerateMipmaps) {
      const colorTextures = this._colorTextures;
      for (let i = 0, n = colorTextures.length; i < n; i++) {
        const colorTexture = colorTextures[i];
        colorTexture.generateMipmaps();
      }
      this._depthTexture && this._depthTexture.generateMipmaps();
    }
  }

  /**
   * @internal
   */
  protected override _onDestroy(): void {
    super._onDestroy();
    if (!this._isContentLost) {
      this._engine._renderingStatistics._textureMemory -= this._renderbufferGpuMemorySize;
    }
    this._platformRenderTarget.destroy();
    const { _colorTextures: colorTextures } = this;
    for (let i = 0, n = colorTextures.length; i < n; i++) {
      colorTextures[i]._addReferCount(-1);
    }
    colorTextures.length = 0;
    this._depthTexture?._addReferCount(-1);
    this._depthTexture = null;
    this._depth = null;
  }

  /**
   * @internal
   */
  _blitRenderTarget(): void {
    this._platformRenderTarget.blitRenderTarget();
  }

  /**
   * @internal
   */
  override _rebuild(): void {
    this._platformRenderTarget = this._engine._hardwareRenderer.createPlatformRenderTarget(this);
    this._renderbufferGpuMemorySize = this._calculateRenderbufferMemory();
    this._engine._renderingStatistics._textureMemory += this._renderbufferGpuMemorySize;
  }

  private _calculateRenderbufferMemory(): number {
    const { _antiAliasing: antiAliasing, _depth: depth, _width: width, _height: height } = this;
    let memory = 0;

    // MSAA color renderbuffers
    if (antiAliasing > 1) {
      const colorTextures = this._colorTextures;
      for (let i = 0, n = colorTextures.length; i < n; i++) {
        memory += TextureUtils.getMipLevelByteCount(colorTextures[i].format, width, height) * antiAliasing;
      }
    }

    // Depth renderbuffer
    if (depth !== null) {
      if (depth instanceof Texture) {
        // When MSAA is enabled, a separate MSAA depth RBO is allocated even if depth is a texture
        if (antiAliasing > 1) {
          memory += TextureUtils.getMipLevelByteCount(depth.format, width, height) * antiAliasing;
        }
      } else if (typeof depth === "number") {
        if (antiAliasing > 1) {
          // MSAA depth RBO (non-MSAA depth RBO is skipped when antiAliasing > 1)
          memory += TextureUtils.getMipLevelByteCount(<TextureFormat>depth, width, height) * antiAliasing;
        } else {
          // Non-MSAA depth RBO
          memory += TextureUtils.getMipLevelByteCount(<TextureFormat>depth, width, height);
        }
      }
    }

    return memory;
  }
}
