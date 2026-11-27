import type { IslandPlan, PlanPoint } from "./IslandPlanModel";
import { planningHeightmap } from "./PlanningHeightmap";
/** Intersect the canonical ground raster, rather than the old coarse picking mesh. */
export function pickPlanningGround(
  plan: IslandPlan,
  origin: { x: number; y: number; z: number },
  direction: { x: number; y: number; z: number }
): PlanPoint | undefined {
  const map = planningHeightmap(plan),
    low = [0, map.decodeOffset, 0],
    high = [plan.parameters.width, map.decodeOffset + map.decodeScale, plan.parameters.depth];
  let enter = 0,
    exit = 12000;
  for (const [i, key] of (["x", "y", "z"] as const).entries()) {
    const d = direction[key],
      o = origin[key];
    if (Math.abs(d) < 1e-8) {
      if (o < low[i] || o > high[i]) return;
      continue;
    }
    const a = (low[i] - o) / d,
      b = (high[i] - o) / d;
    enter = Math.max(enter, Math.min(a, b));
    exit = Math.min(exit, Math.max(a, b));
  }
  if (enter > exit) return;
  const p = (t: number) => ({ x: origin.x + direction.x * t, z: origin.z + direction.z * t });
  const difference = (t: number) => origin.y + direction.y * t - map.sample(p(t));
  let last = enter;
  for (let t = enter; t <= exit + 0.5; t += 0.5) {
    const current = Math.min(t, exit);
    if (difference(current) <= 0) {
      let a = last,
        b = current;
      for (let i = 0; i < 16; i++) {
        const mid = (a + b) / 2;
        if (difference(mid) > 0) a = mid;
        else b = mid;
      }
      return p((a + b) / 2);
    }
    last = current;
    if (current === exit) break;
  }
}
