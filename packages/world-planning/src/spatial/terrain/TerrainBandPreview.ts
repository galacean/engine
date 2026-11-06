import type { IslandPlan, PlanPoint } from "../../semantic-study/IslandPlanModel";
import { reliefSection } from "./ReliefField";

/** Optional non-pickable overlay of the exact authored band support, axis and positive longitudinal direction. */
export function drawTerrainBands(plan: IslandPlan): string {
  const path = (points: PlanPoint[]) =>
    points.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(2)},${p.z.toFixed(2)}`).join(" ");
  const bodies = (plan.parameters.terrainPatches ?? [])
    .filter((q) => q.id.startsWith("terrain-band:"))
    .map((q) => {
      const angle = (q.yawDegrees * Math.PI) / 180,
        c = Math.cos(angle),
        s = Math.sin(angle);
      const point = (t: number, side: number) => {
        const a = reliefSection(q, t),
          cross = a.across + (side < 0 ? -a.left : a.right) * Math.abs(side);
        return { x: q.x + a.along * c - cross * s, z: q.z + a.along * s + cross * c };
      };
      const ts = Array.from({ length: 41 }, (_, i) => i / 40),
        axis = ts.map((t) => point(t, 0));
      const ring = [...ts.map((t) => point(t, -1)), ...ts.map((t) => point(t, 1)).reverse()];
      const arrows = [0.25, 0.5, 0.75]
        .map((t) => {
          const a = point(t - 0.01, 0),
            b = point(t, 0),
            heading = Math.atan2(b.z - a.z, b.x - a.x);
          const wing = (turn: number) => ({
            x: b.x - 9 * Math.cos(heading + turn),
            z: b.z - 9 * Math.sin(heading + turn)
          });
          return `<path d="${path([wing(-0.5), b, wing(0.5)])}" fill="none" stroke="#75548d" stroke-width="2" vector-effect="non-scaling-stroke"/>`;
        })
        .join("");
      return `<g data-terrain-band="${q.id}"><path d="${path(ring)} Z" fill="#9973b3" fill-opacity=".10" stroke="#75548d" stroke-width="1" stroke-dasharray="6 4" vector-effect="non-scaling-stroke"/><path data-band-axis="true" d="${path(axis)}" fill="none" stroke="#75548d" stroke-width="1.5" stroke-dasharray="10 4" vector-effect="non-scaling-stroke"/>${arrows}</g>`;
    })
    .join("");
  return `<g data-plan-layer="terrain-bands" pointer-events="none" clip-path="url(#base-land)">${bodies}</g>`;
}
