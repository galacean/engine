import type { IslandPlan } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel";
import { planningWhiteboxes } from "@galacean/engine-world-planning/semantic-study/PlanningWhiteboxes";
import { createPlanningGroundSampler } from "@galacean/engine-world-planning/semantic-study/WorldPlanningTerrain";
import { ringArea } from "@galacean/engine-world-planning/semantic-study/WorldPlanningGeometry";
import { rayBox } from "@galacean/engine-world-planning/spatial/guidance/VisibilityQuery";

/** Read-only geometry evidence, not a beauty, safety or wayfinding score. */
export function planningOverview(plan: IslandPlan) {
  const ground = createPlanningGroundSampler(plan);
  const eye = { ...plan.spawn, y: ground(plan.spawn) + 1.65 };
  const boxes = planningWhiteboxes(plan, ground)
    .flatMap((p) => p.boxes)
    .filter((b) => b.occlusion);
  const depths = Array.from({ length: 72 }, (_, i) => {
    const angle = (i * Math.PI) / 36,
      direction = { x: Math.sin(angle), y: 0, z: Math.cos(angle) };
    let distance = 200;
    for (const b of boxes) distance = Math.min(distance, rayBox(eye, direction, b));
    for (let t = 2; t < distance; t += 2) {
      const p = { x: eye.x + direction.x * t, z: eye.z + direction.z * t };
      if (p.x < 0 || p.z < 0 || p.x > plan.parameters.width || p.z > plan.parameters.depth) break;
      if (ground(p) > eye.y) {
        distance = t;
        break;
      }
    }
    return distance;
  });
  const heights = (values: number[]) =>
    values.length ? { minM: Math.min(...values), maxM: Math.max(...values) } : null;
  const landscape = plan.landscapes?.filter((p) => p.role !== "poi") ?? [];
  const area = [plan.land, ...plan.islands].reduce((n, r) => n + Math.abs(ringArea(r)), 0);
  return {
    measuredLandAreaM2: area,
    ambientInstances: landscape.length,
    actualAmbientPer1000M2: area ? (landscape.length / area) * 1000 : 0,
    heights: {
      buildings: heights(plan.buildings.map((b) => b.height)),
      rocks: heights(plan.rocks.map((r) => r.height)),
      ambientTrees: heights(landscape.filter((p) => p.kind === "tree").map((p) => p.height)),
      poiTrees: heights((plan.landscapes ?? []).filter((p) => p.role === "poi").map((p) => p.height))
    },
    spawn: {
      eye,
      rayCount: depths.length,
      maxDistanceM: 200,
      nearBlockFraction: depths.filter((d) => d < 30).length / depths.length,
      clearPast100MFraction: depths.filter((d) => d >= 100).length / depths.length,
      distancesM: depths
    },
    note: "出生点水平射线含地形和真实OBB；未命中记为200m。不是屏幕占比、道路安全感或心理地图评分。"
  };
}
