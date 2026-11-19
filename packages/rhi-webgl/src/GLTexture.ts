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
    gl: WebGL2RenderingContext
  ): TextureFormatDetail {
    switch (format) {
      case TextureFormat.R8G8B8_UNorm:
        return {
          internalFormat: isSRGBColorSpace ? gl.SRGB8 : gl.RGB8,
          baseFormat: gl.RGB,
          readFormat: gl.RGBA,
          dataType: gl.UNSIGNED_BYTE,
          isCompressed: false,
          alignment: 1
        };
      case TextureFormat.R8G8B8A8_UNorm:
        return {
          internalFormat: isSRGBColorSpace ? gl.SRGB8_ALPHA8 : gl.RGBA8,
          baseFormat: gl.RGBA,
          readFormat: gl.RGBA,
          dataType: gl.UNSIGNED_BYTE,
          isCompressed: false,
          alignment: 4
        };
      case TextureFormat.R4G4B4A4_UNorm:
        return {
          internalFormat: gl.RGBA4,
          baseFormat: gl.RGBA,
          dataType: gl.UNSIGNED_SHORT_4_4_4_4,
          isCompressed: false,
          alignment: 2
        };
      case TextureFormat.R5G5B5A1_UNorm:
        return {
          internalFormat: gl.RGB5_A1,
          baseFormat: gl.RGBA,
          dataType: gl.UNSIGNED_SHORT_5_5_5_1,
          isCompressed: false,
          alignment: 2
        };
      case TextureFormat.R5G6B5_UNorm:
        return {
          internalFormat: gl.RGB565,
          baseFormat: gl.RGB,
          dataType: gl.UNSIGNED_SHORT_5_6_5,
          isCompressed: false,
          alignment: 2
        };
      case TextureFormat.R16G16B16A16_SFloat:
        return {
          internalFormat: gl.RGBA16F,
          baseFormat: gl.RGBA,
          readFormat: gl.RGBA,
          readType: gl.FLOAT,
          dataType: gl.HALF_FLOAT,
          isCompressed: false,
          alignment: 8
        };
      case TextureFormat.R32G32B32A32_SFloat:
        return {
          internalFormat: gl.RGBA32F,
          baseFormat: gl.RGBA,
          dataType: gl.FLOAT,
          isCompressed: false,
          alignment: 8
        };
      case TextureFormat.R16_UNorm:
        return {
          internalFormat: 0x822a, // EXT_texture_norm16.R16_EXT
          baseFormat: gl.RED,
          readFormat: gl.RGBA,
          dataType: gl.UNSIGNED_SHORT,
          isCompressed: false,
          alignment: 2
        };
      case TextureFormat.R16_SFloat:
      case TextureFormat.R16G16_SFloat:
        return {
          internalFormat: format === TextureFormat.R16_SFloat ? gl.R16F : gl.RG16F,
          baseFormat: format === TextureFormat.R16_SFloat ? gl.RED : gl.RG,
          readFormat: gl.RGBA,
          readType: gl.FLOAT,
          dataType: gl.HALF_FLOAT,
          isCompressed: false,
          alignment: 2
        };
      case TextureFormat.R32_SFloat:
      case TextureFormat.R32G32_SFloat:
        return {
          internalFormat: format === TextureFormat.R32_SFloat ? gl.R32F : gl.RG32F,
          baseFormat: format === TextureFormat.R32_SFloat ? gl.RED : gl.RG,
          readFormat: gl.RGBA,
          dataType: gl.FLOAT,
          isCompressed: false,
          alignment: 4
        };
      case TextureFormat.R11G11B10_UFloat:
        return {
          internalFormat: gl.R11F_G11F_B10F,
          baseFormat: gl.RGB,
          readFormat: gl.RGBA,
          dataType: gl.FLOAT,
          isCompressed: false,
          alignment: 4
        };
      case TextureFormat.R32G32B32A32_UInt:
        return {
          internalFormat: gl.RGBA32UI,
          baseFormat: gl.RGBA_INTEGER,
          dataType: gl.UNSIGNED_INT,
          isCompressed: false,
          alignment: 8
        };
      case TextureFormat.R8_UNorm:
        return {
          internalFormat: gl.R8,
          baseFormat: gl.RED,
          dataType: gl.UNSIGNED_BYTE,
          isCompressed: false,
          alignment: 1
        };
      case TextureFormat.R8G8_UNorm:
        return {
          internalFormat: gl.RG8,
          baseFormat: gl.RG,
          dataType: gl.UNSIGNED_BYTE,
          isCompressed: false,
          alignment: 2
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
      case TextureFormat.BC6H:
        return {
          internalFormat: GLCompressedTextureInternalFormat.RGB_BPTC_UNSIGNED_FLOAT_EXT,
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
          internalFormat: isSRGBColorSpace
            ? GLCompressedTextureInternalFormat.SRGB8_PUNCHTHROUGH_ALPHA1_ETC2
            : GLCompressedTextureInternalFormat.RGB8_PUNCHTHROUGH_ALPHA1_ETC2,
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
          internalFormat: isSRGBColorSpace
            ? GLCompressedTextureInternalFormat.SRGB8_ALPHA8_ASTC_5X5_KHR
            : GLCompressedTextureInternalFormat.RGBA_ASTC_5X5_KHR,
          isCompressed: true
        };
      case TextureFormat.ASTC_6x6:
        return {
          internalFormat: isSRGBColorSpace
            ? GLCompressedTextureInternalFormat.SRGB8_ALPHA8_ASTC_6X6_KHR
            : GLCompressedTextureInternalFormat.RGBA_ASTC_6X6_KHR,
          isCompressed: true
        };
      case TextureFormat.ASTC_8x8:
        return {
          internalFormat: isSRGBColorSpace
            ? GLCompressedTextureInternalFormat.SRGB8_ALPHA8_ASTC_8X8_KHR
            : GLCompressedTextureInternalFormat.RGBA_ASTC_8X8_KHR,
          isCompressed: true
        };
      case TextureFormat.ASTC_10x10:
        return {
          internalFormat: isSRGBColorSpace
            ? GLCompressedTextureInternalFormat.SRGB8_ALPHA8_ASTC_10X10_KHR
            : GLCompressedTextureInternalFormat.RGBA_ASTC_10X10_KHR,
          isCompressed: true
        };
      case TextureFormat.ASTC_12x12:
        return {
          internalFormat: isSRGBColorSpace
            ? GLCompressedTextureInternalFormat.SRGB8_ALPHA8_ASTC_12X12_KHR
            : GLCompressedTextureInternalFormat.RGBA_ASTC_12X12_KHR,
          isCompressed: true
        };

      case TextureFormat.Depth:
        return {
          internalFormat: gl.DEPTH_COMPONENT32F,
          baseFormat: gl.DEPTH_COMPONENT,
          dataType: gl.FLOAT,
          isCompressed: false,
          attachment: gl.DEPTH_ATTACHMENT
        };
      case TextureFormat.DepthStencil:
        return {
          internalFormat: gl.DEPTH32F_STENCIL8,
          baseFormat: gl.DEPTH_STENCIL,
          dataType: gl.FLOAT_32_UNSIGNED_INT_24_8_REV,
          isCompressed: false,
          attachment: gl.DEPTH_STENCIL_ATTACHMENT
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
          internalFormat: gl.DEPTH24_STENCIL8,
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
  static _getRenderBufferDepthFormatDetail(format: TextureFormat, gl: WebGL2RenderingContext): TextureFormatDetail {
    switch (format) {
      case TextureFormat.Depth:
        return {
          internalFormat: gl.DEPTH_COMPONENT32F,
          baseFormat: gl.DEPTH_COMPONENT,
          dataType: gl.FLOAT,
          isCompressed: false,
          attachment: gl.DEPTH_ATTACHMENT
        };
      case TextureFormat.DepthStencil:
        return {
          internalFormat: gl.DEPTH32F_STENCIL8,
          baseFormat: gl.DEPTH_STENCIL,
          dataType: gl.FLOAT_32_UNSIGNED_INT_24_8_REV,
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
          internalFormat: gl.DEPTH24_STENCIL8,
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

  /** @internal */
  _texture: Texture;
  /** @internal */
  _glTexture: WebGLTexture | null;
  /** @internal */
  _rhi: WebGLGraphicDevice;
  /** @internal */
  _gl: WebGL2RenderingContext;
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
    const { _mipmap, format } = this._texture;

    if (
      value !== TextureFilterMode.Point &&
      this._isFloat32Format(format) &&
      !this._rhi.canIUse(GLCapabilityType.textureFloatLinear)
    ) {
      value = TextureFilterMode.Point;
    }

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
    const extension = this._rhi.requireExtension(GLCapabilityType.textureFilterAnisotropic);
    if (!extension) return;
    this._bind();
    this._gl.texParameterf(
      this._target,
      extension.TEXTURE_MAX_ANISOTROPY_EXT,
      Math.min(value, this._rhi.capability.maxAnisoLevel)
    );
  }

  set depthCompareFunction(value: TextureDepthCompareFunction) {
    if (value === undefined) return;
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
    this._gl = rhi.gl;
    this._target = target;
    this._glTexture = this._gl.createTexture();
  }

  /**
   * Destroy texture.
   */
  destroy() {
    this._gl.deleteTexture(this._glTexture);
    this._texture = null!;
    this._glTexture = null!;
    this._formatDetail = null!;
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
    const mipmap = texture._mipmap;

    if (!TextureUtils.supportGenerateMipmaps(texture.format, mipmap, texture.isSRGBColorSpace)) {
      Logger.warn(
        "Auto-generating mipmaps for sRGB textures is only supported in [WebGL2 + R8G8B8A8_UNorm], you must generate mipmaps manually."
      );
      return;
    }

    // WebGL2 generateMipmap requires the format to be both color-renderable and texture-filterable
    if (
      !this._rhi.supportsRenderTargetColorFormat(texture.format) ||
      (this._isFloat32Format(texture.format) && !this._rhi.canIUse(GLCapabilityType.textureFloatLinear))
    ) {
      Logger.warn(
        `Auto-generating mipmaps is not supported for TextureFormat.${TextureFormat[texture.format]} on this device.`
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
    const { internalFormat, baseFormat, dataType } = this._formatDetail;
    const { mipmapCount, width, height, usage, _isDepthTexture } = this._texture;

    this._bind();

    if (usage !== TextureUsage.Dynamic) {
      gl.texStorage2D(this._target, mipmapCount, internalFormat, width, height);
    } else {
      if (!isCube) {
        if (_isDepthTexture) {
          gl.texImage2D(this._target, 0, internalFormat, width, height, 0, baseFormat!, dataType!, null);
        } else {
          for (let i = 0; i < mipmapCount; i++) {
            const mipWidth = Math.max(1, width >> i);
            const mipHeight = Math.max(1, height >> i);
            gl.texImage2D(this._target, i, internalFormat, mipWidth, mipHeight, 0, baseFormat!, dataType!, null);
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
              baseFormat!,
              dataType!,
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
    const { dataType, readType, alignment } = this._formatDetail;
    const readFormat = this._getReadFormat();

    gl.bindFramebuffer(gl.FRAMEBUFFER, this._getReadFrameBuffer());

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

    gl.pixelStorei(gl.PACK_ALIGNMENT, alignment!);
    gl.readPixels(x, y, width, height, readFormat, readType ?? dataType!, out);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  protected _getReadFormat(): GLenum {
    const format = this._texture.format;
    if (!this._rhi.supportsRenderTargetColorFormat(format)) {
      throw new Error(`Reading pixels from TextureFormat.${TextureFormat[format]} requires color-renderable support`);
    }
    const { readFormat, baseFormat } = this._formatDetail;
    return readFormat ?? baseFormat!;
  }

  protected _getReadFrameBuffer(): WebGLFramebuffer | null {
    let frameBuffer = this._rhi._readFrameBuffer;
    if (!frameBuffer) {
      this._rhi._readFrameBuffer = frameBuffer = this._gl.createFramebuffer();
    }
    return frameBuffer;
  }

  protected _validate(texture: Texture): void {
    const { format } = texture;

    // Validate sRGB format
    // @ts-ignore
    const isSRGBColorSpace = texture._isSRGBColorSpace;
    if (isSRGBColorSpace && !TextureUtils.supportSRGB(format)) {
      Logger.warn("Only support sRGB color space in RGB8 or RGBA8 or some compressed texture format");
      // @ts-ignore
      texture._isSRGBColorSpace = false;
    }
  }

  private _isFloat32Format(format: TextureFormat): boolean {
    return (
      format === TextureFormat.R32_SFloat ||
      format === TextureFormat.R32G32_SFloat ||
      format === TextureFormat.R32G32B32A32_SFloat
    );
  }

  private _setWrapMode(value: TextureWrapMode, pname: GLenum): void {
    const gl = this._gl;
    const target = this._target;
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
