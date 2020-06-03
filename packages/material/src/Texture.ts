import { TextureFormat, TextureFilterMode, TextureWrapMode, TextureFilter, Logger } from "@alipay/o3-base";
import { AssetObject } from "@alipay/o3-core";
import { TextureFormatDetail, TextureConfig } from "./type";

/**
 * 纹理的基类，包含了纹理相关类的一些公共功能。
 */
export class Texture extends AssetObject {
  static isPowerOf2(v: number): boolean {
    return (v & (v - 1)) === 0;
  }

  private _mipmapCount: number;
  private _wrapModeU: TextureWrapMode;
  private _wrapModeV: TextureWrapMode;
  private _filterMode: TextureFilterMode;
  private _anisoLevel: number = 1;

  protected _rhi;
  protected _glTexture: WebGLTexture;
  protected _target: GLenum;
  protected _mipmap: boolean;
  protected _width: number;
  protected _height: number;

  /**
   * 宽。
   */
  get width(): number {
    return this._width;
  }

  /**
   * 高。
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

    const gl: WebGLRenderingContext & WebGL2RenderingContext = this._rhi.gl;

    this._wrapModeU = value;

    this.bind();
    switch (value) {
      case TextureWrapMode.Clamp:
        gl.texParameteri(this._target, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        break;
      case TextureWrapMode.REPEAT:
        gl.texParameteri(this._target, gl.TEXTURE_WRAP_S, gl.REPEAT);
        break;
      case TextureWrapMode.Mirror:
        gl.texParameteri(this._target, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
        break;
    }
    this.unbind();
  }

  /**
   * 纹理坐标 V 的循环模式。
   */
  get wrapModeV(): TextureWrapMode {
    return this._wrapModeV;
  }

  set wrapModeV(value: TextureWrapMode) {
    if (value === this._wrapModeV) return;

    const gl: WebGLRenderingContext & WebGL2RenderingContext = this._rhi.gl;

    this._wrapModeV = value;

    this.bind();
    switch (value) {
      case TextureWrapMode.Clamp:
        gl.texParameteri(this._target, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        break;
      case TextureWrapMode.REPEAT:
        gl.texParameteri(this._target, gl.TEXTURE_WRAP_T, gl.REPEAT);
        break;
      case TextureWrapMode.Mirror:
        gl.texParameteri(this._target, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
        break;
    }
    this.unbind();
  }

  /**
   * 分级纹理的数量。
   */
  get mipmapCount(): number {
    return this._mipmapCount ? this._mipmapCount : this._mipmap ? Math.log2(this._width) : 1;
  }

  /**
   * 纹理的过滤模式，
   */
  get filterMode(): TextureFilterMode {
    return this._filterMode;
  }

  set filterMode(value: TextureFilterMode) {
    if (value === this._filterMode) return;

    const gl: WebGLRenderingContext & WebGL2RenderingContext = this._rhi.gl;

    this._filterMode = value;

    this.bind();
    switch (value) {
      case TextureFilterMode.Point:
        gl.texParameteri(this._target, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(this._target, gl.TEXTURE_MIN_FILTER, this._mipmap ? gl.NEAREST_MIPMAP_NEAREST : gl.NEAREST);
        break;
      case TextureFilterMode.Bilinear:
        gl.texParameteri(this._target, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(this._target, gl.TEXTURE_MIN_FILTER, this._mipmap ? gl.LINEAR_MIPMAP_NEAREST : gl.LINEAR);
        break;
      case TextureFilterMode.Trilinear:
        gl.texParameteri(this._target, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(this._target, gl.TEXTURE_MIN_FILTER, this._mipmap ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
        break;
    }
    this.unbind();
  }

  /**
   * 各向异性过滤等级。
   */
  get anisoLevel(): number {
    return this._anisoLevel;
  }

  set anisoLevel(value: number) {
    if (value === this._anisoLevel) return;

    const gl: WebGLRenderingContext & WebGL2RenderingContext & EXT_texture_filter_anisotropic = this._rhi.gl;

    const max = this._rhi.capability.maxAnisoLevel;
    if (value > max) {
      Logger.warn(`anisoLevel 超出当前环境限制，已自动降级为最大值:${max}`);
      value = max;
    }
    this._anisoLevel = value;

    this.bind();
    gl.texParameterf(this._target, gl.TEXTURE_MAX_ANISOTROPY_EXT, value);
    this.unbind();
  }

  /**
   * 根据 TextureFormat 获取具体信息
   * @return {TextureFormatDetail}
   */
  protected getFormatDetail(
    format: TextureFormat,
    gl: WebGLRenderingContext & WebGL2RenderingContext,
    isWebGL2: boolean
  ): TextureFormatDetail {
    switch (format) {
      case TextureFormat.R8G8B8:
        return {
          internalFormat: gl.RGB,
          baseFormat: gl.RGB,
          dataType: gl.UNSIGNED_BYTE,
          isCompressed: false
        };
      case TextureFormat.R8G8B8A8:
        return {
          internalFormat: gl.RGBA,
          baseFormat: gl.RGBA,
          dataType: gl.UNSIGNED_BYTE,
          isCompressed: false
        };
      case TextureFormat.R5G6B5:
        return {
          internalFormat: isWebGL2 ? gl.RGB565 : gl.RGB,
          baseFormat: gl.RGB,
          dataType: gl.UNSIGNED_SHORT_5_6_5,
          isCompressed: false
        };
      case TextureFormat.Alpha8:
        return {
          internalFormat: gl.ALPHA,
          baseFormat: gl.ALPHA,
          dataType: gl.UNSIGNED_BYTE,
          isCompressed: false
        };
      case TextureFormat.R32G32B32A32:
        return {
          internalFormat: gl.RGBA32F,
          baseFormat: gl.RGBA,
          dataType: gl.FLOAT,
          isCompressed: false
        };
      default:
        return {
          internalFormat: gl.RGBA,
          baseFormat: gl.RGBA,
          dataType: gl.UNSIGNED_BYTE,
          isCompressed: false
        };
    }
  }

  protected bind() {
    const gl: WebGLRenderingContext & WebGL2RenderingContext = this._rhi.gl;

    gl.bindTexture(this._target, this._glTexture);
  }

  protected unbind() {
    const gl: WebGLRenderingContext & WebGL2RenderingContext = this._rhi.gl;

    gl.bindTexture(this._target, null);
  }

  /** -------------------@deprecated------------------------ */
  public needUpdateFilers: boolean;
  public needUpdateWholeTexture: boolean;
  public canMipmap: boolean;
  public isCompressed: boolean = false;

  public wrapS: TextureWrapMode;
  public wrapT: TextureWrapMode;
  public filterMag: TextureFilter;
  public filterMin: TextureFilter;
  private _flipY: boolean = false;
  private _premultiplyAlpha: boolean = false;

  public config: TextureConfig;

  public isFloat: boolean;

  /**
   * 纹理对象基类
   * @param {String} name 名称
   * @param {Object} config 可选配置，包含以下参数
   * @param {Number} [config.magFilter=TextureFilter.LINEAR] 放大时的筛选器
   * @param {Number} [config.minFilter=TextureFilter.LINEAR_MIPMAP_LINEAR] 缩小时的筛选器
   * @param {Number} [config.wrapS=TextureWrapMode.REPEAT] S方向纹理包裹选项
   * @param {Number} [config.wrapT=TextureWrapMode.REPEAT] T方向纹理包裹选项
   * @param {boolean} [config.flipY=false] 是否翻转图片上下
   * @param {boolean} [config.premultiplyAlpha=false] 颜色通道是否预乘 alpha
   * @param {boolean} [config.isFloat=false] 浮点纹理
   */
  constructor(name: string, config: TextureConfig = {}) {
    super(name);
    this.config = config;

    config = {
      magFilter: TextureFilter.LINEAR,
      minFilter: TextureFilter.LINEAR_MIPMAP_LINEAR,
      wrapS: TextureWrapMode.REPEAT,
      wrapT: TextureWrapMode.REPEAT,
      flipY: false,
      premultiplyAlpha: false,
      isFloat: false,
      ...config
    };

    this.flipY = config.flipY;
    this.premultiplyAlpha = config.premultiplyAlpha;
    this.isFloat = config.isFloat;

    this.setFilter(config.magFilter, config.minFilter);
    this.setWrapMode(config.wrapS, config.wrapT);
  }

  /** 是否上下翻转图片 */
  get flipY() {
    return this._flipY;
  }

  set flipY(value: boolean) {
    if (value !== this._flipY) {
      this.needUpdateWholeTexture = true;
    }
    this._flipY = value;
  }

  /** 颜色通道是否预乘 alpha */
  get premultiplyAlpha() {
    return this._premultiplyAlpha;
  }

  set premultiplyAlpha(value: boolean) {
    if (value !== this._premultiplyAlpha) {
      this.needUpdateWholeTexture = true;
    }
    this._premultiplyAlpha = value;
  }

  /**
   * 设置贴图采样时的 Filter
   * @param {GLenum} magFilter 放大筛选器
   * @param {GLenum} minFilter 缩小筛选器
   */
  setFilter(magFilter: TextureFilter, minFilter: TextureFilter): this {
    this.needUpdateFilers = this.needUpdateFilers || this.filterMag !== magFilter || this.filterMin !== minFilter;
    this.filterMag = magFilter;
    this.filterMin = minFilter;
    return this;
  }

  /**
   * 设置贴图坐标的Wrap Mode
   * @param {GLenum} wrapS 贴图坐标在 S 方向的 Wrap 模式
   * @param {GLenum} wrapT 贴图坐标在 T 方向的 Wrap 模式
   */
  setWrapMode(wrapS: TextureWrapMode, wrapT: TextureWrapMode): this {
    this.needUpdateFilers = this.needUpdateFilers || this.wrapS !== wrapS || this.wrapT !== wrapT;
    this.wrapS = wrapS;
    this.wrapT = wrapT;
    return this;
  }

  /**
   * 重置共享状态，以防清除GL资源后重建时状态错误
   * @private
   */
  resetState() {
    this.needUpdateFilers = true;
  }
}
