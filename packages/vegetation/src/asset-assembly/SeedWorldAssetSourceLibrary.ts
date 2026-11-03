import type { Engine } from "@galacean/engine";
import {
  loadAssetAssemblySourceLibrary,
  type AssetAssemblySourceLibrary,
  type ShrubAssemblySource
} from "./AssetAssemblySourceLibrary";
import { SEED_WORLD_PRODUCTION_ASSET_CATALOG } from "./SeedWorldProductionAssetCatalog";
import { usesProjectPlantResources } from "./PlantSpeciesResources";

/** Options controlling which authored Seed World families are preloaded. */
export interface SeedWorldAssetSourceLibraryLoadOptions {
  readonly shrubSourceFactory?: (engine: Engine) => Promise<ShrubAssemblySource>;
  /** Exact tree recipe ids required by the current Seed World population. */
  readonly treeRecipeIds?: ReadonlySet<string>;
  /** Loads the authored terminal tree billboard for consumers that expose the full four-level LOD chain. */
  readonly loadTreeImpostor?: boolean;
}

/**
 * Loads only the authored source families used by the current Seed World contract.
 * @param engine Engine ResourceManager owning registered Project and Prefab resources.
 * @param options Optional tree-recipe preload selection.
 * @returns A source library whose grass and legacy Rock control both resolve to current Seed assets.
 * @throws When a registered authored asset fails its source-library contract.
 */
export async function loadSeedWorldAssetSourceLibrary(
  engine: Engine,
  options: SeedWorldAssetSourceLibraryLoadOptions = {}
): Promise<AssetAssemblySourceLibrary> {
  const sourceLibrary = await loadAssetAssemblySourceLibrary(engine, SEED_WORLD_PRODUCTION_ASSET_CATALOG, {
    resourcesRegistered: usesProjectPlantResources(engine),
    treeRecipeIds: options.treeRecipeIds,
    shrubSourceFactory: options.shrubSourceFactory,
    legacyRockMode: "large-rock",
    loadTreeImpostor: options.loadTreeImpostor ?? false
  });
  return sourceLibrary;
}
