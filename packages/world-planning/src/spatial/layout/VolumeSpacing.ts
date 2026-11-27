import type { PlanPoint } from "../../semantic-study/IslandPlanModel";
import { overlap, segmentGap } from "../../semantic-study/WorldPlanningGeometry";
import { boxOutline, type Volume, type VolumeBox } from "./Volumes";

/** Cache only within one solve: callers may edit boxes between solves. */
function gapQuery() {
  const footprints = new WeakMap<
    VolumeBox,
    { points: PlanPoint[]; minX: number; maxX: number; minZ: number; maxZ: number }
  >();
  const footprint = (box: VolumeBox) => {
    let result = footprints.get(box);
    if (!result) {
      const points = boxOutline(box);
      result = {
        points,
        minX: Math.min(...points.map((p) => p.x)),
        maxX: Math.max(...points.map((p) => p.x)),
        minZ: Math.min(...points.map((p) => p.z)),
        maxZ: Math.max(...points.map((p) => p.z))
      };
      footprints.set(box, result);
    }
    return result;
  };
  return (a: Volume, b: Volume, limit = Infinity): number => {
    let gap = limit;
    for (const aa of a.boxes)
      for (const bb of b.boxes) {
        const fa = footprint(aa),
          fb = footprint(bb);
        // AABB separation is a lower bound on exact rotated edge clearance.
        const dx = Math.max(0, fa.minX - fb.maxX, fb.minX - fa.maxX);
        const dz = Math.max(0, fa.minZ - fb.maxZ, fb.minZ - fa.maxZ);
        if (Math.hypot(dx, dz) >= gap) continue;
        const pa = fa.points,
          pb = fb.points;
        if (overlap(pa, pb)) return 0;
        for (const [p, q] of [
          [pa, pb],
          [pb, pa]
        ])
          for (const v of p)
            for (let i = 0; i < q.length; i++) gap = Math.min(gap, segmentGap(v, q[i], q[(i + 1) % q.length]));
      }
    return gap;
  };
}

/** Horizontal edge clearance across all parts; self-parts are intentionally not compared. */
export function volumeGap(a: Volume, b: Volume): number {
  return gapQuery()(a, b);
}
