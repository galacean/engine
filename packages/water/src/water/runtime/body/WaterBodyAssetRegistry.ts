import {
  MAX_WATER_REFLECTION_INTENSITY,
  MAX_WATER_REFRACTION_STRENGTH
} from "../../authoring/optics/WaterOpticalLimits";
import { RIVER_DEFAULT_DROP_LOOK } from "../../authoring/river/FarmlandsDropLook";
import { FARMLANDS_DROP_ASSETS } from "../../resources/river/FarmlandsDropAssets";
/** Versioned WaterBody asset/preset/resource lookup with fail-closed resolution. */
import type { ResolvedWaterBodyInstance } from "../../authoring/body/ResolvedWaterBodyInstance";
import { createWaterBodyAsset, type WaterBodyAsset } from "../../authoring/body/WaterBodyAsset";
import {
  WaterBodySourceKind,
  type WaterAppearancePresetV1,
  type WaterBodyRuntimeVariant,
  type WaterBodySourceV1,
  type WaterOpticalProfileV1,
  type WaterOpticsPresetV1,
  type WaterResourceAssetDescriptorV1
} from "../../authoring/body/WaterBodyAuthoringTypes";
import type { WaterBodyInstance } from "../../authoring/body/WaterBodyInstance";
import { decodeWaterBodySource } from "../../authoring/body/WaterBodySchemaDecoder";
import { createImmutableWaterSnapshot } from "../../authoring/identity/WaterImmutableSnapshot";
import {
  createWaterReflectionPolicyPresetV1,
  type WaterReflectionPolicyPresetV1
} from "../../authoring/optics/WaterReflectionPolicyPreset";
import {
  computeWaterQualityPlanContentHash,
  createWaterQualityPlanV2,
  type WaterQualityPlanV2
} from "../../authoring/quality/WaterQualityPlan";
import {
  createWaterLookAuthoringSnapshot,
  type WaterLookAuthoringDraft,
  type WaterLookAuthoringSnapshot
} from "../../authoring/surface/WaterLookAuthoringSnapshot";
import { createWaterLookPresetV1, type WaterLookPresetV1 } from "../../authoring/surface/WaterLookPreset";
import {
  createWaterRenderStatePresetV1,
  type WaterRenderStatePresetV1
} from "../../authoring/surface/WaterRenderStatePreset";
import type { WaterSurfaceAppearanceAsset } from "../../authoring/surface/WaterSurfaceAppearanceTypes";
import { hashStableValue } from "../../compiler/shared/determinism";
import type { CompiledWaterRenderContractV1 } from "../../compiler/surface/CompiledWaterRenderContractTypes";
import { WaterRenderContractCompiler } from "../../compiler/surface/WaterRenderContractCompiler";
import { WaterSurfaceAppearanceCompiler } from "../../compiler/surface/WaterSurfaceAppearanceCompiler";
import { WaterSurfaceClosureCompiler } from "../../compiler/surface/WaterSurfaceClosureCompiler";
import { WaterSurfaceFieldCompiler } from "../../compiler/surface/WaterSurfaceFieldCompiler";
import {
  collectWaterSurfaceTextureReferences,
  waterSurfaceTextureReferencePath,
  waterTextureResourceIssue
} from "../../compiler/surface/WaterSurfaceTextureReferences";

const DEFAULT_DROP_RESOURCES = new Map(
  Object.values(FARMLANDS_DROP_ASSETS).map(({ descriptor }) => [descriptor.id, descriptor])
);

const SHA_256_PATTERN = /^[a-f0-9]{64}$/i;
export const WATER_RENDER_CONTRACT_CACHE_LIMIT = 128;
const WATER_BASE_RENDER_CONTRACT_CACHE_LIMIT = 64;

export enum WaterBodyRegistryErrorCode {
  DuplicateRegistration = "WATER_BODY_DUPLICATE_REGISTRATION",
  MissingAsset = "WATER_BODY_MISSING_ASSET",
  MissingAppearancePreset = "WATER_BODY_MISSING_APPEARANCE_PRESET",
  MissingOpticsPreset = "WATER_BODY_MISSING_OPTICS_PRESET",
  MissingLookPreset = "WATER_BODY_MISSING_LOOK_PRESET",
  MissingReflectionPolicy = "WATER_BODY_MISSING_REFLECTION_POLICY",
  MissingRenderStatePreset = "WATER_BODY_MISSING_RENDER_STATE_PRESET",
  MissingQualityPlan = "WATER_BODY_MISSING_QUALITY_PLAN",
  MissingResource = "WATER_BODY_MISSING_RESOURCE",
  InvalidSource = "WATER_BODY_INVALID_SOURCE",
  SourceTypeMismatch = "WATER_BODY_SOURCE_TYPE_MISMATCH",
  InvalidRepresentationState = "WATER_BODY_INVALID_REPRESENTATION_STATE",
  InvalidPreset = "WATER_BODY_INVALID_PRESET",
  InvalidResourceHash = "WATER_BODY_INVALID_RESOURCE_HASH",
  ResourceHashMismatch = "WATER_BODY_RESOURCE_HASH_MISMATCH",
  LookRevisionConflict = "WATER_LOOK_REVISION_CONFLICT",
  CapabilityRequirementUnsatisfied = "WATER_BODY_CAPABILITY_REQUIREMENT_UNSATISFIED"
}

export class WaterBodyRegistryError extends Error {
  constructor(
    readonly code: WaterBodyRegistryErrorCode,
    readonly path: string,
    message: string
  ) {
    super(message);
    this.name = "WaterBodyRegistryError";
  }
}

function assertFiniteRange(value: number, minimum: number, maximum: number, path: string): void {
  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    throw new WaterBodyRegistryError(
      WaterBodyRegistryErrorCode.InvalidPreset,
      path,
      `${path} is outside the supported range.`
    );
  }
}

function validateOpticalProfile(profile: WaterOpticalProfileV1, path: string): void {
  for (let index = 0; index < 3; index++) {
    assertFiniteRange(profile.absorptionCoefficient[index], 0, 1_000, `${path}.absorptionCoefficient[${index}]`);
    assertFiniteRange(profile.scatteringColor[index], 0, 1, `${path}.scatteringColor[${index}]`);
  }
  assertFiniteRange(profile.scatteringCoefficient, 0, 1_000, `${path}.scatteringCoefficient`);
  assertFiniteRange(profile.maximumViewDistance, 0.001, 1_000_000, `${path}.maximumViewDistance`);
  assertFiniteRange(profile.indexOfRefraction, 1, 4, `${path}.indexOfRefraction`);
  if (profile.fresnelF0 !== undefined) {
    assertFiniteRange(profile.fresnelF0, 0, 1, `${path}.fresnelF0`);
  }
  assertFiniteRange(profile.maximumSurfaceOpticalDistance, 0.001, 1_000_000, `${path}.maximumSurfaceOpticalDistance`);
  assertFiniteRange(profile.refractionStrength, 0, MAX_WATER_REFRACTION_STRENGTH, `${path}.refractionStrength`);
  assertFiniteRange(profile.roughness, 0, 1, `${path}.roughness`);
  assertFiniteRange(profile.reflectionIntensity, 0, MAX_WATER_REFLECTION_INTENSITY, `${path}.reflectionIntensity`);
}

function validateAppearancePreset(preset: WaterAppearancePresetV1): void {
  const compile = WaterSurfaceAppearanceCompiler.compile(preset.appearance);
  if (!compile.valid) {
    const first = compile.diagnostics[0];
    throw new WaterBodyRegistryError(
      WaterBodyRegistryErrorCode.InvalidPreset,
      first?.path ?? "$.appearance",
      first?.message ?? `Appearance preset '${preset.id}' is invalid.`
    );
  }
  if (!preset.fieldDependencies) {
    throw new WaterBodyRegistryError(
      WaterBodyRegistryErrorCode.InvalidPreset,
      "$.fieldDependencies",
      `Surface Appearance preset '${preset.id}' requires an explicit field dependency graph.`
    );
  }
  const fieldCompile = WaterSurfaceFieldCompiler.compile(preset.fieldDependencies);
  if (!fieldCompile.valid) {
    const first = fieldCompile.diagnostics[0];
    throw new WaterBodyRegistryError(
      WaterBodyRegistryErrorCode.InvalidPreset,
      first?.path ?? "$.fieldDependencies",
      first?.message ?? `Appearance preset '${preset.id}' has invalid field dependencies.`
    );
  }
  const closureCompile = WaterSurfaceClosureCompiler.compile(preset.id, preset.appearance, preset.fieldDependencies);
  if (!closureCompile.valid) {
    const first = closureCompile.diagnostics[0];
    throw new WaterBodyRegistryError(
      WaterBodyRegistryErrorCode.InvalidPreset,
      first?.path ?? "$.fieldDependencies",
      first?.message ?? `Surface Appearance preset '${preset.id}' has an invalid closure.`
    );
  }
}

function validateOpticsPreset(preset: WaterOpticsPresetV1): void {
  validateOpticalProfile(preset.profile, "$.profile");
}

function requireFromMap<T>(
  map: ReadonlyMap<string, T>,
  id: string,
  code: WaterBodyRegistryErrorCode,
  path: string,
  kind: string
): T {
  const value = map.get(id);
  if (!value) throw new WaterBodyRegistryError(code, path, `${kind} '${id}' is not registered.`);
  return value;
}

function assertSourceRepresentation(
  asset: Pick<WaterBodyAsset<WaterBodySourceV1>, "kind" | "representation" | "source">
): void {
  const { kind, representation, source } = asset;
  const valid = (() => {
    switch (source.kind) {
      case WaterBodySourceKind.GridMask:
        return (
          (kind === "lake" || kind === "pool") &&
          representation.domain === "bounded-grid" &&
          (representation.macroSurface === "flat" || representation.macroSurface === "heightfield")
        );
      case WaterBodySourceKind.TerrainRegion:
        return (
          kind === "lake" && representation.domain === "bounded-grid" && representation.macroSurface === "heightfield"
        );
      case WaterBodySourceKind.Polygon:
        return (
          (kind === "lake" || kind === "pool") &&
          representation.domain === "bounded-polygon" &&
          (representation.macroSurface === "flat" || representation.macroSurface === "heightfield")
        );
      case WaterBodySourceKind.SplineProfile:
        return (
          kind === "river" &&
          representation.domain === "spline-network" &&
          representation.macroSurface === "flow-deformed"
        );
      case WaterBodySourceKind.OceanNearshore:
        return (
          kind === "ocean" &&
          representation.domain === "world-space-ocean" &&
          representation.macroSurface === "gerstner"
        );
    }
  })();
  if (!valid) {
    throw new WaterBodyRegistryError(
      WaterBodyRegistryErrorCode.SourceTypeMismatch,
      "$.representation",
      `WaterBody source '${source.kind}' is incompatible with kind '${kind}' and representation '${representation.domain}/${representation.macroSurface}'.`
    );
  }
}

export class WaterBodyAssetRegistry {
  private readonly _assets = new Map<string, WaterBodyAsset<WaterBodySourceV1>>();
  private readonly _appearances = new Map<string, WaterAppearancePresetV1>();
  private readonly _appearancesByAssetId = new Map<string, WaterAppearancePresetV1>();
  private readonly _optics = new Map<string, WaterOpticsPresetV1>();
  private readonly _looks = new Map<string, WaterLookPresetV1>();
  private readonly _lookRevisions = new Map<string, number>();
  private readonly _lookPublicationGenerations = new Map<string, number>();
  private readonly _preparedLookPublicationGenerations = new WeakMap<object, number>();
  private readonly _reflectionPolicies = new Map<string, WaterReflectionPolicyPresetV1>();
  private readonly _renderStates = new Map<string, WaterRenderStatePresetV1>();
  private readonly _qualityPlans = new Map<string, WaterQualityPlanV2>();
  private readonly _compiledRenderContracts = new Map<string, CompiledWaterRenderContractV1>();
  private readonly _baseRenderContracts = new Map<string, CompiledWaterRenderContractV1>();
  private _renderContractCompileCount = 0;
  private _renderContractEvictionCount = 0;
  private readonly _runtimeVariants = new Map<string, Map<string, WaterBodyRuntimeVariant>>();
  private readonly _resources = new Map<string, WaterResourceAssetDescriptorV1>();

  registerAsset(asset: WaterBodyAsset): void {
    this._assertUnique(this._assets, asset.id, "asset");
    this._assets.set(asset.id, this._normalizeAsset(asset));
  }

  replaceAsset(asset: WaterBodyAsset): WaterBodyAsset<WaterBodySourceV1> {
    const previous = requireFromMap(
      this._assets,
      asset.id,
      WaterBodyRegistryErrorCode.MissingAsset,
      "$.id",
      "WaterBody asset"
    );
    this._assets.set(asset.id, this._normalizeAsset(asset));
    return createImmutableWaterSnapshot(previous);
  }

  private _normalizeAsset(asset: WaterBodyAsset): WaterBodyAsset<WaterBodySourceV1> {
    const decoded = decodeWaterBodySource(asset.source);
    if (!decoded.valid || !decoded.value) {
      const first = decoded.diagnostics[0];
      throw new WaterBodyRegistryError(
        WaterBodyRegistryErrorCode.InvalidSource,
        first?.path ?? "$.source",
        first?.message ?? `WaterBody asset '${asset.id}' has an invalid source.`
      );
    }
    const normalized = createWaterBodyAsset({
      id: asset.id,
      kind: asset.kind,
      representation: asset.representation,
      representationData:
        asset.representationData === undefined ? undefined : createImmutableWaterSnapshot(asset.representationData),
      representationDataHash: asset.representationDataHash,
      sourceHash: asset.sourceHash,
      source: decoded.value
    });
    assertSourceRepresentation(normalized);
    return normalized;
  }

  getAsset(assetId: string): WaterBodyAsset<WaterBodySourceV1> | undefined {
    const asset = this._assets.get(assetId);
    return asset ? createImmutableWaterSnapshot(asset) : undefined;
  }

  unregisterAsset(assetId: string): boolean {
    return this._assets.delete(assetId);
  }

  registerAppearancePreset(preset: WaterAppearancePresetV1): void {
    this._assertUnique(this._appearances, preset.id, "appearance preset");
    this._assertUnique(this._appearancesByAssetId, preset.appearance.id, "appearance asset");
    const normalized = createImmutableWaterSnapshot(preset);
    validateAppearancePreset(normalized);
    this._appearances.set(normalized.id, normalized);
    this._appearancesByAssetId.set(normalized.appearance.id, normalized);
  }

  registerOpticsPreset(preset: WaterOpticsPresetV1): void {
    this._assertUnique(this._optics, preset.id, "optics preset");
    const normalized = createImmutableWaterSnapshot(preset);
    validateOpticsPreset(normalized);
    this._optics.set(normalized.id, normalized);
  }

  registerLookPreset(preset: WaterLookPresetV1): void {
    this._assertUnique(this._looks, preset.id, "Look preset");
    const normalized = createWaterLookPresetV1(preset);
    this._looks.set(normalized.id, normalized);
    this._lookRevisions.set(normalized.id, 0);
    this._lookPublicationGenerations.set(normalized.id, 0);
  }

  registerReflectionPolicyPreset(preset: WaterReflectionPolicyPresetV1): void {
    this._assertUnique(this._reflectionPolicies, preset.id, "reflection-policy preset");
    const normalized = createWaterReflectionPolicyPresetV1(preset.id, preset.policy);
    this._reflectionPolicies.set(normalized.id, normalized);
  }

  registerRenderStatePreset(preset: WaterRenderStatePresetV1): void {
    this._assertUnique(this._renderStates, preset.id, "render-state preset");
    const normalized = createWaterRenderStatePresetV1(preset);
    this._renderStates.set(normalized.id, normalized);
  }

  registerQualityPlan(plan: WaterQualityPlanV2): void {
    this._assertUnique(this._qualityPlans, plan.id, "Quality Plan");
    const normalized = createWaterQualityPlanV2(plan);
    this._qualityPlans.set(normalized.id, normalized);
  }

  getLookPreset(id: string): WaterLookPresetV1 | undefined {
    return this._looks.get(id);
  }

  getLookAuthoringSnapshot(id: string): Readonly<WaterLookAuthoringSnapshot> | undefined {
    const look = this._looks.get(id);
    if (!look) return undefined;
    return this._createLookAuthoringSnapshot(look, this._lookRevisions.get(id) ?? 0);
  }

  /**
   * Atomically publishes one complete shared Look revision. Component identities
   * must stay stable; changing a referenced id is a structural Look replacement,
   * not a live edit of the existing definition.
   */
  publishLookAuthoring(
    draft: Readonly<WaterLookAuthoringDraft>,
    expectedRevision: number
  ): Readonly<WaterLookAuthoringSnapshot> {
    const previous = this.getLookAuthoringSnapshot(draft.look.id);
    if (!previous) {
      throw new WaterBodyRegistryError(
        WaterBodyRegistryErrorCode.MissingLookPreset,
        "$.look.id",
        `Water Look '${draft.look.id}' is not registered.`
      );
    }
    if (previous.revision !== expectedRevision) {
      throw new WaterBodyRegistryError(
        WaterBodyRegistryErrorCode.LookRevisionConflict,
        "$.revision",
        `Water Look '${draft.look.id}' revision ${expectedRevision} is stale; active revision is ${previous.revision}.`
      );
    }
    const normalized = this._normalizeLookAuthoringDraft(draft, previous);
    const nextRevision = expectedRevision + 1;
    this._publishNormalizedLookAuthoring(normalized, nextRevision);
    return this._createLookAuthoringSnapshot(normalized.look, nextRevision);
  }

  /** Validates and freezes a future Look revision without changing the active registry. */
  prepareLookAuthoring(
    draft: Readonly<WaterLookAuthoringDraft>,
    expectedRevision: number
  ): Readonly<WaterLookAuthoringSnapshot> {
    const previous = this.getLookAuthoringSnapshot(draft.look.id);
    if (!previous) {
      throw new WaterBodyRegistryError(
        WaterBodyRegistryErrorCode.MissingLookPreset,
        "$.look.id",
        `Water Look '${draft.look.id}' is not registered.`
      );
    }
    if (previous.revision !== expectedRevision) {
      throw new WaterBodyRegistryError(
        WaterBodyRegistryErrorCode.LookRevisionConflict,
        "$.revision",
        `Water Look '${draft.look.id}' revision ${expectedRevision} is stale; active revision is ${previous.revision}.`
      );
    }
    const normalized = this._normalizeLookAuthoringDraft(draft, previous);
    const prepared = createWaterLookAuthoringSnapshot({ ...normalized, revision: expectedRevision + 1 });
    this._preparedLookPublicationGenerations.set(prepared, this._lookPublicationGenerations.get(draft.look.id) ?? 0);
    return prepared;
  }

  /** Publishes a previously prepared Look only while its base revision is still current. */
  publishPreparedLookAuthoring(
    prepared: Readonly<WaterLookAuthoringSnapshot>,
    expectedRevision: number
  ): Readonly<WaterLookAuthoringSnapshot> {
    const current = this.getLookAuthoringSnapshot(prepared.look.id);
    const expectedPublicationGeneration = this._preparedLookPublicationGenerations.get(prepared);
    const currentPublicationGeneration = this._lookPublicationGenerations.get(prepared.look.id) ?? 0;
    if (
      !current ||
      current.revision !== expectedRevision ||
      expectedPublicationGeneration === undefined ||
      expectedPublicationGeneration !== currentPublicationGeneration
    ) {
      throw new WaterBodyRegistryError(
        WaterBodyRegistryErrorCode.LookRevisionConflict,
        "$.revision",
        `Prepared Water Look '${prepared.look.id}' no longer targets the active revision ${expectedRevision}.`
      );
    }
    const normalized = this._normalizeLookAuthoringDraft(prepared, current);
    this._publishNormalizedLookAuthoring(normalized, prepared.revision);
    return this._createLookAuthoringSnapshot(normalized.look, prepared.revision);
  }

  /** Restores an exact transaction snapshot after runtime publication fails. */
  restoreLookAuthoring(snapshot: Readonly<WaterLookAuthoringSnapshot>): void {
    const current = this.getLookAuthoringSnapshot(snapshot.look.id);
    if (!current) {
      throw new WaterBodyRegistryError(
        WaterBodyRegistryErrorCode.MissingLookPreset,
        "$.look.id",
        `Water Look '${snapshot.look.id}' is not registered.`
      );
    }
    const normalized = this._normalizeLookAuthoringDraft(snapshot, current);
    this._publishNormalizedLookAuthoring(normalized, snapshot.revision);
  }

  getQualityPlan(id: string): WaterQualityPlanV2 | undefined {
    return this._qualityPlans.get(id);
  }

  getRenderContract(contentHash: string): CompiledWaterRenderContractV1 | undefined {
    const contract = this._compiledRenderContracts.get(contentHash);
    if (contract) {
      this._compiledRenderContracts.delete(contentHash);
      this._compiledRenderContracts.set(contentHash, contract);
    }
    return contract;
  }

  registerRuntimeVariant(assetId: string, variant: WaterBodyRuntimeVariant): void {
    if (assetId.trim().length === 0) {
      throw new WaterBodyRegistryError(
        WaterBodyRegistryErrorCode.InvalidPreset,
        "$.assetId",
        "Water runtime variant asset id must not be empty."
      );
    }
    if (variant.id.trim().length === 0 || variant.label.trim().length === 0) {
      throw new WaterBodyRegistryError(
        WaterBodyRegistryErrorCode.InvalidPreset,
        "$.runtimeVariant",
        "Water runtime variant id and label must not be empty."
      );
    }
    const variants = this._runtimeVariants.get(assetId) ?? new Map<string, WaterBodyRuntimeVariant>();
    this._assertUnique(variants, variant.id, `runtime variant for '${assetId}'`);
    variants.set(variant.id, Object.freeze({ ...variant }));
    this._runtimeVariants.set(assetId, variants);
  }

  getRuntimeVariants(assetId: string): readonly WaterBodyRuntimeVariant[] {
    return Object.freeze([...(this._runtimeVariants.get(assetId)?.values() ?? [])]);
  }

  /** Immutable identity lookup for Looks sharing a texture resource. */
  getResource(id: string): Readonly<WaterResourceAssetDescriptorV1> | undefined {
    return this._resources.get(id);
  }

  registerResource(resource: WaterResourceAssetDescriptorV1): void {
    this._assertUnique(this._resources, resource.id, "resource");
    if (!SHA_256_PATTERN.test(resource.contentHash)) {
      throw new WaterBodyRegistryError(
        WaterBodyRegistryErrorCode.InvalidResourceHash,
        "$.contentHash",
        `Resource '${resource.id}' must use a SHA-256 content hash.`
      );
    }
    this._resources.set(resource.id, createImmutableWaterSnapshot(resource));
  }

  resolve(
    instance: WaterBodyInstance,
    lookOverride?: Readonly<WaterLookAuthoringSnapshot>,
    assetOverride?: Readonly<WaterBodyAsset>
  ): ResolvedWaterBodyInstance {
    if (assetOverride && assetOverride.id !== instance.assetId) {
      throw new WaterBodyRegistryError(
        WaterBodyRegistryErrorCode.MissingAsset,
        "$.assetId",
        `Water asset override '${assetOverride.id}' does not match instance asset '${instance.assetId}'.`
      );
    }
    const asset = assetOverride
      ? this._normalizeAsset(assetOverride)
      : requireFromMap(
          this._assets,
          instance.assetId,
          WaterBodyRegistryErrorCode.MissingAsset,
          "$.assetId",
          "WaterBody asset"
        );
    const oceanRepresentation = asset.representation.domain === "world-space-ocean";
    const oceanLayout = instance.representationState?.kind === "ocean-surface-layout";
    if (oceanRepresentation !== oceanLayout) {
      throw new WaterBodyRegistryError(
        WaterBodyRegistryErrorCode.InvalidRepresentationState,
        "$.representationState",
        oceanRepresentation
          ? `Ocean WaterBody instance '${instance.id}' requires one ocean-surface-layout Representation state.`
          : `Non-Ocean WaterBody instance '${instance.id}' must not carry ocean-surface-layout Representation state.`
      );
    }
    if (lookOverride && lookOverride.look.id !== instance.lookPresetId) {
      throw new WaterBodyRegistryError(
        WaterBodyRegistryErrorCode.MissingLookPreset,
        "$.lookPresetId",
        `Water Look override '${lookOverride.look.id}' does not match instance Look '${instance.lookPresetId}'.`
      );
    }
    const look =
      lookOverride?.look ??
      requireFromMap(
        this._looks,
        instance.lookPresetId,
        WaterBodyRegistryErrorCode.MissingLookPreset,
        "$.lookPresetId",
        "Water Look preset"
      );
    const appearance =
      lookOverride?.appearance ??
      requireFromMap(
        this._appearancesByAssetId,
        look.appearanceAssetId,
        WaterBodyRegistryErrorCode.MissingAppearancePreset,
        "$.look.appearanceAssetId",
        "Water appearance asset"
      );
    const optics =
      lookOverride?.optics ??
      requireFromMap(
        this._optics,
        look.opticalProfileId,
        WaterBodyRegistryErrorCode.MissingOpticsPreset,
        "$.look.opticalProfileId",
        "Water optical profile"
      );
    const reflectionPolicy =
      lookOverride?.reflectionPolicy ??
      requireFromMap(
        this._reflectionPolicies,
        look.reflectionPolicyId,
        WaterBodyRegistryErrorCode.MissingReflectionPolicy,
        "$.look.reflectionPolicyId",
        "Water reflection policy"
      );
    const renderState =
      lookOverride?.renderState ??
      requireFromMap(
        this._renderStates,
        look.renderStatePresetId,
        WaterBodyRegistryErrorCode.MissingRenderStatePreset,
        "$.look.renderStatePresetId",
        "Water render-state preset"
      );
    const qualityPlan = requireFromMap(
      this._qualityPlans,
      instance.qualityPlanId,
      WaterBodyRegistryErrorCode.MissingQualityPlan,
      "$.qualityPlanId",
      "Water Quality Plan"
    );
    const lookAuthoring =
      lookOverride ?? this._createLookAuthoringSnapshot(look, this._lookRevisions.get(look.id) ?? 0);
    if (!appearance.fieldDependencies) {
      throw new WaterBodyRegistryError(
        WaterBodyRegistryErrorCode.InvalidPreset,
        "$.look.appearanceAssetId",
        `Water Look '${look.id}' requires a Surface Appearance V2 asset and explicit field dependencies.`
      );
    }
    const descriptor =
      "descriptor" in asset.source ? (asset.source.descriptor as { drops?: readonly unknown[] }) : undefined;
    const hasDrops = asset.kind === "river" && Array.isArray(descriptor?.drops) && descriptor.drops.length > 0;
    // Drop textures are leased only by River instances containing actual drops.
    const dropLook = hasDrops ? (look.riverDrops ?? RIVER_DEFAULT_DROP_LOOK) : undefined;
    const resources = Object.freeze(this._resolveAppearanceResources(appearance.appearance, dropLook));
    const baseKey = `${lookAuthoring.contentHash}\u0000${computeWaterQualityPlanContentHash(qualityPlan)}${dropLook ? "\u0000drops" : ""}`;
    let baseContract = this._baseRenderContracts.get(baseKey);
    if (baseContract) {
      this._baseRenderContracts.delete(baseKey);
      this._baseRenderContracts.set(baseKey, baseContract);
    } else {
      const { riverDrops: _drops, ...surfaceLook } = look;
      const contractResult = WaterRenderContractCompiler.compile({
        sourceId: look.id,
        look: dropLook ? { ...look, riverDrops: dropLook } : surfaceLook,
        appearance: appearance.appearance,
        fieldDependencies: appearance.fieldDependencies,
        optics: Object.freeze({ id: optics.id, profile: optics.profile }),
        reflectionIntent: reflectionPolicy,
        renderState,
        resources,
        qualityPlan
      });
      this._renderContractCompileCount++;
      if (!contractResult.valid || !contractResult.data) {
        const first = contractResult.diagnostics[0];
        throw new WaterBodyRegistryError(
          WaterBodyRegistryErrorCode.CapabilityRequirementUnsatisfied,
          first?.path ?? "$.lookPresetId",
          first?.message ?? `Water Look '${look.id}' could not compile its Render Contract.`
        );
      }
      baseContract = contractResult.data;
      this._baseRenderContracts.set(baseKey, baseContract);
      this._trimRenderContractCache(this._baseRenderContracts, WATER_BASE_RENDER_CONTRACT_CACHE_LIMIT, false);
    }
    const renderContract = baseContract;
    const cachedContract = this._compiledRenderContracts.get(renderContract.contentHash) ?? renderContract;
    this._compiledRenderContracts.delete(cachedContract.contentHash);
    this._compiledRenderContracts.set(cachedContract.contentHash, cachedContract);
    this._trimRenderContractCache(this._compiledRenderContracts, WATER_RENDER_CONTRACT_CACHE_LIMIT, true);
    return Object.freeze({
      schemaVersion: 2 as const,
      instance: createImmutableWaterSnapshot(instance),
      asset: createImmutableWaterSnapshot(asset),
      look,
      lookAuthoring,
      lookRevision: lookAuthoring.revision,
      lookContentHash: lookAuthoring.contentHash,
      appearance,
      optics,
      reflectionPolicy,
      renderState,
      qualityPlan,
      renderContract: cachedContract,
      resources
    });
  }

  clear(): void {
    this._assets.clear();
    this._appearances.clear();
    this._appearancesByAssetId.clear();
    this._optics.clear();
    this._looks.clear();
    this._lookRevisions.clear();
    this._lookPublicationGenerations.clear();
    this._reflectionPolicies.clear();
    this._renderStates.clear();
    this._qualityPlans.clear();
    this._compiledRenderContracts.clear();
    this._baseRenderContracts.clear();
    this._renderContractCompileCount = 0;
    this._renderContractEvictionCount = 0;
    this._runtimeVariants.clear();
    this._resources.clear();
  }

  private _trimRenderContractCache(
    cache: Map<string, CompiledWaterRenderContractV1>,
    limit: number,
    countEviction: boolean
  ): void {
    while (cache.size > limit) {
      const oldest = cache.keys().next().value as string | undefined;
      if (oldest === undefined) return;
      cache.delete(oldest);
      if (countEviction) this._renderContractEvictionCount++;
    }
  }

  private _createLookAuthoringSnapshot(
    look: Readonly<WaterLookPresetV1>,
    revision: number
  ): Readonly<WaterLookAuthoringSnapshot> {
    const appearance = requireFromMap(
      this._appearancesByAssetId,
      look.appearanceAssetId,
      WaterBodyRegistryErrorCode.MissingAppearancePreset,
      "$.look.appearanceAssetId",
      "Water appearance asset"
    );
    const optics = requireFromMap(
      this._optics,
      look.opticalProfileId,
      WaterBodyRegistryErrorCode.MissingOpticsPreset,
      "$.look.opticalProfileId",
      "Water optical profile"
    );
    const reflectionPolicy = requireFromMap(
      this._reflectionPolicies,
      look.reflectionPolicyId,
      WaterBodyRegistryErrorCode.MissingReflectionPolicy,
      "$.look.reflectionPolicyId",
      "Water reflection policy"
    );
    const renderState = requireFromMap(
      this._renderStates,
      look.renderStatePresetId,
      WaterBodyRegistryErrorCode.MissingRenderStatePreset,
      "$.look.renderStatePresetId",
      "Water render-state preset"
    );
    return createWaterLookAuthoringSnapshot({
      revision,
      look,
      appearance,
      optics,
      reflectionPolicy,
      renderState
    });
  }

  private _normalizeLookAuthoringDraft(
    draft: Readonly<WaterLookAuthoringDraft>,
    previous: Readonly<WaterLookAuthoringSnapshot>
  ): Readonly<WaterLookAuthoringDraft> {
    const look = createWaterLookPresetV1(draft.look);
    const appearance = createImmutableWaterSnapshot(draft.appearance);
    const optics = createImmutableWaterSnapshot(draft.optics);
    const reflectionPolicy = createWaterReflectionPolicyPresetV1(
      draft.reflectionPolicy.id,
      draft.reflectionPolicy.policy
    );
    const renderState = createWaterRenderStatePresetV1(draft.renderState);
    validateAppearancePreset(appearance);
    validateOpticsPreset(optics);
    const stableIdentities = [
      [look.id, previous.look.id, "$.look.id"],
      [look.appearanceAssetId, previous.look.appearanceAssetId, "$.look.appearanceAssetId"],
      [look.opticalProfileId, previous.look.opticalProfileId, "$.look.opticalProfileId"],
      [look.reflectionPolicyId, previous.look.reflectionPolicyId, "$.look.reflectionPolicyId"],
      [look.renderStatePresetId, previous.look.renderStatePresetId, "$.look.renderStatePresetId"],
      [appearance.id, previous.appearance.id, "$.appearance.id"],
      [appearance.appearance.id, previous.appearance.appearance.id, "$.appearance.appearance.id"],
      [optics.id, previous.optics.id, "$.optics.id"],
      [reflectionPolicy.id, previous.reflectionPolicy.id, "$.reflectionPolicy.id"],
      [renderState.id, previous.renderState.id, "$.renderState.id"]
    ] as const;
    for (const [next, current, path] of stableIdentities) {
      if (next !== current) {
        throw new WaterBodyRegistryError(
          WaterBodyRegistryErrorCode.InvalidPreset,
          path,
          `${path} must preserve the active Water Look component identity '${current}'.`
        );
      }
    }
    if (
      look.appearanceAssetId !== appearance.appearance.id ||
      look.opticalProfileId !== optics.id ||
      look.reflectionPolicyId !== reflectionPolicy.id ||
      look.renderStatePresetId !== renderState.id
    ) {
      throw new WaterBodyRegistryError(
        WaterBodyRegistryErrorCode.InvalidPreset,
        "$.look",
        `Water Look '${look.id}' component references do not match the published component identities.`
      );
    }
    const sharedComponentChanges = [
      {
        changed: hashStableValue(appearance) !== hashStableValue(previous.appearance),
        componentId: look.appearanceAssetId,
        referencedBy: (candidate: WaterLookPresetV1) => candidate.appearanceAssetId,
        path: "$.appearance"
      },
      {
        changed: hashStableValue(optics) !== hashStableValue(previous.optics),
        componentId: look.opticalProfileId,
        referencedBy: (candidate: WaterLookPresetV1) => candidate.opticalProfileId,
        path: "$.optics"
      },
      {
        changed: hashStableValue(reflectionPolicy) !== hashStableValue(previous.reflectionPolicy),
        componentId: look.reflectionPolicyId,
        referencedBy: (candidate: WaterLookPresetV1) => candidate.reflectionPolicyId,
        path: "$.reflectionPolicy"
      },
      {
        changed: hashStableValue(renderState) !== hashStableValue(previous.renderState),
        componentId: look.renderStatePresetId,
        referencedBy: (candidate: WaterLookPresetV1) => candidate.renderStatePresetId,
        path: "$.renderState"
      }
    ] as const;
    for (const component of sharedComponentChanges) {
      if (!component.changed) continue;
      const otherOwner = [...this._looks.values()].find(
        (candidate) => candidate.id !== look.id && component.referencedBy(candidate) === component.componentId
      );
      if (otherOwner) {
        throw new WaterBodyRegistryError(
          WaterBodyRegistryErrorCode.InvalidPreset,
          component.path,
          `${component.path} component '${component.componentId}' is shared by Water Look '${otherOwner.id}' and cannot be edited through '${look.id}'.`
        );
      }
    }
    return Object.freeze({
      look,
      appearance,
      optics,
      reflectionPolicy,
      renderState
    });
  }

  private _publishNormalizedLookAuthoring(draft: Readonly<WaterLookAuthoringDraft>, revision: number): void {
    this._looks.set(draft.look.id, draft.look);
    this._appearances.set(draft.appearance.id, draft.appearance);
    this._appearancesByAssetId.set(draft.appearance.appearance.id, draft.appearance);
    this._optics.set(draft.optics.id, draft.optics);
    this._reflectionPolicies.set(draft.reflectionPolicy.id, draft.reflectionPolicy);
    this._renderStates.set(draft.renderState.id, draft.renderState);
    this._lookRevisions.set(draft.look.id, revision);
    this._lookPublicationGenerations.set(draft.look.id, (this._lookPublicationGenerations.get(draft.look.id) ?? 0) + 1);
    this._compiledRenderContracts.clear();
    this._baseRenderContracts.clear();
  }

  private _resolveAppearanceResources(
    appearance: WaterSurfaceAppearanceAsset,
    drops?: WaterLookPresetV1["riverDrops"]
  ): WaterResourceAssetDescriptorV1[] {
    const references = collectWaterSurfaceTextureReferences(appearance).map((reference) => ({
      assetId: reference.textureAssetId,
      contentHash: reference.textureContentHash,
      path: waterSurfaceTextureReferencePath(appearance, reference)
    }));
    if (drops)
      for (const [slot, reference] of Object.entries(drops.textures))
        references.push({ ...reference, path: `$.look.riverDrops.textures.${slot}` });
    const resources = new Map<string, WaterResourceAssetDescriptorV1>();
    for (const reference of references) {
      const resource = requireFromMap(
        // Built-in fallback textures remain available without registering a River-specific Look.
        drops === RIVER_DEFAULT_DROP_LOOK && !this._resources.has(reference.assetId)
          ? DEFAULT_DROP_RESOURCES
          : this._resources,
        reference.assetId,
        WaterBodyRegistryErrorCode.MissingResource,
        `${reference.path}.textureAssetId`,
        "Water resource"
      );
      if (waterTextureResourceIssue(reference.contentHash, resource)) {
        throw new WaterBodyRegistryError(
          WaterBodyRegistryErrorCode.ResourceHashMismatch,
          `${reference.path}.textureContentHash`,
          `Resource '${resource.id}' content hash does not match the appearance preset.`
        );
      }
      resources.set(resource.id, resource);
    }
    return [...resources.values()];
  }

  private _assertUnique<T>(map: ReadonlyMap<string, T>, id: string, kind: string): void {
    if (map.has(id)) {
      throw new WaterBodyRegistryError(
        WaterBodyRegistryErrorCode.DuplicateRegistration,
        "$.id",
        `Water ${kind} '${id}' is already registered.`
      );
    }
  }
}
