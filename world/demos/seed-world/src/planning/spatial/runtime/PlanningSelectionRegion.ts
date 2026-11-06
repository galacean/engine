import type { IslandPlan, PlanPoint } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel";
import type { SeedWorldRef } from "@galacean/engine-world-planning/agent-adapter/ports/SeedWorldEnginePort";
import { reliefSection } from "@galacean/engine-world-planning/spatial/terrain/ReliefField";
import { roadSurfaces, roadSurfaceOwners } from "@galacean/engine-world-planning/spatial/layout/RoadTopology";
import { PLANNING_TERRAIN_ID } from "@galacean/engine-world-planning/spatial/runtime/PlanningWorldPicking";

/** Separate polygons are unioned; rings within one polygon use even/odd fill. */
export function planningSelectionRegion(plan: IslandPlan, ref: SeedWorldRef): readonly (readonly PlanPoint[][])[] | undefined {
  if (ref.id === PLANNING_TERRAIN_ID) return [[[
    { x: 0, z: 0 }, { x: plan.parameters.width, z: 0 },
    { x: plan.parameters.width, z: plan.parameters.depth }, { x: 0, z: plan.parameters.depth }
  ]]];
  if (ref.kind === "road") {
    const owner = ref.id.replace(/^natural:road:/, "");
    const regions: PlanPoint[][][] = [];
    for (const road of roadSurfaces(plan)) {
      if (road.outline?.length && roadSurfaceOwners(plan, road).includes(owner)) regions.push([road.outline]);
    }
    return regions;
  }
  if (ref.domain !== "terrain") return;
  for (const patch of plan.parameters.terrainPatches ?? []) {
    if (patch.id !== ref.id) continue;
    const left: PlanPoint[] = [], right: PlanPoint[] = [];
    const c = Math.cos(patch.yawDegrees * Math.PI / 180), s = Math.sin(patch.yawDegrees * Math.PI / 180);
    for (let i = 0; i <= 64; i++) {
      const section = reliefSection(patch, i / 64);
      for (const [side, offset] of [[left, -section.left], [right, section.right]] as const) {
        const cross = section.across + offset;
        side.push({ x: patch.x + section.along * c - cross * s, z: patch.z + section.along * s + cross * c });
      }
    }
    return [[[...left, ...right.reverse()]]];
  }
  for (const mountain of plan.mountains) {
    if (mountain.id === ref.id) return [mountain.landform?.outlines ?? mountain.outlines ?? [mountain.landform?.outline ?? mountain.outline]];
  }
}
