import type { IslandPlan, PlanPoint } from "../../semantic-study/IslandPlanModel";
import { ringArea } from "../../semantic-study/WorldPlanningGeometry";
import type { PoiSite } from "../../semantic-study/PoiDistribution";
import { createPlanningRingQuery } from "../../semantic-study/WorldPlanningTerrain";
import { createRegionOwnership } from "../regions/RegionOwnership";
import { poiTerritoryWeights } from "../../semantic-study/PoiDistribution";

/** Invalidates derived partitions without rerolling seed-based author parameter initialization. */
export const POI_TERRITORY_VERSION = 4;
/** Spatial management cell; content footprint and spacing remain independent. The cell is intersected with its land domain. */
export interface PoiTerritory {
  id: string;
  poiId: string;
  domainId: string;
  outline: PlanPoint[];
  /** Power offset in squared metres, independent of member count, dimensions and presentation. */
  weightM2: number;
}
const cells = new WeakMap<IslandPlan, { key: string; value: PoiTerritory[] }>();
const lookups = new WeakMap<IslandPlan, { key: string; value: ReturnType<typeof createTerritoryLookup> }>();
const areas = new WeakMap<IslandPlan, { key: string; value: ReadonlyMap<string, number> }>();
function siteKey(plan: IslandPlan): string {
  return JSON.stringify([
    plan.parameters.width,
    plan.parameters.depth,
    poiTerritoryWeights(plan.poiDistribution ?? {}),
    plan.poiDistribution?.sites.map((s) => [s.id, s.tier, s.center.x, s.center.z, s.domainId])
  ]);
}
/** Clip a convex power cell by its shared weighted bisector. */
function clip(points: PlanPoint[], a: PoiSite, b: PoiSite, aWeight: number, bWeight: number): PlanPoint[] {
  const dx = b.center.x - a.center.x,
    dz = b.center.z - a.center.z,
    k = (b.center.x ** 2 + b.center.z ** 2 - a.center.x ** 2 - a.center.z ** 2 + aWeight - bWeight) / 2;
  const side = (p: PlanPoint) => p.x * dx + p.z * dz - k,
    result: PlanPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i],
      q = points[(i + 1) % points.length],
      u = side(p),
      v = side(q);
    if (u <= 0) result.push(p);
    if (u <= 0 !== v <= 0) {
      const t = u / (u - v);
      result.push({ x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t });
    }
  }
  return result;
}
/** Publish tier-weighted management cells without changing anchors or resizing content.
 * Land clipping remains explicit in each cell's domain; equal tier weights recover ordinary Voronoi ownership.
 * @param partitionByDomain Partition islands independently for land management;
 * false partitions all anchors together for rock generation across land and sea.
 */
export function poiTerritories(plan: IslandPlan, partitionByDomain = true): PoiTerritory[] {
  const key = JSON.stringify([siteKey(plan), partitionByDomain]),
    saved = cells.get(plan);
  if (saved?.key === key) return saved.value;
  const sites = plan.poiDistribution?.sites ?? [],
    { width, depth } = plan.parameters;
  const preferences = poiTerritoryWeights(plan.poiDistribution ?? {});
  const minimumWeight = Math.min(...Object.values(preferences)),
    maximumWeight = Math.max(...Object.values(preferences));
  const weights = new Map(
    sites.map((a) => {
      const nearestSquared = Math.min(
        Infinity,
        ...sites
          .filter((b) => a.id !== b.id && (!partitionByDomain || a.domainId === b.domainId))
          .map((b) => (a.center.x - b.center.x) ** 2 + (a.center.z - b.center.z) ** 2)
      );
      // The local nearest-anchor scale prevents a preferred cell from consuming another anchor.
      // This bounds the partition weight, not the size or height of anything placed in the cell.
      const weight = preferences[a.tier];
      return [
        a.id,
        Number.isFinite(nearestSquared) ? nearestSquared * ((weight - minimumWeight) / maximumWeight) : 0
      ] as const;
    })
  );
  const value = sites.map((a) => {
    let outline = [
      { x: 0, z: 0 },
      { x: width, z: 0 },
      { x: width, z: depth },
      { x: 0, z: depth }
    ];
    for (const b of sites)
      if (a.id !== b.id && (!partitionByDomain || a.domainId === b.domainId))
        outline = clip(outline, a, b, weights.get(a.id)!, weights.get(b.id)!);
    return { id: "territory:" + a.id, poiId: a.id, domainId: a.domainId, outline, weightM2: weights.get(a.id)! };
  });
  cells.set(plan, { key, value });
  return value;
}
/** Shared ownership and finite boundary blending for flowers and scenery. No content radius cuts off ecology. */
export function territoryLookup(plan: IslandPlan) {
  const key = JSON.stringify([siteKey(plan), plan.poiDistribution?.domains]);
  const saved = lookups.get(plan);
  if (saved?.key === key) return saved.value;
  const value = createTerritoryLookup(plan);
  lookups.set(plan, { key, value });
  return value;
}
function createTerritoryLookup(plan: IslandPlan) {
  const sites = plan.poiDistribution?.sites ?? [];
  const weights = new Map(poiTerritories(plan).map((cell) => [cell.poiId, cell.weightM2]));
  const domains = (plan.poiDistribution?.domains ?? []).map((d) => {
    const domainSites = sites.filter((site) => site.domainId === d.id);
    return {
      ...d,
      query: createPlanningRingQuery(d.outline),
      sites: domainSites,
      ownership: createRegionOwnership(domainSites.map((site) => ({ ...site, weightM2: weights.get(site.id) })))
    };
  });
  return (p: PlanPoint, blendM = 0): { site: PoiSite; distance: number; weight: number }[] => {
    const domain = domains.find((d) => d.query.inside(p));
    if (!domain?.sites.length) return [];
    return domain
      .ownership(p, blendM)
      .map(({ index, distance, weight }) => ({ site: domain.sites[index], distance, weight }));
  };
}

/** Actual horizontal management area: intersect each published convex cell with its
 * possibly concave land domain. This is a read-only metric, never an authoring limit.
 * A clipped concave ring may contain doubled connecting edges; their signed areas
 * cancel, so disconnected pieces are measured without inventing land between them.
 */
export function poiTerritoryAreas(plan: IslandPlan): ReadonlyMap<string, number> {
  const key = JSON.stringify([siteKey(plan), plan.poiDistribution?.domains]);
  const saved = areas.get(plan);
  if (saved?.key === key) return saved.value;
  const value = new Map(
    poiTerritories(plan).map((cell) => {
      return [cell.poiId, cell.outline.length ? ringArea(poiTerritoryLandOutline(plan, cell)) : 0] as const;
    })
  );
  areas.set(plan, { key, value });
  return value;
}

/** Intersection of a convex management cell with its actual land domain.
 * The polygon may touch itself at connectors between disjoint land pieces; queries
 * still check the source land domain before publishing physical footprints.
 */
export function poiTerritoryLandOutline(plan: IslandPlan, cell: PoiTerritory): PlanPoint[] {
  let points = plan.poiDistribution?.domains.find((domain) => domain.id === cell.domainId)?.outline ?? [];
  for (let i = 0; i < cell.outline.length && points.length; i++) {
    const a = cell.outline[i],
      b = cell.outline[(i + 1) % cell.outline.length];
    const side = (p: PlanPoint) => (b.x - a.x) * (p.z - a.z) - (b.z - a.z) * (p.x - a.x);
    const clipped: PlanPoint[] = [];
    for (let j = 0; j < points.length; j++) {
      const p = points[j],
        q = points[(j + 1) % points.length],
        u = side(p),
        v = side(q);
      if (u >= 0) clipped.push(p);
      if (u >= 0 !== v >= 0) {
        const t = u / (u - v);
        clipped.push({ x: p.x + (q.x - p.x) * t, z: p.z + (q.z - p.z) * t });
      }
    }
    points = clipped;
  }
  return cell.outline.length ? points : [];
}
