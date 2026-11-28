/** Immutable, Engine-object-free state consumed by every Water backend runtime. */
import type { WaterOpticalProfileV1 } from "../../authoring/body/WaterBodyAuthoringTypes";
import type { WaterLookEnvironmentResponseV2 } from "../../authoring/surface/WaterLookEnvironmentResponse";
import type { WaterReflectionSamplingSettings } from "../../authoring/optics/WaterReflectionSampling";
import type { WaterEnvironmentSnapshot } from "../../authoring/environment/WaterEnvironmentSnapshot";
import type { WaterContentHash, WaterRevision } from "../../authoring/identity/WaterIdentity";
import type { WaterReflectionPolicyMode, WaterReflectionPolicy } from "../../authoring/optics/WaterReflectionPolicy";
import type { WaterRuntimeAvailabilitySnapshot } from "./WaterRuntimeAvailabilitySnapshot";
import type { CompiledWaterRenderContractV1 } from "../../compiler/surface/CompiledWaterRenderContractTypes";
import type { WaterQualityPlanV2 } from "../../authoring/quality/WaterQualityPlan";
import type {
  WaterBodyCapabilityRequirementsV1,
  WaterBodySourceCapabilitiesV1,
  WaterBodySourceKind,
  WaterOpticsPresetV1,
  WaterResourceAssetDescriptorV1,
  WaterSurfaceAppearanceFeatureFlagsV1
} from "../../authoring/body/WaterBodyAuthoringTypes";
import type { WaterBodyInstance } from "../../authoring/body/WaterBodyInstance";
import type { WaterBodyKind, WaterRepresentationV1 } from "../../authoring/body/WaterBodyRepresentation";

export const EFFECTIVE_WATER_RUNTIME_SNAPSHOT_SCHEMA_VERSION = 1 as const;

export type WaterParameterOwner =
  | "water-look"
  | "physical-surface"
  | "water-quality-plan"
  | "environment"
  | "runtime-availability"
  | "derived";

export interface WaterParameterProvenance {
  readonly owner: WaterParameterOwner;
  readonly sourcePaths: readonly string[];
}

export type EffectiveWaterLookRuntimeFeatures = Readonly<Pick<WaterOpticsPresetV1, "depthSource" | "caustics">>;

export interface EffectiveWaterRuntimeSnapshot {
  readonly schemaVersion: typeof EFFECTIVE_WATER_RUNTIME_SNAPSHOT_SCHEMA_VERSION;
  readonly revision: WaterRevision<"effective-water-runtime">;
  readonly contentHash: WaterContentHash<"effective-water-runtime">;
  readonly instanceId: string;
  readonly assetId: string;
  /** Small semantic projection; physical source payloads never cross the runtime boundary. */
  readonly instance: Readonly<WaterBodyInstance>;
  readonly bodyKind: WaterBodyKind;
  readonly representation: Readonly<WaterRepresentationV1>;
  readonly sourceKind: WaterBodySourceKind;
  readonly sourceCapabilities: Readonly<WaterBodySourceCapabilitiesV1>;
  readonly capabilityRequirements: Readonly<WaterBodyCapabilityRequirementsV1>;
  readonly lookId: string;
  readonly qualityPlanId: string;
  readonly physicalSurfaceHash: WaterContentHash<"physical-surface">;
  readonly compiledResourceHash: WaterContentHash<"compiled-water-resource">;
  readonly lookContentHash: string;
  readonly renderContractHash: string;
  readonly renderContractVariantKey: string;
  readonly renderResourceHash: string;
  readonly reflectionPolicyHash: string;
  readonly renderStateHash: string;
  /** Complete immutable visual contract; backends must not re-read Resolved authoring. */
  readonly renderContract: Readonly<CompiledWaterRenderContractV1>;
  readonly qualityPlan: Readonly<WaterQualityPlanV2>;
  readonly appearanceFeatureFlags: Readonly<WaterSurfaceAppearanceFeatureFlagsV1>;
  readonly resources: readonly Readonly<WaterResourceAssetDescriptorV1>[];
  readonly lookRuntimeFeatures: EffectiveWaterLookRuntimeFeatures;
  /** Final Look intent constrained by the explicit Quality effect budget. */
  readonly effectiveCausticsEnabled: boolean;
  readonly environmentRevision: WaterEnvironmentSnapshot["revision"];
  readonly runtimeAvailabilityRevision: WaterRuntimeAvailabilitySnapshot["revision"];
  readonly runtimeAvailability: Readonly<WaterRuntimeAvailabilitySnapshot>;
  readonly reflectionBindingRevision: WaterRuntimeAvailabilitySnapshot["reflectionBindingRevision"];
  readonly optics: Readonly<WaterOpticalProfileV1>;
  readonly refractionEnabled: boolean;
  readonly reflectionSampling: Readonly<WaterReflectionSamplingSettings>;
  readonly requestedReflectionSourceChain: readonly WaterReflectionPolicyMode[];
  readonly effectiveReflectionPolicy: Readonly<WaterReflectionPolicy>;
  readonly effectiveReflectionSource: WaterReflectionPolicyMode;
  readonly environmentResponse: Readonly<WaterLookEnvironmentResponseV2>;
  readonly provenance: Readonly<Record<string, WaterParameterProvenance>>;
}
