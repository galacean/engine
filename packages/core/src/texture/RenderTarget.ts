import { EngineObject } from "../base";
import { Engine } from "../Engine";
import { IPlatformRenderTarget } from "../renderingHardwareInterface";
import { TextureCubeFace } from "./enums/TextureCubeFace";
import { TextureFormat } from "./enums/TextureFormat";
import { Texture } from "./Texture";

/**
 * The render target used for off-screen rendering.
 */
export class RenderTarget extends EngineObject {
  /** @internal */
  _platformRenderTarget: IPlatformRenderTarget;

  /** @internal */
  _depth: Texture | TextureFormat | null;
  /** @internal */
  _antiAliasing: number;

  private _autoMipmap: boolean = false;
  private _width: number;
  private _height: number;
  private _colorTextures: Texture[];
  private _depthTexture: Texture | null;

  /**
   * Whether to automatically generate multi-level textures.
   */
  get autoGenerateMipmaps(): boolean {
    return this._autoMipmap;
  }

  set autoGenerateMipmaps(value: boolean) {
    this._autoMipmap = value;
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
   * @param depthFormat - Depth format. default RenderBufferDepthFormat.Depth, engine will automatically select the supported precision
   * @param antiAliasing - Anti-aliasing level, default is 1
   */
  constructor(
    engine: Engine,
    width: number,
    height: number,
    colorTexture: Texture,
    depthFormat?: TextureFormat | null,
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
   * @param depthFormat - Depth format. default RenderBufferDepthFormat.Depth,engine will automatically select the supported precision
   * @param antiAliasing - Anti-aliasing level, default is 1
   */
  constructor(
    engine: Engine,
    width: number,
    height: number,
    colorTextures: Texture[],
    depthFormat?: TextureFormat | null,
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
    renderTexture: Texture | Array<Texture> | null,
    depth: Texture | TextureFormat | null = TextureFormat.Depth,
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

    if (depth instanceof Texture) {
      this._depthTexture = depth;
    }

    this._platformRenderTarget = engine._hardwareRenderer.createPlatformRenderTarget(this);
  }

  /**
   *
   * Get the render color texture by index.
   * @param index
   */
  getColorTexture(index: number = 0): Texture | null {
    return this._colorTextures[index];
  }

  /**
   * Generate the mipmap of each attachment texture of the renderTarget according to the configuration.
   */
  generateMipmaps(): void {
    for (let i = 0, n = this._colorTextures.length; i < n; i++) {
      const colorTexture = this._colorTextures[i];
      if (this.autoGenerateMipmaps) {
        colorTexture.generateMipmaps();
      }
    }

    if (this.autoGenerateMipmaps) {
      this._depthTexture.generateMipmaps();
    }
  }

  /**
   * Destroy render target.
   */
  destroy() {
    this._platformRenderTarget.destroy();
    this._colorTextures.length = 0;
    this._depthTexture = null;
    this._depth = null;
  }

  /**
   * @internal
   */
  _setRenderTargetInfo(faceIndex: TextureCubeFace, mipLevel: number): void {
    this._platformRenderTarget.setRenderTargetInfo(faceIndex, mipLevel);
  }

  /**
   * @internal
   */
  _blitRenderTarget(): void {
    this._platformRenderTarget.blitRenderTarget();
  }
}
