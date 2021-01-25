import { Logger } from "../base/Logger";
import { Engine } from "../Engine";
import { RenderBufferColorFormat } from "./enums/RenderBufferColorFormat";
import { TextureCubeFace } from "./enums/TextureCubeFace";
import { TextureFilterMode } from "./enums/TextureFilterMode";
import { TextureWrapMode } from "./enums/TextureWrapMode";
import { Texture } from "./Texture";

/**
 * The texture is used for the output of color information in off-screen rendering.
 */
export class RenderColorTexture extends Texture {
  /** @internal */
  public _isCube: boolean = false;

  private _format: RenderBufferColorFormat;
  private _autoMipmap: boolean = false;

  /**
   * Render color texture format.
   * @readonly
   */
  get format(): RenderBufferColorFormat {
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
   * Create RenderColorTexture.
   * @param engine - Define the engine to use to render this color texture
   * @param width - Texture width
   * @param height - Texture height
   * @param format - Texture format. default RenderBufferColorFormat.R8G8B8A8
   * @param mipmap - Whether to use multi-level texture
   * @param isCube - Whether it's cube texture
   */
  constructor(
    engine: Engine,
    width: number,
    height: number,
    format: RenderBufferColorFormat = RenderBufferColorFormat.R8G8B8A8,
    mipmap: boolean = false,
    isCube: boolean = false
  ) {
    super(engine);
    const rhi = engine._hardwareRenderer;
    const gl: WebGLRenderingContext & WebGL2RenderingContext = rhi.gl;
    const isWebGL2: boolean = rhi.isWebGL2;

    if (!Texture._supportRenderBufferColorFormat(format, rhi)) {
      throw new Error(`RenderBufferColorFormat is not supported:${RenderBufferColorFormat[format]}`);
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
    this._formatDetail = Texture._getRenderBufferColorFormatDetail(format, gl, isWebGL2);
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

  /**
   * Get the pixel color buffer according to the specified cube face and area.
   * @param face - You can choose which cube face to read if it's cube texture
   * @param x - X coordinate of area start
   * @param y - Y coordinate of area start
   * @param width - Area width
   * @param height - Area height
   * @param out - Color buffer
   */
  public getPixelBuffer(
    face: TextureCubeFace | null,
    x: number,
    y: number,
    width: number,
    height: number,
    out: ArrayBufferView
  ): void {
    super._getPixelBuffer(face, x, y, width, height, out);
  }
}
