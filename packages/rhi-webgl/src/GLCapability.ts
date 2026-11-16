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

  get canUseFloatTextureBlendShape(): boolean {
    return (
      this.canIUse(GLCapabilityType.shaderVertexID) &&
      this.canIUse(GLCapabilityType.textureFloat) &&
      this.rhi.renderStates.getParameter(this.rhi.gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS) > 0
    );
  }

  /**
   * Whether can use more joints.
   */
  get canIUseMoreJoints(): boolean {
    return (
      this.canIUse(GLCapabilityType.textureFloat) &&
      this.rhi.renderStates.getParameter(this.rhi.gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS) > 0
    );
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

  get isFragmentHighPrecision(): boolean {
    const gl = this._rhi.gl;
    return gl.getShaderPrecisionFormat(gl.FRAGMENT_SHADER, gl.HIGH_FLOAT)!.precision !== 0;
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

      // bptc
      RGBA_BPTC_UNORM_EXT,
      RGB_BPTC_UNSIGNED_FLOAT_EXT
    } = GLCompressedTextureInternalFormat;
    if (
      (internalType >= RGBA_ASTC_4X4_KHR && RGBA_ASTC_12X12_KHR <= RGBA_ASTC_12X12_KHR) ||
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
    } else if (internalType >= RGBA_BPTC_UNORM_EXT && internalType <= RGB_BPTC_UNSIGNED_FLOAT_EXT) {
      return this.canIUse(GLCapabilityType.bptc);
    }
    return false;
  }

  /**
   *  Init capabilities.
   */
  private _init() {
    const cap = this.capabilityList;
    const requireExtension = this.rhi.requireExtension.bind(this.rhi);

    const {
      shaderVertexID,
      standardDerivatives,
      shaderTextureLod,
      elementIndexUint,
      depthTexture,
      vertexArrayObject,
      instancedArrays,
      multipleSample,
      drawBuffers,
      blendMinMax,

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

      textureFloat,
      textureHalfFloat,
      textureFloatLinear,
      textureHalfFloatLinear,
      colorBufferFloat,
      colorBufferHalfFloat,
      textureFilterAnisotropic,
      fragDepth,

      sRGB
    } = GLCapabilityType;
    cap.set(shaderVertexID, true);
    cap.set(standardDerivatives, true);
    cap.set(shaderTextureLod, true);
    cap.set(elementIndexUint, true);
    cap.set(depthTexture, true);
    cap.set(vertexArrayObject, true);
    cap.set(instancedArrays, true);
    cap.set(multipleSample, true);
    cap.set(drawBuffers, true);
    cap.set(blendMinMax, true);
    cap.set(textureFloat, true);
    cap.set(textureHalfFloat, true);
    cap.set(textureFloatLinear, !!requireExtension(textureFloatLinear));
    cap.set(textureHalfFloatLinear, true);
    const floatRenderTarget = !!requireExtension(colorBufferFloat);
    cap.set(colorBufferFloat, floatRenderTarget);
    cap.set(colorBufferHalfFloat, floatRenderTarget);
    cap.set(textureFilterAnisotropic, !!requireExtension(textureFilterAnisotropic));
    cap.set(fragDepth, true);
    const anisotropic = requireExtension(textureFilterAnisotropic);
    if (anisotropic) {
      const gl = this.rhi.gl as WebGL2RenderingContext & {
        TEXTURE_MAX_ANISOTROPY_EXT: number;
      };
      gl.TEXTURE_MAX_ANISOTROPY_EXT = anisotropic.TEXTURE_MAX_ANISOTROPY_EXT;
    }

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

    cap.set(sRGB, true);
  }
}
