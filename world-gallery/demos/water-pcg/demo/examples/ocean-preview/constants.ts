/** Runtime limits used by the isolated Ocean preview controller. */
import { WaterQualityTier } from "../../../authoring/wave/enums/WaterQualityTier";
import {
  OCEAN_RUNTIME_DEFAULT_STRESS_ITERATIONS,
  OCEAN_RUNTIME_MAX_PATCH_SEGMENTS,
  OCEAN_RUNTIME_MIN_AMPLITUDE_SCALE,
  OCEAN_RUNTIME_MIN_PATCH_SEGMENTS,
  OCEAN_RUNTIME_PATCH_SEGMENT_DIVISOR,
  OCEAN_RUNTIME_RING_SKIRT_DEPTH,
  OCEAN_RUNTIME_STRESS_QUALITY_SEQUENCE
} from "../../../runtime/ocean/OceanWaterRuntimeConstants";

export const OCEAN_PREVIEW_MIN_SEGMENT_COUNT = 1;
export const OCEAN_PREVIEW_DEFAULT_STRESS_ITERATIONS =
  OCEAN_RUNTIME_DEFAULT_STRESS_ITERATIONS;
export const OCEAN_PREVIEW_MIN_AMPLITUDE_SCALE =
  OCEAN_RUNTIME_MIN_AMPLITUDE_SCALE;
export const OCEAN_PREVIEW_PATCH_SEGMENT_DIVISOR =
  OCEAN_RUNTIME_PATCH_SEGMENT_DIVISOR;
export const OCEAN_PREVIEW_MIN_PATCH_SEGMENTS =
  OCEAN_RUNTIME_MIN_PATCH_SEGMENTS;
export const OCEAN_PREVIEW_MAX_PATCH_SEGMENTS =
  OCEAN_RUNTIME_MAX_PATCH_SEGMENTS;
export const OCEAN_PREVIEW_RING_SKIRT_DEPTH =
  OCEAN_RUNTIME_RING_SKIRT_DEPTH;

export const OCEAN_PREVIEW_GUI_LIMITS = {
  waterLevel: { min: -2, max: 3, step: 0.05 },
  amplitudeScale: { min: 0, max: 2, step: 0.01 },
  timeScale: { min: 0, max: 3, step: 0.01 },
  alpha: { min: 0.15, max: 1, step: 0.01 },
  crestIntensity: { min: 0, max: 2, step: 0.01 }
} as const;

export const OCEAN_PREVIEW_STRESS_QUALITY_SEQUENCE: readonly WaterQualityTier[] =
  OCEAN_RUNTIME_STRESS_QUALITY_SEQUENCE;
