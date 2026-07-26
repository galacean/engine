import { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";

export const OCEAN_RUNTIME_DEFAULT_STRESS_ITERATIONS = 100;
export const OCEAN_RUNTIME_MIN_AMPLITUDE_SCALE = 0;
/**
 * Fixed-time capture/replay rebuilds at most two recent 30 Hz temporal-foam
 * steps (~0.067 seconds). Live simulation never executes this bounded prewarm.
 */
export const OCEAN_RUNTIME_FIXED_TIME_FOAM_PREWARM_STEP_COUNT =
  2;
// A grazing, beach-level camera exposes the silhouette of every displaced
// Ocean triangle. High therefore resolves the canonical 192 sample preset to
// ninety-six segments per ring patch. The nearshore film and breaker silhouette
// are vertex-displaced; forty-eight segments still exposed triangular facets
// in the low Hero and Detail cameras.
export const OCEAN_RUNTIME_PATCH_SEGMENT_DIVISOR = 2;
export const OCEAN_RUNTIME_MIN_PATCH_SEGMENTS = 4;
export const OCEAN_RUNTIME_MAX_PATCH_SEGMENTS = 96;
// The topology collapses odd fine-edge samples into a stitched 2:1 transition,
// so the refractive showcase does not need a visible downward skirt.
export const OCEAN_RUNTIME_RING_SKIRT_DEPTH = 0;

export const OCEAN_RUNTIME_STRESS_QUALITY_SEQUENCE: readonly WaterQualityTier[] =
  Object.freeze([
    WaterQualityTier.Low,
    WaterQualityTier.Medium,
    WaterQualityTier.High
  ]);
