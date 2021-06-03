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
  private _autoMipmap: boolean = false;
  private _format: RenderBufferColorFormat;
  private _isCube: boolean = false;

  /**
   * Texture format.
   */
  get format(): RenderBufferColorFormat {
    return this._format;
  }

  /**
   * Whether to render to a cube texture.
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
    (this._platformTexture as IPlatformRenderColorTexture).getPixelBuffer(face, x, y, width, height, out);
  }

  /**
   * Setting pixels data through cube face,color buffer data, designated area and texture mipmapping level.
   * @param face - You can choose which cube face to write if it's cube texture
   * @param colorBuffer - Color buffer data
   * @param mipLevel - Texture mipmapping level
   * @param x - X coordinate of area start
   * @param y -  Y coordinate of area start
   * @param width - Data width.if it's empty, width is the width corresponding to mipLevel minus x , width corresponding to mipLevel is Math.max(1, this.width >> mipLevel)
   * @param height - Data height.if it's empty, height is the height corresponding to mipLevel minus y , height corresponding to mipLevel is Math.max(1, this.height >> mipLevel)
   */
  setPixelBuffer(
    face: TextureCubeFace | null,
    colorBuffer: ArrayBufferView,
    mipLevel: number = 0,
    x?: number,
    y?: number,
    width?: number,
    height?: number
  ): void {
    (this._platformTexture as IPlatformRenderColorTexture).setPixelBuffer(
      face,
      colorBuffer,
      mipLevel,
      x,
      y,
      width,
      height
    );
  }

  /**
   * Setting pixels data through cube face, TexImageSource, designated area and texture mipmapping level.
   * @param face - You can choose which cube face to write if it's cube texture
   * @param imageSource - The source of texture
   * @param mipLevel - Texture mipmapping level
   * @param flipY - Whether to flip the Y axis
   * @param premultipltAlpha - Whether to premultiply the transparent channel
   * @param x - X coordinate of area start
   * @param y - Y coordinate of area start
   */
  setImageSource(
    face: TextureCubeFace | null,
    imageSource: TexImageSource,
    mipLevel: number = 0,
    flipY: boolean = false,
    premultiplyAlpha: boolean = false,
    x?: number,
    y?: number
  ): void {
    (this._platformTexture as IPlatformRenderColorTexture).setImageSource(
      face,
      imageSource,
      mipLevel,
      flipY,
      premultiplyAlpha,
      x,
      y
    );
  }
}
