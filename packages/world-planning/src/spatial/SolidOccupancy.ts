import type { IslandPlan, PlanPoint } from "../semantic-study/IslandPlanModel";
import { contains, overlap } from "../semantic-study/WorldPlanningGeometry";
/** Same footprint predicate for proposals and transaction validation; publication remains authoritative. */
export function solidOccupancy(plan: IslandPlan, outline: PlanPoint[]) {
  const blockers = [...plan.rocks, ...plan.buildings, ...plan.waters, ...(plan.plazas ?? [])].filter((p) =>
    overlap(p.outline, outline)
  );
  const inside = [plan.land, ...plan.islands].some((r) => contains(r, outline));
  return { valid: inside && !blockers.length, inside, blockers };
}
