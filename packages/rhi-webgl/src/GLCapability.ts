import { GLCapabilityType } from "@galacean/engine-core";
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

  get maxTextureSize(): boolean {
    return this.rhi.renderStates.getParameter(this.rhi.gl.MAX_TEXTURE_SIZE);
  }

  get maxDrawBuffers() {
    if (!this._maxDrawBuffers) {
      this._maxDrawBuffers = this._getMaxDrawBuffers();
    }
    return this._maxDrawBuffers;
  }

  private _getMaxDrawBuffers(): number {
    const gl = this._rhi.gl;
    return gl.getParameter(gl.MAX_DRAW_BUFFERS);
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
   * Check a detected device capability. Core WebGL2 features do not require a capability query.
   * @param capabilityType - Capability to check
   * @returns Whether the capability was detected
   */
  canIUse(capabilityType: GLCapabilityType): boolean {
    const cached = this.capabilityList.get(capabilityType);
    if (cached !== undefined) return cached;
    if (capabilityType === GLCapabilityType.vertexTextureSampling) {
      const gl = this.rhi.gl;
      const supported = gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS) > 0;
      this.capabilityList.set(capabilityType, supported);
      return supported;
    }
    return false;
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

  private _getColorBufferSupport(): { float: boolean; halfFloat: boolean } {
    const supported = !!this.rhi.requireExtension(GLCapabilityType.colorBufferFloat);
    return { float: supported, halfFloat: supported };
  }

  /**
   *  Init capabilities.
   */
  private _init() {
    const cap = this.capabilityList;
    const requireExtension = this.rhi.requireExtension.bind(this.rhi);
    const gl = this.rhi.gl;
    const gl2 = gl as WebGL2RenderingContext;
    cap.set(GLCapabilityType.transformFeedback, typeof gl2.beginTransformFeedback === "function");
    cap.set(GLCapabilityType.sRGBTexture, gl2.SRGB8_ALPHA8 !== undefined);
    cap.set(GLCapabilityType.minMaxBlend, gl2.MIN !== undefined && gl2.MAX !== undefined);
    const fragmentPrecision = gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT);
    cap.set(GLCapabilityType.fragmentHighPrecision, !!fragmentPrecision && fragmentPrecision.precision > 0);

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

      textureFloatLinear,
      colorBufferFloat,
      colorBufferHalfFloat,
      textureFilterAnisotropic,
      WEBGL_lose_context
    } = GLCapabilityType;
    cap.set(textureFloatLinear, !!requireExtension(textureFloatLinear));
    const colorBufferSupport = this._getColorBufferSupport();
    cap.set(colorBufferFloat, colorBufferSupport.float);
    cap.set(colorBufferHalfFloat, colorBufferSupport.halfFloat);
    cap.set(textureFilterAnisotropic, !!requireExtension(textureFilterAnisotropic));
    const anisotropic = requireExtension(textureFilterAnisotropic);
    if (anisotropic) {
      const gl = this.rhi.gl as WebGL2RenderingContext & {
        TEXTURE_MAX_ANISOTROPY_EXT: number;
      };
      gl.TEXTURE_MAX_ANISOTROPY_EXT = anisotropic.TEXTURE_MAX_ANISOTROPY_EXT;
    }

    const detectWithAlias = (name: GLCapabilityType, alias: GLCapabilityType) => {
      const extension = requireExtension(name);
      const legacyExtension = requireExtension(alias);
      cap.set(alias, !!legacyExtension);
      cap.set(name, !!(extension || legacyExtension));
      return extension || legacyExtension;
    };
    detectWithAlias(etc, etc_webkit);
    detectWithAlias(etc1, etc1_webkit);
    detectWithAlias(pvrtc, pvrtc_webkit);
    detectWithAlias(s3tc, s3tc_webkit);
    cap.set(s3tc_srgb, !!requireExtension(s3tc_srgb));
    cap.set(bptc, !!requireExtension(bptc));
    cap.set(WEBGL_lose_context, !!requireExtension(WEBGL_lose_context));

    const astcExtension = detectWithAlias(astc, astc_webkit);
    cap.set(
      astc_hdr,
      typeof astcExtension?.getSupportedProfiles === "function" && astcExtension.getSupportedProfiles().includes("hdr")
    );
  }
}
