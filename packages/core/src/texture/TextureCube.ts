import { Engine } from "../Engine";
import { IPlatformTextureCube } from "../renderingHardwareInterface";
import { TextureCubeFace } from "./enums/TextureCubeFace";
import { TextureFilterMode } from "./enums/TextureFilterMode";
import { TextureFormat } from "./enums/TextureFormat";
import { TextureWrapMode } from "./enums/TextureWrapMode";
import { Texture } from "./Texture";

/**
 * Cube texture.
 */
export class TextureCube extends Texture {
  /**
   * Create TextureCube.
   * @param engine - Define the engine to use to render this texture
   * @param size - Texture size. texture width must be equal to height in cube texture
   * @param format - Texture format,default TextureFormat.R8G8B8A8
   * @param mipmap - Whether to use multi-level texture
   * @param isSRGBColorSpace - Whether the texture data is in sRGB color space. @defaultValue `true`
   */
  constructor(engine: Engine, size: number, format = TextureFormat.R8G8B8A8, mipmap = true, isSRGBColorSpace = true) {
    super(engine);

    this._mipmap = mipmap;
    this._width = size;
    this._height = size;
    this._format = format;
    this._mipmapCount = this._getMipmapCount();
    this._isSRGBColorSpace = isSRGBColorSpace;

    this._platformTexture = engine._hardwareRenderer.createPlatformTextureCube(this);

    this.filterMode = TextureFilterMode.Bilinear;
    this.wrapModeU = this.wrapModeV = TextureWrapMode.Clamp;
  }

  /**
   * Setting pixels data through cube face,color buffer data, designated area and texture mipmapping level,it's also applicable to compressed formats.
   * @remarks When compressed texture is in WebGL1, the texture must be filled first before writing the sub-region
   * @param face - Cube face
   * @param colorBuffer - Color buffer data
   * @param mipLevel - Texture mipmapping level
   * @param x - X coordinate of area start
   * @param y -  Y coordinate of area start
   * @param width - Data width.if it's empty, width is the width corresponding to mipLevel minus x , width corresponding to mipLevel is Math.max(1, this.width >> mipLevel)
   * @param height - Data height.if it's empty, height is the height corresponding to mipLevel minus y , height corresponding to mipLevel is Math.max(1, this.height >> mipLevel)
   */
  setPixelBuffer(
    face: TextureCubeFace,
    colorBuffer: ArrayBufferView,
    mipLevel: number = 0,
    x: number = 0,
    y: number = 0,
    width?: number,
    height?: number
  ): void {
    (this._platformTexture as IPlatformTextureCube).setPixelBuffer(face, colorBuffer, mipLevel, x, y, width, height);
    this._isContentLost = false;
  }

  /**
   * Setting pixels data through cube face, TexImageSource, designated area and texture mipmapping level.
   * @param face - Cube face
   * @param imageSource - The source of texture
   * @param mipLevel - Texture mipmapping level
   * @param flipY - Whether to flip the Y axis
   * @param premultiplyAlpha - Whether to premultiply the transparent channel
   * @param x - X coordinate of area start
   * @param y - Y coordinate of area start
   */
  setImageSource(
    face: TextureCubeFace,
    imageSource: TexImageSource,
    mipLevel: number = 0,
    flipY: boolean = false,
    premultiplyAlpha: boolean = false,
    x: number = 0,
    y: number = 0
  ): void {
    (this._platformTexture as IPlatformTextureCube).setImageSource(
      face,
      imageSource,
      mipLevel,
      flipY,
      premultiplyAlpha,
      x,
      y
    );
    this._isContentLost = false;
  }

  /**
   * Get pixel color buffer.
   * @param out - Color buffer
   */
  getPixelBuffer(face: TextureCubeFace, out: ArrayBufferView): void;

  /**
   * Get the pixel color buffer according to the specified mip level.
   * @param mipLevel - Tet mip level want to get
   * @param out - Color buffer
   */
  getPixelBuffer(face: TextureCubeFace, mipLevel: number, out: ArrayBufferView): void;

  /**
   * Get the pixel color buffer according to the specified area.
   * @param x - X coordinate of area start
   * @param y - Y coordinate of area start
   * @param width - Area width
   * @param height - Area height
   * @param out - Color buffer
   */
  getPixelBuffer(
    face: TextureCubeFace,
    x: number,
    y: number,
    width: number,
    height: number,
    out: ArrayBufferView
  ): void;

  /**
   * Get the pixel color buffer according to the specified area and mip level.
   * @param x - X coordinate of area start
   * @param y - Y coordinate of area start
   * @param width - Area width
   * @param height - Area height
   * @param mipLevel - Tet mip level want to get
   * @param out - Color buffer
   */
  getPixelBuffer(
    face: TextureCubeFace,
    x: number,
    y: number,
    width: number,
    height: number,
    mipLevel: number,
    out: ArrayBufferView
  ): void;

  getPixelBuffer(
    face: TextureCubeFace,
    xOrMipLevelOrOut: number | ArrayBufferView,
    yOrMipLevel?: number | ArrayBufferView,
    width?: number,
    height?: number,
    mipLevelOrOut?: number | ArrayBufferView,
    out?: ArrayBufferView
  ): void {
    const argsLength = arguments.length;
    if (argsLength === 2) {
      (this._platformTexture as IPlatformTextureCube).getPixelBuffer(
        face,
        0,
        0,
        this._width,
        this._height,
        0,
        <ArrayBufferView>xOrMipLevelOrOut
      );
    } else if (argsLength === 3) {
      (this._platformTexture as IPlatformTextureCube).getPixelBuffer(
        face,
        0,
        0,
        this._width >> (<number>xOrMipLevelOrOut),
        this._height >> (<number>xOrMipLevelOrOut),
        <number>xOrMipLevelOrOut,
        <ArrayBufferView>yOrMipLevel
      );
    } else if (argsLength === 6) {
      (this._platformTexture as IPlatformTextureCube).getPixelBuffer(
        face,
        <number>xOrMipLevelOrOut,
        <number>yOrMipLevel,
        width,
        height,
        0,
        <ArrayBufferView>mipLevelOrOut
      );
    } else if (argsLength === 7) {
      (this._platformTexture as IPlatformTextureCube).getPixelBuffer(
        face,
        <number>xOrMipLevelOrOut,
        <number>yOrMipLevel,
        width,
        height,
        <number>mipLevelOrOut,
        out
      );
    }
  }

  /**
   * @internal
   */
  override _rebuild(): void {
    this._platformTexture = this._engine._hardwareRenderer.createPlatformTextureCube(this);
    super._rebuild();
  }
}
