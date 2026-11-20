import { GLCapabilityType, TextureFormat } from "@galacean/engine-core";
import { WebGLGraphicDevice } from "./WebGLGraphicDevice";
import { GLCompressedTextureInternalFormat } from "./type";

/**
 * GL capability.
 */
export class GLCapability {
  private _maxDrawBuffers: number;
  private _maxAnisoLevel: number;
  private _maxAntiAliasing: number;

  _rhi: WebGLGraphicDevice;
  capabilityList: Map<GLCapabilityType, boolean>;

  get maxTextureSize(): number {
    return this.rhi.renderStates.getParameter(this.rhi.gl.MAX_TEXTURE_SIZE);
  }

  get maxVertexUniformVectors(): number {
    return this.rhi.renderStates.getParameter(this.rhi.gl.MAX_VERTEX_UNIFORM_VECTORS);
  }

  get maxDrawBuffers() {
    if (!this._maxDrawBuffers) {
      this._maxDrawBuffers = this._rhi.gl.getParameter(this._rhi.gl.MAX_DRAW_BUFFERS);
    }
    return this._maxDrawBuffers;
  }

  /**
   * Max anisoLevel.
   */
  get maxAnisoLevel(): number {
    if (!this._maxAnisoLevel) {
      const ext = this._rhi.requireExtension(GLCapabilityType.textureFilterAnisotropic);
      this._maxAnisoLevel = ext ? this._rhi.gl.getParameter(ext.MAX_TEXTURE_MAX_ANISOTROPY_EXT) : 1;
    }
    return this._maxAnisoLevel;
  }

  /**
   * Max MSAA count.
   */
  get maxAntiAliasing(): number {
    if (!this._maxAntiAliasing) {
      const gl = this._rhi.gl;
      this._maxAntiAliasing = gl.getParameter(gl.MAX_SAMPLES);
    }
    return this._maxAntiAliasing;
  }

  get rhi() {
    return this._rhi;
  }

  constructor(rhi: WebGLGraphicDevice) {
    this._rhi = rhi;
    this.capabilityList = new Map();

    this._init();
  }

  /**
   * Check device capabilities.
   */
  canIUse(capabilityType: GLCapabilityType): boolean {
    return this.capabilityList.get(capabilityType)!;
  }

  /**
   * Check if can use some compressed texture format.
   */
  canIUseCompressedTextureInternalFormat(internalType: GLCompressedTextureInternalFormat): boolean {
    const {
      // astc
      RGBA_ASTC_4X4_KHR,
      RGBA_ASTC_12X12_KHR,
      SRGB8_ALPHA8_ASTC_4X4_KHR,
      SRGB8_ALPHA8_ASTC_12X12_KHR,
      // etc1
      RGB_ETC1_WEBGL,
      // etc
      R11_EAC,
      SRGB8_ALPHA8_ETC2_EAC,
      // pvrtc
      RGB_PVRTC_4BPPV1_IMG,
      RGBA_PVRTC_2BPPV1_IMG,
      // s3tc
      RGB_S3TC_DXT1_EXT,
      RGBA_S3TC_DXT5_EXT,
      SRGB_S3TC_DXT1_EXT,
      SRGB_ALPHA_S3TC_DXT5_EXT,

      // bptc
      RGBA_BPTC_UNORM_EXT,
      RGB_BPTC_UNSIGNED_FLOAT_EXT
    } = GLCompressedTextureInternalFormat;
    if (
      (internalType >= RGBA_ASTC_4X4_KHR && internalType <= RGBA_ASTC_12X12_KHR) ||
      (internalType >= SRGB8_ALPHA8_ASTC_4X4_KHR && internalType <= SRGB8_ALPHA8_ASTC_12X12_KHR)
    ) {
      return this.canIUse(GLCapabilityType.astc);
    } else if (internalType === RGB_ETC1_WEBGL) {
      return this.canIUse(GLCapabilityType.etc1);
    } else if (internalType >= R11_EAC && internalType <= SRGB8_ALPHA8_ETC2_EAC) {
      return this.canIUse(GLCapabilityType.etc);
    } else if (internalType >= RGB_PVRTC_4BPPV1_IMG && internalType <= RGBA_PVRTC_2BPPV1_IMG) {
      return this.canIUse(GLCapabilityType.pvrtc);
    } else if (internalType >= RGB_S3TC_DXT1_EXT && internalType <= RGBA_S3TC_DXT5_EXT) {
      return this.canIUse(GLCapabilityType.s3tc);
    } else if (internalType >= SRGB_S3TC_DXT1_EXT && internalType <= SRGB_ALPHA_S3TC_DXT5_EXT) {
      return this.canIUse(GLCapabilityType.s3tc_srgb);
    } else if (internalType >= RGBA_BPTC_UNORM_EXT && internalType <= RGB_BPTC_UNSIGNED_FLOAT_EXT) {
      return this.canIUse(GLCapabilityType.bptc);
    }
    return false;
  }

  /**
   * Check whether the given texture format is supported.
   */
  supportsTextureFormat(format: TextureFormat): boolean {
    switch (format) {
      case TextureFormat.R16_UNorm:
        return this.canIUse(GLCapabilityType.textureNorm16);
      case TextureFormat.BC1:
      case TextureFormat.BC3:
        return this.canIUse(GLCapabilityType.s3tc);
      case TextureFormat.BC7:
      case TextureFormat.BC6H:
        return this.canIUse(GLCapabilityType.bptc);
      case TextureFormat.ETC1_RGB:
        return this.canIUse(GLCapabilityType.etc1);
      case TextureFormat.ETC2_RGB:
      case TextureFormat.ETC2_RGBA5:
      case TextureFormat.ETC2_RGBA8:
        return this.canIUse(GLCapabilityType.etc);
      case TextureFormat.PVRTC_RGB2:
      case TextureFormat.PVRTC_RGBA2:
      case TextureFormat.PVRTC_RGB4:
      case TextureFormat.PVRTC_RGBA4:
        return this.canIUse(GLCapabilityType.pvrtc);
      case TextureFormat.ASTC_4x4:
      case TextureFormat.ASTC_5x5:
      case TextureFormat.ASTC_6x6:
      case TextureFormat.ASTC_8x8:
      case TextureFormat.ASTC_10x10:
      case TextureFormat.ASTC_12x12:
        return this.canIUse(GLCapabilityType.astc);
      case TextureFormat.R8G8B8_UNorm:
      case TextureFormat.R8G8B8A8_UNorm:
      case TextureFormat.R4G4B4A4_UNorm:
      case TextureFormat.R5G5B5A1_UNorm:
      case TextureFormat.R5G6B5_UNorm:
      case TextureFormat.R16G16B16A16_SFloat:
      case TextureFormat.R32G32B32A32_SFloat:
      case TextureFormat.R32G32B32A32_UInt:
      case TextureFormat.R11G11B10_UFloat:
      case TextureFormat.R16_SFloat:
      case TextureFormat.R16G16_SFloat:
      case TextureFormat.R32_SFloat:
      case TextureFormat.R32G32_SFloat:
      case TextureFormat.R8_UNorm:
      case TextureFormat.R8G8_UNorm:
      case TextureFormat.Depth:
      case TextureFormat.DepthStencil:
      case TextureFormat.Depth16:
      case TextureFormat.Depth24:
      case TextureFormat.Depth32:
      case TextureFormat.Depth24Stencil8:
      case TextureFormat.Depth32Stencil8:
        return true;
      default:
        return false;
    }
  }

  /**
   * Check whether the given texture format can be rendered to as a color attachment.
   */
  supportsRenderTargetColorFormat(format: TextureFormat): boolean {
    switch (format) {
      case TextureFormat.R8_UNorm:
      case TextureFormat.R8G8_UNorm:
      case TextureFormat.R8G8B8_UNorm:
      case TextureFormat.R8G8B8A8_UNorm:
      case TextureFormat.R4G4B4A4_UNorm:
      case TextureFormat.R5G5B5A1_UNorm:
      case TextureFormat.R5G6B5_UNorm:
      case TextureFormat.R32G32B32A32_UInt:
        return true;
      case TextureFormat.R16_UNorm:
        return this.canIUse(GLCapabilityType.textureNorm16);
      case TextureFormat.R16G16B16A16_SFloat:
        return this.canIUse(GLCapabilityType.colorBufferHalfFloat);
      case TextureFormat.R16_SFloat:
      case TextureFormat.R16G16_SFloat:
      case TextureFormat.R32_SFloat:
      case TextureFormat.R32G32_SFloat:
      case TextureFormat.R32G32B32A32_SFloat:
      case TextureFormat.R11G11B10_UFloat:
        return this.canIUse(GLCapabilityType.colorBufferFloat);
      default:
        return false;
    }
  }

  /**
   * Check whether the given texture format supports automatic mipmap generation.
   */
  supportsGenerateMipmaps(format: TextureFormat, isSRGBColorSpace: boolean): boolean {
    if (isSRGBColorSpace && format === TextureFormat.R8G8B8_UNorm) {
      return false;
    }
    return this.supportsRenderTargetColorFormat(format) && this._supportsLinearFiltering(format);
  }

  /**
   * @internal
   */
  _supportsLinearFiltering(format: TextureFormat): boolean {
    switch (format) {
      case TextureFormat.R32_SFloat:
      case TextureFormat.R32G32_SFloat:
      case TextureFormat.R32G32B32A32_SFloat:
        return this.canIUse(GLCapabilityType.textureFloatLinear);
      case TextureFormat.R32G32B32A32_UInt:
        return false;
      default:
        return true;
    }
  }

  /**
   *  Init capabilities.
   */
  private _init() {
    const cap = this.capabilityList;
    const requireExtension = this.rhi.requireExtension.bind(this.rhi);

    const {
      astc,
      astc_webkit,
      astc_hdr,
      etc,
      etc_webkit,
      etc1,
      etc1_webkit,
      pvrtc,
      pvrtc_webkit,
      s3tc,
      s3tc_webkit,
      bptc,
      s3tc_srgb,

      textureNorm16,
      textureFloatLinear,
      colorBufferFloat,
      colorBufferHalfFloat,
      textureFilterAnisotropic
    } = GLCapabilityType;
    cap.set(textureNorm16, !!requireExtension(textureNorm16));
    cap.set(textureFloatLinear, !!requireExtension(textureFloatLinear));
    cap.set(colorBufferFloat, !!requireExtension(colorBufferFloat));
    cap.set(colorBufferHalfFloat, !!requireExtension(colorBufferFloat) || !!requireExtension(colorBufferHalfFloat));
    cap.set(textureFilterAnisotropic, !!requireExtension(textureFilterAnisotropic));

    cap.set(etc, !!(requireExtension(etc) || requireExtension(etc_webkit)));
    cap.set(etc1, !!(requireExtension(etc1) || requireExtension(etc1_webkit)));
    cap.set(pvrtc, !!(requireExtension(pvrtc) || requireExtension(pvrtc_webkit)));
    cap.set(s3tc, !!(requireExtension(s3tc) || requireExtension(s3tc_webkit)));
    cap.set(s3tc_srgb, !!requireExtension(s3tc_srgb));
    cap.set(bptc, !!requireExtension(bptc));

    const astcExtension = requireExtension(astc) || requireExtension(astc_webkit);
    cap.set(astc, !!astcExtension);
    cap.set(
      astc_hdr,
      typeof astcExtension?.getSupportedProfiles === "function" && astcExtension.getSupportedProfiles().includes("hdr")
    );
  }
}
