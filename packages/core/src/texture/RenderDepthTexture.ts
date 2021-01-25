import { Logger } from "../base/Logger";
import { Engine } from "../Engine";
import { RenderBufferDepthFormat } from "./enums/RenderBufferDepthFormat";
import { TextureFilterMode } from "./enums/TextureFilterMode";
import { TextureWrapMode } from "./enums/TextureWrapMode";
import { Texture } from "./Texture";

/**
 * The texture is used for the output of depth information in off-screen rendering.
 */
export class RenderDepthTexture extends Texture {
  /** @internal */
  public _isCube: boolean = false;

  private _format: RenderBufferDepthFormat;
  private _autoMipmap: boolean = false;

  /**
   * Render depth texture format.
   */
  get format(): RenderBufferDepthFormat {
    return this._format;
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
    const rhi = engine._hardwareRenderer;
    const gl: WebGLRenderingContext & WebGL2RenderingContext = rhi.gl;
    const isWebGL2: boolean = rhi.isWebGL2;

    if (!Texture._supportRenderBufferDepthFormat(format, rhi, true)) {
      throw new Error(`RenderBufferDepthFormat is not supported:${RenderBufferDepthFormat[format]}`);
    }

    if (isCube && width !== height) {
      throw new Error("The cube texture must have the same width and height");
    }
    if (mipmap && !isWebGL2 && (!Texture._isPowerOf2(width) || !Texture._isPowerOf2(height))) {
      Logger.warn(
        "non-power-2 texture is not supported for mipmap in WebGL1,and has automatically downgraded to non-mipmap"
      );
      mipmap = false;
    }

    this._glTexture = gl.createTexture();
    this._formatDetail = Texture._getRenderBufferDepthFormatDetail(format, gl, isWebGL2);
    this._isCube = isCube;
    this._rhi = rhi;
    this._target = isCube ? gl.TEXTURE_CUBE_MAP : gl.TEXTURE_2D;
    this._mipmap = mipmap;
    this._width = width;
    this._height = height;
    this._format = format;
    this._mipmapCount = this._getMipmapCount();

    this._initMipmap(isCube);

    this.filterMode = TextureFilterMode.Bilinear;
    this.wrapModeU = this.wrapModeV = TextureWrapMode.Clamp;
  }
}
