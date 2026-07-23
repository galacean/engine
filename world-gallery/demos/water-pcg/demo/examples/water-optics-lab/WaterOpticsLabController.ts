import { Camera, Downsampling, Engine, Layer } from "@galacean/engine-core";
import type { HeightfieldWaterRuntimeController } from "../../../runtime/heightfield/HeightfieldWaterRuntimeController";
import {
  HeightfieldWaterCompositionMode,
  HeightfieldWaterDebugMode,
  HeightfieldWaterOpticsCalibrationMode,
  HeightfieldWaterOpticsDebugOutput,
  HEIGHTFIELD_WATER_SHADER_DEBUG_MODE_BY_OUTPUT
} from "../../../runtime/heightfield/HeightfieldWaterRuntimeEnums";
import type { HeightfieldWaterFeatureFlags } from "../../../runtime/heightfield/types";
import type {
  CameraWaterFeatureBroker,
  CameraWaterFeatureMetrics,
  WaterCameraFeatureRequest
} from "../../../runtime/optics/CameraWaterFeatureBroker";
import type { WaterGpuTimer } from "../../../runtime/optics/WaterGpuTimer";
import type { WaterReflectionSource } from "../../../runtime/optics/WaterReflectionPolicy";
import {
  analyzeWaterOpticsReferencePixel,
  type WaterOpticsReferencePixelAnalysis
} from "../../../runtime/optics/WaterOpticsCompositionAnalysis";
import type {
  WaterReflectionBinding,
  WaterReflectionService,
  WaterReflectionServiceMetrics
} from "../../../runtime/optics/WaterReflectionService";
import { WaterOpticsDebugView as SharedWaterOpticsDebugView } from "../../../runtime/optics/WaterSurfaceOpticsTypes";
import {
  WATER_OPTICS_CAMERA_POSES,
  WATER_OPTICS_LEGACY_RENDER_PRIORITY,
  WATER_OPTICS_LAB_DEFAULTS,
  WATER_OPTICS_LAB_LOCAL_FOAM_MASK,
  WATER_OPTICS_LAB_OPTICAL_PROFILE,
  WATER_OPTICS_LAB_SURFACE_TIME,
  WATER_OPTICS_PRECOMPOSED_RENDER_PRIORITY,
  WATER_OPTICS_PURE_TRANSMISSION_PROFILE
} from "./constants";
import { createWaterOpticsLabMetrics, writeWaterOpticsLabMetrics } from "./WaterOpticsLabMetrics";
import { WATER_OPTICS_PLANAR_ORIENTATION_MARKERS } from "./WaterOpticsLabFixture";
import {
  createWaterOpticsPlanarAnchorExpectedPoint,
  type WaterOpticsPlanarAnchorExpectedPoint
} from "./WaterOpticsPlanarAnchorReference";
import {
  summarizeWaterOpticsP1PoolReadback,
  summarizeWaterOpticsP1SecondaryPoolReadback,
  WATER_OPTICS_P1_CONSUMERS,
  WATER_OPTICS_P1_OCEAN_CONSUMER_ID,
  WATER_OPTICS_P1_POOL_CONSUMER_ID,
  WATER_OPTICS_P1_RIVER_CONSUMER_ID,
  WATER_OPTICS_P1_SECONDARY_POOL_CONSUMER_ID,
  type WaterOpticsP1MatrixScene
} from "./WaterOpticsP1MatrixScene";
import type { WaterOpticsSecondaryPoolRuntime } from "./WaterOpticsSecondaryPoolRuntime";
import {
  WATER_OPTICS_FORMAL_SAMPLING_MINIMUMS,
  WaterOpticsPerformanceSampler,
  type WaterOpticsPerformanceCaptureOptions,
  type WaterOpticsPerformanceReport,
  type WaterOpticsPerformanceSamplerDependencies
} from "./WaterOpticsPerformanceSampler";
import type {
  WaterOpticsCameraPreset,
  WaterOpticsCalibrationMode,
  WaterOpticsCompositionMode,
  WaterOpticsDebugView,
  WaterOpticsLabApi,
  WaterOpticsLabMetrics,
  WaterOpticsLabProbeSnapshot,
  WaterOpticsLifecycleStressResult,
  WaterOpticsP1LifecycleStressResult,
  WaterOpticsP1MatrixMetrics,
  WaterOpticsP1PlanarConsumer,
  WaterOpticsPerformanceCapabilities,
  WaterOpticsPreset,
  WaterOpticsReferencePixelInput,
  WaterOpticsReflectionMode,
  WaterOpticsTransparentOrderingProbeMode,
  WaterOpticsTier,
  WaterOpticsWaterBody
} from "./types";

const WATER_LAYER_MASK = Layer.Layer30;

interface MutableWaterSurfaceOpticsBinding {
  tier: WaterOpticsTier;
  readonly opticalProfile: typeof WATER_OPTICS_LAB_OPTICAL_PROFILE;
  refractionEnabled: boolean;
  reflection: Readonly<WaterReflectionBinding> | undefined;
  readonly reflectionSampling: { highFilterSampleCount: 1 | 5 };
  debugView: SharedWaterOpticsDebugView | number;
}

function resolveHeightfieldDebugMode(view: WaterOpticsDebugView): HeightfieldWaterDebugMode | undefined {
  if (view === "final" || view === HeightfieldWaterOpticsDebugOutput.FinalFramebufferColor) {
    return HeightfieldWaterDebugMode.Final;
  }
  return HEIGHTFIELD_WATER_SHADER_DEBUG_MODE_BY_OUTPUT[view as HeightfieldWaterOpticsDebugOutput];
}

interface WaterOpticsLabRuntimeSnapshot {
  readonly sourceHash: string;
  readonly fixtureObjectCount: number;
  readonly waterBodyCount: number;
  readonly transparentOrderingProbeMode: WaterOpticsTransparentOrderingProbeMode;
  readonly transparentSentinelPriority: number;
  readonly transparentSentinelNormalPriority: number;
  readonly transparentSentinelTransparent: boolean;
  readonly planarOrientationMarkersVisible: boolean;
  readonly reflectorVisible: boolean;
  readonly reflectorTime: number;
  readonly reflectorWorldPosition: readonly [number, number, number];
  readonly runtimeError: string;
}

export interface WaterOpticsLabControllerOptions {
  readonly engine: Engine;
  readonly camera: Camera;
  readonly cameraFeatures: CameraWaterFeatureBroker;
  readonly reflectionService: WaterReflectionService;
  readonly gpuTimer: WaterGpuTimer;
  readonly waterRuntime: HeightfieldWaterRuntimeController;
  readonly secondaryWaterRuntime: WaterOpticsSecondaryPoolRuntime;
  readonly p1Matrix: WaterOpticsP1MatrixScene;
  readonly setPrimaryPoolVisible: (visible: boolean) => void;
  readonly setSecondaryPoolVisible: (visible: boolean) => void;
  readonly setPlanarAnchorVisible: (visible: boolean) => void;
  readonly setPlanarOrientationMarkersVisible: (visible: boolean) => void;
  readonly setReflectorTime: (seconds: number) => void;
  readonly setFreeCameraControlEnabled: (enabled: boolean) => void;
  readonly setTransparentOrderingProbeMode: (mode: WaterOpticsTransparentOrderingProbeMode) => void;
  readonly ensureSecondaryPoolRuntime: () => Promise<void>;
  readonly releaseSecondaryPoolRuntime: () => void;
  readonly statusElement: HTMLSpanElement;
  readonly metricsElement: HTMLDListElement;
  readonly statsEnabled: boolean;
  readonly strictQuality: boolean;
  readonly initialTier: WaterOpticsTier;
  readonly initialPreset: WaterOpticsPreset;
  readonly initialSurfaceTime: number;
  readonly initialFrozen: boolean;
  readonly rebuildTier: (tier: WaterOpticsTier) => Promise<void>;
  readonly getRuntimeSnapshot: () => WaterOpticsLabRuntimeSnapshot;
  readonly getProbeSnapshot: () => WaterOpticsLabProbeSnapshot;
}

export class WaterOpticsLabController implements WaterOpticsLabApi {
  private _requestedTier: WaterOpticsTier;
  private _resolvedTier: WaterOpticsTier;
  private _tierFallbackReason?: string;
  private _preset: WaterOpticsPreset;
  private _cameraPreset: WaterOpticsCameraPreset = "overview";
  private _waterBody: WaterOpticsWaterBody = "pool";
  private _reflectionMode: WaterOpticsReflectionMode = WATER_OPTICS_LAB_DEFAULTS.reflectionMode;
  private _reflectionSource: WaterReflectionSource = WATER_OPTICS_LAB_DEFAULTS.reflectionMode;
  private _refractionEnabled = true;
  private _compositionMode: WaterOpticsCompositionMode = "legacy";
  private _depthWriteEnabled = false;
  private _planarClipEnabled = true;
  private _debugView: WaterOpticsDebugView = "final";
  private _calibrationMode: WaterOpticsCalibrationMode = "none";
  private _calibrationFeatureFlags: Readonly<HeightfieldWaterFeatureFlags> = Object.freeze({
    waves: true,
    microNormals: true,
    foam: true
  });
  private _planarAnchorVisible = false;
  private _planarOrientationMarkersVisible = true;
  private _localFoamMaskEnabled = true;
  private _planarFilterEnabled: boolean = WATER_OPTICS_LAB_DEFAULTS.planarFilterEnabled;
  private _performanceOpticsEnabled = true;
  private _frozen = false;
  private _reflectorMovementEnabled = true;
  private _reflectorTimeOverride?: number;
  private _cameraMovementEnabled = false;
  private _freeCameraEnabled = false;
  private _cameraCutCount = 0;
  private _tierRevision = 0;
  private _bodyRevision = 0;
  private _tierCompilePending = false;
  private _surfaceTime: number;
  private _statsPanelVisible: boolean;
  private readonly _statsPanels: HTMLElement[] = [];
  private _ready = false;
  private _runtimeError = "";
  private _lastPerformanceReport?: WaterOpticsPerformanceReport;
  private _frameIndex = 0;
  private _p1PoolVisible = true;
  private _p1RiverVisible = true;
  private _p1OceanVisible = true;
  private _p1SecondaryPoolVisible = true;
  private readonly _p1SharedBinding: MutableWaterSurfaceOpticsBinding;
  private _lastPrimaryBinding?: Readonly<MutableWaterSurfaceOpticsBinding>;
  private _lastSecondaryPoolBinding?: Readonly<MutableWaterSurfaceOpticsBinding>;
  private _experimentalRenderTargetCreateBaseline?: number;
  private _experimentalAdditionalRenderTargetCount = 0;
  private _performanceCaptureActive = false;
  private readonly _performanceSampler: WaterOpticsPerformanceSampler;
  private readonly _listeners: Array<readonly [Element, string, EventListener]> = [];

  constructor(private readonly _options: WaterOpticsLabControllerOptions) {
    this._requestedTier = _options.initialTier;
    this._resolvedTier = this._resolveTier(_options.initialTier);
    this._preset = _options.initialPreset;
    this._surfaceTime = _options.initialSurfaceTime;
    this._statsPanelVisible = _options.statsEnabled;
    this._p1SharedBinding = {
      tier: this._requestedTier,
      opticalProfile: WATER_OPTICS_LAB_OPTICAL_PROFILE,
      refractionEnabled: true,
      reflection: undefined,
      reflectionSampling: { highFilterSampleCount: this._planarFilterEnabled ? 5 : 1 },
      debugView: SharedWaterOpticsDebugView.Final
    };
    this._performanceSampler = new WaterOpticsPerformanceSampler(this._createPerformanceDependencies());
    this._options.waterRuntime.setLocalFoamMask({
      enabled: this._localFoamMaskEnabled,
      centerXZ: WATER_OPTICS_LAB_LOCAL_FOAM_MASK.centerXZ,
      halfSizeXZ: WATER_OPTICS_LAB_LOCAL_FOAM_MASK.halfSizeXZ,
      featherMeters: WATER_OPTICS_LAB_LOCAL_FOAM_MASK.featherMeters
    });
    this._options.setPlanarOrientationMarkersVisible(this._planarOrientationMarkersVisible);
    this._options.setReflectorTime(this._surfaceTime);

    this._mountControls();
    this.setPlanarFilterEnabled(this._planarFilterEnabled);
    this._applyTierRequests();
    this.setCameraPreset(this._cameraPreset);
    void this.setPreset(this._preset);
    // The Lab demonstrates the P0 single-main-water solution. The reusable
    // runtime keeps legacy alpha as its compatibility default.
    this.setCompositionMode("precomposed");
    this.freezeTime(_options.initialFrozen);
    this._writeStatus("compiling fixed fixture", "loading");
  }

  get ready(): boolean {
    return this._ready;
  }

  get requestedTier(): WaterOpticsTier {
    return this._requestedTier;
  }

  get resolvedTier(): WaterOpticsTier {
    return this._resolvedTier;
  }

  get fallbackReason(): string | undefined {
    return this._tierFallbackReason;
  }

  get freeCameraEnabled(): boolean {
    return this._freeCameraEnabled;
  }

  get metrics(): WaterOpticsLabMetrics {
    const runtime = this._options.getRuntimeSnapshot();
    const cameraFeatures = this._options.cameraFeatures.metrics;
    const reflection = this._options.reflectionService.metrics;
    const p1 = this._createP1Metrics(reflection, cameraFeatures);
    const opticsMetricConsumerId =
      this._waterBody === "river"
        ? WATER_OPTICS_P1_RIVER_CONSUMER_ID
        : this._waterBody === "ocean"
          ? WATER_OPTICS_P1_OCEAN_CONSUMER_ID
          : this._waterBody === "multi"
            ? (reflection.renderedPlanarOwnerId ?? WATER_OPTICS_P1_POOL_CONSUMER_ID)
            : WATER_OPTICS_P1_POOL_CONSUMER_ID;
    const reflectionBinding = this._options.reflectionService.getBinding(opticsMetricConsumerId);
    const activeBodyReadback =
      opticsMetricConsumerId === WATER_OPTICS_P1_RIVER_CONSUMER_ID
        ? p1.bodyReadbacks.river
        : opticsMetricConsumerId === WATER_OPTICS_P1_OCEAN_CONSUMER_ID
          ? p1.bodyReadbacks.ocean
          : opticsMetricConsumerId === WATER_OPTICS_P1_SECONDARY_POOL_CONSUMER_ID
            ? p1.bodyReadbacks.secondaryPool
            : p1.bodyReadbacks.pool;
    const waterRendererPriority = this._options.waterRuntime.renderPriority;
    const activeWaterRendererPriority = this._options.waterRuntime.activeRenderPriority;
    const waterBlendEnabled = this._options.waterRuntime.activeBlendEnabled;
    const localFoamMask = this._options.waterRuntime.localFoamMask;
    const cameraTransform = this._options.camera.entity.transform;
    const cameraPosition = cameraTransform.worldPosition;
    const cameraForward = cameraTransform.worldForward;
    return createWaterOpticsLabMetrics({
      state: {
        ready: this._ready,
        requestedTier: this._requestedTier,
        resolvedTier: this._resolvedTier,
        fallbackReason: this._tierFallbackReason,
        preset: this._preset,
        cameraPreset: this._cameraPreset,
        waterBody: this._waterBody,
        opticsMetricConsumerId,
        reflectionMode: this._reflectionMode,
        reflectionSource: this._reflectionSource,
        refractionEnabled: this._refractionEnabled,
        compositionMode: this._compositionMode,
        depthWriteEnabled: this._depthWriteEnabled,
        waterRendererPriority,
        activeWaterRendererPriority,
        waterBlendEnabled,
        transparentOrderingProbeMode: runtime.transparentOrderingProbeMode,
        transparentSentinelPriority: runtime.transparentSentinelPriority,
        transparentSentinelNormalPriority: runtime.transparentSentinelNormalPriority,
        transparentSentinelTransparent: runtime.transparentSentinelTransparent,
        transparentOrderingContractSatisfied:
          this._compositionMode === "precomposed" &&
          waterBlendEnabled === false &&
          activeWaterRendererPriority === waterRendererPriority &&
          runtime.transparentSentinelTransparent &&
          waterRendererPriority < runtime.transparentSentinelNormalPriority,
        transparentOrderingProbeWaterFirst:
          runtime.transparentOrderingProbeMode !== "hidden" &&
          waterRendererPriority < runtime.transparentSentinelPriority,
        planarClipEnabled: this._planarClipEnabled,
        debugView: this._debugView,
        calibrationMode: this._calibrationMode,
        calibrationFeatureFlags: this._calibrationFeatureFlags,
        calibrationReferenceCompositionEnabled:
          this._options.waterRuntime.activeOpticsCalibrationReadback?.referenceCompositionEnabled ?? false,
        calibrationEffectiveFresnelOverride:
          this._options.waterRuntime.activeOpticsCalibrationReadback?.effectiveFresnelOverride,
        calibrationOpticalProfile: this._options.waterRuntime.activeSurfaceOpticsReadback?.opticalProfile,
        opticalDepthNormalizationMeters:
          this._options.waterRuntime.activeData?.localMapAtlas.maxDepth ??
          WATER_OPTICS_LAB_OPTICAL_PROFILE.maximumSurfaceOpticalDistance ??
          0,
        planarAnchorVisible: this._planarAnchorVisible,
        planarOrientationMarkersVisible: runtime.planarOrientationMarkersVisible,
        localFoamMaskEnabled: localFoamMask.enabled,
        localFoamMaskCenterXZ: localFoamMask.centerXZ,
        localFoamMaskHalfSizeXZ: localFoamMask.halfSizeXZ,
        localFoamMaskFeatherMeters: localFoamMask.featherMeters,
        localFoamMaskSuppressesRefraction: true,
        reflectorMovementEnabled: this._reflectorMovementEnabled,
        reflectorVisible: runtime.reflectorVisible,
        reflectorTimeOverrideActive: this._reflectorTimeOverride !== undefined,
        reflectorAnimating:
          this._reflectorMovementEnabled && !this._frozen && this._reflectorTimeOverride === undefined,
        reflectorTime: runtime.reflectorTime,
        reflectorWorldPosition: runtime.reflectorWorldPosition,
        cameraMovementEnabled: this._cameraMovementEnabled,
        freeCameraEnabled: this._freeCameraEnabled,
        cameraWorldPosition: Object.freeze([cameraPosition.x, cameraPosition.y, cameraPosition.z] as const),
        cameraWorldForward: Object.freeze([cameraForward.x, cameraForward.y, cameraForward.z] as const),
        cameraCutCount: this._cameraCutCount,
        frozen: this._frozen,
        surfaceTime: this._surfaceTime,
        statsEnabled: this._options.statsEnabled,
        statsPanelVisible: this._statsPanelVisible,
        sourceHash: runtime.sourceHash,
        fixtureObjectCount: runtime.fixtureObjectCount,
        waterBodyCount: runtime.waterBodyCount,
        runtimeError: this._runtimeError || runtime.runtimeError
      },
      cameraFeatures,
      reflection,
      reflectionBinding,
      reflectionSampling:
        opticsMetricConsumerId === WATER_OPTICS_P1_POOL_CONSUMER_ID
          ? this._options.waterRuntime.activeReflectionSampling
          : undefined,
      activeBodyReadback,
      p1,
      probe: this._options.getProbeSnapshot(),
      engineMemory: this._options.engine.renderingStatistics
    });
  }

  async setTier(tier: WaterOpticsTier): Promise<void> {
    const tierRevision = ++this._tierRevision;
    const previousResolvedTier = this._resolvedTier;
    const runtimeReady = this._ready;
    if (tier === "experimental") {
      this._experimentalRenderTargetCreateBaseline = this._options.reflectionService.metrics.renderTargetCreateCount;
    } else {
      this._experimentalRenderTargetCreateBaseline = undefined;
      this._experimentalAdditionalRenderTargetCount = 0;
    }
    this._requestedTier = tier;
    this._resolvedTier = this._resolveTier(tier);
    this._options.p1Matrix.setTier(tier);
    this._applyTierRequests();
    if (runtimeReady && previousResolvedTier === this._resolvedTier) {
      this._tierCompilePending = false;
      this.markReady();
      if (tier === "experimental" && this._experimentalRenderTargetCreateBaseline !== undefined) {
        this._experimentalAdditionalRenderTargetCount = Math.max(
          0,
          this._options.reflectionService.metrics.renderTargetCreateCount - this._experimentalRenderTargetCreateBaseline
        );
      }
      return;
    }
    this._tierCompilePending = true;
    this._ready = false;
    this._writeStatus(`compiling ${this._resolvedTier}`, "loading");
    try {
      await this._options.rebuildTier(this._resolvedTier);
      if (tierRevision !== this._tierRevision) return;
      while (this._options.p1Matrix.mode === "dual-pool") {
        const bodyRevision = this._bodyRevision;
        await this._options.ensureSecondaryPoolRuntime();
        if (tierRevision !== this._tierRevision) return;
        if (bodyRevision === this._bodyRevision && this._options.p1Matrix.mode === "dual-pool") break;
      }
      if (this._options.p1Matrix.mode !== "dual-pool") this._options.releaseSecondaryPoolRuntime();
      this._tierCompilePending = false;
      this.markReady();
      if (tier === "experimental" && this._experimentalRenderTargetCreateBaseline !== undefined) {
        this._experimentalAdditionalRenderTargetCount = Math.max(
          0,
          this._options.reflectionService.metrics.renderTargetCreateCount - this._experimentalRenderTargetCreateBaseline
        );
      }
    } catch (error) {
      if (tierRevision !== this._tierRevision) return;
      this._tierCompilePending = false;
      this.markError(error);
      throw error;
    }
  }

  async setPreset(preset: WaterOpticsPreset): Promise<void> {
    const bodyRevision = ++this._bodyRevision;
    this._preset = preset;
    const p1Mode =
      preset === "cross-body-optics" || preset === "lifecycle-stress"
        ? "cross-body"
        : preset === "multi-water-arbitration"
          ? "dual-pool"
          : "inactive";
    this._waterBody = p1Mode === "inactive" ? "pool" : "multi";
    this._options.p1Matrix.setMode(p1Mode);
    if (p1Mode !== "dual-pool") this._options.releaseSecondaryPoolRuntime();
    this._options.setPrimaryPoolVisible(true);
    this._options.setSecondaryPoolVisible(p1Mode === "dual-pool");
    this._options.p1Matrix.setRiverVisible(true);
    this._options.p1Matrix.setOceanVisible(true);
    if (p1Mode !== "inactive") {
      this._reflectionMode = "planar";
      this._reflectionSource = "planar";
      this._p1PoolVisible = true;
      this._p1RiverVisible = true;
      this._p1OceanVisible = true;
      this._p1SecondaryPoolVisible = true;
      this._applyTierRequests();
    } else {
      this._options.reflectionService.removeRequest(WATER_OPTICS_P1_RIVER_CONSUMER_ID);
      this._options.reflectionService.removeRequest(WATER_OPTICS_P1_OCEAN_CONSUMER_ID);
      this._applyReflectionRequest();
    }
    if (preset === "reflection-correctness") this.setCameraPreset("reflection-front");
    else if (preset === "refraction-correctness") this.setCameraPreset("depth-steps");
    else if (preset === "cross-body-optics" || preset === "lifecycle-stress") this.setCameraPreset("multi-water");
    else if (preset === "multi-water-arbitration") this.setCameraPreset("multi-pool");
    this._syncControlState();
    if (p1Mode !== "dual-pool" && !this._tierCompilePending && this._options.waterRuntime.activeData) this.markReady();
    if (p1Mode === "dual-pool") {
      this._ready = false;
      this._writeStatus("creating secondary Heightfield Pool", "loading");
      try {
        await this._options.ensureSecondaryPoolRuntime();
        if (bodyRevision !== this._bodyRevision) {
          if (this._options.p1Matrix.mode !== "dual-pool") this._options.releaseSecondaryPoolRuntime();
          return;
        }
        if (this._options.p1Matrix.mode === "dual-pool" && !this._tierCompilePending) this.markReady();
      } catch (error) {
        if (bodyRevision !== this._bodyRevision || this._tierCompilePending) {
          if (this._options.p1Matrix.mode !== "dual-pool") this._options.releaseSecondaryPoolRuntime();
          return;
        }
        this.markError(error);
        throw error;
      }
    }
  }

  async setWaterBody(body: WaterOpticsWaterBody): Promise<void> {
    const bodyRevision = ++this._bodyRevision;
    this._waterBody = body;
    const dualPool = body === "multi" && this._preset === "multi-water-arbitration";
    const mode = body === "pool" ? "inactive" : dualPool ? "dual-pool" : "cross-body";
    this._options.p1Matrix.setMode(mode);
    if (!dualPool) this._options.releaseSecondaryPoolRuntime();
    this._p1PoolVisible = body === "pool" || body === "multi";
    this._p1RiverVisible = body === "river" || body === "multi";
    this._p1OceanVisible = (body === "ocean" || body === "multi") && mode === "cross-body";
    this._p1SecondaryPoolVisible = dualPool;
    this._options.setPrimaryPoolVisible(this._p1PoolVisible);
    this._options.setSecondaryPoolVisible(this._p1SecondaryPoolVisible);
    this._options.p1Matrix.setRiverVisible(this._p1RiverVisible);
    this._options.p1Matrix.setOceanVisible(this._p1OceanVisible);
    if (body === "pool") this.setCameraPreset("reflection-front");
    else this.setCameraPreset(dualPool ? "multi-pool" : "multi-water");
    if (this._reflectionMode === "auto") this._reflectionSource = this._resolveAutoReflectionSource();
    this._applyTierRequests();
    this._syncControlState();
    if (!dualPool) {
      if (!this._tierCompilePending && this._options.waterRuntime.activeData) this.markReady();
      return;
    }
    this._ready = false;
    this._writeStatus("creating secondary Heightfield Pool", "loading");
    try {
      await this._options.ensureSecondaryPoolRuntime();
      if (bodyRevision !== this._bodyRevision) {
        if (this._options.p1Matrix.mode !== "dual-pool") this._options.releaseSecondaryPoolRuntime();
        return;
      }
      if (this._options.p1Matrix.mode === "dual-pool" && !this._tierCompilePending) this.markReady();
    } catch (error) {
      if (bodyRevision !== this._bodyRevision || this._tierCompilePending) {
        if (this._options.p1Matrix.mode !== "dual-pool") this._options.releaseSecondaryPoolRuntime();
        return;
      }
      this.markError(error);
      throw error;
    }
  }

  setReflectionMode(mode: WaterOpticsReflectionMode): void {
    if (mode === "ssr") throw new Error("SSR requires the separately approved P2 Engine Core RFC.");
    this._reflectionMode = mode;
    this._reflectionSource = mode === "auto" ? this._resolveAutoReflectionSource() : mode;
    this._applyTierRequests();
    this._syncControlState();
  }

  setReflectionSource(source: WaterReflectionSource): void {
    this.setReflectionMode(source);
  }

  setRefractionEnabled(enabled: boolean): void {
    this._refractionEnabled = enabled;
    this._options.waterRuntime.setRefractionEnabled(enabled);
    this._options.secondaryWaterRuntime.setRefractionEnabled(enabled);
    this._syncControlState();
  }

  setCompositionMode(mode: WaterOpticsCompositionMode): void {
    if (mode === "dedicated") {
      throw new Error("Dedicated Water Composite requires the separately approved P2 Engine Core RFC.");
    }
    this._compositionMode = mode;
    const renderPriority =
      mode === "precomposed" ? WATER_OPTICS_PRECOMPOSED_RENDER_PRIORITY : WATER_OPTICS_LEGACY_RENDER_PRIORITY;
    this._options.waterRuntime.setRenderPriority(renderPriority);
    this._options.secondaryWaterRuntime.setRenderPriority(renderPriority);
    this._options.waterRuntime.setCompositionMode(
      mode === "precomposed"
        ? HeightfieldWaterCompositionMode.PrecomposedReplace
        : HeightfieldWaterCompositionMode.LegacyAlpha
    );
    this._options.secondaryWaterRuntime.setCompositionMode(
      mode === "precomposed"
        ? HeightfieldWaterCompositionMode.PrecomposedReplace
        : HeightfieldWaterCompositionMode.LegacyAlpha
    );
    this._syncControlState();
  }

  setTransparentOrderingProbeMode(mode: WaterOpticsTransparentOrderingProbeMode): void {
    this._options.setTransparentOrderingProbeMode(mode);
    this._syncControlState();
  }

  setDepthWriteEnabled(enabled: boolean): void {
    this._depthWriteEnabled = enabled;
    this._options.waterRuntime.setDepthWriteEnabled(enabled);
    this._options.secondaryWaterRuntime.setDepthWriteEnabled(enabled);
    this._syncControlState();
  }

  setPlanarClipEnabled(enabled: boolean): void {
    this._planarClipEnabled = enabled;
    this._applyReflectionRequest();
    this._syncControlState();
  }

  setDebugView(view: WaterOpticsDebugView): void {
    const debugMode = resolveHeightfieldDebugMode(view);
    if (debugMode === undefined) {
      throw new Error(`Water Optics debug view ${view} requires an unavailable Experimental pass.`);
    }
    this._debugView = view;
    this._options.waterRuntime.setDebugMode(debugMode);
    this._syncControlState();
  }

  setCalibrationMode(mode: WaterOpticsCalibrationMode): void {
    this._calibrationMode = mode;
    const runtimeMode =
      mode === "cpu-reference"
        ? HeightfieldWaterOpticsCalibrationMode.CpuReference
        : mode === "pure-transmission"
          ? HeightfieldWaterOpticsCalibrationMode.PureTransmission
          : HeightfieldWaterOpticsCalibrationMode.None;
    const profile =
      mode === "pure-transmission" ? WATER_OPTICS_PURE_TRANSMISSION_PROFILE : WATER_OPTICS_LAB_OPTICAL_PROFILE;
    this._options.waterRuntime.setOpticalProfile(profile);
    this._options.waterRuntime.setOpticsCalibrationMode(runtimeMode);
    this._syncControlState();
  }

  setCalibrationFeatureFlags(flags: HeightfieldWaterFeatureFlags): void {
    this._calibrationFeatureFlags = Object.freeze({
      waves: flags.waves === true,
      microNormals: flags.microNormals === true,
      foam: flags.foam === true
    });
    this._options.waterRuntime.setFeatureFlags(this._calibrationFeatureFlags);
    this._syncControlState();
  }

  setPlanarAnchorVisible(visible: boolean): void {
    this._planarAnchorVisible = visible;
    this._options.setPlanarAnchorVisible(visible);
    this._syncControlState();
  }

  setPlanarOrientationMarkersVisible(visible: boolean): void {
    this._planarOrientationMarkersVisible = visible;
    this._options.setPlanarOrientationMarkersVisible(visible);
    this._syncControlState();
  }

  getPlanarAnchorExpectedPoint(): Readonly<WaterOpticsPlanarAnchorExpectedPoint> {
    return createWaterOpticsPlanarAnchorExpectedPoint(this._options.camera);
  }

  getPlanarOrientationExpectedPoints(): Readonly<
    Record<"left" | "right" | "up" | "down", Readonly<WaterOpticsPlanarAnchorExpectedPoint>>
  > {
    return Object.freeze({
      left: createWaterOpticsPlanarAnchorExpectedPoint(
        this._options.camera,
        WATER_OPTICS_PLANAR_ORIENTATION_MARKERS.left.position
      ),
      right: createWaterOpticsPlanarAnchorExpectedPoint(
        this._options.camera,
        WATER_OPTICS_PLANAR_ORIENTATION_MARKERS.right.position
      ),
      up: createWaterOpticsPlanarAnchorExpectedPoint(
        this._options.camera,
        WATER_OPTICS_PLANAR_ORIENTATION_MARKERS.up.position
      ),
      down: createWaterOpticsPlanarAnchorExpectedPoint(
        this._options.camera,
        WATER_OPTICS_PLANAR_ORIENTATION_MARKERS.down.position
      )
    });
  }

  analyzeReferencePixel(input: WaterOpticsReferencePixelInput): Readonly<WaterOpticsReferencePixelAnalysis> {
    const profile =
      this._options.waterRuntime.activeSurfaceOpticsReadback?.opticalProfile ??
      (this._calibrationMode === "pure-transmission"
        ? WATER_OPTICS_PURE_TRANSMISSION_PROFILE
        : WATER_OPTICS_LAB_OPTICAL_PROFILE);
    return analyzeWaterOpticsReferencePixel({ ...input, profile });
  }

  setPlanarFilterEnabled(enabled: boolean): void {
    this._planarFilterEnabled = enabled;
    this._p1SharedBinding.reflectionSampling.highFilterSampleCount = enabled ? 5 : 1;
    this._options.waterRuntime.setReflectionSamplingConfig({ highFilterSampleCount: enabled ? 5 : 1 });
    this._syncControlState();
  }

  setCameraPreset(preset: WaterOpticsCameraPreset): void {
    this._setFreeCameraControlEnabled(false);
    this._cameraPreset = preset;
    this._applyCameraPose(this._motionTime());
    this._syncControlState();
  }

  setCameraMovementEnabled(enabled: boolean): void {
    this._setFreeCameraControlEnabled(false);
    this._cameraMovementEnabled = enabled;
    this._applyCameraPose(this._motionTime());
    this._syncControlState();
  }

  setFreeCameraEnabled(enabled: boolean): void {
    if (enabled) {
      this._cameraMovementEnabled = false;
      this._setFreeCameraControlEnabled(true);
    } else {
      this._setFreeCameraControlEnabled(false);
      this._applyCameraPose(this._motionTime());
    }
    this._syncControlState();
  }

  cameraCut(): void {
    this._setFreeCameraControlEnabled(false);
    this._cameraCutCount++;
    this._applyCameraPose(this._motionTime());
    this._syncControlState();
  }

  setReflectorMovementEnabled(enabled: boolean): void {
    if (enabled) {
      this._reflectorTimeOverride = undefined;
    } else if (this._reflectorMovementEnabled || this._reflectorTimeOverride === undefined) {
      this._reflectorTimeOverride = this._options.getRuntimeSnapshot().reflectorTime;
    }
    this._reflectorMovementEnabled = enabled;
    this._updateDemoMotion();
    this._syncControlState();
  }

  setReflectorTime(seconds: number): void {
    if (!Number.isFinite(seconds) || seconds < 0)
      throw new RangeError("Reflector time must be finite and non-negative.");
    this._reflectorTimeOverride = seconds;
    this._options.setReflectorTime(seconds);
    this._syncControlState();
  }

  clearReflectorTimeOverride(): void {
    this._reflectorTimeOverride = undefined;
    this._updateDemoMotion();
    this._syncControlState();
  }

  setLocalFoamMaskEnabled(enabled: boolean): void {
    this._localFoamMaskEnabled = enabled;
    this._options.waterRuntime.setLocalFoamMask({
      enabled,
      centerXZ: WATER_OPTICS_LAB_LOCAL_FOAM_MASK.centerXZ,
      halfSizeXZ: WATER_OPTICS_LAB_LOCAL_FOAM_MASK.halfSizeXZ,
      featherMeters: WATER_OPTICS_LAB_LOCAL_FOAM_MASK.featherMeters
    });
    this._syncControlState();
  }

  setStatsPanelVisible(visible: boolean): void {
    this._statsPanelVisible = this._options.statsEnabled && visible;
    this._applyStatsPanelVisibility();
  }

  freezeTime(enabled: boolean): void {
    this._frozen = enabled;
    this._options.waterRuntime.setSurfaceTimeOverride(enabled ? this._surfaceTime : undefined);
    this._options.secondaryWaterRuntime.setSurfaceTimeOverride(enabled ? this._surfaceTime : undefined);
    this._options.p1Matrix.setSurfaceTimeOverride(enabled ? this._surfaceTime : undefined);
    this._updateDemoMotion();
    this._syncControlState();
  }

  stepFrame(): void {
    if (!this._frozen) this.freezeTime(true);
    this._surfaceTime += 1 / 60;
    this._options.waterRuntime.setSurfaceTimeOverride(this._surfaceTime);
    this._options.secondaryWaterRuntime.setSurfaceTimeOverride(this._surfaceTime);
    this._options.p1Matrix.setSurfaceTimeOverride(this._surfaceTime);
    this._updateDemoMotion();
  }

  async runLifecycleStress(iterations = 10): Promise<WaterOpticsLifecycleStressResult> {
    const boundedIterations = Math.max(1, Math.min(100, Math.floor(iterations)));
    const initial = this._options.reflectionService.metrics;
    const originalMode = this._reflectionMode;
    for (let index = 0; index < boundedIterations; index++) {
      this.setReflectionSource(index % 2 === 0 ? "planar" : "sky");
      this._updateReflectionAndMaterial();
      await Promise.resolve();
    }
    this.setReflectionMode(originalMode);
    this._updateReflectionAndMaterial();
    const final = this._options.reflectionService.metrics;
    return Object.freeze({
      iterations: boundedIterations,
      initialPlanarCreateCount: initial.renderTargetCreateCount,
      finalPlanarCreateCount: final.renderTargetCreateCount,
      initialPlanarDestroyCount: initial.renderTargetDestroyCount,
      finalPlanarDestroyCount: final.renderTargetDestroyCount,
      runtimeError: this._runtimeError
    });
  }

  setP1PlanarConsumerVisible(consumer: WaterOpticsP1PlanarConsumer, visible: boolean): void {
    if (consumer === "pool") {
      this._p1PoolVisible = visible;
      this._options.setPrimaryPoolVisible(visible);
    } else if (consumer === "secondary-pool") {
      this._p1SecondaryPoolVisible = visible;
      this._options.setSecondaryPoolVisible(visible && this._options.p1Matrix.mode === "dual-pool");
    } else {
      this._p1OceanVisible = visible;
      this._options.p1Matrix.setOceanVisible(visible);
    }
    this._applyTierRequests();
  }

  resetP1PlanarConsumers(): void {
    this._p1PoolVisible = true;
    this._p1RiverVisible = true;
    this._p1OceanVisible = true;
    this._p1SecondaryPoolVisible = true;
    this._options.setPrimaryPoolVisible(true);
    this._options.setSecondaryPoolVisible(this._options.p1Matrix.mode === "dual-pool");
    this._options.p1Matrix.setRiverVisible(true);
    this._options.p1Matrix.setOceanVisible(true);
    this._applyTierRequests();
  }

  async runP1LifecycleStress(iterations = 10): Promise<WaterOpticsP1LifecycleStressResult> {
    if (!this._options.p1Matrix.active) {
      throw new Error("P1 lifecycle stress requires cross-body-optics or multi-water-arbitration.");
    }
    const boundedIterations = Math.max(1, Math.min(100, Math.floor(iterations)));
    const initial = this._options.reflectionService.metrics;
    let requestAddCount = 0;
    let requestRemoveCount = 0;
    const lifecycleRequestIds =
      this._options.p1Matrix.mode === "dual-pool"
        ? ([WATER_OPTICS_P1_RIVER_CONSUMER_ID, WATER_OPTICS_P1_SECONDARY_POOL_CONSUMER_ID] as const)
        : ([WATER_OPTICS_P1_RIVER_CONSUMER_ID, WATER_OPTICS_P1_OCEAN_CONSUMER_ID] as const);
    for (let index = 0; index < boundedIterations; index++) {
      for (const requestId of lifecycleRequestIds) {
        requestRemoveCount += Number(this._options.reflectionService.removeRequest(requestId));
      }
      this._options.reflectionService.update(this._frameIndex++);
      if (this._options.p1Matrix.mode === "dual-pool") this._applyP1DualPoolReflectionRequest();
      else this._applyP1AuxiliaryReflectionRequests();
      requestAddCount += lifecycleRequestIds.length;
      this._options.reflectionService.update(this._frameIndex++);
      await Promise.resolve();
    }
    const final = this._options.reflectionService.metrics;
    const initialLiveRenderTargetCount = initial.liveRenderTargetCount ?? (initial.renderTargetWidth > 0 ? 1 : 0);
    const finalLiveRenderTargetCount = final.liveRenderTargetCount ?? (final.renderTargetWidth > 0 ? 1 : 0);
    const renderTargetCreateGrowth = final.renderTargetCreateCount - initial.renderTargetCreateCount;
    const reflectionCameraCreateGrowth =
      (final.reflectionCameraCreateCount ?? 0) - (initial.reflectionCameraCreateCount ?? 0);
    return Object.freeze({
      iterations: boundedIterations,
      requestAddCount,
      requestRemoveCount,
      initialActiveConsumerCount: initial.activeConsumerCount,
      finalActiveConsumerCount: final.activeConsumerCount,
      initialLiveRenderTargetCount,
      finalLiveRenderTargetCount,
      initialPlanarCameraCount: initial.planarCameraCount,
      finalPlanarCameraCount: final.planarCameraCount,
      renderTargetCreateGrowth,
      reflectionCameraCreateGrowth,
      balanced:
        requestAddCount === requestRemoveCount &&
        initial.activeConsumerCount === final.activeConsumerCount &&
        initialLiveRenderTargetCount === finalLiveRenderTargetCount &&
        initial.planarCameraCount === final.planarCameraCount &&
        renderTargetCreateGrowth === 0 &&
        reflectionCameraCreateGrowth === 0,
      runtimeError: this._runtimeError
    });
  }

  getPerformanceCapabilities(): WaterOpticsPerformanceCapabilities {
    const gpuTimerCapability = this._options.gpuTimer.capability;
    return Object.freeze({
      frameSampler: true,
      engineMemory: true,
      waterMemory: true,
      statsRole: "display-only",
      formalCaptureRequiresStatsOff: true,
      formalSamplingMinimums: WATER_OPTICS_FORMAL_SAMPLING_MINIMUMS,
      phaseSequence: ["off-before", "on", "off-after"] as const,
      gpuTimerStatus: gpuTimerCapability.status,
      gpuTimerSource: gpuTimerCapability.status === "available" ? gpuTimerCapability.source : undefined,
      gpuUnavailableIsNotZero: true
    });
  }

  async runPerformanceCapture(
    options: Partial<WaterOpticsPerformanceCaptureOptions> = {}
  ): Promise<WaterOpticsPerformanceReport> {
    if (this._options.statsEnabled) {
      throw new Error("Formal Water Optics performance capture requires stats=0.");
    }
    if (this._freeCameraEnabled) {
      throw new Error("Formal Water Optics performance capture requires Free Camera off.");
    }
    const previousRefraction = this._refractionEnabled;
    const previousFrozen = this._frozen;
    const sampler = Object.keys(options).length
      ? new WaterOpticsPerformanceSampler(this._createPerformanceDependencies(), options)
      : this._performanceSampler;
    this.freezeTime(false);
    this._performanceCaptureActive = true;
    try {
      const report = await sampler.resample();
      this._lastPerformanceReport = report;
      return report;
    } finally {
      this._performanceCaptureActive = false;
      this._performanceOpticsEnabled = true;
      this.setRefractionEnabled(previousRefraction);
      this._applyTierRequests();
      this.freezeTime(previousFrozen);
      writeWaterOpticsLabMetrics(this._options.metricsElement, this.metrics);
    }
  }

  getLastPerformanceReport(): WaterOpticsPerformanceReport | undefined {
    return this._lastPerformanceReport;
  }

  markReady(): void {
    this._ready = true;
    this._runtimeError = "";
    const status = this._tierFallbackReason ? `ready / ${this._tierFallbackReason}` : "fixed fixture ready";
    this._writeStatus(status, "ready");
    this.tick();
  }

  markError(error: unknown): void {
    this._ready = false;
    this._runtimeError = error instanceof Error ? error.message : String(error);
    this._writeStatus("runtime failed", "error");
    this.tick();
  }

  tick(): void {
    this._updateDemoMotion();
    this._updateReflectionAndMaterial();
    this._applyStatsPanelVisibility();
    if (!this._performanceCaptureActive) writeWaterOpticsLabMetrics(this._options.metricsElement, this.metrics);
  }

  destroy(): void {
    this._setFreeCameraControlEnabled(false);
    for (const [element, type, listener] of this._listeners) element.removeEventListener(type, listener);
    this._listeners.length = 0;
    this._options.waterRuntime.setReflectionBinding(undefined);
    this._options.reflectionService.removeRequest(WATER_OPTICS_P1_POOL_CONSUMER_ID);
    this._options.reflectionService.removeRequest(WATER_OPTICS_P1_RIVER_CONSUMER_ID);
    this._options.reflectionService.removeRequest(WATER_OPTICS_P1_OCEAN_CONSUMER_ID);
    this._options.reflectionService.removeRequest(WATER_OPTICS_P1_SECONDARY_POOL_CONSUMER_ID);
    this._options.cameraFeatures.removeRequest(WATER_OPTICS_P1_POOL_CONSUMER_ID);
    this._options.cameraFeatures.removeRequest(WATER_OPTICS_P1_RIVER_CONSUMER_ID);
    this._options.cameraFeatures.removeRequest(WATER_OPTICS_P1_OCEAN_CONSUMER_ID);
    this._options.cameraFeatures.removeRequest(WATER_OPTICS_P1_SECONDARY_POOL_CONSUMER_ID);
    this._planarAnchorVisible = false;
    this._options.setPlanarAnchorVisible(false);
    this._options.setPlanarOrientationMarkersVisible(true);
    this._statsPanels.length = 0;
  }

  private _resolveTier(tier: WaterOpticsTier): WaterOpticsTier {
    if (tier !== "experimental") {
      this._tierFallbackReason = undefined;
      return tier;
    }
    this._tierFallbackReason = "water-optics-experimental-resolved-high";
    return "high";
  }

  private _resolveAutoReflectionSource(): WaterReflectionSource {
    return this._waterBody === "river" ? "probe" : "planar";
  }

  private _setFreeCameraControlEnabled(enabled: boolean): void {
    if (this._freeCameraEnabled === enabled) return;
    this._freeCameraEnabled = enabled;
    this._options.setFreeCameraControlEnabled(enabled);
  }

  private _motionTime(): number {
    return this._frozen ? this._surfaceTime : this._options.engine.time.elapsedTime;
  }

  private _updateDemoMotion(): void {
    const motionTime = this._motionTime();
    const reflectorTime =
      this._reflectorTimeOverride ?? (this._reflectorMovementEnabled ? motionTime : WATER_OPTICS_LAB_SURFACE_TIME);
    this._options.setReflectorTime(reflectorTime);
    if (this._cameraMovementEnabled) this._applyCameraPose(motionTime);
  }

  private _applyCameraPose(motionTime: number): void {
    const pose = WATER_OPTICS_CAMERA_POSES[this._cameraPreset];
    const movingOffsetX = this._cameraMovementEnabled ? Math.sin(motionTime * 0.24) * 2.1 : 0;
    const movingOffsetY = this._cameraMovementEnabled ? Math.sin(motionTime * 0.17 + 0.8) * 0.38 : 0;
    const movingOffsetZ = this._cameraMovementEnabled ? Math.cos(motionTime * 0.24) * 1.2 : 0;
    const cutOffsetX = this._cameraCutCount % 2 === 0 ? 0 : 2.75;
    const cutOffsetZ = this._cameraCutCount % 2 === 0 ? 0 : -1.4;
    const cameraEntity = this._options.camera.entity;
    cameraEntity.transform.setPosition(
      pose.position.x + movingOffsetX + cutOffsetX,
      pose.position.y + movingOffsetY,
      pose.position.z + movingOffsetZ + cutOffsetZ
    );
    cameraEntity.transform.lookAt(pose.target);
    this._options.camera.fieldOfView = pose.fieldOfView;
  }

  private _applyTierRequests(): void {
    const quality = this._resolvedTier === "medium" ? "medium" : "high";
    const request: WaterCameraFeatureRequest = {
      depthTexture: true,
      opaqueTexture: true,
      reflection: this._reflectionSource === "sky" ? "none" : this._reflectionSource,
      caustics: false,
      underwater: false,
      quality,
      opaqueDownsampling: quality === "medium" ? Downsampling.TwoX : Downsampling.None
    };
    const mode = this._options.p1Matrix.mode;
    const setCameraRequest = (consumerId: string, visible: boolean): void => {
      this._options.cameraFeatures.setRequest(consumerId, visible ? request : undefined);
    };
    setCameraRequest(
      WATER_OPTICS_P1_POOL_CONSUMER_ID,
      this._performanceOpticsEnabled && (mode === "inactive" || this._p1PoolVisible)
    );
    setCameraRequest(
      WATER_OPTICS_P1_RIVER_CONSUMER_ID,
      this._performanceOpticsEnabled && this._p1RiverVisible && (mode === "cross-body" || mode === "dual-pool")
    );
    setCameraRequest(
      WATER_OPTICS_P1_OCEAN_CONSUMER_ID,
      this._performanceOpticsEnabled && mode === "cross-body" && this._p1OceanVisible
    );
    setCameraRequest(
      WATER_OPTICS_P1_SECONDARY_POOL_CONSUMER_ID,
      this._performanceOpticsEnabled && mode === "dual-pool" && this._p1SecondaryPoolVisible
    );
    this._applyReflectionRequest();
  }

  private _applyReflectionRequest(): void {
    const p1Active = this._options.p1Matrix.active;
    this._options.reflectionService.setRequest({
      id: WATER_OPTICS_P1_POOL_CONSUMER_ID,
      preferredSource: this._reflectionSource,
      quality: this._resolvedTier === "medium" ? "medium" : "high",
      visible: this._performanceOpticsEnabled && (!p1Active || this._p1PoolVisible),
      priority: 100,
      planeY: 0,
      planarEligible: true,
      screenAreaRatio: WATER_OPTICS_P1_CONSUMERS.pool.screenAreaRatio,
      cameraDistanceMeters: WATER_OPTICS_P1_CONSUMERS.pool.cameraDistanceMeters,
      obliqueClipEnabled: this._planarClipEnabled,
      cullingMask: Layer.Everything,
      waterLayerMask: WATER_LAYER_MASK
    });
    if (this._options.p1Matrix.mode === "cross-body") this._applyP1AuxiliaryReflectionRequests();
    else if (this._options.p1Matrix.mode === "dual-pool") this._applyP1DualPoolReflectionRequest();
    else {
      this._options.reflectionService.removeRequest(WATER_OPTICS_P1_RIVER_CONSUMER_ID);
      this._options.reflectionService.removeRequest(WATER_OPTICS_P1_OCEAN_CONSUMER_ID);
      this._options.reflectionService.removeRequest(WATER_OPTICS_P1_SECONDARY_POOL_CONSUMER_ID);
    }
  }

  private _applyP1AuxiliaryReflectionRequests(): void {
    this._options.reflectionService.removeRequest(WATER_OPTICS_P1_SECONDARY_POOL_CONSUMER_ID);
    const quality = this._resolvedTier === "medium" ? "medium" : "high";
    this._options.reflectionService.setRequest({
      id: WATER_OPTICS_P1_RIVER_CONSUMER_ID,
      preferredSource: this._reflectionSource,
      quality,
      visible: this._performanceOpticsEnabled && this._p1RiverVisible,
      priority: 90,
      planeY: WATER_OPTICS_P1_CONSUMERS.river.planeY,
      planarEligible: false,
      screenAreaRatio: WATER_OPTICS_P1_CONSUMERS.river.screenAreaRatio,
      cameraDistanceMeters: WATER_OPTICS_P1_CONSUMERS.river.cameraDistanceMeters,
      obliqueClipEnabled: this._planarClipEnabled,
      cullingMask: Layer.Everything,
      waterLayerMask: WATER_LAYER_MASK
    });
    this._options.reflectionService.setRequest({
      id: WATER_OPTICS_P1_OCEAN_CONSUMER_ID,
      preferredSource: this._reflectionSource,
      quality,
      visible: this._performanceOpticsEnabled && this._p1OceanVisible,
      priority: 100,
      planeY: WATER_OPTICS_P1_CONSUMERS.ocean.planeY,
      planarEligible: true,
      screenAreaRatio: WATER_OPTICS_P1_CONSUMERS.ocean.screenAreaRatio,
      cameraDistanceMeters: WATER_OPTICS_P1_CONSUMERS.ocean.cameraDistanceMeters,
      obliqueClipEnabled: this._planarClipEnabled,
      cullingMask: Layer.Everything,
      waterLayerMask: WATER_LAYER_MASK
    });
  }

  private _applyP1DualPoolReflectionRequest(): void {
    this._options.reflectionService.removeRequest(WATER_OPTICS_P1_OCEAN_CONSUMER_ID);
    const quality = this._resolvedTier === "medium" ? "medium" : "high";
    this._options.reflectionService.setRequest({
      id: WATER_OPTICS_P1_RIVER_CONSUMER_ID,
      preferredSource: this._reflectionSource,
      quality,
      visible: this._performanceOpticsEnabled && this._p1RiverVisible,
      priority: 90,
      planeY: WATER_OPTICS_P1_CONSUMERS.river.planeY,
      planarEligible: false,
      screenAreaRatio: WATER_OPTICS_P1_CONSUMERS.river.screenAreaRatio,
      cameraDistanceMeters: WATER_OPTICS_P1_CONSUMERS.river.cameraDistanceMeters,
      obliqueClipEnabled: this._planarClipEnabled,
      cullingMask: Layer.Everything,
      waterLayerMask: WATER_LAYER_MASK
    });
    this._options.reflectionService.setRequest({
      id: WATER_OPTICS_P1_SECONDARY_POOL_CONSUMER_ID,
      preferredSource: this._reflectionSource,
      quality,
      visible: this._performanceOpticsEnabled && this._p1SecondaryPoolVisible,
      priority: 100,
      planeY: WATER_OPTICS_P1_CONSUMERS.secondaryPool.planeY,
      planarEligible: true,
      screenAreaRatio: WATER_OPTICS_P1_CONSUMERS.secondaryPool.screenAreaRatio,
      cameraDistanceMeters: WATER_OPTICS_P1_CONSUMERS.secondaryPool.cameraDistanceMeters,
      obliqueClipEnabled: this._planarClipEnabled,
      cullingMask: Layer.Everything,
      waterLayerMask: WATER_LAYER_MASK
    });
  }

  private _createPerformanceDependencies(): WaterOpticsPerformanceSamplerDependencies {
    return {
      requestAnimationFrame: (callback: () => void) => window.requestAnimationFrame(callback),
      now: () => performance.now(),
      isVisible: () => document.visibilityState === "visible",
      getViewportDpr: () => ({
        width: this._options.engine.canvas.width,
        height: this._options.engine.canvas.height,
        devicePixelRatio: window.devicePixelRatio
      }),
      getRuntimeEnvironment: () => {
        const search = new URLSearchParams(window.location.search);
        const headedParameter = search.get("performanceHeaded");
        const userAgent = navigator.userAgent || "browser-user-agent-unavailable";
        const canvas = document.getElementById("canvas");
        const gl =
          canvas instanceof HTMLCanvasElement ? (canvas.getContext("webgl2") ?? canvas.getContext("webgl")) : null;
        const debugRendererInfo = gl?.getExtension("WEBGL_debug_renderer_info") as {
          readonly UNMASKED_RENDERER_WEBGL: number;
        } | null;
        const rendererValue: unknown =
          gl && debugRendererInfo ? gl.getParameter(debugRendererInfo.UNMASKED_RENDERER_WEBGL) : undefined;
        const renderer = typeof rendererValue === "string" ? rendererValue.trim() : "";
        const isWebGL2 =
          gl !== null && typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext;
        const headlessByUserAgent = /HeadlessChrome/i.test(userAgent);
        const headed = headlessByUserAgent
          ? false
          : headedParameter === "1"
            ? true
            : headedParameter === "0"
              ? false
              : null;
        const headedDetection = headlessByUserAgent
          ? "headless-user-agent"
          : headedParameter === "1" || headedParameter === "0"
            ? "query-parameter"
            : "unavailable";
        return {
          capturedAtIso: new Date().toISOString(),
          browser: userAgent,
          graphicsApi: gl === null ? "unknown" : isWebGL2 ? "webgl2" : "webgl1",
          gpuRendererStatus: renderer ? "available" : "unavailable",
          gpuRenderer: renderer || undefined,
          headed,
          headedDetection
        };
      },
      getGateTarget: () => ({
        requestedTier: this._requestedTier,
        resolvedTier: this._resolvedTier,
        reflectionSource: this._reflectionSource,
        referenceDevice:
          new URLSearchParams(window.location.search).get("performanceReference") === "mobile" ? "mobile" : "desktop"
      }),
      getOpticsStateSnapshot: () => {
        const cameraFeatures = this._options.cameraFeatures.metrics;
        const reflection = this._options.reflectionService.metrics;
        return {
          refractionEnabled: this._refractionEnabled,
          cameraDepthCopyPassCount: cameraFeatures.incrementalDepthCopyPassCount,
          cameraOpaqueCopyPassCount: cameraFeatures.incrementalColorCopyPassCount,
          planarCameraCount: reflection.planarCameraCount,
          livePlanarRenderTargetCount: reflection.liveRenderTargetCount ?? (reflection.renderTargetWidth > 0 ? 1 : 0)
        };
      },
      getMemorySnapshot: () => {
        const engineMemory = this._options.engine.renderingStatistics;
        const cameraFeatureBytes = this._options.cameraFeatures.metrics.estimatedRenderTargetBytes;
        const planarBytes = this._options.reflectionService.metrics.estimatedRenderTargetBytes;
        const probeBytes = this._options.getProbeSnapshot().resourceBytes;
        return {
          engineMemory: {
            textureBytes: engineMemory.textureMemory,
            bufferBytes: engineMemory.bufferMemory,
            totalBytes: engineMemory.totalMemory
          },
          waterMemory: {
            cameraFeatureBytes,
            planarBytes,
            probeBytes,
            compositeBytes: 0,
            historyBytes: 0
          }
        };
      },
      setOpticsEnabled: (enabled: boolean) => {
        this._performanceOpticsEnabled = enabled;
        this.setRefractionEnabled(enabled);
        this._applyTierRequests();
      },
      gpuTimer: this._options.gpuTimer
    };
  }

  private _mountControls(): void {
    const listen = (element: Element, type: string, listener: EventListener): void => {
      element.addEventListener(type, listener);
      this._listeners.push([element, type, listener]);
    };
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-optics-tier]")) {
      listen(button, "click", () => void this.setTier(button.dataset.opticsTier as WaterOpticsTier));
    }
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-optics-preset]")) {
      listen(button, "click", () => void this.setPreset(button.dataset.opticsPreset as WaterOpticsPreset));
    }
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-optics-reflection]")) {
      listen(button, "click", () =>
        this.setReflectionMode(button.dataset.opticsReflection as WaterOpticsReflectionMode)
      );
    }
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-optics-water-body]")) {
      listen(button, "click", () => void this.setWaterBody(button.dataset.opticsWaterBody as WaterOpticsWaterBody));
    }
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-optics-refraction]")) {
      listen(button, "click", () => this.setRefractionEnabled(button.dataset.opticsRefraction === "on"));
    }
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-optics-composition]")) {
      listen(button, "click", () =>
        this.setCompositionMode(button.dataset.opticsComposition as WaterOpticsCompositionMode)
      );
    }
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-optics-depth-write]")) {
      listen(button, "click", () => this.setDepthWriteEnabled(button.dataset.opticsDepthWrite === "on"));
    }
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-optics-planar-filter]")) {
      listen(button, "click", () => this.setPlanarFilterEnabled(button.dataset.opticsPlanarFilter === "on"));
    }
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-optics-planar-clip]")) {
      listen(button, "click", () => this.setPlanarClipEnabled(button.dataset.opticsPlanarClip === "on"));
    }
    const debugSelect = document.querySelector<HTMLSelectElement>("[data-optics-debug]");
    if (debugSelect) listen(debugSelect, "change", () => this.setDebugView(debugSelect.value as WaterOpticsDebugView));
    const cameraSelect = document.querySelector<HTMLSelectElement>("[data-optics-camera]");
    if (cameraSelect) {
      listen(cameraSelect, "change", () => this.setCameraPreset(cameraSelect.value as WaterOpticsCameraPreset));
    }
    const freezeButton = document.querySelector<HTMLButtonElement>("[data-optics-freeze]");
    if (freezeButton) listen(freezeButton, "click", () => this.freezeTime(!this._frozen));
    const stepButton = document.querySelector<HTMLButtonElement>("[data-optics-step]");
    if (stepButton) listen(stepButton, "click", () => this.stepFrame());
    const moveReflectorButton = document.querySelector<HTMLButtonElement>("[data-optics-move-reflector]");
    if (moveReflectorButton) {
      listen(moveReflectorButton, "click", () => this.setReflectorMovementEnabled(!this._reflectorMovementEnabled));
    }
    const moveCameraButton = document.querySelector<HTMLButtonElement>("[data-optics-move-camera]");
    if (moveCameraButton) {
      listen(moveCameraButton, "click", () => this.setCameraMovementEnabled(!this._cameraMovementEnabled));
    }
    const freeCameraButton = document.querySelector<HTMLButtonElement>("[data-optics-free-camera]");
    if (freeCameraButton) {
      listen(freeCameraButton, "click", () => this.setFreeCameraEnabled(!this._freeCameraEnabled));
    }
    const cameraCutButton = document.querySelector<HTMLButtonElement>("[data-optics-camera-cut]");
    if (cameraCutButton) listen(cameraCutButton, "click", () => this.cameraCut());
    const foamMaskButton = document.querySelector<HTMLButtonElement>("[data-optics-local-foam-mask]");
    if (foamMaskButton) {
      listen(foamMaskButton, "click", () => this.setLocalFoamMaskEnabled(!this._localFoamMaskEnabled));
    }
    const statsButton = document.querySelector<HTMLButtonElement>("[data-optics-stats-panel]");
    if (statsButton) listen(statsButton, "click", () => this.setStatsPanelVisible(!this._statsPanelVisible));
    this._syncControlState();
  }

  private _syncControlState(): void {
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-optics-tier]")) {
      button.dataset.active = String(button.dataset.opticsTier === this._requestedTier);
    }
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-optics-preset]")) {
      button.dataset.active = String(button.dataset.opticsPreset === this._preset);
    }
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-optics-reflection]")) {
      button.dataset.active = String(button.dataset.opticsReflection === this._reflectionMode);
    }
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-optics-water-body]")) {
      button.dataset.active = String(button.dataset.opticsWaterBody === this._waterBody);
    }
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-optics-refraction]")) {
      button.dataset.active = String((button.dataset.opticsRefraction === "on") === this._refractionEnabled);
    }
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-optics-composition]")) {
      button.dataset.active = String(button.dataset.opticsComposition === this._compositionMode);
    }
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-optics-depth-write]")) {
      button.dataset.active = String((button.dataset.opticsDepthWrite === "on") === this._depthWriteEnabled);
    }
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-optics-planar-filter]")) {
      button.dataset.active = String((button.dataset.opticsPlanarFilter === "on") === this._planarFilterEnabled);
    }
    for (const button of document.querySelectorAll<HTMLButtonElement>("[data-optics-planar-clip]")) {
      button.dataset.active = String((button.dataset.opticsPlanarClip === "on") === this._planarClipEnabled);
    }
    const debugSelect = document.querySelector<HTMLSelectElement>("[data-optics-debug]");
    if (debugSelect) debugSelect.value = this._debugView;
    const cameraSelect = document.querySelector<HTMLSelectElement>("[data-optics-camera]");
    if (cameraSelect) cameraSelect.value = this._cameraPreset;
    const freezeButton = document.querySelector<HTMLButtonElement>("[data-optics-freeze]");
    if (freezeButton) freezeButton.dataset.active = String(this._frozen);
    const moveReflectorButton = document.querySelector<HTMLButtonElement>("[data-optics-move-reflector]");
    if (moveReflectorButton) moveReflectorButton.dataset.active = String(this._reflectorMovementEnabled);
    const moveCameraButton = document.querySelector<HTMLButtonElement>("[data-optics-move-camera]");
    if (moveCameraButton) moveCameraButton.dataset.active = String(this._cameraMovementEnabled);
    const freeCameraButton = document.querySelector<HTMLButtonElement>("[data-optics-free-camera]");
    if (freeCameraButton) freeCameraButton.dataset.active = String(this._freeCameraEnabled);
    const foamMaskButton = document.querySelector<HTMLButtonElement>("[data-optics-local-foam-mask]");
    if (foamMaskButton) foamMaskButton.dataset.active = String(this._localFoamMaskEnabled);
  }

  private _applyStatsPanelVisibility(): void {
    if (!this._options.statsEnabled) return;
    if (this._statsPanels.length === 0) {
      this._statsPanels.push(...document.querySelectorAll<HTMLElement>(".gl-perf"));
    }
    for (const panel of this._statsPanels) {
      panel.hidden = !this._statsPanelVisible;
    }
  }

  private _updateReflectionAndMaterial(): void {
    this._options.reflectionService.update(this._frameIndex++);
    const poolReflection = this._performanceOpticsEnabled
      ? this._options.reflectionService.getBinding(WATER_OPTICS_P1_POOL_CONSUMER_ID)
      : undefined;
    if (!this._options.p1Matrix.active) {
      this._options.waterRuntime.setReflectionBinding(poolReflection);
      return;
    }

    const binding = this._p1SharedBinding;
    binding.tier = this._requestedTier;
    binding.refractionEnabled = this._refractionEnabled;
    binding.debugView = resolveHeightfieldDebugMode(this._debugView) ?? SharedWaterOpticsDebugView.Final;
    binding.reflection = poolReflection;
    this._options.waterRuntime.setSurfaceOpticsBinding(binding);
    this._lastPrimaryBinding = binding;

    if (this._options.p1Matrix.mode === "dual-pool") {
      binding.reflection = this._performanceOpticsEnabled
        ? this._options.reflectionService.getBinding(WATER_OPTICS_P1_SECONDARY_POOL_CONSUMER_ID)
        : undefined;
      this._options.secondaryWaterRuntime.setSurfaceOpticsBinding(binding);
      this._lastSecondaryPoolBinding = binding;

      binding.reflection = this._performanceOpticsEnabled
        ? this._options.reflectionService.getBinding(WATER_OPTICS_P1_RIVER_CONSUMER_ID)
        : undefined;
      this._options.p1Matrix.applyRiverBinding(binding);
      return;
    }

    binding.reflection = this._performanceOpticsEnabled
      ? this._options.reflectionService.getBinding(WATER_OPTICS_P1_RIVER_CONSUMER_ID)
      : undefined;
    this._options.p1Matrix.applyRiverBinding(binding);

    binding.reflection = this._performanceOpticsEnabled
      ? this._options.reflectionService.getBinding(WATER_OPTICS_P1_OCEAN_CONSUMER_ID)
      : undefined;
    this._options.p1Matrix.applyOceanBinding(binding);
  }

  private _createP1Metrics(
    reflection: Readonly<WaterReflectionServiceMetrics>,
    cameraFeatures: Readonly<CameraWaterFeatureMetrics>
  ): WaterOpticsP1MatrixMetrics {
    const active = this._options.p1Matrix.active;
    const poolReadback = summarizeWaterOpticsP1PoolReadback(this._options.waterRuntime.activeSurfaceOpticsReadback);
    const riverReadback = this._options.p1Matrix.getRiverReadback();
    const oceanReadback = this._options.p1Matrix.getOceanReadback();
    const secondaryPoolReadback = summarizeWaterOpticsP1SecondaryPoolReadback(
      this._options.secondaryWaterRuntime.activeSurfaceOpticsReadback
    );
    const mode = this._options.p1Matrix.mode;
    const visibleCount =
      mode === "cross-body"
        ? Number(this._p1PoolVisible) + Number(this._p1RiverVisible) + Number(this._p1OceanVisible)
        : mode === "dual-pool"
          ? Number(this._p1PoolVisible) + Number(this._p1RiverVisible) + Number(this._p1SecondaryPoolVisible)
          : 0;
    const liveRenderTargetCount = reflection.liveRenderTargetCount ?? (reflection.renderTargetWidth > 0 ? 1 : 0);
    const experimentalRequested = this._requestedTier === "experimental";
    const secondaryPoolRuntime = this._options.secondaryWaterRuntime.metrics;
    const sharedBindingInstance =
      this._lastPrimaryBinding === this._p1SharedBinding &&
      (mode === "cross-body"
        ? this._options.p1Matrix.usesSharedBindingReference(this._p1SharedBinding)
        : mode === "dual-pool"
          ? this._lastSecondaryPoolBinding === this._p1SharedBinding &&
            this._options.p1Matrix.usesRiverBindingReference(this._p1SharedBinding)
          : false);
    return Object.freeze({
      active,
      mode,
      validationScope: "evidence-gated",
      materialConsumerCount: this._options.p1Matrix.materialConsumerCount,
      simultaneousVisibleMaterialConsumerCount: visibleCount as 0 | 1 | 2 | 3,
      sharedOpticalProfileReference:
        sharedBindingInstance && this._p1SharedBinding.opticalProfile === WATER_OPTICS_LAB_OPTICAL_PROFILE,
      sharedBindingInstance,
      consumerIds: Object.freeze(
        mode === "cross-body"
          ? [WATER_OPTICS_P1_POOL_CONSUMER_ID, WATER_OPTICS_P1_RIVER_CONSUMER_ID, WATER_OPTICS_P1_OCEAN_CONSUMER_ID]
          : mode === "dual-pool"
            ? [
                WATER_OPTICS_P1_POOL_CONSUMER_ID,
                WATER_OPTICS_P1_RIVER_CONSUMER_ID,
                WATER_OPTICS_P1_SECONDARY_POOL_CONSUMER_ID
              ]
            : []
      ),
      consumerPlaneYs: Object.freeze({
        pool: WATER_OPTICS_P1_CONSUMERS.pool.planeY,
        river: WATER_OPTICS_P1_CONSUMERS.river.planeY,
        ocean: WATER_OPTICS_P1_CONSUMERS.ocean.planeY,
        secondaryPool: WATER_OPTICS_P1_CONSUMERS.secondaryPool.planeY
      }),
      poolVisible: active && this._p1PoolVisible,
      riverVisible: active && this._p1RiverVisible,
      oceanVisible: mode === "cross-body" && this._p1OceanVisible,
      secondaryPoolVisible: mode === "dual-pool" && this._p1SecondaryPoolVisible,
      secondaryPoolRuntimeCreated: secondaryPoolRuntime.created,
      secondaryPoolRuntimeCreateCount: secondaryPoolRuntime.createCount,
      secondaryPoolRuntimeDestroyCount: secondaryPoolRuntime.destroyCount,
      secondaryPoolRuntimeLiveCount: secondaryPoolRuntime.balancedLiveCount,
      bodyReadbacks: Object.freeze({
        pool: poolReadback,
        river: riverReadback,
        ocean: oceanReadback,
        secondaryPool: secondaryPoolReadback
      }),
      cameraDepthCopyPassCount: cameraFeatures.depthCopyPassCount,
      cameraOpaqueCopyPassCount: cameraFeatures.colorCopyPassCount,
      cameraFeatureConsumerIds: cameraFeatures.activeConsumerIds,
      activeReflectionConsumerCount: reflection.activeConsumerCount,
      eligiblePlanarRequestCount: reflection.eligiblePlanarRequestCount ?? 0,
      selectedPlanarOwnerId: reflection.selectedPlanarOwnerId,
      pendingPlanarOwnerId: reflection.pendingPlanarOwnerId,
      renderedPlanarOwnerId: reflection.renderedPlanarOwnerId,
      planarOwnerAgeFrames: reflection.planarOwnerAgeFrames ?? 0,
      pendingPlanarOwnerAgeFrames: reflection.pendingPlanarOwnerAgeFrames ?? 0,
      planarCameraCount: reflection.planarCameraCount,
      liveRenderTargetCount,
      reflectionCameraCreateCount: reflection.reflectionCameraCreateCount ?? 0,
      reflectionCameraDestroyCount: reflection.reflectionCameraDestroyCount ?? 0,
      renderTargetCreateCount: reflection.renderTargetCreateCount,
      renderTargetDestroyCount: reflection.renderTargetDestroyCount,
      experimentalRequested,
      experimentalResolvedHigh:
        experimentalRequested &&
        poolReadback.resolvedTier === "high" &&
        (mode === "cross-body"
          ? riverReadback.resolvedTier === "high" && oceanReadback.resolvedTier === "high"
          : mode === "dual-pool"
            ? riverReadback.resolvedTier === "high" && secondaryPoolReadback.resolvedTier === "high"
            : false),
      experimentalFallbackReason: experimentalRequested ? poolReadback.tierFallbackReason : undefined,
      experimentalAdditionalRenderTargetCount: this._experimentalAdditionalRenderTargetCount
    });
  }

  private _writeStatus(message: string, state: "loading" | "ready" | "error"): void {
    this._options.statusElement.textContent = message;
    this._options.statusElement.dataset.state = state;
    if (this._options.strictQuality && this._requestedTier !== this._resolvedTier) {
      this._options.statusElement.dataset.strictQualityMismatch = "true";
    } else {
      delete this._options.statusElement.dataset.strictQualityMismatch;
    }
  }
}
