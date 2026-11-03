import type { IslandPlan, PlanPoint } from "./IslandPlanModel";
import { overlap } from "./WorldPlanningGeometry";
import { ribbonOutline } from "./WorldRibbon";
/** Local, bounded footprint check. No global solving, relocation or automatic retries. */
export function newLandformCollisions(before: IslandPlan, after: IslandPlan, owners: ReadonlySet<string>): string[] {
  const bounds = (r: PlanPoint[]) => ({
    x: Math.min(...r.map((p) => p.x)),
    z: Math.min(...r.map((p) => p.z)),
    xx: Math.max(...r.map((p) => p.x)),
    zz: Math.max(...r.map((p) => p.z))
  });
  const obstacles = [
    ...before.routes.map((r) => ({ id: r.id, ring: r.outline ?? ribbonOutline(r.points, [r.width]) })),
    ...before.bridges.map((b) => ({ id: b.id, ring: ribbonOutline([b.a, b.b], [b.width]) })),
    ...before.buildings.map((b) => ({ id: b.id, ring: b.outline })),
    ...before.rocks.filter((r) => !owners.has(r.groupId)).map((r) => ({ id: r.id, ring: r.obb }))
  ]
    .filter((o) => o.ring.length >= 3)
    .map((o) => ({ ...o, b: bounds(o.ring) }));
  const conflicts = (plan: IslandPlan) => {
    const hits = new Set<string>();
    for (const rock of plan.rocks) {
      if (!owners.has(rock.groupId)) continue;
      const a = bounds(rock.obb);
      for (const o of obstacles) {
        if (a.xx < o.b.x || o.b.xx < a.x || a.zz < o.b.z || o.b.zz < a.z) continue;
        if (overlap(rock.obb, o.ring)) hits.add(rock.groupId + ":" + o.id);
      }
    }
    return hits;
  };
  const existing = conflicts(before);
  return [...conflicts(after)].filter((id) => !existing.has(id));
}
