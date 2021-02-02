import { RefObject } from "../asset/RefObject";
import { GLCapabilityType } from "../base/Constant";
import { Logger } from "../base/Logger";
import { HardwareRenderer } from "../HardwareRenderer";
import { GLCompressedTextureInternalFormat, TextureFormatDetail } from "../material/type";
import { RenderBufferColorFormat } from "./enums/RenderBufferColorFormat";
import { RenderBufferDepthFormat } from "./enums/RenderBufferDepthFormat";
import { TextureCubeFace } from "./enums/TextureCubeFace";
import { TextureFilterMode } from "./enums/TextureFilterMode";
import { TextureFormat } from "./enums/TextureFormat";
import { TextureWrapMode } from "./enums/TextureWrapMode";

/**
 * The base class of texture, contains some common functions of texture-related classes.
 */
export abstract class Texture extends RefObject {
  /** @internal */
  static _readFrameBuffer: WebGLFramebuffer = null;

  /** @internal */
  static _isPowerOf2(v: number): boolean {
    return (v & (v - 1)) === 0;
  }

  /**
   * Get more texture info from TextureFormat.
   * @internal
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
      case TextureFormat.R4G4B4A4:
        return {
          internalFormat: isWebGL2 ? gl.RGBA4 : gl.RGBA,
          baseFormat: gl.RGBA,
          dataType: gl.UNSIGNED_SHORT_4_4_4_4,
          isCompressed: false
        };
      case TextureFormat.R5G5B5A1:
        return {
          internalFormat: isWebGL2 ? gl.RGB5_A1 : gl.RGBA,
          baseFormat: gl.RGBA,
          dataType: gl.UNSIGNED_SHORT_5_5_5_1,
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
      default:
        throw new Error(`this TextureFormat is not supported in Oasis Engine: ${format}`);
    }
  }

  /**
   * @internal
   */
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
      case RenderBufferColorFormat.R4G4B4A4:
        return {
          internalFormat: isWebGL2 ? gl.RGBA4 : gl.RGBA,
          baseFormat: gl.RGBA,
          dataType: gl.UNSIGNED_SHORT_4_4_4_4,
          isCompressed: false
        };
      case RenderBufferColorFormat.R5G5B5A1:
        return {
          internalFormat: isWebGL2 ? gl.RGB5_A1 : gl.RGBA,
          baseFormat: gl.RGBA,
          dataType: gl.UNSIGNED_SHORT_5_5_5_1,
          isCompressed: false
        };
      case RenderBufferColorFormat.R5G6B5:
        return {
          internalFormat: isWebGL2 ? gl.RGB565 : gl.RGB,
          baseFormat: gl.RGB,
          dataType: gl.UNSIGNED_SHORT_5_6_5,
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
      default:
        throw new Error(`this RenderBufferColorFormat is not supported in Oasis Engine: ${format}`);
    }
  }

  /**
   * @internal
   * @remarks In WebGL 1, internalformat must be the same as baseFormat when call texImage2D.
   */
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
      default:
        throw new Error(`this RenderBufferDepthFormat is not supported in Oasis Engine: ${format}`);
    }
  }

  /**
   * Check whether the corresponding texture format is supported.
   * @internal
   */
  static _supportTextureFormat(format: TextureFormat, rhi): boolean {
    let isSupported = true;

    switch (format) {
      case TextureFormat.R32G32B32A32:
        {
          if (!rhi.canIUse(GLCapabilityType.textureFloat)) {
            isSupported = false;
          }
        }
        break;
    }

    return isSupported;
  }

  /**
   * @internal
   */
  static _supportRenderBufferColorFormat(format: RenderBufferColorFormat, rhi): boolean {
    let isSupported = true;

    switch (format) {
      case RenderBufferColorFormat.R32G32B32A32:
        {
          if (!rhi.canIUse(GLCapabilityType.colorBufferFloat) || !rhi.canIUse(GLCapabilityType.textureFloat)) {
            isSupported = false;
          }
        }
        break;
      case RenderBufferColorFormat.R16G16B16A16:
        {
          if (!rhi.canIUse(GLCapabilityType.colorBufferHalfFloat) || !rhi.canIUse(GLCapabilityType.textureHalfFloat)) {
            isSupported = false;
          }
        }
        break;
    }

    return isSupported;
  }

  /**
   * @internal
   */
  static _supportRenderBufferDepthFormat(format: RenderBufferDepthFormat, rhi, isTexture: boolean): boolean {
    const isWebGL2: boolean = rhi.isWebGL2;
    let isSupported = true;

    if (isTexture && !rhi.canIUse(GLCapabilityType.depthTexture)) {
      return false;
    }

    switch (format) {
      case RenderBufferDepthFormat.Stencil:
        {
          isSupported = false;
        }
        break;
      case RenderBufferDepthFormat.Depth24:
      case RenderBufferDepthFormat.Depth32:
      case RenderBufferDepthFormat.Depth32Stencil8:
        {
          if (!isWebGL2) {
            isSupported = false;
          }
        }
        break;
    }

    return isSupported;
  }

  name: string;

  _glTexture: WebGLTexture;
  /** @internal */
  _target: GLenum;
  /** @internal */
  _formatDetail: TextureFormatDetail;

  protected _width: number;
  protected _height: number;

  /** @internal */
  protected _rhi: HardwareRenderer;
  /** @internal */
  protected _mipmap: boolean;
  /** @internal */
  protected _mipmapCount: number;

  private _wrapModeU: TextureWrapMode;
  private _wrapModeV: TextureWrapMode;
  private _filterMode: TextureFilterMode;
  private _anisoLevel: number = 1;

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
   * Wrapping mode for texture coordinate S.
   */
  get wrapModeU(): TextureWrapMode {
    return this._wrapModeU;
  }

  set wrapModeU(value: TextureWrapMode) {
    if (value === this._wrapModeU) return;

    const gl: WebGLRenderingContext & WebGL2RenderingContext = this._rhi.gl;

    this._wrapModeU = value;

    this._bind();
    this._setWrapMode(value, gl.TEXTURE_WRAP_S);
    this._unbind();
  }

  /**
   * Wrapping mode for texture coordinate T.
   */
  get wrapModeV(): TextureWrapMode {
    return this._wrapModeV;
  }

  set wrapModeV(value: TextureWrapMode) {
    if (value === this._wrapModeV) return;

    const gl: WebGLRenderingContext & WebGL2RenderingContext = this._rhi.gl;

    this._wrapModeV = value;

    this._bind();
    this._setWrapMode(value, gl.TEXTURE_WRAP_T);
    this._unbind();
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
        gl.texParameteri(this._target, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(this._target, gl.TEXTURE_MIN_FILTER, this._mipmap ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
        break;
    }
    this._unbind();
  }

  /**
   * Anisotropic level for texture.
   */
  get anisoLevel(): number {
    return this._anisoLevel;
  }

  set anisoLevel(value: number) {
    const max = this._rhi.capability.maxAnisoLevel;

    if (value > max) {
      Logger.warn(`anisoLevel:${value}, exceeds the limit and is automatically downgraded to:${max}`);
      value = max;
    }

    if (value < 1) {
      Logger.warn(`anisoLevel:${value}, must be greater than 0, and is automatically downgraded to 1`);
      value = 1;
    }

    if (value === this._anisoLevel) return;

    const gl: WebGLRenderingContext & WebGL2RenderingContext & EXT_texture_filter_anisotropic = this._rhi.gl;

    this._anisoLevel = value;

    this._bind();
    gl.texParameterf(this._target, gl.TEXTURE_MAX_ANISOTROPY_EXT, value);
    this._unbind();
  }

  /**
   * Generate multi-level textures based on the 0th level data.
   */
  public generateMipmaps(): void {
    if (!this._mipmap) return;

    const gl: WebGLRenderingContext & WebGL2RenderingContext = this._rhi.gl;

    this._bind();
    gl.generateMipmap(this._target);
    this._unbind();
  }

  /**
   * @override
   */
  _onDestroy() {
    const gl: WebGLRenderingContext & WebGL2RenderingContext = this._rhi.gl;
    gl.deleteTexture(this._glTexture);
    this._glTexture = null;
    this._formatDetail = null;
    // TODO: delete
    this._rhi = null;
  }

  /** @internal */
  _bind(): void {
    this._rhi.bindTexture(this._target, this._glTexture);
  }

  /** @internal */
  _unbind(): void {
    this._rhi.bindTexture(this._target, null);
  }

  /**
   * Get the pixel color buffer according to the specified area.
   * @internal
   * @param face - If it is a cube texture, you can choose which surface to read
   * @param x - X coordinate of area start
   * @param y - Y coordinate of area start
   * @param width - Area width
   * @param height - Area height
   * @param out - Color buffer
   */
  protected _getPixelBuffer(
    face: TextureCubeFace | null,
    x: number,
    y: number,
    width: number,
    height: number,
    out: ArrayBufferView
  ): void {
    const gl: WebGLRenderingContext & WebGL2RenderingContext = this._rhi.gl;
    const { baseFormat, dataType } = this._formatDetail;

    if (!Texture._readFrameBuffer) {
      Texture._readFrameBuffer = gl.createFramebuffer();
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, Texture._readFrameBuffer);

    if (face != null) {
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
   * Pre-development mipmapping GPU memory.
   * @internal
   */
  protected _initMipmap(isCube: boolean): void {
    const gl: WebGLRenderingContext & WebGL2RenderingContext = this._rhi.gl;
    const isWebGL2 = this._rhi.isWebGL2;
    let { internalFormat, baseFormat, dataType } = this._formatDetail;

    this._bind();

    if (isWebGL2) {
      gl.texStorage2D(this._target, this._mipmapCount, internalFormat, this._width, this._height);
    } else {
      // In WebGL 1, internalformat must be the same as baseFormat
      if (baseFormat !== internalFormat) {
        internalFormat = baseFormat;
      }

      if (!isCube) {
        for (let i = 0; i < this._mipmapCount; i++) {
          const width = Math.max(1, this._width >> i);
          const height = Math.max(1, this._height >> i);

          gl.texImage2D(this._target, i, internalFormat, width, height, 0, baseFormat, dataType, null);
        }
      } else {
        for (let i = 0; i < this._mipmapCount; i++) {
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
  }

  /**
   * Get the maximum mip level of the corresponding size:rounding down
   * @remarks http://download.nvidia.com/developer/Papers/2005/NP2_Mipmapping/NP2_Mipmap_Creation.pdf
   * @internal
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

  /**
   * @internal
   */
  private _setWrapMode(value: TextureWrapMode, pname: GLenum): void {
    const gl: WebGLRenderingContext & WebGL2RenderingContext = this._rhi.gl;
    const isWebGL2: boolean = this._rhi.isWebGL2;

    if (
      !isWebGL2 &&
      value !== TextureWrapMode.Clamp &&
      (!Texture._isPowerOf2(this._width) || !Texture._isPowerOf2(this._height))
    ) {
      Logger.warn(
        "non-power-2 texture is not supported for REPEAT or MIRRORED_REPEAT in WebGL1,and has automatically downgraded to CLAMP_TO_EDGE"
      );
      value = TextureWrapMode.Clamp;
    }

    switch (value) {
      case TextureWrapMode.Clamp:
        gl.texParameteri(this._target, pname, gl.CLAMP_TO_EDGE);
        break;
      case TextureWrapMode.Repeat:
        gl.texParameteri(this._target, pname, gl.REPEAT);
        break;
      case TextureWrapMode.Mirror:
        gl.texParameteri(this._target, pname, gl.MIRRORED_REPEAT);
        break;
    }
  }
}
