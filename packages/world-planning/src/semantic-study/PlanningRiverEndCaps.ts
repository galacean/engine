import type { RiverNetworkDescriptor } from "@galacean/engine-water/water/index";
import type { RiverPathControlPoint } from "@galacean/engine-water/water/authoring/river/RiverAuthoringTypes";
import type { PlanPoint } from "./IslandPlanModel";
import { createPlanningRingQuery } from "./WorldPlanningTerrain";

/** Realize the round terminal footprints already owned and carved by the Planner.
 * Ordinary River ribbons retain their flat-cut contract; drop boundaries and all
 * published path anchors remain untouched. Terrain supplies the cap's wet depth.
 */
export function planningRiverEndCaps(source: RiverNetworkDescriptor, outline: PlanPoint[]): RiverNetworkDescriptor {
  if (!outline.length || !source.segments.length) return source;
  const ring = createPlanningRingQuery(outline);
  for (const start of [true, false]) {
    const segment = start ? source.segments[0] : source.segments.at(-1)!;
    const points = segment.curve.points;
    if (points.length < 2) continue;
    const endpoint = start ? points[0] : points.at(-1)!;
    const neighbour = start ? points[1] : points.at(-2)!;
    const dx = endpoint.position[0] - neighbour.position[0],
      dz = endpoint.position[2] - neighbour.position[2],
      length = Math.hypot(dx, dz),
      width = endpoint.width ?? source.defaults.shape.width,
      radius = width / 2;
    if (!length) continue;
    // WorldRibbon's semicircle has eight edges. These sections reproduce its
    // three paired vertices and close just short of its apex. A <=2 cm tip keeps
    // the positive-width River contract without introducing degenerate triangles.
    const tipWidth = Math.min(0.02, width * 0.02);
    const cap: RiverPathControlPoint[] = [];
    for (let step = 1; step <= 4; step++) {
      const angle = (step * Math.PI) / 8;
      const along = step === 4 ? radius - (tipWidth / 2) * Math.tan(Math.PI / 16) : radius * Math.sin(angle);
      cap.push({
        id: `${endpoint.id}:cap:${start ? "start" : "end"}:${step}`,
        position: [
          endpoint.position[0] + (dx / length) * along,
          endpoint.position[1],
          endpoint.position[2] + (dz / length) * along
        ],
        width: step === 4 ? tipWidth : width * Math.cos(angle),
        depth: endpoint.depth,
        flowSpeed: endpoint.flowSpeed,
        bankFeather: endpoint.bankFeather
      });
    }
    // Tight-bend trimming can remove part of a round cap. Check its complete
    // footprint before extending water beyond the original terminal section.
    const left: PlanPoint[] = [],
      right: PlanPoint[] = [];
    for (const point of [endpoint, ...cap]) {
      const halfWidth = (point.width ?? width) / 2;
      const x = point.position[0],
        z = point.position[2];
      left.push({ x: x - (dz / length) * halfWidth, z: z + (dx / length) * halfWidth });
      right.push({ x: x + (dz / length) * halfWidth, z: z - (dx / length) * halfWidth });
    }
    if (!ring.containsPolygon([...left, ...right.reverse()], 1e-6)) continue;
    const tip = cap.at(-1)!;
    segment.curve.points = start ? [...cap.reverse(), ...points] : [...points, ...cap];
    const node = source.nodes.find((node) => node.id === (start ? segment.from : segment.to));
    if (node) {
      node.position = [...tip.position];
      node.elevation = tip.position[1];
    }
  }
  return source;
}
