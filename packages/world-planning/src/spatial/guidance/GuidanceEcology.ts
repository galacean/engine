import type { IslandPlan, PlanLandscape, PlanPoint } from "../../semantic-study/IslandPlanModel";
import { boundsOverlap, overlap, polygonBounds } from "../../semantic-study/WorldPlanningGeometry";

/** Derived scenery yields to road guidance; its exact source order is retained for the next solve. */
export interface GuidanceEcologyExclusion {
  originalIndex: number;
  element: PlanLandscape;
}

/** Resolve automatic scenery that may yield inside accepted road-guidance footprints.
 * Explicit edits, locked instances and POI contents remain protected. Exclusions retain
 * their original indices so the next solve can restore the exact baseline without regeneration.
 */
export function prepareGuidanceEcology(plan: IslandPlan, protectedIds: ReadonlySet<string>) {
  const candidates = new Map(
    (plan.landscapes ?? []).flatMap((element, originalIndex) =>
      element.role === "ambient" && !element.locked && !protectedIds.has(element.id)
        ? [[element.id, { element, originalIndex, bounds: polygonBounds(element.outline) }] as const]
        : []
    )
  );
  return {
    canYield: (id: string | undefined) => id !== undefined && candidates.has(id),
    exclude(outline: PlanPoint[]): GuidanceEcologyExclusion[] {
      const bounds = polygonBounds(outline),
        exclusions: GuidanceEcologyExclusion[] = [];
      for (const [id, candidate] of candidates) {
        if (!boundsOverlap(bounds, candidate.bounds) || !overlap(outline, candidate.element.outline)) continue;
        exclusions.push({ originalIndex: candidate.originalIndex, element: candidate.element });
        candidates.delete(id);
      }
      if (exclusions.length) {
        const removed = new Set(exclusions.map((item) => item.element.id));
        plan.landscapes = plan.landscapes?.filter((element) => !removed.has(element.id));
      }
      return exclusions;
    }
  };
}

/** Restore exclusions in source order without changing unrelated instances. */
export function restoreGuidanceEcology(
  landscapes: PlanLandscape[] | undefined,
  exclusions: GuidanceEcologyExclusion[]
): PlanLandscape[] | undefined {
  if (!exclusions.length) return landscapes;
  const restored = [...(landscapes ?? [])];
  for (const item of [...exclusions].sort((a, b) => a.originalIndex - b.originalIndex))
    restored.splice(item.originalIndex, 0, item.element);
  return restored;
}

/** Publication and rollback expose the same actual population through module ownership. */
export function refreshGuidanceEcologyModule(plan: IslandPlan): void {
  if (!plan.planning) return;
  const landscapes = plan.landscapes ?? [];
  plan.planning.modules = plan.planning.modules.map((module) =>
    module.id !== "landscape"
      ? module
      : {
          ...module,
          memberIds: landscapes.map((element) => element.id),
          resolved: {
            ...module.resolved,
            instances: landscapes.length,
            trees: landscapes.filter((element) => element.kind === "tree").length,
            rocks: landscapes.filter((element) => element.kind === "rock").length
          }
        }
  );
}
