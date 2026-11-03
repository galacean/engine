import { compareTerrainStableValues } from "../TerrainStableOrder";
import type { TerrainProjectRef, TerrainProjectRegion } from "./TerrainProjectContract";

/** Standard Project resource type referenced directly by a canonical Region manifest. */
export type TerrainProjectRegionDependencyType = "Buffer" | "Material" | "Prefab" | "Texture" | "KTX2";

/** One typed direct dependency of a canonical Region manifest. */
export interface TerrainProjectRegionDependency extends TerrainProjectRef {
  type: TerrainProjectRegionDependencyType;
}

/**
 * Collects the complete typed resource boundary of one Region without renderer residency filtering.
 * @param manifest Canonical Region manifest.
 * @returns Unique dependencies in stable path, subresource, and type order.
 */
export function collectTerrainProjectRegionDependencies(
  manifest: TerrainProjectRegion
): TerrainProjectRegionDependency[] {
  const dependencies: TerrainProjectRegionDependency[] = [
    { ...manifest.heightmap.data, type: "Buffer" },
    ...(manifest.holes ? [{ ...manifest.holes.data, type: "Buffer" as const }] : []),
    ...manifest.alphamaps.map((alphamap) => ({ ...alphamap.data, type: "Buffer" as const })),
    ...manifest.detailPrototypes.flatMap((prototype) =>
      prototype.density.kind === "r8-count" ? [{ ...prototype.density.data, type: "Buffer" as const }] : []
    ),
    ...manifest.detailPrototypes.flatMap((prototype) =>
      prototype.exactTransforms ? [{ ...prototype.exactTransforms.data, type: "Buffer" as const }] : []
    ),
    { ...manifest.material, type: "Material" },
    ...manifest.layers.flatMap((layer) => [
      { ...layer.diffuse, type: textureDependencyType(layer.diffuse) },
      { ...layer.normal, type: textureDependencyType(layer.normal) },
      ...(layer.mask ? [{ ...layer.mask, type: textureDependencyType(layer.mask) }] : [])
    ]),
    ...manifest.detailPrototypes.flatMap((prototype) =>
      prototype.texture ? [{ ...prototype.texture, type: textureDependencyType(prototype.texture) }] : []
    ),
    ...manifest.treePrototypes.map((prototype) => ({ ...prototype.prefab, type: "Prefab" as const })),
    ...manifest.detailPrototypes.flatMap((prototype) =>
      prototype.prefab ? [{ ...prototype.prefab, type: "Prefab" as const }] : []
    ),
    ...(manifest.placedPrefabPrototypes ?? []).map((prototype) => ({
      ...prototype.prefab,
      type: "Prefab" as const
    }))
  ];
  const unique = new Map<string, TerrainProjectRegionDependency>();
  for (const dependency of dependencies) {
    unique.set(`${dependency.type}\u0000${dependency.url}\u0000${dependency.key ?? ""}`, dependency);
  }
  return [...unique.values()].sort((left, right) =>
    compareTerrainStableValues(
      `${left.url}\u0000${left.key ?? ""}\u0000${left.type}`,
      `${right.url}\u0000${right.key ?? ""}\u0000${right.type}`
    )
  );
}

function textureDependencyType(ref: TerrainProjectRef): "Texture" | "KTX2" {
  return /\.ktx2(?:$|[?#])/i.test(ref.url) ? "KTX2" : "Texture";
}
