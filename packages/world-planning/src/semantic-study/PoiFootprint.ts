import type { IslandPlan, PlanPoint } from "./IslandPlanModel";
import type { PoiSite } from "./PoiDistribution";
import type { PlanningCheck, SemanticEdit } from "./WorldPlanningContract";

/** A selectable allocation envelope; it is neither a distribution cell nor a physical fence. */
export function poiRangeOutline(site: PoiSite): PlanPoint[] {
  const radius = site.radiusM;
  if (radius === undefined) return [];
  return Array.from({ length: 64 }, (_, i) => ({
    x: site.center.x + radius * Math.cos((i * Math.PI) / 32),
    z: site.center.z + radius * Math.sin((i * Math.PI) / 32)
  }));
}

/** Measure content, including independently transformed children, but not ambient scenery or world roads. */
export function publishPoiFootprints(plan: IslandPlan, edits: Record<string, SemanticEdit>): PlanningCheck[] {
  const children = new Map<string, Set<string>>();
  const add = (parent: string, id: string) => {
    const ids = children.get(parent) ?? new Set<string>();
    ids.add(id);
    children.set(parent, ids);
  };
  for (const m of plan.planning?.modules ?? []) for (const id of m.memberIds ?? []) add(m.id, id);
  for (const b of plan.buildings) add(b.regionId, b.id);
  for (const r of plan.rocks) add(r.groupId, r.id);
  for (const w of plan.waters) if (w.systemId) add(w.systemId, w.id);
  const geometry = new Map<string, PlanPoint[]>();
  for (const item of [
    ...plan.regions,
    ...plan.mountains,
    ...plan.buildings,
    ...plan.rocks,
    ...plan.waters,
    ...plan.routes,
    ...(plan.plazas ?? []),
    ...(plan.landscapes ?? []).filter((p) => p.role === "poi")
  ])
    geometry.set(item.id, item.outline ?? []);
  const checks: PlanningCheck[] = [];
  for (const site of plan.poiDistribution?.sites ?? []) {
    const ids = new Set<string>(),
      queue = [...site.memberIds];
    for (let i = 0; i < queue.length; i++) {
      if (ids.has(queue[i])) continue;
      ids.add(queue[i]);
      queue.push(...(children.get(queue[i]) ?? []));
    }
    let needed = 0,
      farthest = site.id;
    for (const id of ids)
      for (const p of geometry.get(id) ?? []) {
        const distance = Math.hypot(p.x - site.center.x, p.z - site.center.z);
        if (distance > needed) {
          needed = distance;
          farthest = id;
        }
      }
    site.contentRadiusM = needed;
    const requested = edits[site.id]?.poi?.radiusM;
    // Empty points have no invented territory. A user may explicitly allocate one later.
    site.radiusM = needed ? Math.ceil(needed * 2) / 2 : requested;
    if (requested !== undefined) {
      const valid = Number.isFinite(requested) && requested >= 1 && requested <= 1024 && needed <= requested + 1e-6;
      checks.push({
        id: `poi-range:${site.id}`,
        rule: "poi-content-range",
        owners: [site.id, farthest],
        required: false,
        status: valid ? "pass" : "fail",
        message: valid
          ? `${site.id} 内容半径 ${needed.toFixed(1)} m，允许 ${requested.toFixed(1)} m`
          : `${site.id} 可用半径 ${requested.toFixed(1)} m 不足：${farthest} 最远占地需要 ${needed.toFixed(1)} m；请扩大范围或缩小内容`
      });
    }
  }
  return checks;
}
