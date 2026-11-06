import { DEAD_TREE_ASSET_ID } from "./TreeSpeciesCatalog";

/** Schema version for the offline visible-geometry Bounds consumed by world planning. */
export const TREE_SPECIES_GEOMETRY_BOUNDS_VERSION = 1;

/** Stable full-detail Bounds used by physical placement and screen-relative LOD projection. */
export interface TreeSpeciesGeometryBounds {
  readonly minimum: readonly [x: number, y: number, z: number];
  readonly maximum: readonly [x: number, y: number, z: number];
}

const DEAD_TREE_BOUNDS = treeBounds(
  [-3.4447489739528057, -0.003338312087370561, -4.059521365093615],
  [3.923749204438361, 12.643368852720714, 3.764887686833747]
);

/**
 * Offline catalog calibrated from the same full-detail recipes as the runtime ModelMeshes.
 * Lower-LOD card-size compensation deliberately does not change physical spacing or LOD projection.
 * The Worker consumes only this small immutable result instead of generating tree geometry.
 */
export const TREE_SPECIES_GEOMETRY_BOUNDS: Readonly<Record<string, TreeSpeciesGeometryBounds>> = Object.freeze({
  [DEAD_TREE_ASSET_ID]: DEAD_TREE_BOUNDS
});

/** Resolves the required visible-geometry Bounds for one enabled tree recipe. */
export function getTreeSpeciesGeometryBounds(assetRecipeId: string): TreeSpeciesGeometryBounds {
  const bounds = TREE_SPECIES_GEOMETRY_BOUNDS[assetRecipeId];
  if (!bounds) throw new RangeError(`Tree recipe "${assetRecipeId}" has no offline geometry Bounds`);
  return bounds;
}

function treeBounds(
  minimum: readonly [x: number, y: number, z: number],
  maximum: readonly [x: number, y: number, z: number]
): TreeSpeciesGeometryBounds {
  return Object.freeze({
    minimum: Object.freeze([...minimum] as [number, number, number]),
    maximum: Object.freeze([...maximum] as [number, number, number])
  });
}
