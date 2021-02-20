import { Engine } from "../Engine";
import { IPlatformRenderDepthTexture } from "../renderingHardwareInterface";
import { RenderBufferDepthFormat } from "./enums/RenderBufferDepthFormat";
import { TextureFilterMode } from "./enums/TextureFilterMode";
import { TextureWrapMode } from "./enums/TextureWrapMode";
import { Texture } from "./Texture";

/**
 * The texture is used for the output of depth information in off-screen rendering.
 */
export class RenderDepthTexture extends Texture {
  /**
   * @override
   * @internal
   */
  _platformTexture: IPlatformRenderDepthTexture;

  private _autoMipmap: boolean = false;
  private _format: RenderBufferDepthFormat;
  private _isCube: boolean = false;

  /**
   * Texture format.
   * @readonly
   */
  get format(): RenderBufferDepthFormat {
    return this._format;
  }

  /**
   * Whether to render to a cube texture.
   * @readonly
   */
  get isCube(): boolean {
    return this._isCube;
  }

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
   * Create RenderDepthTexture.
   * @param engine - Define the engine to use to render this depth texture
   * @param width - Texture width
   * @param height - Texture height
   * @param format - Texture format. default RenderBufferDepthFormat.Depth, engine will automatically select the supported precision
   * @param mipmap - Whether to use multi-level texture
   * @param isCube - Whether it's cube texture
   */
  constructor(
    engine: Engine,
    width: number,
    height: number,
    format: RenderBufferDepthFormat = RenderBufferDepthFormat.Depth,
    mipmap: boolean = false,
    isCube: boolean = false
  ) {
    super(engine);

    this._isCube = isCube;
    this._mipmap = mipmap;
    this._width = width;
    this._height = height;
    this._format = format;
    this._mipmapCount = this._getMipmapCount();

    this._platformTexture = engine._hardwareRenderer.createPlatformRenderDepthTexture(this);

    this.filterMode = TextureFilterMode.Bilinear;
    this.wrapModeU = this.wrapModeV = TextureWrapMode.Clamp;
  }
}
