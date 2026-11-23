import { GLCapabilityType } from "@galacean/engine-core";

/**
 * WebGPU limits and optional features exposed through the engine capability facade.
 */
export class WebGPUCapability {
  /** Maximum 2D texture dimension. */
  readonly maxTextureSize: number;
  readonly maxVertexUniformVectors: number;
  /** Maximum sampled textures in a fragment stage. */
  readonly maxFragmentTextureUnits: number;
  /** Maximum number of color attachments. */
  readonly maxDrawBuffers: number;
  /** Maximum supported sample count used by the current WebGPU backend. */
  readonly maxAntiAliasing: number = 4;
  /** Maximum anisotropy currently exposed by the WebGPU sampler API. */
  readonly maxAnisoLevel: number = 16;
  /** WebGPU fragment shaders support 32-bit floating-point arithmetic. */
  readonly isFragmentHighPrecision: boolean = true;
  /** Whether float textures can store blend-shape data. */
  readonly canUseFloatTextureBlendShape: boolean = true;
  /** Whether the device can use the texture-based joint path. */
  readonly canIUseMoreJoints: boolean = true;

  private readonly _features: GPUSupportedFeatures;

  /**
   * Create the capability facade.
   * @param device - Initialized WebGPU device.
   */
  constructor(device: GPUDevice) {
    this._features = device.features;
    this.maxTextureSize = device.limits.maxTextureDimension2D;
    this.maxFragmentTextureUnits = device.limits.maxSampledTexturesPerShaderStage;
    this.maxVertexUniformVectors = Math.floor(device.limits.maxUniformBufferBindingSize / 16);
    this.maxDrawBuffers = device.limits.maxColorAttachments;
  }

  /**
   * Query a legacy capability by its semantic equivalent in WebGPU.
   * @param capability - Capability to query.
   * @returns Whether WebGPU provides the requested capability.
   */
  canIUse(capability: GLCapabilityType): boolean {
    switch (capability) {
      case GLCapabilityType.textureFloatLinear:
        return this._features.has("float32-filterable");
      case GLCapabilityType.textureNorm16:
        return this._features.has("texture-formats-tier1");
      case GLCapabilityType.astc:
      case GLCapabilityType.astc_webkit:
        return this._features.has("texture-compression-astc");
      case GLCapabilityType.etc:
      case GLCapabilityType.etc_webkit:
      case GLCapabilityType.etc1:
      case GLCapabilityType.etc1_webkit:
        return this._features.has("texture-compression-etc2");
      case GLCapabilityType.s3tc:
      case GLCapabilityType.s3tc_webkit:
      case GLCapabilityType.s3tc_srgb:
      case GLCapabilityType.bptc:
        return this._features.has("texture-compression-bc");
      case GLCapabilityType.pvrtc:
      case GLCapabilityType.pvrtc_webkit:
        return false;
      case GLCapabilityType.textureFilterAnisotropic:
      case GLCapabilityType.colorBufferFloat:
      case GLCapabilityType.colorBufferHalfFloat:
        return true;
      default:
        return false;
    }
  }

  /**
   * Query a backend-native compressed texture format.
   * @param _format - Backend-native format identifier.
   * @returns `false`; WebGPU callers use named device features instead.
   */
  canIUseCompressedTextureInternalFormat(_format: number): boolean {
    return false;
  }
}
