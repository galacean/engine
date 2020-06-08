import {
  GLCompressedTextureInternalFormat,
  TextureFormat,
  RenderBufferColorFormat,
  RenderBufferDepthFormat,
  TextureFilterMode,
  TextureWrapMode,
  TextureFilter,
  TextureCubeFace,
  Logger,
  GLCapabilityType
} from "@alipay/o3-base";
import { AssetObject } from "@alipay/o3-core";
import { TextureFormatDetail, TextureConfig } from "./type";

/**
 * 纹理的基类，包含了纹理相关类的一些公共功能。
 */
export class Texture extends AssetObject {
  static _readFrameBuffer: WebGLFramebuffer = null;

  static _isPowerOf2(v: number): boolean {
    return (v & (v - 1)) === 0;
  }

  /**
   * 根据 TextureFormat 获取具体信息
   * @return {TextureFormatDetail}
   */
  static _getFormatDetail(
    format: TextureFormat,
    gl: WebGLRenderingContext & WebGL2RenderingContext,
    isWebGL2: boolean
  ): TextureFormatDetail {
    switch (format) {
      case TextureFormat.R8G8B8:
        return {
          internalFormat: isWebGL2 ? gl.RGB8 : gl.RGB,
          baseFormat: gl.RGB,
          dataType: gl.UNSIGNED_BYTE,
          isCompressed: false
        };
      case TextureFormat.R8G8B8A8:
        return {
          internalFormat: isWebGL2 ? gl.RGBA8 : gl.RGBA,
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
      case TextureFormat.DXT1:
        return {
          internalFormat: GLCompressedTextureInternalFormat.RGB_S3TC_DXT1_EXT,
          isCompressed: true
        };
      case TextureFormat.DXT5:
        return {
          internalFormat: GLCompressedTextureInternalFormat.RGBA_S3TC_DXT5_EXT,
          isCompressed: true
        };
      case TextureFormat.ETC1_RGB:
        return {
          internalFormat: GLCompressedTextureInternalFormat.RGB_ETC1_WEBGL,
          isCompressed: true
        };
      case TextureFormat.ETC2_RGB:
        return {
          internalFormat: GLCompressedTextureInternalFormat.RGB8_ETC2,
          isCompressed: true
        };
      case TextureFormat.ETC2_RGBA5:
        return {
          internalFormat: GLCompressedTextureInternalFormat.RGB8_PUNCHTHROUGH_ALPHA1_ETC2,
          isCompressed: true
        };
      case TextureFormat.ETC2_RGBA8:
        return {
          internalFormat: GLCompressedTextureInternalFormat.RGBA8_ETC2_EAC,
          isCompressed: true
        };
      case TextureFormat.PVRTC_RGB2:
        return {
          internalFormat: GLCompressedTextureInternalFormat.RGB_PVRTC_2BPPV1_IMG,
          isCompressed: true
        };
      case TextureFormat.PVRTC_RGBA2:
        return {
          internalFormat: GLCompressedTextureInternalFormat.RGBA_PVRTC_2BPPV1_IMG,
          isCompressed: true
        };
      case TextureFormat.PVRTC_RGB4:
        return {
          internalFormat: GLCompressedTextureInternalFormat.RGB_PVRTC_4BPPV1_IMG,
          isCompressed: true
        };
      case TextureFormat.PVRTC_RGBA4:
        return {
          internalFormat: GLCompressedTextureInternalFormat.RGBA_PVRTC_4BPPV1_IMG,
          isCompressed: true
        };
      case TextureFormat.ASTC_4x4:
        return {
          internalFormat: GLCompressedTextureInternalFormat.RGBA_ASTC_4X4_KHR,
          isCompressed: true
        };
      case TextureFormat.ASTC_5x5:
        return {
          internalFormat: GLCompressedTextureInternalFormat.RGBA_ASTC_5X5_KHR,
          isCompressed: true
        };
      case TextureFormat.ASTC_6x6:
        return {
          internalFormat: GLCompressedTextureInternalFormat.RGBA_ASTC_6X6_KHR,
          isCompressed: true
        };
      case TextureFormat.ASTC_8x8:
        return {
          internalFormat: GLCompressedTextureInternalFormat.RGBA_ASTC_8X8_KHR,
          isCompressed: true
        };
      case TextureFormat.ASTC_10x10:
        return {
          internalFormat: GLCompressedTextureInternalFormat.RGBA_ASTC_10X10_KHR,
          isCompressed: true
        };
      case TextureFormat.ASTC_12x12:
        return {
          internalFormat: GLCompressedTextureInternalFormat.RGBA_ASTC_12X12_KHR,
          isCompressed: true
        };
    }
  }

  static _getRenderBufferColorFormatDetail(
    format: RenderBufferColorFormat,
    gl: WebGLRenderingContext & WebGL2RenderingContext,
    isWebGL2: boolean
  ): TextureFormatDetail {
    switch (format) {
      case RenderBufferColorFormat.R8G8B8:
        return {
          internalFormat: isWebGL2 ? gl.RGB8 : gl.RGB,
          baseFormat: gl.RGB,
          dataType: gl.UNSIGNED_BYTE,
          isCompressed: false
        };
      case RenderBufferColorFormat.R8G8B8A8:
        return {
          internalFormat: isWebGL2 ? gl.RGBA8 : gl.RGBA,
          baseFormat: gl.RGBA,
          dataType: gl.UNSIGNED_BYTE,
          isCompressed: false
        };
      case RenderBufferColorFormat.Alpha8:
        return {
          internalFormat: gl.ALPHA,
          baseFormat: gl.ALPHA,
          dataType: gl.UNSIGNED_BYTE,
          isCompressed: false
        };
      case RenderBufferColorFormat.R16G16B16A16:
        return {
          internalFormat: gl.RGBA16F,
          baseFormat: gl.RGBA,
          dataType: gl.HALF_FLOAT,
          isCompressed: false
        };
      case RenderBufferColorFormat.R32G32B32A32:
        return {
          internalFormat: gl.RGBA32F,
          baseFormat: gl.RGBA,
          dataType: gl.FLOAT,
          isCompressed: false
        };
    }
  }

  static _getRenderBufferDepthFormatDetail(
    format: RenderBufferDepthFormat,
    gl: WebGLRenderingContext & WebGL2RenderingContext,
    isWebGL2: boolean
  ): TextureFormatDetail {
    switch (format) {
      case RenderBufferDepthFormat.Depth:
        return {
          internalFormat: isWebGL2 ? gl.DEPTH_COMPONENT32F : gl.DEPTH_COMPONENT16,
          baseFormat: gl.DEPTH_COMPONENT,
          dataType: isWebGL2 ? gl.FLOAT : gl.UNSIGNED_INT,
          isCompressed: false,
          attachment: gl.DEPTH_ATTACHMENT
        };
      case RenderBufferDepthFormat.DepthStencil:
        return {
          internalFormat: isWebGL2 ? gl.DEPTH24_STENCIL8 : gl.DEPTH_STENCIL,
          baseFormat: gl.DEPTH_STENCIL,
          dataType: gl.UNSIGNED_INT_24_8,
          isCompressed: false,
          attachment: gl.DEPTH_STENCIL_ATTACHMENT
        };
      case RenderBufferDepthFormat.Stencil:
        return {
          internalFormat: gl.STENCIL_INDEX8,
          baseFormat: gl.STENCIL_ATTACHMENT,
          dataType: gl.UNSIGNED_BYTE,
          isCompressed: false,
          attachment: gl.STENCIL_ATTACHMENT
        };
      case RenderBufferDepthFormat.Depth16:
        return {
          internalFormat: isWebGL2 ? gl.DEPTH_COMPONENT16 : gl.DEPTH_COMPONENT16,
          baseFormat: gl.DEPTH_COMPONENT,
          dataType: gl.UNSIGNED_INT,
          isCompressed: false,
          attachment: gl.DEPTH_ATTACHMENT
        };
      case RenderBufferDepthFormat.Depth24:
        return {
          internalFormat: gl.DEPTH_COMPONENT24,
          baseFormat: gl.DEPTH_COMPONENT,
          dataType: gl.UNSIGNED_INT,
          isCompressed: false,
          attachment: gl.DEPTH_ATTACHMENT
        };
      case RenderBufferDepthFormat.Depth32:
        return {
          internalFormat: gl.DEPTH_COMPONENT32F,
          baseFormat: gl.DEPTH_COMPONENT,
          dataType: gl.FLOAT,
          isCompressed: false,
          attachment: gl.DEPTH_ATTACHMENT
        };
      case RenderBufferDepthFormat.Depth24Stencil8:
        return {
          internalFormat: isWebGL2 ? gl.DEPTH24_STENCIL8 : gl.DEPTH_STENCIL,
          baseFormat: gl.DEPTH_STENCIL,
          dataType: gl.UNSIGNED_INT_24_8,
          isCompressed: false,
          attachment: gl.DEPTH_STENCIL_ATTACHMENT
        };
      case RenderBufferDepthFormat.Depth32Stencil8:
        return {
          internalFormat: gl.DEPTH32F_STENCIL8,
          baseFormat: gl.DEPTH_STENCIL,
          dataType: gl.FLOAT_32_UNSIGNED_INT_24_8_REV,
          isCompressed: false,
          attachment: gl.DEPTH_STENCIL_ATTACHMENT
        };
    }
  }

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

    this._bind();
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
    this._unbind();
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

    this._bind();
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
    this._unbind();
  }

  /**
   * 分级纹理的数量。
   */
  get mipmapCount(): number {
    if (!this._mipmapCount) {
      this._mipmapCount = this._mipmap
        ? Math.max(this._getMaxMiplevel(this._width), this._getMaxMiplevel(this._height)) + 1
        : 1;
    }
    return this._mipmapCount;
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

    this._bind();
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
    this._unbind();
  }

  /**
   * 各向异性过滤等级。
   */
  get anisoLevel(): number {
    return this._anisoLevel;
  }

  set anisoLevel(value: number) {
    if (value === this._anisoLevel) return;

    if (!this._rhi.canIUse(GLCapabilityType.textureFilterAnisotropic)) {
      Logger.error("当前环境不支持设置各向异性过滤等级");
      return;
    }

    const gl: WebGLRenderingContext & WebGL2RenderingContext & EXT_texture_filter_anisotropic = this._rhi.gl;
    const max = this._rhi.capability.maxAnisoLevel;

    if (value > max) {
      Logger.warn(`anisoLevel:${value}, 超出当前环境限制，已自动降级为最大值:${max}`);
      value = max;
    }

    this._anisoLevel = value;

    this._bind();
    gl.texParameterf(this._target, gl.TEXTURE_MAX_ANISOTROPY_EXT, value);
    this._unbind();
  }

  public _glTexture: WebGLTexture;
  public _formatDetail: TextureFormatDetail;
  public _isCube: boolean = false;

  protected _rhi;
  protected _target: GLenum;
  protected _mipmap: boolean;
  protected _width: number;
  protected _height: number;

  private _mipmapCount: number;
  private _wrapModeU: TextureWrapMode;
  private _wrapModeV: TextureWrapMode;
  private _filterMode: TextureFilterMode;
  private _anisoLevel: number;

  /**
   * 根据第0级数据生成多级纹理。
   */
  public generateMipmaps(): void {
    if (!this._mipmap) return;

    const gl: WebGLRenderingContext & WebGL2RenderingContext = this._rhi.gl;

    this._bind();
    gl.generateMipmap(this._target);
    this._unbind();
  }

  /**
   * @internal
   */
  public _bind(): void {
    const gl: WebGLRenderingContext & WebGL2RenderingContext = this._rhi.gl;

    gl.bindTexture(this._target, this._glTexture);
  }

  /**
   * @internal
   */
  public _unbind(): void {
    const gl: WebGLRenderingContext & WebGL2RenderingContext = this._rhi.gl;

    gl.bindTexture(this._target, null);
  }

  /**
   * @internal
   * 根据指定区域获得像素颜色缓冲
   * @param x - 区域起始X坐标
   * @param y - 区域起始Y坐标
   * @param width - 区域宽
   * @param height - 区域高
   * @param out - 颜色数据缓冲
   * @param face - 如果是立方体纹理，可以选择读取第几个面
   */
  protected _getPixelsBuffer(
    x: number,
    y: number,
    width: number,
    height: number,
    out: ArrayBufferView,
    face: TextureCubeFace = -1
  ): void {
    const gl: WebGLRenderingContext & WebGL2RenderingContext = this._rhi.gl;
    const { baseFormat, dataType } = this._formatDetail;

    if (!Texture._readFrameBuffer) {
      Texture._readFrameBuffer = gl.createFramebuffer();
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, Texture._readFrameBuffer);

    if (face > -1) {
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_CUBE_MAP_POSITIVE_X + face,
        this._glTexture,
        0
      );
    } else {
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this._glTexture, 0);
    }
    gl.readPixels(x, y, width, height, baseFormat, dataType, out);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /**
   * @internal
   * 预开辟 mipmap 显存
   */
  protected _initMipmap(): void {
    const gl: WebGLRenderingContext & WebGL2RenderingContext = this._rhi.gl;
    const isWebGL2 = this._rhi.isWebGL2;
    const isCube = this._isCube;
    let { internalFormat, baseFormat, dataType } = this._formatDetail;

    this._bind();

    if (isWebGL2) {
      gl.texStorage2D(this._target, this.mipmapCount, internalFormat, this._width, this._height);
    } else {

      if (!isCube) {
        for (let i = 0; i < this.mipmapCount; i++) {
          const width = Math.max(1, this._width >> i);
          const height = Math.max(1, this._height >> i);

          gl.texImage2D(this._target, i, internalFormat, width, height, 0, baseFormat, dataType, null);
        }
      } else {
        for (let i = 0; i < this.mipmapCount; i++) {
          const size = Math.max(1, this._width >> i);

          for (let faceIndex = 0; faceIndex < 6; faceIndex++) {
            gl.texImage2D(
              gl.TEXTURE_CUBE_MAP_POSITIVE_X + faceIndex,
              i,
              internalFormat,
              size,
              size,
              0,
              baseFormat,
              dataType,
              null
            );
          }
        }
      }
    }

    this._unbind();

    this.filterMode = TextureFilterMode.Point;
    this.wrapModeU = this.wrapModeV = TextureWrapMode.Clamp;
  }

  /**
   * @internal
   * 获取相应size的最大mip级别,rounding down
   * http://download.nvidia.com/developer/Papers/2005/NP2_Mipmapping/NP2_Mipmap_Creation.pdf
   */
  protected _getMaxMiplevel(size: number) {
    return Math.floor(Math.log2(size));
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
