/** Versioned parameters that map the named Hydrology Seed to planned Lake geometry. */
export interface SeedWorldLakeLayoutProfile {
  /** Smallest Seed-selected horizontal target area before terrain constraints. */
  readonly minimumTargetAreaSquareMetres: number;
  /** Largest Seed-selected horizontal target area before terrain constraints. */
  readonly maximumTargetAreaSquareMetres: number;
  /** Smallest target used by the central-first foothill candidate. */
  readonly minimumCentralTargetAreaSquareMetres: number;
  /** Largest target used by the central-first foothill candidate. */
  readonly maximumCentralTargetAreaSquareMetres: number;
  /** Required gentle dry-terrain support around planned shorelines. */
  readonly bankSupportMetres: number;
  /** Largest local H0 cut admitted while expanding a shoreline. */
  readonly maximumShorelineCutMetres: number;
  /** Largest local H0 cut admitted for the authored Lake bed. */
  readonly maximumBedCutMetres: number;
}

/** Empty Analysis-grid rings required around every candidate before expensive contour and catchment work. */
export const SEED_WORLD_LAKE_ANALYSIS_BOUNDARY_CLEARANCE_CELLS = 4;
/** Analysis-grid support rings reserved around each published Lake. */
export const SEED_WORLD_LAKE_ANALYSIS_SUPPORT_CLEARANCE_CELLS = 4;

/** Production Lake layout parameters consumed once during deterministic world generation. */
export const SEED_WORLD_LAKE_LAYOUT_PROFILE: Readonly<SeedWorldLakeLayoutProfile> = Object.freeze({
  minimumTargetAreaSquareMetres: 8_000,
  maximumTargetAreaSquareMetres: 160_000,
  minimumCentralTargetAreaSquareMetres: 3_200,
  maximumCentralTargetAreaSquareMetres: 8_000,
  bankSupportMetres: 24,
  maximumShorelineCutMetres: 10,
  maximumBedCutMetres: 14
});

/** Smallest terrain-constrained Lake core whose radius remains at least as wide as its soft-bank support. */
export const SEED_WORLD_MINIMUM_TERRAIN_CONSTRAINED_LAKE_AREA_SQUARE_METRES =
  Math.PI * SEED_WORLD_LAKE_LAYOUT_PROFILE.bankSupportMetres ** 2;
