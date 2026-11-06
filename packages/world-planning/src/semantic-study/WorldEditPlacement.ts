import type { PlanPoint } from "./IslandPlanModel";
import type { WorldObjectEdits } from "./WorldLayoutModel";
/** Current local-edit reservations are derived from the saved instance, not a new random site. */
export function activePlacement(edits: WorldObjectEdits, id: string): boolean {
  const p = edits[id]?.placement;
  return !!p && (p.priority ?? 0) === Math.max(0, ...Object.values(edits).map((e) => e.placement?.priority ?? 0));
}
export function editFootprints(edits: WorldObjectEdits, except: string): PlanPoint[][] {
  return Object.entries(edits).flatMap(([id, e]) => {
    const p = e.placement;
    if (
      id === except ||
      !p ||
      !activePlacement(edits, id) ||
      (!id.startsWith("mountain-") && !id.startsWith("village-") && !id.startsWith("teleport-"))
    )
      return [];
    const s = Math.sqrt((e.size ?? 1) / p.size);
    return p.footprints.map((r) =>
      r.map((v) => ({ x: p.origin.x + (v.x - p.origin.x) * s, z: p.origin.z + (v.z - p.origin.z) * s }))
    );
  });
}
