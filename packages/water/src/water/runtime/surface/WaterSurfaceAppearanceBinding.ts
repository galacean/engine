import { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";
import { getRequiredWaterSurfaceV2Semantics } from "../../compiler/surface/WaterSurfaceClosureCompiler";
import {
  resolveWaterSurfaceFieldGraph,
  type WaterSurfaceFieldGraphReadback,
  type WaterSurfaceFieldProviderAvailability
} from "./WaterSurfaceFieldResolver";
/** Fail-closed resolution for caller-owned external surface appearance textures. */
import {
  WaterRefractionValidationModeV2,
  WaterSurfaceAppearanceSchemaVersion
} from "../../authoring/surface/WaterSurfaceAppearanceTypes";
import {
  WaterFieldSemantic,
  WaterFieldConsumerActivation,
  WaterFieldProviderKind,
  WaterFieldRequirement,
  WaterFieldFallback,
  WaterFieldUnit
} from "../../authoring/surface/WaterSurfaceFieldTypes";
import { getWaterSurfaceDepthResponseSemantics } from "../../authoring/surface/WaterSurfaceDepthResponseSemantics";
import { WaterSurfaceAppearanceCompiler } from "../../compiler/surface/WaterSurfaceAppearanceCompiler";
import type { CompiledWaterSurfaceAppearanceV2 } from "../../compiler/surface/CompiledWaterSurfaceAppearanceTypes";
import type {
  WaterSurfaceAppearanceBindingV2,
  WaterSurfaceAppearanceBindingReadback,
  WaterSurfaceAppearanceBindingResolution,
  WaterSurfaceAppearanceFallbackReason
} from "./WaterSurfaceAppearanceRuntimeTypes";

type MutableWaterSurfaceAppearanceBindingReadback = {
  -readonly [Property in keyof WaterSurfaceAppearanceBindingReadback]: WaterSurfaceAppearanceBindingReadback[Property];
};

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !ArrayBuffer.isView(value);
}

function isCanonicalHex(value: unknown, length: number): value is string {
  return typeof value === "string" && new RegExp(`^[0-9a-f]{${length}}$`).test(value);
}

function createReadback(
  values: Partial<WaterSurfaceAppearanceBindingReadback> = {}
): WaterSurfaceAppearanceBindingReadback {
  return Object.freeze({
    requested: false,
    active: false,
    appearanceAssetId: undefined,
    appearanceHash: undefined,
    variantKey: undefined,
    normalAssetId: undefined,
    normalContentHash: undefined,
    normalTextureWidth: 0,
    normalTextureHeight: 0,
    normalLayerCount: 0,
    ownership: undefined,
    fallbackReason: undefined,
    ...values
  });
}

export function createWaterSurfaceAppearanceBindingReadback(): WaterSurfaceAppearanceBindingReadback {
  return Object.seal({
    requested: false,
    active: false,
    appearanceAssetId: undefined,
    appearanceHash: undefined,
    variantKey: undefined,
    normalAssetId: undefined,
    normalContentHash: undefined,
    normalTextureWidth: 0,
    normalTextureHeight: 0,
    normalLayerCount: 0,
    ownership: undefined,
    fallbackReason: undefined,
    schemaVersion: undefined,
    detailLayerIds: undefined,
    detailTextureBindingCount: undefined,
    primaryColorClosure: undefined,
    depthResponseModelV2: undefined,
    depthResponseFields: undefined,
    depthResponseField: undefined,
    boundaryEffectIds: undefined,
    refractionEnabledV2: undefined,
    refractionValidation: undefined,
    occlusionValidation: undefined,
    compositionV2: undefined
  });
}

export function writeWaterSurfaceAppearanceBindingReadback(
  target: WaterSurfaceAppearanceBindingReadback,
  source: Readonly<WaterSurfaceAppearanceBindingReadback>
): void {
  Object.assign(target as MutableWaterSurfaceAppearanceBindingReadback, {
    schemaVersion: undefined,
    detailLayerIds: undefined,
    detailTextureBindingCount: undefined,
    primaryColorClosure: undefined,
    depthResponseModelV2: undefined,
    depthResponseFields: undefined,
    depthResponseField: undefined,
    boundaryEffectIds: undefined,
    refractionEnabledV2: undefined,
    refractionValidation: undefined,
    occlusionValidation: undefined,
    compositionV2: undefined,
    ...source
  });
}

function createV2FailureReadback(
  binding: Readonly<WaterSurfaceAppearanceBindingV2>,
  fallbackReason: WaterSurfaceAppearanceFallbackReason
): WaterSurfaceAppearanceBindingResolution {
  const rawAppearance: unknown = binding.appearance;
  const appearance = isRecord(rawAppearance) ? rawAppearance : undefined;
  const rawLayers = appearance && Array.isArray(appearance.detailLayers) ? appearance.detailLayers : [];
  return Object.freeze({
    readback: createReadback({
      requested: true,
      appearanceAssetId: typeof appearance?.sourceId === "string" ? appearance.sourceId : undefined,
      appearanceHash: typeof appearance?.appearanceHash === "string" ? appearance.appearanceHash : undefined,
      variantKey: typeof appearance?.variantKey === "string" ? appearance.variantKey : undefined,
      schemaVersion:
        appearance?.schemaVersion === WaterSurfaceAppearanceSchemaVersion.V2
          ? WaterSurfaceAppearanceSchemaVersion.V2
          : undefined,
      detailLayerIds: Object.freeze(
        rawLayers.flatMap((layer) => (isRecord(layer) && typeof layer.id === "string" ? [layer.id] : []))
      ),
      detailTextureBindingCount: Array.isArray(binding.textureBindings) ? binding.textureBindings.length : 0,
      fallbackReason
    })
  });
}

function isAvailableTexture(texture: unknown): boolean {
  return (
    isRecord(texture) &&
    texture.destroyed === false &&
    typeof texture.width === "number" &&
    Number.isFinite(texture.width) &&
    texture.width > 0 &&
    typeof texture.height === "number" &&
    Number.isFinite(texture.height) &&
    texture.height > 0
  );
}

function reconstructV2Appearance(raw: Readonly<Record<string, unknown>>): unknown {
  return {
    schemaVersion: raw.schemaVersion,
    id: raw.sourceId,
    primaryColorClosure: raw.primaryColorClosure,
    macroNormalStrength: raw.macroNormalStrength,
    flowNormalStrength: raw.flowNormalStrength,
    detailNormalStrength: raw.detailNormalStrength,
    caustics: raw.caustics,
    directionalHighlight: raw.directionalHighlight,
    detailLayers: raw.detailLayers,
    depthResponse: raw.depthResponse,
    boundaryEffects: raw.boundaryEffects,
    refraction: raw.refraction,
    composition: raw.composition
  };
}

/** Direct material callers use an implicit graph; resolved Looks supply their compiled graph verbatim. */
export function resolveWaterSurfaceAppearanceFields(
  binding: Readonly<WaterSurfaceAppearanceBindingV2>,
  availability: WaterSurfaceFieldProviderAvailability
): WaterSurfaceFieldGraphReadback {
  if (binding.fieldGraph) return binding.fieldGraph;
  const S = WaterFieldSemantic;
  const P = WaterFieldProviderKind;
  const semantics = new Set(getRequiredWaterSurfaceV2Semantics(binding.appearance));
  if (semantics.has(S.OpticalPath)) semantics.add(S.VerticalDepth);
  const bindings = [...semantics].map((semantic) => ({
    consumerId: semantic,
    semantic,
    providers: [
      semantic === S.OpticalPath
        ? P.Derived
        : semantic === S.SceneColor
          ? P.CameraOpaqueColor
          : semantic === S.SceneEyeDepth ||
              semantic === S.SceneRayDepth ||
              semantic === S.SurfaceNormalDepth ||
              semantic === S.ObstacleContact
            ? P.CameraDepth
            : P.CompiledSpatialField
    ],
    activation: WaterFieldConsumerActivation.Always,
    requirement: WaterFieldRequirement.Required,
    fallback: WaterFieldFallback.FailActivation,
    unit:
      semantic === S.SceneColor
        ? WaterFieldUnit.LinearRgb
        : semantic === S.Coverage
          ? WaterFieldUnit.Normalized
          : semantic === S.Flow
            ? WaterFieldUnit.MeterPerSecond
            : WaterFieldUnit.Meter
  }));
  const graph = binding.renderContract?.surfaceClosure.fields ?? {
    schemaVersion: 2,
    sourceId: binding.appearance.sourceId,
    contentHash: binding.appearance.appearanceHash,
    variantKey: binding.appearance.variantKey,
    bindings,
    diagnostics: [],
    capabilities: {
      compiledSpatialFields: true,
      cameraDepth: true,
      cameraOpaqueColor: true,
      derivedFields: false,
      constants: false
    }
  };
  return resolveWaterSurfaceFieldGraph(graph, availability);
}

function resolveWaterSurfaceAppearanceV2Binding(
  binding: Readonly<WaterSurfaceAppearanceBindingV2>,
  qualitySupported: boolean,
  maximumPatternOctaves: 1 | 2 | 3,
  maximumDetailLayers: 1 | 2,
  requestedFieldGraph: WaterSurfaceFieldGraphReadback | undefined,
  legacySceneDepthAvailable: boolean
): WaterSurfaceAppearanceBindingResolution {
  if (!qualitySupported) return createV2FailureReadback(binding, "surface-appearance-quality-unsupported");
  const rawAppearance: unknown = binding.appearance;
  if (
    !isRecord(rawAppearance) ||
    rawAppearance.schemaVersion !== WaterSurfaceAppearanceSchemaVersion.V2 ||
    typeof rawAppearance.sourceId !== "string" ||
    !isCanonicalHex(rawAppearance.appearanceHash, 16) ||
    typeof rawAppearance.variantKey !== "string" ||
    !/^surface-appearance-v2:[0-9a-f]{16}$/.test(rawAppearance.variantKey)
  ) {
    return createV2FailureReadback(binding, "surface-appearance-compiled-data-unavailable");
  }
  const compilation = WaterSurfaceAppearanceCompiler.compile(reconstructV2Appearance(rawAppearance));
  if (
    !compilation.valid ||
    !compilation.data ||
    compilation.data.schemaVersion !== WaterSurfaceAppearanceSchemaVersion.V2 ||
    compilation.data.appearanceHash !== rawAppearance.appearanceHash ||
    compilation.data.variantKey !== rawAppearance.variantKey
  ) {
    return createV2FailureReadback(binding, "surface-appearance-compiled-data-unavailable");
  }
  const appearance: CompiledWaterSurfaceAppearanceV2 = compilation.data;
  if (
    JSON.stringify(rawAppearance.textureReferences) !== JSON.stringify(appearance.textureReferences) ||
    rawAppearance.maximumPatternOctaves !== appearance.maximumPatternOctaves
  ) {
    return createV2FailureReadback(binding, "surface-appearance-compiled-data-unavailable");
  }
  if (appearance.detailLayers.length > maximumDetailLayers) {
    return createV2FailureReadback(binding, "surface-appearance-detail-layer-budget-exceeded");
  }
  if (appearance.maximumPatternOctaves > maximumPatternOctaves) {
    return createV2FailureReadback(binding, "surface-appearance-pattern-octave-budget-exceeded");
  }
  const fieldGraph =
    requestedFieldGraph ??
    resolveWaterSurfaceAppearanceFields(binding, {
      quality: WaterQualityTier.High,
      effectiveQualityPlan: {
        id: "direct-material",
        sceneFields: legacySceneDepthAvailable ? "scene-color-depth" : "scene-color"
      },
      compiledSpatialFields: new Set([
        WaterFieldSemantic.Coverage,
        WaterFieldSemantic.SurfaceHeight,
        WaterFieldSemantic.VerticalDepth,
        WaterFieldSemantic.HorizontalShoreDistance,
        WaterFieldSemantic.Flow
      ]),
      enabledActivations: new Set(Object.values(WaterFieldConsumerActivation)),
      cameraDepth: legacySceneDepthAvailable,
      cameraOpaqueColor: true
    });
  const sceneDepthAvailable = fieldGraph.cameraDepthRequested;
  if (
    appearance.refraction.enabled &&
    appearance.refraction.validation === WaterRefractionValidationModeV2.FullSceneDepth &&
    !sceneDepthAvailable
  ) {
    return createV2FailureReadback(binding, "surface-appearance-refraction-depth-unavailable");
  }
  const depthResponseFields = getWaterSurfaceDepthResponseSemantics(appearance.depthResponse);
  const availableSemantics = new Set(
    fieldGraph.bindings.filter((field) => field.status === "resolved").map((field) => field.semantic)
  );
  if (
    fieldGraph.failed ||
    [...getRequiredWaterSurfaceV2Semantics(appearance)].some((field) => !availableSemantics.has(field))
  ) {
    return createV2FailureReadback(binding, "surface-appearance-required-field-unavailable");
  }
  if (!Array.isArray(binding.textureBindings)) {
    return createV2FailureReadback(binding, "surface-appearance-texture-binding-missing");
  }
  if (binding.textureBindings.length > appearance.textureReferences.length) {
    return createV2FailureReadback(binding, "surface-appearance-texture-binding-unexpected");
  }
  const bindingIds = new Set<string>();
  for (const textureBinding of binding.textureBindings) {
    if (!isRecord(textureBinding) || typeof textureBinding.layerId !== "string") {
      return createV2FailureReadback(binding, "surface-appearance-texture-binding-missing");
    }
    if (bindingIds.has(textureBinding.layerId)) {
      return createV2FailureReadback(binding, "surface-appearance-texture-binding-unexpected");
    }
    bindingIds.add(textureBinding.layerId);
  }
  for (const reference of appearance.textureReferences) {
    const textureBinding = binding.textureBindings.find((candidate) => candidate.layerId === reference.layerId);
    if (!textureBinding) {
      return createV2FailureReadback(binding, "surface-appearance-texture-binding-missing");
    }
    if (textureBinding.assetId !== reference.textureAssetId) {
      return createV2FailureReadback(binding, "surface-appearance-asset-id-mismatch");
    }
    if (
      typeof textureBinding.contentHash !== "string" ||
      textureBinding.contentHash.toLowerCase() !== reference.textureContentHash
    ) {
      return createV2FailureReadback(binding, "surface-appearance-content-hash-mismatch");
    }
    if (textureBinding.ownership !== "borrowed") {
      return createV2FailureReadback(binding, "surface-appearance-ownership-invalid");
    }
    if (!isAvailableTexture(textureBinding.texture)) {
      return createV2FailureReadback(binding, "surface-appearance-texture-unavailable");
    }
  }
  const firstTextureBinding = binding.textureBindings[0];
  return Object.freeze({
    binding,
    readback: createReadback({
      requested: true,
      active: true,
      appearanceAssetId: appearance.sourceId,
      appearanceHash: appearance.appearanceHash,
      variantKey: appearance.variantKey,
      normalAssetId: firstTextureBinding?.assetId,
      normalContentHash: firstTextureBinding?.contentHash.toLowerCase(),
      normalTextureWidth: firstTextureBinding?.texture.width ?? 0,
      normalTextureHeight: firstTextureBinding?.texture.height ?? 0,
      normalLayerCount: appearance.detailLayers.length as 0 | 1 | 2,
      ownership: binding.textureBindings.length > 0 ? "borrowed" : undefined,
      schemaVersion: WaterSurfaceAppearanceSchemaVersion.V2,
      detailLayerIds: Object.freeze(appearance.detailLayers.map((layer) => layer.id)),
      detailTextureBindingCount: binding.textureBindings.length,
      primaryColorClosure: appearance.primaryColorClosure,
      depthResponseModelV2: appearance.depthResponse.model,
      depthResponseFields,
      depthResponseField: depthResponseFields.length === 1 ? depthResponseFields[0] : undefined,
      boundaryEffectIds: Object.freeze(appearance.boundaryEffects.map((effect) => effect.id)),
      refractionEnabledV2: appearance.refraction.enabled,
      refractionValidation: appearance.refraction.validation,
      occlusionValidation: !appearance.refraction.enabled
        ? "not-requested"
        : appearance.refraction.validation === WaterRefractionValidationModeV2.FullSceneDepth
          ? "available"
          : "unavailable",
      compositionV2: appearance.composition
    })
  });
}

export function resolveWaterSurfaceAppearanceBinding(
  binding?: Readonly<WaterSurfaceAppearanceBindingV2>,
  qualitySupported = true,
  maximumPatternOctaves: 1 | 2 | 3 = 3,
  maximumDetailLayers: 1 | 2 = 2,
  sceneDepthAvailable = true,
  fieldGraph?: WaterSurfaceFieldGraphReadback
): WaterSurfaceAppearanceBindingResolution {
  if (!binding) return Object.freeze({ readback: createReadback() });
  return resolveWaterSurfaceAppearanceV2Binding(
    binding,
    qualitySupported,
    maximumPatternOctaves,
    maximumDetailLayers,
    fieldGraph ?? binding.fieldGraph,
    sceneDepthAvailable
  );
}
