/** Engine-object-free output of the Water Look -> Render Contract compiler. */
import type {
  WaterCapabilityRequirement,
  WaterOpticalProfileV1,
  WaterResourceAssetDescriptorV1
} from "../../authoring/body/WaterBodyAuthoringTypes";
import type { WaterReflectionPolicy, WaterReflectionPolicyMode } from "../../authoring/optics/WaterReflectionPolicy";
import type { WaterQualityPlanV2 } from "../../authoring/quality/WaterQualityPlan";
import type { WaterLookPresetV1 } from "../../authoring/surface/WaterLookPreset";
import type { WaterRenderStatePresetV1 } from "../../authoring/surface/WaterRenderStatePreset";
import type { WaterSurfaceAppearanceAssetV2 } from "../../authoring/surface/WaterSurfaceAppearanceTypes";
import type {
  WaterFieldSemantic,
  WaterSurfaceFieldDependencyAssetV2
} from "../../authoring/surface/WaterSurfaceFieldTypes";
import type { CompiledWaterSurfaceClosureV2, WaterSurfaceClosureDiagnostic } from "./CompiledWaterSurfaceClosureTypes";

export const COMPILED_WATER_RENDER_CONTRACT_SCHEMA_VERSION = 1 as const;

export interface WaterRenderOpticsSourceV1 {
  readonly id: string;
  readonly profile: WaterOpticalProfileV1;
}

export interface WaterRenderReflectionIntentSourceV1 {
  readonly id: string;
  readonly policy: WaterReflectionPolicy;
}

export interface WaterRenderContractCompileInputV1 {
  readonly sourceId: string;
  readonly look: WaterLookPresetV1;
  readonly appearance: WaterSurfaceAppearanceAssetV2;
  readonly fieldDependencies: WaterSurfaceFieldDependencyAssetV2;
  readonly optics: WaterRenderOpticsSourceV1;
  readonly reflectionIntent: WaterRenderReflectionIntentSourceV1;
  readonly renderState: WaterRenderStatePresetV1;
  readonly resources: readonly WaterResourceAssetDescriptorV1[];
  /** Capability budget only. It never participates in Render Contract identity. */
  readonly qualityPlan: WaterQualityPlanV2;
}

export interface ResolvedWaterOpticalProfileV1 {
  readonly sourceId: string;
  readonly contentHash: string;
  readonly profile: WaterOpticalProfileV1;
}

export interface CompiledWaterReflectionPolicyV1 {
  readonly sourceId: string;
  readonly contentHash: string;
  readonly sourceChain: readonly WaterReflectionPolicyMode[];
  readonly policy: WaterReflectionPolicy;
}

export interface CompiledWaterRenderStateV1 {
  readonly sourceId: string;
  readonly contentHash: string;
  readonly depthWriteEnabled: boolean;
  readonly queue: WaterRenderStatePresetV1["queue"];
  readonly priorityOffset: number;
  readonly cullMode: WaterRenderStatePresetV1["cullMode"];
  readonly blendMode: WaterRenderStatePresetV1["blendMode"];
}

export interface WaterRenderCapabilityRequirements {
  readonly requiredFields: readonly WaterFieldSemantic[];
  readonly optionalFields: readonly WaterFieldSemantic[];
  readonly camera: {
    readonly sceneColor: WaterCapabilityRequirement;
    readonly sceneDepth: WaterCapabilityRequirement;
    readonly reflectionReceiver: WaterCapabilityRequirement;
  };
}

export interface CompiledWaterRenderContractV1 {
  readonly schemaVersion: typeof COMPILED_WATER_RENDER_CONTRACT_SCHEMA_VERSION;
  readonly sourceId: string;
  /** Complete Look identity, including numeric values, resources, field order, reflection, and render state. */
  readonly contentHash: string;
  /** Shader/render-state structure only; uniform values and Quality Plan choices are excluded. */
  readonly variantKey: `water-render-contract-v1:${string}`;
  readonly look: WaterLookPresetV1;
  readonly surfaceClosure: CompiledWaterSurfaceClosureV2;
  readonly optics: ResolvedWaterOpticalProfileV1;
  readonly reflectionIntent: CompiledWaterReflectionPolicyV1;
  readonly renderState: CompiledWaterRenderStateV1;
  readonly resources: readonly WaterResourceAssetDescriptorV1[];
  readonly requirements: WaterRenderCapabilityRequirements;
}

export enum WaterRenderContractDiagnosticCode {
  InvalidSourceId = "WATER_RENDER_CONTRACT_INVALID_SOURCE_ID",
  InvalidLook = "WATER_RENDER_CONTRACT_INVALID_LOOK",
  ComponentIdentityMismatch = "WATER_RENDER_CONTRACT_COMPONENT_IDENTITY_MISMATCH",
  SurfaceClosureInvalid = "WATER_RENDER_CONTRACT_SURFACE_CLOSURE_INVALID",
  InvalidOptics = "WATER_RENDER_CONTRACT_INVALID_OPTICS",
  InvalidReflectionIntent = "WATER_RENDER_CONTRACT_INVALID_REFLECTION_INTENT",
  InvalidRenderState = "WATER_RENDER_CONTRACT_INVALID_RENDER_STATE",
  InvalidQualityPlan = "WATER_RENDER_CONTRACT_INVALID_QUALITY_PLAN",
  InvalidResource = "WATER_RENDER_CONTRACT_INVALID_RESOURCE",
  DuplicateResource = "WATER_RENDER_CONTRACT_DUPLICATE_RESOURCE",
  MissingResource = "WATER_RENDER_CONTRACT_MISSING_RESOURCE",
  ResourceHashMismatch = "WATER_RENDER_CONTRACT_RESOURCE_HASH_MISMATCH",
  QualityCapabilityMissing = "WATER_RENDER_CONTRACT_QUALITY_CAPABILITY_MISSING"
}

export interface WaterRenderContractDiagnostic {
  readonly code: WaterRenderContractDiagnosticCode;
  readonly path: string;
  readonly message: string;
  readonly cause?: WaterSurfaceClosureDiagnostic;
}

export interface WaterRenderContractCompileResult {
  readonly valid: boolean;
  readonly data?: CompiledWaterRenderContractV1;
  readonly diagnostics: readonly WaterRenderContractDiagnostic[];
}
