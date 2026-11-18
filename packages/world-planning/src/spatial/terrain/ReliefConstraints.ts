import { worldElevationField } from "./WorldElevation";
import type { IslandPlan } from "../../semantic-study/IslandPlanModel";
import type { PlanningCheck } from "../../semantic-study/WorldPlanningContract";
import { createPlanningGroundSampler } from "../../semantic-study/WorldPlanningTerrain";
import roadLimits from "../../planning-data/road-network.json";
import { reliefField } from "./ReliefField";
import { poiRegionElevationSampler } from "./PoiRegionElevation";
/** Validate continuous road grades within authored relief, beyond the navigation grid's coarse checks. */
export function validateReliefTerrain(plan: IslandPlan): PlanningCheck[] {
  if (
    !plan.parameters.terrainPatches?.length &&
    !plan.parameters.worldElevation?.riseM &&
    !plan.regionFields?.elevation?.cells.some((cell) => cell.value !== 0)
  )
    return [];
  const local = reliefField(plan.parameters.terrainPatches ?? []),
    world = worldElevationField(plan.parameters.worldElevation, plan.parameters.width, plan.parameters.depth),
    region = poiRegionElevationSampler(plan),
    influence = (p: { x: number; z: number }) => local(p) + world(p) + region(p),
    ground = createPlanningGroundSampler(plan),
    checks: PlanningCheck[] = [];
  for (const route of plan.routes) {
    let maxGrade = 0;
    for (let i = 1; i < route.points.length; i++) {
      const a = route.points[i - 1],
        b = route.points[i],
        length = Math.hypot(b.x - a.x, b.z - a.z),
        n = Math.max(1, Math.ceil(length / 2));
      let previous = a;
      for (let j = 1; j <= n; j++) {
        const p = { x: a.x + ((b.x - a.x) * j) / n, z: a.z + ((b.z - a.z) * j) / n };
        if (Math.abs(influence(previous)) + Math.abs(influence(p)) > 1e-6 && length > 1e-6)
          maxGrade = Math.max(maxGrade, Math.abs(ground(p) - ground(previous)) / (length / n));
        previous = p;
      }
    }
    if (maxGrade > 0)
      checks.push({
        id: "relief-grade:" + route.id,
        rule: "terrain-road-grade",
        owners: [route.id],
        required: false,
        status: maxGrade <= roadLimits.maxSlope ? "pass" : "fail",
        measured: maxGrade,
        limit: roadLimits.maxSlope,
        message: `缓坡内道路坡度 ${((Math.atan(maxGrade) * 180) / Math.PI).toFixed(1)}° / 上限 ${((Math.atan(roadLimits.maxSlope) * 180) / Math.PI).toFixed(1)}°`
      });
  }
  for (const b of plan.buildings) {
    if (![b.center, ...b.outline].some((p) => Math.abs(influence(p)) > 1e-6)) continue;
    const gap = Math.max(...b.outline.map((p) => Math.abs(ground(p) - (b.baseHeight ?? ground(b.center)))));
    checks.push({
      id: "relief-foundation:" + b.id,
      rule: "terrain-foundation",
      owners: [b.id],
      required: false,
      status: gap <= 0.05 ? "pass" : "fail",
      measured: gap,
      limit: 0.05,
      message: `建筑地基最大高差 ${gap.toFixed(3)} m / 上限 0.05 m`
    });
  }
  return checks;
}
