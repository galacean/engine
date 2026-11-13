import {
  MAX_WATER_REFLECTION_INTENSITY,
  MAX_WATER_REFRACTION_STRENGTH
} from "../../authoring/optics/WaterOpticalLimits";
import type { WaterOpticalProfile } from "./WaterOpticalProfile";

export const MIN_WATER_INDEX_OF_REFRACTION = 1;
export const MAX_WATER_INDEX_OF_REFRACTION = 4;
export const MAX_WATER_LINEAR_COLOR = 65_504;
export const MAX_WATER_OPTICAL_COEFFICIENT = 1_000_000;
export const MAX_WATER_OPTICAL_DISTANCE = 1_000_000;
export { MAX_WATER_REFLECTION_INTENSITY, MAX_WATER_REFRACTION_STRENGTH };
export const MAX_WATER_FRESNEL_F0 = 1;

/** Existing surface shaders use F0=0.022; this IOR preserves that baseline. */
export const DEFAULT_WATER_INDEX_OF_REFRACTION = 1.3483107765683295;
export const DEFAULT_WATER_MAXIMUM_SURFACE_OPTICAL_DISTANCE = 4;
export const DEFAULT_WATER_REFRACTION_STRENGTH = 1;
export const DEFAULT_WATER_ROUGHNESS = 0;
export const DEFAULT_WATER_REFLECTION_INTENSITY = 1;
export const DEFAULT_WATER_MAXIMUM_VIEW_DISTANCE = 36;
export const DEFAULT_WATER_ABSORPTION_COEFFICIENT = Object.freeze([0.21, 0.085, 0.04] as const);
export const DEFAULT_WATER_SCATTERING_COLOR = Object.freeze([0.06, 0.28, 0.32] as const);
export const DEFAULT_WATER_SCATTERING_COEFFICIENT = 0.16;

export interface MutableResolvedWaterOpticalProfile {
  absorptionCoefficient: [red: number, green: number, blue: number];
  scatteringColor: [red: number, green: number, blue: number];
  scatteringCoefficient: number;
  maximumViewDistance: number;
  indexOfRefraction: number;
  fresnelF0: number;
  maximumSurfaceOpticalDistance: number;
  refractionStrength: number;
  roughness: number;
  reflectionIntensity: number;
}

export function clampWaterOpticsFinite(
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  if (value === Number.POSITIVE_INFINITY) return maximum;
  if (value === Number.NEGATIVE_INFINITY) return minimum;
  const finiteValue = value !== undefined && !Number.isNaN(value) ? value : fallback;
  return Math.min(maximum, Math.max(minimum, finiteValue));
}

function sanitizeLinearColor(value: number, fallback = 0): number {
  return clampWaterOpticsFinite(value, fallback, 0, MAX_WATER_LINEAR_COLOR);
}

function sanitizeOpticalCoefficient(value: number, fallback = 0): number {
  return clampWaterOpticsFinite(value, fallback, 0, MAX_WATER_OPTICAL_COEFFICIENT);
}

export function resolveWaterIndexOfRefraction(value: number | undefined): number {
  return clampWaterOpticsFinite(
    value,
    DEFAULT_WATER_INDEX_OF_REFRACTION,
    MIN_WATER_INDEX_OF_REFRACTION,
    MAX_WATER_INDEX_OF_REFRACTION
  );
}

/** Resolves an optional authored F0, falling back to the supplied IOR. */
export function resolveWaterFresnelF0(value: number | undefined, indexOfRefraction: number): number {
  return value === undefined
    ? calculateWaterFresnelF0(indexOfRefraction)
    : clampWaterOpticsFinite(value, calculateWaterFresnelF0(indexOfRefraction), 0, MAX_WATER_FRESNEL_F0);
}

export function resolveWaterRefractionStrength(value: number | undefined): number {
  return clampWaterOpticsFinite(value, DEFAULT_WATER_REFRACTION_STRENGTH, 0, MAX_WATER_REFRACTION_STRENGTH);
}

export function resolveWaterRoughness(value: number | undefined): number {
  return clampWaterOpticsFinite(value, DEFAULT_WATER_ROUGHNESS, 0, 1);
}

export function resolveWaterReflectionIntensity(value: number | undefined): number {
  return clampWaterOpticsFinite(value, DEFAULT_WATER_REFLECTION_INTENSITY, 0, MAX_WATER_REFLECTION_INTENSITY);
}

/** Single allocation-free profile sanitizer shared by CPU reference math and GPU material binding. */
export function sanitizeWaterOpticalProfileInto(
  profile: WaterOpticalProfile,
  outProfile: MutableResolvedWaterOpticalProfile
): MutableResolvedWaterOpticalProfile {
  const absorption = profile.absorptionCoefficient;
  const scatteringColor = profile.scatteringColor;
  const resolvedIor = resolveWaterIndexOfRefraction(profile.indexOfRefraction);

  outProfile.absorptionCoefficient[0] = sanitizeOpticalCoefficient(
    absorption[0],
    DEFAULT_WATER_ABSORPTION_COEFFICIENT[0]
  );
  outProfile.absorptionCoefficient[1] = sanitizeOpticalCoefficient(
    absorption[1],
    DEFAULT_WATER_ABSORPTION_COEFFICIENT[1]
  );
  outProfile.absorptionCoefficient[2] = sanitizeOpticalCoefficient(
    absorption[2],
    DEFAULT_WATER_ABSORPTION_COEFFICIENT[2]
  );
  outProfile.scatteringColor[0] = sanitizeLinearColor(scatteringColor[0], DEFAULT_WATER_SCATTERING_COLOR[0]);
  outProfile.scatteringColor[1] = sanitizeLinearColor(scatteringColor[1], DEFAULT_WATER_SCATTERING_COLOR[1]);
  outProfile.scatteringColor[2] = sanitizeLinearColor(scatteringColor[2], DEFAULT_WATER_SCATTERING_COLOR[2]);
  outProfile.scatteringCoefficient = sanitizeOpticalCoefficient(
    profile.scatteringCoefficient,
    DEFAULT_WATER_SCATTERING_COEFFICIENT
  );
  outProfile.maximumViewDistance = clampWaterOpticsFinite(
    profile.maximumViewDistance,
    DEFAULT_WATER_MAXIMUM_VIEW_DISTANCE,
    0,
    MAX_WATER_OPTICAL_DISTANCE
  );
  outProfile.indexOfRefraction = resolvedIor;
  outProfile.fresnelF0 = resolveWaterFresnelF0(profile.fresnelF0, resolvedIor);
  outProfile.maximumSurfaceOpticalDistance = clampWaterOpticsFinite(
    profile.maximumSurfaceOpticalDistance,
    DEFAULT_WATER_MAXIMUM_SURFACE_OPTICAL_DISTANCE,
    0,
    MAX_WATER_OPTICAL_DISTANCE
  );
  outProfile.refractionStrength = resolveWaterRefractionStrength(profile.refractionStrength);
  outProfile.roughness = resolveWaterRoughness(profile.roughness);
  outProfile.reflectionIntensity = resolveWaterReflectionIntensity(profile.reflectionIntensity);
  return outProfile;
}

/** Normal-incidence reflectance for an air-to-water dielectric boundary. */
export function calculateWaterFresnelF0(indexOfRefraction: number): number {
  const resolvedIor = resolveWaterIndexOfRefraction(indexOfRefraction);
  const ratio = (1 - resolvedIor) / (1 + resolvedIor);
  return ratio * ratio;
}

/** Schlick Fresnel from an explicit dielectric F0. */
export function evaluateWaterFresnelFromF0(fresnelF0: number, normalDotView: number): number {
  const resolvedF0 = clampWaterOpticsFinite(fresnelF0, 0, 0, MAX_WATER_FRESNEL_F0);
  const resolvedNormalDotView = clampWaterOpticsFinite(normalDotView, 1, 0, 1);
  return resolvedF0 + (1 - resolvedF0) * Math.pow(1 - resolvedNormalDotView, 5);
}
