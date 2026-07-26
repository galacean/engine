/** Runtime owner for camera-relative Ocean rings, water facts, and camera features. */
import {
  Downsampling,
  Engine,
  Entity,
  Layer,
  type Texture2D
} from "@galacean/engine-core";
import { WaterWaveModel } from "../../authoring/wave/enums/WaterWaveModel";
import { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";
import type { WaterWaveAssetV1 } from "../../authoring/wave/WaterWaveTypes";
import { compileWaterWaveAsset } from "../../compiler/wave/WaterWaveCompiler";
import type { CompiledWaterWaveSet } from "../../compiler/wave/CompiledWaterWaveTypes";
import { OceanNearshoreCompiler } from "../../compiler/ocean/OceanNearshoreCompiler";
import {
  createWaterWaveMaterial,
  setWaterWaveNearshoreDebugView,
  setWaterWaveNearshoreBreakerEnabled,
  setWaterWaveNearshoreStateEnabled,
  setWaterWaveNearshoreWaveEnabled,
  setWaterWaveFoamTexture,
  setWaterWaveSurfaceOpticsBinding,
  setWaterWaveSurfaceTimeOverride,
  updateWaterWaveMaterial,
  validateWaterFoamDetailTextureBinding
} from "../wave/WaterWaveMaterialFactory";
import type { WaterWaveMaterialConfig, WaterWaveMaterialState } from "../wave/WaterWaveRuntimeTypes";
import { WATER_FOAM_DETAIL_TEXTURE_RESOURCE_BYTES } from "../wave/WaterFoamDetailTextureFactory";
import { WATER_SURFACE_DUAL_SLOPE_TEXTURE_RESOURCE_BYTES } from "../wave/constants/WaterSurfaceDetailTextureConstants";
import { OceanWaterSurfaceProvider } from "./OceanWaterSurfaceProvider";
import { OceanRingGeometry } from "./OceanRingGeometry";
import { OceanNearshoreFieldResource } from "./OceanNearshoreFieldResource";
import { OceanNearshoreFieldProvider } from "./OceanNearshoreFieldProvider";
import { createOceanNearshoreFieldTexture } from "./OceanNearshoreFieldTextureFactory";
import {
  attachOceanNearshoreDynamicBinding,
  createOceanNearshoreStaticBinding,
  OceanNearshoreDebugView,
  type OceanNearshoreStaticBinding
} from "./OceanNearshoreShaderTypes";
import {
  OceanNearshoreStateField,
  type OceanNearshoreStateFieldOptions
} from "./OceanNearshoreStateField";
import { OceanNearshoreStateTextureService } from "./OceanNearshoreStateTextureService";
import { OceanObstacleFieldResource } from "./OceanObstacleFieldResource";
import type { GridWaterCurrentFieldSnapshot } from "../interaction/WaterCurrentFieldSnapshot";
import { TemporalFoamField } from "../interaction/TemporalFoamField";
import { TemporalFoamTextureService } from "../interaction/TemporalFoamTextureService";
import {
  WaterFoamDebugView,
  type WaterFoamBoundedSource,
  type WaterTemporalFoamBinding
} from "../interaction/WaterFoamTypes";
import { WaterInteractionEventQueue } from "../interaction/WaterInteractionEventQueue";
import {
  OceanFoamSourceSystem,
  validateOceanFoamSourceSystemOptions
} from "./OceanFoamSourceSystem";
import { OceanObstacleContactSystem } from "./OceanObstacleContactSystem";
import type { WaterReflectionBinding, WaterReflectionService } from "../optics/WaterReflectionService";
import type { WaterReflectionSource } from "../optics/WaterReflectionPolicy";
import { DEFAULT_WATER_OPTICAL_PROFILE, type WaterOpticalProfile } from "../optics/WaterOpticalProfile";
import type { CameraWaterFeatureBroker } from "../optics/CameraWaterFeatureBroker";
import {
  WaterOpticsDebugView,
  type WaterOpticsTier,
  type WaterSurfaceOpticsBindingReadback
} from "../optics/WaterSurfaceOpticsTypes";
import {
  OCEAN_RUNTIME_DEFAULT_STRESS_ITERATIONS,
  OCEAN_RUNTIME_FIXED_TIME_FOAM_PREWARM_STEP_COUNT,
  OCEAN_RUNTIME_MAX_PATCH_SEGMENTS,
  OCEAN_RUNTIME_MIN_AMPLITUDE_SCALE,
  OCEAN_RUNTIME_MIN_PATCH_SEGMENTS,
  OCEAN_RUNTIME_PATCH_SEGMENT_DIVISOR,
  OCEAN_RUNTIME_RING_SKIRT_DEPTH,
  OCEAN_RUNTIME_STRESS_QUALITY_SEQUENCE
} from "./OceanWaterRuntimeConstants";
import type {
  OceanWaterRuntimeConfig,
  OceanWaterRuntimeMetrics,
  OceanWaterRuntimeStressResult
} from "./OceanWaterRuntimeTypes";

export interface OceanCameraPositionXZ {
  readonly x: number;
  readonly z: number;
}

interface OceanWaterRuntimeNearshoreState {
  readonly resource: OceanNearshoreFieldResource;
  readonly provider: OceanNearshoreFieldProvider;
  readonly texture: Texture2D;
  readonly stateField: OceanNearshoreStateField;
  readonly stateTextures: OceanNearshoreStateTextureService;
  readonly binding: Readonly<OceanNearshoreStaticBinding>;
  readonly obstacles: OceanObstacleFieldResource;
}

interface OceanWaterRuntimeFoamState {
  readonly field: TemporalFoamField;
  readonly textures: TemporalFoamTextureService;
  readonly sources: OceanFoamSourceSystem;
  readonly events: WaterInteractionEventQueue;
  readonly contacts: OceanObstacleContactSystem;
  readonly region: readonly [number, number, number, number];
  readonly fieldResourceBytes: number;
  readonly eventResourceBytes: number;
}

const OCEAN_FOAM_RESOLUTION_X = 256;
const OCEAN_FOAM_RESOLUTION_Z = 256;
const OCEAN_FOAM_DECAY_RATE_PER_SECOND = 0.82;
const OCEAN_FOAM_UPDATE_RATE_HZ = 30;
const OCEAN_FOAM_EVENT_CAPACITY = 16;
const OCEAN_FOAM_EVENT_BYTES_PER_SLOT = 49;
const OCEAN_FOAM_EMITTER_BYTES_PER_SLOT = 20;

type OceanFixedTimeFoamUpdateMode =
  | "none"
  | "incremental"
  | "prewarm";

function createScaledWaveAsset(config: OceanWaterRuntimeConfig): WaterWaveAssetV1 {
  const asset = config.waveAsset;
  if (asset.model === WaterWaveModel.None) return asset;
  const amplitudeScale = Math.max(OCEAN_RUNTIME_MIN_AMPLITUDE_SCALE, config.amplitudeScale);
  return {
    ...asset,
    generator: {
      ...asset.generator,
      minAmplitude: asset.generator.minAmplitude * amplitudeScale,
      maxAmplitude: asset.generator.maxAmplitude * amplitudeScale
    }
  };
}

export class OceanWaterRuntimeController {
  readonly root: Entity;
  readonly surfaceProvider: OceanWaterSurfaceProvider;
  readonly reflectionConsumerId: string;
  readonly opticsConsumerId: string;
  private readonly _waterBodyId: string;
  private _ringGeometry: OceanRingGeometry;
  private _materialState: WaterWaveMaterialState;
  private _waveSet: CompiledWaterWaveSet;
  private _topologyKey: string;
  private _surfaceTimeOverride?: number;
  private _meshUploadCount = 0;
  private _meshCreateCount = 0;
  private _meshDestroyCount = 0;
  private _materialCreateCount = 0;
  private _materialDestroyCount = 0;
  private _nearshoreTextureCreateCount = 0;
  private _nearshoreTextureDestroyCount = 0;
  private _foamTextureCreateCount = 0;
  private _foamTextureDestroyCount = 0;
  private _foamEventQueueCreateCount = 0;
  private _foamEventQueueDestroyCount = 0;
  private _frameCount = 0;
  private _destroyed = false;
  private _reflectionService?: WaterReflectionService;
  private _reflectionBinding?: Readonly<WaterReflectionBinding>;
  private _reflectionSource: WaterReflectionSource;
  private _reflectionVisible = true;
  private _cameraFeatureBroker?: CameraWaterFeatureBroker;
  private _cameraFeatureRequested = false;
  private _opticalProfile: WaterOpticalProfile = DEFAULT_WATER_OPTICAL_PROFILE;
  private _refractionEnabled = true;
  private _opticsReadback?: Readonly<WaterSurfaceOpticsBindingReadback>;
  private _nearshoreState?: OceanWaterRuntimeNearshoreState;
  private _nearshoreDebugView = OceanNearshoreDebugView.Final;
  private _nearshoreWaveEnabled = true;
  private _nearshoreStateEnabled = true;
  private _nearshoreBreakerEnabled = true;
  private _foamState?: OceanWaterRuntimeFoamState;
  private _foamEnabled: boolean;
  private _foamBreakerSourceEnabled = true;
  private _foamShoreSourceEnabled = true;
  private _rockContactEnabled = true;
  private _foamDebugView = WaterFoamDebugView.Final;
  private _fixedTimeFoamUpdateMode: OceanFixedTimeFoamUpdateMode =
    "none";

  constructor(
    private readonly _engine: Engine,
    parent: Entity,
    private _config: OceanWaterRuntimeConfig
  ) {
    validateWaterFoamDetailTextureBinding(
      _config.foamDetail
    );
    this._waterBodyId = _config.waterBodyId ?? "ocean-preview";
    this._validateFoamSourceOptions(_config);
    this.reflectionConsumerId = this._waterBodyId;
    this.opticsConsumerId = `${this._waterBodyId}-optics`;
    this.root = parent.createChild(`${this._waterBodyId}-runtime`);
    this._waveSet = this._compileWaveSet();
    this._nearshoreState = this._createNearshoreState(
      _config.nearshoreDescriptor,
      _config.nearshoreStateOptions
    );
    this._foamEnabled = _config.foamEnabled === true;
    this._foamState = this._createFoamState(
      this._nearshoreState,
      this._waveSet,
      _config
    );
    this._reflectionSource = _config.reflectionSource ?? "sky";
    this._opticalProfile = _config.opticalProfile ?? DEFAULT_WATER_OPTICAL_PROFILE;
    this._refractionEnabled = _config.refractionEnabled ?? true;
    this.surfaceProvider = new OceanWaterSurfaceProvider({
      waterBodyId: this._waterBodyId,
      waveSet: this._waveSet,
      size: _config.size,
      waterLevel: _config.waterLevel,
      timeScale: _config.timeScale,
      unbounded: true,
      nearshoreField: this._nearshoreState?.provider,
      nearshoreState: this._nearshoreState?.stateField,
      getElapsedTime: () => this._surfaceTimeOverride ?? this._engine.time.elapsedTime
    });
    this._materialState = this._createMaterialState();
    this._ringGeometry = this._createRingGeometry();
    this._topologyKey = this._getTopologyKey();
    const geometryMetrics = this._ringGeometry.metrics;
    this._meshCreateCount += geometryMetrics.meshCreateCount;
    this._meshUploadCount += geometryMetrics.meshUploadCount;
    this._applySurfaceOpticsBinding();
  }

  get metrics(): OceanWaterRuntimeMetrics {
    const geometry = this._ringGeometry.metrics;
    const foam = this._foamState;
    return Object.freeze({
      waveModel: this._waveSet.model,
      quality: this._waveSet.quality,
      shaderWaveCount: Number(this._materialState.variant),
      activeWaveCount: this._waveSet.activeWaveCount,
      sourceHash: this._waveSet.sourceHash,
      meshUploadCount: this._meshUploadCount,
      meshCreateCount: this._meshCreateCount,
      meshDestroyCount: this._meshDestroyCount,
      materialCreateCount: this._materialCreateCount,
      materialDestroyCount: this._materialDestroyCount,
      activeMeshCount: geometry.patchCount,
      activeMaterialCount: this._materialCreateCount - this._materialDestroyCount,
      vertexCount: geometry.vertexCount,
      ringCount: geometry.ringCount,
      patchCount: geometry.patchCount,
      visiblePatchCount: geometry.visiblePatchCount,
      drawCount: geometry.drawCount,
      triangleCount: geometry.triangleCount,
      visibleTriangleCount: geometry.visibleTriangleCount,
      originSnapCount: geometry.originSnapCount,
      originX: geometry.originX,
      originZ: geometry.originZ,
      baseCellSize: geometry.baseCellSize,
      coverageHalfExtent: geometry.coverageHalfExtent,
      reflectionSource: this._opticsReadback?.effectiveSource ?? "sky",
      reflectionFilterSampleCount: this._opticsReadback?.filterSampleCount ?? 1,
      surfaceDetailEnabled: this._materialState.surfaceDetailEnabled ?? false,
      surfaceDetailLayerCount: this._materialState.surfaceDetailLayerCount ?? 0,
      surfaceDetailTextureCount:
        !this._destroyed &&
        this._materialState.surfaceDetailEnabled
          ? 1
          : 0,
      surfaceDetailResourceBytes:
        !this._destroyed &&
        this._materialState.surfaceDetailEnabled
          ? WATER_SURFACE_DUAL_SLOPE_TEXTURE_RESOURCE_BYTES
          : 0,
      nearshoreEnabled: this._materialState.nearshoreEnabled ?? false,
      nearshoreSourceHash: this._nearshoreState?.resource.metadata.compiledHash,
      nearshoreWetTexelCount:
        this._nearshoreState?.resource.data.stats.wetTexelCount ?? 0,
      nearshoreDryTexelCount:
        this._nearshoreState?.resource.data.stats.dryTexelCount ?? 0,
      nearshoreResourceBytes: this._nearshoreState?.resource.byteLength ?? 0,
      nearshoreTextureCreateCount:
        this._nearshoreTextureCreateCount,
      nearshoreTextureDestroyCount:
        this._nearshoreTextureDestroyCount,
      activeNearshoreTextureCount:
        this._nearshoreTextureCreateCount -
        this._nearshoreTextureDestroyCount,
      nearshoreWaveEnabled:
        this._nearshoreState !== undefined && this._nearshoreWaveEnabled,
      nearshoreStateEnabled:
        this._nearshoreState !== undefined && this._nearshoreStateEnabled,
      nearshoreBreakerEnabled:
        this._nearshoreState !== undefined &&
        this._nearshoreBreakerEnabled,
      nearshoreStateRevision:
        this._nearshoreState?.stateField.metrics.revision ?? 0,
      nearshoreStateUpdateRateHz:
        this._nearshoreState?.stateField.metrics.fixedStepRateHz ?? 0,
      nearshoreStateUpdateCount:
        this._nearshoreState?.stateField.metrics.updateCount ?? 0,
      nearshoreStateUploadCount:
        this._nearshoreState?.stateTextures.metrics.stateUploadCount ?? 0,
      nearshoreWetnessUploadRateHz:
        this._nearshoreState?.stateTextures.metrics.wetnessUploadRateHz ?? 0,
      nearshoreWetnessUploadCount:
        this._nearshoreState?.stateTextures.metrics.wetnessUploadCount ?? 0,
      nearshoreThinFilmTexelCount:
        this._nearshoreState?.stateField.metrics.activeThinFilmTexelCount ?? 0,
      nearshoreBreakerTexelCount:
        this._nearshoreState?.stateField.metrics.activeBreakerTexelCount ?? 0,
      nearshoreWetnessTexelCount:
        this._nearshoreState?.stateField.metrics.activeWetnessTexelCount ?? 0,
      nearshoreBreakerPeak:
        this._nearshoreState?.stateField.metrics.breakerPeak ?? 0,
      nearshoreWetnessPeak:
        this._nearshoreState?.stateField.metrics.wetnessPeak ?? 0,
      nearshoreMaximumBackwashSpeed:
        this._nearshoreState?.stateField.metrics.maximumBackwashSpeed ?? 0,
      nearshoreCurrentSnapshotRevision:
        this._nearshoreState?.stateField.metrics.currentSnapshotRevision ?? 0,
      nearshoreDynamicResourceBytes:
        (this._nearshoreState?.stateField.metrics.stateByteLength ?? 0) +
        (this._nearshoreState?.stateTextures.metrics.resourceBytes ?? 0),
      foamEnabled: this._foamEnabled,
      analyticWhitecapEnabled: this._foamEnabled,
      foamDebugView: this._foamDebugView,
      foamTextureCount: foam?.textures.metrics.textureCount ?? 0,
      foamDetailTextureCount:
        !this._destroyed && this._foamEnabled ? 1 : 0,
      foamDetailTextureSource:
        !this._destroyed && this._foamEnabled
          ? this._config.foamDetail
            ? "external"
            : "procedural"
          : "none",
      foamDetailResourceBytes:
        !this._destroyed && this._foamEnabled
          ? this._config.foamDetail?.resourceBytes ??
            WATER_FOAM_DETAIL_TEXTURE_RESOURCE_BYTES
          : 0,
      foamTextureCreateCount: this._foamTextureCreateCount,
      foamTextureDestroyCount: this._foamTextureDestroyCount,
      foamEventQueueCreateCount:
        this._foamEventQueueCreateCount,
      foamEventQueueDestroyCount:
        this._foamEventQueueDestroyCount,
      activeFoamEventQueueCount:
        this._foamEventQueueCreateCount -
        this._foamEventQueueDestroyCount,
      foamTargetUpdateRateHz:
        foam?.textures.metrics.targetUpdateRateHz ?? 0,
      foamHistoryUpdateCount:
        foam?.textures.metrics.historyUpdateCount ?? 0,
      foamFixedTimePrewarmCount:
        foam?.textures.metrics.prewarmCount ?? 0,
      foamFixedTimePrewarmStepCount:
        foam?.textures.metrics.lastPrewarmStepCount ?? 0,
      foamUploadCount: foam?.textures.metrics.uploadCount ?? 0,
      foamSourceUpdateCount: foam?.sources.metrics.updateCount ?? 0,
      foamSourcePixelCount:
        foam?.field.metrics.sourcePixelCount ?? 0,
      foamHistoryPixelCount:
        foam?.field.metrics.activeHistoryPixelCount ?? 0,
      foamHistoryPeak:
        foam?.field.metrics.peakHistoryValue ?? 0,
      foamHistoryEnergy:
        foam?.field.metrics.historyEnergy ?? 0,
      foamHistoryCentroidX:
        foam?.field.metrics.centroidWorldX ?? 0,
      foamHistoryCentroidZ:
        foam?.field.metrics.centroidWorldZ ?? 0,
      foamBreakerSourcePixelCount:
        foam?.sources.metrics.breakerSourcePixelCount ?? 0,
      foamShoreSourcePixelCount:
        foam?.sources.metrics.shoreSourcePixelCount ?? 0,
      foamBreakerSourceEnabled:
        foam?.sources.metrics.breakerSourceEnabled ?? false,
      foamShoreSourceEnabled:
        foam?.sources.metrics.shoreSourceEnabled ?? false,
      foamObstacleInjectionCount:
        foam?.sources.metrics.obstacleInjectionCount ?? 0,
      foamImpactInjectionCount:
        foam?.sources.metrics.impactInjectionCount ?? 0,
      foamWakeInjectionCount:
        foam?.sources.metrics.wakeInjectionCount ?? 0,
      foamEventCapacity: foam?.events.capacity ?? 0,
      foamPendingEventCount: foam?.events.count ?? 0,
      foamEventAcceptedCount:
        foam?.events.metrics.acceptedCount ?? 0,
      foamEventDroppedCount:
        foam?.events.metrics.droppedCount ?? 0,
      foamEventOverflowCount:
        foam?.events.metrics.overflowCount ?? 0,
      foamEventAggregatedCount:
        foam?.events.metrics.aggregatedCount ?? 0,
      foamContactUpdateRateHz:
        foam?.contacts.metrics.fixedStepRateHz ?? 0,
      foamContactSamplingBudget:
        foam?.contacts.metrics.fixedSamplingBudget ?? 0,
      foamContactUpdateCount:
        foam?.contacts.metrics.updateCount ?? 0,
      rockContactEnabled:
        foam?.contacts.metrics.enabled ?? false,
      rockContactActiveCount:
        foam?.contacts.metrics.activeContactCount ?? 0,
      rockContactPeakEnergy:
        foam?.contacts.metrics.peakContactEnergy ?? 0,
      rockContactImpactAcceptedCount:
        foam?.contacts.metrics.impactAcceptedCount ?? 0,
      foamCurrentSurfaceQueryCount: 0,
      foamResourceBytes: foam
        ? foam.fieldResourceBytes +
          foam.eventResourceBytes +
          foam.textures.metrics.resourceBytes +
          foam.sources.metrics.resourceBytes +
          foam.contacts.metrics.resourceBytes +
          (this._config.foamDetail?.resourceBytes ??
            WATER_FOAM_DETAIL_TEXTURE_RESOURCE_BYTES)
        : 0,
      requestedOpticsTier: this._resolveOpticsTier(),
      resolvedOpticsTier: this._resolveOpticsTier() ? this._opticsReadback?.resolvedTier : undefined,
      compiledOpticsTier: this._materialState.opticsTier,
      refractionEnabled: this._opticsReadback?.refractionEnabled ?? false,
      cameraFeatureRequested: this._cameraFeatureRequested,
      frameCount: this._frameCount,
      perFrameMeshUpload: false
    });
  }

  /** Shared immutable field consumed by terrain generation and diagnostics. */
  get nearshoreFieldResource(): OceanNearshoreFieldResource | undefined {
    return this._nearshoreState?.resource;
  }

  /** Allocation-free CPU query view over the same field sampled by the shader. */
  get nearshoreFieldProvider(): OceanNearshoreFieldProvider | undefined {
    return this._nearshoreState?.provider;
  }

  /** Compiled contact footprints owned by this runtime. */
  get obstacleFieldResource(): OceanObstacleFieldResource | undefined {
    return this._nearshoreState?.obstacles;
  }

  /** Fixed-step breaker, swash/backwash, thin-film, and wetness facts. */
  get nearshoreStateField(): OceanNearshoreStateField | undefined {
    return this._nearshoreState?.stateField;
  }

  /** Immutable current snapshot for dense consumers such as temporal foam. */
  get nearshoreCurrentSnapshot(): GridWaterCurrentFieldSnapshot | undefined {
    return this._nearshoreState?.stateField.currentSnapshot;
  }

  /** Low-frequency R8 wetness output for native PBR terrain consumers. */
  get nearshoreWetnessTexture(): Texture2D | undefined {
    return this._nearshoreState?.stateTextures.wetnessTexture;
  }

  /** Bounded temporal-foam history owned by this Ocean runtime. */
  get foamField(): TemporalFoamField | undefined {
    return this._foamState?.field;
  }

  /** Stable body identity required by typed interaction producers. */
  get waterBodyId(): string {
    return this._waterBodyId;
  }

  /** Sparse typed source producer for wakes and other bounded integrations. */
  get foamSourceSystem(): OceanFoamSourceSystem | undefined {
    return this._foamState?.sources;
  }

  /**
   * Enqueues one bounded foam source and wakes the fixed-time presentation
   * path so deterministic capture states consume external interactions.
   */
  enqueueFoamSource(
    source: Readonly<WaterFoamBoundedSource>
  ): boolean {
    const accepted =
      this._foamState?.sources.enqueue(source) ?? false;
    if (
      accepted &&
      this._surfaceTimeOverride !== undefined
    ) {
      this._requestFixedTimeFoamUpdate("incremental");
    }
    return accepted;
  }

  /** Bounded Impact queue consumed by the Demo splash-particle adapter. */
  get interactionEventQueue(): WaterInteractionEventQueue | undefined {
    return this._foamState?.events;
  }

  get isDestroyed(): boolean {
    return this._destroyed;
  }

  setConfig(config: OceanWaterRuntimeConfig): void {
    const nextWaterBodyId = config.waterBodyId ?? "ocean-preview";
    if (nextWaterBodyId !== this._waterBodyId) {
      throw new Error(
        `Ocean waterBodyId is immutable after construction (${this._waterBodyId} -> ${nextWaterBodyId}).`
      );
    }
    validateWaterFoamDetailTextureBinding(
      config.foamDetail
    );
    this._validateFoamSourceOptions(config);
    const nextFoamEnabled = config.foamEnabled === true;
    const nearshoreChanged =
      config.nearshoreDescriptor !==
        this._config.nearshoreDescriptor ||
      config.nearshoreStateOptions !==
        this._config.nearshoreStateOptions;
    const foamStateChanged =
      nextFoamEnabled !== this._foamEnabled ||
      config.foamSourceOptions !==
        this._config.foamSourceOptions;
    const previousNearshore = nearshoreChanged ? this._nearshoreState : undefined;
    const previousFoam =
      nearshoreChanged || foamStateChanged
        ? this._foamState
        : undefined;
    const nextWaveSet = this._compileWaveSet(config);
    let nextNearshore = this._nearshoreState;
    let nextFoam = this._foamState;
    try {
      if (nearshoreChanged) {
        nextNearshore = this._createNearshoreState(
          config.nearshoreDescriptor,
          config.nearshoreStateOptions
        );
      }
      if (nearshoreChanged || foamStateChanged) {
        nextFoam = this._createFoamState(
          nextNearshore,
          nextWaveSet,
          config
        );
      }
    } catch (error) {
      if (nextFoam && nextFoam !== this._foamState) {
        this._destroyFoamState(nextFoam);
      }
      if (nextNearshore && nextNearshore !== this._nearshoreState) {
        this._destroyNearshoreState(nextNearshore);
      }
      throw error;
    }
    this._nearshoreState = nextNearshore;
    this._foamState = nextFoam;
    this._foamEnabled = nextFoamEnabled;
    this._fixedTimeFoamUpdateMode = "none";
    this._config = config;
    this._reflectionSource = config.reflectionSource ?? this._reflectionSource;
    this._opticalProfile = config.opticalProfile ?? this._opticalProfile;
    this._refractionEnabled = config.refractionEnabled ?? this._refractionEnabled;
    this._waveSet = nextWaveSet;
    this._foamState?.contacts.setWaveConfig(
      this._waveSet,
      config.waterLevel,
      config.timeScale
    );
    if (
      this._surfaceTimeOverride !== undefined &&
      this._foamState
    ) {
      this._resetFoamForFixedTimePrewarm(
        this._foamState
      );
    }
    this._updateSurfaceProvider();
    this.rebuildMesh();
    this._updateCameraFeatureRequest();
    this._applyMaterialState();
    if (previousFoam) this._destroyFoamState(previousFoam);
    if (previousNearshore) this._destroyNearshoreState(previousNearshore);
  }

  rebuildMesh(): void {
    const nextTopologyKey = this._getTopologyKey();
    const topologyChanged = this._topologyKey !== nextTopologyKey;
    if (!topologyChanged) {
      this._ringGeometry.setWaveBounds(
        this._config.waterLevel,
        this._waveSet.maxHorizontalDisplacement,
        this._waveSet.maxVerticalDisplacement
      );
      return;
    }
    const previousGeometry = this._ringGeometry;
    const previousPatchCount = previousGeometry.metrics.patchCount;
    this._ringGeometry = this._createRingGeometry();
    this._topologyKey = nextTopologyKey;
    const nextMetrics = this._ringGeometry.metrics;
    this._meshCreateCount += nextMetrics.meshCreateCount;
    this._meshUploadCount += nextMetrics.meshUploadCount;
    this._meshDestroyCount += previousPatchCount;
    previousGeometry.destroy();
    this._updateReflectionRequest();
  }

  updateMaterial(): void {
    this._waveSet = this._compileWaveSet();
    this._foamState?.contacts.setWaveConfig(
      this._waveSet,
      this._config.waterLevel,
      this._config.timeScale
    );
    this._updateSurfaceProvider();
    this._ringGeometry.setWaveBounds(
      this._config.waterLevel,
      this._waveSet.maxHorizontalDisplacement,
      this._waveSet.maxVerticalDisplacement
    );
    this._applyMaterialState();
  }

  setSurfaceTimeOverride(elapsedTime?: number): void {
    if (
      elapsedTime !== undefined &&
      (!Number.isFinite(elapsedTime) || elapsedTime < 0)
    ) {
      throw new RangeError(
        "Ocean surface time override must be finite and non-negative."
      );
    }
    const changed = elapsedTime !== this._surfaceTimeOverride;
    this._surfaceTimeOverride = elapsedTime;
    if (elapsedTime !== undefined) {
      this._nearshoreState?.stateTextures.seek(elapsedTime);
    }
    if (changed && this._foamState) {
      if (elapsedTime !== undefined) {
        this._resetFoamForFixedTimePrewarm(
          this._foamState
        );
      } else {
        this._foamState.sources.reset();
        this._foamState.contacts.reset();
        this._foamState.textures.clear();
        this._fixedTimeFoamUpdateMode = "none";
      }
    }
    setWaterWaveSurfaceTimeOverride(this._materialState, elapsedTime);
  }

  update(deltaTime: number, cameraWorldPosition?: Readonly<OceanCameraPositionXZ>): void {
    if (!this.root.isActive || this._destroyed) return;
    if (cameraWorldPosition) this._ringGeometry.updateCameraPosition(cameraWorldPosition.x, cameraWorldPosition.z);
    this._frameCount++;
    this._nearshoreState?.stateTextures.updateFrame(
      this._frameCount,
      deltaTime,
      this._surfaceTimeOverride
    );
    this._updateFoam(deltaTime);
  }

  setCameraPosition(worldX: number, worldZ: number): boolean {
    return this._ringGeometry.updateCameraPosition(worldX, worldZ);
  }

  setLodDebug(enabled: boolean): void {
    this._ringGeometry.setLodDebug(enabled);
  }

  setNearshoreDebugView(debugView: OceanNearshoreDebugView): void {
    this._nearshoreDebugView = debugView;
    const state = this._nearshoreState;
    if (state) {
      this._nearshoreState = {
        ...state,
        binding: Object.freeze({ ...state.binding, debugView })
      };
    }
    setWaterWaveNearshoreDebugView(this._materialState, debugView);
  }

  setNearshoreWaveEnabled(enabled: boolean): void {
    if (enabled === this._nearshoreWaveEnabled) return;
    this._nearshoreWaveEnabled = enabled;
    const state = this._nearshoreState;
    if (state) {
      this._nearshoreState = {
        ...state,
        binding: Object.freeze({ ...state.binding, waveEnabled: enabled })
      };
    }
    setWaterWaveNearshoreWaveEnabled(this._materialState, enabled);
  }

  setNearshoreStateEnabled(enabled: boolean): void {
    if (enabled === this._nearshoreStateEnabled) return;
    this._nearshoreStateEnabled = enabled;
    this._nearshoreState?.stateTextures.setEnabled(enabled);
    setWaterWaveNearshoreStateEnabled(this._materialState, enabled);
    if (
      this._surfaceTimeOverride !== undefined &&
      this._foamState
    ) {
      this._resetFoamForFixedTimePrewarm(
        this._foamState
      );
    }
  }

  setNearshoreBreakerEnabled(enabled: boolean): void {
    if (enabled === this._nearshoreBreakerEnabled) return;
    this._nearshoreBreakerEnabled = enabled;
    setWaterWaveNearshoreBreakerEnabled(
      this._materialState,
      this._nearshoreState !== undefined && enabled
    );
  }

  resetNearshoreState(): void {
    this._nearshoreState?.stateTextures.reset();
    if (
      this._surfaceTimeOverride !== undefined &&
      this._foamState
    ) {
      this._resetFoamForFixedTimePrewarm(
        this._foamState
      );
    }
  }

  setFoamEnabled(enabled: boolean): void {
    if (enabled === this._foamEnabled) return;
    this.setConfig({ ...this._config, foamEnabled: enabled });
  }

  setFoamBreakerSourceEnabled(enabled: boolean): void {
    if (enabled === this._foamBreakerSourceEnabled) return;
    this._foamBreakerSourceEnabled = enabled;
    this._foamState?.sources.setBreakerSourceEnabled(enabled);
    if (
      this._surfaceTimeOverride !== undefined &&
      this._foamState
    ) {
      this._resetFoamForFixedTimePrewarm(
        this._foamState
      );
    }
  }

  setShoreFoamEnabled(enabled: boolean): void {
    if (enabled === this._foamShoreSourceEnabled) return;
    this._foamShoreSourceEnabled = enabled;
    this._foamState?.sources.setShoreSourceEnabled(enabled);
    if (
      this._surfaceTimeOverride !== undefined &&
      this._foamState
    ) {
      this._resetFoamForFixedTimePrewarm(
        this._foamState
      );
    }
  }

  setRockContactEnabled(enabled: boolean): void {
    if (enabled === this._rockContactEnabled) return;
    this._rockContactEnabled = enabled;
    this._foamState?.contacts.setEnabled(enabled);
    if (
      this._surfaceTimeOverride !== undefined &&
      this._foamState
    ) {
      this._resetFoamForFixedTimePrewarm(
        this._foamState
      );
    }
  }

  resetRockContacts(): void {
    this._foamState?.contacts.resetContactState();
  }

  setFoamDebugView(debugView: WaterFoamDebugView): void {
    if (
      debugView !== WaterFoamDebugView.Final &&
      debugView !== WaterFoamDebugView.Source &&
      debugView !== WaterFoamDebugView.History
    ) {
      throw new RangeError(`Unsupported Ocean foam debug view: ${debugView}.`);
    }
    this._foamDebugView = debugView;
    const foam = this._foamState;
    const service = foam?.textures;
    if (service) {
      service.setDebugView(
        debugView === WaterFoamDebugView.Source
          ? "source"
          : debugView === WaterFoamDebugView.History
            ? "history"
            : "final"
      );
      if (this._surfaceTimeOverride !== undefined) {
        this._resetFoamForFixedTimePrewarm(foam);
      }
    }
    this._applyFoamBinding();
  }

  resetFoam(): void {
    const foam = this._foamState;
    if (!foam) return;
    foam.sources.reset();
    foam.contacts.reset();
    foam.textures.clear();
    this._fixedTimeFoamUpdateMode =
      this._surfaceTimeOverride !== undefined
        ? "prewarm"
        : "none";
    this._applyFoamBinding();
  }

  setCameraFeatureBroker(broker?: CameraWaterFeatureBroker): void {
    if (broker === this._cameraFeatureBroker) return;
    this._cameraFeatureBroker?.removeRequest(this.opticsConsumerId);
    this._cameraFeatureBroker = broker;
    this._updateCameraFeatureRequest();
    this._applySurfaceOpticsBinding();
  }

  setOpticsTier(tier?: WaterOpticsTier): void {
    if (tier === this._config.opticsTier) return;
    this._config = { ...this._config, opticsTier: tier };
    this._updateCameraFeatureRequest();
    this._applyMaterialState();
  }

  setOpticalProfile(profile: WaterOpticalProfile): void {
    this._opticalProfile = profile;
    this._config = { ...this._config, opticalProfile: profile };
    this._applySurfaceOpticsBinding();
  }

  setRefractionEnabled(enabled: boolean): void {
    this._refractionEnabled = enabled;
    this._config = { ...this._config, refractionEnabled: enabled };
    this._applySurfaceOpticsBinding();
  }

  setReflectionService(service?: WaterReflectionService): void {
    if (service === this._reflectionService) return;
    this._reflectionService?.removeRequest(this.reflectionConsumerId);
    this._reflectionService = service;
    this._updateReflectionRequest();
    this.refreshReflectionBinding();
  }

  setReflectionSource(source: WaterReflectionSource): void {
    if (source === this._reflectionSource) return;
    this._reflectionSource = source;
    this._updateReflectionRequest();
    this._updateCameraFeatureRequest();
    this.refreshReflectionBinding();
  }

  setReflectionVisible(visible: boolean): void {
    if (visible === this._reflectionVisible) return;
    this._reflectionVisible = visible;
    this._updateReflectionRequest();
    this._updateCameraFeatureRequest();
    this.refreshReflectionBinding();
  }

  refreshReflectionBinding(): void {
    if (this._destroyed) return;
    if (!this._reflectionVisible || !this.root.isActive) {
      this._reflectionBinding = undefined;
      this._applySurfaceOpticsBinding();
      return;
    }
    const binding = this._reflectionService?.getBinding(this.reflectionConsumerId);
    this._reflectionBinding = binding;
    this._applySurfaceOpticsBinding();
  }

  stressReconfigure(iterations = OCEAN_RUNTIME_DEFAULT_STRESS_ITERATIONS): OceanWaterRuntimeStressResult {
    const requestedIterations = Math.max(0, Math.floor(iterations));
    const originalConfig = this._config;
    const initialMeshUploadCount = this._meshUploadCount;
    for (let index = 0; index < requestedIterations; index++) {
      const quality =
        OCEAN_RUNTIME_STRESS_QUALITY_SEQUENCE[
          index % OCEAN_RUNTIME_STRESS_QUALITY_SEQUENCE.length
        ];
      this.setConfig({ ...originalConfig, quality });
    }
    this.setConfig(originalConfig);
    return Object.freeze({
      requestedIterations,
      completedIterations: requestedIterations,
      initialMeshUploadCount,
      finalMeshUploadCount: this._meshUploadCount,
      activeMeshCount: this._meshCreateCount - this._meshDestroyCount,
      activeMaterialCount: this._materialCreateCount - this._materialDestroyCount,
      materialCreateCount: this._materialCreateCount,
      materialDestroyCount: this._materialDestroyCount,
      sourceHash: this._waveSet.sourceHash
    });
  }

  destroy(): void {
    if (this._destroyed) return;
    this._destroyed = true;
    this._reflectionService?.removeRequest(this.reflectionConsumerId);
    this._cameraFeatureBroker?.removeRequest(this.opticsConsumerId);
    this._cameraFeatureRequested = false;
    this.root.destroy();
    this._meshDestroyCount += this._ringGeometry.metrics.patchCount;
    this._ringGeometry.destroy();
    this._materialState.material.destroy(true);
    this._materialDestroyCount++;
    if (this._foamState) {
      this._destroyFoamState(this._foamState);
      this._foamState = undefined;
    }
    if (this._nearshoreState) {
      this._destroyNearshoreState(this._nearshoreState);
      this._nearshoreState = undefined;
    }
  }

  private _compileWaveSet(
    config: OceanWaterRuntimeConfig = this._config
  ): CompiledWaterWaveSet {
    return compileWaterWaveAsset(
      createScaledWaveAsset(config),
      config.quality
    );
  }

  private _updateSurfaceProvider(): void {
    this.surfaceProvider.setConfig({
      waterBodyId: this._waterBodyId,
      waveSet: this._waveSet,
      size: this._config.size,
      waterLevel: this._config.waterLevel,
      timeScale: this._config.timeScale,
      unbounded: true,
      nearshoreField: this._nearshoreState?.provider,
      nearshoreState: this._nearshoreState?.stateField
    });
    this._updateReflectionRequest();
  }

  private _createMaterialConfig(): WaterWaveMaterialConfig {
    return {
      baseColor: this._config.oceanColor,
      alpha: this._config.alpha,
      waterLevel: this._config.waterLevel,
      timeScale: this._config.timeScale,
      crestIntensity: this._config.foamIntensity,
      reflectionIntensity:
        this._config.reflectionIntensity ?? 0.46,
      surfaceDetail: this._config.surfaceDetail,
      nearshore: this._nearshoreState?.binding,
      nearshoreBreakerEnabled: this._nearshoreBreakerEnabled,
      foam: this._createFoamBinding(),
      foamDetail: this._config.foamDetail,
      analyticWhitecapEnabled: this._foamEnabled,
      opticsTier: this._resolveOpticsTier(),
      surfaceTimeOverride: this._surfaceTimeOverride
    };
  }

  private _createMaterialState(): WaterWaveMaterialState {
    const state = createWaterWaveMaterial(this._engine, this._waveSet, this._createMaterialConfig());
    this._materialCreateCount++;
    return state;
  }

  private _applyMaterialState(): void {
    const requestedOpticsTier = this._resolveOpticsTier();
    const resolvedOpticsTier =
      requestedOpticsTier === undefined ? undefined : requestedOpticsTier === "medium" ? "medium" : "high";
    if (
      Number(this._materialState.variant) === this._waveSet.shaderWaveCount &&
      this._materialState.opticsTier === resolvedOpticsTier
    ) {
      this._materialState = updateWaterWaveMaterial(this._materialState, this._waveSet, this._createMaterialConfig());
      this._applyNearshoreToggles();
      this._applyFoamBinding();
      this._applySurfaceOpticsBinding();
      return;
    }
    const previousMaterial = this._materialState.material;
    this._materialState = this._createMaterialState();
    this._ringGeometry.setMaterial(this._materialState.material);
    this._applyNearshoreToggles();
    this._applyFoamBinding();
    this._applySurfaceOpticsBinding();
    previousMaterial.destroy(true);
    this._materialDestroyCount++;
  }

  private _resolveRingCount(): 2 | 3 {
    return this._config.quality === WaterQualityTier.Low ? 2 : 3;
  }

  private _resolvePatchSegments(): number {
    return Math.min(
      OCEAN_RUNTIME_MAX_PATCH_SEGMENTS,
      Math.max(
        OCEAN_RUNTIME_MIN_PATCH_SEGMENTS,
        Math.round(this._config.resolution / OCEAN_RUNTIME_PATCH_SEGMENT_DIVISOR)
      )
    );
  }

  private _getTopologyKey(): string {
    return `${this._config.size}:${this._resolveRingCount()}:${this._resolvePatchSegments()}`;
  }

  private _createRingGeometry(): OceanRingGeometry {
    return new OceanRingGeometry(this._engine, this.root, this._materialState.material, {
      size: this._config.size,
      ringCount: this._resolveRingCount(),
      patchSegments: this._resolvePatchSegments(),
      waterLevel: this._config.waterLevel,
      maxHorizontalDisplacement: this._waveSet.maxHorizontalDisplacement,
      maxVerticalDisplacement: this._waveSet.maxVerticalDisplacement,
      skirtDepth: OCEAN_RUNTIME_RING_SKIRT_DEPTH
    });
  }

  private _updateReflectionRequest(): void {
    const service = this._reflectionService;
    if (!service) return;
    service.setRequest({
      id: this.reflectionConsumerId,
      preferredSource: this._reflectionSource,
      quality: this._config.quality,
      visible: this._reflectionVisible && this.root.isActive,
      priority: 0,
      planeY: this._config.waterLevel,
      planarColorMode: this._config.planarColorMode,
      cullingMask: Layer.Everything,
      waterLayerMask: this._ringGeometry.layer
    });
  }

  private _resolveOpticsTier(): WaterOpticsTier | undefined {
    if (this._config.opticsTier) return this._config.opticsTier;
    if (this._config.quality === WaterQualityTier.Medium) return "medium";
    if (this._config.quality === WaterQualityTier.High) return "high";
    return undefined;
  }

  private _updateCameraFeatureRequest(): void {
    const broker = this._cameraFeatureBroker;
    if (!broker) {
      this._cameraFeatureRequested = false;
      return;
    }
    const tier = this._resolveOpticsTier();
    const visible = this._reflectionVisible && this.root.isActive && !this._destroyed;
    if (!tier || !visible) {
      broker.removeRequest(this.opticsConsumerId);
      this._cameraFeatureRequested = false;
      return;
    }
    const quality = tier === "medium" ? "medium" : "high";
    broker.setRequest(this.opticsConsumerId, {
      depthTexture: true,
      opaqueTexture: true,
      reflection: this._reflectionSource === "sky" ? "none" : this._reflectionSource,
      caustics: false,
      underwater: false,
      quality,
      opaqueDownsampling: quality === "medium" ? Downsampling.TwoX : Downsampling.None
    });
    this._cameraFeatureRequested = true;
  }

  private _applySurfaceOpticsBinding(): void {
    const tier = this._resolveOpticsTier();
    this._opticsReadback = setWaterWaveSurfaceOpticsBinding(this._materialState, {
      tier: tier ?? "medium",
      opticalProfile: this._opticalProfile,
      refractionEnabled:
        tier !== undefined &&
        this._refractionEnabled &&
        this._cameraFeatureRequested &&
        this._reflectionVisible &&
        this.root.isActive,
      reflection: this._reflectionBinding,
      reflectionSampling: this._config.reflectionSampling,
      debugView: WaterOpticsDebugView.Final
    });
  }

  private _createFoamState(
    nearshore: OceanWaterRuntimeNearshoreState | undefined,
    waveSet: CompiledWaterWaveSet,
    config: Readonly<OceanWaterRuntimeConfig>
  ): OceanWaterRuntimeFoamState | undefined {
    if (config.foamEnabled !== true || !nearshore) return undefined;
    const grid = nearshore.resource.data.grid;
    const length = grid.cellSizeXZ[0] * grid.width;
    const width = grid.cellSizeXZ[1] * grid.height;
    const centerX =
      grid.originXZ[0] +
      (grid.width - 1) * grid.cellSizeXZ[0] * 0.5;
    const centerZ =
      grid.originXZ[1] +
      (grid.height - 1) * grid.cellSizeXZ[1] * 0.5;
    const field = new TemporalFoamField({
      centerX,
      centerZ,
      length,
      width,
      resolutionX: OCEAN_FOAM_RESOLUTION_X,
      resolutionZ: OCEAN_FOAM_RESOLUTION_Z,
      decayRatePerSecond: OCEAN_FOAM_DECAY_RATE_PER_SECOND
    });
    const pixelCount =
      OCEAN_FOAM_RESOLUTION_X * OCEAN_FOAM_RESOLUTION_Z;
    const fieldResourceBytes = pixelCount * 7;
    const events = new WaterInteractionEventQueue(
      OCEAN_FOAM_EVENT_CAPACITY,
      OCEAN_FOAM_EVENT_CAPACITY
    );
    const eventResourceBytes =
      OCEAN_FOAM_EVENT_CAPACITY *
      (OCEAN_FOAM_EVENT_BYTES_PER_SLOT +
        OCEAN_FOAM_EMITTER_BYTES_PER_SLOT);
    let textures: TemporalFoamTextureService | undefined;
    let sources: OceanFoamSourceSystem | undefined;
    let contacts: OceanObstacleContactSystem | undefined;
    try {
      sources = new OceanFoamSourceSystem(
        nearshore.resource,
        nearshore.stateField,
        field,
        {
          ...config.foamSourceOptions,
          bodyId: this._waterBodyId
        }
      );
      sources.setBreakerSourceEnabled(
        this._foamBreakerSourceEnabled
      );
      sources.setShoreSourceEnabled(this._foamShoreSourceEnabled);
      textures = new TemporalFoamTextureService(
        this._engine,
        field,
        {
          enabled: true,
          quality: "medium",
          debugView:
            this._foamDebugView === WaterFoamDebugView.Source
              ? "source"
              : this._foamDebugView === WaterFoamDebugView.History
                ? "history"
                : "final",
          targetUpdateRateHz: OCEAN_FOAM_UPDATE_RATE_HZ
        }
      );
      contacts = new OceanObstacleContactSystem(
        nearshore.obstacles,
        nearshore.provider,
        nearshore.stateField,
        sources,
        events,
        waveSet,
        config.waterLevel,
        config.timeScale,
        {
          getElapsedTime: () =>
            this._surfaceTimeOverride ??
            this._engine.time.elapsedTime
        }
      );
      contacts.setEnabled(this._rockContactEnabled);
      contacts.update(
        1 / OCEAN_FOAM_UPDATE_RATE_HZ,
        this._surfaceTimeOverride
      );
      sources.update();
      textures.updateFrame(
        this._frameCount,
        1 / OCEAN_FOAM_UPDATE_RATE_HZ,
        nearshore.stateField.currentSnapshot
      );
      this._foamTextureCreateCount +=
        textures.metrics.textureCount;
      this._foamEventQueueCreateCount++;
      return {
        field,
        textures,
        sources,
        events,
        contacts,
        region: Object.freeze([
          field.centerX - field.length * 0.5,
          field.centerZ - field.width * 0.5,
          1 / field.length,
          1 / field.width
        ] as const),
        fieldResourceBytes,
        eventResourceBytes
      };
    } catch (error) {
      contacts?.destroy();
      textures?.destroy();
      sources?.destroy();
      events.reset();
      field.clear();
      throw error;
    }
  }

  private _validateFoamSourceOptions(
    config: Readonly<OceanWaterRuntimeConfig>
  ): void {
    if (
      config.foamEnabled !== true ||
      !config.nearshoreDescriptor
    ) {
      return;
    }
    validateOceanFoamSourceSystemOptions({
      ...config.foamSourceOptions,
      bodyId: this._waterBodyId
    });
  }

  private _destroyFoamState(state: OceanWaterRuntimeFoamState): void {
    this._foamTextureDestroyCount +=
      state.textures.metrics.textureCount;
    this._foamEventQueueDestroyCount++;
    state.contacts.destroy();
    state.textures.destroy();
    state.sources.destroy();
    state.events.reset();
    state.field.clear();
  }

  private _requestFixedTimeFoamUpdate(
    mode: Exclude<OceanFixedTimeFoamUpdateMode, "none">
  ): void {
    if (this._surfaceTimeOverride === undefined) return;
    if (this._fixedTimeFoamUpdateMode === "prewarm") {
      return;
    }
    this._fixedTimeFoamUpdateMode = mode;
  }

  private _resetFoamForFixedTimePrewarm(
    foam: OceanWaterRuntimeFoamState
  ): void {
    foam.sources.reset();
    foam.contacts.reset();
    foam.textures.clear();
    this._fixedTimeFoamUpdateMode = "prewarm";
  }

  private _prewarmFixedTimeFoam(
    foam: OceanWaterRuntimeFoamState,
    elapsedTime: number
  ): void {
    const fixedStepSeconds =
      1 / OCEAN_FOAM_UPDATE_RATE_HZ;
    const stepCount = Math.max(
      1,
      Math.min(
        OCEAN_RUNTIME_FIXED_TIME_FOAM_PREWARM_STEP_COUNT,
        Math.ceil(
          elapsedTime * OCEAN_FOAM_UPDATE_RATE_HZ
        )
      )
    );
    const firstStepTime = Math.max(
      0,
      elapsedTime -
        (stepCount - 1) * fixedStepSeconds
    );
    foam.textures.prewarmFrame(this._frameCount, {
      stepCount,
      stepDeltaSeconds: fixedStepSeconds,
      currentSnapshot:
        this._nearshoreState?.stateField.currentSnapshot,
      prepareStep: (stepIndex) => {
        foam.contacts.update(
          fixedStepSeconds,
          firstStepTime +
            stepIndex * fixedStepSeconds
        );
        foam.sources.update(true);
      }
    });
  }

  private _updateFoam(deltaTime: number): void {
    const foam = this._foamState;
    if (!foam) {
      this._fixedTimeFoamUpdateMode = "none";
      this._applyFoamBinding();
      return;
    }
    if (this._surfaceTimeOverride !== undefined) {
      if (this._fixedTimeFoamUpdateMode === "prewarm") {
        this._prewarmFixedTimeFoam(
          foam,
          this._surfaceTimeOverride
        );
        this._fixedTimeFoamUpdateMode = "none";
      } else if (
        this._fixedTimeFoamUpdateMode === "incremental"
      ) {
        foam.contacts.update(
          1 / OCEAN_FOAM_UPDATE_RATE_HZ,
          this._surfaceTimeOverride
        );
        foam.sources.update();
        foam.textures.updateFrame(
          this._frameCount,
          1 / OCEAN_FOAM_UPDATE_RATE_HZ,
          this._nearshoreState?.stateField.currentSnapshot
        );
        this._fixedTimeFoamUpdateMode = "none";
      }
      this._applyFoamBinding();
      return;
    }
    foam.contacts.update(deltaTime);
    foam.sources.update();
    foam.textures.updateFrame(
      this._frameCount,
      deltaTime,
      this._nearshoreState?.stateField.currentSnapshot
    );
    this._applyFoamBinding();
  }

  private _createFoamBinding(): WaterTemporalFoamBinding | undefined {
    const foam = this._foamState;
    const texture = foam?.textures.texture;
    if (!foam || !texture) return undefined;
    return Object.freeze({
      texture,
      region: foam.region,
      texelSize: Object.freeze([
        1 / foam.field.resolutionX,
        1 / foam.field.resolutionZ
      ] as const),
      debugView: foam.textures.bindingDebugView
    });
  }

  private _applyFoamBinding(): void {
    const foam = this._foamState;
    setWaterWaveFoamTexture(
      this._materialState,
      foam?.textures.texture ?? undefined,
      foam?.textures.bindingDebugView ?? WaterFoamDebugView.Final,
      this._foamEnabled
    );
  }

  private _createNearshoreState(
    descriptor: OceanWaterRuntimeConfig["nearshoreDescriptor"],
    stateOptions?: Readonly<OceanNearshoreStateFieldOptions>
  ): OceanWaterRuntimeNearshoreState | undefined {
    if (!descriptor) return undefined;
    const compiled = OceanNearshoreCompiler.compile(descriptor);
    if (!compiled.valid || !compiled.data) {
      const summary = compiled.diagnostics
        .map((diagnostic) => `${diagnostic.path}: ${diagnostic.message}`)
        .join("; ");
      throw new Error(`Ocean nearshore compilation failed: ${summary}`);
    }
    const resource = OceanNearshoreFieldResource.create(compiled.data);
    let provider: OceanNearshoreFieldProvider | undefined;
    let texture: Texture2D | undefined;
    let stateField: OceanNearshoreStateField | undefined;
    let stateTextures: OceanNearshoreStateTextureService | undefined;
    let obstacles: OceanObstacleFieldResource | undefined;
    try {
      provider = new OceanNearshoreFieldProvider(resource);
      texture = createOceanNearshoreFieldTexture(this._engine, resource);
      stateField = new OceanNearshoreStateField(
        resource,
        stateOptions
      );
      stateTextures = new OceanNearshoreStateTextureService(
        this._engine,
        stateField
      );
      if (!this._nearshoreStateEnabled) stateTextures.setEnabled(false);
      stateTextures.updateFrame(
        this._frameCount,
        0,
        this._surfaceTimeOverride
      );
      obstacles = new OceanObstacleFieldResource(compiled.data.obstacles);
      const staticBinding = createOceanNearshoreStaticBinding(
        resource,
        texture,
        this._nearshoreDebugView
      );
      this._nearshoreTextureCreateCount +=
        1 + stateTextures.metrics.textureCount;
      return {
        resource,
        provider,
        texture,
        stateField,
        stateTextures,
        binding: attachOceanNearshoreDynamicBinding(
          staticBinding,
          stateTextures,
          this._nearshoreWaveEnabled
        ),
        obstacles
      };
    } catch (error) {
      obstacles?.dispose();
      stateTextures?.destroy();
      stateField?.destroy();
      texture?.destroy(true);
      provider?.destroy();
      resource.dispose();
      throw error;
    }
  }

  private _destroyNearshoreState(state: OceanWaterRuntimeNearshoreState): void {
    this._nearshoreTextureDestroyCount +=
      1 + state.stateTextures.metrics.textureCount;
    state.stateTextures.destroy();
    state.stateField.destroy();
    state.texture.destroy(true);
    state.provider.destroy();
    state.obstacles.dispose();
    state.resource.dispose();
  }

  private _applyNearshoreToggles(): void {
    setWaterWaveNearshoreWaveEnabled(
      this._materialState,
      this._nearshoreState !== undefined && this._nearshoreWaveEnabled
    );
    setWaterWaveNearshoreStateEnabled(
      this._materialState,
      this._nearshoreState !== undefined && this._nearshoreStateEnabled
    );
    setWaterWaveNearshoreBreakerEnabled(
      this._materialState,
      this._nearshoreState !== undefined &&
        this._nearshoreBreakerEnabled
    );
  }
}
