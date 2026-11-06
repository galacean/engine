import { roofHeight } from "../../runtime/RecoveredRoofMath";
import type { ImplementedBuilding } from "./BuildingImplementation";
import type { prepareBuildingTerrain } from "./BuildingTerrain";
import type { ConstructionGrounding } from "../../runtime/TerrainField";

/** Bounds and contact diagnostics from resolved geometry, independent of author models.
 * Includes foundation and decoration extents for distance residency and picking. */
export function buildingGrounding(
  layout: ImplementedBuilding,
  ground: ReturnType<typeof prepareBuildingTerrain>
): ConstructionGrounding {
  const grounding: ConstructionGrounding = { ...ground.grounding };
  if (!layout.construction.owners.length) return grounding;
  const points = layout.construction.owners.flatMap((o) => o.profile.points);
  grounding.supports = layout.construction.owners.map((o) => ({
    id: o.id,
    minGround: o.profile.minGround,
    maxGround: o.profile.maxGround,
    topY: o.profile.topY,
    layoutOriginY: layout.construction.walls.find((w) => w.id === o.id)?.layoutOriginY ?? 0
  }));
  grounding.minWorldHeight = Math.min(...points.map((p) => p[1]));
  grounding.maxWorldHeight = Math.max(...points.map((p) => p[1]));
  grounding.localBounds = {
    min: [
      Math.min(...points.map((p) => p[0])) - 1,
      Math.min(...points.map((p) => p[1])),
      Math.min(...points.map((p) => p[2])) - 1
    ],
    max: [
      Math.max(...points.map((p) => p[0])) + 1,
      Math.max(
        ...layout.construction.owners.map((o) =>
          Math.max(
            o.profile.maxYGable,
            o.profile.topY +
              (o.part.support.generator === "wallStrip" ? 0.46 : roofHeight(o.roof!.surface, o.roof!.footprint))
          )
        )
      ) + 0.5,
      Math.max(...points.map((p) => p[2])) + 1
    ]
  };
  // Wall bases may sit above a separate foundation. Keep the analytical
  // roof/unit envelope, and include all published support/attachment geometry
  // before handing the one render bound to resident meshes and frustum culling.
  for (let axis = 0; axis < 3; axis++) {
    grounding.localBounds.min[axis] = Math.min(grounding.localBounds.min[axis], layout.preview.bounds.min[axis] - 0.5);
    grounding.localBounds.max[axis] = Math.max(grounding.localBounds.max[axis], layout.preview.bounds.max[axis] + 0.5);
  }
  let sampleError = 0,
    aboveTerrain = 0,
    belowTerrain = 0,
    checks = 0;
  for (const wall of layout.construction.walls) {
    const points = wall.profile.points;
    for (const p of points) sampleError = Math.max(sampleError, Math.abs(p[1] - ground.height(p[0], p[2])));
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1],
        b = points[i],
        n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[2] - a[2]) / 0.125));
      for (let j = 0; j <= n; j++) {
        const t = j / n,
          x = a[0] + (b[0] - a[0]) * t,
          z = a[2] + (b[2] - a[2]) * t;
        const error = a[1] + (b[1] - a[1]) * t - ground.height(x, z);
        aboveTerrain = Math.max(aboveTerrain, error);
        belowTerrain = Math.max(belowTerrain, -error);
        checks++;
      }
    }
  }
  // CPU boundary diagnostics, not GPU readback or a claim of mesh watertightness.
  grounding.contacts = { sampleError, aboveTerrain, belowTerrain, checks };
  return grounding;
}
