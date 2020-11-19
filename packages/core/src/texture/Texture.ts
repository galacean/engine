import { RefObject } from "../asset/RefObject";
import { Logger } from "../base/Logger";
import { Engine } from "../Engine";
import { IPlatformTexture } from "../renderingHardwareInterface";
import { TextureFilterMode } from "./enums/TextureFilterMode";
import { TextureWrapMode } from "./enums/TextureWrapMode";

/**
 * 纹理的基类，包含了纹理相关类的一些公共功能。
 */
export abstract class Texture extends RefObject {
  /** 名称。*/
  name: string;
  _platformTexture: IPlatformTexture;
  _mipmap: boolean;
  _mipmapCount: number;

  /** @internal */
  protected _width: number;
  /** @internal */
  protected _height: number;

  /** @internal */
  private _wrapModeU: TextureWrapMode;
  /** @internal */
  private _wrapModeV: TextureWrapMode;
  /** @internal */
  private _filterMode: TextureFilterMode;
  /** @internal */
  private _anisoLevel: number = 1;

  /**
   * 纹理宽。
   */
  get width(): number {
    return this._width;
  }

  /**
   * 纹理高。
   */
  get height(): number {
    return this._height;
  }

  /**
   * 纹理坐标 U 的循环模式。
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
   * 纹理坐标 V 的循环模式。
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
   * 多级纹理的数量。
   */
  get mipmapCount(): number {
    return this._mipmapCount;
  }

  /**
   * 纹理的过滤模式。
   */
  get filterMode(): TextureFilterMode {
    return this._filterMode;
  }

  set filterMode(value: TextureFilterMode) {
    if (value === this._filterMode) return;
    this._filterMode = value;

    this._platformTexture.filterMode = value;
  }

  /**
   * 各向异性过滤等级。
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
   * 根据第0级数据生成多级纹理。
   */
  generateMipmaps(): void {
    if (!this._mipmap) return;

    this._platformTexture.generateMipmaps();
  }

  /**
   * @override
   */
  _onDestroy() {
    this._platformTexture.destroy();
    this._platformTexture = null;
  }

  /**
   * @internal
   * 获取相应size的最大mip级别,rounding down
   * http://download.nvidia.com/developer/Papers/2005/NP2_Mipmapping/NP2_Mipmap_Creation.pdf
   */
  protected _getMaxMiplevel(size: number): number {
    return Math.floor(Math.log2(size));
  }

  /**
   * @internal
   */
  protected _getMipmapCount(): number {
    return this._mipmap ? Math.floor(Math.log2(Math.max(this._width, this._height))) + 1 : 1;
  }

  // TODO: delete
  constructor(engine: Engine) {
    super(engine);
  }
}
