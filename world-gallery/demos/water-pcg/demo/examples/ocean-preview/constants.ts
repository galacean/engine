/** Runtime limits used by the isolated Ocean preview controller. */
import { WaterQualityTier } from "../../../authoring/wave/enums/WaterQualityTier";

export const OCEAN_PREVIEW_MIN_SEGMENT_COUNT = 1;
export const OCEAN_PREVIEW_DEFAULT_STRESS_ITERATIONS = 100;
export const OCEAN_PREVIEW_MIN_AMPLITUDE_SCALE = 0;

export const OCEAN_PREVIEW_GUI_LIMITS = {
  waterLevel: { min: -2, max: 3, step: 0.05 },
  amplitudeScale: { min: 0, max: 2, step: 0.01 },
  timeScale: { min: 0, max: 3, step: 0.01 },
  alpha: { min: 0.15, max: 1, step: 0.01 },
  crestIntensity: { min: 0, max: 2, step: 0.01 }
} as const;

export const OCEAN_PREVIEW_STRESS_QUALITY_SEQUENCE: readonly WaterQualityTier[] = Object.freeze([
  WaterQualityTier.Low,
  WaterQualityTier.Medium,
  WaterQualityTier.High
]);
