import type {
  WaterOpticalColor,
  WaterOpticalProfile,
  WaterOpticalRgb,
  WaterSurfaceScattering
} from "./WaterOpticalProfile";
import type { WaterSurfaceOpticsResult } from "./WaterSurfaceOpticsTypes";

export const MIN_WATER_INDEX_OF_REFRACTION = 1;
export const MAX_WATER_INDEX_OF_REFRACTION = 4;
export const MAX_WATER_LINEAR_COLOR = 65_504;
export const MAX_WATER_OPTICAL_COEFFICIENT = 1_000_000;
export const MAX_WATER_OPTICAL_DISTANCE = 1_000_000;
import {
  MAX_WATER_REFRACTION_STRENGTH,
  MAX_WATER_REFLECTION_INTENSITY
} from "../../authoring/optics/WaterOpticalLimits";
export { MAX_WATER_REFRACTION_STRENGTH, MAX_WATER_REFLECTION_INTENSITY };
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
  surfaceScattering?: { coefficientPerMeter: [number, number, number]; phaseG: number };
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

  if (profile.surfaceScattering) {
    const scattering = (outProfile.surfaceScattering ??= { coefficientPerMeter: [0, 0, 0], phaseG: 0 });
    for (let channel = 0; channel < 3; channel++) {
      scattering.coefficientPerMeter[channel] = sanitizeOpticalCoefficient(
        profile.surfaceScattering.coefficientPerMeter[channel]
      );
    }
    scattering.phaseG = clampWaterOpticsFinite(profile.surfaceScattering.phaseG, 0, -0.95, 0.95);
  } else {
    outProfile.surfaceScattering = undefined;
  }

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

function resolveOpticalDistance(
  distance: number,
  maximumDistance: number | undefined,
  fallbackMaximum: number
): number {
  const resolvedMaximum = clampWaterOpticsFinite(maximumDistance, fallbackMaximum, 0, MAX_WATER_OPTICAL_DISTANCE);
  return clampWaterOpticsFinite(distance, resolvedMaximum, 0, resolvedMaximum);
}

function evaluateMediumTerms(
  profile: WaterOpticalProfile,
  opticalDistance: number,
  source: Readonly<WaterOpticalColor>,
  outColor: WaterOpticalColor,
  outTransmittance?: WaterOpticalColor,
  outScattering?: WaterOpticalColor
): WaterOpticalColor {
  const scatteringCoefficient = sanitizeOpticalCoefficient(
    profile.scatteringCoefficient,
    DEFAULT_WATER_SCATTERING_COEFFICIENT
  );
  const scatteringWeight = 1 - Math.exp(-scatteringCoefficient * opticalDistance);
  const absorption = profile.absorptionCoefficient;
  const scatteringColor = profile.scatteringColor;

  const transmittanceRed = Math.exp(
    -sanitizeOpticalCoefficient(absorption[0], DEFAULT_WATER_ABSORPTION_COEFFICIENT[0]) * opticalDistance
  );
  const transmittanceGreen = Math.exp(
    -sanitizeOpticalCoefficient(absorption[1], DEFAULT_WATER_ABSORPTION_COEFFICIENT[1]) * opticalDistance
  );
  const transmittanceBlue = Math.exp(
    -sanitizeOpticalCoefficient(absorption[2], DEFAULT_WATER_ABSORPTION_COEFFICIENT[2]) * opticalDistance
  );
  const scatteringRed = sanitizeLinearColor(scatteringColor[0], DEFAULT_WATER_SCATTERING_COLOR[0]) * scatteringWeight;
  const scatteringGreen = sanitizeLinearColor(scatteringColor[1], DEFAULT_WATER_SCATTERING_COLOR[1]) * scatteringWeight;
  const scatteringBlue = sanitizeLinearColor(scatteringColor[2], DEFAULT_WATER_SCATTERING_COLOR[2]) * scatteringWeight;

  if (outTransmittance) {
    outTransmittance.red = transmittanceRed;
    outTransmittance.green = transmittanceGreen;
    outTransmittance.blue = transmittanceBlue;
  }
  if (outScattering) {
    outScattering.red = scatteringRed;
    outScattering.green = scatteringGreen;
    outScattering.blue = scatteringBlue;
  }

  outColor.red = sanitizeLinearColor(sanitizeLinearColor(source.red) * transmittanceRed + scatteringRed);
  outColor.green = sanitizeLinearColor(sanitizeLinearColor(source.green) * transmittanceGreen + scatteringGreen);
  outColor.blue = sanitizeLinearColor(sanitizeLinearColor(source.blue) * transmittanceBlue + scatteringBlue);
  return outColor;
}

/** Normal-incidence reflectance for an air-to-water dielectric boundary. */
export function calculateWaterFresnelF0(indexOfRefraction: number): number {
  const resolvedIor = resolveWaterIndexOfRefraction(indexOfRefraction);
  const ratio = (1 - resolvedIor) / (1 + resolvedIor);
  return ratio * ratio;
}

/** Schlick Fresnel using a finite, saturated N dot V input. */
export function evaluateWaterFresnel(indexOfRefraction: number, normalDotView: number): number {
  const fresnelF0 = calculateWaterFresnelF0(indexOfRefraction);
  return evaluateWaterFresnelFromF0(fresnelF0, normalDotView);
}

/** Schlick Fresnel from an explicit dielectric F0. */
export function evaluateWaterFresnelFromF0(fresnelF0: number, normalDotView: number): number {
  const resolvedF0 = clampWaterOpticsFinite(fresnelF0, 0, 0, MAX_WATER_FRESNEL_F0);
  const resolvedNormalDotView = clampWaterOpticsFinite(normalDotView, 1, 0, 1);
  return resolvedF0 + (1 - resolvedF0) * Math.pow(1 - resolvedNormalDotView, 5);
}

/** Schlick's bounded approximation, with the same ray/light convention as UE Single Layer Water. */
export function evaluateWaterScatteringPhase(phaseG: number, cosine: number): number {
  const g = clampWaterOpticsFinite(phaseG, 0, -0.95, 0.95);
  // The UE polynomial slightly exceeds |k|=1 near |g|=0.95; keep the editable range positive and bounded.
  const k = Math.max(-0.99, Math.min(0.99, 1.55 * g - 0.55 * g * g * g));
  const denominator = 1 + k * clampWaterOpticsFinite(cosine, 0, -1, 1);
  return (1 - k * k) / (4 * Math.PI * denominator * denominator);
}

/** Pure reference for surface optical integration. No camera depth is used as authoritative bed depth. */
export function evaluateWaterSingleScattering(input: {
  readonly absorptionCoefficient: WaterOpticalRgb;
  readonly surfaceScattering: WaterSurfaceScattering;
  readonly opticalDistance: number;
  readonly sceneToSurfaceDistance?: number;
  readonly phaseCosine?: number;
  readonly sunRadiance?: WaterOpticalRgb;
  readonly ambientRadiance?: WaterOpticalRgb;
}) {
  const distance = clampWaterOpticsFinite(input.opticalDistance, 0, 0, MAX_WATER_OPTICAL_DISTANCE);
  const lightDistance = clampWaterOpticsFinite(input.sceneToSurfaceDistance, 0, 0, MAX_WATER_OPTICAL_DISTANCE);
  const phase = evaluateWaterScatteringPhase(input.surfaceScattering.phaseG, input.phaseCosine ?? 0);
  const transmittance: [number, number, number] = [0, 0, 0];
  const lightTransmittance: [number, number, number] = [0, 0, 0];
  const scattering: [number, number, number] = [0, 0, 0];
  for (let channel = 0; channel < 3; channel++) {
    const sigmaS = sanitizeOpticalCoefficient(input.surfaceScattering.coefficientPerMeter[channel]);
    const sigmaT = sanitizeOpticalCoefficient(input.absorptionCoefficient[channel]) + sigmaS;
    transmittance[channel] = Math.exp(-sigmaT * distance);
    lightTransmittance[channel] = Math.exp(-sigmaT * lightDistance);
    const incoming =
      sanitizeLinearColor(input.sunRadiance?.[channel] ?? 0) * phase +
      sanitizeLinearColor(input.ambientRadiance?.[channel] ?? 1) / (4 * Math.PI);
    scattering[channel] = incoming * Math.min(1, (sigmaS * (1 - transmittance[channel])) / Math.max(sigmaT, 1e-5));
  }
  return { transmittance, lightTransmittance, scattering };
}

/** Allocates one result for callers to retain and reuse across evaluations. */
export function createWaterSurfaceOpticsResult(): WaterSurfaceOpticsResult {
  return {
    opticalDistance: 0,
    fresnelF0: 0,
    fresnel: 0,
    refractionStrength: DEFAULT_WATER_REFRACTION_STRENGTH,
    roughness: DEFAULT_WATER_ROUGHNESS,
    reflectionIntensity: DEFAULT_WATER_REFLECTION_INTENSITY,
    transmittance: { red: 1, green: 1, blue: 1 },
    scattering: { red: 0, green: 0, blue: 0 },
    transmittedColor: { red: 0, green: 0, blue: 0 },
    finalColor: { red: 0, green: 0, blue: 0 }
  };
}

/**
 * Pure CPU reference for the surface shader's transmission/reflection contract.
 * `sourceColor` and `reflectionColor` are expected in linear space. The result,
 * including its nested colours, is caller-owned and is never replaced.
 */
export function evaluateWaterSurfaceOptics(
  profile: WaterOpticalProfile,
  opticalDistance: number,
  normalDotView: number,
  sourceColor: Readonly<WaterOpticalColor>,
  reflectionColor: Readonly<WaterOpticalColor>,
  outResult: WaterSurfaceOpticsResult
): WaterSurfaceOpticsResult {
  const resolvedDistance = resolveOpticalDistance(
    opticalDistance,
    profile.maximumSurfaceOpticalDistance,
    DEFAULT_WATER_MAXIMUM_SURFACE_OPTICAL_DISTANCE
  );
  const resolvedIor = resolveWaterIndexOfRefraction(profile.indexOfRefraction);
  const fresnelF0 = resolveWaterFresnelF0(profile.fresnelF0, resolvedIor);
  const fresnel = evaluateWaterFresnelFromF0(fresnelF0, normalDotView);
  const refractionStrength = resolveWaterRefractionStrength(profile.refractionStrength);
  const roughness = resolveWaterRoughness(profile.roughness);
  const reflectionIntensity = resolveWaterReflectionIntensity(profile.reflectionIntensity);

  outResult.opticalDistance = resolvedDistance;
  outResult.fresnelF0 = fresnelF0;
  outResult.fresnel = fresnel;
  outResult.refractionStrength = refractionStrength;
  outResult.roughness = roughness;
  outResult.reflectionIntensity = reflectionIntensity;
  if (profile.surfaceScattering) {
    // The compact surface reference uses isotropic unit ambient illumination.
    const medium = evaluateWaterSingleScattering({
      absorptionCoefficient: profile.absorptionCoefficient,
      surfaceScattering: profile.surfaceScattering,
      opticalDistance: resolvedDistance
    });
    (["red", "green", "blue"] as const).forEach((channel, index) => {
      outResult.transmittance[channel] = medium.transmittance[index];
      outResult.scattering[channel] = medium.scattering[index];
      outResult.transmittedColor[channel] =
        sanitizeLinearColor(sourceColor[channel]) * medium.transmittance[index] + medium.scattering[index];
    });
  } else {
    evaluateMediumTerms(
      profile,
      resolvedDistance,
      sourceColor,
      outResult.transmittedColor,
      outResult.transmittance,
      outResult.scattering
    );
  }

  const transmissionWeight = 1 - fresnel;
  const reflectionWeight = fresnel * reflectionIntensity;
  const reflectedRed = sanitizeLinearColor(reflectionColor.red) * reflectionWeight;
  const reflectedGreen = sanitizeLinearColor(reflectionColor.green) * reflectionWeight;
  const reflectedBlue = sanitizeLinearColor(reflectionColor.blue) * reflectionWeight;
  outResult.finalColor.red = sanitizeLinearColor(outResult.transmittedColor.red * transmissionWeight + reflectedRed);
  outResult.finalColor.green = sanitizeLinearColor(
    outResult.transmittedColor.green * transmissionWeight + reflectedGreen
  );
  outResult.finalColor.blue = sanitizeLinearColor(outResult.transmittedColor.blue * transmissionWeight + reflectedBlue);
  return outResult;
}
