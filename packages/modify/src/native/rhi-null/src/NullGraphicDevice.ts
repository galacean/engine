import { GLCapabilityType, SetDataOptions } from "@galacean/engine";
import type {
  IHardwareRenderer,
  IPlatformRenderTarget,
  IPlatformTransformFeedback,
  IPlatformTransformFeedbackPrimitive,
  BufferBindFlag,
  BufferUsage
} from "@galacean/engine";
import { NullBuffer } from "./NullBuffer";
import { NullTexture2D, NullTexture2DArray, NullTextureCube } from "./NullTexture";

/** Graphics resource adapter that never opens a GPU context. */
export class NullGraphicDevice implements IHardwareRenderer {
  readonly backend = "null";
  beginFrame(): void {}
  endRenderPass(): void {}
  endFrame(): void {}
  applyRenderState(): void {}
  createPlatformShaderProgram(): never {
    throw new Error("Shader programs require a graphics device.");
  }
  readonly supportsCompute = false;
  readonly supportsTransformFeedback = false;
  readonly supportsRendering = false;
  readonly maxUniformBlockSize = 0;
  readonly maxUniformBufferBindings = 0;
  readonly maxVertexUniformBlocks = 0;
  readonly maxFragmentUniformBlocks = 0;
  readonly resolveShaderConstant = (): undefined => undefined;
  readonly uniformBufferOffsetAlignment = 1;
  readonly _options = {};
  readonly capability = {
    maxTextureSize: 0,
    maxDrawBuffers: 0,
    maxAntiAliasing: 1,
    maxVertexUniformVectors: 0,
    maxFragmentTextureUnits: 16
  };
  _currentBindShaderProgram = null;

  get gl(): never {
    throw new Error("A WebGL context is unavailable on a null graphics device.");
  }

  init(): void {}

  canIUse(_capability: GLCapabilityType): boolean {
    return false;
  }

  canIUseCompressedTextureInternalFormat(): boolean {
    return true;
  }

  supportsTextureFormat(): boolean {
    return true;
  }

  supportsRenderTargetColorFormat(): boolean {
    return true;
  }

  supportsGenerateMipmaps(): boolean {
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
  invalidateRenderTarget(): void {}
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
  bindUniformBufferRange(
    _binding: number,
    buffer: NullBuffer,
    byteOffset: number,
    _byteSize: number,
    data?: ArrayBufferView,
    discard?: boolean
  ): void {
    if (data) {
      const options = discard ? SetDataOptions.Discard : SetDataOptions.None;
      buffer.setData(buffer.byteLength, data, byteOffset, 0, undefined, options);
    }
  }
  tryBindUniformBlock(): boolean {
    return false;
  }
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
