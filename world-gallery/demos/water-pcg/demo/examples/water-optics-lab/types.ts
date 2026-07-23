import type { WaterReflectionSource } from "../../../runtime/optics/WaterReflectionPolicy";
import type {
  WaterOpticsPerformanceCaptureOptions,
  WaterOpticsPerformanceReport
} from "./WaterOpticsPerformanceSampler";
import type { DemoReflectionProbeFaceHashes } from "./DemoReflectionProbe";
import type { HeightfieldWaterFeatureFlags } from "../../../runtime/heightfield/types";
import type {
  WaterOpticsReferencePixelAnalysis,
  WaterOpticsReferencePixelEvidence
} from "../../../runtime/optics/WaterOpticsCompositionAnalysis";
import type { WaterOpticsPlanarAnchorExpectedPoint } from "./WaterOpticsPlanarAnchorReference";
import type {
  ResolvedWaterOpticalProfile,
  ResolvedWaterOpticsTier,
  WaterOpticsTier as SharedWaterOpticsTier,
  WaterSurfaceOpticsBindingFallbackReason,
  WaterSurfaceOpticsTierFallbackReason
} from "../../../runtime/optics/WaterSurfaceOpticsTypes";

export type WaterOpticsTier = "medium" | "high" | "experimental";

export type WaterOpticsPreset =
  | "refraction-correctness"
  | "reflection-correctness"
  | "multi-water-arbitration"
  | "cross-body-optics"
  | "lifecycle-stress"
  | "composite-ab"
  | "ssr-fallback"
  | "temporal-motion"
  | "waterline-caustics";

export type WaterOpticsCameraPreset =
  | "overview"
  | "refraction-edge"
  | "depth-steps"
  | "reflection-front"
  | "reflection-offscreen"
  | "grazing-angle"
  | "multi-water"
  | "multi-pool"
  | "planar-too-close"
  | "planar-underwater"
  | "planar-back-facing"
  | "surface-crossing";

export type WaterOpticsDebugView =
  | "final"
  | "centered-opaque-color"
  | "displaced-opaque-color"
  | "refraction-uv-delta"
  | "optical-depth"
  | "depth-continuity"
  | "sample-validity"
  | "fresnel"
  | "shader-composited-color"
  | "surface-alpha"
  | "final-framebuffer-color"
  | "reflection-source"
  | "planar-uv"
  | "clip-side"
  | "refraction-amount"
  | "refraction-gates"
  | "reflection-color"
  | "normal-dot-view"
  | "ssr-hit"
  | "ssr-steps"
  | "ssr-confidence"
  | "history-rejection";

export type WaterOpticsCompositionMode = "legacy" | "precomposed" | "dedicated";
export type WaterOpticsCalibrationMode = "none" | "cpu-reference" | "pure-transmission";
export type WaterOpticsTransparentOrderingProbeMode = "hidden" | "after-water" | "before-water";
export type WaterOpticsReflectionMode = "auto" | WaterReflectionSource | "ssr";
export type WaterOpticsWaterBody = "pool" | "river" | "ocean" | "multi";
export type WaterOpticsPlanarOrientation = "left" | "right" | "up" | "down";

export type WaterOpticsReferencePixelInput = Omit<WaterOpticsReferencePixelEvidence, "profile">;

export type WaterOpticsP1BodyKind = "pool-heightfield" | "secondary-pool-heightfield" | "river" | "ocean";
export type WaterOpticsP1PlanarConsumer = "pool" | "secondary-pool" | "ocean";
export type WaterOpticsP1MatrixMode = "inactive" | "cross-body" | "dual-pool";

export interface WaterOpticsP1BodyReadback {
  readonly consumerId: string;
  readonly bodyKind: WaterOpticsP1BodyKind;
  readonly planarEligible: boolean;
  readonly requestedTier?: SharedWaterOpticsTier;
  readonly resolvedTier?: ResolvedWaterOpticsTier;
  readonly tierFallbackReason?: WaterSurfaceOpticsTierFallbackReason;
  readonly requestedSource?: WaterReflectionSource;
  readonly bindingResolvedSource?: WaterReflectionSource;
  readonly effectiveSource?: WaterReflectionSource;
  readonly fallbackReason?: WaterSurfaceOpticsBindingFallbackReason;
  readonly refractionEnabled: boolean;
  readonly debugView?: number;
  readonly filterSampleCount: 1 | 5;
  readonly textureWidth: number;
  readonly textureHeight: number;
  readonly opticalProfile?: Readonly<ResolvedWaterOpticalProfile>;
}

export interface WaterOpticsP1MatrixMetrics {
  readonly active: boolean;
  readonly mode: WaterOpticsP1MatrixMode;
  readonly validationScope: "evidence-gated";
  readonly materialConsumerCount: 0 | 2 | 3;
  readonly simultaneousVisibleMaterialConsumerCount: 0 | 1 | 2 | 3;
  readonly sharedOpticalProfileReference: boolean;
  readonly sharedBindingInstance: boolean;
  readonly consumerIds: readonly string[];
  readonly consumerPlaneYs: Readonly<{
    pool: number;
    river: number;
    ocean: number;
    secondaryPool: number;
  }>;
  readonly poolVisible: boolean;
  readonly riverVisible: boolean;
  readonly oceanVisible: boolean;
  readonly secondaryPoolVisible: boolean;
  readonly secondaryPoolRuntimeCreated: boolean;
  readonly secondaryPoolRuntimeCreateCount: number;
  readonly secondaryPoolRuntimeDestroyCount: number;
  readonly secondaryPoolRuntimeLiveCount: 0 | 1;
  readonly bodyReadbacks: Readonly<{
    pool: WaterOpticsP1BodyReadback;
    river: WaterOpticsP1BodyReadback;
    ocean: WaterOpticsP1BodyReadback;
    secondaryPool: WaterOpticsP1BodyReadback;
  }>;
  readonly cameraDepthCopyPassCount: 0 | 1;
  readonly cameraOpaqueCopyPassCount: 0 | 1;
  readonly cameraFeatureConsumerIds: readonly string[];
  readonly activeReflectionConsumerCount: number;
  readonly eligiblePlanarRequestCount: number;
  readonly selectedPlanarOwnerId?: string;
  readonly pendingPlanarOwnerId?: string;
  readonly renderedPlanarOwnerId?: string;
  readonly planarOwnerAgeFrames: number;
  readonly pendingPlanarOwnerAgeFrames: number;
  readonly planarCameraCount: 0 | 1;
  readonly liveRenderTargetCount: 0 | 1;
  readonly reflectionCameraCreateCount: number;
  readonly reflectionCameraDestroyCount: number;
  readonly renderTargetCreateCount: number;
  readonly renderTargetDestroyCount: number;
  readonly experimentalRequested: boolean;
  readonly experimentalResolvedHigh: boolean;
  readonly experimentalFallbackReason?: WaterSurfaceOpticsTierFallbackReason;
  readonly experimentalAdditionalRenderTargetCount: number;
}

export interface WaterOpticsLabMetrics {
  readonly ready: boolean;
  readonly requestedTier: WaterOpticsTier;
  readonly resolvedTier: WaterOpticsTier;
  readonly fallbackReason?: string;
  readonly preset: WaterOpticsPreset;
  readonly cameraPreset: WaterOpticsCameraPreset;
  readonly waterBody: WaterOpticsWaterBody;
  /** Consumer represented by the top-level reflection/material readback fields. */
  readonly opticsMetricConsumerId: string;
  readonly reflectionMode: WaterOpticsReflectionMode;
  readonly reflectionSource: WaterReflectionSource;
  readonly resolvedReflectionSource: WaterReflectionSource;
  readonly reflectionFallbackReason?: string;
  readonly refractionEnabled: boolean;
  readonly compositionMode: WaterOpticsCompositionMode;
  readonly depthWriteEnabled: boolean;
  readonly waterRendererPriority: number;
  readonly activeWaterRendererPriority?: number;
  readonly waterBlendEnabled?: boolean;
  readonly transparentOrderingProbeMode: WaterOpticsTransparentOrderingProbeMode;
  readonly transparentSentinelPriority: number;
  readonly transparentSentinelNormalPriority: number;
  readonly transparentSentinelTransparent: boolean;
  readonly transparentOrderingContractSatisfied: boolean;
  readonly transparentOrderingProbeWaterFirst: boolean;
  readonly planarClipEnabled: boolean;
  readonly debugView: WaterOpticsDebugView;
  readonly calibrationMode: WaterOpticsCalibrationMode;
  readonly calibrationFeatureFlags: Readonly<HeightfieldWaterFeatureFlags>;
  readonly calibrationReferenceCompositionEnabled: boolean;
  readonly calibrationEffectiveFresnelOverride?: 0;
  readonly calibrationOpticalProfile?: Readonly<ResolvedWaterOpticalProfile>;
  readonly opticalDepthNormalizationMeters: number;
  readonly planarAnchorVisible: boolean;
  readonly planarOrientationMarkersVisible: boolean;
  readonly localFoamMaskEnabled: boolean;
  readonly localFoamMaskCenterXZ: readonly [number, number];
  readonly localFoamMaskHalfSizeXZ: readonly [number, number];
  readonly localFoamMaskFeatherMeters: number;
  readonly localFoamMaskSuppressesRefraction: true;
  readonly reflectorMovementEnabled: boolean;
  readonly reflectorVisible: boolean;
  readonly reflectorTimeOverrideActive: boolean;
  readonly reflectorAnimating: boolean;
  readonly reflectorTime: number;
  readonly reflectorWorldPosition: readonly [number, number, number];
  readonly cameraMovementEnabled: boolean;
  readonly freeCameraEnabled: boolean;
  readonly cameraWorldPosition: readonly [number, number, number];
  readonly cameraWorldForward: readonly [number, number, number];
  readonly cameraCutCount: number;
  readonly frozen: boolean;
  readonly surfaceTime: number;
  readonly statsEnabled: boolean;
  readonly statsPanelVisible: boolean;
  readonly statsRole: "display-only";
  readonly experimentalFeaturesEnabled: false;
  readonly sourceHash: string;
  readonly fixtureObjectCount: number;
  readonly waterBodyCount: number;
  readonly cameraDepthCopyPassCount: 0 | 1;
  readonly cameraOpaqueCopyPassCount: 0 | 1;
  readonly cameraFeatureBytes: number;
  readonly opaqueDownsampling: string;
  readonly planarOwnerId?: string;
  readonly planarCameraCount: 0 | 1;
  readonly planarRenderTargetCount: 0 | 1;
  readonly planarRenderTargetBytes: number;
  readonly waterLayerMask: number;
  readonly planarCameraCullingMask: number;
  readonly waterLayerExcludedFromPlanar: boolean;
  readonly materialReflectionSource: WaterReflectionSource;
  readonly materialReflectionFallbackReason?: string;
  readonly planarTextureWidth: number;
  readonly planarTextureHeight: number;
  readonly planarDistortionStrength: number;
  readonly planarEdgeFadeTexels: number;
  readonly planarFilterSampleCount: 1 | 5;
  readonly probeTextureAvailable: boolean;
  readonly probeTextureBound: boolean;
  readonly probeResourceBytes: number;
  readonly probeFaceHashes: Readonly<DemoReflectionProbeFaceHashes>;
  readonly probeProvenance: typeof import("./DemoReflectionProbe").DEMO_REFLECTION_PROBE_PROVENANCE;
  readonly engineTextureBytes: number;
  readonly engineBufferBytes: number;
  readonly engineTotalBytes: number;
  readonly p1: WaterOpticsP1MatrixMetrics;
  readonly runtimeError: string;
}

export interface WaterOpticsLabProbeSnapshot {
  readonly textureAvailable: boolean;
  readonly resourceBytes: number;
  readonly faceHashes: Readonly<DemoReflectionProbeFaceHashes>;
  readonly provenance: typeof import("./DemoReflectionProbe").DEMO_REFLECTION_PROBE_PROVENANCE;
}

export interface WaterOpticsPerformanceCapabilities {
  readonly frameSampler: true;
  readonly engineMemory: true;
  readonly waterMemory: true;
  readonly statsRole: "display-only";
  readonly formalCaptureRequiresStatsOff: true;
  readonly formalSamplingMinimums: {
    readonly warmupDurationMs: 2000;
    readonly minimumFrameCount: 300;
    readonly minimumSampleDurationMs: 5000;
  };
  readonly phaseSequence: readonly ["off-before", "on", "off-after"];
  readonly gpuTimerStatus: "available" | "unavailable";
  readonly gpuTimerSource?: "EXT_disjoint_timer_query_webgl2";
  readonly gpuUnavailableIsNotZero: true;
}

export interface WaterOpticsLifecycleStressResult {
  readonly iterations: number;
  readonly initialPlanarCreateCount: number;
  readonly finalPlanarCreateCount: number;
  readonly initialPlanarDestroyCount: number;
  readonly finalPlanarDestroyCount: number;
  readonly runtimeError: string;
}

export interface WaterOpticsP1LifecycleStressResult {
  readonly iterations: number;
  readonly requestAddCount: number;
  readonly requestRemoveCount: number;
  readonly initialActiveConsumerCount: number;
  readonly finalActiveConsumerCount: number;
  readonly initialLiveRenderTargetCount: 0 | 1;
  readonly finalLiveRenderTargetCount: 0 | 1;
  readonly initialPlanarCameraCount: 0 | 1;
  readonly finalPlanarCameraCount: 0 | 1;
  readonly renderTargetCreateGrowth: number;
  readonly reflectionCameraCreateGrowth: number;
  readonly balanced: boolean;
  readonly runtimeError: string;
}

export interface WaterOpticsLabApi {
  readonly ready: boolean;
  readonly requestedTier: WaterOpticsTier;
  readonly resolvedTier: WaterOpticsTier;
  readonly fallbackReason?: string;
  readonly metrics: WaterOpticsLabMetrics;
  setTier(tier: WaterOpticsTier): Promise<void>;
  setPreset(preset: WaterOpticsPreset): Promise<void>;
  setWaterBody(body: WaterOpticsWaterBody): Promise<void>;
  setReflectionMode(mode: WaterOpticsReflectionMode): void;
  setReflectionSource(source: WaterReflectionSource): void;
  setRefractionEnabled(enabled: boolean): void;
  setCompositionMode(mode: WaterOpticsCompositionMode): void;
  setDepthWriteEnabled(enabled: boolean): void;
  setTransparentOrderingProbeMode(mode: WaterOpticsTransparentOrderingProbeMode): void;
  setPlanarClipEnabled(enabled: boolean): void;
  setDebugView(view: WaterOpticsDebugView): void;
  setCalibrationMode(mode: WaterOpticsCalibrationMode): void;
  setCalibrationFeatureFlags(flags: HeightfieldWaterFeatureFlags): void;
  setPlanarAnchorVisible(visible: boolean): void;
  setPlanarOrientationMarkersVisible(visible: boolean): void;
  getPlanarAnchorExpectedPoint(): Readonly<WaterOpticsPlanarAnchorExpectedPoint>;
  getPlanarOrientationExpectedPoints(): Readonly<
    Record<WaterOpticsPlanarOrientation, Readonly<WaterOpticsPlanarAnchorExpectedPoint>>
  >;
  analyzeReferencePixel(input: WaterOpticsReferencePixelInput): Readonly<WaterOpticsReferencePixelAnalysis>;
  setPlanarFilterEnabled(enabled: boolean): void;
  setCameraPreset(preset: WaterOpticsCameraPreset): void;
  setCameraMovementEnabled(enabled: boolean): void;
  setFreeCameraEnabled(enabled: boolean): void;
  cameraCut(): void;
  setReflectorMovementEnabled(enabled: boolean): void;
  setReflectorTime(seconds: number): void;
  clearReflectorTimeOverride(): void;
  setLocalFoamMaskEnabled(enabled: boolean): void;
  setStatsPanelVisible(visible: boolean): void;
  freezeTime(enabled: boolean): void;
  stepFrame(): void;
  runLifecycleStress(iterations?: number): Promise<WaterOpticsLifecycleStressResult>;
  setP1PlanarConsumerVisible(consumer: WaterOpticsP1PlanarConsumer, visible: boolean): void;
  resetP1PlanarConsumers(): void;
  runP1LifecycleStress(iterations?: number): Promise<WaterOpticsP1LifecycleStressResult>;
  getPerformanceCapabilities(): WaterOpticsPerformanceCapabilities;
  runPerformanceCapture(options?: Partial<WaterOpticsPerformanceCaptureOptions>): Promise<WaterOpticsPerformanceReport>;
  getLastPerformanceReport(): WaterOpticsPerformanceReport | undefined;
}

declare global {
  interface Window {
    waterPcgOptics?: WaterOpticsLabApi;
  }
}
