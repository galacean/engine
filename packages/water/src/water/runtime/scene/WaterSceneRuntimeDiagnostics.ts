import type { WaterBodyAssetRegistryMetrics } from "../body/WaterBodyAssetRegistry";
import type { WaterBodyLoaderMetrics, WaterBodyActivationInspection } from "../body/WaterBodyLoader";
import type { WaterBodyProviderRegistryMetrics } from "../body/WaterBodyProviderRegistry";
import type { WaterWorldMetrics } from "../body/WaterWorld";
import type { CameraWaterFeatureMetrics } from "../optics/CameraWaterFeatureBroker";
import type { WaterReflectionServiceMetrics } from "../optics/WaterReflectionService";
import type { WaterRuntimeResourceRegistryMetrics } from "../resources/WaterRuntimeResourceRegistry";
import type { WaterBodyKind } from "../../authoring/body/WaterBodyRepresentation";

export type WaterSceneRuntimeLifecycleState = "active" | "destroying" | "destroyed";

export interface WaterSceneBodyInspection {
  readonly bodyId: string;
  /** User-facing semantic identity. */
  readonly kind: WaterBodyKind;
  /** Selected implementation route; never interpreted as semantic Water kind. */
  readonly resolvedBackendId: string;
  readonly assetId: string;
  readonly profileId?: string;
  readonly profileVersion?: number;
  readonly descriptorSchemaVersion?: number;
  readonly compilerSemanticVersion?: string;
  readonly canonicalDescriptorHash?: string;
  readonly logicalBounds?: Readonly<{ minX: number; minZ: number; maxX: number; maxZ: number }>;
  readonly bodyOrigin: readonly [x: number, z: number];
  readonly renderOffset: readonly [x: number, z: number];
  readonly activation: Readonly<WaterBodyActivationInspection>;
}

export interface WaterSceneRuntimeDiagnostics {
  readonly lifecycle: WaterSceneRuntimeLifecycleState;
  readonly activeSceneRevision: number;
  readonly stagingSceneRevision?: number;
  readonly activeBodyCount: number;
  readonly bodies: readonly WaterSceneBodyInspection[];
  readonly assets: Readonly<WaterBodyAssetRegistryMetrics>;
  readonly providers: Readonly<WaterBodyProviderRegistryMetrics>;
  readonly loader: Readonly<WaterBodyLoaderMetrics>;
  readonly world: Readonly<WaterWorldMetrics>;
  readonly cameraFeatures: Readonly<CameraWaterFeatureMetrics>;
  readonly runtimeResources: Readonly<WaterRuntimeResourceRegistryMetrics>;
  readonly reflection: Readonly<WaterReflectionServiceMetrics> | null;
  readonly reflectionServiceCreated: boolean;
  readonly environmentProviderCount: number;
  readonly abortedTransactionCount: number;
  readonly staleTransactionCount: number;
  readonly rolledBackTransactionCount: number;
  readonly lastCurrentRevisionError: string | null;
  readonly platformValidation: "not-assessed-by-runtime";
}
