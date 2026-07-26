/** Fail-closed resolution for caller-owned external surface appearance textures. */
import {
  WaterSurfaceAppearanceSchemaVersion,
  WaterSurfaceCoastalAlphaModel,
  WaterSurfaceContactFoamModel,
  WaterSurfaceDepthTintModel,
  WaterSurfaceNormalModel,
  WaterSurfaceNormalSampling
} from "../../authoring/surface/WaterSurfaceAppearanceTypes";
import type {
  WaterSurfaceAppearanceBinding,
  WaterSurfaceAppearanceBindingReadback,
  WaterSurfaceAppearanceBindingResolution,
  WaterSurfaceAppearanceFallbackReason
} from "./WaterSurfaceAppearanceRuntimeTypes";

type MutableWaterSurfaceAppearanceBindingReadback = {
  -readonly [Property in keyof WaterSurfaceAppearanceBindingReadback]: WaterSurfaceAppearanceBindingReadback[Property];
};

const MAX_APPEARANCE_DISTANCE = 100_000;
const MAX_DEPTH_TINT_EXPONENT = 32;
const MAX_FOAM_LACUNARITY = 64;
const MAX_FOAM_TIME_RATE = 1_024;
const MAX_FOAM_WORLD_SCALE = 100_000;
const MAX_NORMAL_TILING = 1_024;
const MAX_NORMAL_SCROLL_SPEED = 1_024;
const MAX_NORMAL_STRENGTH = 4;
const EMPTY_CONTACT_FOAM_WEIGHTS: readonly number[] = Object.freeze([]);

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !ArrayBuffer.isView(value);
}

function isFiniteInRange(value: unknown, minimumExclusive: number, maximumInclusive: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > minimumExclusive && value <= maximumInclusive;
}

function isFiniteInClosedRange(value: unknown, minimumInclusive: number, maximumInclusive: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimumInclusive && value <= maximumInclusive;
}

function isLinearRgba(value: unknown): value is readonly [number, number, number, number] {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every(
      (component) => typeof component === "number" && Number.isFinite(component) && component >= 0 && component <= 1
    )
  );
}

function isCanonicalHex(value: unknown, length: number): value is string {
  return typeof value === "string" && new RegExp(`^[0-9a-f]{${length}}$`).test(value);
}

function hasCompiledAppearanceEnvelope(value: unknown): value is Readonly<Record<string, unknown>> {
  if (!isRecord(value) || !isRecord(value.normal)) return false;
  return (
    value.schemaVersion === WaterSurfaceAppearanceSchemaVersion.V1 &&
    typeof value.sourceId === "string" &&
    value.sourceId.length > 0 &&
    isCanonicalHex(value.appearanceHash, 16) &&
    value.variantKey === "surface-appearance-v1" &&
    typeof value.normal.model === "string" &&
    isRecord(value.depthTint) &&
    isRecord(value.coastalAlpha) &&
    isRecord(value.contactFoam) &&
    Array.isArray(value.diagnostics)
  );
}

function hasExternalNormalFields(normal: Readonly<Record<string, unknown>>): boolean {
  return (
    normal.model === WaterSurfaceNormalModel.ExternalTangentNormal &&
    typeof normal.textureAssetId === "string" &&
    normal.textureAssetId.length > 0 &&
    isCanonicalHex(normal.textureContentHash, 64) &&
    normal.sampling === WaterSurfaceNormalSampling.WorldXzMirroredDual &&
    isFiniteInRange(normal.tiling, 0, MAX_NORMAL_TILING) &&
    typeof normal.scrollUvPerSecond === "number" &&
    Number.isFinite(normal.scrollUvPerSecond) &&
    normal.scrollUvPerSecond >= -MAX_NORMAL_SCROLL_SPEED &&
    normal.scrollUvPerSecond <= MAX_NORMAL_SCROLL_SPEED &&
    isFiniteInRange(normal.strength, 0, MAX_NORMAL_STRENGTH) &&
    typeof normal.flipGreen === "boolean"
  );
}

function hasDepthTintFields(depthTint: unknown): depthTint is Readonly<Record<string, unknown>> {
  if (!isRecord(depthTint)) return false;
  switch (depthTint.model) {
    case WaterSurfaceDepthTintModel.BeerLambert:
      return true;
    case WaterSurfaceDepthTintModel.SceneDepthPower:
      return (
        isLinearRgba(depthTint.color) &&
        isFiniteInRange(depthTint.distance, 0, MAX_APPEARANCE_DISTANCE) &&
        isFiniteInRange(depthTint.exponent, 0, MAX_DEPTH_TINT_EXPONENT)
      );
    default:
      return false;
  }
}

function hasCoastalAlphaFields(coastalAlpha: unknown): coastalAlpha is Readonly<Record<string, unknown>> {
  if (!isRecord(coastalAlpha)) return false;
  switch (coastalAlpha.model) {
    case WaterSurfaceCoastalAlphaModel.LegacyCoverage:
      return true;
    case WaterSurfaceCoastalAlphaModel.SceneDepth:
      return isFiniteInRange(coastalAlpha.distance, 0, MAX_APPEARANCE_DISTANCE);
    default:
      return false;
  }
}

function hasContactFoamFields(contactFoam: unknown): contactFoam is Readonly<Record<string, unknown>> {
  if (!isRecord(contactFoam)) return false;
  if (contactFoam.model === WaterSurfaceContactFoamModel.None) return true;
  if (contactFoam.model !== WaterSurfaceContactFoamModel.SceneDepthVoronoi) return false;
  if (!isRecord(contactFoam.octaves)) return false;
  const count = contactFoam.octaves.count;
  const weights = contactFoam.octaves.weights;
  return (
    isFiniteInRange(contactFoam.worldScale, 0, MAX_FOAM_WORLD_SCALE) &&
    isFiniteInRange(contactFoam.timeRate, 0, MAX_FOAM_TIME_RATE) &&
    isFiniteInRange(contactFoam.opacity, 0, 1) &&
    isFiniteInRange(contactFoam.contactDistance, 0, MAX_APPEARANCE_DISTANCE) &&
    typeof count === "number" &&
    Number.isInteger(count) &&
    count >= 1 &&
    count <= 3 &&
    Array.isArray(weights) &&
    weights.length === count &&
    weights.every((weight) => typeof weight === "number" && Number.isFinite(weight) && weight >= 0) &&
    isFiniteInRange(contactFoam.lacunarity, 0, MAX_FOAM_LACUNARITY) &&
    isFiniteInClosedRange(contactFoam.suppressRefraction, 0, 1) &&
    isFiniteInClosedRange(contactFoam.smoothnessReduction, 0, 1)
  );
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
    normalTiling: 0,
    normalScrollUvPerSecond: 0,
    normalStrength: 0,
    flipGreen: false,
    depthTintModel: undefined,
    depthTintEnabled: false,
    depthTintColor: undefined,
    depthTintDistance: 0,
    depthTintExponent: 0,
    coastalAlphaModel: undefined,
    coastalAlphaEnabled: false,
    coastalAlphaDistance: 0,
    contactFoamModel: undefined,
    contactFoamEnabled: false,
    contactFoamWorldScale: 0,
    contactFoamTimeRate: 0,
    contactFoamOpacity: 0,
    contactFoamContactDistance: 0,
    contactFoamOctaveCount: 0,
    contactFoamWeights: EMPTY_CONTACT_FOAM_WEIGHTS,
    contactFoamLacunarity: 0,
    contactFoamSuppressRefraction: 0,
    contactFoamSmoothnessReduction: 0,
    ownership: undefined,
    fallbackReason: undefined,
    ...values
  });
}

function fail(
  binding: Readonly<WaterSurfaceAppearanceBinding>,
  fallbackReason: WaterSurfaceAppearanceFallbackReason
): WaterSurfaceAppearanceBindingResolution {
  const appearance = binding.appearance;
  return Object.freeze({
    readback: createReadback({
      requested: true,
      appearanceAssetId: appearance?.sourceId,
      appearanceHash: appearance?.appearanceHash,
      variantKey: appearance?.variantKey,
      normalAssetId: binding.assetId,
      normalContentHash: binding.contentHash,
      ownership: binding.ownership === "borrowed" ? "borrowed" : undefined,
      fallbackReason
    })
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
    normalTiling: 0,
    normalScrollUvPerSecond: 0,
    normalStrength: 0,
    flipGreen: false,
    depthTintModel: undefined,
    depthTintEnabled: false,
    depthTintColor: undefined,
    depthTintDistance: 0,
    depthTintExponent: 0,
    coastalAlphaModel: undefined,
    coastalAlphaEnabled: false,
    coastalAlphaDistance: 0,
    contactFoamModel: undefined,
    contactFoamEnabled: false,
    contactFoamWorldScale: 0,
    contactFoamTimeRate: 0,
    contactFoamOpacity: 0,
    contactFoamContactDistance: 0,
    contactFoamOctaveCount: 0,
    contactFoamWeights: EMPTY_CONTACT_FOAM_WEIGHTS,
    contactFoamLacunarity: 0,
    contactFoamSuppressRefraction: 0,
    contactFoamSmoothnessReduction: 0,
    ownership: undefined,
    fallbackReason: undefined
  });
}

export function writeWaterSurfaceAppearanceBindingReadback(
  target: WaterSurfaceAppearanceBindingReadback,
  source: Readonly<WaterSurfaceAppearanceBindingReadback>
): void {
  Object.assign(target as MutableWaterSurfaceAppearanceBindingReadback, source);
}

export function resolveWaterSurfaceAppearanceBinding(
  binding?: Readonly<WaterSurfaceAppearanceBinding>,
  qualitySupported = true,
  maximumContactFoamOctaves: 1 | 2 | 3 = 3
): WaterSurfaceAppearanceBindingResolution {
  if (!binding) return Object.freeze({ readback: createReadback() });
  if (!qualitySupported) return fail(binding, "surface-appearance-quality-unsupported");
  const rawAppearance: unknown = binding.appearance;
  if (!hasCompiledAppearanceEnvelope(rawAppearance)) {
    return fail(binding, "surface-appearance-compiled-data-unavailable");
  }
  const rawNormal = rawAppearance.normal as Readonly<Record<string, unknown>>;
  const appearance = binding.appearance;
  if (
    !hasDepthTintFields(rawAppearance.depthTint) ||
    !hasCoastalAlphaFields(rawAppearance.coastalAlpha) ||
    !hasContactFoamFields(rawAppearance.contactFoam)
  ) {
    return fail(binding, "surface-appearance-compiled-data-unavailable");
  }
  if (appearance.normal.model !== WaterSurfaceNormalModel.ExternalTangentNormal) {
    return fail(binding, "surface-appearance-normal-model-unsupported");
  }
  if (!hasExternalNormalFields(rawNormal)) {
    return fail(binding, "surface-appearance-compiled-data-unavailable");
  }
  if (typeof binding.assetId !== "string" || binding.assetId !== appearance.normal.textureAssetId) {
    return fail(binding, "surface-appearance-asset-id-mismatch");
  }
  if (
    typeof binding.contentHash !== "string" ||
    binding.contentHash.toLowerCase() !== appearance.normal.textureContentHash
  ) {
    return fail(binding, "surface-appearance-content-hash-mismatch");
  }
  if (binding.ownership !== "borrowed") {
    return fail(binding, "surface-appearance-ownership-invalid");
  }
  const texture = binding.texture;
  if (
    !texture ||
    texture.destroyed ||
    !Number.isFinite(texture.width) ||
    !Number.isFinite(texture.height) ||
    texture.width <= 0 ||
    texture.height <= 0
  ) {
    return fail(binding, "surface-appearance-texture-unavailable");
  }
  const depthTint = appearance.depthTint;
  const coastalAlpha = appearance.coastalAlpha;
  const contactFoam = appearance.contactFoam;
  const depthTintEnabled = depthTint.model === WaterSurfaceDepthTintModel.SceneDepthPower;
  const coastalAlphaEnabled = coastalAlpha.model === WaterSurfaceCoastalAlphaModel.SceneDepth;
  const contactFoamEnabled = contactFoam.model === WaterSurfaceContactFoamModel.SceneDepthVoronoi;
  const contactFoamOctaveCount = contactFoamEnabled
    ? (Math.min(contactFoam.octaves.count, maximumContactFoamOctaves) as 1 | 2 | 3)
    : 0;
  const contactFoamWeights = contactFoamEnabled
    ? Object.freeze(contactFoam.octaves.weights.slice(0, contactFoamOctaveCount))
    : EMPTY_CONTACT_FOAM_WEIGHTS;
  return Object.freeze({
    binding,
    readback: createReadback({
      requested: true,
      active: true,
      appearanceAssetId: appearance.sourceId,
      appearanceHash: appearance.appearanceHash,
      variantKey: appearance.variantKey,
      normalAssetId: appearance.normal.textureAssetId,
      normalContentHash: appearance.normal.textureContentHash,
      normalTextureWidth: texture.width,
      normalTextureHeight: texture.height,
      normalLayerCount: 2,
      normalTiling: appearance.normal.tiling,
      normalScrollUvPerSecond: appearance.normal.scrollUvPerSecond,
      normalStrength: appearance.normal.strength,
      flipGreen: appearance.normal.flipGreen,
      depthTintModel: depthTint.model,
      depthTintEnabled,
      depthTintColor: depthTintEnabled ? depthTint.color : undefined,
      depthTintDistance: depthTintEnabled ? depthTint.distance : 0,
      depthTintExponent: depthTintEnabled ? depthTint.exponent : 0,
      coastalAlphaModel: coastalAlpha.model,
      coastalAlphaEnabled,
      coastalAlphaDistance: coastalAlphaEnabled ? coastalAlpha.distance : 0,
      contactFoamModel: contactFoam.model,
      contactFoamEnabled,
      contactFoamWorldScale: contactFoamEnabled ? contactFoam.worldScale : 0,
      contactFoamTimeRate: contactFoamEnabled ? contactFoam.timeRate : 0,
      contactFoamOpacity: contactFoamEnabled ? contactFoam.opacity : 0,
      contactFoamContactDistance: contactFoamEnabled ? contactFoam.contactDistance : 0,
      contactFoamOctaveCount,
      contactFoamWeights,
      contactFoamLacunarity: contactFoamEnabled ? contactFoam.lacunarity : 0,
      contactFoamSuppressRefraction: contactFoamEnabled ? contactFoam.suppressRefraction : 0,
      contactFoamSmoothnessReduction: contactFoamEnabled ? contactFoam.smoothnessReduction : 0,
      ownership: "borrowed"
    })
  });
}
