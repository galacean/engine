import { GLCapabilityType } from "@galacean/engine-core";
import type {
  IHardwareRenderer,
  IPlatformRenderTarget,
  IPlatformTransformFeedback,
  IPlatformTransformFeedbackPrimitive,
  BufferBindFlag,
  BufferUsage
} from "@galacean/engine-core";
import { NullBuffer } from "./NullBuffer";
import { NullTexture2D, NullTexture2DArray, NullTextureCube } from "./NullTexture";

/** Graphics resource adapter that never opens a GPU context. */
export class NullGraphicDevice implements IHardwareRenderer {
  readonly supportsRendering = false;
  readonly isWebGL2 = false;
  readonly maxUniformBlockSize = 0;
  readonly canIUseMoreJoints = false;
  readonly _options = {};
  readonly capability = {
    maxTextureSize: 0,
    maxAntiAliasing: 1,
    maxVertexUniformVectors: 0,
    canUseFloatTextureBlendShape: false,
    isFragmentHighPrecision: false
  };
  _currentBindShaderProgram = null;
  _enableGlobalDepthBias = false;

  get gl(): never {
    throw new Error("A WebGL context is unavailable on a null graphics device.");
  }

  init(): void {}

  canIUse(capability: GLCapabilityType): boolean {
    // Vertex storage and CPU particle simulation use these features without GPU execution.
    return capability === GLCapabilityType.elementIndexUint || capability === GLCapabilityType.instancedArrays;
  }

  canIUseCompressedTextureInternalFormat(): boolean {
    return true;
  }

  supportsTextureFormat(): boolean {
    return true;
  }
  createPlatformPrimitive() {
    return { draw() {}, destroy() {} };
  }
  createPlatformBuffer(
    _type: BufferBindFlag,
    byteLength: number,
    _usage?: BufferUsage,
    data?: ArrayBuffer | ArrayBufferView
  ): NullBuffer {
    return new NullBuffer(byteLength, data);
  }
  createPlatformTexture2D(): NullTexture2D {
    return new NullTexture2D();
  }
  createPlatformTexture2DArray(): NullTexture2DArray {
    return new NullTexture2DArray();
  }
  createPlatformTextureCube(): NullTextureCube {
    return new NullTextureCube();
  }
  createPlatformRenderTarget(): IPlatformRenderTarget {
    return { activeRenderTarget() {}, blitRenderTarget() {}, destroy() {} };
  }
  createPlatformTransformFeedback(): IPlatformTransformFeedback {
    throw new Error("Transform feedback requires a graphics device.");
  }
  createPlatformTransformFeedbackPrimitive(): IPlatformTransformFeedbackPrimitive {
    throw new Error("Transform feedback requires a graphics device.");
  }
  activeRenderTarget(): void {}
  clearRenderTarget(): void {}
  drawPrimitive(): void {}
  blitInternalRTByBlitFrameBuffer(): void {}
  copyRenderTargetToSubTexture(): never {
    throw new Error("Framebuffer copies require a graphics device.");
  }
  viewport(): void {}
  scissor(): void {}
  activeTexture(): void {}
  bindTexture(): void {}
  bindUniformBufferBase(): void {}
  setGlobalDepthBias(): void {}
  enableRasterizerDiscard(): void {}
  disableRasterizerDiscard(): void {}
  invalidateShaderProgramState(): void {}
  flush(): void {}
  forceLoseDevice(): void {}
  forceRestoreDevice(): void {}
  isContextLost(): boolean {
    return false;
  }
  resetState(): void {}
  destroy(): void {}
}
