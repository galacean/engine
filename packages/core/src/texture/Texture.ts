import { GraphicsResource } from "../asset/GraphicsResource";
import { Logger } from "../base/Logger";
import { IPlatformTexture } from "../renderingHardwareInterface";
import { TextureDepthCompareFunction } from "./enums/TextureDepthCompareFunction";
import { TextureFilterMode } from "./enums/TextureFilterMode";
import { TextureFormat } from "./enums/TextureFormat";
import { TextureUsage } from "./enums/TextureUsage";
import { TextureWrapMode } from "./enums/TextureWrapMode";

/**
 * The base class of texture, contains some common functions of texture-related classes.
 */
export abstract class Texture extends GraphicsResource {
  name: string;

  /** @internal */
  _platformTexture: IPlatformTexture;
  /** @internal */
  _mipmap: boolean;
  /** @internal */
  _isDepthTexture: boolean = false;

  protected _format: TextureFormat;
  protected _width: number;
  protected _height: number;
  protected _usage: TextureUsage;
  protected _mipmapCount: number;

  private _wrapModeU: TextureWrapMode;
  private _wrapModeV: TextureWrapMode;
  private _filterMode: TextureFilterMode;
  private _anisoLevel: number = 1;
  private _depthCompareFunction: TextureDepthCompareFunction;
  private _useDepthCompareMode: boolean = false;

  /**
   * Texture format.
   */
  get format(): TextureFormat {
    return this._format;
  }

  /**
   * The width of the texture.
   */
  get width(): number {
    return this._width;
  }

  /**
   * The height of the texture.
   */
  get height(): number {
    return this._height;
  }

  /**
   * The usage of the texture.
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
   * Texture mipmapping count.
   */
  get mipmapCount(): number {
    return this._mipmapCount;
  }

  /**
   * Filter mode for texture.
   */
  get filterMode(): TextureFilterMode {
    return this._filterMode;
  }

  set filterMode(value: TextureFilterMode) {
    if (value === this._filterMode) return;

    if (value !== TextureFilterMode.Point && this._isIntFormat()) {
      value = TextureFilterMode.Point;
      Logger.warn(`TextureFilterMode of int or uint format only support TextureFilterMode.Point`);
      return;
    }

    this._filterMode = value;

    this._platformTexture.filterMode = value;
  }

  /**
   * Anisotropic level for texture.
   */
  get anisoLevel(): number {
    return this._anisoLevel;
  }

  set anisoLevel(value: number) {
    const max = this._engine._hardwareRenderer.capability.maxAnisoLevel;

    if (value > max) {
      Logger.warn(`anisoLevel:${value}, exceeds the limit and is automatically downgraded to:${max}`);
      value = max;
    }

    if (value < 1) {
      Logger.warn(`anisoLevel:${value}, must be greater than 0, and is automatically downgraded to 1`);
      value = 1;
    }

    if (value === this._anisoLevel) return;

    this._anisoLevel = value;

    this._platformTexture.anisoLevel = value;
  }

  /**
   * Filter mode when texture as depth Texture.
   * @remarks Only depth-related formats take effect.
   */
  get depthCompareFunction(): TextureDepthCompareFunction {
    return this._depthCompareFunction;
  }

  set depthCompareFunction(value: TextureDepthCompareFunction) {
    if (!this._engine._hardwareRenderer._isWebGL2) {
      console.warn("depthCompareFunction only support WebGL2");
      return;
    }

    if (value !== this._depthCompareFunction) {
      this._depthCompareFunction = value;
      this._platformTexture.depthCompareFunction = value;
    }
  }

  /**
   * Generate multi-level textures based on the 0th level data.
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
    if (this._engine._hardwareRenderer._isWebGL2) {
      platformTexture.depthCompareFunction = this._depthCompareFunction;
      platformTexture.setUseDepthCompareMode(this._useDepthCompareMode);
    }
  }

  /**
   * @internal
   */
  protected override _onDestroy() {
    super._onDestroy();
    this._platformTexture.destroy();
    this._platformTexture = null;
  }

  /**
   * Get the maximum mip level of the corresponding size:rounding down.
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
