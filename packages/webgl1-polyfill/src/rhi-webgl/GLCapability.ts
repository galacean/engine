import { GLCapabilityType } from "@galacean/engine-core";
import type { WebGLGraphicDevice } from "@galacean/engine-rhi-webgl";
import { Mixin, Overwrite, Shadow, callOriginal } from "@/override";
import { adaptContext } from "./context";

@Mixin("GLCapability")
export class GLCapability {
  @Shadow declare capabilityList: Map<GLCapabilityType, boolean>;
  declare readonly rhi: WebGLGraphicDevice;
  declare canIUse: (type: GLCapabilityType) => boolean;
  @Overwrite
  _init() {
    callOriginal(this);
    const { rhi, capabilityList } = this;
    const types = GLCapabilityType;
    const extensionCapabilities = [
      types.standardDerivatives,
      types.shaderTextureLod,
      types.elementIndexUint,
      types.depthTexture,
      types.vertexArrayObject,
      types.instancedArrays,
      types.drawBuffers,
      types.blendMinMax,
      types.textureFloat,
      types.textureHalfFloat,
      types.textureHalfFloatLinear,
      types.fragDepth,
      types.sRGB
    ];
    for (const type of extensionCapabilities) {
      capabilityList.set(type, !!rhi.requireExtension(type));
    }
    capabilityList.set(types.shaderVertexID, false);
    capabilityList.set(types.multipleSample, false);
    capabilityList.set(types.colorBufferFloat, !!rhi.requireExtension(types.WEBGL_colorBufferFloat));
    capabilityList.set(types.colorBufferHalfFloat, !!rhi.requireExtension(types.colorBufferHalfFloat));

    adaptContext(this as any, types);
  }
  @Overwrite
  get maxDrawBuffers() {
    return this.canIUse(GLCapabilityType.drawBuffers) ? callOriginal(this) : 1;
  }
  @Overwrite
  get maxAntiAliasing() {
    return this.canIUse(GLCapabilityType.multipleSample) ? callOriginal(this) : 1;
  }
}
