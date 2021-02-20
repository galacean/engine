import { Engine } from "../Engine";
import { IPlatformRenderColorTexture } from "../renderingHardwareInterface";
import { RenderBufferColorFormat } from "./enums/RenderBufferColorFormat";
import { TextureCubeFace } from "./enums/TextureCubeFace";
import { TextureFilterMode } from "./enums/TextureFilterMode";
import { TextureWrapMode } from "./enums/TextureWrapMode";
import { Texture } from "./Texture";

/**
 * The texture is used for the output of color information in off-screen rendering.
 */
export class RenderColorTexture extends Texture {
  /**
   * @override
   * @internal
   */
  _platformTexture: IPlatformRenderColorTexture;

  private _autoMipmap: boolean = false;
  private _format: RenderBufferColorFormat;
  private _isCube: boolean = false;

  /**
   * Texture format.
   * @readonly
   */
  get format(): RenderBufferColorFormat {
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

    this._isCube = isCube;
    this._mipmap = mipmap;
    this._width = width;
    this._height = height;
    this._format = format;
    this._mipmapCount = this._getMipmapCount();

    this._platformTexture = engine._hardwareRenderer.createPlatformRenderColorTexture(this);

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
    this._platformTexture.getPixelBuffer(face, x, y, width, height, out);
  }
}
