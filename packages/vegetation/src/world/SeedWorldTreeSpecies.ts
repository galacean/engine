import { DEAD_TREE_ASSET_ID } from "../asset-assembly/TreeSpeciesCatalog";
import {
  getTreeSpeciesGeometryBounds,
  type TreeSpeciesGeometryBounds
} from "../asset-assembly/TreeSpeciesGeometryBounds";

/** Schema version for the deterministic Seed World tree-species catalog. */
export const SEED_WORLD_TREE_SPECIES_PROFILE_VERSION = 17;

/** Stable tree species keys stored by exact tree instances. */
export type SeedWorldTreeSpeciesKey = "dead-tree";

/** Stable material phenotype selected once per tree community and persisted by every exact tree. */
export type SeedWorldTreePaletteKey = "dead-native";

/** One species-owned finite palette. Geometry and ecological species identity remain independent. */
export interface SeedWorldTreePaletteProfile {
  readonly key: SeedWorldTreePaletteKey;
  /** Exact material recipe used by this color phenotype. */
  readonly assetRecipeId: string;
  /** Offline full-detail Bounds used for physical tree placement. */
  readonly geometryBounds: TreeSpeciesGeometryBounds;
  readonly relativeAbundance: number;
}

/** Configurable biological and asset mapping for one tree species. */
export interface SeedWorldTreeSpeciesProfile {
  /** Whether this species participates in world generation and production resource loading. */
  readonly enabled: boolean;
  /** Stable species identity used by named hashes and diagnostics. */
  readonly key: SeedWorldTreeSpeciesKey;
  /** Exact authored tree recipe loaded by the 3D consumer. */
  readonly assetRecipeId: string;
  /** Normalized moisture interval where this species can compete. */
  readonly moistureRange: readonly [minimum: number, maximum: number];
  /** Moisture value at which this species has its strongest response. */
  readonly preferredMoisture: number;
  /** Normalized mountain-uplift interval where this species can compete. */
  readonly mountainInfluenceRange: readonly [minimum: number, maximum: number];
  /** Mountain influence at which this species has its strongest response. */
  readonly preferredMountainInfluence: number;
  /** Maximum final terrain slope accepted by this species. */
  readonly maximumSlope: number;
  /** Relative abundance before moisture, mountain, and ecotone responses. */
  readonly relativeAbundance: number;
  /** Density multiplier applied after species selection without changing competing species counts. */
  readonly densityMultiplier: number;
  /** Relative abundance retained at full lake-, sea-, or river-bank influence. */
  readonly waterEdgeAbundanceMultiplier: number;
  /** Low-frequency named-noise wavelength which creates natural interleaving bands. */
  readonly ecotoneWavelengthMetres: number;
  /** Species-owned material phenotypes selected at community scale. */
  readonly palettes: readonly SeedWorldTreePaletteProfile[];
}

/**
 * Versioned tree-species configuration shared by the Worker and literal 3D consumer.
 * Moisture and mountain ranges overlap deliberately so species form stable ecotones instead of hard biome bands.
 */
export const SEED_WORLD_TREE_SPECIES_CATALOG: readonly SeedWorldTreeSpeciesProfile[] = Object.freeze([
  profile("dead-tree", DEAD_TREE_ASSET_ID, true, [0.04, 0.98], 0.5, [0, 1], 0.5, 0.86, 5 / 100, 192, 0.08, [
    palette("dead-native", DEAD_TREE_ASSET_ID, 1)
  ])
]);

/** Enabled tree species compiled by the Worker and preloaded by the Seed World runtime. */
export const SEED_WORLD_TREE_SPECIES_PROFILES: readonly SeedWorldTreeSpeciesProfile[] = Object.freeze(
  SEED_WORLD_TREE_SPECIES_CATALOG.filter((candidate) => candidate.enabled)
);

function profile(
  key: SeedWorldTreeSpeciesKey,
  assetRecipeId: string,
  enabled: boolean,
  moistureRange: readonly [number, number],
  preferredMoisture: number,
  mountainInfluenceRange: readonly [number, number],
  preferredMountainInfluence: number,
  maximumSlope: number,
  relativeAbundance: number,
  ecotoneWavelengthMetres: number,
  waterEdgeAbundanceMultiplier: number,
  palettes: readonly SeedWorldTreePaletteProfile[],
  densityMultiplier = 1
): SeedWorldTreeSpeciesProfile {
  return Object.freeze({
    key,
    assetRecipeId,
    enabled,
    moistureRange: Object.freeze([...moistureRange] as [number, number]),
    preferredMoisture,
    mountainInfluenceRange: Object.freeze([...mountainInfluenceRange] as [number, number]),
    preferredMountainInfluence,
    maximumSlope,
    relativeAbundance,
    densityMultiplier,
    waterEdgeAbundanceMultiplier,
    ecotoneWavelengthMetres,
    palettes: Object.freeze([...palettes])
  });
}

function palette(
  key: SeedWorldTreePaletteKey,
  assetRecipeId: string,
  relativeAbundance: number
): SeedWorldTreePaletteProfile {
  return Object.freeze({
    key,
    assetRecipeId,
    geometryBounds: getTreeSpeciesGeometryBounds(assetRecipeId),
    relativeAbundance
  });
}
