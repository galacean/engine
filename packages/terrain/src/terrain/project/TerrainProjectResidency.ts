import type { TerrainProjectRegion } from "./TerrainProjectContract";

/** Render-resource identities required by one loaded canonical Region. */
export interface TerrainProjectRenderableRefs {
  /** Tree or mesh-detail prototype ids whose Prefabs must resolve. */
  readonly prefabPrototypeIds: ReadonlySet<string>;
  /** Ordinary placed-Prefab prototype ids whose Prefabs must resolve. */
  readonly placedPrefabPrototypeIds: ReadonlySet<string>;
  /** Texture-detail prototype ids whose Textures must resolve. */
  readonly textureDetailPrototypeIds: ReadonlySet<string>;
}

/**
 * Derives the minimal render-resource set without removing authoring declarations.
 * @param manifest Canonical Region manifest.
 * @returns Prototype ids whose standard Prefab or Texture resources are required.
 */
export function collectTerrainProjectRenderableRefs(manifest: TerrainProjectRegion): TerrainProjectRenderableRefs {
  const instantiatedTrees = new Set(manifest.treeInstances.map((instance) => instance.prototypeId));
  const instantiatedPlacedPrefabs = new Set(
    (manifest.placedPrefabInstances ?? []).map((instance) => instance.prototypeId)
  );
  const prefabPrototypeIds = new Set(
    manifest.treePrototypes.filter((prototype) => instantiatedTrees.has(prototype.id)).map((prototype) => prototype.id)
  );
  const placedPrefabPrototypeIds = new Set(
    (manifest.placedPrefabPrototypes ?? [])
      .filter((prototype) => instantiatedPlacedPrefabs.has(prototype.id))
      .map((prototype) => prototype.id)
  );
  const textureDetailPrototypeIds = new Set<string>();
  for (const prototype of manifest.detailPrototypes) {
    if (prototype.maximumSourceCount === 0) continue;
    if (prototype.prefab) prefabPrototypeIds.add(prototype.id);
    if (prototype.texture) textureDetailPrototypeIds.add(prototype.id);
  }
  return { prefabPrototypeIds, placedPrefabPrototypeIds, textureDetailPrototypeIds };
}
