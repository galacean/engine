import type { ProceduralTreeSource } from "./ProceduralTreeGenerator";

export const DEAD_TREE_ASSET_ID = "cartoon/tree/dead-tree/v1";

/**
 * Stable catalog metadata and the algorithm binding for one tree asset.
 * Geometry parameters, material resources, and LOD policy deliberately live in
 * their own modules and are joined by TreeSpeciesRecipeLoader only.
 */
export interface TreeSpeciesCatalogEntry {
  readonly key: string;
  readonly assetId: string;
  readonly label: string;
  readonly exhibitionFamily: string;
  readonly geometryIdentity: string;
  readonly profile: ProceduralTreeSource["proceduralProfile"];
}

export const TREE_SPECIES_CATALOG: readonly TreeSpeciesCatalogEntry[] = Object.freeze([
  Object.freeze({
    key: "dead-tree",
    assetId: DEAD_TREE_ASSET_ID,
    label: "裸枝乔木",
    exhibitionFamily: "裸枝乔木",
    geometryIdentity: "dead-tree",
    profile: "white-birch"
  })
]);

/** Production species remaining in the catalog. */
export const TREE_SPECIES_ASSET_IDS = Object.freeze([DEAD_TREE_ASSET_ID] as const);
