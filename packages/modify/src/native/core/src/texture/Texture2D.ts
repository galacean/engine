import { Engine } from "../Engine";
import { IPlatformTexture2D } from "../renderingHardwareInterface";
import { TextureFilterMode } from "./enums/TextureFilterMode";
import { TextureFormat } from "./enums/TextureFormat";
import { TextureUsage } from "./enums/TextureUsage";
import { TextureWrapMode } from "./enums/TextureWrapMode";
import { Texture, type TextureReadArguments } from "./Texture";
import { TextureUtils } from "./TextureUtils";

/**
 * Two-dimensional texture.
 */
export class Texture2D extends Texture {
  /**
   * Create Texture2D.
   * @param engine - Define the engine to use to render this texture
   * @param width - Texture width
   * @param height - Texture height
   * @param format - Texture format. default `TextureFormat.R8G8B8A8_UNorm`
   * @param mipmap - Whether to use multi-level texture
   * @param isSRGBColorSpace - Whether the texture data is in sRGB color space, otherwise is linear color space. @defaultValue `true`
   * @param usage - Texture usage
   */
  constructor(
    engine: Engine,
    width: number,
    height: number,
    format = TextureFormat.R8G8B8A8_UNorm,
    mipmap = true,
    isSRGBColorSpace = true,
    usage = TextureUsage.Static
  ) {
    super(engine, width, height, format, mipmap, isSRGBColorSpace);

    this._usage = usage;
    this._platformTexture = engine._hardwareRenderer.createPlatformTexture2D(this);
    this.filterMode = this._isIntFormat() ? TextureFilterMode.Point : TextureFilterMode.Bilinear;
    this.wrapModeU = this.wrapModeV = TextureWrapMode.Repeat;

    this._memorySize = TextureUtils.getTextureByteCount(format, width, height, this._mipmapCount, 1);
    if (!engine._isDeviceLost) {
      engine._renderingStatistics._textureMemory += this._memorySize;
    }
  }

  /**
   * Setting pixels data through color buffer data, designated area and texture mipmapping level,it's also applicable to compressed formats.
   * @param colorBuffer - Color buffer data
   * @param mipLevel - Texture mipmapping level
   * @param x - X coordinate of area start
   * @param y - Y coordinate of area start
   * @param width - Data width. if it's empty, width is the width corresponding to mipLevel minus x , width corresponding to mipLevel is Math.max(1, this.width >> mipLevel)
   * @param height - Data height. if it's empty, height is the height corresponding to mipLevel minus y , height corresponding to mipLevel is Math.max(1, this.height >> mipLevel)
   */
  setPixelBuffer(
    colorBuffer: ArrayBufferView,
    mipLevel: number = 0,
    x: number = 0,
    y: number = 0,
    width?: number,
    height?: number
  ): void {
    (this._platformTexture as IPlatformTexture2D).setPixelBuffer(colorBuffer, mipLevel, x, y, width, height);
    this._isContentLost = false;
  }

  /**
   * Setting pixels data through TexImageSource, designated area and texture mipmapping level.
   * @param imageSource - The source of texture
   * @param mipLevel - Texture mipmapping level
   * @param flipY - Whether to flip the Y axis
   * @param premultiplyAlpha - Whether to premultiply the transparent channel
   * @param x - X coordinate of area start
   * @param y - Y coordinate of area start
   */
  setImageSource(
    imageSource: TexImageSource,
    mipLevel: number = 0,
    flipY: boolean = false,
    premultiplyAlpha: boolean = false,
    x: number = 0,
    y: number = 0
  ): void {
    (this._platformTexture as IPlatformTexture2D).setImageSource(imageSource, mipLevel, flipY, premultiplyAlpha, x, y);
    this._isContentLost = false;
  }

  /**
   * Get pixel color buffer.
   * @param out - Color buffer
   */
  getPixelBuffer(out: ArrayBufferView): void;

  /**
   * Get the pixel color buffer according to the specified mip level.
   * @param mipLevel - Tet mip level want to get
   * @param out - Color buffer
   */
  getPixelBuffer(mipLevel: number, out: ArrayBufferView): void;

  /**
   * Get the pixel color buffer according to the specified area.
   * @param x - X coordinate of area start
   * @param y - Y coordinate of area start
   * @param width - Area width
   * @param height - Area height
   * @param out - Color buffer
   */
  getPixelBuffer(x: number, y: number, width: number, height: number, out: ArrayBufferView): void;

  /**
   * Get the pixel color buffer according to the specified area and mip level.
   * @param x - X coordinate of area start
   * @param y - Y coordinate of area start
   * @param width - Area width
   * @param height - Area height
   * @param mipLevel - Tet mip level want to get
   * @param out - Color buffer
   */
  getPixelBuffer(x: number, y: number, width: number, height: number, mipLevel: number, out: ArrayBufferView): void;

  getPixelBuffer(...args: TextureReadArguments): void {
    const region = this._readRegion(args);
    (this._platformTexture as IPlatformTexture2D).getPixelBuffer(...region);
  }

  /** Read mip zero, optionally cancelling the caller's read while GPU work completes. */
  getPixelBufferAsync(out: ArrayBufferView, signal?: AbortSignal): Promise<void>;
  /** Read a region after all previously encoded draws and copies are available. */
  getPixelBufferAsync(...args: TextureReadArguments): Promise<void>;
  async getPixelBufferAsync(...args: TextureReadArguments | [ArrayBufferView, AbortSignal?]): Promise<void> {
    const first = args[0];
    const wholeImage = ArrayBuffer.isView(first);
    const signal = wholeImage ? (args[1] as AbortSignal | undefined) : undefined;
    signal?.throwIfAborted();
    const platform = this._platformTexture as IPlatformTexture2D;
    if (wholeImage && platform.getPixelBufferAsyncRGBA8 && first instanceof Uint8Array) {
      if (
        this.destroyed ||
        this.format !== TextureFormat.R8G8B8A8_UNorm ||
        first.byteLength < this.width * this.height * 4
      ) {
        throw new Error("Async readback requires a live RGBA8 texture and a sufficient Uint8Array");
      }
      return platform.getPixelBufferAsyncRGBA8(first, signal);
    }
    const region = this._readRegion(wholeImage ? [first] : (args as TextureReadArguments));
    if (platform.getPixelBufferAsync) await platform.getPixelBufferAsync(...region);
    else platform.getPixelBuffer(...region);
    signal?.throwIfAborted();
  }

  /**
   * Whether the active graphics backend supports restricting mipmap sampling range.
   * @internal
   */
  _supportsMipLevelRange(): boolean {
    return typeof (this._platformTexture as IPlatformTexture2D)?.setMipLevelRange === "function";
  }

  /**
   * Restricts the platform texture's mipmap sampling range (`TEXTURE_BASE_LEVEL` / `TEXTURE_MAX_LEVEL`).
   * Returns `true` when applied by the active graphics backend.
   * @internal
   */
  _setMipLevelRange(baseLevel: number, maxLevel: number): boolean {
    const platformTexture = this._platformTexture as IPlatformTexture2D;
    if (typeof platformTexture?.setMipLevelRange === "function") {
      platformTexture.setMipLevelRange(baseLevel, maxLevel);
      return true;
    }
    return false;
  }

  /**
   * @internal
   */
  override _rebuild(): void {
    this._platformTexture = this._engine._hardwareRenderer.createPlatformTexture2D(this);
    this._engine._renderingStatistics._textureMemory += this._memorySize;
    super._rebuild();
  }
}
