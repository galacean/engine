/** Shared, allocation-bounded profile/refraction/reflection binding for water-surface materials. */
import type { ShaderData, Texture } from "@galacean/engine-core";
import { Vector3, Vector4 } from "@galacean/engine-math";
import {
  DEFAULT_WATER_REFLECTION_SAMPLING_SETTINGS,
  writeWaterReflectionSamplingSettings,
  type WaterReflectionSamplingConfig
} from "../../authoring/optics/WaterReflectionSampling";
import {
  WATER_OPTICS_REFLECTION_SOURCE_VALUE,
  WATER_OPTICS_SHADER_PROPERTY
} from "./constants/WaterOpticsShaderConstants";
import { isValidWaterEnvironmentReflectionProjection } from "./WaterEnvironmentReflectionTypes";
import { DEFAULT_WATER_OPTICAL_PROFILE, type WaterOpticalProfile } from "./WaterOpticalProfile";
import { waterReflectionSourceToPolicyMode } from "./WaterReflectionPolicy";
import type { WaterReflectionBinding } from "./WaterReflectionService";
import {
  resolveWaterReflectionIntensity,
  resolveWaterRefractionStrength,
  resolveWaterRoughness,
  sanitizeWaterOpticalProfileInto,
  type MutableResolvedWaterOpticalProfile
} from "./WaterSurfaceOpticsMath";
import {
  type ResolvedWaterOpticalProfile,
  type ResolvedWaterOpticsTier,
  type WaterOpticsTier,
  type WaterSurfaceOpticsBinding,
  type WaterSurfaceOpticsBindingReadback,
  type WaterSurfaceOpticsBindingState,
  type WaterSurfaceOpticsReflectionReadback
} from "./WaterSurfaceOpticsTypes";

interface NullableTextureShaderData {
  setTexture(propertyName: string, value: Texture | null): void;
}

interface WaterOpticsMacroShaderData {
  enableMacro(name: string): void;
  disableMacro(name: string): void;
}

type Mutable<T> = { -readonly [Property in keyof T]: T[Property] };
type MutableReflectionReadback = Mutable<WaterSurfaceOpticsReflectionReadback>;
type MutableBindingReadback = Mutable<WaterSurfaceOpticsBindingReadback>;
type MutableVector3Tuple = [x: number, y: number, z: number];

const EMPTY_REFLECTION_SAMPLING_CONFIG: WaterReflectionSamplingConfig = Object.freeze({});
const LOCAL_ENVIRONMENT_REFLECTION_MACRO = "MATERIAL_WATER_LOCAL_ENVIRONMENT_REFLECTION";

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
  const defaults = DEFAULT_WATER_REFLECTION_SAMPLING_SETTINGS;
  return {
    ...defaults,
    requestedTier: "medium",
    resolvedTier: "medium",
    tierFallbackReason: undefined,
    requestedSource: "sky",
    bindingResolvedSource: "sky",
    effectiveSource: "sky",
    requestedMode: "analytic",
    bindingResolvedMode: "analytic",
    effectiveMode: "analytic",
    fallbackReason: undefined,
    composition: "analytic",
    probeTexture: undefined,
    secondaryProbeTexture: undefined,
    localProbeTexture: undefined,
    textureWidth: 0,
    textureHeight: 0,
    filterSampleCount: 1,
    environmentProviderId: undefined,
    environmentRevision: 0,
    environmentOwnership: "unavailable",
    environmentRotationDegrees: 0,
    environmentExposure: 0,
    environmentIntensity: 0,
    environmentColorSpace: "linear",
    environmentHDR: false,
    environmentMaximumMipLevel: 0,
    secondaryEnvironmentAvailable: false,
    secondaryEnvironmentWeight: 0,
    secondaryEnvironmentMaximumMipLevel: 0,
    secondaryEnvironmentRotationDegrees: 0,
    secondaryEnvironmentExposure: 0,
    secondaryEnvironmentIntensity: 0,
    secondaryEnvironmentColorSpace: "linear",
    secondaryEnvironmentProjectionMode: "infinite",
    secondaryEnvironmentProbePosition: [0, 0, 0],
    secondaryEnvironmentBoxMinimum: [0, 0, 0],
    secondaryEnvironmentBoxMaximum: [0, 0, 0],
    localEnvironmentProviderId: undefined,
    localEnvironmentRevision: 0,
    localEnvironmentAvailable: false,
    localEnvironmentMaximumMipLevel: 0,
    localEnvironmentRotationDegrees: 0,
    localEnvironmentExposure: 0,
    localEnvironmentIntensity: 0,
    localEnvironmentColorSpace: "linear",
    localEnvironmentProjectionMode: "infinite",
    localEnvironmentProbePosition: [0, 0, 0],
    localEnvironmentBoxMinimum: [0, 0, 0],
    localEnvironmentBoxMaximum: [0, 0, 0],
    environmentProjectionMode: "infinite",
    environmentProbePosition: [0, 0, 0],
    environmentBoxMinimum: [0, 0, 0],
    environmentBoxMaximum: [0, 0, 0]
  };
}

function writeVector3Tuple(target: readonly number[], source: readonly number[] | undefined): void {
  const mutable = target as MutableVector3Tuple;
  mutable[0] = source?.[0] ?? 0;
  mutable[1] = source?.[1] ?? 0;
  mutable[2] = source?.[2] ?? 0;
}

function resolveTier(tier: WaterOpticsTier): ResolvedWaterOpticsTier {
  return tier === "medium" ? "medium" : "high";
}

function writeReflectionReadback(
  outReadback: MutableReflectionReadback,
  tier: WaterOpticsTier,
  binding: Readonly<WaterReflectionBinding> | undefined,
  config: WaterReflectionSamplingConfig
): void {
  writeWaterReflectionSamplingSettings(config, outReadback);
  const resolvedTier = resolveTier(tier);
  const requestedSource = binding?.requestedSource ?? "sky";
  const bindingResolvedSource = binding?.resolvedSource ?? "sky";
  const requestedMode = binding?.requestedMode ?? waterReflectionSourceToPolicyMode(requestedSource);
  const bindingResolvedMode = binding?.resolvedMode ?? waterReflectionSourceToPolicyMode(bindingResolvedSource);
  let effectiveSource = bindingResolvedSource;
  let effectiveMode = bindingResolvedMode;
  let fallbackReason: WaterSurfaceOpticsReflectionReadback["fallbackReason"] = binding?.fallbackReason;
  const environmentFrame = binding?.environment;
  const primary = environmentFrame?.primary;
  const secondary = environmentFrame?.secondary;
  const localEnvironmentFrame = binding?.localEnvironment;
  const localPrimary = localEnvironmentFrame?.primary;
  let probeTexture = primary?.texture ?? (localEnvironmentFrame ? undefined : binding?.probeTexture);
  let secondaryProbeTexture = secondary?.texture;
  let localProbeTexture = localPrimary?.texture;
  const validLobe = (lobe: typeof primary): boolean =>
    !!lobe &&
    lobe.ownership === "borrowed" &&
    Number.isFinite(lobe.rotationDegrees) &&
    Number.isFinite(lobe.exposure) &&
    lobe.exposure >= 0 &&
    Number.isFinite(lobe.intensity) &&
    lobe.intensity >= 0 &&
    (lobe.colorSpace === "linear" || lobe.colorSpace === "srgb") &&
    typeof lobe.hdr === "boolean" &&
    Number.isInteger(lobe.maximumMipLevel) &&
    lobe.maximumMipLevel >= 0 &&
    (lobe.projection === undefined || isValidWaterEnvironmentReflectionProjection(lobe.projection));
  const secondaryWeight = environmentFrame?.secondaryWeight ?? 0;
  const environmentValid =
    !!probeTexture &&
    (!environmentFrame || environmentFrame.role === "distant-environment") &&
    (!primary || (primary.texture === probeTexture && validLobe(primary))) &&
    (!secondary || validLobe(secondary)) &&
    Number.isFinite(secondaryWeight) &&
    secondaryWeight >= 0 &&
    secondaryWeight <= 1 &&
    (!!secondary || secondaryWeight === 0);
  const localEnvironmentValid =
    !!localProbeTexture &&
    localEnvironmentFrame?.role === "local-probe" &&
    localEnvironmentFrame.secondary === undefined &&
    localEnvironmentFrame.secondaryWeight === 0 &&
    validLobe(localPrimary) &&
    localPrimary?.projection?.mode === "box";
  const anyEnvironmentValid = environmentValid || localEnvironmentValid;

  if ((bindingResolvedSource === "probe" || binding?.composition === "ssr-over-environment") && !anyEnvironmentValid) {
    if (bindingResolvedSource === "probe") {
      effectiveSource = "sky";
      effectiveMode = "analytic";
      fallbackReason = probeTexture
        ? "water-optics-environment-metadata-invalid"
        : "water-optics-probe-texture-unavailable";
    }
    probeTexture = undefined;
    secondaryProbeTexture = undefined;
    localProbeTexture = undefined;
  }
  if (!environmentValid) {
    probeTexture = undefined;
    secondaryProbeTexture = undefined;
  }
  if (!localEnvironmentValid) {
    localProbeTexture = undefined;
  }

  const environmentAvailable = environmentValid && probeTexture !== undefined;
  const localEnvironmentAvailable = localEnvironmentValid && localProbeTexture !== undefined;
  const reflectionEnvironmentAvailable = environmentAvailable || localEnvironmentAvailable;
  const composition =
    effectiveSource === "ssr"
      ? "ssr-over-environment"
      : reflectionEnvironmentAvailable && effectiveSource === "probe"
        ? "environment"
        : "analytic";
  if (!environmentAvailable) {
    probeTexture = undefined;
    secondaryProbeTexture = undefined;
  }
  outReadback.requestedTier = tier;
  outReadback.resolvedTier = resolvedTier;
  outReadback.tierFallbackReason = tier === "experimental" ? "water-optics-experimental-resolved-high" : undefined;
  outReadback.requestedSource = requestedSource;
  outReadback.bindingResolvedSource = bindingResolvedSource;
  outReadback.effectiveSource = effectiveSource;
  outReadback.requestedMode = requestedMode;
  outReadback.bindingResolvedMode = bindingResolvedMode;
  outReadback.effectiveMode = effectiveMode;
  outReadback.fallbackReason = fallbackReason;
  outReadback.composition = composition;
  outReadback.probeTexture = probeTexture;
  outReadback.secondaryProbeTexture = secondaryProbeTexture;
  outReadback.localProbeTexture = localProbeTexture;
  outReadback.textureWidth = 0;
  outReadback.textureHeight = 0;
  outReadback.filterSampleCount = 1;
  outReadback.environmentProviderId = environmentAvailable ? environmentFrame?.providerId : undefined;
  outReadback.environmentRevision = environmentAvailable ? (environmentFrame?.revision ?? 0) : 0;
  outReadback.environmentOwnership = environmentAvailable ? "borrowed" : "unavailable";
  outReadback.environmentRotationDegrees = environmentAvailable ? (primary?.rotationDegrees ?? 0) : 0;
  outReadback.environmentExposure = environmentAvailable ? (primary?.exposure ?? 1) : 0;
  outReadback.environmentIntensity = environmentAvailable ? (primary?.intensity ?? 1) : 0;
  outReadback.environmentColorSpace = primary?.colorSpace ?? "linear";
  outReadback.environmentHDR = environmentAvailable ? (primary?.hdr ?? false) : false;
  outReadback.environmentMaximumMipLevel = environmentAvailable ? (primary?.maximumMipLevel ?? 0) : 0;
  outReadback.secondaryEnvironmentAvailable = environmentAvailable && secondary !== undefined;
  outReadback.secondaryEnvironmentWeight = secondary ? secondaryWeight : 0;
  outReadback.secondaryEnvironmentMaximumMipLevel = secondary?.maximumMipLevel ?? 0;
  outReadback.secondaryEnvironmentRotationDegrees = secondary?.rotationDegrees ?? 0;
  outReadback.secondaryEnvironmentExposure = secondary?.exposure ?? 0;
  outReadback.secondaryEnvironmentIntensity = secondary?.intensity ?? 0;
  outReadback.secondaryEnvironmentColorSpace = secondary?.colorSpace ?? "linear";
  const projection = environmentAvailable ? primary?.projection : undefined;
  outReadback.environmentProjectionMode = projection?.mode ?? "infinite";
  writeVector3Tuple(outReadback.environmentProbePosition, projection?.probePosition);
  writeVector3Tuple(outReadback.environmentBoxMinimum, projection?.boxMinimum);
  writeVector3Tuple(outReadback.environmentBoxMaximum, projection?.boxMaximum);
  const secondaryProjection = environmentAvailable ? secondary?.projection : undefined;
  outReadback.secondaryEnvironmentProjectionMode = secondaryProjection?.mode ?? "infinite";
  writeVector3Tuple(outReadback.secondaryEnvironmentProbePosition, secondaryProjection?.probePosition);
  writeVector3Tuple(outReadback.secondaryEnvironmentBoxMinimum, secondaryProjection?.boxMinimum);
  writeVector3Tuple(outReadback.secondaryEnvironmentBoxMaximum, secondaryProjection?.boxMaximum);
  outReadback.localEnvironmentProviderId = localEnvironmentAvailable ? localEnvironmentFrame?.providerId : undefined;
  outReadback.localEnvironmentRevision = localEnvironmentAvailable ? (localEnvironmentFrame?.revision ?? 0) : 0;
  outReadback.localEnvironmentAvailable = localEnvironmentAvailable;
  outReadback.localEnvironmentMaximumMipLevel = localEnvironmentAvailable ? (localPrimary?.maximumMipLevel ?? 0) : 0;
  outReadback.localEnvironmentRotationDegrees = localEnvironmentAvailable ? (localPrimary?.rotationDegrees ?? 0) : 0;
  outReadback.localEnvironmentExposure = localEnvironmentAvailable ? (localPrimary?.exposure ?? 0) : 0;
  outReadback.localEnvironmentIntensity = localEnvironmentAvailable ? (localPrimary?.intensity ?? 0) : 0;
  outReadback.localEnvironmentColorSpace = localPrimary?.colorSpace ?? "linear";
  const localProjection = localEnvironmentAvailable ? localPrimary?.projection : undefined;
  outReadback.localEnvironmentProjectionMode = localProjection?.mode ?? "infinite";
  writeVector3Tuple(outReadback.localEnvironmentProbePosition, localProjection?.probePosition);
  writeVector3Tuple(outReadback.localEnvironmentBoxMinimum, localProjection?.boxMinimum);
  writeVector3Tuple(outReadback.localEnvironmentBoxMaximum, localProjection?.boxMaximum);
}

function copyReflectionReadback(
  source: Readonly<WaterSurfaceOpticsReflectionReadback>,
  target: MutableBindingReadback
): void {
  target.environmentFallbackIntensity = source.environmentFallbackIntensity;
  target.screenSpaceCompositeIntensity = source.screenSpaceCompositeIntensity;
  target.distortionStrength = source.distortionStrength;
  target.maximumDistortionPixels = source.maximumDistortionPixels;
  target.edgeFadeTexels = source.edgeFadeTexels;
  target.minimumClipW = source.minimumClipW;
  target.roughnessFootprintTexels = source.roughnessFootprintTexels;
  target.highFilterSampleCount = source.highFilterSampleCount;
  target.requestedTier = source.requestedTier;
  target.resolvedTier = source.resolvedTier;
  target.tierFallbackReason = source.tierFallbackReason;
  target.requestedSource = source.requestedSource;
  target.bindingResolvedSource = source.bindingResolvedSource;
  target.effectiveSource = source.effectiveSource;
  target.requestedMode = source.requestedMode;
  target.bindingResolvedMode = source.bindingResolvedMode;
  target.effectiveMode = source.effectiveMode;
  target.fallbackReason = source.fallbackReason;
  target.composition = source.composition;
  target.probeTexture = source.probeTexture;
  target.secondaryProbeTexture = source.secondaryProbeTexture;
  target.localProbeTexture = source.localProbeTexture;
  target.textureWidth = source.textureWidth;
  target.textureHeight = source.textureHeight;
  target.filterSampleCount = source.filterSampleCount;
  target.environmentProviderId = source.environmentProviderId;
  target.environmentRevision = source.environmentRevision;
  target.environmentOwnership = source.environmentOwnership;
  target.environmentRotationDegrees = source.environmentRotationDegrees;
  target.environmentExposure = source.environmentExposure;
  target.environmentIntensity = source.environmentIntensity;
  target.environmentColorSpace = source.environmentColorSpace;
  target.environmentHDR = source.environmentHDR;
  target.environmentMaximumMipLevel = source.environmentMaximumMipLevel;
  target.secondaryEnvironmentAvailable = source.secondaryEnvironmentAvailable;
  target.secondaryEnvironmentWeight = source.secondaryEnvironmentWeight;
  target.secondaryEnvironmentMaximumMipLevel = source.secondaryEnvironmentMaximumMipLevel;
  target.secondaryEnvironmentRotationDegrees = source.secondaryEnvironmentRotationDegrees;
  target.secondaryEnvironmentExposure = source.secondaryEnvironmentExposure;
  target.secondaryEnvironmentIntensity = source.secondaryEnvironmentIntensity;
  target.secondaryEnvironmentColorSpace = source.secondaryEnvironmentColorSpace;
  target.environmentProjectionMode = source.environmentProjectionMode;
  writeVector3Tuple(target.environmentProbePosition, source.environmentProbePosition);
  writeVector3Tuple(target.environmentBoxMinimum, source.environmentBoxMinimum);
  writeVector3Tuple(target.environmentBoxMaximum, source.environmentBoxMaximum);
  target.secondaryEnvironmentProjectionMode = source.secondaryEnvironmentProjectionMode;
  writeVector3Tuple(target.secondaryEnvironmentProbePosition, source.secondaryEnvironmentProbePosition);
  writeVector3Tuple(target.secondaryEnvironmentBoxMinimum, source.secondaryEnvironmentBoxMinimum);
  writeVector3Tuple(target.secondaryEnvironmentBoxMaximum, source.secondaryEnvironmentBoxMaximum);
  target.localEnvironmentProviderId = source.localEnvironmentProviderId;
  target.localEnvironmentRevision = source.localEnvironmentRevision;
  target.localEnvironmentAvailable = source.localEnvironmentAvailable;
  target.localEnvironmentMaximumMipLevel = source.localEnvironmentMaximumMipLevel;
  target.localEnvironmentRotationDegrees = source.localEnvironmentRotationDegrees;
  target.localEnvironmentExposure = source.localEnvironmentExposure;
  target.localEnvironmentIntensity = source.localEnvironmentIntensity;
  target.localEnvironmentColorSpace = source.localEnvironmentColorSpace;
  target.localEnvironmentProjectionMode = source.localEnvironmentProjectionMode;
  writeVector3Tuple(target.localEnvironmentProbePosition, source.localEnvironmentProbePosition);
  writeVector3Tuple(target.localEnvironmentBoxMinimum, source.localEnvironmentBoxMinimum);
  writeVector3Tuple(target.localEnvironmentBoxMaximum, source.localEnvironmentBoxMaximum);
}

/** Allocates only reusable CPU uniform values/readbacks. It does not create a Camera, RT, or Texture. */
export function createWaterSurfaceOpticsBindingState(): WaterSurfaceOpticsBindingState {
  const opticalProfileReadback = createMutableResolvedProfile();
  sanitizeWaterOpticalProfileInto(DEFAULT_WATER_OPTICAL_PROFILE, opticalProfileReadback);
  Object.seal(opticalProfileReadback.absorptionCoefficient);
  Object.seal(opticalProfileReadback.scatteringColor);
  Object.seal(opticalProfileReadback);
  const reflectionReadback = createMutableReflectionReadback();
  Object.seal(reflectionReadback.environmentProbePosition);
  Object.seal(reflectionReadback.environmentBoxMinimum);
  Object.seal(reflectionReadback.environmentBoxMaximum);
  Object.seal(reflectionReadback.secondaryEnvironmentProbePosition);
  Object.seal(reflectionReadback.secondaryEnvironmentBoxMinimum);
  Object.seal(reflectionReadback.secondaryEnvironmentBoxMaximum);
  Object.seal(reflectionReadback.localEnvironmentProbePosition);
  Object.seal(reflectionReadback.localEnvironmentBoxMinimum);
  Object.seal(reflectionReadback.localEnvironmentBoxMaximum);
  Object.seal(reflectionReadback);
  const bindingReadback: MutableBindingReadback = {
    ...reflectionReadback,
    opticalProfile: opticalProfileReadback,
    refractionEnabled: true
  };
  Object.seal(bindingReadback);
  return Object.freeze({
    opticalAbsorption: new Vector3(),
    opticalScatteringColor: new Vector3(),
    environmentReflectionParameters: new Vector4(1, 0, 0, 0),
    secondaryEnvironmentReflectionParameters: new Vector4(1, 0, 0, 0),
    environmentReflectionProbePosition: new Vector4(),
    environmentReflectionBoxMinimum: new Vector4(),
    environmentReflectionBoxMaximum: new Vector4(),
    secondaryEnvironmentReflectionProbePosition: new Vector4(),
    secondaryEnvironmentReflectionBoxMinimum: new Vector4(),
    secondaryEnvironmentReflectionBoxMaximum: new Vector4(),
    localEnvironmentReflectionParameters: new Vector4(1, 0, 0, 0),
    localEnvironmentReflectionProbePosition: new Vector4(),
    localEnvironmentReflectionBoxMinimum: new Vector4(),
    localEnvironmentReflectionBoxMaximum: new Vector4(),
    opticalProfileReadback,
    reflectionReadback,
    bindingReadback
  });
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
  shaderData.setFloat(WATER_OPTICS_SHADER_PROPERTY.fresnelF0, resolved.fresnelF0);
  shaderData.setFloat(WATER_OPTICS_SHADER_PROPERTY.refractionStrength, resolved.refractionStrength);
  shaderData.setFloat(WATER_OPTICS_SHADER_PROPERTY.roughness, resolved.roughness);
  shaderData.setFloat(WATER_OPTICS_SHADER_PROPERTY.reflectionIntensity, resolved.reflectionIntensity);
  return resolved;
}

/**
 * Hot-path update for the three Look slider values. Structural Look data,
 * textures, reflection bindings, macros, and the remaining optical uniforms
 * are intentionally left untouched.
 */
export function applyWaterSurfaceTransientOpticalProfile(
  shaderData: ShaderData,
  state: WaterSurfaceOpticsBindingState,
  profile: WaterOpticalProfile
): Readonly<ResolvedWaterOpticalProfile> {
  const resolved = state.opticalProfileReadback as MutableResolvedWaterOpticalProfile;
  const refractionStrength = resolveWaterRefractionStrength(profile.refractionStrength);
  const roughness = resolveWaterRoughness(profile.roughness);
  const reflectionIntensity = resolveWaterReflectionIntensity(profile.reflectionIntensity);
  if (resolved.refractionStrength !== refractionStrength) {
    resolved.refractionStrength = refractionStrength;
    shaderData.setFloat(WATER_OPTICS_SHADER_PROPERTY.refractionStrength, refractionStrength);
  }
  if (resolved.roughness !== roughness) {
    resolved.roughness = roughness;
    shaderData.setFloat(WATER_OPTICS_SHADER_PROPERTY.roughness, roughness);
  }
  if (resolved.reflectionIntensity !== reflectionIntensity) {
    resolved.reflectionIntensity = reflectionIntensity;
    shaderData.setFloat(WATER_OPTICS_SHADER_PROPERTY.reflectionIntensity, reflectionIntensity);
  }
  (state.bindingReadback as MutableBindingReadback).opticalProfile = resolved;
  return resolved;
}

/** Always performs all writes while reusing the state readback, including clearing stale textures and identity VP. */
export function applyWaterSurfaceReflectionBinding(
  shaderData: ShaderData,
  state: WaterSurfaceOpticsBindingState,
  tier: WaterOpticsTier,
  binding?: Readonly<WaterReflectionBinding>,
  config: WaterReflectionSamplingConfig = EMPTY_REFLECTION_SAMPLING_CONFIG
): Readonly<WaterSurfaceOpticsReflectionReadback> {
  const readback = state.reflectionReadback as MutableReflectionReadback;
  writeReflectionReadback(readback, tier, binding, config);
  const nullableTextureData = shaderData as unknown as NullableTextureShaderData;
  const macroShaderData = shaderData as unknown as Partial<WaterOpticsMacroShaderData>;
  if (readback.localEnvironmentAvailable) {
    macroShaderData.enableMacro?.(LOCAL_ENVIRONMENT_REFLECTION_MACRO);
  } else {
    macroShaderData.disableMacro?.(LOCAL_ENVIRONMENT_REFLECTION_MACRO);
  }

  shaderData.setFloat(
    WATER_OPTICS_SHADER_PROPERTY.reflectionSource,
    WATER_OPTICS_REFLECTION_SOURCE_VALUE[readback.effectiveSource]
  );
  nullableTextureData.setTexture(WATER_OPTICS_SHADER_PROPERTY.reflectionCubeTexture, readback.probeTexture ?? null);
  nullableTextureData.setTexture(
    WATER_OPTICS_SHADER_PROPERTY.secondaryReflectionCubeTexture,
    readback.secondaryProbeTexture ?? null
  );
  nullableTextureData.setTexture(
    WATER_OPTICS_SHADER_PROPERTY.localReflectionCubeTexture,
    readback.localProbeTexture ?? null
  );
  shaderData.setFloat(
    WATER_OPTICS_SHADER_PROPERTY.environmentReflectionAvailable,
    readback.environmentOwnership === "borrowed" ? 1 : 0
  );
  shaderData.setFloat(
    WATER_OPTICS_SHADER_PROPERTY.localEnvironmentReflectionAvailable,
    readback.localEnvironmentAvailable ? 1 : 0
  );
  shaderData.setFloat(WATER_OPTICS_SHADER_PROPERTY.environmentFallbackIntensity, readback.environmentFallbackIntensity);
  shaderData.setFloat(WATER_OPTICS_SHADER_PROPERTY.environmentReflectionBlend, readback.secondaryEnvironmentWeight);
  const inverseRotationRadians = (-readback.environmentRotationDegrees * Math.PI) / 180;
  state.environmentReflectionParameters.set(
    Math.cos(inverseRotationRadians),
    Math.sin(inverseRotationRadians),
    readback.environmentExposure * readback.environmentIntensity,
    readback.environmentColorSpace === "srgb" ? 1 : 0
  );
  shaderData.setVector4(
    WATER_OPTICS_SHADER_PROPERTY.environmentReflectionParameters,
    state.environmentReflectionParameters
  );
  shaderData.setFloat(
    WATER_OPTICS_SHADER_PROPERTY.environmentReflectionMaximumMip,
    readback.environmentMaximumMipLevel
  );
  const secondaryInverseRotationRadians = (-readback.secondaryEnvironmentRotationDegrees * Math.PI) / 180;
  state.secondaryEnvironmentReflectionParameters.set(
    Math.cos(secondaryInverseRotationRadians),
    Math.sin(secondaryInverseRotationRadians),
    readback.secondaryEnvironmentExposure * readback.secondaryEnvironmentIntensity,
    readback.secondaryEnvironmentColorSpace === "srgb" ? 1 : 0
  );
  shaderData.setVector4(
    WATER_OPTICS_SHADER_PROPERTY.secondaryEnvironmentReflectionParameters,
    state.secondaryEnvironmentReflectionParameters
  );
  shaderData.setFloat(
    WATER_OPTICS_SHADER_PROPERTY.secondaryEnvironmentReflectionMaximumMip,
    readback.secondaryEnvironmentMaximumMipLevel
  );
  const probePosition = readback.environmentProbePosition;
  const boxMinimum = readback.environmentBoxMinimum;
  const boxMaximum = readback.environmentBoxMaximum;
  state.environmentReflectionProbePosition.set(
    probePosition[0],
    probePosition[1],
    probePosition[2],
    readback.environmentProjectionMode === "box" ? 1 : 0
  );
  state.environmentReflectionBoxMinimum.set(boxMinimum[0], boxMinimum[1], boxMinimum[2], 0);
  state.environmentReflectionBoxMaximum.set(boxMaximum[0], boxMaximum[1], boxMaximum[2], 0);
  shaderData.setVector4(
    WATER_OPTICS_SHADER_PROPERTY.environmentReflectionProbePosition,
    state.environmentReflectionProbePosition
  );
  const secondaryProbePosition = readback.secondaryEnvironmentProbePosition;
  const secondaryBoxMinimum = readback.secondaryEnvironmentBoxMinimum;
  const secondaryBoxMaximum = readback.secondaryEnvironmentBoxMaximum;
  state.secondaryEnvironmentReflectionProbePosition.set(
    secondaryProbePosition[0],
    secondaryProbePosition[1],
    secondaryProbePosition[2],
    readback.secondaryEnvironmentProjectionMode === "box" ? 1 : 0
  );
  state.secondaryEnvironmentReflectionBoxMinimum.set(
    secondaryBoxMinimum[0],
    secondaryBoxMinimum[1],
    secondaryBoxMinimum[2],
    0
  );
  state.secondaryEnvironmentReflectionBoxMaximum.set(
    secondaryBoxMaximum[0],
    secondaryBoxMaximum[1],
    secondaryBoxMaximum[2],
    0
  );
  shaderData.setVector4(
    WATER_OPTICS_SHADER_PROPERTY.secondaryEnvironmentReflectionProbePosition,
    state.secondaryEnvironmentReflectionProbePosition
  );
  shaderData.setVector4(
    WATER_OPTICS_SHADER_PROPERTY.secondaryEnvironmentReflectionBoxMinimum,
    state.secondaryEnvironmentReflectionBoxMinimum
  );
  shaderData.setVector4(
    WATER_OPTICS_SHADER_PROPERTY.secondaryEnvironmentReflectionBoxMaximum,
    state.secondaryEnvironmentReflectionBoxMaximum
  );
  shaderData.setVector4(
    WATER_OPTICS_SHADER_PROPERTY.environmentReflectionBoxMinimum,
    state.environmentReflectionBoxMinimum
  );
  shaderData.setVector4(
    WATER_OPTICS_SHADER_PROPERTY.environmentReflectionBoxMaximum,
    state.environmentReflectionBoxMaximum
  );
  const localInverseRotationRadians = (-readback.localEnvironmentRotationDegrees * Math.PI) / 180;
  state.localEnvironmentReflectionParameters.set(
    Math.cos(localInverseRotationRadians),
    Math.sin(localInverseRotationRadians),
    readback.localEnvironmentExposure * readback.localEnvironmentIntensity,
    readback.localEnvironmentColorSpace === "srgb" ? 1 : 0
  );
  const localProbePosition = readback.localEnvironmentProbePosition;
  const localBoxMinimum = readback.localEnvironmentBoxMinimum;
  const localBoxMaximum = readback.localEnvironmentBoxMaximum;
  state.localEnvironmentReflectionProbePosition.set(
    localProbePosition[0],
    localProbePosition[1],
    localProbePosition[2],
    readback.localEnvironmentProjectionMode === "box" ? 1 : 0
  );
  state.localEnvironmentReflectionBoxMinimum.set(localBoxMinimum[0], localBoxMinimum[1], localBoxMinimum[2], 0);
  state.localEnvironmentReflectionBoxMaximum.set(localBoxMaximum[0], localBoxMaximum[1], localBoxMaximum[2], 0);
  shaderData.setVector4(
    WATER_OPTICS_SHADER_PROPERTY.localEnvironmentReflectionParameters,
    state.localEnvironmentReflectionParameters
  );
  shaderData.setFloat(
    WATER_OPTICS_SHADER_PROPERTY.localEnvironmentReflectionMaximumMip,
    readback.localEnvironmentMaximumMipLevel
  );
  shaderData.setVector4(
    WATER_OPTICS_SHADER_PROPERTY.localEnvironmentReflectionProbePosition,
    state.localEnvironmentReflectionProbePosition
  );
  shaderData.setVector4(
    WATER_OPTICS_SHADER_PROPERTY.localEnvironmentReflectionBoxMinimum,
    state.localEnvironmentReflectionBoxMinimum
  );
  shaderData.setVector4(
    WATER_OPTICS_SHADER_PROPERTY.localEnvironmentReflectionBoxMaximum,
    state.localEnvironmentReflectionBoxMaximum
  );
  copyReflectionReadback(readback, state.bindingReadback as MutableBindingReadback);
  return readback;
}

/** Applies every field on every call while reusing the state aggregate readback and nested profile arrays. */
export function applyWaterSurfaceOpticsBinding(
  shaderData: ShaderData,
  state: WaterSurfaceOpticsBindingState,
  binding: Readonly<WaterSurfaceOpticsBinding>
): Readonly<WaterSurfaceOpticsBindingReadback> {
  const opticalProfile = applyWaterSurfaceOpticalProfile(shaderData, state, binding.opticalProfile);
  const refractionEnabled = binding.refractionEnabled === true;
  shaderData.setFloat(WATER_OPTICS_SHADER_PROPERTY.refractionEnabled, refractionEnabled ? 1 : 0);
  applyWaterSurfaceReflectionBinding(shaderData, state, binding.tier, binding.reflection, binding.reflectionSampling);
  const readback = state.bindingReadback as MutableBindingReadback;
  readback.opticalProfile = opticalProfile;
  readback.refractionEnabled = refractionEnabled;
  return readback;
}
