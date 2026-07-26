/** Shared, allocation-bounded profile/refraction/reflection binding for water-surface materials. */
import type { ShaderData, Texture } from "@galacean/engine-core";
import { Matrix, Vector3, Vector4 } from "@galacean/engine-math";
import { DEFAULT_WATER_OPTICAL_PROFILE, type WaterOpticalProfile } from "./WaterOpticalProfile";
import {
  clampWaterOpticsFinite,
  sanitizeWaterOpticalProfileInto,
  type MutableResolvedWaterOpticalProfile
} from "./WaterSurfaceOpticsMath";
import {
  WATER_OPTICS_REFLECTION_SOURCE_VALUE,
  WATER_OPTICS_SHADER_PROPERTY
} from "./constants/WaterOpticsShaderConstants";
import {
  WaterOpticsDebugView,
  type ResolvedWaterOpticalProfile,
  type ResolvedWaterOpticsTier,
  type WaterOpticsTier,
  type WaterSurfaceOpticsBinding,
  type WaterSurfaceOpticsBindingReadback,
  type WaterSurfaceOpticsBindingState,
  type WaterSurfaceOpticsReflectionReadback,
  type WaterSurfaceOpticsReflectionSamplingConfig,
  type WaterSurfaceOpticsReflectionSamplingSettings
} from "./WaterSurfaceOpticsTypes";
import type { WaterReflectionBinding } from "./WaterReflectionService";

interface NullableTextureShaderData {
  setTexture(propertyName: string, value: Texture | null): void;
}

type Mutable<T> = { -readonly [Property in keyof T]: T[Property] };
type MutableReflectionReadback = Mutable<WaterSurfaceOpticsReflectionReadback>;
type MutableBindingReadback = Mutable<WaterSurfaceOpticsBindingReadback>;

const EMPTY_REFLECTION_SAMPLING_CONFIG: WaterSurfaceOpticsReflectionSamplingConfig = Object.freeze({});

export const DEFAULT_WATER_SURFACE_OPTICS_REFLECTION_SAMPLING_SETTINGS: Readonly<WaterSurfaceOpticsReflectionSamplingSettings> =
  Object.freeze({
    distortionStrength: 0.025,
    edgeFadeTexels: 8,
    minimumClipW: 0.001,
    planeDistanceFadeStart: 0.05,
    planeDistanceFadeEnd: 0.2,
    viewAngleFadeStart: 0.03,
    viewAngleFadeEnd: 0.16,
    roughnessFootprintTexels: 3,
    // The High cross filter stays opt-in until its performance gate has evidence.
    highFilterSampleCount: 1
  });

function createMutableResolvedProfile(): MutableResolvedWaterOpticalProfile {
  return {
    absorptionCoefficient: [0, 0, 0],
    scatteringColor: [0, 0, 0],
    scatteringCoefficient: 0,
    maximumViewDistance: 0,
    indexOfRefraction: 1,
    fresnelF0: 0,
    maximumSurfaceOpticalDistance: 0,
    refractionStrength: 0,
    roughness: 0,
    reflectionIntensity: 0
  };
}

function createMutableReflectionReadback(): MutableReflectionReadback {
  const defaults = DEFAULT_WATER_SURFACE_OPTICS_REFLECTION_SAMPLING_SETTINGS;
  return {
    ...defaults,
    requestedTier: "medium",
    resolvedTier: "medium",
    tierFallbackReason: undefined,
    requestedSource: "sky",
    bindingResolvedSource: "sky",
    effectiveSource: "sky",
    fallbackReason: undefined,
    probeTexture: undefined,
    planarTexture: undefined,
    planarViewProjection: undefined,
    textureWidth: 0,
    textureHeight: 0,
    filterSampleCount: 1
  };
}

function resolveTier(tier: WaterOpticsTier): ResolvedWaterOpticsTier {
  return tier === "medium" ? "medium" : "high";
}

function isFiniteMatrix(matrix: Readonly<Matrix> | undefined): boolean {
  const elements = matrix?.elements;
  if (!elements || elements.length < 16) return false;
  for (let index = 0; index < 16; index++) {
    if (!Number.isFinite(elements[index])) return false;
  }
  return true;
}

function sanitizedDebugView(debugView: number): WaterOpticsDebugView {
  return Number.isInteger(debugView) &&
    debugView >= WaterOpticsDebugView.Final &&
    debugView <= WaterOpticsDebugView.EffectiveRoughness
    ? (debugView as WaterOpticsDebugView)
    : WaterOpticsDebugView.Final;
}

function writeReflectionSamplingSettings(
  outReadback: Mutable<WaterSurfaceOpticsReflectionSamplingSettings>,
  config: WaterSurfaceOpticsReflectionSamplingConfig
): void {
  const defaults = DEFAULT_WATER_SURFACE_OPTICS_REFLECTION_SAMPLING_SETTINGS;
  const planeDistanceFadeStart = clampWaterOpticsFinite(
    config.planeDistanceFadeStart,
    defaults.planeDistanceFadeStart,
    0,
    1_000
  );
  const viewAngleFadeStart = clampWaterOpticsFinite(config.viewAngleFadeStart, defaults.viewAngleFadeStart, 0, 0.9999);
  outReadback.distortionStrength = clampWaterOpticsFinite(
    config.distortionStrength,
    defaults.distortionStrength,
    0,
    0.25
  );
  outReadback.edgeFadeTexels = clampWaterOpticsFinite(config.edgeFadeTexels, defaults.edgeFadeTexels, 1, 64);
  outReadback.minimumClipW = clampWaterOpticsFinite(config.minimumClipW, defaults.minimumClipW, 0.000001, 1);
  outReadback.planeDistanceFadeStart = planeDistanceFadeStart;
  outReadback.planeDistanceFadeEnd = clampWaterOpticsFinite(
    config.planeDistanceFadeEnd,
    defaults.planeDistanceFadeEnd,
    planeDistanceFadeStart + 0.0001,
    10_000
  );
  outReadback.viewAngleFadeStart = viewAngleFadeStart;
  outReadback.viewAngleFadeEnd = clampWaterOpticsFinite(
    config.viewAngleFadeEnd,
    defaults.viewAngleFadeEnd,
    viewAngleFadeStart + 0.0001,
    1
  );
  outReadback.roughnessFootprintTexels = clampWaterOpticsFinite(
    config.roughnessFootprintTexels,
    defaults.roughnessFootprintTexels,
    0.5,
    8
  );
  outReadback.highFilterSampleCount = config.highFilterSampleCount === 5 ? 5 : 1;
}

function writeReflectionReadback(
  outReadback: MutableReflectionReadback,
  tier: WaterOpticsTier,
  binding: Readonly<WaterReflectionBinding> | undefined,
  config: WaterSurfaceOpticsReflectionSamplingConfig
): void {
  writeReflectionSamplingSettings(outReadback, config);
  const resolvedTier = resolveTier(tier);
  const requestedSource = binding?.requestedSource ?? "sky";
  const bindingResolvedSource = binding?.resolvedSource ?? "sky";
  let effectiveSource = bindingResolvedSource;
  let fallbackReason: WaterSurfaceOpticsReflectionReadback["fallbackReason"] = binding?.fallbackReason;
  let probeTexture = binding?.probeTexture;
  let planarTexture = binding?.planarTexture;
  let planarViewProjection = binding?.planarViewProjection;
  let textureWidth = 0;
  let textureHeight = 0;

  if (bindingResolvedSource === "probe" && !probeTexture) {
    effectiveSource = "sky";
    fallbackReason = "water-optics-probe-texture-unavailable";
  } else if (bindingResolvedSource === "planar") {
    if (!planarTexture) {
      effectiveSource = "sky";
      fallbackReason = "water-optics-planar-texture-unavailable";
    } else if (
      !Number.isFinite(planarTexture.width) ||
      !Number.isFinite(planarTexture.height) ||
      planarTexture.width < 1 ||
      planarTexture.height < 1
    ) {
      effectiveSource = "sky";
      fallbackReason = "water-optics-planar-texture-size-invalid";
    } else if (!planarViewProjection) {
      effectiveSource = "sky";
      fallbackReason = "water-optics-planar-view-projection-unavailable";
    } else if (!isFiniteMatrix(planarViewProjection)) {
      effectiveSource = "sky";
      fallbackReason = "water-optics-planar-view-projection-invalid";
    } else {
      textureWidth = Math.max(1, Math.floor(planarTexture.width));
      textureHeight = Math.max(1, Math.floor(planarTexture.height));
    }
  }

  if (effectiveSource !== "probe") probeTexture = undefined;
  if (effectiveSource !== "planar") {
    planarTexture = undefined;
    planarViewProjection = undefined;
  }
  outReadback.requestedTier = tier;
  outReadback.resolvedTier = resolvedTier;
  outReadback.tierFallbackReason = tier === "experimental" ? "water-optics-experimental-resolved-high" : undefined;
  outReadback.requestedSource = requestedSource;
  outReadback.bindingResolvedSource = bindingResolvedSource;
  outReadback.effectiveSource = effectiveSource;
  outReadback.fallbackReason = fallbackReason;
  outReadback.probeTexture = probeTexture;
  outReadback.planarTexture = planarTexture;
  outReadback.planarViewProjection = planarViewProjection;
  outReadback.textureWidth = textureWidth;
  outReadback.textureHeight = textureHeight;
  outReadback.filterSampleCount =
    effectiveSource === "planar" && resolvedTier === "high" && outReadback.highFilterSampleCount === 5 ? 5 : 1;
}

function copyReflectionReadback(
  source: Readonly<WaterSurfaceOpticsReflectionReadback>,
  target: MutableBindingReadback
): void {
  target.distortionStrength = source.distortionStrength;
  target.edgeFadeTexels = source.edgeFadeTexels;
  target.minimumClipW = source.minimumClipW;
  target.planeDistanceFadeStart = source.planeDistanceFadeStart;
  target.planeDistanceFadeEnd = source.planeDistanceFadeEnd;
  target.viewAngleFadeStart = source.viewAngleFadeStart;
  target.viewAngleFadeEnd = source.viewAngleFadeEnd;
  target.roughnessFootprintTexels = source.roughnessFootprintTexels;
  target.highFilterSampleCount = source.highFilterSampleCount;
  target.requestedTier = source.requestedTier;
  target.resolvedTier = source.resolvedTier;
  target.tierFallbackReason = source.tierFallbackReason;
  target.requestedSource = source.requestedSource;
  target.bindingResolvedSource = source.bindingResolvedSource;
  target.effectiveSource = source.effectiveSource;
  target.fallbackReason = source.fallbackReason;
  target.probeTexture = source.probeTexture;
  target.planarTexture = source.planarTexture;
  target.planarViewProjection = source.planarViewProjection;
  target.textureWidth = source.textureWidth;
  target.textureHeight = source.textureHeight;
  target.filterSampleCount = source.filterSampleCount;
}

/** Allocates only reusable CPU uniform values/readbacks. It does not create a Camera, RT, or Texture. */
export function createWaterSurfaceOpticsBindingState(): WaterSurfaceOpticsBindingState {
  const opticalProfileReadback = createMutableResolvedProfile();
  sanitizeWaterOpticalProfileInto(DEFAULT_WATER_OPTICAL_PROFILE, opticalProfileReadback);
  Object.seal(opticalProfileReadback.absorptionCoefficient);
  Object.seal(opticalProfileReadback.scatteringColor);
  Object.seal(opticalProfileReadback);
  const reflectionReadback = createMutableReflectionReadback();
  Object.seal(reflectionReadback);
  const bindingReadback: MutableBindingReadback = {
    ...reflectionReadback,
    opticalProfile: opticalProfileReadback,
    refractionEnabled: true,
    debugView: WaterOpticsDebugView.Final
  };
  Object.seal(bindingReadback);
  return Object.freeze({
    opticalAbsorption: new Vector3(),
    opticalScatteringColor: new Vector3(),
    reflectionTextureSize: new Vector4(),
    reflectionSamplingParameters: new Vector4(),
    reflectionFadeParameters: new Vector4(),
    reflectionIdentityViewProjection: new Matrix(),
    opticalProfileReadback,
    reflectionReadback,
    bindingReadback
  });
}

/** Pure allocating resolver for diagnostics; hot material updates use caller-owned state instead. */
export function resolveWaterSurfaceOpticalProfile(profile: WaterOpticalProfile): Readonly<ResolvedWaterOpticalProfile> {
  const resolved = createMutableResolvedProfile();
  sanitizeWaterOpticalProfileInto(profile, resolved);
  Object.freeze(resolved.absorptionCoefficient);
  Object.freeze(resolved.scatteringColor);
  return Object.freeze(resolved);
}

/** Writes the shared Beer-Lambert/Fresnel inputs while reusing the caller-owned vectors/readback. */
export function applyWaterSurfaceOpticalProfile(
  shaderData: ShaderData,
  state: WaterSurfaceOpticsBindingState,
  profile: WaterOpticalProfile
): Readonly<ResolvedWaterOpticalProfile> {
  const resolved = state.opticalProfileReadback as MutableResolvedWaterOpticalProfile;
  sanitizeWaterOpticalProfileInto(profile, resolved);
  const absorption = resolved.absorptionCoefficient;
  const scatteringColor = resolved.scatteringColor;
  state.opticalAbsorption.set(absorption[0], absorption[1], absorption[2]);
  state.opticalScatteringColor.set(scatteringColor[0], scatteringColor[1], scatteringColor[2]);

  shaderData.setVector3(WATER_OPTICS_SHADER_PROPERTY.absorptionCoefficient, state.opticalAbsorption);
  shaderData.setVector3(WATER_OPTICS_SHADER_PROPERTY.scatteringColor, state.opticalScatteringColor);
  shaderData.setFloat(WATER_OPTICS_SHADER_PROPERTY.scatteringCoefficient, resolved.scatteringCoefficient);
  shaderData.setFloat(
    WATER_OPTICS_SHADER_PROPERTY.maximumSurfaceOpticalDistance,
    resolved.maximumSurfaceOpticalDistance
  );
  shaderData.setFloat(WATER_OPTICS_SHADER_PROPERTY.maximumViewDistance, resolved.maximumViewDistance);
  shaderData.setFloat(WATER_OPTICS_SHADER_PROPERTY.indexOfRefraction, resolved.indexOfRefraction);
  shaderData.setFloat(WATER_OPTICS_SHADER_PROPERTY.refractionStrength, resolved.refractionStrength);
  shaderData.setFloat(WATER_OPTICS_SHADER_PROPERTY.roughness, resolved.roughness);
  shaderData.setFloat(WATER_OPTICS_SHADER_PROPERTY.reflectionIntensity, resolved.reflectionIntensity);
  return resolved;
}

export function resolveWaterSurfaceOpticsReflectionSamplingSettings(
  config: WaterSurfaceOpticsReflectionSamplingConfig = EMPTY_REFLECTION_SAMPLING_CONFIG
): Readonly<WaterSurfaceOpticsReflectionSamplingSettings> {
  const readback = createMutableReflectionReadback();
  writeReflectionSamplingSettings(readback, config);
  return Object.freeze({
    distortionStrength: readback.distortionStrength,
    edgeFadeTexels: readback.edgeFadeTexels,
    minimumClipW: readback.minimumClipW,
    planeDistanceFadeStart: readback.planeDistanceFadeStart,
    planeDistanceFadeEnd: readback.planeDistanceFadeEnd,
    viewAngleFadeStart: readback.viewAngleFadeStart,
    viewAngleFadeEnd: readback.viewAngleFadeEnd,
    roughnessFootprintTexels: readback.roughnessFootprintTexels,
    highFilterSampleCount: readback.highFilterSampleCount
  });
}

/** Sanitizes sampling settings into caller-owned storage without allocating. */
export function writeWaterSurfaceOpticsReflectionSamplingSettings(
  config: WaterSurfaceOpticsReflectionSamplingConfig,
  outSettings: WaterSurfaceOpticsReflectionSamplingSettings
): Readonly<WaterSurfaceOpticsReflectionSamplingSettings> {
  writeReflectionSamplingSettings(outSettings as Mutable<WaterSurfaceOpticsReflectionSamplingSettings>, config);
  return outSettings;
}

/** Pure allocating resource/tier resolver for tests and diagnostics. */
export function resolveWaterSurfaceOpticsReflection(
  tier: WaterOpticsTier,
  binding?: Readonly<WaterReflectionBinding>,
  config: WaterSurfaceOpticsReflectionSamplingConfig = EMPTY_REFLECTION_SAMPLING_CONFIG
): Readonly<WaterSurfaceOpticsReflectionReadback> {
  const readback = createMutableReflectionReadback();
  writeReflectionReadback(readback, tier, binding, config);
  return Object.freeze(readback);
}

/** Always performs all writes while reusing the state readback, including clearing stale textures and identity VP. */
export function applyWaterSurfaceReflectionBinding(
  shaderData: ShaderData,
  state: WaterSurfaceOpticsBindingState,
  tier: WaterOpticsTier,
  binding?: Readonly<WaterReflectionBinding>,
  config: WaterSurfaceOpticsReflectionSamplingConfig = EMPTY_REFLECTION_SAMPLING_CONFIG
): Readonly<WaterSurfaceOpticsReflectionReadback> {
  const readback = state.reflectionReadback as MutableReflectionReadback;
  writeReflectionReadback(readback, tier, binding, config);
  const nullableTextureData = shaderData as unknown as NullableTextureShaderData;

  shaderData.setFloat(
    WATER_OPTICS_SHADER_PROPERTY.reflectionSource,
    WATER_OPTICS_REFLECTION_SOURCE_VALUE[readback.effectiveSource]
  );
  nullableTextureData.setTexture(WATER_OPTICS_SHADER_PROPERTY.reflectionCubeTexture, readback.probeTexture ?? null);
  nullableTextureData.setTexture(WATER_OPTICS_SHADER_PROPERTY.planarReflectionTexture, readback.planarTexture ?? null);
  shaderData.setMatrix(
    WATER_OPTICS_SHADER_PROPERTY.planarReflectionViewProjection,
    readback.planarViewProjection ?? state.reflectionIdentityViewProjection
  );

  const inverseWidth = readback.textureWidth > 0 ? 1 / readback.textureWidth : 0;
  const inverseHeight = readback.textureHeight > 0 ? 1 / readback.textureHeight : 0;
  state.reflectionTextureSize.set(readback.textureWidth, readback.textureHeight, inverseWidth, inverseHeight);
  state.reflectionSamplingParameters.set(
    readback.distortionStrength,
    readback.edgeFadeTexels,
    readback.minimumClipW,
    readback.filterSampleCount
  );
  state.reflectionFadeParameters.set(
    readback.planeDistanceFadeStart,
    readback.planeDistanceFadeEnd,
    readback.viewAngleFadeStart,
    readback.viewAngleFadeEnd
  );
  shaderData.setVector4(WATER_OPTICS_SHADER_PROPERTY.planarReflectionTextureSize, state.reflectionTextureSize);
  shaderData.setVector4(WATER_OPTICS_SHADER_PROPERTY.planarReflectionSampling, state.reflectionSamplingParameters);
  shaderData.setVector4(WATER_OPTICS_SHADER_PROPERTY.planarReflectionFade, state.reflectionFadeParameters);
  shaderData.setFloat(
    WATER_OPTICS_SHADER_PROPERTY.planarReflectionRoughnessFootprint,
    readback.roughnessFootprintTexels
  );
  return readback;
}

/** Applies every field on every call while reusing the state aggregate readback and nested profile arrays. */
export function applyWaterSurfaceOpticsBinding(
  shaderData: ShaderData,
  state: WaterSurfaceOpticsBindingState,
  binding: Readonly<WaterSurfaceOpticsBinding>
): Readonly<WaterSurfaceOpticsBindingReadback> {
  const opticalProfile = applyWaterSurfaceOpticalProfile(shaderData, state, binding.opticalProfile);
  const debugView = sanitizedDebugView(binding.debugView);
  const refractionEnabled = binding.refractionEnabled === true;
  shaderData.setFloat(WATER_OPTICS_SHADER_PROPERTY.refractionEnabled, refractionEnabled ? 1 : 0);
  shaderData.setFloat(WATER_OPTICS_SHADER_PROPERTY.debugMode, debugView);
  const reflection = applyWaterSurfaceReflectionBinding(
    shaderData,
    state,
    binding.tier,
    binding.reflection,
    binding.reflectionSampling
  );
  const readback = state.bindingReadback as MutableBindingReadback;
  copyReflectionReadback(reflection, readback);
  readback.opticalProfile = opticalProfile;
  readback.refractionEnabled = refractionEnabled;
  readback.debugView = debugView;
  return readback;
}
