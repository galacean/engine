import type { Color, Vector4 } from "@galacean/engine-math";
import type { Canvas } from "../Canvas";
import type { Engine } from "../Engine";
import type { GLCapabilityType } from "../base/Constant";
import type { BufferBindFlag, BufferUsage, Primitive, SubPrimitive } from "../graphic";
import type { CameraClearFlags } from "../enums/CameraClearFlags";
import type { RenderTarget, Texture2D, Texture2DArray, TextureCube, TextureCubeFace, TextureFormat } from "../texture";
import type { IPlatformBuffer } from "./IPlatformBuffer";
import type { IPlatformPrimitive } from "./IPlatformPrimitive";
import type { IPlatformRenderTarget } from "./IPlatformRenderTarget";
import type { IPlatformShaderProgram } from "./IPlatformShaderProgram";
import type { IPlatformTexture } from "./IPlatformTexture";
import type { IPlatformTexture2D } from "./IPlatformTexture2D";
import type { IPlatformTexture2DArray } from "./IPlatformTexture2DArray";
import type { IPlatformTextureCube } from "./IPlatformTextureCube";
import type { IPlatformTransformFeedback } from "./IPlatformTransformFeedback";
import type { IPlatformTransformFeedbackPrimitive } from "./IPlatformTransformFeedbackPrimitive";

/** Graphics resource and command boundary used by the engine. */
export interface IHardwareRenderer {
  /** WebGL access requires a graphics-capable backend. */
  readonly gl: WebGL2RenderingContext;
  readonly maxUniformBlockSize: number;
  /** Whether this device can execute rendering commands. */
  readonly supportsRendering: boolean;
  readonly capability: {
    readonly maxTextureSize: number;
    readonly maxAntiAliasing: number;
    readonly maxVertexUniformVectors: number;
    readonly maxFragmentTextureUnits: number;
    readonly maxDrawBuffers: number;
  };
  /** @internal */
  readonly _options: {
    readonly depth?: boolean;
    readonly stencil?: boolean;
    readonly _forceFlush?: boolean;
    readonly _maxAllowSkinUniformVectorCount?: number;
  };
  /** @internal */
  _currentBindShaderProgram: IPlatformShaderProgram | null;
  /** @internal */
  _enableGlobalDepthBias: boolean;

  init(canvas: Canvas, onDeviceLost: () => void, onDeviceRestored: () => void): void;
  canIUse(capability: GLCapabilityType): boolean;
  canIUseCompressedTextureInternalFormat(format: number): boolean;
  supportsTextureFormat(format: TextureFormat): boolean;
  supportsRenderTargetColorFormat(format: TextureFormat): boolean;
  supportsGenerateMipmaps(format: TextureFormat, isSRGBColorSpace: boolean): boolean;
  createPlatformPrimitive(primitive: Primitive): IPlatformPrimitive;
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
    faceIndex?: TextureCubeFace
  ): void;
  clearRenderTarget(engine: Engine, flags: CameraClearFlags, color?: Color | null): void;
  invalidateRenderTarget?(target: RenderTarget | null, flags: CameraClearFlags, onlyIfFullScissor?: boolean): void;
  drawPrimitive(primitive: Primitive, subPrimitive: SubPrimitive | null, program: IPlatformShaderProgram): void;
  blitInternalRTByBlitFrameBuffer(
    source: RenderTarget | null,
    destination: RenderTarget,
    flags: CameraClearFlags,
    viewport: Vector4
  ): void;
  copyRenderTargetToSubTexture(source: RenderTarget | null, texture: Texture2D, viewport: Vector4): void;
  viewport(x: number, y: number, width: number, height: number): void;
  scissor(x: number, y: number, width: number, height: number): void;
  activeTexture(textureID: number): void;
  bindTexture(texture: IPlatformTexture): void;
  bindUniformBufferBase(bindingPoint: number, buffer: IPlatformBuffer): void;
  setGlobalDepthBias(bias: number, slopeBias: number): void;
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
