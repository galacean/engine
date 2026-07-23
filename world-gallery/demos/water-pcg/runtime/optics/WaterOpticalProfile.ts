/** Shared CPU-side optical coefficients for water-surface and underwater consumers. */

import {
  DEFAULT_WATER_ABSORPTION_COEFFICIENT,
  DEFAULT_WATER_INDEX_OF_REFRACTION,
  DEFAULT_WATER_MAXIMUM_SURFACE_OPTICAL_DISTANCE,
  DEFAULT_WATER_MAXIMUM_VIEW_DISTANCE,
  DEFAULT_WATER_REFLECTION_INTENSITY,
  DEFAULT_WATER_REFRACTION_STRENGTH,
  DEFAULT_WATER_ROUGHNESS,
  DEFAULT_WATER_SCATTERING_COEFFICIENT,
  DEFAULT_WATER_SCATTERING_COLOR,
  evaluateWaterOpticalMediumColor
} from "./WaterSurfaceOpticsMath";

export type WaterOpticalRgb = readonly [red: number, green: number, blue: number];

export interface WaterOpticalProfile {
  /** Beer-Lambert extinction coefficients in inverse metres. */
  readonly absorptionCoefficient: WaterOpticalRgb;
  /** Asymptotic in-scattering colour in linear space. */
  readonly scatteringColor: WaterOpticalRgb;
  /** Scalar in-scattering coefficient in inverse metres. */
  readonly scatteringCoefficient: number;
  /** Maximum view distance evaluated by the fullscreen medium. */
  readonly maximumViewDistance: number;
  /** Air-to-water index of refraction; optional for pre-surface-optics profiles. */
  readonly indexOfRefraction?: number;
  /** Maximum optical path evaluated by the surface shader, in metres. */
  readonly maximumSurfaceOpticalDistance?: number;
  /** Neutral-at-one artistic multiplier for screen-space UV displacement. */
  readonly refractionStrength?: number;
  /** Normalized reflection roughness; zero preserves the current sharp baseline. */
  readonly roughness?: number;
  /** Neutral-at-one artistic multiplier applied to reflected radiance. */
  readonly reflectionIntensity?: number;
}

export interface WaterOpticalColor {
  red: number;
  green: number;
  blue: number;
}

export const DEFAULT_WATER_OPTICAL_PROFILE: WaterOpticalProfile = Object.freeze({
  absorptionCoefficient: DEFAULT_WATER_ABSORPTION_COEFFICIENT,
  scatteringColor: DEFAULT_WATER_SCATTERING_COLOR,
  scatteringCoefficient: DEFAULT_WATER_SCATTERING_COEFFICIENT,
  maximumViewDistance: DEFAULT_WATER_MAXIMUM_VIEW_DISTANCE,
  indexOfRefraction: DEFAULT_WATER_INDEX_OF_REFRACTION,
  maximumSurfaceOpticalDistance: DEFAULT_WATER_MAXIMUM_SURFACE_OPTICAL_DISTANCE,
  refractionStrength: DEFAULT_WATER_REFRACTION_STRENGTH,
  roughness: DEFAULT_WATER_ROUGHNESS,
  reflectionIntensity: DEFAULT_WATER_REFLECTION_INTENSITY
});

/** CPU mirror used by focused tests and non-rendering diagnostics. */
export function evaluateWaterOpticalMedium(
  profile: WaterOpticalProfile,
  distance: number,
  source: Readonly<WaterOpticalColor>,
  outColor: WaterOpticalColor
): WaterOpticalColor {
  return evaluateWaterOpticalMediumColor(profile, distance, source, outColor);
}
