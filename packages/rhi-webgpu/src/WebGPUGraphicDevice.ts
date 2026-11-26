import {
  BufferBindFlag,
  BufferUsage,
  CameraClearFlags,
  Canvas,
  Engine,
  GLCapabilityType,
  IHardwareRenderer,
  IPlatformBuffer,
  IPlatformRenderTarget,
  IPlatformShaderProgram,
  IPlatformShaderSource,
  IPlatformPrimitive,
  IPlatformTexture2D,
  IPlatformTexture2DArray,
  IPlatformTextureCube,
  Primitive,
  RenderState,
  RenderStateElementKey,
  RenderTarget,
  SetDataOptions,
  SubPrimitive,
  Texture2D,
  Texture2DArray,
  TextureCube,
  TextureFormat,
  WebCanvas
} from "@galacean/engine-core";
import { RenderPassDescriptor, RenderPassLoadAction, RenderPassStoreAction } from "@galacean/engine-core";
import type { Buffer, RenderStateElementMap, Texture } from "@galacean/engine-core";
import { WebGPUTexture } from "./WebGPUTexture";
import { WebGPUDrawBundles, type RenderDrawCommands } from "./WebGPUDrawBundles";
import { WebGPUDeferredPass, type WebGPURenderCommands } from "./WebGPUDeferredPass";
import { WebGPUAttachmentOps } from "./WebGPUAttachmentOps";
import { WebGPUFeedbackKernel } from "./WebGPUFeedbackKernel";
import type { IWebGPUShaderTexture } from "@galacean/engine-design";
import { Color, Vector4 } from "@galacean/engine-math";
import { WebGPUBuffer } from "./WebGPUBuffer";
import { WebGPUCapability } from "./WebGPUCapability";
import { WebGPUMipmapGenerator } from "./WebGPUMipmapGenerator";
import { WebGPUPrimitive } from "./WebGPUPrimitive";
import { WebGPURenderTarget } from "./WebGPURenderTarget";
import { WebGPUShaderProgram } from "./WebGPUShaderProgram";
import { WebGPUTexture2D } from "./WebGPUTexture2D";
import { WebGPUTexture2DArray } from "./WebGPUTexture2DArray";
import { WebGPUTextureCube } from "./WebGPUTextureCube";
import { WebGPUTimingProfiler } from "./WebGPUTimingProfiler";

/**
 * Options used to request and configure a WebGPU device.
 */
export interface WebGPUGraphicDeviceOptions {
  /** Adapter power preference. */
  powerPreference?: GPUPowerPreference;
  /** Force a software or fallback adapter when the browser supports it. */
  forceFallbackAdapter?: boolean;
  /** Request an adapter compatible with WebXR projection layers. Defaults to the browser's XR GPU support. */
  xrCompatible?: boolean;
  /** Required optional WebGPU features. */
  requiredFeatures?: GPUFeatureName[];
  /** Required WebGPU limits. */
  requiredLimits?: Record<string, GPUSize64>;
  /** Request optional non-blocking GPU timestamp collection. */
  enableGPUTiming?: boolean;
  /** Canvas alpha compositing mode. */
  alphaMode?: GPUCanvasAlphaMode;
  /** Canvas color space. */
  colorSpace?: PredefinedColorSpace;
  /** Whether camera render targets allocate depth attachments. */
  depth?: boolean;
  /** Whether camera render targets allocate stencil attachments. */
  stencil?: boolean;
}

export interface WebGPUProjectionTarget {
  color: GPUTexture;
  depthStencil?: GPUTexture;
  viewDescriptor: GPUTextureViewDescriptor;
}

type Toggle = RenderStateElementKey.DepthStateEnabled | RenderStateElementKey.StencilStateEnabled;
type RenderOverrides = Partial<Record<Toggle, boolean> & Record<Exclude<RenderStateElementKey, Toggle>, number>>;
interface AppliedRenderState {
  state: RenderState;
  frontFaceInvert: boolean;
  customStates?: RenderOverrides | null;
}

/** Adapter or device acquisition failed before the canvas was bound to a rendering backend. */
export class WebGPUDeviceUnavailableError extends Error {
  constructor(
    message: string,
    override readonly cause?: unknown
  ) {
    super(message);
    this.name = "WebGPUDeviceUnavailableError";
  }
}

/**
 * WebGPU graphic device.
 */
export class WebGPUGraphicDevice implements IHardwareRenderer {
  /** Graphics backend implemented by this device. */
  readonly backend = "webgpu" as const;
  /** Origin used when sampling WebGPU render-target textures. */
  readonly renderTargetOrigin = "upper-left" as const;
  readonly supportsRendering = true;
  get maxSampledTexturesPerShaderStage(): number {
    return this.device.limits.maxSampledTexturesPerShaderStage;
  }
  get maxSamplersPerShaderStage(): number {
    return this.device.limits.maxSamplersPerShaderStage;
  }
  getTextureArrayKey(texture: Texture): string | undefined {
    return texture.engine._hardwareRenderer === this
      ? (texture._platformTexture as WebGPUTexture)?.arrayKey
      : undefined;
  }
  getTextureSamplerKey(texture: Texture | undefined, kind: GPUSamplerBindingType): GPUSampler {
    return (texture?._platformTexture as WebGPUTexture | undefined)?.getSampler(kind) ?? this._fallbackSampler(kind);
  }
  readonly supportsCompute = true;
  readonly supportsTransformFeedback = false;
  createFeedbackCompute(): WebGPUFeedbackKernel {
    return new WebGPUFeedbackKernel(this);
  }
  private readonly _defaults = new Map<string, GPUTextureView>();
  private readonly _samplers = new Map<string, GPUSampler>();
  _fallbackView(layout: IWebGPUShaderTexture): GPUTextureView {
    const key = layout.sampleType + layout.viewDimension;
    let view = this._defaults.get(key);
    if (!view) {
      const format =
        layout.sampleType === "uint"
          ? "rgba8uint"
          : layout.sampleType === "sint"
            ? "rgba8sint"
            : layout.sampleType === "depth"
              ? "depth16unorm"
              : "rgba8unorm";
      const layers = layout.viewDimension === "cube" ? 6 : 1;
      const depth = layout.sampleType === "depth";
      const texture = this.device.createTexture({
        size: [1, 1, layers],
        format,
        dimension: layout.viewDimension === "3d" ? "3d" : "2d",
        usage: GPUTextureUsage.TEXTURE_BINDING | (depth ? GPUTextureUsage.RENDER_ATTACHMENT : 0)
      });
      if (depth) {
        const encoder = this.device.createCommandEncoder({ label: "Default shadow map" });
        for (let layer = 0; layer < layers; layer++)
          encoder
            .beginRenderPass({
              colorAttachments: [],
              depthStencilAttachment: {
                view: texture.createView({ dimension: "2d", baseArrayLayer: layer, arrayLayerCount: 1 }),
                depthLoadOp: "clear",
                depthClearValue: 1,
                depthStoreOp: "store"
              }
            })
            .end();
        this.device.queue.submit([encoder.finish()]);
      }
      view = texture.createView({ dimension: layout.viewDimension });
      this._defaults.set(key, view);
    }
    return view;
  }
  _fallbackSampler(type: GPUSamplerBindingType): GPUSampler {
    return this._getSampler({ compare: type === "comparison" ? "less-equal" : undefined });
  }
  _getSampler(descriptor: GPUSamplerDescriptor): GPUSampler {
    const key = [
      descriptor.addressModeU ?? "clamp-to-edge",
      descriptor.addressModeV ?? "clamp-to-edge",
      descriptor.minFilter ?? "nearest",
      descriptor.magFilter ?? "nearest",
      descriptor.mipmapFilter ?? "nearest",
      descriptor.compare ?? "",
      descriptor.maxAnisotropy ?? 1,
      descriptor.lodMinClamp ?? 0,
      descriptor.lodMaxClamp ?? 32
    ].join("/");
    let sampler = this._samplers.get(key);
    if (!sampler) {
      sampler = this.device.createSampler(descriptor);
      this._samplers.set(key, sampler);
    }
    return sampler;
  }
  get maxVertexUniformBlocks(): number {
    return this.device.limits.maxUniformBuffersPerShaderStage;
  }
  get maxFragmentUniformBlocks(): number {
    return this.maxVertexUniformBlocks;
  }
  get maxUniformBufferBindings(): number {
    return this.maxVertexUniformBlocks * 2;
  }
  get uniformBufferOffsetAlignment(): number {
    return this.device.limits.minUniformBufferOffsetAlignment;
  }
  readonly resolveShaderConstant = (name: string): number | undefined => {
    const l = this.device.limits;
    switch (name) {
      case "gl_MaxVertexAttribs":
        return l.maxVertexAttributes;
      case "gl_MaxDrawBuffers":
        return l.maxColorAttachments;
      case "gl_MaxVertexUniformVectors":
      case "gl_MaxFragmentUniformVectors":
        return this.maxUniformBlockSize / 16;
      case "gl_MaxTextureImageUnits":
      case "gl_MaxVertexTextureImageUnits":
        return l.maxSampledTexturesPerShaderStage;
      case "gl_MaxCombinedTextureImageUnits":
        return l.maxSampledTexturesPerShaderStage * 2;
    }
  };
  /** @internal */
  readonly _options: {
    _forceFlush: boolean;
    depth: boolean;
    stencil: boolean;
  };
  /** Native WebGPU adapter. */
  readonly adapter: GPUAdapter;
  /** Native WebGPU device. */
  readonly device: GPUDevice;
  /** Native WebGPU canvas context. */
  readonly context: GPUCanvasContext;
  /** Preferred canvas texture format. */
  readonly canvasFormat: GPUTextureFormat;
  private readonly _surfaceDepthFormat?: GPUTextureFormat;
  /** Device capability facade. */
  readonly capability: WebGPUCapability;
  /** Maximum uniform-buffer binding size in bytes. */
  readonly maxUniformBlockSize: number;
  submissionSerial = 0;
  private readonly _ops: WebGPUAttachmentOps;
  private readonly _bundles: WebGPUDrawBundles;
  private readonly _vertexLayoutIds = new Map<string, number>();
  private readonly _computePipelines = new Map<string, GPUComputePipeline>();
  private readonly _deviceOptions: WebGPUGraphicDeviceOptions;
  private _lost = false;
  private _forcedLoss = false;
  private _restoreRequested = false;
  private _restoring = false;
  private _onDeviceRestored: () => void;
  /** Adapter description exposed for diagnostics. */
  readonly renderer: string;
  /** Optional GPU timestamp collection state. */
  readonly gpuTiming: WebGPUTimingProfiler;

  /** @internal */
  _currentBindShaderProgram: IPlatformShaderProgram | null = null;

  private readonly _canvas: HTMLCanvasElement | OffscreenCanvas;
  private _onDeviceLost: () => void;
  private _currentRenderTarget: WebGPURenderTarget | null = null;
  private _viewport = new Vector4();
  private _scissor = new Vector4();
  private _commandEncoder?: GPUCommandEncoder;
  private _renderPass?: GPURenderPassEncoder | WebGPUDeferredPass;
  private readonly _deferredPass: WebGPUDeferredPass;
  private _computePass?: GPUComputePassEncoder;
  private _pendingClearFlags = CameraClearFlags.None;
  private _colorStore = RenderPassStoreAction.Store;
  private _depthStore = RenderPassStoreAction.Store;
  private _pendingClearColor = new Color();
  private _mainDepthTexture?: GPUTexture;
  private _externalTarget?: WebGPUProjectionTarget;
  private _renderState: AppliedRenderState;
  private readonly _mipmapGenerator: WebGPUMipmapGenerator;
  private readonly _gpuTimingProfiler: WebGPUTimingProfiler;
  private readonly _defaultVertexBuffer: GPUBuffer;
  readonly uniformRanges: { buffer: WebGPUBuffer; offset: number; size: number }[] = [];
  private _uploadPage?: GPUBuffer;
  private _uploadOffset = 0;
  private _retiredResources: (GPUBuffer | GPUTexture)[] = [];
  private _appliedRenderPipeline?: GPURenderPipeline;
  private readonly _appliedGroups: GPUBindGroup[] = [];
  private readonly _groupOffsets: Uint32Array[] = [];
  private readonly _vertexBuffers: GPUBuffer[] = [];
  private _indexBuffer?: GPUBuffer;
  private _indexFormat?: GPUIndexFormat;
  private _cachedTarget?: WebGPURenderTarget | null;
  private _attachments?: {
    colorFormats: readonly GPUTextureFormat[];
    depthStencilFormat?: GPUTextureFormat;
    sampleCount: number;
    key: string;
  };
  private _viewportDirty = true;
  private _scissorDirty = true;
  private readonly _appliedBlendConstant: GPUColorDict = { r: NaN, g: 0, b: 0, a: 0 };
  private _appliedStencilReference?: number;
  private _destroyed = false;
  private _renderPassLabel = "render";

  /**
   * Whether the texture-based joint path is available.
   */
  get canIUseMoreJoints(): boolean {
    return this.capability.canIUseMoreJoints;
  }

  private constructor(
    canvas: HTMLCanvasElement | OffscreenCanvas,
    adapter: GPUAdapter,
    device: GPUDevice,
    context: GPUCanvasContext,
    format: GPUTextureFormat,
    options: WebGPUGraphicDeviceOptions
  ) {
    this._canvas = canvas;
    this.adapter = adapter;
    this.device = device;
    this.context = context;
    this.canvasFormat = format;
    this._surfaceDepthFormat =
      options.stencil !== false
        ? options.depth === false
          ? "stencil8"
          : "depth24plus-stencil8"
        : options.depth !== false
          ? "depth24plus"
          : undefined;
    this.capability = new WebGPUCapability(device);
    this._mipmapGenerator = new WebGPUMipmapGenerator(device);
    this._gpuTimingProfiler = new WebGPUTimingProfiler(
      device,
      adapter.features.has("timestamp-query"),
      options.enableGPUTiming ?? false
    );
    this.gpuTiming = this._gpuTimingProfiler;
    const defaultVertexData = new ArrayBuffer(48);
    new Float32Array(defaultVertexData, 0, 4)[3] = 1;
    new Int32Array(defaultVertexData, 16, 4)[3] = 1;
    new Uint32Array(defaultVertexData, 32, 4)[3] = 1;
    this._defaultVertexBuffer = device.createBuffer({
      label: "Galacean default vertex attributes",
      size: defaultVertexData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    });
    device.queue.writeBuffer(this._defaultVertexBuffer, 0, defaultVertexData);
    this._options = {
      _forceFlush: false,
      depth: options.depth ?? true,
      stencil: options.stencil ?? true
    };
    this.maxUniformBlockSize = device.limits.maxUniformBufferBindingSize;
    this._ops = new WebGPUAttachmentOps(this);
    this._bundles = new WebGPUDrawBundles(device);
    this._deferredPass = new WebGPUDeferredPass(device);
    this._deviceOptions = options;
    this.renderer = adapter.info?.description || adapter.info?.device || "WebGPU";
    context.configure({
      device,
      format,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC | GPUTextureUsage.TEXTURE_BINDING,
      alphaMode: options.alphaMode ?? "premultiplied",
      colorSpace: options.colorSpace ?? "srgb"
    });
  }

  /**
   * Request an adapter and device for a canvas.
   * @param canvas - Web canvas wrapper.
   * @param options - Adapter, device, and canvas options.
   * @returns Initialized WebGPU graphic device.
   */
  static create(canvas: WebCanvas, options: WebGPUGraphicDeviceOptions = {}): Promise<WebGPUGraphicDevice> {
    let ownedDevice: GPUDevice | undefined;
    return this._requestAdapter(options)
      .then((adapter) =>
        this._requestDevice(adapter, options).then((device) => {
          ownedDevice = device;
          const nativeCanvas = canvas._webCanvas;
          const context = nativeCanvas.getContext("webgpu") as GPUCanvasContext | null;
          if (!context) throw new WebGPUDeviceUnavailableError("Unable to create a WebGPU canvas context.");
          return new WebGPUGraphicDevice(
            nativeCanvas,
            adapter,
            device,
            context,
            navigator.gpu.getPreferredCanvasFormat(),
            options
          );
        })
      )
      .catch((cause) => {
        if (ownedDevice) {
          ownedDevice.destroy();
          throw cause;
        }
        throw new WebGPUDeviceUnavailableError(cause instanceof Error ? cause.message : String(cause), cause);
      });
  }

  /** Query the browser for a usable adapter without creating a device or binding any canvas. */
  static isSupported(options: GPURequestAdapterOptions = {}): Promise<boolean> {
    return this._requestAdapter(options).then(
      () => true,
      () => false
    );
  }

  private static _requestAdapter(options: GPURequestAdapterOptions): Promise<GPUAdapter> {
    return new Promise<GPUAdapter | null>((resolve) => {
      if (!globalThis.navigator?.gpu) throw new Error("WebGPU is not available in this browser.");
      resolve(
        navigator.gpu.requestAdapter({
          powerPreference: options.powerPreference,
          forceFallbackAdapter: options.forceFallbackAdapter,
          xrCompatible: options.xrCompatible ?? "XRGPUBinding" in globalThis
        })
      );
    }).then((adapter) => {
      if (!adapter) throw new Error("No WebGPU adapter is available.");
      return adapter;
    });
  }

  private static _requestDevice(adapter: GPUAdapter, options: WebGPUGraphicDeviceOptions): Promise<GPUDevice> {
    const unsupportedFeatures = (options.requiredFeatures ?? []).filter((feature) => !adapter.features.has(feature));
    if (unsupportedFeatures.length > 0) {
      throw new Error(`Required WebGPU features are unavailable: ${unsupportedFeatures.join(", ")}`);
    }

    const preferredFeatures: GPUFeatureName[] = [
      "shader-f16",
      "float32-filterable",
      "float32-blendable",
      "rg11b10ufloat-renderable",
      "texture-compression-astc",
      "texture-compression-bc",
      "texture-compression-etc2",
      "depth32float-stencil8",
      "texture-formats-tier1"
    ];
    const requestedFeatures = new Set(options.requiredFeatures ?? []);
    for (const feature of preferredFeatures) {
      if (adapter.features.has(feature)) {
        requestedFeatures.add(feature);
      }
    }
    if (options.enableGPUTiming && adapter.features.has("timestamp-query")) {
      requestedFeatures.add("timestamp-query");
    }
    for (const key of ["maxSampledTexturesPerShaderStage", "maxSamplersPerShaderStage"] as const) {
      const required = options.requiredLimits?.[key];
      if (required !== undefined && required > adapter.limits[key])
        throw new Error(`Requested ${key}=${required}, adapter limit is ${adapter.limits[key]}.`);
    }
    return adapter.requestDevice({
      requiredFeatures: Array.from(requestedFeatures),
      requiredLimits: {
        maxSampledTexturesPerShaderStage: adapter.limits.maxSampledTexturesPerShaderStage,
        maxSamplersPerShaderStage: adapter.limits.maxSamplersPerShaderStage,
        maxVertexBuffers: adapter.limits.maxVertexBuffers,
        maxVertexAttributes: adapter.limits.maxVertexAttributes,
        ...options.requiredLimits
      }
    });
  }

  init(_canvas: Canvas, onDeviceLost: () => void, _onDeviceRestored: () => void): void {
    this._onDeviceLost = onDeviceLost;
    this._onDeviceRestored = _onDeviceRestored;
    const device = this.device;
    device.lost.then((info) => {
      if (this.device === device && !this._destroyed && !this._lost) {
        this._lost = true;
        this._onDeviceLost();
        if (info.reason !== "destroyed" || this._restoreRequested) this.forceRestoreDevice();
      }
    });
  }

  /** Equivalent vertex layouts share a numeric identity across all meshes on this device. */
  _getVertexLayoutId(buffers: (GPUVertexBufferLayout | null)[]): number {
    const key = JSON.stringify(buffers);
    let id = this._vertexLayoutIds.get(key);
    if (id === undefined) {
      id = this._vertexLayoutIds.size;
      this._vertexLayoutIds.set(key, id);
    }
    return id;
  }

  createPlatformPrimitive(primitive: Primitive): IPlatformPrimitive {
    return new WebGPUPrimitive(this, primitive);
  }
  createPlatformShaderProgram(engine: Engine, source: IPlatformShaderSource): IPlatformShaderProgram {
    return new WebGPUShaderProgram(this, engine, source);
  }
  createPlatformTexture2D(texture: Texture2D): IPlatformTexture2D {
    return new WebGPUTexture2D(this, texture);
  }

  createPlatformTexture2DArray(texture: Texture2DArray): IPlatformTexture2DArray {
    return new WebGPUTexture2DArray(this, texture);
  }

  createPlatformTextureCube(texture: TextureCube): IPlatformTextureCube {
    return new WebGPUTextureCube(this, texture);
  }

  createPlatformRenderTarget(target: RenderTarget): IPlatformRenderTarget {
    return new WebGPURenderTarget(this, target);
  }

  createPlatformBuffer(
    type: BufferBindFlag,
    byteLength: number,
    usage: BufferUsage = BufferUsage.Static,
    data?: ArrayBuffer | ArrayBufferView
  ): IPlatformBuffer {
    return new WebGPUBuffer(this, type, byteLength, usage, data);
  }

  createPlatformTransformFeedback(): never {
    throw new Error("Transform Feedback is not supported by WebGPU; use a compute pipeline.");
  }

  createPlatformTransformFeedbackPrimitive(): never {
    throw new Error("Transform Feedback is not supported by WebGPU; use a compute pipeline.");
  }

  bindUniformBufferBase(binding: number, buffer: IPlatformBuffer): void {
    this.bindUniformBufferRange(binding, buffer, 0, (buffer as WebGPUBuffer).byteLength);
  }
  bindUniformBufferRange(
    binding: number,
    platformBuffer: IPlatformBuffer,
    offset: number,
    size: number,
    data?: ArrayBufferView,
    discard = false
  ): void {
    const buffer = platformBuffer as WebGPUBuffer;
    if (offset % this.uniformBufferOffsetAlignment || offset < 0 || size <= 0 || offset + size > buffer.byteLength)
      throw new RangeError("Invalid WebGPU uniform buffer range.");
    if (data)
      buffer.setData(
        buffer.byteLength,
        data,
        offset,
        0,
        undefined,
        discard ? SetDataOptions.Discard : SetDataOptions.None
      );
    const range = this.uniformRanges[binding];
    if (range) {
      range.buffer = buffer;
      range.offset = offset;
      range.size = size;
    } else this.uniformRanges[binding] = { buffer, offset, size };
  }

  enableRasterizerDiscard(): never {
    throw new Error("Rasterizer discard is not supported by WebGPU; use a compute pipeline.");
  }

  disableRasterizerDiscard(): never {
    throw new Error("Rasterizer discard is not supported by WebGPU; use a compute pipeline.");
  }

  invalidateShaderProgramState(): void {
    this._currentBindShaderProgram = null;
  }

  requireExtension(): undefined {
    return undefined;
  }

  canIUse(capability: GLCapabilityType): boolean {
    return this.capability.canIUse(capability);
  }

  canIUseCompressedTextureInternalFormat(format: number): boolean {
    return this.capability.canIUseCompressedTextureInternalFormat(format);
  }

  viewport(x: number, y: number, width: number, height: number): void {
    const viewport = this._viewport;
    if (viewport.x !== x || viewport.y !== y || viewport.z !== width || viewport.w !== height) {
      viewport.set(x, y, width, height);
      this._viewportDirty = true;
    }
  }

  scissor(x: number, y: number, width: number, height: number): void {
    const scissor = this._scissor;
    if (scissor.x !== x || scissor.y !== y || scissor.z !== width || scissor.w !== height) {
      scissor.set(x, y, width, height);
      this._scissorDirty = true;
    }
  }

  /** Select a compositor-owned projection layer for the main target. The compositor retains ownership. */
  setExternalProjectionTarget(target: WebGPUProjectionTarget | null): void {
    this.endRenderPass();
    this._externalTarget = target ?? undefined;
    this._attachments = undefined;
    this._viewportDirty = this._scissorDirty = true;
  }

  get hasExternalProjectionDepth(): boolean {
    return !!this._externalTarget?.depthStencil?.format.startsWith("depth");
  }

  storeExternalProjectionDepth(source: RenderTarget, viewport: Vector4): void {
    const external = this._externalTarget;
    const target = source._platformRenderTarget as WebGPURenderTarget;
    const depth = target.depthTexture();
    if (!external?.depthStencil || !depth) return;
    const width = this._mainWidth,
      height = this._mainHeight;
    const x = Math.floor(viewport.x * width),
      y = Math.floor(viewport.y * height);
    const rect = new Vector4(
      x,
      y,
      Math.floor((viewport.x + viewport.z) * width) - x,
      Math.floor((viewport.y + viewport.w) * height) - y
    );
    if (rect.z <= 0 || rect.w <= 0) return;
    this._ops.copyDepth(
      depth,
      external.depthStencil,
      new Vector4(0, 0, 1, 1),
      CameraClearFlags.Stencil,
      external.viewDescriptor.baseMipLevel,
      external.viewDescriptor.baseArrayLayer,
      target.depthView(),
      rect
    );
  }

  private get _mainWidth(): number {
    const external = this._externalTarget;
    return external
      ? Math.max(1, external.color.width >> (external.viewDescriptor.baseMipLevel ?? 0))
      : this._canvas.width;
  }

  private get _mainHeight(): number {
    const external = this._externalTarget;
    return external
      ? Math.max(1, external.color.height >> (external.viewDescriptor.baseMipLevel ?? 0))
      : this._canvas.height;
  }

  clearRenderTarget(_engine: Engine, clearFlags: CameraClearFlags, clearColor?: Color): void {
    if (!clearFlags) return;
    const width = this._currentRenderTarget?.width ?? this._mainWidth;
    const height = this._currentRenderTarget?.height ?? this._mainHeight;
    const r = this._scissor;
    if (r.x !== 0 || r.y !== 0 || r.z !== width || r.w !== height) {
      this._flushBundles();
      this._ops.clear(
        this._getRenderPass(),
        this._getAttachmentState(),
        r,
        clearFlags,
        clearColor ?? this._pendingClearColor
      );
      this._resetRenderPassState();
    } else {
      this._endCurrentPass();
      this._pendingClearFlags |= clearFlags;
      if (clearColor) this._pendingClearColor.copyFrom(clearColor);
      this._getRenderPass();
    }
  }

  drawPrimitive(primitive: Primitive, subPrimitive: SubPrimitive, program: IPlatformShaderProgram): void {
    primitive.draw(program, subPrimitive);
  }

  beginFrame(): void {}
  endFrame(): void {
    this.endRenderPass();
    this.flush();
  }
  endRenderPass(): void {
    this._endRenderPass(true);
    this._endComputePass();
    this._pendingClearFlags = CameraClearFlags.None;
  }
  _finishTarget(target: WebGPURenderTarget): void {
    if (this._currentRenderTarget === target) this.endRenderPass();
    else this._endCurrentPass();
  }
  supportsTextureFormat(format: TextureFormat): boolean {
    const f = WebGPUTexture._findFormat(format, false);
    if (!f) return false;
    const feature: GPUFeatureName | undefined = f.startsWith("bc")
      ? "texture-compression-bc"
      : f.startsWith("etc")
        ? "texture-compression-etc2"
        : f.startsWith("astc")
          ? "texture-compression-astc"
          : f === "depth32float-stencil8"
            ? "depth32float-stencil8"
            : f === "r16unorm"
              ? "texture-formats-tier1"
              : undefined;
    return !feature || this.device.features.has(feature);
  }
  supportsRenderTargetColorFormat(format: TextureFormat): boolean {
    if (!this.supportsTextureFormat(format)) return false;
    const f = WebGPUTexture._getFormat(format, false);
    return (
      !/^(bc|etc|astc|depth|stencil)/.test(f) &&
      (f !== "rg11b10ufloat" || this.device.features.has("rg11b10ufloat-renderable"))
    );
  }
  supportsGenerateMipmaps(format: TextureFormat, srgb: boolean): boolean {
    if (!this.supportsRenderTargetColorFormat(format)) return false;
    const f = WebGPUTexture._getFormat(format, srgb);
    return !f.endsWith("uint") && (!f.includes("32float") || this.device.features.has("float32-filterable"));
  }
  getMainFrameBufferWidth(): number {
    return this._mainWidth;
  }

  getMainFrameBufferHeight(): number {
    return this._mainHeight;
  }

  activeRenderTarget(
    renderTarget: RenderTarget | null,
    viewport: Vector4,
    _isFlipProjection?: boolean | null,
    mipLevel: number = 0,
    faceIndex?: number
  ): void {
    this.endRenderPass();
    this._colorStore = RenderPassStoreAction.Store;
    this._depthStore = RenderPassStoreAction.Store;
    this._renderPassLabel = renderTarget ? "offscreen-render" : "main-render";
    this._bindTargetAndViewport(renderTarget, viewport, mipLevel, faceIndex);
  }

  beginRenderPass(descriptor: RenderPassDescriptor): void {
    this.endRenderPass();
    const { renderTarget, viewport, mipLevel, faceIndex } = descriptor;
    this._colorStore = descriptor.colorStoreAction;
    this._depthStore = descriptor.depthStoreAction;
    this._renderPassLabel = descriptor.label ?? (renderTarget ? "offscreen-render" : "main-render");
    const fullViewport = viewport.x === 0 && viewport.y === 0 && viewport.z === 1 && viewport.w === 1;
    if (
      descriptor.colorLoadAction === RenderPassLoadAction.Clear ||
      (fullViewport && descriptor.colorLoadAction === RenderPassLoadAction.DontCare)
    ) {
      this._pendingClearFlags |= CameraClearFlags.Color;
      if (descriptor.colorLoadAction === RenderPassLoadAction.Clear) {
        this._pendingClearColor.copyFrom(descriptor.clearColor);
      } else {
        this._pendingClearColor.set(0, 0, 0, 0);
      }
    }
    if (
      descriptor.depthLoadAction === RenderPassLoadAction.Clear ||
      (fullViewport && descriptor.depthLoadAction === RenderPassLoadAction.DontCare)
    ) {
      this._pendingClearFlags |= CameraClearFlags.Depth;
    }
    if (
      descriptor.stencilLoadAction === RenderPassLoadAction.Clear ||
      (fullViewport && descriptor.stencilLoadAction === RenderPassLoadAction.DontCare)
    ) {
      this._pendingClearFlags |= CameraClearFlags.Stencil;
    }
    this._bindTargetAndViewport(renderTarget, viewport, mipLevel, faceIndex);
  }

  private _bindTargetAndViewport(
    renderTarget: RenderTarget | null,
    viewport: Vector4,
    mipLevel: number = 0,
    faceIndex?: number
  ): void {
    if (renderTarget) {
      (
        renderTarget as RenderTarget & { _platformRenderTarget: IPlatformRenderTarget }
      )._platformRenderTarget.activeRenderTarget(mipLevel, faceIndex);
    } else {
      this._currentRenderTarget = null;
    }
    const targetWidth = renderTarget ? Math.max(1, renderTarget.width >> mipLevel) : this._mainWidth;
    const targetHeight = renderTarget ? Math.max(1, renderTarget.height >> mipLevel) : this._mainHeight;
    const width = targetWidth * viewport.z;
    const height = targetHeight * viewport.w;
    const x = targetWidth * viewport.x;
    const y = targetHeight * viewport.y;
    this.viewport(x, y, width, height);
    this.scissor(x, y, width, height);
  }

  blitInternalRTByBlitFrameBuffer(
    source: RenderTarget | null,
    destination: RenderTarget,
    flags: CameraClearFlags,
    viewport: Vector4
  ): void {
    const target = destination._platformRenderTarget as WebGPURenderTarget;
    target._invalidatePixels();
    const src = source?._platformRenderTarget as WebGPURenderTarget | undefined;
    if (!(flags & CameraClearFlags.Color) && destination.colorTextureCount) {
      this._ops.copyColor(
        this._sourceColor(source),
        target.colorAttachment(),
        viewport,
        src ? src.colorView() : this._externalTarget?.viewDescriptor,
        target.colorView(true)
      );
    }
    const sourceDepth = src ? src.depthTexture() : (this._externalTarget?.depthStencil ?? this._mainDepthTexture);
    const destDepth = target.depthTexture();
    if (sourceDepth && destDepth && (flags & CameraClearFlags.DepthStencil) !== CameraClearFlags.DepthStencil) {
      const destView = target.depthView();
      this._ops.copyDepth(
        sourceDepth,
        destDepth,
        viewport,
        flags,
        destView?.baseMipLevel,
        destView?.baseArrayLayer,
        src ? src.depthView() : this._externalTarget?.viewDescriptor
      );
    }
  }
  /** Copy tightly packed, native-format texels into mip zero of an uncompressed color texture, in row order. */
  copyBufferToTexture(source: Buffer, target: Texture2D, texelCount: number): void {
    if (
      source.destroyed ||
      target.destroyed ||
      source.engine._hardwareRenderer !== this ||
      target.engine._hardwareRenderer !== this
    ) {
      throw new Error("Both resources must belong to this WebGPU device and be alive.");
    }
    const texture = target._platformTexture as WebGPUTexture2D;
    const { blockWidth, blockHeight, bytesPerBlock } = WebGPUTexture._getTexelLayout(texture._format);
    if (
      blockWidth !== 1 ||
      blockHeight !== 1 ||
      texture._format.startsWith("depth") ||
      texture._format === "stencil8"
    ) {
      throw new Error("copyBufferToTexture requires an uncompressed color texture.");
    }
    const width = target.width;
    const byteLength = texelCount * bytesPerBlock;
    if (
      !Number.isSafeInteger(texelCount) ||
      texelCount < 0 ||
      texelCount > width * target.height ||
      byteLength > source.byteLength
    ) {
      throw new RangeError("The copy exceeds the source buffer or destination texture.");
    }
    if (texelCount === 0) return;
    const buffer = source._platformBuffer as WebGPUBuffer;
    const nativeBuffer = buffer._gpuBuffer;
    const destination = { texture: texture._gpuTexture, origin: { x: 0, y: 0 } };
    const encoder = this._getCommandEncoder();
    const pitch = width * bytesPerBlock;
    const rows = Math.floor(texelCount / width);
    if (rows && pitch % 256 === 0) {
      encoder.copyBufferToTexture({ buffer: nativeBuffer, bytesPerRow: pitch }, destination, { width, height: rows });
    } else {
      // A one-row copy has no bytesPerRow alignment requirement.
      for (let y = 0; y < rows; y++) {
        destination.origin.y = y;
        encoder.copyBufferToTexture({ buffer: nativeBuffer, offset: y * pitch }, destination, { width });
      }
    }
    const tail = texelCount % width;
    if (tail) {
      destination.origin.y = rows;
      encoder.copyBufferToTexture({ buffer: nativeBuffer, offset: rows * pitch }, destination, { width: tail });
    }
    buffer._markUsed(0, byteLength);
    texture._invalidatePixels();
    target._isContentLost = false;
  }

  copyRenderTargetToSubTexture(source: RenderTarget | null, texture: Texture2D, viewport: Vector4): void {
    const destination = texture._platformTexture as WebGPUTexture;
    destination._invalidatePixels();
    this._ops.copyColor(
      this._sourceColor(source),
      destination._gpuTexture,
      viewport,
      source ? (source._platformRenderTarget as WebGPURenderTarget).colorView() : this._externalTarget?.viewDescriptor
    );
  }
  _resolveDepth(source: GPUTexture, destination: GPUTexture, destinationMip = 0, destinationLayer = 0): void {
    this._ops.copyDepth(
      source,
      destination,
      new Vector4(0, 0, 1, 1),
      CameraClearFlags.None,
      destinationMip,
      destinationLayer
    );
  }
  /** Expand R8 or RG8 to RGBA8 using its native zero channels and alpha of one at every texel. */
  _expandTextureChannels(
    source: GPUTexture,
    mip: number,
    destination: GPUTexture,
    destinationMip: number,
    layer: number
  ): void {
    this._ops.copyColor(
      source,
      destination,
      new Vector4(0, 0, 1, 1),
      { baseMipLevel: mip },
      { baseMipLevel: destinationMip, baseArrayLayer: layer }
    );
  }
  private _sourceColor(source: RenderTarget | null): GPUTexture {
    return source
      ? (source._platformRenderTarget as WebGPURenderTarget).colorTexture()
      : (this._externalTarget?.color ?? this.context.getCurrentTexture());
  }

  flush(): void {
    if (!this._commandEncoder && this._pendingClearFlags !== CameraClearFlags.None) {
      this._getRenderPass();
    }
    this._endCurrentPass();
    if (this._commandEncoder) {
      const timingReadback = this._gpuTimingProfiler.resolve(this._commandEncoder);
      this.device.queue.submit([this._commandEncoder.finish()]);
      this._gpuTimingProfiler.readAfterSubmit(timingReadback);
      this._commandEncoder = undefined;
    }
    this.submissionSerial++;
    this._uploadOffset = 0;
    if (this._retiredResources.length > 0) {
      const retired = this._retiredResources;
      this._retiredResources = [];
      const release = () => {
        for (const buffer of retired) {
          buffer.destroy();
        }
      };
      this.device.queue.onSubmittedWorkDone().then(release, release);
    }
  }

  forceLoseDevice(): void {
    this._forcedLoss = true;
    this.device.destroy();
  }

  forceRestoreDevice(): void {
    if (this._restoring || this._destroyed) return;
    if (!this._lost) {
      this._restoreRequested = this._forcedLoss;
      return;
    }
    this._restoring = true;
    WebGPUGraphicDevice.create(new WebCanvas(this._canvas), this._deviceOptions)
      .then((replacement) => {
        if (this._destroyed) {
          replacement.destroy();
          return;
        }
        const lost = this._onDeviceLost,
          restored = this._onDeviceRestored;
        Object.assign(this, replacement);
        // A fresh device has no upload page until its first ordered write.
        this._uploadPage = undefined;
        this._mainDepthTexture = undefined;
        this._externalTarget = undefined;
        this._attachments = undefined;
        this._renderPass = this._computePass = this._commandEncoder = undefined;
        this._currentRenderTarget = this._currentBindShaderProgram = null;
        this._resetRenderPassState();
        this._ops.deviceOwner = this;
        this.init(new WebCanvas(this._canvas), lost, restored);
        restored();
      })
      .catch((error) => console.error("WebGPU device restoration failed.", error))
      .finally(() => {
        this._restoring = false;
      });
  }

  isContextLost(): boolean {
    return this._lost || this._destroyed;
  }

  resetState(): void {
    this._endCurrentPass();
    this._currentBindShaderProgram = null;
    this._currentRenderTarget = null;
  }

  destroy(): void {
    if (!this._destroyed) {
      this._destroyed = true;
      this._endCurrentPass();
      this._computePipelines.clear();
      this._vertexLayoutIds.clear();
      this._ops.destroy();
      this._gpuTimingProfiler.destroy();
      this._mainDepthTexture?.destroy();
      this._defaultVertexBuffer.destroy();
      this._uploadPage?.destroy();
      for (const buffer of this._retiredResources) {
        buffer.destroy();
      }
      this.context.unconfigure();
      this.device.destroy();
    }
  }

  /** @internal */
  _setRenderTarget(target: WebGPURenderTarget): void {
    this._endCurrentPass();
    this._currentRenderTarget = target;
  }

  /** @internal */
  _getDefaultVertexBuffer(): GPUBuffer {
    return this._defaultVertexBuffer;
  }

  /** @internal */
  applyRenderState(
    state: RenderState,
    _last: RenderState,
    frontFaceInvert: boolean,
    overrides?: RenderStateElementMap | null
  ): void {
    const customStates = overrides as RenderOverrides | null | undefined;
    if (this._renderState) {
      this._renderState.state = state;
      this._renderState.frontFaceInvert = frontFaceInvert;
      this._renderState.customStates = customStates;
    } else this._renderState = { state, frontFaceInvert, customStates };
  }

  /** @internal */
  _getRenderState(): AppliedRenderState {
    if (!this._renderState) {
      throw new Error("WebGPU draw was issued before a render state was applied.");
    }
    return this._renderState;
  }

  /** @internal */
  _getAttachmentState(target = this._currentRenderTarget): {
    colorFormats: readonly GPUTextureFormat[];
    depthStencilFormat?: GPUTextureFormat;
    sampleCount: number;
    key: string;
  } {
    if (this._attachments && this._cachedTarget === target) return this._attachments;
    this._cachedTarget = target;
    if (target) {
      const colorFormats = target.colorFormats;
      const depthStencilFormat = target.depthStencilFormat;
      const sampleCount = target.sampleCount;
      return (this._attachments = {
        colorFormats,
        depthStencilFormat,
        sampleCount,
        key: `${colorFormats.join(",")}|${depthStencilFormat ?? ""}|${sampleCount}`
      });
    }
    const external = this._externalTarget;
    const color = external?.viewDescriptor.format ?? external?.color.format ?? this.canvasFormat;
    const depthStencilFormat = external?.depthStencil?.format ?? this._surfaceDepthFormat;
    const sampleCount = external?.color.sampleCount ?? 1;
    return (this._attachments = {
      colorFormats: [color],
      depthStencilFormat,
      sampleCount,
      key: `${color}|${depthStencilFormat ?? ""}|${sampleCount}`
    });
  }

  /**
   * Return the active render pass, closing any preceding compute group.
   * @returns Current or newly encoded render pass.
   * @internal
   */
  _getRenderPass(): WebGPURenderCommands {
    if (this._renderPass) {
      return this._renderPass;
    }
    this._endComputePass();
    this._commandEncoder ??= this.device.createCommandEncoder({
      label: "Galacean WebGPU frame"
    });
    this._currentRenderTarget?._invalidatePixels();
    const descriptor = this._currentRenderTarget
      ? this._currentRenderTarget.createDescriptor(this._pendingClearFlags, this._pendingClearColor)
      : this._createMainRenderPassDescriptor();
    descriptor.label = this._renderPassLabel;
    this._gpuTimingProfiler.addTimestampWrites(descriptor, "render");
    const target = this._getAttachmentState();
    const deferred =
      (this._colorStore === RenderPassStoreAction.Discard && target.colorFormats.length > 0) ||
      (this._colorStore === RenderPassStoreAction.Resolve && target.sampleCount > 1) ||
      (this._depthStore === RenderPassStoreAction.Discard && !!target.depthStencilFormat);
    if (deferred) {
      this._deferredPass.begin(descriptor, {
        colorFormats: target.colorFormats,
        depthStencilFormat: target.depthStencilFormat,
        sampleCount: target.sampleCount
      });
      this._renderPass = this._deferredPass;
    } else this._renderPass = this._commandEncoder.beginRenderPass(descriptor);
    this._bundles.begin(
      this._renderPass,
      this._currentRenderTarget ?? this._canvas,
      this._renderPassLabel + "/" + target.key,
      target.colorFormats,
      target.depthStencilFormat,
      target.sampleCount,
      deferred
    );
    this._resetRenderPassState();
    this._pendingClearFlags = CameraClearFlags.None;
    return this._renderPass;
  }

  /**
   * Return the active compute pass so consecutive dispatches share one native pass.
   * @returns Current or newly encoded compute pass.
   * @internal
   */
  _beginComputePass(): GPUComputePassEncoder {
    if (this._computePass) {
      return this._computePass;
    }
    this._endRenderPass();
    this._commandEncoder ??= this.device.createCommandEncoder({
      label: "Galacean WebGPU frame"
    });
    const descriptor: GPUComputePassDescriptor = {
      label: "compute"
    };
    this._gpuTimingProfiler.addTimestampWrites(descriptor, "compute");
    return (this._computePass = this._commandEncoder.beginComputePass(descriptor));
  }

  _getCommandEncoder(): GPUCommandEncoder {
    this._endCurrentPass();
    return (this._commandEncoder ??= this.device.createCommandEncoder({ label: "Galacean commands" }));
  }
  /** Merge unaligned byte ranges with the destination's current GPU values. */
  _expandIndices(src: GPUBuffer, dst: GPUBuffer, words: number): void {
    const key = "Galacean UInt8 indices";
    let pipeline = this._computePipelines.get(key);
    if (!pipeline) {
      const module = this.device.createShaderModule({
        code: `
        @group(0) @binding(0) var<storage,read> src: array<u32>;
        @group(0) @binding(1) var<storage,read_write> dst: array<u32>;
        @compute @workgroup_size(64) fn expand(@builtin(global_invocation_id) id:vec3u) {
          if(id.x>=arrayLength(&src)) { return; }
          let value=src[id.x];
          dst[id.x*2u]=(value&255u)|((value&65280u)<<8u);
          dst[id.x*2u+1u]=((value>>16u)&255u)|((value>>24u)<<16u);
        }`
      });
      pipeline = this.device.createComputePipeline({ layout: "auto", compute: { module, entryPoint: "expand" } });
      this._computePipelines.set(key, pipeline);
    }
    const pass = this._beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(
      0,
      this.device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: src } },
          { binding: 1, resource: { buffer: dst } }
        ]
      })
    );
    pass.dispatchWorkgroups(Math.ceil(words / 64));
    this._endComputePass();
  }

  _copyBytes(src: GPUBuffer, dst: GPUBuffer, srcOffset: number, dstOffset: number, size: number): void {
    const key = "Galacean copy bytes";
    let pipeline = this._computePipelines.get(key);
    if (!pipeline) {
      const module = this.device.createShaderModule({
        code: `
        @group(0) @binding(0) var<storage,read> src: array<u32>;
        @group(0) @binding(1) var<storage,read_write> dst: array<u32>;
        @group(0) @binding(2) var<uniform> p: vec4u;
        @compute @workgroup_size(64) fn copyBytes(@builtin(global_invocation_id) id: vec3u) {
          let index = p.y/4u + id.x;
          if (index*4u >= p.y+p.z) { return; }
          var word = dst[index];
          for (var i=0u;i<4u;i++) {
            let offset = index*4u+i;
            if (offset>=p.y && offset<p.y+p.z) {
              let s = offset-p.y+p.x;
              let byte = (src[s/4u] >> ((s%4u)*8u)) & 255u;
              word = (word & ~(255u<<(i*8u))) | (byte<<(i*8u));
            }
          }
          dst[index] = word;
        }`
      });
      pipeline = this.device.createComputePipeline({ layout: "auto", compute: { module, entryPoint: "copyBytes" } });
      this._computePipelines.set(key, pipeline);
    }
    const params = this.device.createBuffer({ size: 16, usage: GPUBufferUsage.UNIFORM, mappedAtCreation: true });
    new Uint32Array(params.getMappedRange()).set([srcOffset, dstOffset, size]);
    params.unmap();
    const pass = this._beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(
      0,
      this.device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [src, dst, params].map((buffer, binding) => ({ binding, resource: { buffer } }))
      })
    );
    pass.dispatchWorkgroups(Math.ceil(((dstOffset % 4) + size) / 256));
    this._endComputePass();
    this._retireBuffer(params);
  }
  dispatchCompute(
    source: string,
    entryPoint: string,
    workgroups: readonly [number, number, number],
    bindings: readonly {
      binding: number;
      buffer: IPlatformBuffer;
      access: "read" | "read_write" | "uniform";
      offset?: number;
      size?: number;
    }[]
  ): void {
    const key = entryPoint + ":" + source;
    let pipeline = this._computePipelines.get(key);
    if (!pipeline) {
      pipeline = this.device.createComputePipeline({
        layout: "auto",
        compute: { module: this.device.createShaderModule({ code: source }), entryPoint }
      });
      this._computePipelines.set(key, pipeline);
    }
    const entries = bindings.map((b) => {
      const buffer = b.buffer as WebGPUBuffer;
      if (b.access === "read_write") buffer._markShaderWrite();
      buffer._markUsed(b.offset, b.size ?? buffer.byteLength - (b.offset ?? 0));
      return { binding: b.binding, resource: { buffer: buffer._gpuBuffer, offset: b.offset, size: b.size } };
    });
    const group = this.device.createBindGroup({ layout: pipeline.getBindGroupLayout(0), entries });
    const pass = this._beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, group);
    pass.dispatchWorkgroups(...workgroups);
    this._endComputePass();
  }

  _drawCommands(pass: WebGPURenderCommands): RenderDrawCommands {
    if (this._bundles.beginDraw()) this._resetDrawBindings();
    return this._bundles.enabled ? this._bundles : pass;
  }
  private _flushBundles(): void {
    if (this._bundles.flush()) this._resetDrawBindings();
  }
  _applyDynamicState(pass: WebGPURenderCommands): void {
    if (this._viewportDirty) {
      const targetWidth = this._currentRenderTarget?.width ?? this._mainWidth;
      const targetHeight = this._currentRenderTarget?.height ?? this._mainHeight;
      const viewportWidth = Math.max(0, Math.min(this._viewport.z, targetWidth - this._viewport.x));
      const viewportHeight = Math.max(0, Math.min(this._viewport.w, targetHeight - this._viewport.y));
      this._flushBundles();
      pass.setViewport(this._viewport.x, this._viewport.y, viewportWidth, viewportHeight, 0, 1);
      this._viewportDirty = false;
    }
    if (this._scissorDirty) {
      const targetWidth = this._currentRenderTarget?.width ?? this._mainWidth;
      const targetHeight = this._currentRenderTarget?.height ?? this._mainHeight;
      const scissorX = Math.max(0, Math.floor(this._scissor.x));
      const scissorY = Math.max(0, Math.floor(this._scissor.y));
      const scissorWidth = Math.max(0, Math.floor(Math.min(this._scissor.z, targetWidth - this._scissor.x)));
      const scissorHeight = Math.max(0, Math.floor(Math.min(this._scissor.w, targetHeight - this._scissor.y)));
      this._flushBundles();
      pass.setScissorRect(scissorX, scissorY, scissorWidth, scissorHeight);
      this._scissorDirty = false;
    }
    const { state, customStates } = this._getRenderState();
    const blendColor = state.blendState.blendColor;
    const blendConstant = this._appliedBlendConstant;
    if (
      blendConstant.r !== blendColor.r ||
      blendConstant.g !== blendColor.g ||
      blendConstant.b !== blendColor.b ||
      blendConstant.a !== blendColor.a
    ) {
      this._flushBundles();
      blendConstant.r = blendColor.r;
      blendConstant.g = blendColor.g;
      blendConstant.b = blendColor.b;
      blendConstant.a = blendColor.a;
      pass.setBlendConstant(blendConstant);
    }
    const stencilReference =
      customStates?.[RenderStateElementKey.StencilStateReferenceValue] ?? state.stencilState.referenceValue;
    if (this._appliedStencilReference !== stencilReference) {
      this._flushBundles();
      pass.setStencilReference(stencilReference);
      this._appliedStencilReference = stencilReference;
    }
  }

  /** @internal */
  _setBindGroup(
    pass: RenderDrawCommands | GPUComputePassEncoder,
    index: number,
    group: GPUBindGroup,
    offsets: Uint32Array
  ): void {
    // WebKit/Metal needs the uniform ranges as well as the sampled views recorded for each
    // bundled draw. Otherwise some instances use another draw's transform during camera motion.
    if (pass !== this._renderPass) {
      if (offsets.length) pass.setBindGroup(index, group, offsets, 0, offsets.length);
      else pass.setBindGroup(index, group);
      return;
    }
    let cached = this._groupOffsets[index];
    let changed = this._appliedGroups[index] !== group;
    if (!cached || cached.length < offsets.length) {
      this._groupOffsets[index] = cached = new Uint32Array(offsets.length);
      changed = true;
    }
    for (let i = 0; i < offsets.length; i++) {
      if (cached[i] !== offsets[i]) {
        cached[i] = offsets[i];
        changed = true;
      }
    }
    if (changed) {
      this._appliedGroups[index] = group;
      if (offsets.length) pass.setBindGroup(index, group, offsets, 0, offsets.length);
      else pass.setBindGroup(index, group);
    }
  }

  _setVertexBuffer(pass: RenderDrawCommands, slot: number, buffer: GPUBuffer): void {
    if (this._vertexBuffers[slot] !== buffer) {
      pass.setVertexBuffer(slot, buffer);
      this._vertexBuffers[slot] = buffer;
    }
  }
  _setIndexBuffer(pass: RenderDrawCommands, buffer: GPUBuffer, format: GPUIndexFormat): void {
    if (this._indexBuffer !== buffer || this._indexFormat !== format) {
      pass.setIndexBuffer(buffer, format);
      this._indexBuffer = buffer;
      this._indexFormat = format;
    }
  }
  _setRenderPipeline(pass: RenderDrawCommands, pipeline: GPURenderPipeline): void {
    if (this._appliedRenderPipeline !== pipeline) {
      pass.setPipeline(pipeline);
      this._appliedRenderPipeline = pipeline;
    }
  }

  /** @internal */
  _retireTexture(texture: GPUTexture): void {
    if (this._destroyed || (!this._commandEncoder && this._pendingClearFlags === CameraClearFlags.None))
      texture.destroy();
    else this._retiredResources.push(texture);
  }

  /** Place an overlapping CPU update after the draws already recorded for this buffer. */
  _writeBufferInOrder(destination: GPUBuffer, offset: number, source: Uint8Array): void {
    const pageSize = 64 * 1024;
    const size = source.byteLength;
    const usage = GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST;
    if (size > pageSize) {
      const staging = this.device.createBuffer({ size, usage });
      this.device.queue.writeBuffer(staging, 0, source);
      this._getCommandEncoder().copyBufferToBuffer(staging, 0, destination, offset, size);
      this._retireBuffer(staging);
      return;
    }
    if (this._uploadOffset + size > pageSize) {
      this._retireBuffer(this._uploadPage!);
      this._uploadPage = undefined;
      this._uploadOffset = 0;
    }
    const page = (this._uploadPage ??= this.device.createBuffer({
      label: "Galacean ordered buffer updates",
      size: pageSize,
      usage
    }));
    this.device.queue.writeBuffer(page, this._uploadOffset, source);
    this._getCommandEncoder().copyBufferToBuffer(page, this._uploadOffset, destination, offset, size);
    this._uploadOffset += size;
  }

  _retireBuffer(buffer: GPUBuffer): void {
    if (this._destroyed || (!this._commandEncoder && this._pendingClearFlags === CameraClearFlags.None))
      buffer.destroy();
    else this._retiredResources.push(buffer);
  }

  /** @internal */
  _generateMipmaps(texture: GPUTexture): void {
    if (texture.mipLevelCount > 1) this._mipmapGenerator.generate(this._getCommandEncoder(), texture);
  }

  private _createMainRenderPassDescriptor(): GPURenderPassDescriptor {
    const external = this._externalTarget;
    const format = external?.depthStencil?.format ?? this._surfaceDepthFormat;
    const hasDepth = format?.startsWith("depth"),
      hasStencil = format?.includes("stencil");
    if (format && !external?.depthStencil) this._ensureMainDepthTexture();
    const clearColor = (this._pendingClearFlags & CameraClearFlags.Color) !== 0;
    const clearDepth = (this._pendingClearFlags & CameraClearFlags.Depth) !== 0;
    const clearStencil = (this._pendingClearFlags & CameraClearFlags.Stencil) !== 0;
    return {
      colorAttachments: [
        {
          view: external
            ? external.color.createView({
                ...external.viewDescriptor,
                dimension: "2d",
                mipLevelCount: 1,
                arrayLayerCount: 1
              })
            : this.context.getCurrentTexture().createView(),
          clearValue: clearColor
            ? {
                r: this._pendingClearColor.r,
                g: this._pendingClearColor.g,
                b: this._pendingClearColor.b,
                a: this._pendingClearColor.a
              }
            : undefined,
          loadOp: clearColor ? "clear" : "load",
          storeOp: "store"
        }
      ],
      depthStencilAttachment: format
        ? {
            view: (external?.depthStencil ?? this._mainDepthTexture)!.createView({
              dimension: "2d",
              baseArrayLayer: external?.viewDescriptor.baseArrayLayer,
              baseMipLevel: external?.viewDescriptor.baseMipLevel,
              arrayLayerCount: 1,
              mipLevelCount: 1
            }),
            depthClearValue: clearDepth && hasDepth ? 1 : undefined,
            depthLoadOp: hasDepth ? (clearDepth ? "clear" : "load") : undefined,
            depthStoreOp: hasDepth ? "store" : undefined,
            stencilClearValue: clearStencil && hasStencil ? 0 : undefined,
            stencilLoadOp: hasStencil ? (clearStencil ? "clear" : "load") : undefined,
            stencilStoreOp: hasStencil ? "store" : undefined
          }
        : undefined
    };
  }

  private _ensureMainDepthTexture(): void {
    const external = this._externalTarget?.color;
    const width = external?.width ?? this._canvas.width,
      height = external?.height ?? this._canvas.height;
    const layers = external?.depthOrArrayLayers ?? 1,
      samples = external?.sampleCount ?? 1,
      mips = external?.mipLevelCount ?? 1;
    const previous = this._mainDepthTexture;
    if (
      previous &&
      previous.width === width &&
      previous.height === height &&
      previous.depthOrArrayLayers === layers &&
      previous.sampleCount === samples &&
      previous.mipLevelCount === mips
    )
      return;
    if (previous) this._retireTexture(previous);
    this._mainDepthTexture = this.device.createTexture({
      label: "Galacean main depth-stencil",
      size: { width, height, depthOrArrayLayers: layers },
      sampleCount: samples,
      mipLevelCount: mips,
      format: this._surfaceDepthFormat!,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
    });
  }

  private _endRenderPass(final = false): void {
    const pass = this._renderPass;
    if (!pass) return;
    this._bundles.end();
    if (pass instanceof WebGPUDeferredPass) {
      const resolve =
        final && this._colorStore === RenderPassStoreAction.Resolve && this._getAttachmentState().sampleCount > 1;
      pass.end(
        this._commandEncoder!,
        resolve || (final && this._colorStore === RenderPassStoreAction.Discard),
        final && this._depthStore === RenderPassStoreAction.Discard,
        resolve
      );
    } else pass.end();
    this._renderPass = undefined;
  }

  private _endComputePass(): void {
    if (this._computePass) {
      this._computePass.end();
      this._computePass = undefined;
    }
  }

  private _endCurrentPass(): void {
    this._endRenderPass();
    this._endComputePass();
  }

  private _resetDrawBindings(): void {
    this._appliedGroups.length = this._vertexBuffers.length = 0;
    this._indexBuffer = undefined;
    this._appliedRenderPipeline = undefined;
  }
  private _resetRenderPassState(): void {
    this._resetDrawBindings();
    this._viewportDirty = true;
    this._scissorDirty = true;
    this._appliedBlendConstant.r = NaN;
    this._appliedStencilReference = undefined;
  }
}
