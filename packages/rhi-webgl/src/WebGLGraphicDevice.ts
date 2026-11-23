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
import { Color, Vector4 } from "@galacean/engine-math";
import { GLBuffer } from "./GLBuffer";
import { GLCapability } from "./GLCapability";
import { GLExtensions } from "./GLExtensions";
import { GLPrimitive } from "./GLPrimitive";
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

/**
 * WebGL graphic device, using WebGL2.0.
 */
export class WebGLGraphicDevice implements IHardwareRenderer {
  readonly supportsRendering = true;
  maxUniformBlockSize: number;

  /** @internal */
  _readFrameBuffer: WebGLFramebuffer | null = null;
  /** @internal */
  _mainFrameBuffer: WebGLFramebuffer | null = null;
  /** @internal */
  _mainFrameWidth: number = 0;
  /** @internal */
  _mainFrameHeight: number = 0;
  /** @internal */
  _enableGlobalDepthBias: boolean = false;
  /** @internal */
  _currentBindShaderProgram: IPlatformShaderProgram | null;
  /** @internal */
  _supportsInvalidateFramebuffer: boolean = true;
  /** @internal */
  _activeRenderTarget: RenderTarget | null = null;
  private _inRenderPass: boolean = false;
  private _activeColorStoreAction: RenderPassStoreAction = RenderPassStoreAction.Store;
  private _activeDepthStoreAction: RenderPassStoreAction = RenderPassStoreAction.Store;
  private _activeStencilStoreAction: RenderPassStoreAction = RenderPassStoreAction.Store;

  /** @internal */
  readonly _options: WebGLGraphicDeviceOptions;
  private _webGLOptions: WebGLContextAttributes;
  private _gl: WebGL2RenderingContext;
  private _renderStates: GLRenderStates;
  private _extensions: GLExtensions;
  private _capability: GLCapability;
  private _renderer: string;
  private _webCanvas: HTMLCanvasElement | OffscreenCanvas;

  private _activeTextureID: number;
  private _activeTextures: (GLTexture | null)[] = new Array(32);

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
    return new GLTransformFeedbackPrimitive(this._gl);
  }

  bindUniformBufferBase(bindingPoint: number, buffer: IPlatformBuffer): void {
    const gl = this._gl;
    gl.bindBufferBase(gl.UNIFORM_BUFFER, bindingPoint, (<GLBuffer>buffer)._glBuffer);
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

    // On WebGL2 (especially iOS WebKit / ANGLE-Metal), full-target gl.clear() maps directly to hardware
    // MTLLoadActionClear (zero DRAM tile load) while keeping RobustResourceInit satisfied, avoiding CPU
    // MTLTexture.replaceRegion stalls that gl.invalidateFramebuffer on load can trigger.
    const clearColor = descriptor.colorLoadAction === RenderPassLoadAction.Clear;
    const clearDepth = descriptor.depthLoadAction === RenderPassLoadAction.Clear;
    const clearStencil = descriptor.stencilLoadAction === RenderPassLoadAction.Clear;
    if (clearColor || clearDepth || clearStencil) {
      this._clearFrameBufferAttachments(
        renderTarget,
        clearColor,
        clearDepth,
        clearStencil,
        descriptor.clearColor,
        descriptor.clearDepth,
        descriptor.clearStencil
      );
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

    const discardDepth = depthStore === RenderPassStoreAction.Discard;
    const discardStencil = stencilStore === RenderPassStoreAction.Discard;

    if (
      target &&
      target.antiAliasing > 1 &&
      (colorStore === RenderPassStoreAction.Resolve || colorStore === RenderPassStoreAction.StoreAndResolve)
    ) {
      const glRT = target._platformRenderTarget as GLRenderTarget;
      glRT._resolveRenderTarget(colorStore === RenderPassStoreAction.Resolve, discardDepth, discardStencil);
      return;
    }

    // Issue gl.invalidateFramebuffer on pass end so TBDR GPUs skip flushing discarded attachments back to DRAM.
    const discardColor = colorStore === RenderPassStoreAction.Discard;
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

      bufferWidth = renderTarget.width >> mipLevel;
      bufferHeight = renderTarget.height >> mipLevel;
    } else {
      const gl = this._gl;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this._mainFrameBuffer);
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
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, destFrameBuffer);

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

    gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuffer);

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

  setGlobalDepthBias(bias: number, slopeBias: number): void {
    const gl = this._gl;
    const enable = bias !== 0 || slopeBias !== 0;
    if (enable) {
      gl.enable(gl.POLYGON_OFFSET_FILL);
      gl.polygonOffset(slopeBias, bias);
    } else {
      gl.disable(gl.POLYGON_OFFSET_FILL);
    }
    this._enableGlobalDepthBias = enable;
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
    this._enableGlobalDepthBias = false;
    this._currentBindShaderProgram = null;
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
    if (debugRenderInfo != null) {
      this._renderer = gl.getParameter(debugRenderInfo.UNMASKED_RENDERER_WEBGL);
    }
    this._supportsInvalidateFramebuffer =
      typeof gl.invalidateFramebuffer === "function" &&
      !(this._renderer && this._renderer.includes("Intel") && this._renderer.includes("Mesa"));
    this.maxUniformBlockSize = gl.getParameter(gl.MAX_UNIFORM_BLOCK_SIZE);
  }

  destroy(): void {
    this._clearActiveRenderTargetState();
    const webCanvas = this._webCanvas;
    webCanvas.removeEventListener("webglcontextlost", this._onWebGLContextLost, false);
    webCanvas.removeEventListener("webglcontextrestored", this._onWebGLContextRestored, false);
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
    event.preventDefault();
    this._onDeviceLost();
  }

  private _onWebGLContextRestored(event: WebGLContextEvent) {
    this._onDeviceRestored();
  }
}
