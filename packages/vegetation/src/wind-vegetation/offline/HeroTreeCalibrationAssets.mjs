/** Canonical live-tree coverage shared by asset authoring and controlled Unity/Web acceptance. */
export const HERO_TREE_CALIBRATION_ASSETS = Object.freeze([
  Object.freeze({ id: "broadleaf-large-1", model: "1adfe9392d9a2aac.glb", species: "broadleaf", size: "large" }),
  Object.freeze({ id: "broadleaf-large-2", model: "a53cfc7956d1f311.glb", species: "broadleaf", size: "large" }),
  Object.freeze({ id: "broadleaf-medium-1", model: "efd966152697c274.glb", species: "broadleaf", size: "medium" }),
  Object.freeze({ id: "broadleaf-medium-2", model: "d166cc5e0e841bb6.glb", species: "broadleaf", size: "medium" }),
  Object.freeze({ id: "birch-large-1", model: "8fcd8b5a84cbb2a1.glb", species: "birch", size: "large" }),
  Object.freeze({ id: "birch-large-2", model: "e5d9d5383c2f51e1.glb", species: "birch", size: "large" }),
  Object.freeze({ id: "birch-medium-1", model: "93131963d3f57feb.glb", species: "birch", size: "medium" }),
  Object.freeze({ id: "birch-medium-2", model: "90fa81dde0531841.glb", species: "birch", size: "medium" })
]);

/** Production prefab mesh order is LOD1, LOD2, LOD0; acceptance names remain LOD0..2. */
export const HERO_TREE_LOD_MESH_INDICES = Object.freeze([2, 0, 1]);
export const HERO_TREE_LODS = Object.freeze(HERO_TREE_LOD_MESH_INDICES.map((_, lod) => lod));
