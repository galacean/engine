import type { OceanNearshoreBudgetConfig } from "../../authoring/ocean/OceanNearshoreTypes";

export const OCEAN_NEARSHORE_COMPILER_VERSION = 1;
export const OCEAN_NEARSHORE_DEFAULT_MINIMUM_DEPTH = 0.001;
export const OCEAN_NEARSHORE_MAXIMUM_DEPTH = 2048;
export const OCEAN_NEARSHORE_MAXIMUM_CURRENT_SPEED = 64;
export const OCEAN_NEARSHORE_MAXIMUM_CELL_SIZE = 10_000;
export const OCEAN_NEARSHORE_MAXIMUM_OBSTACLE_HEIGHT = 1024;

export const OCEAN_NEARSHORE_DEFAULT_BUDGET: Readonly<OceanNearshoreBudgetConfig> =
  Object.freeze({
    maxWidth: 256,
    maxHeight: 256,
    maxTexelCount: 65_536,
    maxObstacleCount: 32,
    maxAtlasByteLength: 262_144
  });

/** Author overrides may tighten these values but may not bypass compiler safety ceilings. */
export const OCEAN_NEARSHORE_HARD_BUDGET: Readonly<OceanNearshoreBudgetConfig> =
  Object.freeze({
    maxWidth: 512,
    maxHeight: 512,
    maxTexelCount: 262_144,
    maxObstacleCount: 128,
    maxAtlasByteLength: 1_048_576
  });
