import {
  GLCapabilityType,
  IPlatformTexture,
  Logger,
  RenderBufferColorFormat,
  RenderBufferDepthFormat,
  Texture,
  TextureCubeFace,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode
} from "@oasis-engine/core";
import { GLCompressedTextureInternalFormat, TextureFormatDetail } from "./type";
import { WebGLRenderer } from "./WebGLRenderer";

export class GLTexture implements IPlatformTexture {
  /** @internal */
  static _readFrameBuffer: WebGLFramebuffer = null;

  /** @internal */
  static _isPowerOf2(v: number): boolean {
    return (v & (v - 1)) === 0;
  }

  /**
   * @internal
   * 根据 TextureFormat 获取具体信息。
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
   * In WebGL 1, internalformat must be the same as baseFormat when call texImage2D
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
   * @internal
   * 检测是否支持相应纹理格式。
   */
  static _supportTextureFormat(format: TextureFormat, rhi: WebGLRenderer): boolean {
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
  static _supportRenderBufferColorFormat(format: RenderBufferColorFormat, rhi: WebGLRenderer): boolean {
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
  static _supportRenderBufferDepthFormat(
    format: RenderBufferDepthFormat,
    rhi: WebGLRenderer,
    isTexture: boolean
  ): boolean {
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

  _texture: Texture;
  _glTexture: WebGLTexture;
  _gl: WebGLRenderingContext & WebGL2RenderingContext;
  _isWebGL2: boolean;
  _target: GLenum; // gl.TEXTURE_2D | gl.TEXTURE_CUBE_MAP
  _formatDetail: TextureFormatDetail;

  constructor(rhi: WebGLRenderer, texture: Texture, target: GLenum) {
    this._texture = texture;
    this._gl = rhi.gl as WebGLRenderingContext & WebGL2RenderingContext;
    this._isWebGL2 = rhi.isWebGL2;
    this._target = target;
    this._glTexture = this._gl.createTexture();
  }

  /**
   * 纹理坐标 U 的循环模式。
   */
  set wrapModeU(value: TextureWrapMode) {
    this._bind();
    this._setWrapMode(value, this._gl.TEXTURE_WRAP_S);
    this._unbind();
  }

  /**
   * 纹理坐标 V 的循环模式。
   */
  set wrapModeV(value: TextureWrapMode) {
    this._bind();
    this._setWrapMode(value, this._gl.TEXTURE_WRAP_T);
    this._unbind();
  }

  /**
   * 纹理的过滤模式。
   */
  set filterMode(value: TextureFilterMode) {
    const gl = this._gl;
    const target = this._target;
    const { _mipmap } = this._texture;

    this._bind();
    switch (value) {
      case TextureFilterMode.Point:
        gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, _mipmap ? gl.NEAREST_MIPMAP_NEAREST : gl.NEAREST);
        break;
      case TextureFilterMode.Bilinear:
        gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, _mipmap ? gl.LINEAR_MIPMAP_NEAREST : gl.LINEAR);
        break;
      case TextureFilterMode.Trilinear:
        gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, _mipmap ? gl.LINEAR_MIPMAP_LINEAR : gl.LINEAR);
        break;
    }
    this._unbind();
  }

  /**
   * 各向异性过滤等级。
   */
  set anisoLevel(value: number) {
    const gl = this._gl as WebGLRenderingContext & WebGL2RenderingContext & EXT_texture_filter_anisotropic;

    this._bind();
    gl.texParameterf(this._target, gl.TEXTURE_MAX_ANISOTROPY_EXT, value);
    this._unbind();
  }

  /**
   * 销毁纹理。
   */
  destroy() {
    this._gl.deleteTexture(this._glTexture);
    this._texture = null;
    this._glTexture = null;
    this._formatDetail = null;
  }

  /**
   * 根据第0级数据生成多级纹理。
   */
  generateMipmaps(): void {
    this._bind();
    this._gl.generateMipmap(this._target);
    this._unbind();
  }

  /**
   * @internal
   */
  private _setWrapMode(value: TextureWrapMode, pname: GLenum): void {
    const gl = this._gl;
    const isWebGL2 = this._isWebGL2;
    const target = this._target;
    const { width, height } = this._texture;

    if (
      !isWebGL2 &&
      value !== TextureWrapMode.Clamp &&
      (!GLTexture._isPowerOf2(width) || !GLTexture._isPowerOf2(height))
    ) {
      Logger.warn(
        "non-power-2 texture is not supported for REPEAT or MIRRORED_REPEAT in WebGL1,and has automatically downgraded to CLAMP_TO_EDGE"
      );
      value = TextureWrapMode.Clamp;
    }

    switch (value) {
      case TextureWrapMode.Clamp:
        gl.texParameteri(target, pname, gl.CLAMP_TO_EDGE);
        break;
      case TextureWrapMode.Repeat:
        gl.texParameteri(target, pname, gl.REPEAT);
        break;
      case TextureWrapMode.Mirror:
        gl.texParameteri(target, pname, gl.MIRRORED_REPEAT);
        break;
    }
  }

  /**
   * @internal
   */
  protected _bind() {
    this._gl.bindTexture(this._target, this._glTexture);
  }

  /**
   * @internal
   */
  protected _unbind() {
    this._gl.bindTexture(this._target, null);
  }

  /**
   * @internal
   * 预开辟 mipmap 显存
   */
  protected _initMipmap(isCube: boolean): void {
    const gl = this._gl;
    const isWebGL2 = this._isWebGL2;
    let { internalFormat, baseFormat, dataType } = this._formatDetail;
    const { _mipmapCount, width, height } = this._texture;

    this._bind();

    if (isWebGL2) {
      gl.texStorage2D(this._target, _mipmapCount, internalFormat, width, height);
    } else {
      // In WebGL 1, internalformat must be the same as baseFormat
      if (baseFormat !== internalFormat) {
        internalFormat = baseFormat;
      }

      if (!isCube) {
        for (let i = 0; i < _mipmapCount; i++) {
          const mipWidth = Math.max(1, width >> i);
          const mipHeight = Math.max(1, height >> i);

          gl.texImage2D(this._target, i, internalFormat, mipWidth, mipHeight, 0, baseFormat, dataType, null);
        }
      } else {
        for (let i = 0; i < _mipmapCount; i++) {
          const size = Math.max(1, width >> i);
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
   * @internal
   * 根据指定区域获得像素颜色缓冲。
   * @param face - 如果是立方体纹理，可以选择读取第几个面
   * @param x - 区域起始X坐标
   * @param y - 区域起始Y坐标
   * @param width - 区域宽
   * @param height - 区域高
   * @param out - 颜色数据缓冲
   */
  protected _getPixelBuffer(
    face: TextureCubeFace | null,
    x: number,
    y: number,
    width: number,
    height: number,
    out: ArrayBufferView
  ): void {
    const gl = this._gl;
    const { baseFormat, dataType } = this._formatDetail;

    if (!GLTexture._readFrameBuffer) {
      GLTexture._readFrameBuffer = gl.createFramebuffer();
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, GLTexture._readFrameBuffer);

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
}
