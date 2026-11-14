import type { IslandPlan, PlanPoint } from "../../semantic-study/IslandPlanModel";
import { ringArea } from "../../semantic-study/WorldPlanningGeometry";
import type { PoiSite } from "../../semantic-study/PoiDistribution";
import { createPlanningRingQuery } from "../../semantic-study/WorldPlanningTerrain";
import { createRegionOwnership } from "../regions/RegionOwnership";
import { computePoiCells, clipPoiLand, solvePoiDistribution } from "../regions/PoiLayoutSolver";

/** Invalidates derived partitions without rerolling seed-based author parameter initialization. */
export const POI_TERRITORY_VERSION = 5;
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
    plan.poiDistribution?.spacingM,
    plan.poiDistribution?.sites.map((s) => [s.id, s.center.x, s.center.z, s.domainId, s.weightM2, s.active])
  ]);
}
/** Publish solved power cells without running relaxation or changing author state.
 * @param plan Solved world plan.
 * @param partitionByDomain Whether islands compete independently; false supports sea-spanning rock regions.
 * @returns All identities, including empty cells for dormant candidates.
 */
export function poiTerritories(plan: IslandPlan, partitionByDomain = true): PoiTerritory[] {
  const key = JSON.stringify([siteKey(plan), partitionByDomain]),
    saved = cells.get(plan);
  if (saved?.key === key) return saved.value;
  const value = computePoiCells(
    plan.poiDistribution?.sites ?? [],
    { x0: 0, z0: 0, x1: plan.parameters.width, z1: plan.parameters.depth },
    partitionByDomain
  ).map((cell) => ({ ...cell, id: "territory:" + cell.poiId }));
  cells.set(plan, { key, value });
  return value;
}

/** One provisional POI edit. Omitted values retain the accepted site's values. */
export interface PoiTerritoryPreviewEdit {
  /** Stable identity of an existing POI. */
  id: string;
  /** Positive management-area preference; 1 is the unified default. */
  sizeWeight?: number;
  /** Provisional world X coordinate in metres. */
  x?: number;
  /** Provisional world Z coordinate in metres. */
  z?: number;
}

/** Pure partition preview: never changes the accepted plan, solves content or persists authoring.
 * @param plan Accepted plan supplying existing POIs and their land domains.
 * @param edit Provisional weight and/or coordinates for one existing POI.
 * @returns Every provisional cell's land-clipped outline, actual area in square metres, centre and weight.
 * Zero-area cells retain their POI identity and can regain area after another weight edit.
 * @throws If the POI is absent, the weight is non-finite or below 0.001, or a coordinate is negative/non-finite.
 */
export function previewPoiTerritories(plan: IslandPlan, edit: PoiTerritoryPreviewEdit) {
  const distribution = plan.poiDistribution;
  if (!distribution?.sites.some((site) => site.id === edit.id)) throw new Error("POI 不存在：" + edit.id);
  if (edit.sizeWeight !== undefined && (!Number.isFinite(edit.sizeWeight) || edit.sizeWeight < 0.001))
    throw new Error("POI 大小权重须至少为 0.001");
  if ([edit.x, edit.z].some((v) => v !== undefined && (!Number.isFinite(v) || v < 0)))
    throw new Error("POI 坐标须为非负有限数");
  const { id, ...values } = edit;
  const solved = solvePoiDistribution(distribution, {
    ...distribution.overrides,
    [id]: { ...distribution.overrides?.[id], ...values }
  });
  const sites = solved.sites;
  const preview = { ...plan, poiDistribution: solved };
  return poiTerritories(preview).map((cell) => {
    const site = sites.find((site) => site.id === cell.poiId)!;
    const outline = poiTerritoryLandOutline(preview, cell);
    return {
      poiId: cell.poiId,
      domainId: cell.domainId,
      center: { ...site.center },
      origin: { ...site.origin },
      active: site.active,
      outline,
      areaM2: outline.length ? ringArea(outline) : 0,
      sizeWeight: site.sizeWeight ?? 1
    };
  });
}
/** Shared ownership and finite boundary blending for flowers and scenery. No content radius cuts off ecology.
 * @param plan Solved plan containing active and dormant ownership sites.
 * @returns A position/blend-width query over active land owners; dormant sites never contribute.
 */
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
    const domainSites = sites.filter((site) => site.active && site.domainId === d.id);
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
 * @param plan Solved world with its land-domain geometry.
 * @returns Area in square metres for every stable POI identity, including zero for dormant sites.
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
 * @param plan Plan supplying the cell's land domain.
 * @param cell Solved convex ownership cell.
 * @returns Land-clipped polygon; an empty cell returns an empty array.
 */
export function poiTerritoryLandOutline(plan: IslandPlan, cell: PoiTerritory): PlanPoint[] {
  return clipPoiLand(
    plan.poiDistribution?.domains.find((domain) => domain.id === cell.domainId)?.outline ?? [],
    cell.outline
  );
}
