import { buildPlantShapeGeometry } from "./ProceduralPlantGeometry";
import {
  createDefaultProceduralTreeDistributionTuning,
  type ProceduralTreeStructureParameters,
  type ProceduralTreeLodTuple
} from "./ProceduralTreeGenerator";

/** The same authored geometry inputs serve the exhibition, population and offline bounds measurement. */
export function treeSpeciesGeometryRecipe(
  entry: { id: string; displayName: string },
  structure: ProceduralTreeStructureParameters
) {
  const surfaces = new Map(
    Object.entries(structure.leafSurfaces ?? {}).map(([id, surface]) => [
      id,
      buildPlantShapeGeometry(surface.shape, surface.resolution)
    ])
  );
  const stemBudget = structure.stems.reduce(
    (sum, stem) =>
      sum +
      (stem.axialSubdivisions?.reduce((a, b) => a + b, 0) ?? stem.points.length - 1) * (stem.radialSegments ?? 8) * 2 +
      (stem.tipCap ? (stem.radialSegments ?? 8) : 0),
    0
  );
  const triangleLimits = structure.leafIdsByLod.map(
    (ids, lod) =>
      stemBudget +
      structure.leaves
        .filter((leaf) => ids.includes(leaf.id))
        .reduce((sum, leaf) => sum + surfaces.get(leaf.surfaceIdsByLod![lod])!.triangleCount, 0)
  ) as unknown as ProceduralTreeLodTuple<number>;
  const counts = structure.leafIdsByLod.map((ids) => ids.length);
  const base = {
    id: entry.id,
    label: entry.displayName,
    size: structure.referenceSize,
    proceduralProfile: "white-birch" as const
  };
  const distribution = {
    ...createDefaultProceduralTreeDistributionTuning(base),
    trunkCount: structure.stems.filter((stem) => stem.level === 0).length,
    branchCount: structure.stems.filter((stem) => stem.level === 1).length,
    twigCount: structure.stems.filter((stem) => stem.level === 2).length,
    leafNormalCrownBlendPercent: 0
  };
  return { base, distribution, counts, triangleLimits };
}
