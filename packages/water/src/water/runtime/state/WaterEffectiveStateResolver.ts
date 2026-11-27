/** Pure single-owner resolution of authoring, environment, and runtime availability into one effective snapshot. */
import type { ResolvedWaterBodyInstance } from "../../authoring/body/ResolvedWaterBodyInstance";
import { createWaterBodyInstance } from "../../authoring/body/WaterBodyInstance";
import { createWaterRepresentationV1 } from "../../authoring/body/WaterBodyRepresentation";
import type { WaterEnvironmentSnapshot } from "../../authoring/environment/WaterEnvironmentSnapshot";
import { createWaterContentHash, createWaterRevision } from "../../authoring/identity/WaterIdentity";
import { resolveWaterReflectionSamplingSettings } from "../../authoring/optics/WaterReflectionSampling";
import type { WaterReflectionPolicyMode } from "../../authoring/optics/WaterReflectionPolicy";
import { waterReflectionPolicySourceChain } from "../../authoring/optics/WaterReflectionPolicy";
import { hashStableValue } from "../../compiler/shared/determinism";
import {
  resolveEffectiveWaterCausticsEnabled,
  computeWaterQualityPlanContentHash,
  resolveWaterReflectionPolicyForQuality
} from "../../authoring/quality/WaterQualityPlan";
import type { EffectiveWaterRuntimeSnapshot, WaterParameterProvenance } from "./EffectiveWaterRuntimeSnapshot";
import { EFFECTIVE_WATER_RUNTIME_SNAPSHOT_SCHEMA_VERSION } from "./EffectiveWaterRuntimeSnapshot";
import type { WaterRuntimeAvailabilitySnapshot } from "./WaterRuntimeAvailabilitySnapshot";
import { resolveWaterBodyCapabilityRequirements } from "../body/WaterBodyRuntimeSemantics";

export interface ResolveEffectiveWaterRuntimeSnapshotInput {
  readonly revision: number;
  readonly resolved: Readonly<ResolvedWaterBodyInstance>;
  readonly physicalSurfaceHash: string;
  readonly compiledResourceHash: string;
  readonly environment: Readonly<WaterEnvironmentSnapshot>;
  readonly runtimeAvailability: Readonly<WaterRuntimeAvailabilitySnapshot>;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function resolveReflectionSource(
  chain: readonly WaterReflectionPolicyMode[],
  availability: Readonly<WaterRuntimeAvailabilitySnapshot>
): WaterReflectionPolicyMode {
  return chain.includes(availability.resolvedReflectionSource) ? availability.resolvedReflectionSource : "analytic";
}

function provenance(
  owner: WaterParameterProvenance["owner"],
  ...sourcePaths: string[]
): Readonly<WaterParameterProvenance> {
  return Object.freeze({ owner, sourcePaths: Object.freeze(sourcePaths) });
}

export function resolveEffectiveWaterRuntimeSnapshot(
  input: Readonly<ResolveEffectiveWaterRuntimeSnapshotInput>
): Readonly<EffectiveWaterRuntimeSnapshot> {
  const physicalSurfaceHash = createWaterContentHash<"physical-surface">(
    input.physicalSurfaceHash,
    "$.physicalSurfaceHash"
  );
  const compiledResourceHash = createWaterContentHash<"compiled-water-resource">(
    input.compiledResourceHash,
    "$.compiledResourceHash"
  );
  const environment = input.environment;
  const response = input.resolved.look.environmentResponse;
  const baseProfile = input.resolved.renderContract.optics.profile;
  const roughness = clamp01(
    baseProfile.roughness + response.surfaceNormalVarianceToRoughness * environment.surfaceNormalVariance
  );
  const optics = Object.freeze({
    ...baseProfile,
    roughness
  });
  const reflectionSampling = resolveWaterReflectionSamplingSettings(input.resolved.look.reflectionSampling);
  const requestedReflectionSourceChain = waterReflectionPolicySourceChain(
    input.resolved.renderContract.reflectionIntent.policy
  );
  const effectiveReflectionPolicy = resolveWaterReflectionPolicyForQuality(
    input.resolved.renderContract.reflectionIntent.policy,
    input.resolved.qualityPlan.reflectionBudget
  );
  const effectiveReflectionSourceChain = waterReflectionPolicySourceChain(effectiveReflectionPolicy);
  const effectiveReflectionSource = resolveReflectionSource(effectiveReflectionSourceChain, input.runtimeAvailability);
  const refractionEnabled =
    input.resolved.optics.refractionEnabled &&
    input.resolved.renderContract.surfaceClosure.appearance.refraction.enabled;
  const qualityPlanContentHash = computeWaterQualityPlanContentHash(input.resolved.qualityPlan);
  const renderResourceHash = hashStableValue(input.resolved.renderContract.resources);
  const instance = createWaterBodyInstance(input.resolved.instance);
  const representation = createWaterRepresentationV1(input.resolved.asset.representation);
  const sourceCapabilities = Object.freeze({ ...input.resolved.asset.source.capabilities });
  const capabilityRequirements = resolveWaterBodyCapabilityRequirements(input.resolved);
  const lookRuntimeFeatures = Object.freeze({
    depthSource: input.resolved.optics.depthSource,
    caustics: input.resolved.optics.caustics
  });
  const effectiveCausticsEnabled = resolveEffectiveWaterCausticsEnabled(
    lookRuntimeFeatures.caustics,
    input.resolved.qualityPlan
  );
  const contentHash = createWaterContentHash<"effective-water-runtime">(
    hashStableValue({
      schemaVersion: EFFECTIVE_WATER_RUNTIME_SNAPSHOT_SCHEMA_VERSION,
      instanceId: input.resolved.instance.id,
      assetId: input.resolved.asset.id,
      assetIdentity: {
        kind: input.resolved.asset.kind,
        representation: input.resolved.asset.representation,
        sourceKind: input.resolved.asset.source.kind,
        sourceHash: input.resolved.asset.sourceHash
      },
      instanceState: {
        lookPresetId: input.resolved.instance.lookPresetId,
        qualityPlanId: input.resolved.instance.qualityPlanId,
        transform: input.resolved.instance.transform,
        visible: input.resolved.instance.visible,
        priority: input.resolved.instance.priority,
        interaction: input.resolved.instance.interaction,
        representationState: input.resolved.instance.representationState
      },
      lookContentHash: input.resolved.lookContentHash,
      renderContractHash: input.resolved.renderContract.contentHash,
      renderContractVariantKey: input.resolved.renderContract.variantKey,
      renderResourceHash,
      reflectionPolicyHash: hashStableValue(effectiveReflectionPolicy),
      renderStateHash: input.resolved.renderContract.renderState.contentHash,
      qualityPlanContentHash,
      effectiveCausticsEnabled,
      physicalSurfaceHash,
      compiledResourceHash,
      environment: {
        surfaceNormalVariance: environment.surfaceNormalVariance
      },
      runtimeAvailability: {
        sceneColor: input.runtimeAvailability.sceneColor,
        sceneDepth: input.runtimeAvailability.sceneDepth,
        environmentReflection: input.runtimeAvailability.environmentReflection,
        screenSpaceReflection: input.runtimeAvailability.screenSpaceReflection,
        resolvedReflectionSource: input.runtimeAvailability.resolvedReflectionSource
      },
      optics,
      refractionEnabled,
      reflectionSampling,
      requestedReflectionSourceChain,
      effectiveReflectionPolicy,
      effectiveReflectionSource,
      environmentResponse: response,
      sourceCapabilities,
      capabilityRequirements,
      lookRuntimeFeatures
    }),
    "$.contentHash"
  );
  const parameterProvenance = Object.freeze({
    "optics.roughness": provenance(
      "derived",
      "look.optics.roughness",
      "look.environmentResponse.surfaceNormalVarianceToRoughness",
      "environment.surfaceNormalVariance"
    ),
    "optics.reflectionIntensity": provenance("water-look", "look.optics.reflectionIntensity"),
    "refraction.enabled": provenance("derived", "look.optics.refractionEnabled", "look.appearance.refraction.enabled"),
    "caustics.enabled": provenance("derived", "look.optics.caustics", "qualityPlan.surfaceEffectBudget.caustics"),
    "reflection.environmentFallbackIntensity": provenance(
      "water-look",
      "look.reflectionSampling.environmentFallbackIntensity"
    ),
    "reflection.effectiveSource": provenance(
      "derived",
      "look.reflectionPolicy",
      "qualityPlan.reflectionBudget",
      "runtimeAvailability"
    )
  });
  return Object.freeze({
    schemaVersion: EFFECTIVE_WATER_RUNTIME_SNAPSHOT_SCHEMA_VERSION,
    revision: createWaterRevision<"effective-water-runtime">(input.revision, "$.revision"),
    contentHash,
    instanceId: input.resolved.instance.id,
    assetId: input.resolved.asset.id,
    instance,
    bodyKind: input.resolved.asset.kind,
    representation,
    sourceKind: input.resolved.asset.source.kind,
    sourceCapabilities,
    capabilityRequirements,
    lookId: input.resolved.look.id,
    qualityPlanId: input.resolved.qualityPlan.id,
    physicalSurfaceHash,
    compiledResourceHash,
    lookContentHash: input.resolved.lookContentHash,
    renderContractHash: input.resolved.renderContract.contentHash,
    renderContractVariantKey: input.resolved.renderContract.variantKey,
    renderResourceHash,
    reflectionPolicyHash: hashStableValue(effectiveReflectionPolicy),
    renderStateHash: input.resolved.renderContract.renderState.contentHash,
    renderContract: input.resolved.renderContract,
    qualityPlan: input.resolved.qualityPlan,
    appearanceFeatureFlags: input.resolved.appearance.featureFlags,
    resources: input.resolved.resources,
    lookRuntimeFeatures,
    effectiveCausticsEnabled,
    environmentRevision: environment.revision,
    runtimeAvailabilityRevision: input.runtimeAvailability.revision,
    runtimeAvailability: input.runtimeAvailability,
    reflectionBindingRevision: input.runtimeAvailability.reflectionBindingRevision,
    optics,
    refractionEnabled,
    reflectionSampling,
    requestedReflectionSourceChain,
    effectiveReflectionPolicy,
    effectiveReflectionSource,
    environmentResponse: response,
    provenance: parameterProvenance
  });
}
