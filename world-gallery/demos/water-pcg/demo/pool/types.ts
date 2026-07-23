import type { PoolSurfaceUploadStrategy } from "../../runtime/interaction/PoolSurfaceUploadPolicy";
import type { WaterCurrentFieldSnapshotKind } from "../../runtime/interaction/WaterCurrentFieldSnapshot";
import type { WaterReflectionSource } from "../../runtime/optics/WaterReflectionPolicy";
import type {
  ResolvedWaterOpticalProfile,
  ResolvedWaterOpticsTier,
  WaterOpticsTier
} from "../../runtime/optics/WaterSurfaceOpticsTypes";
import type { PoolLocalEffectsDebugView, PoolP1BodyCount } from "./PoolP1ShowcaseConfig";

export type InteractivePoolGridQuality = "low" | "medium" | "high";
export type InteractivePoolUnderwaterPreset = "outside" | "surface" | "inside";

export interface InteractivePoolOpticalMediumReadback {
  readonly opticalDistanceMeters: number;
  readonly sourceLinearColor: readonly [red: number, green: number, blue: number];
  readonly mediumLinearColor: readonly [red: number, green: number, blue: number];
}

/** Browser-readable proof that surface and fullscreen paths consume one resolved optical medium. */
export interface InteractivePoolOpticalContinuityReadback {
  readonly quality: InteractivePoolGridQuality;
  readonly surfaceResolvedProfile: Readonly<ResolvedWaterOpticalProfile>;
  readonly underwaterResolvedProfile: Readonly<ResolvedWaterOpticalProfile>;
  readonly surfaceProfileFingerprint: string;
  readonly underwaterProfileFingerprint: string;
  readonly shaderBoundUnderwaterProfileFingerprint: string;
  readonly underwaterShaderProfileBindCount: number;
  readonly configuredReferenceConsistent: boolean;
  readonly activeReferenceConsistent: boolean | null;
  readonly activeProfileFingerprint: string;
  readonly maximumResolvedProfileDelta: number;
  readonly surfaceMediumReadback: Readonly<InteractivePoolOpticalMediumReadback>;
  readonly underwaterMediumReadback: Readonly<InteractivePoolOpticalMediumReadback>;
  readonly maximumMediumColorDelta: number;
  readonly finite: boolean;
}

export interface InteractivePoolUnderwaterDebugApi {
  readonly isUnderwater: boolean;
  readonly activeBodyId: string;
  readonly signedSurfaceDistance: number;
  readonly submergedDepth: number;
  readonly transitionCount: number;
  readonly passExecutionCount: number;
  readonly passMaterialAllocated: boolean;
  readonly passMaterialCreateCount: number;
  readonly passMaterialDestroyCount: number;
  readonly opticalContinuity: Readonly<InteractivePoolOpticalContinuityReadback>;
  setPreset(preset: InteractivePoolUnderwaterPreset): void;
}

export interface InteractivePoolP1Metrics {
  readonly enabled: boolean;
  readonly bodyCount: PoolP1BodyCount;
  readonly bodyCountSelection: "url" | "device-tier" | "legacy" | "manual";
  /** Actual spawned fleet bodies, excluding the legacy interactive ball. */
  readonly additionalBodyCount: number;
  readonly drivingBodyCount: number;
  readonly submergedBodyCount: number;
  readonly maximumHorizontalSpeed: number;
  readonly dynamicEffectsEnabled: boolean;
  readonly modifierCount: number;
  readonly queueCapacity: number;
  readonly emitterCapacity: number;
  readonly queuedEventCount: number;
  readonly acceptedEventCount: number;
  readonly droppedEventCount: number;
  readonly aggregatedEventCount: number;
  readonly stationaryRejectedEventCount: number;
  readonly peakQueuedEventCount: number;
  readonly debugView: PoolLocalEffectsDebugView;
  readonly temporalFoamEnabled: boolean;
  readonly foamSourceInjectionCount: number;
  readonly foamActiveHistoryPixelCount: number;
  readonly foamPeakHistoryValue: number;
  readonly foamHistoryEnergy: number;
  readonly foamActiveLifetimeSeconds: number;
  readonly foamMaximumLifetimeSeconds: number;
  readonly foamCentroidDriftDistance: number;
  readonly foamUpdateCount: number;
  readonly foamIdleSkipCount: number;
  readonly foamTextureUploadsPerRenderFrame: number;
  readonly foamTextureUploadCount: number;
  readonly foamResourceBytes: number;
  readonly foamCurrentSnapshotKind: WaterCurrentFieldSnapshotKind | "none";
  readonly foamCurrentSnapshotRevision: number;
  readonly foamCurrentSnapshotBuildCount: number;
  readonly foamCurrentLookupCount: number;
  readonly foamFullSurfaceQueryCount: number;
  readonly foamTargetUpdateRateHz: number;
  readonly foamRateLimitedFrameCount: number;
  readonly foamLastStepDeltaSeconds: number;
  readonly surfaceUploadStrategy: PoolSurfaceUploadStrategy;
  readonly surfaceUploadPolicySelection: "measured" | "caller-fallback";
  readonly estimatedSurfaceUploadBytesPerFrame: number;
  readonly querySource: "cpu-height-field";
  readonly requiresGpuReadback: false;
  readonly surfaceOpticsRequestedTier: WaterOpticsTier;
  readonly surfaceOpticsResolvedTier: ResolvedWaterOpticsTier;
  readonly surfaceReflectionSource: WaterReflectionSource;
  readonly surfaceRefractionEnabled: boolean;
  readonly sharesUnderwaterOpticalProfile: true;
}

export interface InteractivePoolP1DebugApi {
  readonly metrics: InteractivePoolP1Metrics;
  setBodyCount(count: PoolP1BodyCount): void;
  setDebugView(view: PoolLocalEffectsDebugView): void;
  setDynamicEffectsEnabled(enabled: boolean): void;
  restartWakes(): void;
}

export interface InteractivePoolMetrics {
  readonly ready: boolean;
  readonly runtimeError: string;
  readonly finite: boolean;
  readonly quality: InteractivePoolGridQuality;
  readonly ballSpawned: boolean;
  readonly ballHeight: number;
  readonly ballVerticalSpeed: number;
  readonly ballInWater: boolean;
  readonly initialBallHeightAboveSurface: number;
  readonly freeFallObserved: boolean;
  readonly upwardBounceObserved: boolean;
  readonly settled: boolean;
  readonly entryImpactCount: number;
  readonly continuousInteractionCount: number;
  readonly contactInteractionCount: number;
  readonly firstImpactTime: number;
  readonly maximumAbsSurfaceHeight: number;
  readonly centerSurfaceHeight: number;
  readonly centerSurfaceVerticalSpeed: number;
  readonly currentContactDepression: number;
  readonly maximumContactDepression: number;
  readonly currentContactRimHeight: number;
  readonly maximumContactRimHeight: number;
  readonly rippleRadius: number;
  readonly reflectedWaveObserved: boolean;
  readonly rippleHighlightPeak: number;
  readonly maximumHighlightedVertexCount: number;
  readonly surfaceVertexCount: number;
  readonly meshUploadsPerRenderFrame: number;
  readonly totalMeshUploads: number;
  readonly physicsFixedTimeStep: number;
  readonly renderFrameCount: number;
  readonly targetFrameRate: number;
}

declare global {
  interface Window {
    readonly waterPcgInteractivePoolMetrics?: InteractivePoolMetrics;
    waterPcgResetInteractivePool?: () => void;
    waterPcgSetInteractivePoolTargetFrameRate?: (framesPerSecond: number) => void;
    waterPcgUnderwater?: InteractivePoolUnderwaterDebugApi;
    waterPcgP1?: InteractivePoolP1DebugApi;
  }
}
