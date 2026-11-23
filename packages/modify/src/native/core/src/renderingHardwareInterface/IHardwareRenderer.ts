import type { RHIMode } from "./RHIMode";
import type { Color, Vector4 } from "@galacean/engine-math";
import type { Canvas } from "../Canvas";
import type { Engine } from "../Engine";
import type { RenderState } from "../shader/state/RenderState";
import type { RenderStateElementMap } from "../BasicResources";
import type { GLCapabilityType } from "../base/Constant";
import type { Buffer, BufferBindFlag, BufferUsage, Primitive, SubPrimitive } from "../graphic";
import type { CameraClearFlags } from "../enums/CameraClearFlags";
import type { RenderTarget, Texture2D, Texture2DArray, TextureCube, TextureCubeFace, TextureFormat } from "../texture";
import type { IPlatformBuffer } from "./IPlatformBuffer";
import type { IPlatformPrimitive } from "./IPlatformPrimitive";
import type { IPlatformRenderTarget } from "./IPlatformRenderTarget";
import type { IPlatformShaderProgram, IPlatformShaderSource } from "./IPlatformShaderProgram";
import type { IPlatformTexture } from "./IPlatformTexture";
import type { IPlatformTexture2D } from "./IPlatformTexture2D";
import type { IPlatformTexture2DArray } from "./IPlatformTexture2DArray";
import type { IPlatformTextureCube } from "./IPlatformTextureCube";
import type { IPlatformTransformFeedback } from "./IPlatformTransformFeedback";
import type { IPlatformTransformFeedbackPrimitive } from "./IPlatformTransformFeedbackPrimitive";
import type { RenderBufferLoadAction } from "./RenderBufferLoadAction";
import type { RenderBufferStoreAction } from "./RenderBufferStoreAction";

/** Graphics resource and command boundary used by the engine. */
export interface IHardwareRenderer {
  /** An XR compositor requested the scene depth produced by this eye camera. */
  readonly hasExternalProjectionDepth?: boolean;
  storeExternalProjectionDepth?(source: RenderTarget, viewport: Vector4): void;
  readonly supportsCompute: boolean;
  readonly supportsTransformFeedback: boolean;
  createFeedbackCompute?(): import("./IPlatformFeedbackCompute").IPlatformFeedbackCompute;
  readonly backend: `${RHIMode.WebGL2 | RHIMode.WebGPU}` | "null";
  readonly maxUniformBlockSize: number;
  readonly maxUniformBufferBindings: number;
  readonly maxVertexUniformBlocks: number;
  readonly maxFragmentUniformBlocks: number;
  readonly maxSampledTexturesPerShaderStage?: number;
  readonly maxSamplersPerShaderStage?: number;
  /** Textures with the same key can be copied into layers of one GPU texture. */
  getTextureArrayKey?(texture: import("../texture/Texture").Texture): string | undefined;
  getTextureSamplerKey?(
    texture: import("../texture/Texture").Texture | undefined,
    kind: "filtering" | "non-filtering" | "comparison"
  ): object;
  /** Resolve a language-defined device limit used in a shader constant expression. */
  readonly resolveShaderConstant: (name: string) => number | undefined;
  /** Required byte alignment of a uniform buffer range's starting offset. */
  readonly uniformBufferOffsetAlignment: number;
  /** Whether this device can execute rendering commands. */
  readonly supportsRendering: boolean;
  readonly capability: {
    readonly maxTextureSize: number;
    /** Number of simultaneous color outputs available on this backend. */
    readonly maxDrawBuffers: number;
    readonly maxAntiAliasing: number;
    readonly maxVertexUniformVectors: number;
    readonly maxFragmentTextureUnits: number;
  };
  /** @internal */
  readonly _options: {
    readonly depth?: boolean;
    readonly stencil?: boolean;
    readonly _forceFlush?: boolean;
    readonly _maxAllowSkinUniformVectorCount?: number;
  };

  init(canvas: Canvas, onDeviceLost: () => void, onDeviceRestored: () => void): void;
  canIUse(capability: GLCapabilityType): boolean;
  canIUseCompressedTextureInternalFormat(format: number): boolean;
  supportsTextureFormat(format: TextureFormat): boolean;
  supportsRenderTargetColorFormat(format: TextureFormat): boolean;
  supportsGenerateMipmaps(format: TextureFormat, isSRGBColorSpace: boolean): boolean;
  createPlatformPrimitive(primitive: Primitive): IPlatformPrimitive;
  createPlatformShaderProgram(engine: Engine, source: IPlatformShaderSource): IPlatformShaderProgram;
  applyRenderState(
    state: RenderState,
    lastState: RenderState,
    frontFaceInvert: boolean,
    custom?: RenderStateElementMap | null
  ): void;
  beginFrame(): void;
  endRenderPass(): void;
  endFrame(): void;
  createPlatformBuffer(
    type: BufferBindFlag,
    byteLength: number,
    usage?: BufferUsage,
    data?: ArrayBuffer | ArrayBufferView
  ): IPlatformBuffer;
  createPlatformTexture2D(texture: Texture2D): IPlatformTexture2D;
  createPlatformTexture2DArray(texture: Texture2DArray): IPlatformTexture2DArray;
  createPlatformTextureCube(texture: TextureCube): IPlatformTextureCube;
  createPlatformRenderTarget(target: RenderTarget): IPlatformRenderTarget;
  createPlatformTransformFeedback(): IPlatformTransformFeedback;
  createPlatformTransformFeedbackPrimitive(): IPlatformTransformFeedbackPrimitive;
  activeRenderTarget(
    target: RenderTarget | null,
    viewport: Vector4,
    isFlipProjection: boolean | null,
    mipLevel?: number,
    faceIndex?: TextureCubeFace,
    colorLoadAction?: RenderBufferLoadAction,
    colorStoreAction?: RenderBufferStoreAction,
    depthLoadAction?: RenderBufferLoadAction,
    depthStoreAction?: RenderBufferStoreAction,
    label?: string
  ): void;
  clearRenderTarget(engine: Engine, flags: CameraClearFlags, color?: Color | null): void;
  invalidateRenderTarget?(
    target: RenderTarget | null,
    flags: CameraClearFlags,
    fullTargetOnly?: boolean,
    mipLevel?: number
  ): void;
  drawPrimitive(primitive: Primitive, subPrimitive: SubPrimitive | null, program: IPlatformShaderProgram): void;
  blitInternalRTByBlitFrameBuffer(
    source: RenderTarget | null,
    destination: RenderTarget,
    flags: CameraClearFlags,
    viewport: Vector4
  ): void;
  /**
   * Copy tightly packed native-format texels from byte zero into mip zero of an uncompressed color texture.
   * Writes full rows then any trailing texels, in submission order. Both resources must be alive on this device.
   * Reject invalid counts and out-of-bounds copies before recording any work.
   */
  copyBufferToTexture?(source: Buffer, target: Texture2D, texelCount: number): void;
  copyRenderTargetToSubTexture(source: RenderTarget | null, texture: Texture2D, viewport: Vector4): void;
  viewport(x: number, y: number, width: number, height: number): void;
  scissor(x: number, y: number, width: number, height: number): void;
  bindUniformBufferBase(bindingPoint: number, buffer: IPlatformBuffer): void;
  /** Bind a byte range; optionally orphan the existing store and upload the full range before the draw. */
  bindUniformBufferRange(
    bindingPoint: number,
    buffer: IPlatformBuffer,
    byteOffset: number,
    byteSize: number,
    data?: ArrayBufferView,
    discard?: boolean
  ): void;
  enableRasterizerDiscard(): void;
  disableRasterizerDiscard(): void;
  invalidateShaderProgramState(): void;
  flush(): void;
  forceLoseDevice(): void;
  forceRestoreDevice(): void;
  isContextLost(): boolean;
  resetState(): void;
  destroy(): void;
}
