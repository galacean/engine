import { ScreenSpaceReflectionConfig } from "./ScreenSpaceReflectionConfig";
import {
  ScreenSpaceReflectionSettings,
  ScreenSpaceReflectionSettingsSource,
  ScreenSpaceReflectionContent,
  type ScreenSpaceReflectionSettingsData
} from "./ScreenSpaceReflectionSettings";
import type { Engine } from "../../Engine";
import { ContentRestorer } from "../../asset/ContentRestorer";
import { Texture2D, TextureFormat } from "../../texture";
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
  readonly contributionColorDrawCount: number;
  readonly contributionDepthDrawCount: number;
  readonly contributionUnsupportedReason: string | null;
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
  contributionColorDrawCount: number;
  contributionDepthDrawCount: number;
  contributionUnsupportedReason: string | null;
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
  contributionColorDrawCount: number;
  contributionDepthDrawCount: number;
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
  /** Direct legacy parameter writes select Override; switching back retains those values. */
  private _settingsSource = ScreenSpaceReflectionSettingsSource.UseSceneSettings;
  /** @internal Whether dormant camera author settings have been initialized. */
  _hasOverrideSettings = false;
  get settingsSource(): ScreenSpaceReflectionSettingsSource {
    return this._settingsSource;
  }
  set settingsSource(value: ScreenSpaceReflectionSettingsSource) {
    this._settingsSource =
      value === ScreenSpaceReflectionSettingsSource.Override
        ? value
        : ScreenSpaceReflectionSettingsSource.UseSceneSettings;
    if (this._settingsSource === ScreenSpaceReflectionSettingsSource.Override && !this._hasOverrideSettings) {
      this._hasOverrideSettings = true;
      const sceneSettings = this._camera.entity?.scene?.screenSpaceReflection;
      if (sceneSettings) this.applySettings(sceneSettings.toJSON());
    }
    this._refreshState();
  }
  private get _authorSettings(): ScreenSpaceReflectionSettingsData {
    return this.settingsSource === ScreenSpaceReflectionSettingsSource.UseSceneSettings
      ? (this._camera.entity?.scene?.screenSpaceReflection ?? this)
      : this;
  }
  applySettings(data: Partial<ScreenSpaceReflectionSettingsData>): void {
    this.settingsSource = ScreenSpaceReflectionSettingsSource.Override;
    const normalized = ScreenSpaceReflectionSettings.normalize(data);
    if (normalized.activationMode !== undefined) this._activationMode = normalized.activationMode;
    if (normalized.reflectionContent !== undefined) this._reflectionContent = normalized.reflectionContent;
    if (normalized.receiverPolicy !== undefined) this._receiverPolicy = normalized.receiverPolicy;
    if (normalized.resolutionScale !== undefined) this._resolutionScale = normalized.resolutionScale;
    if (normalized.upsamplingMode !== undefined) this._upsamplingMode = normalized.upsamplingMode;
    if (normalized.intensity !== undefined) this._intensity = normalized.intensity;
    if (normalized.maxRayDistance !== undefined) this._maxRayDistance = normalized.maxRayDistance;
    if (normalized.rayLengthFade !== undefined) this._rayLengthFade = normalized.rayLengthFade;
    if (normalized.maxRaySteps !== undefined) this._maxRaySteps = normalized.maxRaySteps;
    if (normalized.hitRefinementSteps !== undefined) this._hitRefinementSteps = normalized.hitRefinementSteps;
    if (normalized.thickness !== undefined) this._thickness = normalized.thickness;
    if (normalized.maxRoughness !== undefined) this._maxRoughness = normalized.maxRoughness;
    if (normalized.edgeFade !== undefined) this._edgeFade = normalized.edgeFade;
    this._refreshState();
  }
  /** Replace a complete author snapshot; omitted overrideSettings restores never-overridden state. */
  restoreSettings(value: {
    settingsSource: ScreenSpaceReflectionSettingsSource;
    overrideSettings?: Partial<ScreenSpaceReflectionSettingsData>;
  }): void {
    const base =
      this._camera.entity?.scene?.screenSpaceReflection.toJSON() ?? new ScreenSpaceReflectionSettings().toJSON();
    this._hasOverrideSettings = true;
    this.applySettings({ ...base, ...value.overrideSettings });
    this._hasOverrideSettings = value.overrideSettings !== undefined;
    this.settingsSource = value.settingsSource;
    this._refreshState();
  }
  toJSON(): ScreenSpaceReflectionSettingsData {
    return {
      activationMode: this.activationMode,
      receiverPolicy: this.receiverPolicy,
      reflectionContent: this.reflectionContent,
      resolutionScale: this.resolutionScale,
      upsamplingMode: this.upsamplingMode,
      intensity: this.intensity,
      maxRayDistance: this.maxRayDistance,
      rayLengthFade: this.rayLengthFade,
      maxRaySteps: this.maxRaySteps,
      hitRefinementSteps: this.hitRefinementSteps,
      thickness: this.thickness,
      maxRoughness: this.maxRoughness,
      edgeFade: this.edgeFade
    };
  }
  applyPerformancePreset(quality: ScreenSpaceReflectionQuality): void {
    this.applySettings(ScreenSpaceReflectionSettings.performancePreset(quality));
  }

  /** Optional, caller-owned instrumentation. Disabled by default and not copied with cameras. */
  profiler: ScreenSpaceReflectionProfiler | null = null;

  /** Complete trace/reconstruction budget, also usable in consumer requests or phase overrides. */
  static getQualityPreset(quality: ScreenSpaceReflectionQuality): Readonly<ScreenSpaceReflectionTraceSettings> {
    return ScreenSpaceReflectionConfig.getQualityPreset(quality);
  }

  /** Apply a complete manual budget without changing activation, consumers, phase overrides or intensity. */
  applyQualityPreset(quality: ScreenSpaceReflectionQuality): void {
    this.settingsSource = ScreenSpaceReflectionSettingsSource.Override;
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
  /** Active SubShader opt-in: Forward and Surface share the built-in Auto response model. */
  static readonly MATERIAL_AUTO_RECEIVER_TAG = "screenSpaceReflectionAuto";
  static readonly MATERIAL_AUTO_RECEIVER_CONTRACT = "PbrV1";
  /** RGBA8 world-space oct8 normal, roughness/weight and a separate colored response. V2 used view-space normals. */
  static readonly MATERIAL_RECEIVER_CONTRACT = "ColorResponseV3";
  /** Forward implements sampling of the published camera SSR texture. */
  static readonly MATERIAL_TRANSPARENT_SAMPLE_TAG = "screenSpaceReflectionTransparentSample";
  static readonly MATERIAL_TRANSPARENT_SAMPLE_CONTRACT = "SampleV1";
  static supportsMaterialTransparentSampling(material: Material): boolean {
    return (
      material.shader?.subShaders[0]?.passes.some(
        (pass) =>
          pass.getTagValue(ScreenSpaceReflection._pipelineStageTag) === PipelineStage.Forward &&
          pass.getTagValue(ScreenSpaceReflection.MATERIAL_TRANSPARENT_SAMPLE_TAG) ===
            ScreenSpaceReflection.MATERIAL_TRANSPARENT_SAMPLE_CONTRACT
      ) ?? false
    );
  }

  /** Color uses normal transparent sorting/blending; Depth writes nearest nonzero-alpha depth. */
  static readonly MATERIAL_CONTRIBUTION_TAG = "screenSpaceReflectionContribution";
  static readonly MATERIAL_CONTRIBUTION_CONTRACT = "ColorDepthV1";
  static supportsMaterialContribution(material: Material): boolean {
    const passes = material.shader?.subShaders[0]?.passes;
    return (
      !!passes &&
      [
        PipelineStage.ScreenSpaceReflectionContributionColor,
        PipelineStage.ScreenSpaceReflectionContributionDepth
      ].every((stage) =>
        passes.some(
          (pass) =>
            pass.getTagValue(ScreenSpaceReflection._pipelineStageTag) === stage &&
            pass.getTagValue(ScreenSpaceReflection.MATERIAL_CONTRIBUTION_TAG) ===
              ScreenSpaceReflection.MATERIAL_CONTRIBUTION_CONTRACT &&
            pass._renderState._getRenderQueueByShaderData(pass._renderStateDataMap, material.shaderData) ===
              RenderQueueType.Transparent
        )
      )
    );
  }

  private static readonly _unpublishedMaxRoughness = -1;
  private static readonly _emptyTextures = new WeakMap<Engine, Texture2D>();
  /** @internal */
  static readonly _cameraMaxRoughnessProperty = ShaderProperty.getByName("camera_ScreenSpaceReflectionMaxRoughness");
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
  private static readonly _autoReceiverTag = ShaderTagKey.getByName(ScreenSpaceReflection.MATERIAL_AUTO_RECEIVER_TAG);
  /** @internal Read only the active SubShader; surface capability is checked separately. */
  static _supportsShaderAutoReceiver(shader: Material["shader"]): boolean {
    return (
      shader?.subShaders[0]?.getTagValue(ScreenSpaceReflection._autoReceiverTag) ===
      ScreenSpaceReflection.MATERIAL_AUTO_RECEIVER_CONTRACT
    );
  }
  private static readonly _receiverContractTag = ShaderTagKey.getByName(
    ScreenSpaceReflection.MATERIAL_RECEIVER_CONTRACT_TAG
  );

  private _activationMode = ScreenSpaceReflectionSettings.defaults.activationMode;
  private _reflectionContent = ScreenSpaceReflectionSettings.defaults.reflectionContent;
  private _receiverPolicy = ScreenSpaceReflectionSettings.defaults.receiverPolicy;
  private _enabled = false;
  private _renderingEnabled = true;
  private _quality = ScreenSpaceReflectionQuality.Medium;
  private _resolutionScale = ScreenSpaceReflectionSettings.defaults.resolutionScale;
  private _upsamplingMode = ScreenSpaceReflectionSettings.defaults.upsamplingMode;
  private _intensity = ScreenSpaceReflectionSettings.defaults.intensity;
  private _maxRayDistance = ScreenSpaceReflectionSettings.defaults.maxRayDistance;
  private _rayLengthFade = ScreenSpaceReflectionSettings.defaults.rayLengthFade;
  private _maxRaySteps = ScreenSpaceReflectionSettings.defaults.maxRaySteps;
  private _hitRefinementSteps = ScreenSpaceReflectionSettings.defaults.hitRefinementSteps;
  private _thickness = ScreenSpaceReflectionSettings.defaults.thickness;
  private _maxRoughness = ScreenSpaceReflectionSettings.defaults.maxRoughness;
  private _edgeFade = ScreenSpaceReflectionSettings.defaults.edgeFade;
  private _debugMode = ScreenSpaceReflectionDebugMode.None;
  private _destroyed = false;
  private readonly _leases = new Set<ScreenSpaceReflectionLease>();
  private _opaqueTraceSettingsOverride: Readonly<Partial<ScreenSpaceReflectionTraceSettings>> | null = null;
  private _transparentTraceSettingsOverride: Readonly<Partial<ScreenSpaceReflectionTraceSettings>> | null = null;
  private readonly _resolvedSettingsState: MutableScreenSpaceReflectionResolvedSettings = {
    quality: ScreenSpaceReflectionQuality.Medium,
    resolutionScale: ScreenSpaceReflectionSettings.defaults.resolutionScale,
    upsamplingMode: ScreenSpaceReflectionSettings.defaults.upsamplingMode,
    intensity: ScreenSpaceReflectionSettings.defaults.intensity,
    maxRayDistance: ScreenSpaceReflectionSettings.defaults.maxRayDistance,
    rayLengthFade: ScreenSpaceReflectionSettings.defaults.rayLengthFade,
    maxRaySteps: ScreenSpaceReflectionSettings.defaults.maxRaySteps,
    hitRefinementSteps: ScreenSpaceReflectionSettings.defaults.hitRefinementSteps,
    thickness: ScreenSpaceReflectionSettings.defaults.thickness,
    maxRoughness: ScreenSpaceReflectionSettings.defaults.maxRoughness,
    edgeFade: ScreenSpaceReflectionSettings.defaults.edgeFade
  };
  private readonly _opaqueResolvedSettingsState: MutableScreenSpaceReflectionResolvedSettings = {
    ...this._resolvedSettingsState
  };
  private readonly _transparentResolvedSettingsState: MutableScreenSpaceReflectionResolvedSettings = {
    ...this._resolvedSettingsState
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
    contributionColorDrawCount: 0,
    contributionDepthDrawCount: 0,
    contributionUnsupportedReason: null,
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

  /**
   * Highest-priority camera-global activation policy.
   * Save and restore Camera.screenSpaceReflectionSettings when temporarily overriding a following camera.
   * Independent camera value, not the effective Scene value; writing selects Override.
   */
  get activationMode(): ScreenSpaceReflectionActivationMode {
    return this._activationMode;
  }

  set activationMode(value: ScreenSpaceReflectionActivationMode) {
    this.applySettings({ activationMode: value });
  }

  /**
   * Which visible surfaces can supply reflection hits.
   * Independent camera value, not the effective Scene value; writing selects Override.
   */
  get reflectionContent(): ScreenSpaceReflectionContent {
    return this._reflectionContent;
  }
  set reflectionContent(value: ScreenSpaceReflectionContent) {
    this.applySettings({ reflectionContent: value });
  }
  /** @internal Resolved author source; consumers do not broaden content participation. */
  get _includesTransparentContributors(): boolean {
    return this._authorSettings.reflectionContent === ScreenSpaceReflectionContent.OpaqueAndTransparent;
  }

  /**
   * How standard PBR materials whose receiver mode is Auto are resolved.
   * Independent camera value, not the effective Scene value; writing selects Override.
   */
  get receiverPolicy(): ScreenSpaceReflectionReceiverPolicy {
    return this._receiverPolicy;
  }

  set receiverPolicy(value: ScreenSpaceReflectionReceiverPolicy) {
    this.applySettings({ receiverPolicy: value });
  }

  /** Runtime-only rendering gate. Does not change author settings or consumer requests, and is not cloned. */
  get renderingEnabled(): boolean {
    return this._renderingEnabled;
  }

  set renderingEnabled(value: boolean) {
    if (this._renderingEnabled === value) return;
    this._renderingEnabled = value;
    this._refreshState();
  }

  /** Whether this camera explicitly requests SSR. Consumer leases are independent. */
  get enabled(): boolean {
    return this._enabled;
  }

  set enabled(value: boolean) {
    this._enabled = !!value;
    this._refreshState();
  }

  /**
   * Ray-step budget only. Use applyQualityPreset() to also change resolution and reconstruction.
   * Independent camera value, not the effective Scene value; writing selects Override.
   */
  get quality(): ScreenSpaceReflectionQuality {
    return this._quality;
  }

  set quality(value: ScreenSpaceReflectionQuality) {
    this.settingsSource = ScreenSpaceReflectionSettingsSource.Override;
    this._quality = ScreenSpaceReflection._sanitizeQuality(value);
    const tuning = ScreenSpaceReflection._qualityTuning(this._quality);
    this._maxRaySteps = tuning.maxRaySteps;
    this._hitRefinementSteps = tuning.hitRefinementSteps;
    this._resolveSettings();
  }

  /**
   * Linear resolution used by the trace buffer, clamped to [0.25, 1].
   * Independent camera value, not the effective Scene value; writing selects Override.
   */
  get resolutionScale(): number {
    return this._resolutionScale;
  }

  set resolutionScale(value: number) {
    this.applySettings({ resolutionScale: value });
  }

  /**
   * Reconstruction used below full resolution; defaults to the legacy Gaussian + bilateral path.
   * Independent camera value, not the effective Scene value; writing selects Override.
   */
  get upsamplingMode(): ScreenSpaceReflectionUpsamplingMode {
    return this._upsamplingMode;
  }

  set upsamplingMode(value: ScreenSpaceReflectionUpsamplingMode) {
    this.applySettings({ upsamplingMode: value });
  }

  /**
   * Global replacement weight for this camera, clamped to [0, 1].
   * Independent camera value, not the effective Scene value; writing selects Override.
   */
  get intensity(): number {
    return this._intensity;
  }

  set intensity(value: number) {
    this.applySettings({ intensity: value });
  }

  /** Independent camera value, not the effective Scene value; writing selects Override. */
  get maxRayDistance(): number {
    return this._maxRayDistance;
  }

  set maxRayDistance(value: number) {
    this.applySettings({ maxRayDistance: value });
  }

  /**
   * World-space fade distance before the maximum ray length.
   * Independent camera value, not the effective Scene value; writing selects Override.
   */
  get rayLengthFade(): number {
    return this._rayLengthFade;
  }

  set rayLengthFade(value: number) {
    this.applySettings({ rayLengthFade: value });
  }

  /**
   * Maximum linear-march samples, clamped to the shader's static loop bound.
   * Independent camera value, not the effective Scene value; writing selects Override.
   */
  get maxRaySteps(): number {
    return this._maxRaySteps;
  }

  set maxRaySteps(value: number) {
    this.applySettings({ maxRaySteps: value });
  }

  /**
   * Binary-search iterations used to refine one candidate hit.
   * Independent camera value, not the effective Scene value; writing selects Override.
   */
  get hitRefinementSteps(): number {
    return this._hitRefinementSteps;
  }

  set hitRefinementSteps(value: number) {
    this.applySettings({ hitRefinementSteps: value });
  }

  /**
   * Near-field hit-thickness floor in metres; the trace expands it with linear depth.
   * Independent camera value, not the effective Scene value; writing selects Override.
   */
  get thickness(): number {
    return this._thickness;
  }

  set thickness(value: number) {
    this.applySettings({ thickness: value });
  }

  /** Independent camera value, not the effective Scene value; writing selects Override. */
  get maxRoughness(): number {
    return this._maxRoughness;
  }

  set maxRoughness(value: number) {
    this.applySettings({ maxRoughness: value });
  }

  /** Independent camera value, not the effective Scene value; writing selects Override. */
  get edgeFade(): number {
    return this._edgeFade;
  }

  set edgeFade(value: number) {
    this.applySettings({ edgeFade: value });
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

  private static readonly _supportedReceiverCapability: ScreenSpaceReflectionMaterialReceiverCapability = Object.freeze(
    {
      supported: true,
      contract: ScreenSpaceReflection.MATERIAL_RECEIVER_CONTRACT,
      unsupportedReason: null
    }
  );
  private static readonly _unsupportedLobesCapability: ScreenSpaceReflectionMaterialReceiverCapability = Object.freeze({
    supported: false,
    contract: ScreenSpaceReflection.MATERIAL_RECEIVER_CONTRACT,
    unsupportedReason: "unsupported-screen-space-reflection-material-lobes"
  });
  private static readonly _inactiveSubshaderCapability: ScreenSpaceReflectionMaterialReceiverCapability = Object.freeze(
    {
      supported: false,
      contract: ScreenSpaceReflection.MATERIAL_RECEIVER_CONTRACT,
      unsupportedReason: "screen-space-reflection-receiver-contract-not-in-active-subshader"
    }
  );
  private static readonly _missingSurfaceCapability: ScreenSpaceReflectionMaterialReceiverCapability = Object.freeze({
    supported: false,
    contract: null,
    unsupportedReason: "missing-screen-space-reflection-surface-pass"
  });

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
            return ScreenSpaceReflection._unsupportedLobesCapability;
          }
        }
        return ScreenSpaceReflection._supportedReceiverCapability;
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
            return ScreenSpaceReflection._inactiveSubshaderCapability;
          }
        }
      }
    }

    return ScreenSpaceReflection._missingSurfaceCapability;
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
    // Explicit asset authorship owns the receiver until changed through the author API.
    if (material._screenSpaceReflectionAuthorSettings) return false;
    return ScreenSpaceReflection._writeMaterialReceiver(material, mode, intensity);
  }

  private static _writeMaterialReceiver(
    material: Material,
    mode: ScreenSpaceReflectionReceiverMode,
    intensity: number
  ): boolean {
    const capability = ScreenSpaceReflection.getMaterialReceiverCapability(material);
    const validMode =
      mode === ScreenSpaceReflectionReceiverMode.Disabled ||
      mode === ScreenSpaceReflectionReceiverMode.OpaqueComposite ||
      mode === ScreenSpaceReflectionReceiverMode.TransparentSampleOnly ||
      (mode === ScreenSpaceReflectionReceiverMode.Auto &&
        ScreenSpaceReflection._supportsShaderAutoReceiver(material.shader));
    if (
      !capability.supported ||
      !validMode ||
      (mode === ScreenSpaceReflectionReceiverMode.TransparentSampleOnly &&
        !ScreenSpaceReflection.supportsMaterialTransparentSampling(material))
    ) {
      ScreenSpaceReflection._disableMaterialReceiver(material);
      return false;
    }

    ScreenSpaceReflection._applyMaterialReceiver(material, mode, intensity);
    return true;
  }

  private static _applyMaterialReceiver(
    material: Material,
    mode: ScreenSpaceReflectionReceiverMode,
    intensity: number
  ): void {
    const receiverIntensity =
      mode === ScreenSpaceReflectionReceiverMode.Disabled ? 0 : ScreenSpaceReflection._clampFinite(intensity, 0, 1, 1);
    const explicitlyEnabled =
      (mode === ScreenSpaceReflectionReceiverMode.OpaqueComposite ||
        mode === ScreenSpaceReflectionReceiverMode.TransparentSampleOnly) &&
      receiverIntensity > 0;
    if (material.shaderData.getFloat(ScreenSpaceReflection._receiverModeProperty) !== mode)
      material.shaderData.setFloat(ScreenSpaceReflection._receiverModeProperty, mode);
    if (material.shaderData.getFloat(ScreenSpaceReflection._receiverIntensityProperty) !== receiverIntensity)
      material.shaderData.setFloat(ScreenSpaceReflection._receiverIntensityProperty, receiverIntensity);
    material._screenSpaceReflectionReceiverRegistered = explicitlyEnabled;
    material.shaderData.disableMacro(ScreenSpaceReflection._legacyReceiverMacro);
  }

  /** Re-evaluate author intent at author edits and render preparation. Queries never publish uniforms. */
  static resolveMaterialReceiver(material: Material, queue?: RenderQueueType): void {
    const author = material._screenSpaceReflectionAuthorSettings;
    if (author) {
      const mode = ScreenSpaceReflection._resolveMaterialReceiverMode(material, queue);
      ScreenSpaceReflection._applyMaterialReceiver(material, mode, author.intensity);
    }
  }

  /** Return the effective explicit receiver mode without changing material state. */
  static getMaterialReceiverMode(material: Material, queue?: RenderQueueType): ScreenSpaceReflectionReceiverMode {
    const mode = ScreenSpaceReflection._resolveMaterialReceiverMode(material, queue);
    return mode === ScreenSpaceReflectionReceiverMode.Auto ? ScreenSpaceReflectionReceiverMode.Disabled : mode;
  }

  private static _resolveMaterialReceiverMode(
    material: Material,
    queue?: RenderQueueType
  ): ScreenSpaceReflectionReceiverMode {
    const author = material._screenSpaceReflectionAuthorSettings;
    const shaderData = material.shaderData;
    queue ??= shaderData.getInt("renderQueueType") ?? RenderQueueType.Opaque;
    const mode = author
      ? author.mode === "Off"
        ? ScreenSpaceReflectionReceiverMode.Disabled
        : author.mode === "Auto"
          ? ScreenSpaceReflectionReceiverMode.Auto
          : queue === RenderQueueType.Transparent
            ? ScreenSpaceReflectionReceiverMode.TransparentSampleOnly
            : ScreenSpaceReflectionReceiverMode.OpaqueComposite
      : shaderData.getFloat(ScreenSpaceReflection._receiverModeProperty);
    const intensity = author?.intensity ?? shaderData.getFloat(ScreenSpaceReflection._receiverIntensityProperty) ?? 0;
    if (
      intensity <= 0 ||
      (mode !== ScreenSpaceReflectionReceiverMode.Auto &&
        mode !== ScreenSpaceReflectionReceiverMode.OpaqueComposite &&
        mode !== ScreenSpaceReflectionReceiverMode.TransparentSampleOnly) ||
      (!author &&
        mode !== ScreenSpaceReflectionReceiverMode.Auto &&
        !material._screenSpaceReflectionReceiverRegistered) ||
      (mode === ScreenSpaceReflectionReceiverMode.Auto &&
        !ScreenSpaceReflection._supportsShaderAutoReceiver(material.shader)) ||
      !ScreenSpaceReflection.getMaterialReceiverCapability(material).supported ||
      (mode === ScreenSpaceReflectionReceiverMode.TransparentSampleOnly &&
        !ScreenSpaceReflection.supportsMaterialTransparentSampling(material))
    )
      return ScreenSpaceReflectionReceiverMode.Disabled;
    return mode;
  }

  /** Whether this material is an explicitly registered receiver, optionally in one mode. */
  static isMaterialReceiver(material: Material, mode?: ScreenSpaceReflectionReceiverMode): boolean {
    const resolvedMode = ScreenSpaceReflection.getMaterialReceiverMode(material);
    return mode === undefined ? resolvedMode !== ScreenSpaceReflectionReceiverMode.Disabled : resolvedMode === mode;
  }

  /** @internal Resolve an explicit receiver or the camera-local standard PBR Auto policy. */
  _isMaterialReceiver(material: Material, renderQueueType: RenderQueueType): boolean {
    const author = material._screenSpaceReflectionAuthorSettings;
    const automatic = author
      ? author.mode === "Auto"
      : material.shaderData.getFloat(ScreenSpaceReflection._receiverModeProperty) ===
        ScreenSpaceReflectionReceiverMode.Auto;
    if (automatic && this._authorSettings.receiverPolicy !== ScreenSpaceReflectionReceiverPolicy.StandardPbrAuto) {
      return false;
    }
    const explicitMode = ScreenSpaceReflection._resolveMaterialReceiverMode(material, renderQueueType);
    if (explicitMode === ScreenSpaceReflectionReceiverMode.OpaqueComposite) {
      return renderQueueType !== RenderQueueType.Transparent;
    }
    if (explicitMode === ScreenSpaceReflectionReceiverMode.TransparentSampleOnly) {
      return renderQueueType === RenderQueueType.Transparent;
    }

    const shaderData = material.shaderData;
    if (
      explicitMode !== ScreenSpaceReflectionReceiverMode.Auto ||
      this._authorSettings.receiverPolicy !== ScreenSpaceReflectionReceiverPolicy.StandardPbrAuto ||
      renderQueueType === RenderQueueType.Transparent ||
      !ScreenSpaceReflection._supportsShaderAutoReceiver(material.shader) ||
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
    this._unpublish();
    this._refreshState();
  }

  /** @internal */
  _beginFrame(supported: boolean, unsupportedReason: string | null): boolean {
    const metrics = this._metricsState;
    this._prepareSettings();
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
    this._unpublish();
    return metrics.effective;
  }

  /** @internal Invalidate this camera's current-frame publication, including shared-program uniforms. */
  _unpublish(): void {
    const engine = this._camera.engine;
    let texture = ScreenSpaceReflection._emptyTextures.get(engine);
    if (!texture) {
      texture = new Texture2D(engine, 1, 1, TextureFormat.R8G8B8A8, false, false);
      const pixel = new Uint8Array(4);
      texture.setPixelBuffer(pixel);
      texture.isGCIgnored = true;
      engine.resourceManager.addContentRestorer(
        new (class extends ContentRestorer<Texture2D> {
          restoreContent(): void {
            this.resource.setPixelBuffer(pixel);
          }
        })(texture)
      );
      ScreenSpaceReflection._emptyTextures.set(engine, texture);
    }
    this._camera.shaderData.setTexture(ScreenSpaceReflection._cameraTextureProperty, texture);
    this._camera.shaderData.setFloat(
      ScreenSpaceReflection._cameraMaxRoughnessProperty,
      ScreenSpaceReflection._unpublishedMaxRoughness
    );
  }

  /** @internal Contribution failure keeps opaque tracing available. */
  _failContribution(reason: string): void {
    this._metricsState.contributionUnsupportedReason = reason;
  }

  /** @internal Mark a runtime failure without discarding work already submitted this frame. */
  _failFrame(reason: string): void {
    const metrics = this._metricsState;
    metrics.supported = false;
    metrics.unsupportedReason = reason;
    metrics.effective = false;
    metrics.inactiveReason = reason;
    this._unpublish();
  }

  /** @internal */
  _skipFrame(inactiveReason: string): void {
    const metrics = this._metricsState;
    metrics.effective = false;
    metrics.inactiveReason = inactiveReason;
    metrics.unsupportedReason = null;
    this._unpublish();
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
    metrics.contributionColorDrawCount = stats.contributionColorDrawCount;
    metrics.contributionDepthDrawCount = stats.contributionDepthDrawCount;
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
    this._hasOverrideSettings = true;
    this.applySettings(source.toJSON());
    this._enabled = source.enabled;
    this._quality = source.quality;
    this.debugMode = source.debugMode;
    this.setReceiverTraceSettingsOverride(
      ScreenSpaceReflectionReceiverMode.OpaqueComposite,
      source.getReceiverTraceSettingsOverride(ScreenSpaceReflectionReceiverMode.OpaqueComposite) ?? undefined
    );
    this.setReceiverTraceSettingsOverride(
      ScreenSpaceReflectionReceiverMode.TransparentSampleOnly,
      source.getReceiverTraceSettingsOverride(ScreenSpaceReflectionReceiverMode.TransparentSampleOnly) ?? undefined
    );
    this._hasOverrideSettings = source._hasOverrideSettings;
    this._settingsSource = source.settingsSource;
    this._refreshState();
    this._unpublish();
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
    metrics.activationMode = this._authorSettings.activationMode;
    metrics.receiverPolicy = this._authorSettings.receiverPolicy;
    metrics.globalEnabled = this._authorSettings.activationMode !== ScreenSpaceReflectionActivationMode.ForceOff;
    metrics.requestedByManual = this._enabled;
    metrics.requestedByConsumers = requestedByConsumers;
    switch (this._authorSettings.activationMode) {
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
    if (!this._renderingEnabled) metrics.requested = false;
    if (!metrics.requested) {
      metrics.effective = false;
      metrics.inactiveReason = !this._renderingEnabled
        ? "disabled-by-runtime-switch"
        : this._destroyed
          ? "camera-destroyed"
          : this._authorSettings.activationMode === ScreenSpaceReflectionActivationMode.ForceOff
            ? "disabled-by-global-switch"
            : "not-requested";
      metrics.unsupportedReason = null;
      this._unpublish();
      this._resetRenderStats();
    }
  }

  private _resolvedSceneSettings: ScreenSpaceReflectionSettings | undefined;
  private _resolvedSceneVersion = -1;
  /** @internal Render preparation boundary; diagnostic getters never synchronize state. */
  _prepareSettings(): void {
    if (this._destroyed) return;
    const settings = this._camera.entity?.scene?.screenSpaceReflection;
    if (settings !== this._resolvedSceneSettings || (settings?._version ?? -1) !== this._resolvedSceneVersion)
      this._refreshState();
  }
  private _refreshState(): void {
    this._resolvedSceneSettings = this._camera.entity?.scene?.screenSpaceReflection;
    this._resolvedSceneVersion = this._resolvedSceneSettings?._version ?? -1;
    this._refreshRequested();
    this._resolveSettings();
  }

  private _resolveSettings(): void {
    const resolved = this._resolvedSettingsState;
    let selectedLease: ScreenSpaceReflectionLease | null = null;
    // Auto preserves the hardened whole-request consumer arbitration. Forced
    // modes use the manual camera settings so the global control is stable and
    // does not mutate or release dormant consumer requests.
    if (this._authorSettings.activationMode === ScreenSpaceReflectionActivationMode.Auto) {
      for (const lease of this._leases) {
        if (!selectedLease || ScreenSpaceReflection._compareConsumerLeases(lease, selectedLease) < 0) {
          selectedLease = lease;
        }
      }
    }

    const request = selectedLease?.request;
    resolved.quality = request?.quality ?? this._quality;
    resolved.resolutionScale = request?.resolutionScale ?? this._authorSettings.resolutionScale;
    resolved.upsamplingMode = request?.upsamplingMode ?? this._authorSettings.upsamplingMode;
    resolved.intensity = request?.intensity ?? this._authorSettings.intensity;
    resolved.maxRayDistance = request?.maxRayDistance ?? this._authorSettings.maxRayDistance;
    resolved.rayLengthFade = request?.rayLengthFade ?? this._authorSettings.rayLengthFade;
    const requestQualityTuning =
      request?.quality !== undefined ? ScreenSpaceReflection._qualityTuning(request.quality) : null;
    resolved.maxRaySteps =
      request?.maxRaySteps ?? requestQualityTuning?.maxRaySteps ?? this._authorSettings.maxRaySteps;
    resolved.hitRefinementSteps =
      request?.hitRefinementSteps ??
      requestQualityTuning?.hitRefinementSteps ??
      this._authorSettings.hitRefinementSteps;
    resolved.thickness = request?.thickness ?? this._authorSettings.thickness;
    resolved.maxRoughness = request?.maxRoughness ?? this._authorSettings.maxRoughness;
    resolved.edgeFade = request?.edgeFade ?? this._authorSettings.edgeFade;
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
      this._unpublish();
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
        (this._authorSettings.activationMode === ScreenSpaceReflectionActivationMode.Auto && scopedMode === undefined);
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
    resolved.resolutionScale =
      traceOverride?.resolutionScale ?? request?.resolutionScale ?? this._authorSettings.resolutionScale;
    resolved.upsamplingMode =
      traceOverride?.upsamplingMode ?? request?.upsamplingMode ?? this._authorSettings.upsamplingMode;
    // Camera intensity remains one ordinary camera uniform for the whole frame.
    // Receiver scoping isolates trace shape without introducing phase-stale camera uniforms.
    resolved.intensity = this._resolvedSettingsState.intensity;
    resolved.maxRayDistance =
      traceOverride?.maxRayDistance ?? request?.maxRayDistance ?? this._authorSettings.maxRayDistance;
    resolved.rayLengthFade =
      traceOverride?.rayLengthFade ?? request?.rayLengthFade ?? this._authorSettings.rayLengthFade;
    const overrideQualityTuning =
      traceOverride?.quality !== undefined ? ScreenSpaceReflection._qualityTuning(traceOverride.quality) : null;
    const requestQualityTuning =
      request?.quality !== undefined ? ScreenSpaceReflection._qualityTuning(request.quality) : null;
    resolved.maxRaySteps =
      traceOverride?.maxRaySteps ??
      overrideQualityTuning?.maxRaySteps ??
      request?.maxRaySteps ??
      requestQualityTuning?.maxRaySteps ??
      this._authorSettings.maxRaySteps;
    resolved.hitRefinementSteps =
      traceOverride?.hitRefinementSteps ??
      overrideQualityTuning?.hitRefinementSteps ??
      request?.hitRefinementSteps ??
      requestQualityTuning?.hitRefinementSteps ??
      this._authorSettings.hitRefinementSteps;
    resolved.thickness = traceOverride?.thickness ?? request?.thickness ?? this._authorSettings.thickness;
    resolved.maxRoughness = traceOverride?.maxRoughness ?? request?.maxRoughness ?? this._authorSettings.maxRoughness;
    resolved.edgeFade = traceOverride?.edgeFade ?? request?.edgeFade ?? this._authorSettings.edgeFade;
    return selectedLease;
  }

  private _resetRenderStats(): void {
    const metrics = this._metricsState;
    metrics.width = 0;
    metrics.height = 0;
    metrics.opaqueReceiverElementCount = 0;
    metrics.transparentReceiverElementCount = 0;
    metrics.maskedReceiverElementCount = 0;
    metrics.contributionColorDrawCount = 0;
    metrics.contributionDepthDrawCount = 0;
    metrics.contributionUnsupportedReason = null;
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

  private static _qualityTuning = ScreenSpaceReflectionConfig.qualityTuning;

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
    if (shaderData.getFloat(ScreenSpaceReflection._receiverModeProperty) !== ScreenSpaceReflectionReceiverMode.Disabled)
      shaderData.setFloat(ScreenSpaceReflection._receiverModeProperty, ScreenSpaceReflectionReceiverMode.Disabled);
    if (shaderData.getFloat(ScreenSpaceReflection._receiverIntensityProperty) !== 0)
      shaderData.setFloat(ScreenSpaceReflection._receiverIntensityProperty, 0);
    material._screenSpaceReflectionReceiverRegistered = false;
    shaderData.disableMacro(ScreenSpaceReflection._legacyReceiverMacro);
  }

  private static _sanitizeQuality = ScreenSpaceReflectionConfig.sanitizeQuality;
  /** @internal */
  static _sanitizeConsumerRequest = ScreenSpaceReflectionConfig.sanitizeConsumerRequest;
  private static _sanitizeTraceSettingsOverride = ScreenSpaceReflectionConfig.sanitizeTraceSettingsOverride;

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
