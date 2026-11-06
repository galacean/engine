import {
  MAX_WATER_REFRACTION_STRENGTH,
  MAX_WATER_REFLECTION_INTENSITY
} from "../../authoring/optics/WaterOpticalLimits";
/** Pure Water Look -> Render Contract compiler. It never creates Engine objects. */
import {
  WaterBodyResourceSchemaVersion,
  type WaterCapabilityRequirement,
  type WaterOpticalProfileV1,
  type WaterResourceAssetDescriptorV1
} from "../../authoring/body/WaterBodyAuthoringTypes";
import {
  normalizeWaterReflectionPolicy,
  waterReflectionPolicySourceChain,
  type WaterReflectionPolicyMode
} from "../../authoring/optics/WaterReflectionPolicy";
import { createWaterQualityPlanV2 } from "../../authoring/quality/WaterQualityPlan";
import { createWaterLookPresetV1 } from "../../authoring/surface/WaterLookPreset";
import { createWaterRenderStatePresetV1 } from "../../authoring/surface/WaterRenderStatePreset";
import {
  WaterFieldProviderKind,
  WaterFieldRequirement,
  type WaterFieldSemantic,
  type WaterSurfaceFieldDependencyV2
} from "../../authoring/surface/WaterSurfaceFieldTypes";
import { hashStableValue } from "../shared/determinism";
import {
  COMPILED_WATER_RENDER_CONTRACT_SCHEMA_VERSION,
  WaterRenderContractDiagnosticCode,
  type CompiledWaterReflectionPolicyV1,
  type CompiledWaterRenderContractV1,
  type CompiledWaterRenderStateV1,
  type ResolvedWaterOpticalProfileV1,
  type WaterRenderCapabilityRequirements,
  type WaterRenderContractCompileInputV1,
  type WaterRenderContractCompileResult,
  type WaterRenderContractDiagnostic
} from "./CompiledWaterRenderContractTypes";
import type { CompiledWaterSurfaceAppearanceV2 } from "./CompiledWaterSurfaceAppearanceTypes";
import {
  collectWaterSurfaceTextureReferences,
  waterSurfaceTextureReferencePath,
  waterTextureResourceIssue
} from "./WaterSurfaceTextureReferences";
import { WaterSurfaceClosureCompiler, getRequiredWaterSurfaceV2Semantics } from "./WaterSurfaceClosureCompiler";
import { validateWaterSurfaceAppearanceV2Asset } from "./WaterSurfaceAppearanceV2Validator";

const WATER_RENDER_CONTRACT_COMPILER_VERSION = 1;
const SHA_256_PATTERN = /^[a-f0-9]{64}$/i;
const RESOURCE_KINDS = new Set(["texture", "mask", "flow-map"]);
const RESOURCE_OWNERSHIP = new Set(["shared", "instance"]);
const RESOURCE_FALLBACK_POLICIES = new Set(["required", "optional"]);
const REQUIREMENT_RANK: Readonly<Record<WaterCapabilityRequirement, number>> = Object.freeze({
  disabled: 0,
  optional: 1,
  required: 2
});

function maximumRequirement(
  first: WaterCapabilityRequirement,
  second: WaterCapabilityRequirement
): WaterCapabilityRequirement {
  return REQUIREMENT_RANK[second] > REQUIREMENT_RANK[first] ? second : first;
}

function isNonEmptyId(value: string): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function addDiagnostic(
  diagnostics: WaterRenderContractDiagnostic[],
  code: WaterRenderContractDiagnosticCode,
  path: string,
  message: string
): void {
  diagnostics.push(Object.freeze({ code, path, message }));
}

function snapshotOptics(profile: Readonly<WaterOpticalProfileV1>): Readonly<WaterOpticalProfileV1> {
  const assertRange = (value: number, minimum: number, maximum: number, path: string): number => {
    if (!Number.isFinite(value) || value < minimum || value > maximum) {
      throw new RangeError(`${path} must be finite and in [${minimum}, ${maximum}].`);
    }
    return value;
  };
  if (profile.absorptionCoefficient.length !== 3 || profile.scatteringColor.length !== 3) {
    throw new RangeError("Water optical coefficient and color tuples must contain exactly three values.");
  }
  const absorptionCoefficient = Object.freeze([
    assertRange(profile.absorptionCoefficient[0], 0, 1_000, "$.optics.profile.absorptionCoefficient[0]"),
    assertRange(profile.absorptionCoefficient[1], 0, 1_000, "$.optics.profile.absorptionCoefficient[1]"),
    assertRange(profile.absorptionCoefficient[2], 0, 1_000, "$.optics.profile.absorptionCoefficient[2]")
  ] as const);
  const scatteringColor = Object.freeze([
    assertRange(profile.scatteringColor[0], 0, 1, "$.optics.profile.scatteringColor[0]"),
    assertRange(profile.scatteringColor[1], 0, 1, "$.optics.profile.scatteringColor[1]"),
    assertRange(profile.scatteringColor[2], 0, 1, "$.optics.profile.scatteringColor[2]")
  ] as const);
  const sourceScattering = profile.surfaceScattering;
  let surfaceScattering: WaterOpticalProfileV1["surfaceScattering"];
  if (sourceScattering !== undefined) {
    const coefficients = sourceScattering?.coefficientPerMeter;
    if (!Array.isArray(coefficients) || coefficients.length !== 3) {
      throw new TypeError("$.optics.profile.surfaceScattering.coefficientPerMeter must contain three values.");
    }
    surfaceScattering = Object.freeze({
      coefficientPerMeter: Object.freeze([
        assertRange(coefficients[0], 0, 1_000, "$.optics.profile.surfaceScattering.coefficientPerMeter[0]"),
        assertRange(coefficients[1], 0, 1_000, "$.optics.profile.surfaceScattering.coefficientPerMeter[1]"),
        assertRange(coefficients[2], 0, 1_000, "$.optics.profile.surfaceScattering.coefficientPerMeter[2]")
      ] as const),
      phaseG: assertRange(sourceScattering.phaseG, -0.95, 0.95, "$.optics.profile.surfaceScattering.phaseG")
    });
  }
  return Object.freeze({
    ...(surfaceScattering ? { surfaceScattering } : {}),
    absorptionCoefficient,
    scatteringColor,
    scatteringCoefficient: assertRange(
      profile.scatteringCoefficient,
      0,
      1_000,
      "$.optics.profile.scatteringCoefficient"
    ),
    maximumViewDistance: assertRange(
      profile.maximumViewDistance,
      0.001,
      1_000_000,
      "$.optics.profile.maximumViewDistance"
    ),
    indexOfRefraction: assertRange(profile.indexOfRefraction, 1, 4, "$.optics.profile.indexOfRefraction"),
    fresnelF0:
      profile.fresnelF0 === undefined ? undefined : assertRange(profile.fresnelF0, 0, 1, "$.optics.profile.fresnelF0"),
    maximumSurfaceOpticalDistance: assertRange(
      profile.maximumSurfaceOpticalDistance,
      0.001,
      1_000_000,
      "$.optics.profile.maximumSurfaceOpticalDistance"
    ),
    refractionStrength: assertRange(
      profile.refractionStrength,
      0,
      MAX_WATER_REFRACTION_STRENGTH,
      "$.optics.profile.refractionStrength"
    ),
    roughness: assertRange(profile.roughness, 0, 1, "$.optics.profile.roughness"),
    reflectionIntensity: assertRange(
      profile.reflectionIntensity,
      0,
      MAX_WATER_REFLECTION_INTENSITY,
      "$.optics.profile.reflectionIntensity"
    )
  });
}

function snapshotResources(
  resources: readonly WaterResourceAssetDescriptorV1[],
  diagnostics: WaterRenderContractDiagnostic[]
): readonly WaterResourceAssetDescriptorV1[] {
  const seen = new Set<string>();
  const snapshots: WaterResourceAssetDescriptorV1[] = [];
  for (let index = 0; index < resources.length; index++) {
    const resource = resources[index];
    const path = `$.resources[${index}]`;
    if (!isNonEmptyId(resource.id)) {
      addDiagnostic(
        diagnostics,
        WaterRenderContractDiagnosticCode.InvalidResource,
        `${path}.id`,
        "Resource id must be non-empty."
      );
      continue;
    }
    if (seen.has(resource.id)) {
      addDiagnostic(
        diagnostics,
        WaterRenderContractDiagnosticCode.DuplicateResource,
        `${path}.id`,
        `Resource '${resource.id}' is duplicated.`
      );
      continue;
    }
    seen.add(resource.id);
    if (
      resource.schemaVersion !== WaterBodyResourceSchemaVersion.V1 ||
      !SHA_256_PATTERN.test(resource.contentHash) ||
      !RESOURCE_KINDS.has(resource.kind) ||
      !RESOURCE_OWNERSHIP.has(resource.ownership) ||
      !RESOURCE_FALLBACK_POLICIES.has(resource.fallbackPolicy)
    ) {
      addDiagnostic(
        diagnostics,
        WaterRenderContractDiagnosticCode.InvalidResource,
        path,
        `Resource '${resource.id}' has an invalid schema version or SHA-256 content hash.`
      );
      continue;
    }
    snapshots.push(
      Object.freeze({
        schemaVersion: resource.schemaVersion,
        id: resource.id,
        kind: resource.kind,
        contentHash: resource.contentHash.toLowerCase(),
        ownership: resource.ownership,
        fallbackPolicy: resource.fallbackPolicy
      })
    );
  }
  snapshots.sort((left, right) => left.id.localeCompare(right.id));
  return Object.freeze(snapshots);
}

function validateAppearanceResources(
  appearance: Pick<CompiledWaterSurfaceAppearanceV2, "detailLayers" | "caustics" | "textureReferences">,
  resources: readonly WaterResourceAssetDescriptorV1[],
  diagnostics: WaterRenderContractDiagnostic[]
): void {
  const resourceById = new Map(resources.map((resource) => [resource.id, resource]));
  for (const reference of appearance.textureReferences) {
    const issue = waterTextureResourceIssue(reference.textureContentHash, resourceById.get(reference.textureAssetId));
    if (!issue) continue;
    const path = waterSurfaceTextureReferencePath(appearance, reference);
    addDiagnostic(
      diagnostics,
      issue === "missing"
        ? WaterRenderContractDiagnosticCode.MissingResource
        : WaterRenderContractDiagnosticCode.ResourceHashMismatch,
      `${path}.${issue === "missing" ? "textureAssetId" : "textureContentHash"}`,
      `Appearance texture '${reference.layerId}' requires resource '${reference.textureAssetId}' with matching content hash (${issue}).`
    );
  }
}

function cameraRequirementForBinding(
  binding: WaterSurfaceFieldDependencyV2,
  provider: WaterFieldProviderKind,
  semanticRequired: boolean
): WaterCapabilityRequirement {
  if (!binding.providers.includes(provider)) return "disabled";
  const hasAlternative = binding.providers.some((candidate) => candidate !== provider);
  if (!hasAlternative && (semanticRequired || binding.requirement === WaterFieldRequirement.Required)) {
    return "required";
  }
  return "optional";
}

function reflectionReceiverRequirement(sourceChain: readonly WaterReflectionPolicyMode[]): WaterCapabilityRequirement {
  const receiverSources = sourceChain.filter((source) => source === "ssr");
  if (receiverSources.length === 0) return "disabled";
  return receiverSources.length === sourceChain.length ? "required" : "optional";
}

function compileRequirements(
  input: WaterRenderContractCompileInputV1,
  sourceChain: readonly WaterReflectionPolicyMode[]
): WaterRenderCapabilityRequirements {
  const appearanceRequired = getRequiredWaterSurfaceV2Semantics(input.appearance);
  const requiredFields = new Set<WaterFieldSemantic>(appearanceRequired);
  const optionalFields = new Set<WaterFieldSemantic>();
  let sceneColor: WaterCapabilityRequirement = "disabled";
  let sceneDepth: WaterCapabilityRequirement = "disabled";
  for (const binding of input.fieldDependencies.bindings) {
    const semanticRequired =
      appearanceRequired.has(binding.semantic) || binding.requirement === WaterFieldRequirement.Required;
    if (semanticRequired) requiredFields.add(binding.semantic);
    else optionalFields.add(binding.semantic);
    sceneColor = maximumRequirement(
      sceneColor,
      cameraRequirementForBinding(binding, WaterFieldProviderKind.CameraOpaqueColor, semanticRequired)
    );
    sceneDepth = maximumRequirement(
      sceneDepth,
      cameraRequirementForBinding(binding, WaterFieldProviderKind.CameraDepth, semanticRequired)
    );
  }
  for (const semantic of requiredFields) optionalFields.delete(semantic);
  return Object.freeze({
    requiredFields: Object.freeze([...requiredFields].sort()),
    optionalFields: Object.freeze([...optionalFields].sort()),
    camera: Object.freeze({
      sceneColor,
      sceneDepth,
      reflectionReceiver: reflectionReceiverRequirement(sourceChain)
    })
  });
}

function validateQualityCapabilities(
  input: WaterRenderContractCompileInputV1,
  requirements: WaterRenderCapabilityRequirements,
  diagnostics: WaterRenderContractDiagnostic[]
): void {
  const hasSceneColor = input.qualityPlan.sceneFields !== "local-only";
  const hasSceneDepth = input.qualityPlan.sceneFields === "scene-color-depth";
  const hasReflectionReceiver = input.qualityPlan.reflectionBudget.screenSpace;
  const checks = [
    ["sceneColor", requirements.camera.sceneColor, hasSceneColor],
    ["sceneDepth", requirements.camera.sceneDepth, hasSceneDepth],
    ["reflectionReceiver", requirements.camera.reflectionReceiver, hasReflectionReceiver]
  ] as const;
  for (const [name, requirement, available] of checks) {
    if (requirement === "required" && !available) {
      addDiagnostic(
        diagnostics,
        WaterRenderContractDiagnosticCode.QualityCapabilityMissing,
        `$.qualityPlan.${name === "reflectionReceiver" ? "reflectionBudget" : "sceneFields"}`,
        `Quality Plan '${input.qualityPlan.id}' does not provide required camera capability '${name}'.`
      );
    }
  }
}

export class WaterRenderContractCompiler {
  private constructor() {}

  static compile(input: Readonly<WaterRenderContractCompileInputV1>): WaterRenderContractCompileResult {
    const diagnostics: WaterRenderContractDiagnostic[] = [];
    if (!isNonEmptyId(input.sourceId)) {
      addDiagnostic(
        diagnostics,
        WaterRenderContractDiagnosticCode.InvalidSourceId,
        "$.sourceId",
        "Render Contract sourceId must be non-empty."
      );
    }

    let look: WaterRenderContractCompileInputV1["look"] | undefined;
    try {
      look = createWaterLookPresetV1({
        id: input.look.id,
        appearanceAssetId: input.look.appearanceAssetId,
        opticalProfileId: input.look.opticalProfileId,
        reflectionPolicyId: input.look.reflectionPolicyId,
        renderStatePresetId: input.look.renderStatePresetId,
        reflectionSampling: input.look.reflectionSampling,
        environmentResponse: input.look.environmentResponse,
        oceanResponse: input.look.oceanResponse,
        foam: input.look.foam,
        ...(input.look.contactEffects !== undefined ? { contactEffects: input.look.contactEffects } : {}),
        ...(input.look.riverDrops ? { riverDrops: input.look.riverDrops } : {})
      });
    } catch (error) {
      addDiagnostic(
        diagnostics,
        WaterRenderContractDiagnosticCode.InvalidLook,
        "$.look",
        error instanceof Error ? error.message : "Water Look is invalid."
      );
    }

    const componentIds = look
      ? ([
          ["appearanceAssetId", look.appearanceAssetId, input.appearance.id],
          ["opticalProfileId", look.opticalProfileId, input.optics.id],
          ["reflectionPolicyId", look.reflectionPolicyId, input.reflectionIntent.id],
          ["renderStatePresetId", look.renderStatePresetId, input.renderState.id]
        ] as const)
      : [];
    for (const [path, expected, actual] of componentIds) {
      if (expected !== actual) {
        addDiagnostic(
          diagnostics,
          WaterRenderContractDiagnosticCode.ComponentIdentityMismatch,
          `$.look.${path}`,
          `Water Look references '${expected}', but the resolved component id is '${actual}'.`
        );
      }
    }

    const closureResult = WaterSurfaceClosureCompiler.compile(
      input.sourceId,
      input.appearance,
      input.fieldDependencies
    );
    if (!closureResult.valid || !closureResult.data) {
      diagnostics.push(
        ...closureResult.diagnostics.map((cause) =>
          Object.freeze({
            code: WaterRenderContractDiagnosticCode.SurfaceClosureInvalid,
            path: `$.surfaceClosure${cause.path === "$" ? "" : cause.path.slice(1)}`,
            message: cause.message,
            cause
          })
        )
      );
    }

    let optics: ResolvedWaterOpticalProfileV1 | undefined;
    try {
      if (!isNonEmptyId(input.optics.id)) throw new TypeError("Water optical profile id must be non-empty.");
      const profile = snapshotOptics(input.optics.profile);
      optics = Object.freeze({ sourceId: input.optics.id, contentHash: hashStableValue(profile), profile });
    } catch (error) {
      addDiagnostic(
        diagnostics,
        WaterRenderContractDiagnosticCode.InvalidOptics,
        "$.optics",
        error instanceof Error ? error.message : "Water optics are invalid."
      );
    }

    let reflectionIntent: CompiledWaterReflectionPolicyV1 | undefined;
    try {
      if (!isNonEmptyId(input.reflectionIntent.id))
        throw new TypeError("Water reflection policy id must be non-empty.");
      const policy = normalizeWaterReflectionPolicy(input.reflectionIntent.policy);
      reflectionIntent = Object.freeze({
        sourceId: input.reflectionIntent.id,
        contentHash: hashStableValue(policy),
        sourceChain: waterReflectionPolicySourceChain(policy),
        policy
      });
    } catch (error) {
      addDiagnostic(
        diagnostics,
        WaterRenderContractDiagnosticCode.InvalidReflectionIntent,
        "$.reflectionIntent",
        error instanceof Error ? error.message : "Water reflection intent is invalid."
      );
    }

    let renderState: CompiledWaterRenderStateV1 | undefined;
    try {
      const preset = createWaterRenderStatePresetV1(input.renderState);
      renderState = Object.freeze({
        sourceId: preset.id,
        contentHash: hashStableValue(preset),
        depthWriteEnabled: preset.depthWriteEnabled,
        queue: preset.queue,
        priorityOffset: preset.priorityOffset,
        cullMode: preset.cullMode,
        blendMode: preset.blendMode
      });
    } catch (error) {
      addDiagnostic(
        diagnostics,
        WaterRenderContractDiagnosticCode.InvalidRenderState,
        "$.renderState",
        error instanceof Error ? error.message : "Water render state is invalid."
      );
    }

    try {
      createWaterQualityPlanV2(input.qualityPlan);
    } catch (error) {
      addDiagnostic(
        diagnostics,
        WaterRenderContractDiagnosticCode.InvalidQualityPlan,
        "$.qualityPlan",
        error instanceof Error ? error.message : "Water Quality Plan is invalid."
      );
    }

    const resources = snapshotResources(input.resources, diagnostics);
    if (closureResult.data) {
      validateAppearanceResources(closureResult.data.appearance, resources, diagnostics);
    } else {
      // Field failures must not hide independent resource issues; avoid recompiling the appearance.
      const appearanceValidation = validateWaterSurfaceAppearanceV2Asset(input.appearance);
      if (appearanceValidation.valid && appearanceValidation.value) {
        const appearance = appearanceValidation.value;
        validateAppearanceResources(
          {
            detailLayers: appearance.detailLayers,
            caustics: appearance.caustics,
            textureReferences: collectWaterSurfaceTextureReferences(appearance)
          },
          resources,
          diagnostics
        );
      }
    }
    if (look?.riverDrops) {
      for (const [slot, reference] of Object.entries(look.riverDrops.textures)) {
        const resource = resources.find((candidate) => candidate.id === reference.assetId);
        if (!resource || resource.contentHash.toLowerCase() !== reference.contentHash.toLowerCase())
          addDiagnostic(
            diagnostics,
            resource
              ? WaterRenderContractDiagnosticCode.ResourceHashMismatch
              : WaterRenderContractDiagnosticCode.MissingResource,
            `$.look.riverDrops.textures.${slot}`,
            `River drop texture '${reference.assetId}' is missing or has a different hash.`
          );
      }
    }

    let requirements: WaterRenderCapabilityRequirements | undefined;
    if (reflectionIntent) {
      requirements = compileRequirements(input, reflectionIntent.sourceChain);
      validateQualityCapabilities(input, requirements, diagnostics);
    }

    if (
      diagnostics.length > 0 ||
      !look ||
      !closureResult.data ||
      !optics ||
      !reflectionIntent ||
      !renderState ||
      !requirements
    ) {
      return Object.freeze({ valid: false, diagnostics: Object.freeze(diagnostics) });
    }

    const contentHash = hashStableValue({
      compilerVersion: WATER_RENDER_CONTRACT_COMPILER_VERSION,
      sourceId: input.sourceId,
      look,
      surfaceClosureHash: closureResult.data.contentHash,
      optics,
      reflectionIntent,
      renderState,
      resources
    });
    const variantKey = `water-render-contract-v1:${hashStableValue({
      compilerVersion: WATER_RENDER_CONTRACT_COMPILER_VERSION,
      surfaceClosureVariantKey: closureResult.data.variantKey,
      ...(look.riverDrops ? { riverDrops: "textured-curtain-foam-spray-v1" } : {}),
      ...(optics.profile.surfaceScattering ? { surfaceScattering: true } : {}),
      reflectionSourceChain: reflectionIntent.sourceChain,
      renderState: {
        depthWriteEnabled: renderState.depthWriteEnabled,
        queue: renderState.queue,
        cullMode: renderState.cullMode,
        blendMode: renderState.blendMode
      }
    })}` as const;
    const data: CompiledWaterRenderContractV1 = Object.freeze({
      schemaVersion: COMPILED_WATER_RENDER_CONTRACT_SCHEMA_VERSION,
      sourceId: input.sourceId,
      contentHash,
      variantKey,
      look,
      surfaceClosure: closureResult.data,
      optics,
      reflectionIntent,
      renderState,
      resources,
      requirements
    });
    return Object.freeze({ valid: true, data, diagnostics: Object.freeze(diagnostics) });
  }
}
