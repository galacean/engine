/** Version of the Detail-species authoring profile embedded in generated Seed World plans. */
export const SEED_WORLD_DETAIL_SPECIES_PROFILE_VERSION = 21;

/** Uniform Detail distribution across every suitable habitat texel. */
export interface SeedWorldUniformDetailDistribution {
  /** Uniform habitat distribution discriminator. */
  readonly kind: "uniform-habitat";
}

/** Irregular, independently seeded flower clusters baked into one continuous DensityField. */
export interface SeedWorldWarpedClusterDetailDistribution {
  /** Warped-cluster distribution discriminator. */
  readonly kind: "warped-cluster";
  /** Parent-cluster count range per suitable square kilometre. */
  readonly clustersPerSuitableSquareKilometre: readonly [minimum: number, maximum: number];
  /** Ellipse major-radius range in metres. */
  readonly majorRadiusMetres: readonly [minimum: number, maximum: number];
  /** Ellipse minor-radius range in metres. */
  readonly minorRadiusMetres: readonly [minimum: number, maximum: number];
  /** Domain-warp wavelength range in metres. */
  readonly warpWavelengthMetres: readonly [minimum: number, maximum: number];
  /** Domain-warp amplitude range in metres. */
  readonly warpAmplitudeMetres: readonly [minimum: number, maximum: number];
  /** Density multiplier reached at a parent-cluster core; zero coverage remains empty. */
  readonly clusteredFraction: number;
}

/** Dense Detail macro-distribution compiled before the fixed GPU candidate grid. */
export type SeedWorldDetailDistribution = SeedWorldUniformDetailDistribution | SeedWorldWarpedClusterDetailDistribution;

/** One data-driven dense vegetation species compiled into its own DensityField. */
export interface SeedWorldDetailSpeciesProfile {
  /** Stable species identity used by authoring operations and field hashes. */
  readonly key: string;
  /** Dense vegetation category used by diagnostics and runtime batching. */
  readonly category: "grass" | "flower";
  /** Authored Asset Assembly prototype selected by the runtime adapter. */
  readonly assetProfileKey: string;
  /** Surface habitat used by the density compiler. Aquatic profiles bypass terrestrial clearance. */
  readonly habitat: "terrestrial" | "aquatic";
  /** Target instance density where every habitat response is fully suitable. */
  readonly targetDensityPerSquareMetre: number;
  /** Relative density in grassland habitat. */
  readonly grasslandWeight: number;
  /** Relative density in forest habitat. */
  readonly forestWeight: number;
  /** Normalized soil-moisture interval where the species remains suitable. */
  readonly moistureRange: readonly [minimum: number, maximum: number];
  /** Normalized moisture at which this species reaches its authored maximum density. */
  readonly preferredMoisture: number;
  /** Normalized final-slope ceiling retained for authored species constraints. */
  readonly maximumSlope: number;
  /** Macro distribution applied before the stable GPU candidate grid. */
  readonly distribution: SeedWorldDetailDistribution;
}

const INTEGRATED_GRASS_2_QUALIFIED_DENSITY_PER_SQUARE_METRE = 230_284 / 69_520;
const SEED_WORLD_GRASS_TARGET_DENSITY_PER_SQUARE_METRE =
  INTEGRATED_GRASS_2_QUALIFIED_DENSITY_PER_SQUARE_METRE + 0.009 + 0.0156;
const SEED_WORLD_TOTAL_FLOWER_TARGET_DENSITY_PER_SQUARE_METRE = SEED_WORLD_GRASS_TARGET_DENSITY_PER_SQUARE_METRE * 1.2;

/**
 * Seed World dense-species catalog calibrated from the Integrated Grasslands Detail maps.
 * `grass-3` is intentionally absent; its former density is transferred to the lighter `grass-2` species.
 */
export const SEED_WORLD_DETAIL_SPECIES_PROFILES: readonly SeedWorldDetailSpeciesProfile[] = Object.freeze([
  detailSpecies("grass-2", "grass", SEED_WORLD_GRASS_TARGET_DENSITY_PER_SQUARE_METRE, [0, 1], 0.5, undefined, {
    assetProfileKey: "cluster"
  }),
  detailSpecies(
    "water-grass",
    "grass",
    SEED_WORLD_GRASS_TARGET_DENSITY_PER_SQUARE_METRE * 0.72,
    [0, 1],
    0.5,
    undefined,
    { habitat: "aquatic", assetProfileKey: "cluster" }
  ),
  detailSpecies(
    "flowers-1",
    "flower",
    SEED_WORLD_TOTAL_FLOWER_TARGET_DENSITY_PER_SQUARE_METRE * 0.34,
    [0.5, 1],
    0.76,
    flowerClusters()
  ),
  detailSpecies(
    "flowers-2",
    "flower",
    SEED_WORLD_TOTAL_FLOWER_TARGET_DENSITY_PER_SQUARE_METRE * 0.33,
    [0.45, 1],
    0.68,
    flowerClusters()
  ),
  detailSpecies(
    "flower-1",
    "flower",
    SEED_WORLD_TOTAL_FLOWER_TARGET_DENSITY_PER_SQUARE_METRE * 0.33,
    [0.56, 1],
    0.83,
    flowerClusters()
  )
]);

/**
 * Resolves one species profile by its stable key.
 * @param profiles Versioned species catalog used for this compilation.
 * @param key Stable species key stored by the authoring operation.
 * @returns Matching species profile.
 * @throws {RangeError} When the operation references an unknown species.
 */
export function getSeedWorldDetailSpeciesProfile(
  profiles: readonly SeedWorldDetailSpeciesProfile[],
  key: string
): SeedWorldDetailSpeciesProfile {
  const profile = profiles.find((candidate) => candidate.key === key);
  if (!profile) throw new RangeError(`Seed World Detail species profile "${key}" is unavailable`);
  return profile;
}

function detailSpecies(
  key: string,
  category: SeedWorldDetailSpeciesProfile["category"],
  targetDensityPerSquareMetre: number,
  moistureRange: SeedWorldDetailSpeciesProfile["moistureRange"],
  preferredMoisture: number,
  distribution: SeedWorldDetailDistribution = Object.freeze({ kind: "uniform-habitat" as const }),
  options: Readonly<{
    habitat?: SeedWorldDetailSpeciesProfile["habitat"];
    assetProfileKey?: string;
  }> = {}
): SeedWorldDetailSpeciesProfile {
  return Object.freeze({
    key,
    category,
    assetProfileKey: options.assetProfileKey ?? key,
    habitat: options.habitat ?? "terrestrial",
    targetDensityPerSquareMetre,
    grasslandWeight: 1,
    forestWeight: 1,
    moistureRange: Object.freeze(moistureRange),
    preferredMoisture,
    maximumSlope: 1,
    distribution
  });
}

function flowerClusters(): SeedWorldWarpedClusterDetailDistribution {
  return Object.freeze({
    kind: "warped-cluster",
    clustersPerSuitableSquareKilometre: Object.freeze([54, 81] as const),
    majorRadiusMetres: Object.freeze([28, 60] as const),
    minorRadiusMetres: Object.freeze([16, 32] as const),
    warpWavelengthMetres: Object.freeze([70, 120] as const),
    warpAmplitudeMetres: Object.freeze([10, 22] as const),
    clusteredFraction: 1
  });
}
