import type { Camera } from "../../Camera";
import { PipelineStage } from "../../RenderPipeline/enums/PipelineStage";
import type { Material } from "../../material";
import { RenderQueueType, ShaderMacro, ShaderProperty, ShaderTagKey } from "../../shader";
import type { ScreenSpaceReflectionProfiler } from "./ScreenSpaceReflectionProfiler";
import { ScreenSpaceReflectionUpsamplingMode } from "./enums/ScreenSpaceReflectionUpsamplingMode";
import { ScreenSpaceReflectionActivationMode } from "./enums/ScreenSpaceReflectionActivationMode";
import { ScreenSpaceReflectionDebugMode } from "./enums/ScreenSpaceReflectionDebugMode";
import { ScreenSpaceReflectionQuality } from "./enums/ScreenSpaceReflectionQuality";
import { ScreenSpaceReflectionReceiverMode } from "./enums/ScreenSpaceReflectionReceiverMode";
import { ScreenSpaceReflectionReceiverPolicy } from "./enums/ScreenSpaceReflectionReceiverPolicy";

/** Receiver phase whose trace shape is owned by one scoped consumer request. */
export type ScreenSpaceReflectionConsumerReceiverMode =
  | ScreenSpaceReflectionReceiverMode.OpaqueComposite
  | ScreenSpaceReflectionReceiverMode.TransparentSampleOnly;

/** Optional camera-level settings requested by one screen-space reflection consumer. */
export interface ScreenSpaceReflectionConsumerRequest {
  /** Whole-request arbitration priority. Greater values win; defaults to `0`. */
  readonly priority?: number;
  /**
   * Optional receiver phase scope for trace-shape settings. Unscoped requests
   * retain the legacy camera-wide behavior. Intensity remains camera-global.
   */
  readonly receiverMode?: ScreenSpaceReflectionConsumerReceiverMode;
  readonly quality?: ScreenSpaceReflectionQuality;
  /** Linear trace-buffer scale. `0.5` traces one quarter as many pixels as full resolution. */
  readonly resolutionScale?: number;
  readonly upsamplingMode?: ScreenSpaceReflectionUpsamplingMode;
  readonly intensity?: number;
  readonly maxRayDistance?: number;
  /** World-space distance over which a ray fades before reaching its maximum length. */
  readonly rayLengthFade?: number;
  /** Maximum linear-march samples per receiver pixel. */
  readonly maxRaySteps?: number;
  /** Binary-search iterations used to refine a candidate depth crossing. */
  readonly hitRefinementSteps?: number;
  /** Near-field hit-thickness floor in metres; the trace expands it with linear depth. */
  readonly thickness?: number;
  readonly maxRoughness?: number;
  readonly edgeFade?: number;
}

/** Settings resolved from the manual camera state and all active consumer requests. */
export interface ScreenSpaceReflectionResolvedSettings {
  readonly quality: ScreenSpaceReflectionQuality;
  readonly resolutionScale: number;
  readonly upsamplingMode: ScreenSpaceReflectionUpsamplingMode;
  readonly intensity: number;
  readonly maxRayDistance: number;
  readonly rayLengthFade: number;
  readonly maxRaySteps: number;
  readonly hitRefinementSteps: number;
  /** Near-field hit-thickness floor in metres; the trace expands it with linear depth. */
  readonly thickness: number;
  readonly maxRoughness: number;
  readonly edgeFade: number;
}

/** Phase-local trace shape; intensity remains camera-global. */
export interface ScreenSpaceReflectionTraceSettings {
  readonly quality: ScreenSpaceReflectionQuality;
  readonly resolutionScale: number;
  readonly upsamplingMode: ScreenSpaceReflectionUpsamplingMode;
  readonly maxRayDistance: number;
  readonly rayLengthFade: number;
  readonly maxRaySteps: number;
  readonly hitRefinementSteps: number;
  /** Near-field hit-thickness floor in metres; the trace expands it with linear depth. */
  readonly thickness: number;
  readonly maxRoughness: number;
  readonly edgeFade: number;
}

/** Why a material cannot be registered as an SSR receiver. */
export type ScreenSpaceReflectionMaterialReceiverUnsupportedReason =
  | "missing-screen-space-reflection-surface-pass"
  | "screen-space-reflection-receiver-contract-not-in-active-subshader"
  | "unsupported-screen-space-reflection-receiver-contract"
  | "unsupported-screen-space-reflection-material-lobes";

/** Query result for a material's explicit SSR receiver contract. */
export interface ScreenSpaceReflectionMaterialReceiverCapability {
  readonly supported: boolean;
  readonly contract: string | null;
  readonly unsupportedReason: ScreenSpaceReflectionMaterialReceiverUnsupportedReason | null;
}

/** Read-only runtime state for a camera's screen-space reflection feature. */
export interface ScreenSpaceReflectionMetrics {
  readonly activationMode: ScreenSpaceReflectionActivationMode;
  readonly receiverPolicy: ScreenSpaceReflectionReceiverPolicy;
  /** Whether the camera-global gate currently permits SSR work. */
  readonly globalEnabled: boolean;
  readonly requestedByManual: boolean;
  readonly requestedByConsumers: boolean;
  readonly requested: boolean;
  /** Whether SSR remains available after support checks and runtime failures. Submitted work is counted separately. */
  readonly effective: boolean;
  readonly supported: boolean;
  readonly activeConsumerLeaseCount: number;
  readonly selectedConsumerLabel: string | null;
  readonly selectedConsumerPriority: number | null;
  readonly resolvedSettings: ScreenSpaceReflectionResolvedSettings;
  /** Trace settings actually used by the opaque composite phase. */
  readonly opaqueResolvedSettings: ScreenSpaceReflectionResolvedSettings;
  /** Trace settings actually used by the transparent sample-only phase. */
  readonly transparentResolvedSettings: ScreenSpaceReflectionResolvedSettings;
  readonly selectedOpaqueConsumerLabel: string | null;
  readonly selectedOpaqueConsumerPriority: number | null;
  readonly selectedTransparentConsumerLabel: string | null;
  readonly selectedTransparentConsumerPriority: number | null;
  readonly width: number;
  readonly height: number;
  readonly opaqueReceiverElementCount: number;
  readonly transparentReceiverElementCount: number;
  readonly maskedReceiverElementCount: number;
  readonly surfacePassDrawCount: number;
  readonly opaqueSurfacePassDrawCount: number;
  readonly transparentSurfacePassDrawCount: number;
  readonly tracePassCount: number;
  readonly sceneCopyPassCount: number;
  readonly filterPassCount: number;
  readonly upsamplePassCount: number;
  /** Actual fullscreen draws, including scene copy and filtering; excludes geometry draws and mip generation. */
  readonly fullscreenPassCount: number;
  readonly compositePassCount: number;
  readonly renderTargetCount: number;
  readonly renderTextureCount: number;
  readonly renderBufferCount: number;
  readonly retainedRenderTargetCount: number;
  readonly estimatedTextureBytes: number;
  readonly estimatedRenderBufferBytes: number;
  readonly estimatedBytes: number;
  readonly unsupportedReason: string | null;
  readonly inactiveReason: string | null;
}

/** A camera-local request for screen-space reflection. */
export interface ScreenSpaceReflectionConsumerLease {
  readonly label: string;
  /** Immutable, sanitized request snapshot currently owned by this lease. */
  readonly request: ScreenSpaceReflectionConsumerRequest;
  readonly active: boolean;
  /** Atomically replace this lease's whole request. Returns `false` after release/destruction. */
  update(request?: Readonly<ScreenSpaceReflectionConsumerRequest>): boolean;
  /** Release this request. Calling this method more than once has no effect. */
  release(): void;
}

interface MutableScreenSpaceReflectionMetrics {
  activationMode: ScreenSpaceReflectionActivationMode;
  receiverPolicy: ScreenSpaceReflectionReceiverPolicy;
  globalEnabled: boolean;
  requestedByManual: boolean;
  requestedByConsumers: boolean;
  requested: boolean;
  effective: boolean;
  supported: boolean;
  activeConsumerLeaseCount: number;
  selectedConsumerLabel: string | null;
  selectedConsumerPriority: number | null;
  resolvedSettings: ScreenSpaceReflectionResolvedSettings;
  opaqueResolvedSettings: ScreenSpaceReflectionResolvedSettings;
  transparentResolvedSettings: ScreenSpaceReflectionResolvedSettings;
  selectedOpaqueConsumerLabel: string | null;
  selectedOpaqueConsumerPriority: number | null;
  selectedTransparentConsumerLabel: string | null;
  selectedTransparentConsumerPriority: number | null;
  width: number;
  height: number;
  opaqueReceiverElementCount: number;
  transparentReceiverElementCount: number;
  maskedReceiverElementCount: number;
  surfacePassDrawCount: number;
  opaqueSurfacePassDrawCount: number;
  transparentSurfacePassDrawCount: number;
  tracePassCount: number;
  sceneCopyPassCount: number;
  filterPassCount: number;
  upsamplePassCount: number;
  fullscreenPassCount: number;
  compositePassCount: number;
  renderTargetCount: number;
  renderTextureCount: number;
  renderBufferCount: number;
  retainedRenderTargetCount: number;
  estimatedTextureBytes: number;
  estimatedRenderBufferBytes: number;
  estimatedBytes: number;
  unsupportedReason: string | null;
  inactiveReason: string | null;
}

interface ScreenSpaceReflectionRenderStats {
  width: number;
  height: number;
  opaqueSurfacePassDrawCount: number;
  transparentSurfacePassDrawCount: number;
  tracePassCount: number;
  sceneCopyPassCount: number;
  filterPassCount: number;
  upsamplePassCount: number;
  fullscreenPassCount: number;
  compositePassCount: number;
  renderTargetCount: number;
  renderTextureCount: number;
  renderBufferCount: number;
  retainedRenderTargetCount: number;
  estimatedTextureBytes: number;
  estimatedRenderBufferBytes: number;
  estimatedBytes: number;
}

interface MutableScreenSpaceReflectionResolvedSettings {
  quality: ScreenSpaceReflectionQuality;
  resolutionScale: number;
  upsamplingMode: ScreenSpaceReflectionUpsamplingMode;
  intensity: number;
  maxRayDistance: number;
  rayLengthFade: number;
  maxRaySteps: number;
  hitRefinementSteps: number;
  thickness: number;
  maxRoughness: number;
  edgeFade: number;
}

class ScreenSpaceReflectionLease implements ScreenSpaceReflectionConsumerLease {
  private _active = true;
  private _request: ScreenSpaceReflectionConsumerRequest;

  get active(): boolean {
    return this._active && this._owner !== null;
  }

  get request(): ScreenSpaceReflectionConsumerRequest {
    return this._request;
  }

  constructor(
    private _owner: ScreenSpaceReflection | null,
    public readonly label: string,
    request: ScreenSpaceReflectionConsumerRequest
  ) {
    this._request = request;
  }

  update(request?: Readonly<ScreenSpaceReflectionConsumerRequest>): boolean {
    const owner = this._owner;
    if (!this._active || !owner) return false;
    this._request = ScreenSpaceReflection._sanitizeConsumerRequest(request);
    owner._updateConsumer(this);
    return true;
  }

  release(): void {
    if (!this._active) return;
    this._active = false;
    const owner = this._owner;
    this._owner = null;
    owner?._releaseConsumer(this);
  }

  /** @internal */
  _invalidate(): void {
    this._active = false;
    this._owner = null;
  }
}

/**
 * Camera-owned screen-space reflection settings and shared consumer ownership.
 *
 * In {@link ScreenSpaceReflectionActivationMode.Auto}, the feature is requested
 * when either {@link enabled} is true or at least one consumer lease is active.
 * ForceOn and ForceOff override those request sources without mutating them.
 * The render pipeline remains the sole owner of GPU resources and updates
 * {@link metrics} after support checks and rendering.
 *
 * Consumer settings are sanitized and selected as one indivisible request per
 * receiver phase. Unscoped consumers retain the legacy camera-wide behavior.
 * Higher `priority` wins; ties use ascending label and then a canonical request
 * key, so acquisition order cannot synthesize or change the effective group.
 * Omitted fields follow the current manual camera value. Manual settings are
 * restored when the final consumer releases its lease.
 */
export class ScreenSpaceReflection {
  /** Optional, caller-owned instrumentation. Disabled by default and not copied with cameras. */
  profiler: ScreenSpaceReflectionProfiler | null = null;

  private static readonly _presets: readonly Readonly<ScreenSpaceReflectionTraceSettings>[] = [
    Object.freeze({
      quality: ScreenSpaceReflectionQuality.Low,
      resolutionScale: 0.25,
      upsamplingMode: ScreenSpaceReflectionUpsamplingMode.Bilinear,
      maxRayDistance: 20,
      rayLengthFade: 1,
      maxRaySteps: 16,
      hitRefinementSteps: 2,
      thickness: 0.2,
      maxRoughness: 0.7,
      edgeFade: 0.1
    }),
    Object.freeze({
      quality: ScreenSpaceReflectionQuality.Medium,
      resolutionScale: 0.5,
      upsamplingMode: ScreenSpaceReflectionUpsamplingMode.Bilinear,
      maxRayDistance: 30,
      rayLengthFade: 1,
      maxRaySteps: 32,
      hitRefinementSteps: 3,
      thickness: 0.2,
      maxRoughness: 0.7,
      edgeFade: 0.1
    }),
    Object.freeze({
      quality: ScreenSpaceReflectionQuality.High,
      resolutionScale: 1,
      upsamplingMode: ScreenSpaceReflectionUpsamplingMode.GaussianBilateral,
      maxRayDistance: 30,
      rayLengthFade: 1,
      maxRaySteps: 64,
      hitRefinementSteps: 5,
      thickness: 0.2,
      maxRoughness: 0.7,
      edgeFade: 0.1
    })
  ];

  /** Complete trace/reconstruction budget, also usable in consumer requests or phase overrides. */
  static getQualityPreset(quality: ScreenSpaceReflectionQuality): Readonly<ScreenSpaceReflectionTraceSettings> {
    return ScreenSpaceReflection._presets[ScreenSpaceReflection._sanitizeQuality(quality)];
  }

  /** Apply a complete manual budget without changing activation, consumers, phase overrides or intensity. */
  applyQualityPreset(quality: ScreenSpaceReflectionQuality): void {
    const preset = ScreenSpaceReflection.getQualityPreset(quality);
    this._quality = preset.quality;
    this._resolutionScale = preset.resolutionScale;
    this._upsamplingMode = preset.upsamplingMode;
    this._maxRayDistance = preset.maxRayDistance;
    this._rayLengthFade = preset.rayLengthFade;
    this._maxRaySteps = preset.maxRaySteps;
    this._hitRefinementSteps = preset.hitRefinementSteps;
    this._thickness = preset.thickness;
    this._maxRoughness = preset.maxRoughness;
    this._edgeFade = preset.edgeFade;
    this._resolveSettings();
  }

  /** Shader pass tag used to declare the versioned receiver output contract. */
  static readonly MATERIAL_RECEIVER_CONTRACT_TAG = "screenSpaceReflectionReceiver";
  /** Current MRT surface contract preserving a colored material response. */
  static readonly MATERIAL_RECEIVER_CONTRACT = "ColorResponseV2";

  /** @internal */
  static readonly _cameraTextureProperty = ShaderProperty.getByName("camera_ScreenSpaceReflectionTexture");
  /** @internal */
  static readonly _cameraIntensityProperty = ShaderProperty.getByName("camera_ScreenSpaceReflectionIntensity");
  /** @internal */
  static readonly _receiverModeProperty = ShaderProperty.getByName("material_ScreenSpaceReflectionMode");
  /** @internal */
  static readonly _receiverIntensityProperty = ShaderProperty.getByName("material_ScreenSpaceReflectionIntensity");
  private static readonly _roughnessProperty = ShaderProperty.getByName("material_Roughness");
  private static readonly _roughnessMetallicTextureProperty = ShaderProperty.getByName(
    "material_RoughnessMetallicTexture"
  );
  /** @internal */
  // Kept only to clear state serialized by the former macro-based registration.
  // Receiver ownership itself is ordinary Material state and never affects program variants.
  private static readonly _legacyReceiverMacro = ShaderMacro.getByName("MATERIAL_IS_SCREEN_SPACE_REFLECTION_RECEIVER");
  private static readonly _unsupportedLobeMacros = [
    ShaderMacro.getByName("MATERIAL_ENABLE_CLEAR_COAT"),
    ShaderMacro.getByName("MATERIAL_ENABLE_ANISOTROPY"),
    ShaderMacro.getByName("MATERIAL_ENABLE_IRIDESCENCE"),
    ShaderMacro.getByName("MATERIAL_ENABLE_SHEEN"),
    ShaderMacro.getByName("MATERIAL_ENABLE_TRANSMISSION")
  ] as const;
  private static readonly _pipelineStageTag = ShaderTagKey.getByName("pipelineStage");
  private static readonly _receiverContractTag = ShaderTagKey.getByName(
    ScreenSpaceReflection.MATERIAL_RECEIVER_CONTRACT_TAG
  );

  private _activationMode = ScreenSpaceReflectionActivationMode.Auto;
  private _receiverPolicy = ScreenSpaceReflectionReceiverPolicy.ExplicitOnly;
  private _enabled = false;
  private _quality = ScreenSpaceReflectionQuality.Medium;
  private _resolutionScale = 1;
  private _upsamplingMode = ScreenSpaceReflectionUpsamplingMode.GaussianBilateral;
  private _intensity = 1;
  private _maxRayDistance = 20;
  private _rayLengthFade = 1;
  private _maxRaySteps = 32;
  private _hitRefinementSteps = 3;
  private _thickness = 0.2;
  private _maxRoughness = 0.7;
  private _edgeFade = 0.1;
  private _debugMode = ScreenSpaceReflectionDebugMode.None;
  private _destroyed = false;
  private readonly _leases = new Set<ScreenSpaceReflectionLease>();
  private _opaqueTraceSettingsOverride: Readonly<Partial<ScreenSpaceReflectionTraceSettings>> | null = null;
  private _transparentTraceSettingsOverride: Readonly<Partial<ScreenSpaceReflectionTraceSettings>> | null = null;
  private readonly _resolvedSettingsState: MutableScreenSpaceReflectionResolvedSettings = {
    quality: ScreenSpaceReflectionQuality.Medium,
    resolutionScale: 1,
    upsamplingMode: ScreenSpaceReflectionUpsamplingMode.GaussianBilateral,
    intensity: 1,
    maxRayDistance: 20,
    rayLengthFade: 1,
    maxRaySteps: 32,
    hitRefinementSteps: 3,
    thickness: 0.2,
    maxRoughness: 0.7,
    edgeFade: 0.1
  };
  private readonly _opaqueResolvedSettingsState: MutableScreenSpaceReflectionResolvedSettings = {
    quality: ScreenSpaceReflectionQuality.Medium,
    resolutionScale: 1,
    upsamplingMode: ScreenSpaceReflectionUpsamplingMode.GaussianBilateral,
    intensity: 1,
    maxRayDistance: 20,
    rayLengthFade: 1,
    maxRaySteps: 32,
    hitRefinementSteps: 3,
    thickness: 0.2,
    maxRoughness: 0.7,
    edgeFade: 0.1
  };
  private readonly _transparentResolvedSettingsState: MutableScreenSpaceReflectionResolvedSettings = {
    quality: ScreenSpaceReflectionQuality.Medium,
    resolutionScale: 1,
    upsamplingMode: ScreenSpaceReflectionUpsamplingMode.GaussianBilateral,
    intensity: 1,
    maxRayDistance: 20,
    rayLengthFade: 1,
    maxRaySteps: 32,
    hitRefinementSteps: 3,
    thickness: 0.2,
    maxRoughness: 0.7,
    edgeFade: 0.1
  };
  private readonly _metricsState: MutableScreenSpaceReflectionMetrics = {
    activationMode: ScreenSpaceReflectionActivationMode.Auto,
    receiverPolicy: ScreenSpaceReflectionReceiverPolicy.ExplicitOnly,
    globalEnabled: true,
    requestedByManual: false,
    requestedByConsumers: false,
    requested: false,
    effective: false,
    supported: false,
    activeConsumerLeaseCount: 0,
    selectedConsumerLabel: null,
    selectedConsumerPriority: null,
    resolvedSettings: this._resolvedSettingsState,
    opaqueResolvedSettings: this._opaqueResolvedSettingsState,
    transparentResolvedSettings: this._transparentResolvedSettingsState,
    selectedOpaqueConsumerLabel: null,
    selectedOpaqueConsumerPriority: null,
    selectedTransparentConsumerLabel: null,
    selectedTransparentConsumerPriority: null,
    width: 0,
    height: 0,
    opaqueReceiverElementCount: 0,
    transparentReceiverElementCount: 0,
    maskedReceiverElementCount: 0,
    surfacePassDrawCount: 0,
    opaqueSurfacePassDrawCount: 0,
    transparentSurfacePassDrawCount: 0,
    tracePassCount: 0,
    sceneCopyPassCount: 0,
    filterPassCount: 0,
    upsamplePassCount: 0,
    fullscreenPassCount: 0,
    compositePassCount: 0,
    renderTargetCount: 0,
    renderTextureCount: 0,
    renderBufferCount: 0,
    retainedRenderTargetCount: 0,
    estimatedTextureBytes: 0,
    estimatedRenderBufferBytes: 0,
    estimatedBytes: 0,
    unsupportedReason: null,
    inactiveReason: "not-requested"
  };

  /** Highest-priority camera-global activation policy. */
  get activationMode(): ScreenSpaceReflectionActivationMode {
    return this._activationMode;
  }

  set activationMode(value: ScreenSpaceReflectionActivationMode) {
    this._activationMode = ScreenSpaceReflection._sanitizeActivationMode(value);
    this._refreshState();
  }

  /** How standard PBR materials whose receiver mode is Auto are resolved. */
  get receiverPolicy(): ScreenSpaceReflectionReceiverPolicy {
    return this._receiverPolicy;
  }

  set receiverPolicy(value: ScreenSpaceReflectionReceiverPolicy) {
    this._receiverPolicy = ScreenSpaceReflection._sanitizeReceiverPolicy(value);
    this._metricsState.receiverPolicy = this._receiverPolicy;
  }

  /** Whether this camera explicitly requests SSR. Consumer leases are independent. */
  get enabled(): boolean {
    return this._enabled;
  }

  set enabled(value: boolean) {
    this._enabled = !!value;
    this._refreshState();
  }

  /** Ray-step budget only. Use applyQualityPreset() to also change resolution and reconstruction. */
  get quality(): ScreenSpaceReflectionQuality {
    return this._quality;
  }

  set quality(value: ScreenSpaceReflectionQuality) {
    this._quality = ScreenSpaceReflection._sanitizeQuality(value);
    const tuning = ScreenSpaceReflection._qualityTuning(this._quality);
    this._maxRaySteps = tuning.maxRaySteps;
    this._hitRefinementSteps = tuning.hitRefinementSteps;
    this._resolveSettings();
  }

  /** Linear resolution used by the trace buffer, clamped to [0.25, 1]. */
  get resolutionScale(): number {
    return this._resolutionScale;
  }

  set resolutionScale(value: number) {
    this._resolutionScale = ScreenSpaceReflection._clampFinite(value, 0.25, 1, 1);
    this._resolveSettings();
  }

  /** Reconstruction used below full resolution; defaults to the legacy Gaussian + bilateral path. */
  get upsamplingMode(): ScreenSpaceReflectionUpsamplingMode {
    return this._upsamplingMode;
  }

  set upsamplingMode(value: ScreenSpaceReflectionUpsamplingMode) {
    this._upsamplingMode = ScreenSpaceReflection._sanitizeUpsamplingMode(value);
    this._resolveSettings();
  }

  /** Global replacement weight for this camera, clamped to [0, 1]. */
  get intensity(): number {
    return this._intensity;
  }

  set intensity(value: number) {
    this._intensity = ScreenSpaceReflection._clampFinite(value, 0, 1, 1);
    this._resolveSettings();
  }

  get maxRayDistance(): number {
    return this._maxRayDistance;
  }

  set maxRayDistance(value: number) {
    this._maxRayDistance = Math.max(0.0001, Number.isFinite(value) ? value : 20);
    this._resolveSettings();
  }

  /** World-space fade distance before the maximum ray length. */
  get rayLengthFade(): number {
    return this._rayLengthFade;
  }

  set rayLengthFade(value: number) {
    this._rayLengthFade = Math.max(0, Number.isFinite(value) ? value : 1);
    this._resolveSettings();
  }

  /** Maximum linear-march samples, clamped to the shader's static loop bound. */
  get maxRaySteps(): number {
    return this._maxRaySteps;
  }

  set maxRaySteps(value: number) {
    this._maxRaySteps = ScreenSpaceReflection._clampInteger(value, 1, 64, 32);
    this._resolveSettings();
  }

  /** Binary-search iterations used to refine one candidate hit. */
  get hitRefinementSteps(): number {
    return this._hitRefinementSteps;
  }

  set hitRefinementSteps(value: number) {
    this._hitRefinementSteps = ScreenSpaceReflection._clampInteger(value, 0, 5, 3);
    this._resolveSettings();
  }

  /** Near-field hit-thickness floor in metres; the trace expands it with linear depth. */
  get thickness(): number {
    return this._thickness;
  }

  set thickness(value: number) {
    this._thickness = Math.max(0.0001, Number.isFinite(value) ? value : 0.2);
    this._resolveSettings();
  }

  get maxRoughness(): number {
    return this._maxRoughness;
  }

  set maxRoughness(value: number) {
    this._maxRoughness = ScreenSpaceReflection._clampFinite(value, 0, 1, 0.7);
    this._resolveSettings();
  }

  get edgeFade(): number {
    return this._edgeFade;
  }

  set edgeFade(value: number) {
    this._edgeFade = ScreenSpaceReflection._clampFinite(value, 0, 0.5, 0.1);
    this._resolveSettings();
  }

  get debugMode(): ScreenSpaceReflectionDebugMode {
    return this._debugMode;
  }

  set debugMode(value: ScreenSpaceReflectionDebugMode) {
    this._debugMode = value;
  }

  get effective(): boolean {
    return this._metricsState.effective;
  }

  get supported(): boolean {
    return this._metricsState.supported;
  }

  get unsupportedReason(): string | null {
    return this._metricsState.unsupportedReason;
  }

  get metrics(): ScreenSpaceReflectionMetrics {
    return this._metricsState;
  }

  /** Resolve the trace settings that one receiver phase will actually use. */
  getResolvedSettings(receiverMode: ScreenSpaceReflectionConsumerReceiverMode): ScreenSpaceReflectionResolvedSettings {
    ScreenSpaceReflection._requireConsumerReceiverMode(receiverMode);
    return receiverMode === ScreenSpaceReflectionReceiverMode.TransparentSampleOnly
      ? this._transparentResolvedSettingsState
      : this._opaqueResolvedSettingsState;
  }

  /** Read the optional camera-owned override for one receiver trace phase. */
  getReceiverTraceSettingsOverride(
    receiverMode: ScreenSpaceReflectionConsumerReceiverMode
  ): Readonly<Partial<ScreenSpaceReflectionTraceSettings>> | null {
    ScreenSpaceReflection._requireConsumerReceiverMode(receiverMode);
    return receiverMode === ScreenSpaceReflectionReceiverMode.TransparentSampleOnly
      ? this._transparentTraceSettingsOverride
      : this._opaqueTraceSettingsOverride;
  }

  /**
   * Override one receiver phase without changing the other phase or consumer
   * ownership. Passing `undefined` restores consumer/manual resolution.
   */
  setReceiverTraceSettingsOverride(
    receiverMode: ScreenSpaceReflectionConsumerReceiverMode,
    settings?: Readonly<Partial<ScreenSpaceReflectionTraceSettings>>
  ): void {
    ScreenSpaceReflection._requireConsumerReceiverMode(receiverMode);
    const sanitized = settings ? ScreenSpaceReflection._sanitizeTraceSettingsOverride(settings) : null;
    if (receiverMode === ScreenSpaceReflectionReceiverMode.TransparentSampleOnly) {
      this._transparentTraceSettingsOverride = sanitized;
    } else {
      this._opaqueTraceSettingsOverride = sanitized;
    }
    this._resolveSettings();
  }

  /** Acquire an independent camera-local consumer request. */
  acquireConsumer(
    label: string,
    request?: Readonly<ScreenSpaceReflectionConsumerRequest>
  ): ScreenSpaceReflectionConsumerLease {
    const lease = new ScreenSpaceReflectionLease(
      this._destroyed ? null : this,
      label,
      ScreenSpaceReflection._sanitizeConsumerRequest(request)
    );
    if (!this._destroyed) {
      this._leases.add(lease);
      this._refreshState();
    } else {
      lease._invalidate();
    }
    return lease;
  }

  /** Query whether a material exposes the versioned SSR surface pass contract. */
  static getMaterialReceiverCapability(material: Material): ScreenSpaceReflectionMaterialReceiverCapability {
    const subShaders = material.shader?.subShaders;
    const activeSubShader = subShaders?.[0];
    let activeHasSurfacePass = false;
    let activeHasIncompatibleContract = false;
    let activeIncompatibleContract: string | null = null;
    if (activeSubShader) {
      const passes = activeSubShader.passes;
      for (let i = 0, n = passes.length; i < n; i++) {
        const pass = passes[i];
        if (pass.getTagValue(ScreenSpaceReflection._pipelineStageTag) !== PipelineStage.ScreenSpaceReflectionSurface) {
          continue;
        }
        activeHasSurfacePass = true;
        const contract = (pass.getTagValue(ScreenSpaceReflection._receiverContractTag) as string | null) ?? null;
        if (!activeHasIncompatibleContract && contract !== ScreenSpaceReflection.MATERIAL_RECEIVER_CONTRACT) {
          activeHasIncompatibleContract = true;
          activeIncompatibleContract = contract;
        }
      }
    }

    if (activeHasSurfacePass) {
      if (!activeHasIncompatibleContract) {
        const macroCollection = material.shaderData._macroCollection;
        const unsupportedLobeMacros = ScreenSpaceReflection._unsupportedLobeMacros;
        for (let i = 0, n = unsupportedLobeMacros.length; i < n; i++) {
          if (macroCollection.isEnable(unsupportedLobeMacros[i])) {
            return {
              supported: false,
              contract: ScreenSpaceReflection.MATERIAL_RECEIVER_CONTRACT,
              unsupportedReason: "unsupported-screen-space-reflection-material-lobes"
            };
          }
        }
        return {
          supported: true,
          contract: ScreenSpaceReflection.MATERIAL_RECEIVER_CONTRACT,
          unsupportedReason: null
        };
      }
      return {
        supported: false,
        contract: activeIncompatibleContract,
        unsupportedReason: "unsupported-screen-space-reflection-receiver-contract"
      };
    }

    // Render elements are built from subShaders[0]. A valid declaration elsewhere
    // is useful diagnostic information, but cannot be advertised as renderable.
    if (subShaders) {
      for (let i = 1, n = subShaders.length; i < n; i++) {
        const passes = subShaders[i].passes;
        for (let j = 0, m = passes.length; j < m; j++) {
          const pass = passes[j];
          if (
            pass.getTagValue(ScreenSpaceReflection._pipelineStageTag) === PipelineStage.ScreenSpaceReflectionSurface &&
            pass.getTagValue(ScreenSpaceReflection._receiverContractTag) ===
              ScreenSpaceReflection.MATERIAL_RECEIVER_CONTRACT
          ) {
            return {
              supported: false,
              contract: ScreenSpaceReflection.MATERIAL_RECEIVER_CONTRACT,
              unsupportedReason: "screen-space-reflection-receiver-contract-not-in-active-subshader"
            };
          }
        }
      }
    }

    return {
      supported: false,
      contract: null,
      unsupportedReason: "missing-screen-space-reflection-surface-pass"
    };
  }

  /**
   * Explicitly configure a material receiver.
   * @returns `false` when the material does not implement the current receiver contract.
   */
  static setMaterialReceiver(
    material: Material,
    mode: ScreenSpaceReflectionReceiverMode,
    intensity: number = 1
  ): boolean {
    const capability = ScreenSpaceReflection.getMaterialReceiverCapability(material);
    const validMode =
      mode === ScreenSpaceReflectionReceiverMode.Disabled ||
      mode === ScreenSpaceReflectionReceiverMode.OpaqueComposite ||
      mode === ScreenSpaceReflectionReceiverMode.TransparentSampleOnly ||
      (mode === ScreenSpaceReflectionReceiverMode.Auto && material.shader?.name === "PBR");
    if (!capability.supported || !validMode) {
      ScreenSpaceReflection._disableMaterialReceiver(material);
      return false;
    }

    const receiverIntensity =
      mode === ScreenSpaceReflectionReceiverMode.Disabled ? 0 : ScreenSpaceReflection._clampFinite(intensity, 0, 1, 1);
    const explicitlyEnabled =
      (mode === ScreenSpaceReflectionReceiverMode.OpaqueComposite ||
        mode === ScreenSpaceReflectionReceiverMode.TransparentSampleOnly) &&
      receiverIntensity > 0;
    material.shaderData.setFloat(ScreenSpaceReflection._receiverModeProperty, mode);
    material.shaderData.setFloat(ScreenSpaceReflection._receiverIntensityProperty, receiverIntensity);
    material._screenSpaceReflectionReceiverRegistered = explicitlyEnabled;
    material.shaderData.disableMacro(ScreenSpaceReflection._legacyReceiverMacro);
    return true;
  }

  /** Return the effective explicit receiver mode, or Disabled for stale/unsupported state. */
  static getMaterialReceiverMode(material: Material): ScreenSpaceReflectionReceiverMode {
    const shaderData = material.shaderData;
    if (!material._screenSpaceReflectionReceiverRegistered) {
      return ScreenSpaceReflectionReceiverMode.Disabled;
    }
    if (!ScreenSpaceReflection.getMaterialReceiverCapability(material).supported) {
      return ScreenSpaceReflectionReceiverMode.Disabled;
    }
    const intensity = shaderData.getFloat(ScreenSpaceReflection._receiverIntensityProperty) ?? 0;
    if (intensity <= 0) return ScreenSpaceReflectionReceiverMode.Disabled;
    const mode = shaderData.getFloat(ScreenSpaceReflection._receiverModeProperty);
    return mode === ScreenSpaceReflectionReceiverMode.OpaqueComposite ||
      mode === ScreenSpaceReflectionReceiverMode.TransparentSampleOnly
      ? mode
      : ScreenSpaceReflectionReceiverMode.Disabled;
  }

  /** Whether this material is an explicitly registered receiver, optionally in one mode. */
  static isMaterialReceiver(material: Material, mode?: ScreenSpaceReflectionReceiverMode): boolean {
    const resolvedMode = ScreenSpaceReflection.getMaterialReceiverMode(material);
    return mode === undefined ? resolvedMode !== ScreenSpaceReflectionReceiverMode.Disabled : resolvedMode === mode;
  }

  /** @internal Resolve an explicit receiver or the camera-local standard PBR Auto policy. */
  _isMaterialReceiver(material: Material, renderQueueType: RenderQueueType): boolean {
    const explicitMode = ScreenSpaceReflection.getMaterialReceiverMode(material);
    if (explicitMode === ScreenSpaceReflectionReceiverMode.OpaqueComposite) {
      return renderQueueType !== RenderQueueType.Transparent;
    }
    if (explicitMode === ScreenSpaceReflectionReceiverMode.TransparentSampleOnly) {
      return renderQueueType === RenderQueueType.Transparent;
    }

    const shaderData = material.shaderData;
    if (
      shaderData.getFloat(ScreenSpaceReflection._receiverModeProperty) !== ScreenSpaceReflectionReceiverMode.Auto ||
      this._receiverPolicy !== ScreenSpaceReflectionReceiverPolicy.StandardPbrAuto ||
      renderQueueType === RenderQueueType.Transparent ||
      material.shader?.name !== "PBR" ||
      !ScreenSpaceReflection.getMaterialReceiverCapability(material).supported ||
      (shaderData.getFloat(ScreenSpaceReflection._receiverIntensityProperty) ?? 0) <= 0
    ) {
      return false;
    }

    // Static roughness can fail before draw submission. A roughness texture
    // remains eligible because the Surface pass applies the per-pixel gate.
    if (shaderData.getTexture(ScreenSpaceReflection._roughnessMetallicTextureProperty)) return true;
    const roughness = shaderData.getFloat(ScreenSpaceReflection._roughnessProperty);
    return roughness === undefined || roughness <= this._opaqueResolvedSettingsState.maxRoughness;
  }

  /** @internal */
  constructor(private readonly _camera: Camera) {
    _camera.shaderData.setFloat(ScreenSpaceReflection._cameraIntensityProperty, this._resolvedSettingsState.intensity);
    _camera.shaderData.setTexture(ScreenSpaceReflection._cameraTextureProperty, null);
  }

  /** @internal */
  _beginFrame(supported: boolean, unsupportedReason: string | null): boolean {
    const metrics = this._metricsState;
    this._refreshState();
    metrics.supported = supported;
    metrics.unsupportedReason = supported ? null : unsupportedReason;
    metrics.effective = !this._destroyed && metrics.requested && supported && this._resolvedSettingsState.intensity > 0;
    metrics.inactiveReason = metrics.effective
      ? null
      : !metrics.requested
        ? (metrics.inactiveReason ?? "not-requested")
        : supported
          ? "zero-intensity"
          : unsupportedReason;
    this._resetRenderStats();
    if (!metrics.effective) {
      this._camera.shaderData.setTexture(ScreenSpaceReflection._cameraTextureProperty, null);
    }
    return metrics.effective;
  }

  /** @internal Mark a runtime failure without discarding work already submitted this frame. */
  _failFrame(reason: string): void {
    const metrics = this._metricsState;
    metrics.supported = false;
    metrics.unsupportedReason = reason;
    metrics.effective = false;
    metrics.inactiveReason = reason;
    this._camera.shaderData.setTexture(ScreenSpaceReflection._cameraTextureProperty, null);
  }

  /** @internal */
  _skipFrame(inactiveReason: string): void {
    const metrics = this._metricsState;
    metrics.effective = false;
    metrics.inactiveReason = inactiveReason;
    metrics.unsupportedReason = null;
    this._camera.shaderData.setTexture(ScreenSpaceReflection._cameraTextureProperty, null);
    this._resetRenderStats();
  }

  /** @internal */
  _setReceiverElementCounts(opaqueCount: number, transparentCount: number, maskedCount: number = 0): void {
    this._metricsState.opaqueReceiverElementCount = opaqueCount;
    this._metricsState.transparentReceiverElementCount = transparentCount;
    this._metricsState.maskedReceiverElementCount = maskedCount;
  }

  /** @internal */
  _setRenderStats(stats: ScreenSpaceReflectionRenderStats): void {
    const metrics = this._metricsState;
    metrics.width = stats.width;
    metrics.height = stats.height;
    metrics.opaqueSurfacePassDrawCount = stats.opaqueSurfacePassDrawCount;
    metrics.transparentSurfacePassDrawCount = stats.transparentSurfacePassDrawCount;
    metrics.surfacePassDrawCount = stats.opaqueSurfacePassDrawCount + stats.transparentSurfacePassDrawCount;
    metrics.tracePassCount = stats.tracePassCount;
    metrics.sceneCopyPassCount = stats.sceneCopyPassCount;
    metrics.filterPassCount = stats.filterPassCount;
    metrics.upsamplePassCount = stats.upsamplePassCount;
    metrics.fullscreenPassCount = stats.fullscreenPassCount;
    metrics.compositePassCount = stats.compositePassCount;
    metrics.renderTargetCount = stats.renderTargetCount;
    metrics.renderTextureCount = stats.renderTextureCount;
    metrics.renderBufferCount = stats.renderBufferCount;
    metrics.retainedRenderTargetCount = stats.retainedRenderTargetCount;
    metrics.estimatedTextureBytes = stats.estimatedTextureBytes;
    metrics.estimatedRenderBufferBytes = stats.estimatedRenderBufferBytes;
    metrics.estimatedBytes = stats.estimatedBytes;
  }

  /** @internal */
  _releaseConsumer(lease: ScreenSpaceReflectionLease): void {
    this._leases.delete(lease);
    this._refreshState();
  }

  /** @internal */
  _updateConsumer(lease: ScreenSpaceReflectionLease): void {
    if (this._leases.has(lease)) this._refreshState();
  }

  /** @internal */
  _copySettingsFrom(source: ScreenSpaceReflection): void {
    this.activationMode = source.activationMode;
    this.receiverPolicy = source.receiverPolicy;
    this.enabled = source.enabled;
    this.quality = source.quality;
    this.resolutionScale = source.resolutionScale;
    this.upsamplingMode = source.upsamplingMode;
    this.intensity = source.intensity;
    this.maxRayDistance = source.maxRayDistance;
    this.rayLengthFade = source.rayLengthFade;
    this.maxRaySteps = source.maxRaySteps;
    this.hitRefinementSteps = source.hitRefinementSteps;
    this.thickness = source.thickness;
    this.maxRoughness = source.maxRoughness;
    this.edgeFade = source.edgeFade;
    this.debugMode = source.debugMode;
    this.setReceiverTraceSettingsOverride(
      ScreenSpaceReflectionReceiverMode.OpaqueComposite,
      source.getReceiverTraceSettingsOverride(ScreenSpaceReflectionReceiverMode.OpaqueComposite) ?? undefined
    );
    this.setReceiverTraceSettingsOverride(
      ScreenSpaceReflectionReceiverMode.TransparentSampleOnly,
      source.getReceiverTraceSettingsOverride(ScreenSpaceReflectionReceiverMode.TransparentSampleOnly) ?? undefined
    );
    this._camera.shaderData.setTexture(ScreenSpaceReflection._cameraTextureProperty, null);
    this._metricsState.supported = false;
    this._metricsState.effective = false;
    this._metricsState.unsupportedReason = null;
    this._metricsState.inactiveReason = this._metricsState.requested
      ? null
      : this._activationMode === ScreenSpaceReflectionActivationMode.ForceOff
        ? "disabled-by-global-switch"
        : "not-requested";
    this._resetRenderStats();
  }

  /** @internal */
  _destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this.profiler = null;
    for (const lease of this._leases) lease._invalidate();
    this._leases.clear();
    this._refreshState();
    this._metricsState.supported = false;
    this._metricsState.effective = false;
    this._metricsState.unsupportedReason = "camera-destroyed";
    this._metricsState.inactiveReason = "camera-destroyed";
    this._resetRenderStats();
  }

  private _refreshRequested(): void {
    const metrics = this._metricsState;
    const requestedByConsumers = this._leases.size > 0;
    metrics.activeConsumerLeaseCount = this._leases.size;
    metrics.activationMode = this._activationMode;
    metrics.receiverPolicy = this._receiverPolicy;
    metrics.globalEnabled = this._activationMode !== ScreenSpaceReflectionActivationMode.ForceOff;
    metrics.requestedByManual = this._enabled;
    metrics.requestedByConsumers = requestedByConsumers;
    switch (this._activationMode) {
      case ScreenSpaceReflectionActivationMode.ForceOn:
        metrics.requested = !this._destroyed;
        break;
      case ScreenSpaceReflectionActivationMode.ForceOff:
        metrics.requested = false;
        break;
      default:
        metrics.requested = !this._destroyed && (this._enabled || requestedByConsumers);
        break;
    }
    if (!metrics.requested) {
      metrics.effective = false;
      metrics.inactiveReason = this._destroyed
        ? "camera-destroyed"
        : this._activationMode === ScreenSpaceReflectionActivationMode.ForceOff
          ? "disabled-by-global-switch"
          : "not-requested";
      metrics.unsupportedReason = null;
      this._camera.shaderData.setTexture(ScreenSpaceReflection._cameraTextureProperty, null);
      this._resetRenderStats();
    }
  }

  private _refreshState(): void {
    this._refreshRequested();
    this._resolveSettings();
  }

  private _resolveSettings(): void {
    const resolved = this._resolvedSettingsState;
    let selectedLease: ScreenSpaceReflectionLease | null = null;
    // Auto preserves the hardened whole-request consumer arbitration. Forced
    // modes use the manual camera settings so the global control is stable and
    // does not mutate or release dormant consumer requests.
    if (this._activationMode === ScreenSpaceReflectionActivationMode.Auto) {
      for (const lease of this._leases) {
        if (!selectedLease || ScreenSpaceReflection._compareConsumerLeases(lease, selectedLease) < 0) {
          selectedLease = lease;
        }
      }
    }

    const request = selectedLease?.request;
    resolved.quality = request?.quality ?? this._quality;
    resolved.resolutionScale = request?.resolutionScale ?? this._resolutionScale;
    resolved.upsamplingMode = request?.upsamplingMode ?? this._upsamplingMode;
    resolved.intensity = request?.intensity ?? this._intensity;
    resolved.maxRayDistance = request?.maxRayDistance ?? this._maxRayDistance;
    resolved.rayLengthFade = request?.rayLengthFade ?? this._rayLengthFade;
    const requestQualityTuning =
      request?.quality !== undefined ? ScreenSpaceReflection._qualityTuning(request.quality) : null;
    resolved.maxRaySteps = request?.maxRaySteps ?? requestQualityTuning?.maxRaySteps ?? this._maxRaySteps;
    resolved.hitRefinementSteps =
      request?.hitRefinementSteps ?? requestQualityTuning?.hitRefinementSteps ?? this._hitRefinementSteps;
    resolved.thickness = request?.thickness ?? this._thickness;
    resolved.maxRoughness = request?.maxRoughness ?? this._maxRoughness;
    resolved.edgeFade = request?.edgeFade ?? this._edgeFade;
    this._metricsState.selectedConsumerLabel = selectedLease?.label ?? null;
    this._metricsState.selectedConsumerPriority = selectedLease ? (selectedLease.request.priority ?? 0) : null;
    const opaqueLease = this._resolveReceiverSettings(
      ScreenSpaceReflectionReceiverMode.OpaqueComposite,
      this._opaqueResolvedSettingsState
    );
    const transparentLease = this._resolveReceiverSettings(
      ScreenSpaceReflectionReceiverMode.TransparentSampleOnly,
      this._transparentResolvedSettingsState
    );
    this._metricsState.selectedOpaqueConsumerLabel = opaqueLease?.label ?? null;
    this._metricsState.selectedOpaqueConsumerPriority = opaqueLease ? (opaqueLease.request.priority ?? 0) : null;
    this._metricsState.selectedTransparentConsumerLabel = transparentLease?.label ?? null;
    this._metricsState.selectedTransparentConsumerPriority = transparentLease
      ? (transparentLease.request.priority ?? 0)
      : null;
    this._camera.shaderData.setFloat(ScreenSpaceReflection._cameraIntensityProperty, resolved.intensity);
    if (resolved.intensity <= 0 && this._metricsState.requested) {
      this._metricsState.effective = false;
      this._metricsState.inactiveReason = "zero-intensity";
      this._camera.shaderData.setTexture(ScreenSpaceReflection._cameraTextureProperty, null);
      this._resetRenderStats();
    }
  }

  private _resolveReceiverSettings(
    receiverMode: ScreenSpaceReflectionConsumerReceiverMode,
    resolved: MutableScreenSpaceReflectionResolvedSettings
  ): ScreenSpaceReflectionLease | null {
    let selectedLease: ScreenSpaceReflectionLease | null = null;
    for (const lease of this._leases) {
      const scopedMode = lease.request.receiverMode;
      const eligible =
        scopedMode === receiverMode ||
        (scopedMode === undefined && this._activationMode === ScreenSpaceReflectionActivationMode.Auto);
      if (eligible && (!selectedLease || ScreenSpaceReflection._compareConsumerLeases(lease, selectedLease) < 0)) {
        selectedLease = lease;
      }
    }

    const request = selectedLease?.request;
    const traceOverride =
      receiverMode === ScreenSpaceReflectionReceiverMode.TransparentSampleOnly
        ? this._transparentTraceSettingsOverride
        : this._opaqueTraceSettingsOverride;
    resolved.quality = traceOverride?.quality ?? request?.quality ?? this._quality;
    resolved.resolutionScale = traceOverride?.resolutionScale ?? request?.resolutionScale ?? this._resolutionScale;
    resolved.upsamplingMode = traceOverride?.upsamplingMode ?? request?.upsamplingMode ?? this._upsamplingMode;
    // Camera intensity remains one ordinary camera uniform for the whole frame.
    // Receiver scoping isolates trace shape without introducing phase-stale camera uniforms.
    resolved.intensity = this._resolvedSettingsState.intensity;
    resolved.maxRayDistance = traceOverride?.maxRayDistance ?? request?.maxRayDistance ?? this._maxRayDistance;
    resolved.rayLengthFade = traceOverride?.rayLengthFade ?? request?.rayLengthFade ?? this._rayLengthFade;
    const overrideQualityTuning =
      traceOverride?.quality !== undefined ? ScreenSpaceReflection._qualityTuning(traceOverride.quality) : null;
    const requestQualityTuning =
      request?.quality !== undefined ? ScreenSpaceReflection._qualityTuning(request.quality) : null;
    resolved.maxRaySteps =
      traceOverride?.maxRaySteps ??
      overrideQualityTuning?.maxRaySteps ??
      request?.maxRaySteps ??
      requestQualityTuning?.maxRaySteps ??
      this._maxRaySteps;
    resolved.hitRefinementSteps =
      traceOverride?.hitRefinementSteps ??
      overrideQualityTuning?.hitRefinementSteps ??
      request?.hitRefinementSteps ??
      requestQualityTuning?.hitRefinementSteps ??
      this._hitRefinementSteps;
    resolved.thickness = traceOverride?.thickness ?? request?.thickness ?? this._thickness;
    resolved.maxRoughness = traceOverride?.maxRoughness ?? request?.maxRoughness ?? this._maxRoughness;
    resolved.edgeFade = traceOverride?.edgeFade ?? request?.edgeFade ?? this._edgeFade;
    return selectedLease;
  }

  private _resetRenderStats(): void {
    const metrics = this._metricsState;
    metrics.width = 0;
    metrics.height = 0;
    metrics.opaqueReceiverElementCount = 0;
    metrics.transparentReceiverElementCount = 0;
    metrics.maskedReceiverElementCount = 0;
    metrics.surfacePassDrawCount = 0;
    metrics.opaqueSurfacePassDrawCount = 0;
    metrics.transparentSurfacePassDrawCount = 0;
    metrics.tracePassCount = 0;
    metrics.sceneCopyPassCount = 0;
    metrics.filterPassCount = 0;
    metrics.upsamplePassCount = 0;
    metrics.fullscreenPassCount = 0;
    metrics.compositePassCount = 0;
    metrics.renderTargetCount = 0;
    metrics.renderTextureCount = 0;
    metrics.renderBufferCount = 0;
    metrics.retainedRenderTargetCount = 0;
    metrics.estimatedTextureBytes = 0;
    metrics.estimatedRenderBufferBytes = 0;
    metrics.estimatedBytes = 0;
  }

  private static _clampFinite(value: number, min: number, max: number, fallback: number): number {
    return Math.max(min, Math.min(max, Number.isFinite(value) ? value : fallback));
  }

  private static _clampInteger(value: number, min: number, max: number, fallback: number): number {
    return Math.round(ScreenSpaceReflection._clampFinite(value, min, max, fallback));
  }

  private static _qualityTuning(quality: ScreenSpaceReflectionQuality): {
    readonly maxRaySteps: number;
    readonly hitRefinementSteps: number;
  } {
    switch (quality) {
      case ScreenSpaceReflectionQuality.Low:
        return { maxRaySteps: 16, hitRefinementSteps: 2 };
      case ScreenSpaceReflectionQuality.High:
        return { maxRaySteps: 64, hitRefinementSteps: 5 };
      default:
        return { maxRaySteps: 32, hitRefinementSteps: 3 };
    }
  }

  private static _sanitizeActivationMode(
    value: ScreenSpaceReflectionActivationMode
  ): ScreenSpaceReflectionActivationMode {
    switch (value) {
      case ScreenSpaceReflectionActivationMode.Auto:
      case ScreenSpaceReflectionActivationMode.ForceOn:
      case ScreenSpaceReflectionActivationMode.ForceOff:
        return value;
      default:
        return ScreenSpaceReflectionActivationMode.Auto;
    }
  }

  private static _sanitizeReceiverPolicy(
    value: ScreenSpaceReflectionReceiverPolicy
  ): ScreenSpaceReflectionReceiverPolicy {
    switch (value) {
      case ScreenSpaceReflectionReceiverPolicy.ExplicitOnly:
      case ScreenSpaceReflectionReceiverPolicy.StandardPbrAuto:
        return value;
      default:
        return ScreenSpaceReflectionReceiverPolicy.ExplicitOnly;
    }
  }

  private static _requireConsumerReceiverMode(
    value: ScreenSpaceReflectionConsumerReceiverMode
  ): ScreenSpaceReflectionConsumerReceiverMode {
    if (
      value !== ScreenSpaceReflectionReceiverMode.OpaqueComposite &&
      value !== ScreenSpaceReflectionReceiverMode.TransparentSampleOnly
    ) {
      throw new RangeError(`Unsupported screen-space reflection receiver phase: ${String(value)}`);
    }
    return value;
  }

  private static _disableMaterialReceiver(material: Material): void {
    const shaderData = material.shaderData;
    shaderData.setFloat(ScreenSpaceReflection._receiverModeProperty, ScreenSpaceReflectionReceiverMode.Disabled);
    shaderData.setFloat(ScreenSpaceReflection._receiverIntensityProperty, 0);
    material._screenSpaceReflectionReceiverRegistered = false;
    shaderData.disableMacro(ScreenSpaceReflection._legacyReceiverMacro);
  }

  private static _sanitizeUpsamplingMode(
    value: ScreenSpaceReflectionUpsamplingMode
  ): ScreenSpaceReflectionUpsamplingMode {
    return value === ScreenSpaceReflectionUpsamplingMode.Bilinear ||
      value === ScreenSpaceReflectionUpsamplingMode.Bilateral
      ? value
      : ScreenSpaceReflectionUpsamplingMode.GaussianBilateral;
  }

  private static _sanitizeQuality(value: ScreenSpaceReflectionQuality): ScreenSpaceReflectionQuality {
    switch (value) {
      case ScreenSpaceReflectionQuality.Low:
      case ScreenSpaceReflectionQuality.Medium:
      case ScreenSpaceReflectionQuality.High:
        return value;
      default:
        return ScreenSpaceReflectionQuality.Medium;
    }
  }

  /** @internal */
  static _sanitizeConsumerRequest(
    request?: Readonly<ScreenSpaceReflectionConsumerRequest>
  ): ScreenSpaceReflectionConsumerRequest {
    if (!request) return Object.freeze({});
    const sanitized: {
      priority?: number;
      receiverMode?: ScreenSpaceReflectionConsumerReceiverMode;
      quality?: ScreenSpaceReflectionQuality;
      resolutionScale?: number;
      upsamplingMode?: ScreenSpaceReflectionUpsamplingMode;
      intensity?: number;
      maxRayDistance?: number;
      rayLengthFade?: number;
      maxRaySteps?: number;
      hitRefinementSteps?: number;
      thickness?: number;
      maxRoughness?: number;
      edgeFade?: number;
    } = {};
    if (request.priority !== undefined) {
      sanitized.priority = Number.isFinite(request.priority) ? request.priority : 0;
    }
    if (
      request.receiverMode === ScreenSpaceReflectionReceiverMode.OpaqueComposite ||
      request.receiverMode === ScreenSpaceReflectionReceiverMode.TransparentSampleOnly
    ) {
      sanitized.receiverMode = request.receiverMode;
    }
    if (request.quality !== undefined) {
      sanitized.quality = ScreenSpaceReflection._sanitizeQuality(request.quality);
    }
    if (request.resolutionScale !== undefined) {
      sanitized.resolutionScale = ScreenSpaceReflection._clampFinite(request.resolutionScale, 0.25, 1, 1);
    }
    if (request.upsamplingMode !== undefined) {
      sanitized.upsamplingMode = ScreenSpaceReflection._sanitizeUpsamplingMode(request.upsamplingMode);
    }
    if (request.intensity !== undefined) {
      sanitized.intensity = ScreenSpaceReflection._clampFinite(request.intensity, 0, 1, 1);
    }
    if (request.maxRayDistance !== undefined) {
      sanitized.maxRayDistance = Math.max(
        0.0001,
        Number.isFinite(request.maxRayDistance) ? request.maxRayDistance : 20
      );
    }
    if (request.rayLengthFade !== undefined) {
      sanitized.rayLengthFade = Math.max(0, Number.isFinite(request.rayLengthFade) ? request.rayLengthFade : 1);
    }
    if (request.maxRaySteps !== undefined) {
      sanitized.maxRaySteps = ScreenSpaceReflection._clampInteger(request.maxRaySteps, 1, 64, 32);
    }
    if (request.hitRefinementSteps !== undefined) {
      sanitized.hitRefinementSteps = ScreenSpaceReflection._clampInteger(request.hitRefinementSteps, 0, 5, 3);
    }
    if (request.thickness !== undefined) {
      sanitized.thickness = Math.max(0.0001, Number.isFinite(request.thickness) ? request.thickness : 0.2);
    }
    if (request.maxRoughness !== undefined) {
      sanitized.maxRoughness = ScreenSpaceReflection._clampFinite(request.maxRoughness, 0, 1, 0.7);
    }
    if (request.edgeFade !== undefined) {
      sanitized.edgeFade = ScreenSpaceReflection._clampFinite(request.edgeFade, 0, 0.5, 0.1);
    }
    return Object.freeze(sanitized);
  }

  private static _sanitizeTraceSettingsOverride(
    settings: Readonly<Partial<ScreenSpaceReflectionTraceSettings>>
  ): Readonly<Partial<ScreenSpaceReflectionTraceSettings>> {
    const sanitized: {
      quality?: ScreenSpaceReflectionQuality;
      resolutionScale?: number;
      upsamplingMode?: ScreenSpaceReflectionUpsamplingMode;
      maxRayDistance?: number;
      rayLengthFade?: number;
      maxRaySteps?: number;
      hitRefinementSteps?: number;
      thickness?: number;
      maxRoughness?: number;
      edgeFade?: number;
    } = {};
    if (settings.quality !== undefined) sanitized.quality = ScreenSpaceReflection._sanitizeQuality(settings.quality);
    if (settings.resolutionScale !== undefined) {
      sanitized.resolutionScale = ScreenSpaceReflection._clampFinite(settings.resolutionScale, 0.25, 1, 1);
    }
    if (settings.upsamplingMode !== undefined) {
      sanitized.upsamplingMode = ScreenSpaceReflection._sanitizeUpsamplingMode(settings.upsamplingMode);
    }
    if (settings.maxRayDistance !== undefined) {
      sanitized.maxRayDistance = Math.max(
        0.0001,
        Number.isFinite(settings.maxRayDistance) ? settings.maxRayDistance : 20
      );
    }
    if (settings.rayLengthFade !== undefined) {
      sanitized.rayLengthFade = Math.max(0, Number.isFinite(settings.rayLengthFade) ? settings.rayLengthFade : 1);
    }
    if (settings.maxRaySteps !== undefined) {
      sanitized.maxRaySteps = ScreenSpaceReflection._clampInteger(settings.maxRaySteps, 1, 64, 32);
    }
    if (settings.hitRefinementSteps !== undefined) {
      sanitized.hitRefinementSteps = ScreenSpaceReflection._clampInteger(settings.hitRefinementSteps, 0, 5, 3);
    }
    if (settings.thickness !== undefined) {
      sanitized.thickness = Math.max(0.0001, Number.isFinite(settings.thickness) ? settings.thickness : 0.2);
    }
    if (settings.maxRoughness !== undefined) {
      sanitized.maxRoughness = ScreenSpaceReflection._clampFinite(settings.maxRoughness, 0, 1, 0.7);
    }
    if (settings.edgeFade !== undefined) {
      sanitized.edgeFade = ScreenSpaceReflection._clampFinite(settings.edgeFade, 0, 0.5, 0.1);
    }
    return Object.freeze(sanitized);
  }

  private static _compareConsumerLeases(left: ScreenSpaceReflectionLease, right: ScreenSpaceReflectionLease): number {
    const priorityDifference = (right.request.priority ?? 0) - (left.request.priority ?? 0);
    if (priorityDifference !== 0) return priorityDifference;
    if (left.label !== right.label) return left.label < right.label ? -1 : 1;
    const leftKey = ScreenSpaceReflection._consumerRequestKey(left.request);
    const rightKey = ScreenSpaceReflection._consumerRequestKey(right.request);
    return leftKey === rightKey ? 0 : leftKey < rightKey ? -1 : 1;
  }

  private static _consumerRequestKey(request: ScreenSpaceReflectionConsumerRequest): string {
    return JSON.stringify([
      request.priority ?? 0,
      request.receiverMode ?? null,
      request.quality ?? null,
      request.resolutionScale ?? null,
      request.upsamplingMode ?? null,
      request.intensity ?? null,
      request.maxRayDistance ?? null,
      request.rayLengthFade ?? null,
      request.maxRaySteps ?? null,
      request.hitRefinementSteps ?? null,
      request.thickness ?? null,
      request.maxRoughness ?? null,
      request.edgeFade ?? null
    ]);
  }
}
