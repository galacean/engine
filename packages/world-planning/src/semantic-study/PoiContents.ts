import type { IslandPlan } from "./IslandPlanModel";
import type { PoiSite } from "./PoiDistribution";

/** Resolve composition ownership from published relations, never from names or ID prefixes. */
const indexes = new WeakMap<IslandPlan, { members: Map<string, string[]>; owners: Map<string, PoiSite> }>();
/** Snapshot identity is valid here: views consume immutable published plans only. */
function compositionIndex(plan: IslandPlan) {
  const cached = indexes.get(plan);
  if (cached) return cached;
  const edges: [string, string][] = [
    ...(plan.planning?.modules ?? []).flatMap((m) => (m.memberIds ?? []).map((id) => [m.id, id] as [string, string])),
    ...plan.buildings.map((b) => [b.regionId, b.id] as [string, string]),
    ...plan.rocks.map((r) => [r.groupId, r.id] as [string, string]),
    ...plan.waters.filter((w) => w.systemId).map((w) => [w.systemId!, w.id] as [string, string]),
    ...(plan.planning?.ports ?? []).map((p) => [p.ownerId, p.id] as [string, string]),
    ...(plan.landscapes ?? []).filter((p) => p.poiId).map((p) => [p.poiId!, p.id] as [string, string]),
    ...(plan.courtyards ?? []).flatMap(
      (c) => [[c.regionId, c.id], [c.id, c.path.id], ...c.fences.map((f) => [c.id, f.id])] as [string, string][]
    )
  ];
  const children = new Map<string, string[]>();
  for (const [parent, id] of edges) {
    const list = children.get(parent);
    if (list) list.push(id);
    else children.set(parent, [id]);
  }
  const index = { members: new Map<string, string[]>(), owners: new Map<string, PoiSite>() };
  for (const site of plan.poiDistribution?.sites ?? []) {
    const ids = new Set<string>(),
      queue = [site.id, ...site.memberIds];
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i];
      if (ids.has(id)) continue;
      ids.add(id);
      queue.push(...(children.get(id) ?? []));
    }
    index.members.set(site.id, [...ids]);
    for (const id of ids) if (!index.owners.has(id)) index.owners.set(id, site);
  }
  indexes.set(plan, index);
  return index;
}
export function poiMemberIds(plan: IslandPlan, site: PoiSite): string[] {
  return compositionIndex(plan).members.get(site.id) ?? [site.id, ...site.memberIds];
}
export function poiForElement(plan: IslandPlan, id: string | null): PoiSite | undefined {
  return id ? compositionIndex(plan).owners.get(id) : undefined;
}
export function poiContentLabel(plan: IslandPlan, site: PoiSite): string {
  if (plan.spatialLayout) return `POI ${(plan.poiDistribution?.sites.indexOf(site) ?? -1) + 1}`;
  return (
    site.memberIds
      .map(
        (id) =>
          plan.mountains.find((m) => m.id === id)?.label ??
          plan.regions.find((r) => r.id === id)?.label ??
          (plan.landscapes?.some((p) => p.id === id && p.role === "poi") ? "高树" : id)
      )
      .join(" · ") || "未填充位置"
  );
}
