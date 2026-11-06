import { PopulationLodMetric } from "@galacean/engine-terrain/terrain/seed/PopulationTokenCodec";
import { DEAD_TREE_ASSET_ID } from "./TreeSpeciesCatalog";
import { getTreeSpeciesGeometryBounds } from "./TreeSpeciesGeometryBounds";
import { createBalancedFoliageLodScales, type TreeLeafCountTuning } from "./ProceduralTreeLeafCount";
import type { ProceduralTreeTriangleBudgetTuning } from "./ProceduralTreeGenerator";

export interface TreeSpeciesLodPolicy {
  readonly triangleBudget: ProceduralTreeTriangleBudgetTuning;
  readonly defaultLodProfile: {
    readonly metric: PopulationLodMetric;
    readonly values: readonly [number, number, number];
  };
  readonly lodGroup: {
    readonly localReferencePoint: readonly [number, number, number];
    readonly size: number;
    readonly screenRelativeTransitionHeights: readonly [number, number];
  };
}

const sharedTriangleBudget: ProceduralTreeTriangleBudgetTuning = Object.freeze({
  maxTrianglesPerLod: [4000, 2400, 1200, 100] as const,
  preferredTrianglesPerLod: [3000, 2400, 1200, 100] as const
});

const sharedLodProfile = Object.freeze({
  metric: PopulationLodMetric.InstanceCount,
  values: [1, 1, 1] as const
});

/** Mobile WebGL2 transitions for source LOD0, LOD2, and LOD3; source LOD1 is intentionally omitted */
export const TREE_SPECIES_LOD_TRANSITION_HEIGHTS = Object.freeze([0.4, 0.05] as const);
/**
 * Keeps the total leaf-card projection invariant while lower LODs reduce card count.
 * `createBalancedFoliageLodScales` returns the fourth-root compensation; squaring it yields
 * `sqrt(lod0Count / lodCount)`, so `lodCount * scale²` remains equal to LOD0.
 */
export function createTreeSpeciesFoliageLodScales(
  leafCounts: TreeLeafCountTuning
): readonly [lod0: number, lod1: number, lod2: number, lod3: number] {
  const balanced = createBalancedFoliageLodScales(leafCounts);
  return Object.freeze(balanced.map((scale) => scale * scale) as [number, number, number, number]);
}

export const TREE_SPECIES_LOD_POLICIES: Readonly<Record<string, TreeSpeciesLodPolicy>> = Object.freeze({
  "dead-tree": definePolicy(DEAD_TREE_ASSET_ID)
});

function definePolicy(assetRecipeId: string): TreeSpeciesLodPolicy {
  const { minimum, maximum } = getTreeSpeciesGeometryBounds(assetRecipeId);
  const localReferencePoint = minimum.map((value, axis) => (value + maximum[axis]!) * 0.5) as [number, number, number];
  const size = Math.max(...minimum.map((value, axis) => maximum[axis]! - value));
  return Object.freeze({
    triangleBudget: sharedTriangleBudget,
    defaultLodProfile: sharedLodProfile,
    lodGroup: Object.freeze({
      localReferencePoint: Object.freeze(localReferencePoint),
      size,
      screenRelativeTransitionHeights: TREE_SPECIES_LOD_TRANSITION_HEIGHTS
    })
  });
}
