import type { SeedWorldPageMode } from "./SeedWorldPageMode.ts";
import { TERRAIN_DEFAULT_SEASON, TERRAIN_SEASONS, type TerrainSeason } from "@galacean/engine-environment/terrain/environment/SceneSeasonPalette";
import {
  SEED_WORLD_DEFAULT_TERRAIN_SELECTION,
  type SeedWorldTerrainGenerationSelection
} from "@galacean/engine-terrain/world/SeedWorldTerrainGenerationSettings";

/** Default Root Seed used when the page URL does not provide one. */
export const SEED_WORLD_DEFAULT_SEED = 1_729;

/**
 * Resolves the initial Scene season encoded by the Seed World URL.
 *
 * @param query - Query parameters from the current page URL.
 * @returns A supported season, or the Scene default when the parameter is absent or invalid.
 */
export function resolveSeedWorldPageSeason(query: URLSearchParams): TerrainSeason {
  const value = query.get("season");
  return value !== null && TERRAIN_SEASONS.includes(value as TerrainSeason)
    ? (value as TerrainSeason)
    : TERRAIN_DEFAULT_SEASON;
}

/** Generated state that may be represented in the Seed World page URL. */
export interface SeedWorldPageUrlState {
  /** Active Root Seed. */
  readonly seed?: number;
  /** Active Heightmap and coverage resolutions. */
  readonly terrainSelection?: SeedWorldTerrainGenerationSelection;
}

/**
 * Resolves a reproducible debug URL or a minimal runtime URL.
 *
 * @param currentUrl - URL whose unrelated query parameters must be retained.
 * @param pageMode - Active runtime or debug presentation contract.
 * @param state - Generated state fields that are ready to synchronize.
 * @returns A detached URL containing only state that is meaningful for the active mode.
 */
export function resolveSeedWorldPageUrl(
  currentUrl: URL,
  pageMode: Pick<SeedWorldPageMode, "kind">,
  state: Readonly<SeedWorldPageUrlState>
): URL {
  const url = new URL(currentUrl);
  const preserveDefaults = pageMode.kind === "debug";
  if (state.seed !== undefined) url.searchParams.set("seed", String(state.seed));
  if (state.terrainSelection) {
    setNonDefaultParameter(
      url,
      "height",
      state.terrainSelection.heightSamplesPer1024,
      SEED_WORLD_DEFAULT_TERRAIN_SELECTION.heightSamplesPer1024,
      preserveDefaults
    );
    setNonDefaultParameter(
      url,
      "alpha",
      state.terrainSelection.coverageTexelsPer1024,
      SEED_WORLD_DEFAULT_TERRAIN_SELECTION.coverageTexelsPer1024,
      preserveDefaults
    );
  }
  for (const name of [...url.searchParams.keys()]) {
    if (name.startsWith("rock") && name !== "rockLab") url.searchParams.delete(name);
  }
  url.searchParams.delete("mode");
  url.searchParams.delete("plan");
  return url;
}

function setNonDefaultParameter(
  url: URL,
  name: string,
  value: number,
  defaultValue: number,
  preserveDefaults: boolean
): void {
  if (preserveDefaults || value !== defaultValue) url.searchParams.set(name, String(value));
  else url.searchParams.delete(name);
}
