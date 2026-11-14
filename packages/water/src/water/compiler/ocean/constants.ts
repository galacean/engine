import type { OceanNearshoreBudgetConfig } from "../../authoring/ocean/OceanNearshoreTypes";

export const OCEAN_NEARSHORE_COMPILER_VERSION = 3;
export const OCEAN_NEARSHORE_DEFAULT_MINIMUM_DEPTH = 0.001;
export const OCEAN_NEARSHORE_MAXIMUM_DEPTH = 2048;
export const OCEAN_NEARSHORE_MAXIMUM_CELL_SIZE = 10_000;

/**
 * The RGBA8 atlas is a render-nearshore field, while the Float32 query grid
 * retains the authored distance. Saturating the render channel outside 64m
 * preserves sub-metre precision through the complete wave/breaker band.
 */
export const OCEAN_NEARSHORE_GPU_SHORE_DISTANCE_RANGE_MAXIMUM_METRES = 64;

export const OCEAN_NEARSHORE_DEFAULT_BUDGET: Readonly<OceanNearshoreBudgetConfig> = Object.freeze({
  maxWidth: 256,
  maxHeight: 256,
  maxTexelCount: 65_536,
  maxAtlasByteLength: 262_144
});

/** Larger world maps explicitly opt in; omitted author budgets retain the 256-square default. */
export const OCEAN_NEARSHORE_HARD_BUDGET: Readonly<OceanNearshoreBudgetConfig> = Object.freeze({
  maxWidth: 1_024,
  maxHeight: 1_024,
  maxTexelCount: 1_048_576,
  maxAtlasByteLength: 4_194_304
});
