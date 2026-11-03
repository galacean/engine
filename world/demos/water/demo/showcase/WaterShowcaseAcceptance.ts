export type WaterShowcaseRuntime = "river" | "grasslands";

export interface WaterShowcaseResourceMetrics {
  readonly bufferMemory: number;
  readonly textureMemory: number;
  readonly totalMemory: number;
  readonly liveRenderTargets: number;
  readonly liveReflectionCameras: number;
  readonly meshUploadCount: number;
  readonly perFrameMeshUpload: boolean;
}

export interface WaterShowcaseReflectionMetrics {
  readonly requestedSource: "sky" | "probe" | "ssr";
  readonly effectiveSource: "sky" | "probe" | "ssr";
  readonly ownerCount: number;
  readonly cameraCount: number;
  readonly renderTargetCount: number;
  readonly fallbackReason?: string | null;
}

export type WaterShowcaseSceneMetric = string | number | boolean | null;

export interface WaterShowcaseActivationSnapshot {
  readonly path: "load-instance";
  readonly backendId: string;
  readonly sourceKind: string;
  readonly assetId: string;
  readonly instanceId: string;
  readonly bodyId: string;
  readonly sourceHash: string;
  readonly compiledHash: string;
  readonly handleActive: boolean;
  readonly visible: boolean;
  readonly handleRevision?: number;
  readonly routeRevision?: number;
  readonly controllerFacadeRevision?: number;
  readonly loader: Readonly<{
    activeBodyCount: number;
    cachedResourceCount: number;
    compileCount: number;
    cacheHitCount: number;
    cacheMissCount: number;
    failedActivationCount: number;
  }>;
  readonly backendActiveRuntimeCount: number;
  readonly worldRegisteredBodyCount: number;
  readonly cameraConsumerIds: readonly string[];
  readonly resourceReferenceCount: number;
  readonly nearshoreReferenceCount: number;
  readonly queryConsumer?: Readonly<{
    readonly active: boolean;
    readonly routeAvailable: boolean;
    readonly routeRevision: number;
    readonly sourceHash?: string;
    readonly compiledHash?: string;
  }>;
  readonly wakeConsumer?: Readonly<{
    readonly active: boolean;
    readonly routeAvailable: boolean;
    readonly routeRevision: number;
    readonly sourceHash?: string;
    readonly compiledHash?: string;
  }>;
  readonly spatialFieldIdentity?: Readonly<{
    readonly sourceSchemaVersion: number;
    readonly sourceHash: string;
    readonly compiledHash: string;
    readonly gpuBindingPublished: boolean;
  }>;
}

/** Stable browser-facing contract consumed by focused functional smoke tests. */
export interface WaterShowcaseAcceptanceSnapshot {
  readonly ready: boolean;
  readonly caseId: string;
  readonly runtime: WaterShowcaseRuntime;
  readonly preset: string;
  readonly runtimeError: string | null;
  readonly finite: boolean;
  readonly qualityTier: "high";
  readonly opticsTier: "high";
  readonly resources: Readonly<WaterShowcaseResourceMetrics>;
  readonly reflection: Readonly<WaterShowcaseReflectionMetrics>;
  readonly refractionEnabled: boolean;
  readonly activation?: Readonly<WaterShowcaseActivationSnapshot>;
  readonly scene: Readonly<Record<string, WaterShowcaseSceneMetric>>;
}

export interface WaterShowcaseCaptureApi {
  readonly states: readonly string[];
  readonly currentState: string;
  setCaptureState(state: string): void;
  reset(): void;
}

declare global {
  interface Window {
    waterPcgAcceptance?: Readonly<WaterShowcaseAcceptanceSnapshot>;
    waterPcgShowcase?: WaterShowcaseCaptureApi;
  }
}

export function areFiniteShowcaseMetrics(values: readonly number[]): boolean {
  return values.every(Number.isFinite);
}
