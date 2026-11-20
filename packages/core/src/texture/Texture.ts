import { GraphicsResource } from "../asset/GraphicsResource";
import { Logger } from "../base/Logger";
import { Engine } from "../Engine";
import { IPlatformTexture } from "../renderingHardwareInterface";
import { SystemInfo } from "../SystemInfo";
import { TextureDepthCompareFunction } from "./enums/TextureDepthCompareFunction";
import { TextureFilterMode } from "./enums/TextureFilterMode";
import { TextureFormat } from "./enums/TextureFormat";
import { TextureUsage } from "./enums/TextureUsage";
import { TextureWrapMode } from "./enums/TextureWrapMode";

/**
 * Base class for textures, holding format, base dimensions, mipmap count, and sampler state.
 */
export abstract class Texture extends GraphicsResource {
  name: string;

  /** @internal */
  _platformTexture: IPlatformTexture;
  /** @internal */
  _mipmap: boolean;
  /** @internal */
  _isDepthTexture: boolean = false;
  /** @internal */
  _memorySize: number = 0;

  protected _format: TextureFormat;
  protected _width: number;
  protected _height: number;
  protected _usage: TextureUsage;
  protected _mipmapCount: number;
  protected _isSRGBColorSpace: boolean;

  private _wrapModeU: TextureWrapMode;
  private _wrapModeV: TextureWrapMode;
  private _filterMode: TextureFilterMode;
  private _anisoLevel: number = 1;
  private _depthCompareFunction: TextureDepthCompareFunction;
  private _useDepthCompareMode: boolean = false;

  /**
   * Whether texels are stored in sRGB rather than linear color space.
   */
  get isSRGBColorSpace() {
    return this._isSRGBColorSpace;
  }

  /**
   * Pixel storage format of the texture.
   */
  get format(): TextureFormat {
    return this._format;
  }

  /**
   * Width of mip level `0`, in pixels.
   */
  get width(): number {
    return this._width;
  }

  /**
   * Height of mip level `0`, in pixels.
   */
  get height(): number {
    return this._height;
  }

  /**
   * Upload frequency hint for the texture.
   */
  get usage(): TextureUsage {
    return this._usage;
  }

  /**
   * Wrapping mode for texture coordinate S.
   */
  get wrapModeU(): TextureWrapMode {
    return this._wrapModeU;
  }

  set wrapModeU(value: TextureWrapMode) {
    if (value === this._wrapModeU) return;
    this._wrapModeU = value;

    this._platformTexture.wrapModeU = value;
  }

  /**
   * Wrapping mode for texture coordinate T.
   */
  get wrapModeV(): TextureWrapMode {
    return this._wrapModeV;
  }

  set wrapModeV(value: TextureWrapMode) {
    if (value === this._wrapModeV) return;
    this._wrapModeV = value;

    this._platformTexture.wrapModeV = value;
  }

  /**
   * Number of mip levels; `1` when mipmapping is disabled.
   */
  get mipmapCount(): number {
    return this._mipmapCount;
  }

  /**
   * Sampling filter mode.
   * @remarks
   * Integer formats (`TextureFormat.R32G32B32A32_UInt`) only accept `TextureFilterMode.Point`; other modes log a warning and are ignored.
   * For 32-bit float formats, linear modes are kept on this property and fall back to `TextureFilterMode.Point` when sampling if the device does not support linear float filtering.
   */
  get filterMode(): TextureFilterMode {
    return this._filterMode;
  }

  set filterMode(value: TextureFilterMode) {
    if (value === this._filterMode) return;

    if (value !== TextureFilterMode.Point && this._isIntFormat()) {
      value = TextureFilterMode.Point;
      Logger.warn(`Int or UInt format texture only support TextureFilterMode.Point`);
      return;
    }

    this._filterMode = value;

    this._platformTexture.filterMode = value;
  }

  /**
   * Anisotropic level for texture.
   * @defaultValue `1`
   * @remarks Values below `1` are clamped to `1`; values above the device limit are kept on this property and clamped when sampling.
   */
  get anisoLevel(): number {
    return this._anisoLevel;
  }

  set anisoLevel(value: number) {
    if (value < 1) {
      Logger.warn(`anisoLevel:${value}, must be greater than 0, and is automatically downgraded to 1`);
      value = 1;
    }

    if (value === this._anisoLevel) return;

    this._anisoLevel = value;

    this._platformTexture.anisoLevel = value;
  }

  /**
   * Comparison function used when sampling this texture as a shadow depth map.
   * @remarks Kept on this property across backends, and takes effect only for depth formats sampled with comparison.
   */
  get depthCompareFunction(): TextureDepthCompareFunction {
    return this._depthCompareFunction;
  }

  set depthCompareFunction(value: TextureDepthCompareFunction) {
    if (value !== this._depthCompareFunction) {
      this._depthCompareFunction = value;
      this._platformTexture.depthCompareFunction = value;
    }
  }

  /**
   * Initialize base texture metadata and validate format support.
   * @param engine - Owning engine instance
   * @param width - Width of mip level `0` in pixels
   * @param height - Height of mip level `0` in pixels
   * @param format - Pixel storage format
   * @param mipmap - Whether to allocate a full mip chain down to `1x1`
   * @param isSRGBColorSpace - Whether texels use sRGB rather than linear encoding
   * @throws If `format` is not supported by `engine`.
   */
  constructor(
    engine: Engine,
    width: number,
    height: number,
    format: TextureFormat,
    mipmap: boolean,
    isSRGBColorSpace: boolean
  ) {
    if (!SystemInfo.supportsTextureFormat(engine, format)) {
      throw new Error(`Texture format is not supported:${TextureFormat[format]}`);
    }

    super(engine);

    this._width = width;
    this._height = height;
    this._format = format;
    this._mipmap = mipmap;
    this._isSRGBColorSpace = isSRGBColorSpace;

    this._mipmapCount = this._getMipmapCount();
  }

  /**
   * Regenerate mip levels `1..mipmapCount - 1` from mip level `0`. No-op if mipmapping is disabled.
   */
  generateMipmaps(): void {
    if (!this._mipmap) return;

    this._platformTexture.generateMipmaps();
  }

  /**
   * @internal
   */
  _setUseDepthCompareMode(value: boolean): void {
    if (this._useDepthCompareMode !== value) {
      this._platformTexture.setUseDepthCompareMode(value);
      this._useDepthCompareMode = value;
    }
  }

  /**
   * @internal
   */
  override _rebuild(): void {
    const platformTexture = this._platformTexture;
    platformTexture.wrapModeU = this._wrapModeU;
    platformTexture.wrapModeV = this._wrapModeV;
    platformTexture.filterMode = this._filterMode;
    platformTexture.anisoLevel = this._anisoLevel;
    platformTexture.depthCompareFunction = this._depthCompareFunction;
    platformTexture.setUseDepthCompareMode(this._useDepthCompareMode);
  }

  /**
   * @internal
   */
  protected override _onDestroy() {
    super._onDestroy();
    if (!this._engine._isDeviceLost) {
      this._engine._renderingStatistics._textureMemory -= this._memorySize;
    }
    this._platformTexture?.destroy();
    this._platformTexture = null!;
  }

  /**
   * Maximum 0-based mip level for a dimension of `size` pixels, rounding down.
   * @remarks http://download.nvidia.com/developer/Papers/2005/NP2_Mipmapping/NP2_Mipmap_Creation.pdf
   */
  protected _getMaxMiplevel(size: number): number {
    return Math.floor(Math.log2(size));
  }

  protected _getMipmapCount(): number {
    return this._mipmap ? Math.floor(Math.log2(Math.max(this._width, this._height))) + 1 : 1;
  }

  protected _isIntFormat(): boolean {
    if (TextureFormat.R32G32B32A32_UInt === this._format) {
      return true;
    }
    return false;
  }
}
