import type { IslandPlan, PlanPoint } from "../../../semantic-study/IslandPlanModel.ts";
import { sampleSeedWorldHeight, type SeedWorldFields } from "../../../runtime/SeedWorldFields.ts";
import { createWaterSurfaceSample } from "@galacean/engine-water/water/runtime/index";
import type { PlanningWaterRuntime } from "../../../spatial/runtime/PlanningWaterRuntime.ts";
import { naturalVegetationAt } from "../../../planning-data/NaturalVegetationProfile.ts";

/** Water's published surface wins only at the root's elevation, including stacked shelves. */
export function rockGrassWaterTest(water: Pick<PlanningWaterRuntime, "sampleSurface">) {
  const sample = createWaterSurfaceSample();
  return (x: number, y: number, z: number) =>
    water.sampleSurface(x, z, sample) && sample.waterDepth > 0 && y <= sample.surfacePosition.y;
}

/** Surface eligibility is separate from the terrain alphamap (which intentionally removes rock footprints). */
export function rockGrassExclusions(
  plan: IslandPlan,
  fields: SeedWorldFields,
  submerged: (x: number, y: number, z: number) => boolean
): (x: number, y: number, z: number) => boolean | number {
  const abundance = plan.naturalVegetation ? naturalVegetationAt(plan) : undefined;
  const buildings = plan.buildings.map((building) => ({
    outline: building.outline,
    minimumY: building.baseHeight ?? 0,
    maximumY: (building.baseHeight ?? 0) + building.height,
    minimumX: Math.min(...building.outline.map((p) => p.x)),
    maximumX: Math.max(...building.outline.map((p) => p.x)),
    minimumZ: Math.min(...building.outline.map((p) => p.z)),
    maximumZ: Math.max(...building.outline.map((p) => p.z))
  }));
  const routes = plan.routes ?? [];
  const bridges = (plan.bridges ?? []).map((bridge) => ({
    width: bridge.width,
    path: bridge.deckPath ?? [bridge.a, bridge.b].map((p) => ({ ...p, y: bridge.deckY ?? 0 }))
  }));
  return (x, y, z) => {
    if (submerged(x, y, z)) return false;
    for (const building of buildings)
      if (
        x >= building.minimumX &&
        x <= building.maximumX &&
        z >= building.minimumZ &&
        z <= building.maximumZ &&
        y >= building.minimumY - 0.15 &&
        y <= building.maximumY &&
        inside(building.outline, x, z)
      )
        return false;
    const ground = sampleSeedWorldHeight(fields, x, z);
    if (ground !== undefined && y < ground - 0.03) return false;
    // Road footprints below a rock shelf are irrelevant to that shelf.
    if (ground !== undefined && Math.abs(y - ground) < 0.25)
      for (const road of routes) {
        if (road.outline?.length && inside(road.outline, x, z)) return false;
        if (!road.outline?.length)
          for (let i = 1; i < road.points.length; i++)
            if (distanceToSegment(x, z, road.points[i - 1], road.points[i]) < road.width / 2) return false;
      }
    for (const bridge of bridges) {
      const path = bridge.path;
      for (let i = 1; i < path.length; i++) {
        const a = path[i - 1],
          b = path[i],
          t = segmentFraction(x, z, a, b);
        if (Math.abs(y - (a.y + (b.y - a.y) * t)) < 0.25 && distanceToSegment(x, z, a, b) < bridge.width / 2)
          return false;
      }
    }
    return abundance?.({ x, z }).grass ?? true;
  };
}

function inside(polygon: readonly PlanPoint[], x: number, z: number): boolean {
  let result = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i],
      b = polygon[j];
    if (a.z > z !== b.z > z && x < ((b.x - a.x) * (z - a.z)) / (b.z - a.z) + a.x) result = !result;
  }
  return result;
}
function segmentFraction(x: number, z: number, a: PlanPoint, b: PlanPoint): number {
  const dx = b.x - a.x,
    dz = b.z - a.z;
  return Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / Math.max(1e-10, dx * dx + dz * dz)));
}
function distanceToSegment(x: number, z: number, a: PlanPoint, b: PlanPoint): number {
  const t = segmentFraction(x, z, a, b);
  return Math.hypot(x - a.x - (b.x - a.x) * t, z - a.z - (b.z - a.z) * t);
}
