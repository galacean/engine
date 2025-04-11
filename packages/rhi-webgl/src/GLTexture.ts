import {
  GLCapabilityType,
  IPlatformTexture,
  Logger,
  Texture,
  TextureCubeFace,
  TextureDepthCompareFunction,
  TextureFilterMode,
  TextureFormat,
  TextureUsage,
  TextureUtils,
  TextureWrapMode
} from "@galacean/engine-core";
import { MathUtil } from "@galacean/engine-math";
import { WebGLGraphicDevice } from "./WebGLGraphicDevice";
import { GLCompressedTextureInternalFormat, TextureFormatDetail } from "./type";

/**
 * Texture in WebGL platform.
 */
export class GLTexture implements IPlatformTexture {
  /**
   * Get more texture info from TextureFormat.
   * @internal
   */
  static _getFormatDetail(
    format: TextureFormat,
    isSRGBColorSpace: boolean,
    gl: WebGLRenderingContext & WebGL2RenderingContext,
    isWebGL2: boolean
  ): TextureFormatDetail {
    switch (format) {
      case TextureFormat.R8G8B8:
        return {
          internalFormat: isSRGBColorSpace ? gl.SRGB8 : isWebGL2 ? gl.RGB8 : gl.RGB,
          baseFormat: isSRGBColorSpace ? (isWebGL2 ? gl.RGB : gl.SRGB8) : gl.RGB,
          readFormat: gl.RGB,
          dataType: gl.UNSIGNED_BYTE,
          isCompressed: false,
          unpackAlignment: 1
        };
      case TextureFormat.R8G8B8A8:
        return {
          internalFormat: isSRGBColorSpace ? gl.SRGB8_ALPHA8 : isWebGL2 ? gl.RGBA8 : gl.RGBA,
          baseFormat: isSRGBColorSpace ? (isWebGL2 ? gl.RGBA : gl.SRGB8_ALPHA8) : gl.RGBA,
          readFormat: gl.RGBA,
          dataType: gl.UNSIGNED_BYTE,
          isCompressed: false,
          unpackAlignment: 4
        };
      case TextureFormat.R4G4B4A4:
        return {
          internalFormat: isWebGL2 ? gl.RGBA4 : gl.RGBA,
          baseFormat: gl.RGBA,
          dataType: gl.UNSIGNED_SHORT_4_4_4_4,
          isCompressed: false,
          unpackAlignment: 2
        };
      case TextureFormat.R5G5B5A1:
        return {
          internalFormat: isWebGL2 ? gl.RGB5_A1 : gl.RGBA,
          baseFormat: gl.RGBA,
          dataType: gl.UNSIGNED_SHORT_5_5_5_1,
          isCompressed: false,
          unpackAlignment: 2
        };
      case TextureFormat.R5G6B5:
        return {
          internalFormat: isWebGL2 ? gl.RGB565 : gl.RGB,
          baseFormat: gl.RGB,
          dataType: gl.UNSIGNED_SHORT_5_6_5,
          isCompressed: false,
          unpackAlignment: 2
        };
      case TextureFormat.Alpha8:
        return {
          internalFormat: gl.ALPHA,
          baseFormat: gl.ALPHA,
          dataType: gl.UNSIGNED_BYTE,
          isCompressed: false,
          unpackAlignment: 1
        };
      case TextureFormat.LuminanceAlpha:
        return {
          internalFormat: gl.LUMINANCE_ALPHA,
          baseFormat: gl.LUMINANCE_ALPHA,
          dataType: gl.UNSIGNED_BYTE,
          isCompressed: false,
          unpackAlignment: 2
        };
      case TextureFormat.R16G16B16A16:
        return {
          internalFormat: isWebGL2 ? gl.RGBA16F : gl.RGBA,
          baseFormat: gl.RGBA,
          dataType: gl.HALF_FLOAT,
          isCompressed: false,
          unpackAlignment: 8
        };
      case TextureFormat.R32G32B32A32:
        return {
          internalFormat: isWebGL2 ? gl.RGBA32F : gl.RGBA,
          baseFormat: gl.RGBA,
          dataType: gl.FLOAT,
          isCompressed: false,
          unpackAlignment: 8
        };
      // Only WebGL2 support
      case TextureFormat.R11G11B10_UFloat:
        return {
          internalFormat: gl.R11F_G11F_B10F,
          baseFormat: gl.RGB,
          dataType: gl.FLOAT,
          isCompressed: false,
          unpackAlignment: 4
        };
      // Only WebGL2 support
      case TextureFormat.R32G32B32A32_UInt:
        return {
          internalFormat: gl.RGBA32UI,
          baseFormat: gl.RGBA_INTEGER,
          dataType: gl.UNSIGNED_INT,
          isCompressed: false,
          unpackAlignment: 8
        };
      // Only WebGL2 support
      case TextureFormat.R8:
        return {
          internalFormat: gl.R8,
          baseFormat: gl.RED,
          dataType: gl.UNSIGNED_BYTE,
          isCompressed: false,
          unpackAlignment: 1
        };
      // Only WebGL2 support
      case TextureFormat.R8G8:
        return {
          internalFormat: gl.RG8,
          baseFormat: gl.RG,
          dataType: gl.UNSIGNED_BYTE,
          isCompressed: false,
          unpackAlignment: 2
        };
      case TextureFormat.BC1:
        return {
          internalFormat: isSRGBColorSpace
            ? GLCompressedTextureInternalFormat.SRGB_S3TC_DXT1_EXT
            : GLCompressedTextureInternalFormat.RGB_S3TC_DXT1_EXT,
          isCompressed: true
        };
      case TextureFormat.BC3:
        return {
          internalFormat: isSRGBColorSpace
            ? GLCompressedTextureInternalFormat.SRGB_ALPHA_S3TC_DXT5_EXT
            : GLCompressedTextureInternalFormat.RGBA_S3TC_DXT5_EXT,
          isCompressed: true
        };
      case TextureFormat.BC7:
        return {
          internalFormat: isSRGBColorSpace
            ? GLCompressedTextureInternalFormat.SRGB_ALPHA_BPTC_UNORM_EXT
            : GLCompressedTextureInternalFormat.RGBA_BPTC_UNORM_EXT,
          isCompressed: true
        };
      case TextureFormat.ETC1_RGB:
        return {
          internalFormat: GLCompressedTextureInternalFormat.RGB_ETC1_WEBGL,
          isCompressed: true
        };
      case TextureFormat.ETC2_RGB:
        return {
          internalFormat: isSRGBColorSpace
            ? GLCompressedTextureInternalFormat.SRGB8_ETC2
            : GLCompressedTextureInternalFormat.RGB8_ETC2,
          isCompressed: true
        };
      case TextureFormat.ETC2_RGBA5:
        return {
          internalFormat: GLCompressedTextureInternalFormat.RGB8_PUNCHTHROUGH_ALPHA1_ETC2,
          isCompressed: true
        };
      case TextureFormat.ETC2_RGBA8:
        return {
          internalFormat: isSRGBColorSpace
            ? GLCompressedTextureInternalFormat.SRGB8_ALPHA8_ETC2_EAC
            : GLCompressedTextureInternalFormat.RGBA8_ETC2_EAC,
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
          internalFormat: isSRGBColorSpace
            ? GLCompressedTextureInternalFormat.SRGB8_ALPHA8_ASTC_4X4_KHR
            : GLCompressedTextureInternalFormat.RGBA_ASTC_4X4_KHR,
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

      case TextureFormat.Depth:
        return {
          internalFormat: isWebGL2 ? gl.DEPTH_COMPONENT32F : gl.DEPTH_COMPONENT,
          baseFormat: gl.DEPTH_COMPONENT,
          dataType: isWebGL2 ? gl.FLOAT : gl.UNSIGNED_SHORT,
          isCompressed: false,
          attachment: gl.DEPTH_ATTACHMENT
        };
      case TextureFormat.DepthStencil:
        return {
          internalFormat: isWebGL2 ? gl.DEPTH32F_STENCIL8 : gl.DEPTH_STENCIL,
          baseFormat: gl.DEPTH_STENCIL,
          dataType: isWebGL2 ? gl.FLOAT_32_UNSIGNED_INT_24_8_REV : gl.UNSIGNED_INT_24_8,
          isCompressed: false,
          attachment: gl.DEPTH_STENCIL_ATTACHMENT
        };
      case TextureFormat.Depth16:
        return {
          internalFormat: isWebGL2 ? gl.DEPTH_COMPONENT16 : gl.DEPTH_COMPONENT,
          baseFormat: gl.DEPTH_COMPONENT,
          dataType: gl.UNSIGNED_SHORT,
          isCompressed: false,
          attachment: gl.DEPTH_ATTACHMENT
        };
      case TextureFormat.Depth24Stencil8:
        return {
          internalFormat: isWebGL2 ? gl.DEPTH24_STENCIL8 : gl.DEPTH_STENCIL,
          baseFormat: gl.DEPTH_STENCIL,
          dataType: gl.UNSIGNED_INT_24_8,
          isCompressed: false,
          attachment: gl.DEPTH_STENCIL_ATTACHMENT
        };
      // Only WebGL2 support
      case TextureFormat.Depth24:
        return {
          internalFormat: gl.DEPTH_COMPONENT24,
          baseFormat: gl.DEPTH_COMPONENT,
          dataType: gl.UNSIGNED_INT,
          isCompressed: false,
          attachment: gl.DEPTH_ATTACHMENT
        };
      // Only WebGL2 support
      case TextureFormat.Depth32:
        return {
          internalFormat: gl.DEPTH_COMPONENT32F,
          baseFormat: gl.DEPTH_COMPONENT,
          dataType: gl.FLOAT,
          isCompressed: false,
          attachment: gl.DEPTH_ATTACHMENT
        };
      // Only WebGL2 support
      case TextureFormat.Depth32Stencil8:
        return {
          internalFormat: gl.DEPTH32F_STENCIL8,
          baseFormat: gl.DEPTH_STENCIL,
          dataType: gl.FLOAT_32_UNSIGNED_INT_24_8_REV,
          isCompressed: false,
          attachment: gl.DEPTH_STENCIL_ATTACHMENT
        };
      default:
        throw new Error(`this TextureFormat is not supported in Galacean Engine: ${format}`);
    }
  }

  /**
   * In WebGL 1, internalformat must be the same as baseFormat when call texImage2D.
   * @internal
   */
  static _getRenderBufferDepthFormatDetail(
    format: TextureFormat,
    gl: WebGLRenderingContext & WebGL2RenderingContext,
    isWebGL2: boolean
  ): TextureFormatDetail {
    switch (format) {
      case TextureFormat.Depth:
        return {
          internalFormat: isWebGL2 ? gl.DEPTH_COMPONENT32F : gl.DEPTH_COMPONENT16,
          baseFormat: gl.DEPTH_COMPONENT,
          dataType: isWebGL2 ? gl.FLOAT : gl.UNSIGNED_SHORT,
          isCompressed: false,
          attachment: gl.DEPTH_ATTACHMENT
        };
      case TextureFormat.DepthStencil:
        return {
          internalFormat: isWebGL2 ? gl.DEPTH32F_STENCIL8 : gl.DEPTH_STENCIL,
          baseFormat: gl.DEPTH_STENCIL,
          dataType: isWebGL2 ? gl.FLOAT_32_UNSIGNED_INT_24_8_REV : gl.UNSIGNED_INT_24_8,
          isCompressed: false,
          attachment: gl.DEPTH_STENCIL_ATTACHMENT
        };
      case TextureFormat.Stencil:
        return {
          internalFormat: gl.STENCIL_INDEX8,
          baseFormat: gl.STENCIL_ATTACHMENT,
          dataType: gl.UNSIGNED_BYTE,
          isCompressed: false,
          attachment: gl.STENCIL_ATTACHMENT
        };
      case TextureFormat.Depth16:
        return {
          internalFormat: gl.DEPTH_COMPONENT16,
          baseFormat: gl.DEPTH_COMPONENT,
          dataType: gl.UNSIGNED_SHORT,
          isCompressed: false,
          attachment: gl.DEPTH_ATTACHMENT
        };
      case TextureFormat.Depth24Stencil8:
        return {
          internalFormat: isWebGL2 ? gl.DEPTH24_STENCIL8 : gl.DEPTH_STENCIL,
          baseFormat: gl.DEPTH_STENCIL,
          dataType: gl.UNSIGNED_INT_24_8,
          isCompressed: false,
          attachment: gl.DEPTH_STENCIL_ATTACHMENT
        };
      case TextureFormat.Depth24:
        return {
          internalFormat: gl.DEPTH_COMPONENT24,
          baseFormat: gl.DEPTH_COMPONENT,
          dataType: gl.UNSIGNED_INT,
          isCompressed: false,
          attachment: gl.DEPTH_ATTACHMENT
        };
      case TextureFormat.Depth32:
        return {
          internalFormat: gl.DEPTH_COMPONENT32F,
          baseFormat: gl.DEPTH_COMPONENT,
          dataType: gl.FLOAT,
          isCompressed: false,
          attachment: gl.DEPTH_ATTACHMENT
        };

      case TextureFormat.Depth32Stencil8:
        return {
          internalFormat: gl.DEPTH32F_STENCIL8,
          baseFormat: gl.DEPTH_STENCIL,
          dataType: gl.FLOAT_32_UNSIGNED_INT_24_8_REV,
          isCompressed: false,
          attachment: gl.DEPTH_STENCIL_ATTACHMENT
        };
      default:
        throw new Error(`this TextureFormat is not supported in Galacean Engine: ${format}`);
    }
  }

  /**
   * @internal
   */
  static _supportRenderBufferColorFormat(format: TextureFormat, rhi: WebGLGraphicDevice): boolean {
    let isSupported = true;

    switch (format) {
      case TextureFormat.R16G16B16A16:
        {
          if (!rhi.canIUse(GLCapabilityType.colorBufferHalfFloat) || !rhi.canIUse(GLCapabilityType.textureHalfFloat)) {
            isSupported = false;
          }
        }
        break;
      case TextureFormat.R32G32B32A32:
        {
          if (!rhi.canIUse(GLCapabilityType.colorBufferFloat) || !rhi.canIUse(GLCapabilityType.textureFloat)) {
            isSupported = false;
          }
        }
        break;

      case TextureFormat.R11G11B10_UFloat:
        {
          isSupported = rhi.isWebGL2;
        }
        break;
    }

    return isSupported;
  }

  /**
   * @internal
   */
  static _supportRenderBufferDepthFormat(format: TextureFormat, rhi: WebGLGraphicDevice): boolean {
    if (!rhi.isWebGL2) {
      switch (format) {
        case TextureFormat.Depth24:
        case TextureFormat.Depth32:
        case TextureFormat.Depth32Stencil8:
          return false;
      }
    }

    return true;
  }

  /** @internal */
  _texture: Texture;
  /** @internal */
  _glTexture: WebGLTexture;
  /** @internal */
  _rhi: WebGLGraphicDevice;
  /** @internal */
  _gl: WebGLRenderingContext & WebGL2RenderingContext;
  /** @internal */
  _isWebGL2: boolean;
  /** @internal */
  _target: GLenum; // gl.TEXTURE_2D | gl.TEXTURE_CUBE_MAP
  /** @internal */
  _formatDetail: TextureFormatDetail;

  /**
   * Wrapping mode for texture coordinate S.
   */
  set wrapModeU(value: TextureWrapMode) {
    this._bind();
    this._setWrapMode(value, this._gl.TEXTURE_WRAP_S);
  }

  /**
   * Wrapping mode for texture coordinate T.
   */
  set wrapModeV(value: TextureWrapMode) {
    this._bind();
    this._setWrapMode(value, this._gl.TEXTURE_WRAP_T);
  }

  /**
   * Filter mode for texture.
   */
  set filterMode(value: TextureFilterMode) {
    const gl = this._gl;
    const target = this._target;
    /** @ts-ignore */
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
  }

  /**
   * Anisotropic level for texture.
   */
  set anisoLevel(value: number) {
    const gl = this._gl as WebGLRenderingContext & WebGL2RenderingContext & EXT_texture_filter_anisotropic;

    this._bind();
    gl.texParameterf(this._target, gl.TEXTURE_MAX_ANISOTROPY_EXT, value);
  }

  set depthCompareFunction(value: TextureDepthCompareFunction) {
    this._bind();

    const gl = this._gl;
    switch (value) {
      case TextureDepthCompareFunction.Never:
        gl.texParameteri(this._target, gl.TEXTURE_COMPARE_FUNC, gl.NEVER);
        break;
      case TextureDepthCompareFunction.Less:
        gl.texParameteri(this._target, gl.TEXTURE_COMPARE_FUNC, gl.LESS);
        break;
      case TextureDepthCompareFunction.Equal:
        gl.texParameteri(this._target, gl.TEXTURE_COMPARE_FUNC, gl.EQUAL);
        break;
      case TextureDepthCompareFunction.LessEqual:
        gl.texParameteri(this._target, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
        break;
      case TextureDepthCompareFunction.Greater:
        gl.texParameteri(this._target, gl.TEXTURE_COMPARE_FUNC, gl.GREATER);
        break;
      case TextureDepthCompareFunction.NotEqual:
        gl.texParameteri(this._target, gl.TEXTURE_COMPARE_FUNC, gl.NOTEQUAL);
        break;
      case TextureDepthCompareFunction.GreaterEqual:
        gl.texParameteri(this._target, gl.TEXTURE_COMPARE_FUNC, gl.GEQUAL);
        break;
      case TextureDepthCompareFunction.Always:
        gl.texParameteri(this._target, gl.TEXTURE_COMPARE_FUNC, gl.ALWAYS);
        break;
    }
  }
  /**
   * Create texture in WebGL platform.
   */
  constructor(rhi: WebGLGraphicDevice, texture: Texture, target: GLenum) {
    this._texture = texture;
    this._rhi = rhi;
    this._gl = rhi.gl as WebGLRenderingContext & WebGL2RenderingContext;
    this._isWebGL2 = rhi.isWebGL2;
    this._target = target;
    this._glTexture = this._gl.createTexture();
  }

  /**
   * Destroy texture.
   */
  destroy() {
    this._gl.deleteTexture(this._glTexture);
    this._texture = null;
    this._glTexture = null;
    this._formatDetail = null;
  }

  /**
   * @internal
   */
  setUseDepthCompareMode(value: boolean): void {
    const gl = this._gl;
    gl.texParameteri(this._target, gl.TEXTURE_COMPARE_MODE, value ? gl.COMPARE_REF_TO_TEXTURE : gl.NONE);
  }

  /**
   * Generate multi-level textures based on the 0th level data.
   */
  generateMipmaps(): void {
    const texture = this._texture;
    //@ts-ignore
    const mipmap = texture._mipmap;

    if (!TextureUtils.supportGenerateMipmaps(texture.format, mipmap, texture.isSRGBColorSpace, this._isWebGL2)) {
      Logger.warn(
        "Auto-generating mipmaps for sRGB textures is only supported in [WebGL2 + R8G8B8A8], you must generate mipmaps manually."
      );
      return;
    }

    // @todo (1x1).generateMipmap() will flash back in uc.
    if (texture.width !== 1 || texture.height !== 1) {
      this._bind();
      this._gl.generateMipmap(this._target);
    }
  }

  protected _bind() {
    this._rhi.bindTexture(this);
  }

  /**
   * Pre-development mipmapping GPU memory.
   */
  protected _init(isCube: boolean): void {
    const gl = this._gl;
    const isWebGL2 = this._isWebGL2;
    let { internalFormat, baseFormat, dataType } = this._formatDetail;
    // @ts-ignore
    const { mipmapCount, width, height, usage, _isDepthTexture } = this._texture;

    this._bind();

    if (isWebGL2 && !(baseFormat === gl.LUMINANCE_ALPHA || baseFormat === gl.ALPHA) && usage !== TextureUsage.Dynamic) {
      gl.texStorage2D(this._target, mipmapCount, internalFormat, width, height);
    } else {
      if (!isCube) {
        if (_isDepthTexture) {
          gl.texImage2D(this._target, 0, internalFormat, width, height, 0, baseFormat, dataType, null);
        } else {
          for (let i = 0; i < mipmapCount; i++) {
            const mipWidth = Math.max(1, width >> i);
            const mipHeight = Math.max(1, height >> i);
            gl.texImage2D(this._target, i, internalFormat, mipWidth, mipHeight, 0, baseFormat, dataType, null);
          }
        }
      } else {
        for (let i = 0; i < mipmapCount; i++) {
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
  }

  /**
   * Get the pixel color buffer according to the specified cube face and area.
   * @param face - You can choose which cube face to read
   * @param x - X coordinate of area start
   * @param y - Y coordinate of area start
   * @param width - Area width
   * @param height - Area height
   * @param out - Color buffer
   * @param mipLevel - Set mip level the data want to get from
   */
  protected _getPixelBuffer(
    face: TextureCubeFace | null,
    x: number,
    y: number,
    width: number,
    height: number,
    mipLevel: number,
    out: ArrayBufferView
  ): void {
    const gl = this._gl;
    const { baseFormat, dataType, readFormat, unpackAlignment } = this._formatDetail;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this._getReadFrameBuffer());

    if (mipLevel > 0 && !this._isWebGL2) {
      mipLevel = 0;
      Logger.error("mipLevel only take effect in WebGL2.0");
    }

    if (face != null) {
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        gl.TEXTURE_CUBE_MAP_POSITIVE_X + face,
        this._glTexture,
        mipLevel
      );
    } else {
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this._glTexture, mipLevel);
    }

    gl.pixelStorei(gl.PACK_ALIGNMENT, unpackAlignment);
    // Base format is different from read format in webgl1.0 with sRGB
    gl.readPixels(x, y, width, height, readFormat ?? baseFormat, dataType, out);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  protected _getReadFrameBuffer(): WebGLFramebuffer {
    let frameBuffer = this._rhi._readFrameBuffer;
    if (!frameBuffer) {
      this._rhi._readFrameBuffer = frameBuffer = this._gl.createFramebuffer();
    }
    return frameBuffer;
  }

  protected _validate(texture: Texture, rhi: WebGLGraphicDevice): void {
    const { format, width, height } = texture;

    // Validate sRGB format
    // @ts-ignore
    const isSRGBColorSpace = texture._isSRGBColorSpace;
    if (isSRGBColorSpace && !TextureUtils.supportSRGB(format)) {
      Logger.warn("Only support sRGB color space in RGB8 or RGBA8 or some compressed texture format");
      // @ts-ignore
      texture._isSRGBColorSpace = false;
    }

    const isWebGL2 = rhi.isWebGL2;

    // Validate mipmap
    // @ts-ignore
    const mipmap = texture._mipmap;
    if (mipmap && !TextureUtils.supportMipmaps(width, height, isWebGL2)) {
      Logger.warn(
        "Non-power-2 texture is not supported for mipmap in WebGL1, and has automatically downgraded to non-mipmap"
      );
      /** @ts-ignore */
      texture._mipmap = false;
      /** @ts-ignore */
      texture._mipmapCount = texture._getMipmapCount();
    }
  }

  private _setWrapMode(value: TextureWrapMode, pname: GLenum): void {
    const gl = this._gl;
    const isWebGL2 = this._isWebGL2;
    const target = this._target;
    const { width, height } = this._texture;

    if (!isWebGL2 && value !== TextureWrapMode.Clamp && (!MathUtil.isPowerOf2(width) || !MathUtil.isPowerOf2(height))) {
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
}
