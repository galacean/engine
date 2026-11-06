import type { IslandPlan, PlanBuilding, PlanPlace, PlanPoint } from "./IslandPlanModel";
import { contains, inRing, overlap, validRing } from "./WorldPlanningGeometry";

/** Fit optional paving around street centres after building footprints are final.
 * @param candidates Seeded paving shapes; their centres and identities stay stable.
 * @param buildings Published buildings, which take priority over paving.
 * @param outline Owning settlement boundary in world metres.
 * @returns Unchanged or reduced plazas; occupied centres and collapsed shapes are omitted.
 */
export function fitSettlementPlazas(
  candidates: readonly PlanPlace[],
  buildings: readonly PlanBuilding[],
  outline: PlanPoint[]
): PlanPlace[] {
  return candidates.flatMap((plaza) => {
    const clear = (ring: PlanPoint[]) =>
      contains(outline, ring) && !buildings.some((building) => overlap(ring, building.outline));
    if (clear(plaza.outline) && validRing(plaza.outline)) return [plaza];
    if (!inRing(plaza.center, outline) || buildings.some((b) => inRing(plaza.center, b.outline))) return [];
    const scaled = (scale: number) =>
      plaza.outline.map((point) => ({
        x: plaza.center.x + (point.x - plaza.center.x) * scale,
        z: plaza.center.z + (point.z - plaza.center.z) * scale
      }));
    // Seeded plaza outlines are radial about their centres. Nested reductions preserve
    // that shape; binary refinement finds free space without moving roads or houses.
    let low = 0,
      high = 1;
    for (let iteration = 0; iteration < 24; iteration++) {
      const scale = (low + high) / 2;
      if (clear(scaled(scale))) low = scale;
      else high = scale;
    }
    const fitted = scaled(low);
    return validRing(fitted) && clear(fitted) ? [{ ...plaza, outline: fitted }] : [];
  });
}

/** Refresh optional village paving after instance edits, before ecology consumes it.
 * Street ports are independent of paving and remain even when a plaza disappears.
 * @param plan Transaction-owned candidate plan; places and module membership are updated together.
 */
export function adaptSettlementPlazas(plan: IslandPlan): void {
  const prior = plan.plazas ?? [];
  const candidates = plan.plazaCandidates ?? prior;
  if (!candidates.length) return;
  const adapted = new Map(candidates.map((p) => [p.id, p]));
  for (const module of plan.planning?.modules ?? []) {
    if (module.kind !== "village") continue;
    const owned = candidates.filter(
      (p) =>
        module.memberIds?.includes(p.id) ||
        plan.planning?.ports.some((port) => port.id === p.id && port.ownerId === module.id)
    );
    const fitted = fitSettlementPlazas(owned, plan.buildings, module.outline);
    for (const p of owned) adapted.delete(p.id);
    for (const p of fitted) adapted.set(p.id, p);
    const ownedIds = new Set(owned.map((p) => p.id));
    module.memberIds = [...(module.memberIds ?? []).filter((id) => !ownedIds.has(id)), ...fitted.map((p) => p.id)];
    module.resolved.plazas = fitted.length;
  }
  const candidateIds = new Set(candidates.map((p) => p.id));
  plan.plazas = candidates.flatMap((p) => (adapted.has(p.id) ? [adapted.get(p.id)!] : []));
  plan.places = [...plan.places.filter((p) => !candidateIds.has(p.id)), ...plan.plazas];
}
