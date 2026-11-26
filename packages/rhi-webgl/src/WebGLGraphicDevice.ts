import {
  BufferBindFlag,
  BufferUsage,
  CameraClearFlags,
  Canvas,
  ColorWriteMask,
  Engine,
  GLCapabilityType,
  IHardwareRenderer,
  IPlatformBuffer,
  IPlatformPrimitive,
  IPlatformRenderTarget,
  IPlatformShaderProgram,
  type IPlatformShaderSource,
  type RenderState,
  type RenderStateElementMap,
  IPlatformTexture,
  IPlatformTexture2D,
  IPlatformTextureCube,
  IPlatformTransformFeedback,
  IPlatformTransformFeedbackPrimitive,
  Logger,
  Platform,
  Primitive,
  RenderPassDescriptor,
  RenderPassLoadAction,
  RenderPassStoreAction,
  RenderTarget,
  SubPrimitive,
  SystemInfo,
  Texture2D,
  Texture2DArray,
  TextureCube,
  TextureCubeFace,
  TextureFormat
} from "@galacean/engine-core";
import { Texture, TextureWrapMode, TextureFilterMode, TextureDepthCompareFunction } from "@galacean/engine-core";
import { Color, Vector4 } from "@galacean/engine-math";
import { GLBuffer } from "./GLBuffer";
import { GLPrimitiveFormats } from "./GLPrimitiveFormats";
import { GLCapability } from "./GLCapability";
import { GLExtensions } from "./GLExtensions";
import { GLPrimitive } from "./GLPrimitive";
import { GLShaderProgram } from "./GLShaderProgram";
import { applyGLRenderState } from "./GLApplyRenderState";
import { GLRenderStates } from "./GLRenderStates";
import { GLRenderTarget } from "./GLRenderTarget";
import { GLTexture } from "./GLTexture";
import { GLTexture2D } from "./GLTexture2D";
import { GLTexture2DArray } from "./GLTexture2DArray";
import { GLTextureCube } from "./GLTextureCube";
import { GLTransformFeedback } from "./GLTransformFeedback";
import { GLTransformFeedbackPrimitive } from "./GLTransformFeedbackPrimitive";
import { WebCanvas } from "./WebCanvas";

/**
 * WebGL graphic device options.
 */
export interface WebGLGraphicDeviceOptions {
  /**
   * @internal
   * iOS 15 webgl implement has bug, maybe should force call flush command buffer, for example iPhone13(iOS 15.4.1).
   */
  _forceFlush?: boolean;

  /**
   * @internal
   * Max allow skin uniform vectors count, default is 256
   *
   * @remarks large count maybe cause performance issue.
   */
  _maxAllowSkinUniformVectorCount?: number;

  alpha?: boolean;
  depth?: boolean;
  desynchronized?: boolean;
  failIfMajorPerformanceCaveat?: boolean;
  powerPreference?: WebGLPowerPreference;
  premultipliedAlpha?: boolean;
  preserveDrawingBuffer?: boolean;
  stencil?: boolean;
  xrCompatible?: boolean;
}

interface UniformBufferRanges {
  buffers: (WebGLBuffer | null)[];
  offsets: number[];
  sizes: number[];
}

/**
 * WebGL graphic device, using WebGL2.0.
 */
export class WebGLGraphicDevice implements IHardwareRenderer {
  readonly backend = "webgl2";
  beginFrame(): void {}
  endFrame(): void {}

  createPlatformShaderProgram(engine: Engine, source: IPlatformShaderSource): IPlatformShaderProgram {
    return new GLShaderProgram(this, engine, source);
  }

  applyRenderState(
    state: RenderState,
    previous: RenderState,
    invert: boolean,
    custom?: RenderStateElementMap | null
  ): void {
    applyGLRenderState(this, state, previous, invert, custom);
  }
  private static readonly _rangesByContext = new WeakMap<WebGL2RenderingContext, UniformBufferRanges>();
  private static readonly _samplerUnitsByContext = new WeakMap<WebGL2RenderingContext, (WebGLSampler | null)[]>();
  private _samplerUnits: (WebGLSampler | null)[];
  private readonly _depthSamplers = new Map<number, WebGLSampler>();

  readonly supportsCompute = false;
  readonly supportsTransformFeedback = true;
  readonly supportsRendering = true;
  maxUniformBlockSize: number;
  maxUniformBufferBindings: number;
  maxVertexUniformBlocks: number;
  maxFragmentUniformBlocks: number;
  private _shaderConstantValues: Record<string, number> = Object.create(null);
  /** GLSL ES 3.00 §7.3. Read only the device limits referenced by a specialized array declaration. */
  readonly resolveShaderConstant = (name: string): number | undefined => {
    const previous = this._shaderConstantValues[name];
    if (previous !== undefined) return previous;
    const gl = this._gl;
    let token: number;
    let divisor = 1;
    switch (name) {
      case "gl_MaxVertexAttribs":
        token = gl.MAX_VERTEX_ATTRIBS;
        break;
      case "gl_MaxVertexUniformVectors":
        token = gl.MAX_VERTEX_UNIFORM_VECTORS;
        break;
      case "gl_MaxVertexOutputVectors":
        token = gl.MAX_VERTEX_OUTPUT_COMPONENTS;
        divisor = 4;
        break;
      case "gl_MaxFragmentInputVectors":
        token = gl.MAX_FRAGMENT_INPUT_COMPONENTS;
        divisor = 4;
        break;
      case "gl_MaxVertexTextureImageUnits":
        token = gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS;
        break;
      case "gl_MaxCombinedTextureImageUnits":
        token = gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS;
        break;
      case "gl_MaxTextureImageUnits":
        token = gl.MAX_TEXTURE_IMAGE_UNITS;
        break;
      case "gl_MaxFragmentUniformVectors":
        token = gl.MAX_FRAGMENT_UNIFORM_VECTORS;
        break;
      case "gl_MaxDrawBuffers":
        token = gl.MAX_DRAW_BUFFERS;
        break;
      case "gl_MinProgramTexelOffset":
        token = gl.MIN_PROGRAM_TEXEL_OFFSET;
        break;
      case "gl_MaxProgramTexelOffset":
        token = gl.MAX_PROGRAM_TEXEL_OFFSET;
        break;
      default:
        return undefined;
    }
    return (this._shaderConstantValues[name] = Math.floor(gl.getParameter(token) / divisor));
  };
  uniformBufferOffsetAlignment: number;

  /** @internal */
  _readFrameBuffer: WebGLFramebuffer | null = null;
  /** @internal */
  _mainFrameBuffer: WebGLFramebuffer | null = null;
  /** @internal */
  _mainFrameWidth: number = 0;
  /** @internal */
  _mainFrameHeight: number = 0;
  /** @internal */
  /** @internal */
  _currentBindShaderProgram: IPlatformShaderProgram | null;
  /** @internal */
  _currentBindVAO: WebGLVertexArrayObject | null = null;
  /** @internal */
  _currentDrawFrameBuffer: WebGLFramebuffer | null = null;
  /** @internal */
  _supportsInvalidateFramebuffer: boolean = true;
  /** @internal */
  _preferClearForLoadDontCare: boolean = false;
  /** @internal */
  _activeRenderTarget: RenderTarget | null = null;
  private _inRenderPass: boolean = false;
  private _activeColorStoreAction: RenderPassStoreAction = RenderPassStoreAction.Store;
  private _activeDepthStoreAction: RenderPassStoreAction = RenderPassStoreAction.Store;
  private _activeStencilStoreAction: RenderPassStoreAction = RenderPassStoreAction.Store;

  /** @internal */
  readonly _options: WebGLGraphicDeviceOptions;
  private _webGLOptions: WebGLContextAttributes & { xrCompatible?: boolean };
  /** @internal */
  _primitiveFormats: GLPrimitiveFormats;
  private _gl: WebGL2RenderingContext;
  private _renderStates: GLRenderStates;
  private _extensions: GLExtensions;
  private _capability: GLCapability;
  private _renderer: string;
  private _webCanvas: HTMLCanvasElement | OffscreenCanvas;

  private _activeTextureID: number;
  private _activeTextures: (GLTexture | null)[] = new Array(32);
  private _uniformRanges: UniformBufferRanges;

  private _lastViewport: Vector4 = new Vector4(null!, null!, null!, null!);
  private _lastScissor: Vector4 = new Vector4(null!, null!, null!, null!);
  private _lastClearColor: Color = new Color(null!, null!, null!, null!);
  private _lastClearDepth: number = 1;
  private _lastClearStencil: number = 0;
  private _scissorEnable: boolean = false;
  private _activeTargetWidth: number = 0;
  private _activeTargetHeight: number = 0;
  private _fboColor0Attachment: GLenum[];
  private _fboDepthAttachment: GLenum[];
  private _fboStencilAttachment: GLenum[];
  private _invalidateAttachments: GLenum[] = [];

  private _onDeviceLost: () => void;
  private _onDeviceRestored: () => void;

  get renderer(): string {
    return this._renderer;
  }

  /**
   * GL Context
   * @member {WebGL2RenderingContext}
   */
  get gl() {
    return this._gl;
  }

  get renderStates(): GLRenderStates {
    return this._renderStates;
  }

  get capability(): GLCapability {
    return this._capability;
  }

  constructor(initializeOptions: WebGLGraphicDeviceOptions = {}) {
    const options = <WebGLGraphicDeviceOptions>{
      _forceFlush: false,
      _maxAllowSkinUniformVectorCount: 256,
      alpha: true,
      depth: true,
      stencil: true,
      failIfMajorPerformanceCaveat: false,
      powerPreference: "default",
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
      desynchronized: false,
      xrCompatible: false,
      ...initializeOptions
    };

    if (SystemInfo.platform === Platform.IPhone || SystemInfo.platform === Platform.IPad) {
      const version = SystemInfo.operatingSystem.match(/(\d+).?(\d+)?.?(\d+)?/);
      if (version) {
        const majorVersion = parseInt(version[1]);
        const minorVersion = parseInt(version[2]);
        if (majorVersion === 15 && minorVersion >= 0 && minorVersion <= 4) {
          options._forceFlush = true;
        }
      }
    }
    this._options = options;

    // Force disable stencil, antialias and depth, we configure them in internal render target
    this._webGLOptions = {
      antialias: false,
      depth: false,
      stencil: false,
      alpha: options.alpha,
      failIfMajorPerformanceCaveat: options.failIfMajorPerformanceCaveat,
      powerPreference: options.powerPreference,
      premultipliedAlpha: options.premultipliedAlpha,
      preserveDrawingBuffer: options.preserveDrawingBuffer,
      desynchronized: options.desynchronized,
      xrCompatible: options.xrCompatible
    };

    this._onWebGLContextLost = this._onWebGLContextLost.bind(this);
    this._onWebGLContextRestored = this._onWebGLContextRestored.bind(this);
  }

  init(canvas: Canvas, onDeviceLost: () => void, onDeviceRestored: () => void): void {
    const webCanvas = (canvas as WebCanvas)._webCanvas;

    webCanvas.addEventListener("webglcontextcreationerror", this._onContextCreationError, false);
    try {
      const webGLOptions = this._webGLOptions;
      let gl = webCanvas.getContext("webgl2", webGLOptions);
      if (!gl && !(canvas as WebCanvas)._isOffscreenCanvas()) {
        gl = <WebGL2RenderingContext>webCanvas.getContext("experimental-webgl2", webGLOptions);
      }
      if (!gl || !gl.deleteQuery) {
        throw new Error("WebGL2 is not supported.");
      }
      this._gl = gl;
      this._primitiveFormats = new GLPrimitiveFormats(gl);
      this._initGLState(gl);
    } finally {
      webCanvas.removeEventListener("webglcontextcreationerror", this._onContextCreationError, false);
    }

    this._webCanvas = webCanvas;
    this._onDeviceLost = onDeviceLost;
    this._onDeviceRestored = onDeviceRestored;
    webCanvas.addEventListener("webglcontextlost", this._onWebGLContextLost, false);
    webCanvas.addEventListener("webglcontextrestored", this._onWebGLContextRestored, false);
  }

  createPlatformPrimitive(primitive: Primitive): IPlatformPrimitive {
    return new GLPrimitive(this, primitive);
  }

  createPlatformTexture2D(texture2D: Texture2D): IPlatformTexture2D {
    return new GLTexture2D(this, texture2D);
  }

  createPlatformTexture2DArray(texture2D: Texture2DArray): GLTexture2DArray {
    return new GLTexture2DArray(this, texture2D);
  }

  createPlatformTextureCube(textureCube: TextureCube): IPlatformTextureCube {
    return new GLTextureCube(this, textureCube);
  }

  createPlatformRenderTarget(target: RenderTarget): IPlatformRenderTarget {
    return new GLRenderTarget(this, target);
  }

  createPlatformBuffer(
    type: BufferBindFlag,
    byteLength: number,
    bufferUsage: BufferUsage = BufferUsage.Static,
    data?: ArrayBuffer | ArrayBufferView
  ): IPlatformBuffer {
    return new GLBuffer(this, type, byteLength, bufferUsage, data);
  }

  createPlatformTransformFeedback(): IPlatformTransformFeedback {
    return new GLTransformFeedback(this);
  }

  createPlatformTransformFeedbackPrimitive(): IPlatformTransformFeedbackPrimitive {
    return new GLTransformFeedbackPrimitive(this);
  }

  /** @internal */
  _bindVertexArray(vao: WebGLVertexArrayObject | null): void {
    if (this._currentBindVAO !== vao) {
      this._gl.bindVertexArray(vao);
      this._currentBindVAO = vao;
    }
  }

  bindUniformBufferBase(bindingPoint: number, buffer: IPlatformBuffer): void {
    const gl = this._gl;
    gl.bindBufferBase(gl.UNIFORM_BUFFER, bindingPoint, (<GLBuffer>buffer)._glBuffer);
    const slot = bindingPoint >>> 0;
    if (slot < this._uniformRanges.buffers.length) this._uniformRanges.buffers[slot] = null;
  }

  bindUniformBufferRange(
    bindingPoint: number,
    buffer: IPlatformBuffer,
    byteOffset: number,
    byteSize: number,
    data?: ArrayBufferView,
    discard?: boolean
  ): void {
    const platform = <GLBuffer>buffer;
    const handle = platform._glBuffer;
    const { buffers, offsets, sizes } = this._uniformRanges;
    const slot = bindingPoint >>> 0;
    if (!data && handle && buffers[slot] === handle && offsets[slot] === byteOffset && sizes[slot] === byteSize) {
      return;
    }
    const gl = this._gl;
    const validRange =
      byteOffset >= 0 &&
      byteOffset % this.uniformBufferOffsetAlignment === 0 &&
      Number.isSafeInteger(byteSize) &&
      byteSize > 0;
    if (
      data &&
      (!validRange ||
        bindingPoint !== slot ||
        slot >= buffers.length ||
        data.byteLength !== byteSize ||
        !platform.canUploadUniformRange(gl, byteOffset + byteSize))
    ) {
      throw new RangeError("Invalid uniform buffer upload range.");
    }
    gl.bindBufferRange(gl.UNIFORM_BUFFER, bindingPoint, handle, byteOffset, byteSize);
    if (slot < buffers.length) {
      // Leave misaligned or empty ranges to native validation, including repeated calls.
      if (!validRange) {
        buffers[slot] = null;
        return;
      }
      buffers[slot] = handle;
      offsets[slot] = byteOffset;
      sizes[slot] = byteSize;
      // The indexed cache cannot tell which buffer another slot or raw GL bound to the generic target.
      // bindBufferRange above establishes both bindings before a write, including on an indexed cache hit.
      if (data) platform.uploadBoundUniformRange(byteOffset, data, discard);
    }
  }

  tryBindUniformBlock(program: WebGLProgram, blockName: string, bindingPoint: number): boolean {
    return this.bindUniformBlock(program, blockName, bindingPoint) !== this._gl.INVALID_INDEX;
  }

  bindUniformBlock(program: WebGLProgram, blockName: string, bindingPoint: number): number {
    const gl = this._gl;
    const blockIndex = gl.getUniformBlockIndex(program, blockName);
    if (blockIndex !== gl.INVALID_INDEX) {
      gl.uniformBlockBinding(program, blockIndex, bindingPoint);
    }
    return blockIndex;
  }

  /**
   * Enable GL_RASTERIZER_DISCARD.
   */
  enableRasterizerDiscard(): void {
    const gl = this._gl;
    gl.enable(gl.RASTERIZER_DISCARD);
  }

  /**
   * Disable GL_RASTERIZER_DISCARD.
   */
  disableRasterizerDiscard(): void {
    const gl = this._gl;
    gl.disable(gl.RASTERIZER_DISCARD);
  }

  /**
   * Invalidate the cached shader program state.
   * Call this after using a custom program (e.g., Transform Feedback) outside the engine's pipeline.
   */
  invalidateShaderProgramState(): void {
    this._uniformRanges.buffers.fill(null);
    if (this._currentBindShaderProgram) {
      this._gl.useProgram(null);
      this._currentBindShaderProgram = null;
    }
  }

  requireExtension(ext) {
    return this._extensions.requireExtension(ext);
  }

  canIUse(capabilityType: GLCapabilityType) {
    return this.capability.canIUse(capabilityType);
  }

  canIUseCompressedTextureInternalFormat(type: number) {
    return this.capability.canIUseCompressedTextureInternalFormat(type);
  }

  supportsTextureFormat(format: TextureFormat): boolean {
    return this.capability.supportsTextureFormat(format);
  }

  supportsRenderTargetColorFormat(format: TextureFormat): boolean {
    return this.capability.supportsRenderTargetColorFormat(format);
  }

  supportsGenerateMipmaps(format: TextureFormat, isSRGBColorSpace: boolean): boolean {
    return this.capability.supportsGenerateMipmaps(format, isSRGBColorSpace);
  }

  viewport(x: number, y: number, width: number, height: number): void {
    const { _gl: gl, _lastViewport: lastViewport } = this;
    if (x !== lastViewport.x || y !== lastViewport.y || width !== lastViewport.z || height !== lastViewport.w) {
      gl.viewport(x, y, width, height);
      lastViewport.set(x, y, width, height);
    }
  }

  scissor(x: number, y: number, width: number, height: number): void {
    const { _gl: gl, _lastScissor: lastScissor } = this;
    const targetWidth = this._activeTargetWidth || this.getMainFrameBufferWidth();
    const targetHeight = this._activeTargetHeight || this.getMainFrameBufferHeight();
    if (x === 0 && y === 0 && width === targetWidth && height === targetHeight) {
      if (this._scissorEnable) {
        gl.disable(gl.SCISSOR_TEST);
        this._scissorEnable = false;
      }
      lastScissor.set(x, y, width, height);
    } else if (
      !this._scissorEnable ||
      x !== lastScissor.x ||
      y !== lastScissor.y ||
      width !== lastScissor.z ||
      height !== lastScissor.w
    ) {
      if (!this._scissorEnable) {
        gl.enable(gl.SCISSOR_TEST);
        this._scissorEnable = true;
      }
      gl.scissor(x, y, width, height);
      lastScissor.set(x, y, width, height);
    }
  }

  colorMask(r: boolean, g: boolean, b: boolean, a: boolean): void {
    this._gl.colorMask(r, g, b, a);
  }

  clearRenderTarget(engine: Engine, clearFlags: CameraClearFlags, clearColor?: Color) {
    const gl = this._gl;

    const {
      blendState: { targetBlendState },
      depthState,
      stencilState
    } = engine._lastRenderState;
    let clearFlag = 0;
    if (clearFlags & CameraClearFlags.Color && clearColor) {
      clearFlag |= gl.COLOR_BUFFER_BIT;

      const lc = this._lastClearColor;
      const { r, g, b, a } = clearColor;
      if (clearColor && (r !== lc.r || g !== lc.g || b !== lc.b || a !== lc.a)) {
        gl.clearColor(r, g, b, a);
        lc.set(r, g, b, a);
      }

      if (targetBlendState.colorWriteMask !== ColorWriteMask.All) {
        gl.colorMask(true, true, true, true);
        targetBlendState.colorWriteMask = ColorWriteMask.All;
      }
    }
    if (clearFlags & CameraClearFlags.Depth) {
      clearFlag |= gl.DEPTH_BUFFER_BIT;
      if (depthState.writeEnabled !== true) {
        gl.depthMask(true);
        depthState.writeEnabled = true;
      }
    }
    if (clearFlags & CameraClearFlags.Stencil) {
      clearFlag |= gl.STENCIL_BUFFER_BIT;
      if (stencilState.writeMask !== 0xff) {
        gl.stencilMask(0xff);
        stencilState.writeMask = 0xff;
      }
    }
    gl.clear(clearFlag);
  }

  /** @internal */
  _bindFramebuffer(target: GLenum, framebuffer: WebGLFramebuffer | null): void {
    const gl = this._gl;
    gl.bindFramebuffer(target, framebuffer);
    if (target === gl.FRAMEBUFFER || target === gl.DRAW_FRAMEBUFFER) {
      this._currentDrawFrameBuffer = framebuffer;
    }
  }

  drawPrimitive(primitive: Primitive, subPrimitive: SubPrimitive | null, shaderProgram: IPlatformShaderProgram): void {
    // todo: VAO not support morph animation
    if (primitive && subPrimitive) {
      primitive.draw(shaderProgram, subPrimitive);
    } else {
      Logger.error("draw primitive failed.");
    }
  }

  getMainFrameBufferWidth(): number {
    return this._mainFrameWidth || this._gl.drawingBufferWidth;
  }

  getMainFrameBufferHeight(): number {
    return this._mainFrameHeight || this._gl.drawingBufferHeight;
  }

  activeRenderTarget(
    renderTarget: RenderTarget | null,
    viewport: Vector4,
    isFlipProjection: boolean,
    mipLevel: number = 0,
    faceIndex?: TextureCubeFace
  ) {
    if (this._inRenderPass) {
      this.endRenderPass();
    }
    this._bindRenderTarget(renderTarget, viewport, isFlipProjection, mipLevel, faceIndex);
  }

  beginRenderPass(descriptor: RenderPassDescriptor): void {
    if (this._inRenderPass) {
      this.endRenderPass();
    }

    const { renderTarget, viewport, isFlipProjection, mipLevel, faceIndex } = descriptor;
    this._bindRenderTarget(renderTarget, viewport, isFlipProjection, mipLevel, faceIndex);

    this._inRenderPass = true;
    this._activeColorStoreAction = descriptor.colorStoreAction;
    this._activeDepthStoreAction = descriptor.depthStoreAction;
    this._activeStencilStoreAction = descriptor.stencilStoreAction;

    // On Apple/Metal WebGL2 backends (iOS / macOS Safari & ANGLE-Metal), full-target gl.clear() maps directly
    // to hardware MTLLoadActionClear while keeping RobustResourceInit satisfied, avoiding CPU MTLTexture.replaceRegion
    // stalls that gl.invalidateFramebuffer on load can trigger.
    // On non-Apple GLES backends (e.g. Qualcomm Adreno, Huawei Maleoon, ARM Mali), gl.invalidateFramebuffer avoids
    // driver clear slow paths (such as Adreno 650 R11F_G11F_B10F lacking hardware fast-clear) while still skipping DRAM tile loads.
    const preferClear = this._preferClearForLoadDontCare;
    const clearColor =
      descriptor.colorLoadAction === RenderPassLoadAction.Clear ||
      (preferClear && descriptor.colorLoadAction === RenderPassLoadAction.DontCare);
    const clearDepth =
      descriptor.depthLoadAction === RenderPassLoadAction.Clear ||
      (preferClear && descriptor.depthLoadAction === RenderPassLoadAction.DontCare);
    const clearStencil =
      descriptor.stencilLoadAction === RenderPassLoadAction.Clear ||
      (preferClear && descriptor.stencilLoadAction === RenderPassLoadAction.DontCare);
    if (clearColor || clearDepth || clearStencil) {
      this._clearFrameBufferAttachments(
        renderTarget,
        clearColor,
        clearDepth,
        clearStencil,
        descriptor.colorLoadAction === RenderPassLoadAction.Clear ? descriptor.clearColor : null,
        descriptor.depthLoadAction === RenderPassLoadAction.Clear ? descriptor.clearDepth : 1,
        descriptor.stencilLoadAction === RenderPassLoadAction.Clear ? descriptor.clearStencil : 0
      );
    }

    if (!preferClear) {
      const invalidateColor = descriptor.colorLoadAction === RenderPassLoadAction.DontCare;
      const invalidateDepth = descriptor.depthLoadAction === RenderPassLoadAction.DontCare;
      const invalidateStencil = descriptor.stencilLoadAction === RenderPassLoadAction.DontCare;
      if (invalidateColor || invalidateDepth || invalidateStencil) {
        this._invalidateFrameBufferAttachments(
          this._gl.FRAMEBUFFER,
          renderTarget,
          invalidateColor,
          invalidateDepth,
          invalidateStencil
        );
      }
    }
  }

  endRenderPass(): void {
    if (!this._inRenderPass) {
      return;
    }

    const target = this._activeRenderTarget;
    const colorStore = this._activeColorStoreAction;
    const depthStore = this._activeDepthStoreAction;
    const stencilStore = this._activeStencilStoreAction;

    this._inRenderPass = false;
    this._activeColorStoreAction = RenderPassStoreAction.Store;
    this._activeDepthStoreAction = RenderPassStoreAction.Store;
    this._activeStencilStoreAction = RenderPassStoreAction.Store;

    const discardColor = colorStore === RenderPassStoreAction.Discard;
    const discardDepth = depthStore === RenderPassStoreAction.Discard;
    const discardStencil = stencilStore === RenderPassStoreAction.Discard;

    if (target && target.antiAliasing > 1) {
      const resolveColor =
        target.colorTextureCount > 0 &&
        (colorStore === RenderPassStoreAction.Resolve || colorStore === RenderPassStoreAction.StoreAndResolve);
      const resolveDepth =
        !!target.depthTexture &&
        (depthStore === RenderPassStoreAction.Resolve ||
          depthStore === RenderPassStoreAction.StoreAndResolve ||
          resolveColor);
      if (resolveColor || resolveDepth) {
        const glRT = target._platformRenderTarget as GLRenderTarget;
        const discardMSAAColor = discardColor || colorStore === RenderPassStoreAction.Resolve;
        const discardMSAADepth = discardDepth || depthStore === RenderPassStoreAction.Resolve;
        glRT._resolveRenderTarget(resolveColor, discardMSAAColor, resolveDepth, discardMSAADepth, discardStencil);
        return;
      }
    }

    // Issue gl.invalidateFramebuffer on pass end so TBDR GPUs skip flushing discarded attachments back to DRAM.
    if (discardColor || discardDepth || discardStencil) {
      this._invalidateFrameBufferAttachments(this._gl.FRAMEBUFFER, target, discardColor, discardDepth, discardStencil);
    }
  }

  private _bindRenderTarget(
    renderTarget: RenderTarget | null,
    viewport: Vector4,
    isFlipProjection: boolean,
    mipLevel: number,
    faceIndex?: TextureCubeFace
  ): void {
    let bufferWidth: number, bufferHeight: number;
    if (renderTarget) {
      renderTarget._isContentLost = false;

      const platformRenderTarget = renderTarget._platformRenderTarget as GLRenderTarget;
      platformRenderTarget.activeRenderTarget(mipLevel, faceIndex);

      bufferWidth = Math.max(1, renderTarget.width >> mipLevel);
      bufferHeight = Math.max(1, renderTarget.height >> mipLevel);
    } else {
      const gl = this._gl;
      this._bindFramebuffer(gl.FRAMEBUFFER, this._mainFrameBuffer);
      bufferWidth = this.getMainFrameBufferWidth();
      bufferHeight = this.getMainFrameBufferHeight();
    }

    this._activeRenderTarget = renderTarget;
    this._activeTargetWidth = bufferWidth;
    this._activeTargetHeight = bufferHeight;

    const width = bufferWidth * viewport.z;
    const height = bufferHeight * viewport.w;
    const x = viewport.x * bufferWidth;
    const y = isFlipProjection ? viewport.y * bufferHeight : bufferHeight - viewport.y * bufferHeight - height;
    this.viewport(x, y, width, height);
    this.scissor(x, y, width, height);
  }

  blitInternalRTByBlitFrameBuffer(
    srcRT: RenderTarget | null,
    destRT: RenderTarget,
    clearFlags: CameraClearFlags,
    viewport: Vector4
  ) {
    const gl = this._gl;
    // @ts-ignore
    const srcFrameBuffer = srcRT ? srcRT._platformRenderTarget._frameBuffer : null;
    // @ts-ignore
    const destFrameBuffer = destRT ? destRT._platformRenderTarget._frameBuffer : null;
    const bufferWidth = this.getMainFrameBufferWidth();
    const bufferHeight = this.getMainFrameBufferHeight();
    const srcWidth = srcRT ? srcRT.width : bufferWidth;
    const srcHeight = srcRT ? srcRT.height : bufferHeight;
    const blitWidth = destRT.width;
    const blitHeight = destRT.height;
    const needFlipY = !srcRT;
    const needBlitColor = (clearFlags & CameraClearFlags.Color) === 0;
    const needBlitDepth = (clearFlags & CameraClearFlags.Depth) === 0;
    const needBlitStencil = (clearFlags & CameraClearFlags.Stencil) === 0;

    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, srcFrameBuffer);
    this._bindFramebuffer(gl.DRAW_FRAMEBUFFER, destFrameBuffer);

    let blitMask = needBlitColor ? gl.COLOR_BUFFER_BIT : 0;

    if (needBlitDepth || needBlitStencil) {
      const depthFormat = destRT._depthFormat!;

      if (needBlitDepth) {
        if (
          depthFormat === TextureFormat.Depth ||
          (depthFormat >= TextureFormat.DepthStencil && depthFormat <= TextureFormat.Depth32Stencil8)
        ) {
          blitMask |= gl.DEPTH_BUFFER_BIT;
        } else {
          Logger.warn(`Do not clear depth, or set depth format of target which is ${TextureFormat[depthFormat]} now.`);
        }
      }

      if (needBlitStencil) {
        if (
          depthFormat === TextureFormat.Stencil ||
          depthFormat === TextureFormat.DepthStencil ||
          depthFormat >= TextureFormat.Depth24Stencil8 ||
          depthFormat >= TextureFormat.Depth32Stencil8
        ) {
          blitMask |= gl.STENCIL_BUFFER_BIT;
        } else {
          Logger.warn(
            `Do not clear stencil, or set stencil format of target which is ${TextureFormat[depthFormat]} now.`
          );
        }
      }
    }

    const xStart = viewport.x * srcWidth;
    const xEnd = xStart + blitWidth;
    const yStart = needFlipY ? srcHeight - viewport.y * srcHeight : srcHeight - viewport.y * srcHeight - blitHeight;
    const yEnd = needFlipY ? yStart - blitHeight : yStart + blitHeight;

    // gl.blitFramebuffer is clipped by GL_SCISSOR_TEST; ensure stale scissor state from a previous pass does not crop the copy.
    this._disableScissorTest();
    gl.blitFramebuffer(xStart, yStart, xEnd, yEnd, 0, 0, blitWidth, blitHeight, blitMask, gl.NEAREST);
  }

  copyRenderTargetToSubTexture(srcRT: RenderTarget | null, grabTexture: Texture2D, viewport: Vector4) {
    const gl = this._gl;
    const bufferWidth = this.getMainFrameBufferWidth();
    const bufferHeight = this.getMainFrameBufferHeight();
    const srcWidth = srcRT ? srcRT.width : bufferWidth;
    const srcHeight = srcRT ? srcRT.height : bufferHeight;
    const copyWidth = grabTexture.width;
    const copyHeight = grabTexture.height;
    const flipY = !srcRT;

    const xStart = viewport.x * srcWidth;
    const yStart = flipY ? srcHeight - viewport.y * srcHeight - copyHeight : viewport.y * srcHeight;

    // @ts-ignore
    const frameBuffer = srcRT?._platformRenderTarget._frameBuffer ?? this._mainFrameBuffer;

    this._bindFramebuffer(gl.FRAMEBUFFER, frameBuffer);

    const glTexture = grabTexture._platformTexture as GLTexture;

    this.bindTexture(glTexture);

    gl.copyTexSubImage2D(glTexture._target, 0, 0, 0, xStart, yStart, copyWidth, copyHeight);
  }

  activeTexture(textureID: number): void {
    if (this._activeTextureID !== textureID) {
      this._gl.activeTexture(textureID);
      this._activeTextureID = textureID;
    }
  }

  bindTexture(platformTexture: IPlatformTexture): void {
    const texture = platformTexture as GLTexture;
    const index = this._activeTextureID - this._gl.TEXTURE0;
    if (this._activeTextures[index] !== texture) {
      this._gl.bindTexture(texture._target, texture._glTexture);
      this._activeTextures[index] = texture;
    }
  }

  /** Sample a depth texture normally and through a shadow sampler in the same draw. */
  bindSampledTexture(texture: Texture, slot: GLenum, compare: boolean): void {
    this.activeTexture(slot);
    this.bindTexture(texture._platformTexture);
    const gl = this._gl;
    const unit = slot - gl.TEXTURE0;
    let sampler: WebGLSampler | null = null;
    if (texture._isDepthTexture) {
      const filter = compare ? texture.filterMode : TextureFilterMode.Point;
      const func = compare ? (texture.depthCompareFunction ?? TextureDepthCompareFunction.LessEqual) : 0;
      const mipmaps = texture._mipmap;
      const u = texture.wrapModeU,
        v = texture.wrapModeV;
      const key = u | (v << 2) | (filter << 4) | (+mipmaps << 6) | (+compare << 7) | (func << 8);
      sampler = this._depthSamplers.get(key) ?? null;
      if (!sampler) {
        sampler = gl.createSampler();
        if (!sampler) return;
        const wrap = (value: TextureWrapMode) =>
          value === TextureWrapMode.Clamp
            ? gl.CLAMP_TO_EDGE
            : value === TextureWrapMode.Repeat
              ? gl.REPEAT
              : gl.MIRRORED_REPEAT;
        const mag = filter === TextureFilterMode.Point ? gl.NEAREST : gl.LINEAR;
        const min = !mipmaps
          ? mag
          : filter === TextureFilterMode.Point
            ? gl.NEAREST_MIPMAP_NEAREST
            : filter === TextureFilterMode.Bilinear
              ? gl.LINEAR_MIPMAP_NEAREST
              : gl.LINEAR_MIPMAP_LINEAR;
        gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_S, wrap(u));
        gl.samplerParameteri(sampler, gl.TEXTURE_WRAP_T, wrap(v));
        gl.samplerParameteri(sampler, gl.TEXTURE_MAG_FILTER, mag);
        gl.samplerParameteri(sampler, gl.TEXTURE_MIN_FILTER, min);
        if (compare) {
          gl.samplerParameteri(sampler, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
          gl.samplerParameteri(sampler, gl.TEXTURE_COMPARE_FUNC, gl.NEVER + func);
        }
        this._depthSamplers.set(key, sampler);
      }
    }
    if (this._samplerUnits[unit] !== sampler) {
      gl.bindSampler(unit, sampler);
      this._samplerUnits[unit] = sampler;
    }
  }

  flush(): void {
    if (this._inRenderPass) {
      this.endRenderPass();
    }
    this._gl.flush();
  }

  forceLoseDevice(): void {
    const extension = this.requireExtension(GLCapabilityType.WEBGL_lose_context);
    extension.loseContext();
  }

  forceRestoreDevice(): void {
    const extension = this.requireExtension(GLCapabilityType.WEBGL_lose_context);
    extension.restoreContext();
  }

  /**
   * @remarks
   * WebGL context loss and restore can happen at any GPU execution point. refs to: https://www.khronos.org/webgl/wiki/HandlingContextLost
   */
  isContextLost() {
    return this.gl.isContextLost();
  }

  resetState(): void {
    this._readFrameBuffer = null;
    this._currentBindShaderProgram = null;
    this._currentBindVAO = null;
    this._currentDrawFrameBuffer = null;
    this._clearActiveRenderTargetState();

    const activeTextures = this._activeTextures;
    for (let i = 0, n = activeTextures.length; i < n; i++) {
      activeTextures[i] = null;
    }

    this._lastViewport.set(null!, null!, null!, null!);
    this._lastScissor.set(null!, null!, null!, null!);
    this._lastClearColor.set(null!, null!, null!, null!);
    this._lastClearDepth = 1;
    this._lastClearStencil = 0;
    this._scissorEnable = false;

    this._initGLState(this._gl);
  }

  protected _initGLState(gl: WebGL2RenderingContext): void {
    let samplerUnits = WebGLGraphicDevice._samplerUnitsByContext.get(gl);
    if (!samplerUnits) WebGLGraphicDevice._samplerUnitsByContext.set(gl, (samplerUnits = []));
    samplerUnits.length = 0;
    this._samplerUnits = samplerUnits;
    this._shaderConstantValues = Object.create(null);
    this._activeTextureID = gl.TEXTURE0;
    this._fboColor0Attachment = [gl.COLOR_ATTACHMENT0];
    this._fboDepthAttachment = [gl.DEPTH_ATTACHMENT];
    this._fboStencilAttachment = [gl.STENCIL_ATTACHMENT];
    this._renderStates = new GLRenderStates(gl);
    this._extensions = new GLExtensions(this);
    this._capability = new GLCapability(this);
    // Make sure the active texture in gl context is on default, because gl context may be used in other webgl renderer.
    gl.activeTexture(gl.TEXTURE0);

    const debugRenderInfo = gl.getExtension("WEBGL_debug_renderer_info");
    let vendor = "";
    if (debugRenderInfo != null) {
      this._renderer = gl.getParameter(debugRenderInfo.UNMASKED_RENDERER_WEBGL);
      vendor = gl.getParameter(debugRenderInfo.UNMASKED_VENDOR_WEBGL) || "";
    }
    const rendererStr = this._renderer || gl.getParameter(gl.RENDERER) || "";
    const vendorStr = vendor || gl.getParameter(gl.VENDOR) || "";
    this._supportsInvalidateFramebuffer =
      typeof gl.invalidateFramebuffer === "function" &&
      !(rendererStr.includes("Intel") && rendererStr.includes("Mesa"));
    this._preferClearForLoadDontCare =
      !this._supportsInvalidateFramebuffer ||
      rendererStr.includes("Apple") ||
      rendererStr.includes("Metal") ||
      vendorStr.includes("Apple");
    this.maxUniformBlockSize = gl.getParameter(gl.MAX_UNIFORM_BLOCK_SIZE);
    this.maxVertexUniformBlocks = gl.getParameter(gl.MAX_VERTEX_UNIFORM_BLOCKS);
    this.maxFragmentUniformBlocks = gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_BLOCKS);
    this.uniformBufferOffsetAlignment = gl.getParameter(gl.UNIFORM_BUFFER_OFFSET_ALIGNMENT);
    const bindings = (this.maxUniformBufferBindings = gl.getParameter(gl.MAX_UNIFORM_BUFFER_BINDINGS));
    // Indexed bindings belong to the native context. A second device can wrap the same canvas.
    let ranges = WebGLGraphicDevice._rangesByContext.get(gl);
    if (!ranges) {
      ranges = { buffers: [], offsets: [], sizes: [] };
      WebGLGraphicDevice._rangesByContext.set(gl, ranges);
    }
    ranges.buffers.length = ranges.offsets.length = ranges.sizes.length = bindings;
    ranges.buffers.fill(null);
    this._uniformRanges = ranges;
  }

  /** @internal Use the compositor target for the duration of an XR frame. */
  setExternalFramebuffer(framebuffer: WebGLFramebuffer | null, width: number, height: number): void {
    this._mainFrameBuffer = framebuffer;
    this._mainFrameWidth = width;
    this._mainFrameHeight = height;
  }

  destroy(): void {
    for (const sampler of this._depthSamplers.values()) this._gl.deleteSampler(sampler);
    this._depthSamplers.clear();
    this._uniformRanges.buffers.fill(null);
    this._clearActiveRenderTargetState();
    const webCanvas = this._webCanvas;
    webCanvas.removeEventListener("webglcontextlost", this._onWebGLContextLost, false);
    webCanvas.removeEventListener("webglcontextrestored", this._onWebGLContextRestored, false);
  }

  /** @internal */
  _disableScissorTest(): void {
    if (this._scissorEnable) {
      this._gl.disable(this._gl.SCISSOR_TEST);
      this._scissorEnable = false;
    }
  }

  /** @internal */
  _clearActiveRenderTargetState(): void {
    this._activeRenderTarget = null;
    this._inRenderPass = false;
    this._activeTargetWidth = 0;
    this._activeTargetHeight = 0;
    this._activeColorStoreAction = RenderPassStoreAction.Store;
    this._activeDepthStoreAction = RenderPassStoreAction.Store;
    this._activeStencilStoreAction = RenderPassStoreAction.Store;
  }

  /** @internal */
  _clearFrameBufferAttachments(
    renderTarget: RenderTarget | null,
    clearColor: boolean,
    clearDepth: boolean,
    clearStencil: boolean,
    colorValue?: Color | null,
    depthValue: number = 1,
    stencilValue: number = 0
  ): void {
    const gl = this._gl;
    if (renderTarget) {
      const glRT = renderTarget._platformRenderTarget as GLRenderTarget;
      clearColor = clearColor && glRT._oriDrawBuffers.length > 0;
      clearDepth = clearDepth && glRT._hasDepth;
      clearStencil = clearStencil && glRT._hasStencil;
    }

    let clearMask = 0;
    if (clearColor) {
      clearMask |= gl.COLOR_BUFFER_BIT;
      const r = colorValue ? colorValue.r : 0;
      const g = colorValue ? colorValue.g : 0;
      const b = colorValue ? colorValue.b : 0;
      const a = colorValue ? colorValue.a : 0;
      const lc = this._lastClearColor;
      if (r !== lc.r || g !== lc.g || b !== lc.b || a !== lc.a) {
        gl.clearColor(r, g, b, a);
        lc.set(r, g, b, a);
      }
    }
    if (clearDepth) {
      clearMask |= gl.DEPTH_BUFFER_BIT;
      if (depthValue !== this._lastClearDepth) {
        gl.clearDepth(depthValue);
        this._lastClearDepth = depthValue;
      }
    }
    if (clearStencil) {
      clearMask |= gl.STENCIL_BUFFER_BIT;
      if (stencilValue !== this._lastClearStencil) {
        gl.clearStencil(stencilValue);
        this._lastClearStencil = stencilValue;
      }
    }
    if (clearMask !== 0) {
      gl.clear(clearMask);
    }
  }

  /** @internal */
  _invalidateFrameBufferAttachments(
    glTarget: GLenum,
    renderTarget: RenderTarget | null,
    invalidateColor: boolean,
    invalidateDepth: boolean,
    invalidateStencil: boolean
  ): void {
    // Skip default WebGL backbuffer (browser compositor manages discard; avoids ANGLE/driver quirks) and buggy Mesa Intel drivers
    if (!this._supportsInvalidateFramebuffer || (!renderTarget && !this._mainFrameBuffer)) {
      return;
    }

    const gl = this._gl;
    let colorAttachments: GLenum[];
    if (renderTarget) {
      const glRT = renderTarget._platformRenderTarget as GLRenderTarget;
      colorAttachments = glRT._oriDrawBuffers;
      invalidateDepth = invalidateDepth && glRT._hasDepth;
      invalidateStencil = invalidateStencil && glRT._hasStencil;
    } else {
      colorAttachments = this._fboColor0Attachment;
    }

    invalidateColor = invalidateColor && colorAttachments.length > 0;

    if (invalidateColor) {
      if (!invalidateDepth) {
        gl.invalidateFramebuffer(glTarget, colorAttachments);
      } else {
        const attachments = this._invalidateAttachments;
        attachments.length = 0;
        for (let i = 0, n = colorAttachments.length; i < n; i++) {
          attachments.push(colorAttachments[i]);
        }
        attachments.push(gl.DEPTH_ATTACHMENT);
        gl.invalidateFramebuffer(glTarget, attachments);
      }
    } else if (invalidateDepth) {
      gl.invalidateFramebuffer(glTarget, this._fboDepthAttachment);
    }

    // Issue stencil invalidation separately to avoid Adreno driver bug where combined depth+stencil invalidation leaks across targets
    if (invalidateStencil) {
      gl.invalidateFramebuffer(glTarget, this._fboStencilAttachment);
    }
  }

  private _onContextCreationError(event: WebGLContextEvent) {
    console.error("WebGLRenderer: WebGL context could not be created. Reason: ", event.statusMessage);
  }

  private _onWebGLContextLost(event: WebGLContextEvent) {
    this._depthSamplers.clear();
    this._uniformRanges.buffers.fill(null);
    event.preventDefault();
    this._onDeviceLost();
  }

  private _onWebGLContextRestored(event: WebGLContextEvent) {
    this._onDeviceRestored();
  }
}
