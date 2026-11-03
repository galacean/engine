import type { IslandPlan, PlanPoint } from "./IslandPlanModel";
import { createPlanningGroundSampler } from "./WorldPlanningTerrain";
import { sampleScalarGrid, scalarContours } from "./WorldScalarContours";

/** Fixed absolute metre stops: changing a world's range never recolours the same height. */
export const TERRAIN_COLORS = [
  [0, 179, 200, 137],
  [20, 203, 207, 145],
  [40, 214, 185, 129],
  [60, 183, 143, 104],
  [100, 145, 114, 88],
  [160, 232, 225, 211],
  [300, 249, 248, 242]
] as const;
/** Interpolate an absolute elevation colour, independent of POI ownership. */
export function terrainColor(height: number): string {
  const stops = TERRAIN_COLORS;
  let i = 0;
  while (i < stops.length - 2 && height > stops[i + 1][0]) i++;
  const a = stops[i],
    b = stops[i + 1],
    t = Math.max(0, Math.min(1, (height - a[0]) / (b[0] - a[0])));
  return `rgb(${[1, 2, 3].map((k) => Math.round(a[k] + (b[k] - a[k]) * t)).join(",")})`;
}
const cache = new WeakMap<IslandPlan, string>();
const path = (points: PlanPoint[]) =>
  points.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.z.toFixed(1)}`).join(" ");
/** Project final ground into contour bands. No square heatmap tiles or POI-radius overlays.
 * @param plan Immutable resolved snapshot, sharing its sampler with Terrain and route validation.
 * @returns A toggleable elevation colour layer with ten-metre contours, without numeric annotations.
 */
export function drawPlanningTerrain(plan: IslandPlan): string {
  if (plan.canyonStudy || !plan.planning) return "";
  const cached = cache.get(plan);
  if (cached !== undefined) return cached;
  const sample = createPlanningGroundSampler(plan);
  const grid = sampleScalarGrid(0, 0, plan.parameters.width, plan.parameters.depth, 12, sample);
  const max = Math.max(0, ...grid.values);
  let bands = `<rect width="${plan.parameters.width}" height="${plan.parameters.depth}" fill="${terrainColor(0)}"/>`,
    contours = "";
  for (let level = 5; level <= max; level += 5) {
    const lines = scalarContours(grid, level);
    const closed = lines.filter(
      (points) => Math.hypot(points[0].x - points.at(-1)!.x, points[0].z - points.at(-1)!.z) < 0.01
    );
    if (closed.length)
      bands += `<path data-height-band="${level}" d="${closed.map((points) => path(points) + " Z").join(" ")}" fill="${terrainColor(level)}" fill-rule="evenodd"/>`;
    if (level % 10 !== 0) continue;
    for (const points of lines) {
      const length = points.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - points[i].x, p.z - points[i].z), 0);
      if (length < 48) continue;
      contours += `<path data-height-contour="${level}" d="${path(points)}" fill="none" stroke="#6c563f" stroke-opacity="${level % 20 === 0 ? 0.75 : 0.4}" stroke-width="${level % 20 === 0 ? 1.1 : 0.65}" vector-effect="non-scaling-stroke"/>`;
    }
  }
  const body = `<g data-plan-layer="height" data-terrain-map="true" pointer-events="none"><g clip-path="url(#base-land)">${bands}${contours}</g></g>`;
  cache.set(plan, body);
  return body;
}
