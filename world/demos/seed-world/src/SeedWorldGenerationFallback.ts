import { SEED_WORLD_DEFAULT_FBM, type SeedWorldFbmParameters } from "@galacean/engine-world-planning/runtime/SeedWorldFields";
import { SEED_WORLD_DEFAULT_SEED } from "./SeedWorldPageUrl.ts";
import {
  SEED_WORLD_DEFAULT_TERRAIN_SELECTION,
  resolveSeedWorldTerrainGenerationSettings,
  type SeedWorldTerrainGenerationSettings
} from "@galacean/engine-terrain/world/SeedWorldTerrainGenerationSettings";

/** Known-good deterministic input used when a requested Seed World cannot be generated. */
export interface SeedWorldFallbackGenerationInput {
  /** Root Seed of the verified default world. */
  readonly rootSeed: number;
  /** Default procedural terrain profile. */
  readonly fbm: Readonly<SeedWorldFbmParameters>;
  /** Default Heightmap and coverage profile. */
  readonly terrainSettings: SeedWorldTerrainGenerationSettings;
}

/**
 * Resolves the verified default Seed World generation contract.
 *
 * @returns A detached deterministic fallback request using Seed 1729 and default generation settings.
 */
export function resolveSeedWorldFallbackGenerationInput(): Readonly<SeedWorldFallbackGenerationInput> {
  return Object.freeze({
    rootSeed: SEED_WORLD_DEFAULT_SEED,
    fbm: Object.freeze({ ...SEED_WORLD_DEFAULT_FBM }),
    terrainSettings: resolveSeedWorldTerrainGenerationSettings(SEED_WORLD_DEFAULT_TERRAIN_SELECTION)
  });
}
