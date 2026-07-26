import type { OceanNearshoreDescriptorV1 } from "../../authoring/ocean/OceanNearshoreDescriptor";
import type { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";
import type { WaterWaveModel } from "../../authoring/wave/enums/WaterWaveModel";
import type { WaterWaveAssetV1 } from "../../authoring/wave/WaterWaveTypes";
import type { WaterReflectionSource } from "../optics/WaterReflectionPolicy";
import type { WaterPlanarColorMode } from "../optics/WaterReflectionTypes";
import type { WaterOpticalProfile } from "../optics/WaterOpticalProfile";
import type {
  ResolvedWaterOpticsTier,
  WaterOpticsTier,
  WaterPlanarFilterSampleCount,
  WaterSurfaceOpticsReflectionSamplingConfig
} from "../optics/WaterSurfaceOpticsTypes";
import type {
  WaterFoamDetailTextureBinding,
  WaterSurfaceDetailConfig
} from "../wave/WaterWaveRuntimeTypes";
import type { WaterFoamDebugView } from "../interaction/WaterFoamTypes";
import type { OceanNearshoreStateFieldOptions } from "./OceanNearshoreStateField";
import type { OceanFoamSourceTuningOptions } from "./OceanFoamSourceSystem";

/** Engine-facing configuration for one camera-relative, unbounded Ocean runtime. */
export interface OceanWaterRuntimeConfig {
  /** Stable identity used by CPU surface queries and camera-feature leases. */
  waterBodyId?: string;
  size: number;
  resolution: number;
  waterLevel: number;
  amplitudeScale: number;
  timeScale: number;
  quality: WaterQualityTier;
  waveAsset: WaterWaveAssetV1;
  alpha: number;
  foamIntensity: number;
  /**
   * Enables analytic whitecaps plus the bounded nearshore foam/contact pipeline.
   * Defaults to false so existing Ocean consumers allocate no new history.
   */
  foamEnabled?: boolean;
  /**
   * Optional per-body bounded Breaker and shoreline source tuning.
   * Sparse Wake, Impact, and Obstacle sources keep their authored strengths.
   */
  foamSourceOptions?: OceanFoamSourceTuningOptions;
  /** Optional borrowed RGB micro-breakup texture; temporal foam remains runtime-owned. */
  foamDetail?: WaterFoamDetailTextureBinding;
  oceanColor: string;
  /** Visual-only world-space detail; omitted configurations bind no detail texture. */
  surfaceDetail?: WaterSurfaceDetailConfig;
  /** Optional finite bathymetry/shoreline fact source attached to the unbounded Rings. */
  nearshoreDescriptor?: OceanNearshoreDescriptorV1;
  /**
   * Optional per-body fixed-step swash, thin-film, and wetness tuning.
   * Omitted fields preserve the bounded runtime defaults.
   */
  nearshoreStateOptions?: OceanNearshoreStateFieldOptions;
  /** Defaults to sky until a per-camera WaterReflectionService is attached. */
  reflectionSource?: WaterReflectionSource;
  /** Body-specific reflection multiplier; defaults to the historical Ocean value. */
  reflectionIntensity?: number;
  /** Explicit Planar color policy. Omitted configurations preserve the historical LDR target. */
  planarColorMode?: WaterPlanarColorMode;
  /** Independent optics tier; Experimental deliberately resolves through High. */
  opticsTier?: WaterOpticsTier;
  opticalProfile?: WaterOpticalProfile;
  refractionEnabled?: boolean;
  /** Explicit showcase reflection sampling; High remains one tap unless this opts into five. */
  reflectionSampling?: WaterSurfaceOpticsReflectionSamplingConfig;
}

export interface OceanWaterRuntimeMetrics {
  readonly waveModel: WaterWaveModel;
  readonly quality: WaterQualityTier;
  readonly shaderWaveCount: number;
  readonly activeWaveCount: number;
  readonly sourceHash: string;
  readonly meshUploadCount: number;
  readonly meshCreateCount: number;
  readonly meshDestroyCount: number;
  readonly materialCreateCount: number;
  readonly materialDestroyCount: number;
  readonly activeMeshCount: number;
  readonly activeMaterialCount: number;
  readonly vertexCount: number;
  readonly ringCount: number;
  readonly patchCount: number;
  readonly visiblePatchCount: number;
  readonly drawCount: number;
  readonly triangleCount: number;
  readonly visibleTriangleCount: number;
  readonly originSnapCount: number;
  readonly originX: number;
  readonly originZ: number;
  readonly baseCellSize: number;
  readonly coverageHalfExtent: number;
  readonly reflectionSource: WaterReflectionSource;
  readonly reflectionFilterSampleCount: WaterPlanarFilterSampleCount;
  readonly surfaceDetailEnabled: boolean;
  readonly surfaceDetailLayerCount: 0 | 1 | 2 | 3;
  readonly surfaceDetailTextureCount: number;
  readonly surfaceDetailResourceBytes: number;
  readonly nearshoreEnabled: boolean;
  readonly nearshoreSourceHash?: string;
  readonly nearshoreWetTexelCount: number;
  readonly nearshoreDryTexelCount: number;
  readonly nearshoreResourceBytes: number;
  readonly nearshoreTextureCreateCount: number;
  readonly nearshoreTextureDestroyCount: number;
  readonly activeNearshoreTextureCount: number;
  readonly nearshoreWaveEnabled: boolean;
  readonly nearshoreStateEnabled: boolean;
  readonly nearshoreBreakerEnabled: boolean;
  readonly nearshoreStateRevision: number;
  readonly nearshoreStateUpdateRateHz: number;
  readonly nearshoreStateUpdateCount: number;
  readonly nearshoreStateUploadCount: number;
  readonly nearshoreWetnessUploadRateHz: number;
  readonly nearshoreWetnessUploadCount: number;
  readonly nearshoreThinFilmTexelCount: number;
  readonly nearshoreBreakerTexelCount: number;
  readonly nearshoreWetnessTexelCount: number;
  readonly nearshoreBreakerPeak: number;
  readonly nearshoreWetnessPeak: number;
  readonly nearshoreMaximumBackwashSpeed: number;
  readonly nearshoreCurrentSnapshotRevision: number;
  readonly nearshoreDynamicResourceBytes: number;
  readonly foamEnabled: boolean;
  readonly analyticWhitecapEnabled: boolean;
  readonly foamDebugView: WaterFoamDebugView;
  readonly foamTextureCount: number;
  readonly foamDetailTextureCount: number;
  readonly foamDetailTextureSource: "none" | "procedural" | "external";
  readonly foamDetailResourceBytes: number;
  readonly foamTextureCreateCount: number;
  readonly foamTextureDestroyCount: number;
  readonly foamEventQueueCreateCount: number;
  readonly foamEventQueueDestroyCount: number;
  readonly activeFoamEventQueueCount: number;
  readonly foamTargetUpdateRateHz: number;
  readonly foamHistoryUpdateCount: number;
  readonly foamFixedTimePrewarmCount: number;
  readonly foamFixedTimePrewarmStepCount: number;
  readonly foamUploadCount: number;
  readonly foamSourceUpdateCount: number;
  readonly foamSourcePixelCount: number;
  readonly foamHistoryPixelCount: number;
  readonly foamHistoryPeak: number;
  readonly foamHistoryEnergy: number;
  readonly foamHistoryCentroidX: number;
  readonly foamHistoryCentroidZ: number;
  readonly foamBreakerSourcePixelCount: number;
  readonly foamShoreSourcePixelCount: number;
  readonly foamBreakerSourceEnabled: boolean;
  readonly foamShoreSourceEnabled: boolean;
  readonly foamObstacleInjectionCount: number;
  readonly foamImpactInjectionCount: number;
  readonly foamWakeInjectionCount: number;
  readonly foamEventCapacity: number;
  readonly foamPendingEventCount: number;
  readonly foamEventAcceptedCount: number;
  readonly foamEventDroppedCount: number;
  readonly foamEventOverflowCount: number;
  readonly foamEventAggregatedCount: number;
  readonly foamContactUpdateRateHz: number;
  readonly foamContactSamplingBudget: number;
  readonly foamContactUpdateCount: number;
  readonly rockContactEnabled: boolean;
  readonly rockContactActiveCount: number;
  readonly rockContactPeakEnergy: number;
  readonly rockContactImpactAcceptedCount: number;
  readonly foamCurrentSurfaceQueryCount: 0;
  readonly foamResourceBytes: number;
  readonly requestedOpticsTier?: WaterOpticsTier;
  readonly resolvedOpticsTier?: ResolvedWaterOpticsTier;
  readonly compiledOpticsTier?: ResolvedWaterOpticsTier;
  readonly refractionEnabled: boolean;
  readonly cameraFeatureRequested: boolean;
  readonly frameCount: number;
  readonly perFrameMeshUpload: false;
}

export interface OceanWaterRuntimeStressResult {
  readonly requestedIterations: number;
  readonly completedIterations: number;
  readonly initialMeshUploadCount: number;
  readonly finalMeshUploadCount: number;
  readonly activeMeshCount: number;
  readonly activeMaterialCount: number;
  readonly materialCreateCount: number;
  readonly materialDestroyCount: number;
  readonly sourceHash: string;
}
