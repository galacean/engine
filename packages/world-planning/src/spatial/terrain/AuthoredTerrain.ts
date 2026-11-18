import type { PlanningResource } from "../PlanningResources";
import { isPlanningTerrainResource } from "../PlanningResources";
import type { PlanPoint } from "../../semantic-study/IslandPlanModel";
import type { SeedWorldTerrainPatchShapeV1 } from "../../world/SeedWorldWorldEdit";
import {
  sampleSeedWorldTerrainPatchShapeDeltaMillimetresV1,
  seedWorldTerrainPatchShapeOffsetBoundsV1
} from "../../runtime/hydrology-v1/SeedWorldTerrainFeatureGeometry.ts";

/** Reuse the established landform geometry, without its old store or publication runtime. */
export function authoredTerrainDisplacement(resources: readonly PlanningResource[]): (point: PlanPoint) => number {
  const mm = (metres: number) => Math.round(metres * 1000);
  const shapes = resources.filter(isPlanningTerrainResource).map((resource) => {
    const value = resource.properties;
    const center = { centerXOffsetMillimetres: mm(value.x), centerZOffsetMillimetres: mm(value.z) };
    let shape: SeedWorldTerrainPatchShapeV1;
    if (resource.resourceType === "terrain-patch") {
      shape = {
        ...center,
        kind: "radial-height",
        radiusMillimetres: mm(resource.properties.radiusMetres),
        heightDeltaMillimetres: mm(resource.properties.heightDeltaMetres),
        falloff: "smoothstep"
      };
    } else if (resource.properties.kind === "hill") {
      const hill = resource.properties;
      shape = {
        ...center,
        kind: "compact-cosine-hill",
        headingMilliDegrees: mm(hill.headingDegrees),
        pedestalLiftMillimetres: mm(hill.pedestalLiftMetres),
        peakReliefMillimetres: mm(hill.peakReliefMetres),
        influenceMajorRadiusMillimetres: mm(hill.influenceMajorRadiusMetres),
        influenceMinorRadiusMillimetres: mm(hill.influenceMinorRadiusMetres),
        bodyMajorRadiusMillimetres: mm(hill.bodyMajorRadiusMetres),
        bodyMinorRadiusMillimetres: mm(hill.bodyMinorRadiusMetres)
      };
    } else {
      const feature = resource.properties;
      shape = {
        ...center,
        kind: "procedural-landform",
        featureKind: feature.kind,
        headingMilliDegrees: mm(feature.headingDegrees),
        lengthMillimetres: mm(feature.lengthMetres),
        widthMillimetres: mm(feature.widthMetres),
        elevationDeltaMillimetres: mm(feature.elevationDeltaMetres),
        sharpnessPermille: mm(feature.sharpness),
        asymmetryPermille: mm(feature.asymmetry),
        roughnessPermille: mm(feature.roughness),
        erosionPermille: mm(feature.erosion),
        seed: feature.seed
      };
    }
    return { shape, bounds: seedWorldTerrainPatchShapeOffsetBoundsV1(shape) };
  });
  return (point) => {
    const x = point.x * 1000,
      z = point.z * 1000;
    let delta = 0;
    for (const { shape, bounds } of shapes) {
      if (
        x < bounds.minimumXOffsetMillimetres ||
        x > bounds.maximumXOffsetMillimetres ||
        z < bounds.minimumZOffsetMillimetres ||
        z > bounds.maximumZOffsetMillimetres
      )
        continue;
      delta += sampleSeedWorldTerrainPatchShapeDeltaMillimetresV1(shape, x, z) / 1000;
    }
    return delta;
  };
}
