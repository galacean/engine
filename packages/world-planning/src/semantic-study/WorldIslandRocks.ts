import { envelope } from "./IslandPlanAtoms";
import type { PlanPoint, PlanRock } from "./IslandPlanModel";
import { createMountainChain } from "./WorldMountainChain";
import { createPlanningRingQuery } from "./WorldPlanningTerrain";
import { ringArea } from "./WorldPlanningGeometry";

/** Fit a crown and its shoulders to the island's actual interior.
 * @param id Stable island owner.
 * @param outline Authoritative island boundary in world metres.
 * @param random World-seeded identity stream.
 * @returns Individual rock envelopes, all contained by the island shoreline.
 */
export function buildIslandRocks(id: string, outline: PlanPoint[], random: (key: string) => number): PlanRock[] {
  const query = createPlanningRingQuery(outline),
    area = ringArea(outline);
  const bounds = {
    x0: Math.min(...outline.map((p) => p.x)),
    x1: Math.max(...outline.map((p) => p.x)),
    z0: Math.min(...outline.map((p) => p.z)),
    z1: Math.max(...outline.map((p) => p.z))
  };
  const candidates: PlanPoint[] = [];
  // Interior clearance chooses a usable centre independently of contour vertex density.
  for (let iz = 1; iz < 10; iz++)
    for (let ix = 1; ix < 10; ix++) {
      const p = {
        x: bounds.x0 + ((bounds.x1 - bounds.x0) * ix) / 10,
        z: bounds.z0 + ((bounds.z1 - bounds.z0) * iz) / 10
      };
      if (query.inside(p)) candidates.push(p);
    }
  candidates.sort((a, b) => query.distance(b, Infinity) - query.distance(a, Infinity));
  const count = Math.max(3, Math.min(7, Math.round(Math.sqrt(area) / 45)));
  let best: PlanRock[] = [],
    bestSpan = 0;
  // Compare principal directions against the real coast, rather than filling its bounding box.
  for (let turn = 0; turn < 6; turn++) {
    const angle = (turn / 6 + random(`${id}-rock-axis`) / 6) * Math.PI,
      cos = Math.cos(angle),
      sin = Math.sin(angle);
    const along = outline.map((p) => p.x * cos + p.z * sin),
      across = outline.map((p) => -p.x * sin + p.z * cos);
    const span = (Math.max(...along) - Math.min(...along)) * 0.72,
      width = Math.min((Math.max(...across) - Math.min(...across)) * 0.6, span * 0.5);
    const chain = createMountainChain({ id, span, width, angle, count, random });
    for (const center of candidates.slice(0, 3))
      for (const factor of [1, 0.85, 0.7, 0.55, 0.4]) {
        if (span * factor <= bestSpan) continue;
        const rocks = chain.blocks.map((b, i): PlanRock => {
          const at = { x: center.x + b.x * factor, z: center.z + b.z * factor },
            w = b.width * factor,
            d = b.length * factor,
            yaw = (b.yaw * Math.PI) / 180,
            obb = envelope(at, w, d, yaw);
          const height =
            (25 + random(`${id}-prominence`) * 35) *
            (i === 0 ? 1 : Math.max(0.25, 0.78 - Math.ceil(i / 2) * 0.13)) *
            (0.9 + random(`${id}-rock-height-${i}`) * 0.2);
          const shape = [
            [-0.45, -0.32],
            [-0.17, -0.48],
            [0.33, -0.42],
            [0.48, -0.09],
            [0.35, 0.44],
            [-0.31, 0.46],
            [-0.48, 0.1]
          ].map(([x, z]) => ({
            x: at.x + x * w * Math.cos(yaw) - z * d * Math.sin(yaw),
            z: at.z + x * w * Math.sin(yaw) + z * d * Math.cos(yaw)
          }));
          return {
            id: `${id}-rock-${i}`,
            groupId: id,
            center: at,
            width: w,
            depth: d,
            yaw,
            height,
            role: i === 0 ? "peak" : i < count - 2 ? "shoulder" : "skirt",
            obb,
            outline: shape
          };
        });
        if (
          rocks.every(
            (r) =>
              Math.min(r.width, r.depth) >= 4 && r.obb.every((p, j) => query.containsSegment(p, r.obb[(j + 1) % 4], 3))
          )
        ) {
          best = rocks;
          bestSpan = span * factor;
          break;
        }
      }
  }
  return best;
}
