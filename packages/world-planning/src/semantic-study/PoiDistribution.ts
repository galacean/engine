import population from "../planning-data/poi-content-catalog.json";
import defaults from "../planning-data/poi-layout.json";
import type { PlanPoint } from "./IslandPlanModel";
import { createPlanningRingQuery } from "./WorldPlanningTerrain";
import { settlementRandom } from "./SettlementGeometry";
import { solvePoiDistribution } from "../spatial/regions/PoiLayoutSolver";
export { solvePoiDistribution } from "../spatial/regions/PoiLayoutSolver";
export const POI_DISTRIBUTION_VERSION = 3;
/** Stable identity and immutable starting position; inactive candidates remain recoverable. */
export interface PoiCandidate {
  /** Opaque identity retained across activation, dormancy and reload. */
  id: string;
  /** Immutable Seed/author input, never replaced with a relaxed output position. */
  origin: PlanPoint;
  domainId: string;
  /** Initial positive preference; 1 is neutral, not an exact area multiplier. */
  sizeWeight?: number;
  /** Automatically considered when a current owner has spare capacity; explicit edits also activate its participation. */
  reserve?: boolean;
}
export interface PoiLayoutConfig {
  population?: import("./PoiContentCatalog").PoiPopulationConfig;
  version: number;
  /** Unified initial spacing in metres, also defining the metric scale of power offsets. */
  spacingM: number;
  /** Positive-area cells below this many square metres become dormant; 0 disables that threshold. */
  minAreaM2: number;
  /** Persisted identities/origins, augmented with deterministic reserve candidates within the sampling budget. */
  candidates?: PoiCandidate[];
  /** Shared content-layout defaults; individual OBB sizes do not scale with POI weight. */
  layoutDefaults?: Partial<import("../spatial/layout/LayoutRules").LayoutRule>;
  content: {
    /** Legacy automatic population cap, retained for old saved recipes. */
    villageLimit: number;
    /** Explicit exact content request. Independent of POI spacing; failure preserves the prior plan. */
    villageCount?: number;
    canyonLimit: number;
    villageSiteSpanM: number;
    landformLimit: number;
    landformLengthM: number;
    landformHeightM: number;
    villageBuildingCount?: number;
    villageFloorAreaRatio?: number;
    villageSize: number;
    villageDensity: number;
    buildingSize: number;
    buildingDirection: number;
    roadBend: number;
    roadWidthVariation: number;
    landformVariation: number;
  };
  canyon: import("./PoiCanyon").CanyonConfig;
  network: import("./GlobalRoadNetwork").RoadNetworkConfig;
  landscape: import("./ContextLandscape").LandscapeConfig;
}

export interface PoiSite {
  id: string;
  /** Immutable starting point, distinct from the current solved centre. */
  origin: PlanPoint;
  /** Current deterministic relaxation output, in world metres. */
  center: PlanPoint;
  domainId: string;
  /** Positive relative preference, not an exact area or object-size multiplier. */
  sizeWeight?: number;
  /** Derived power-diagram offset in square metres. */
  weightM2: number;
  /** Current land-clipped management area; dormant sites have zero area. */
  areaM2: number;
  /** Whether this identity currently owns usable space and generates content; false does not delete author state. */
  active: boolean;
  radiusM?: number;
  contentRadiusM?: number;
  contentRecipeId?: string;
  parentId?: string;
  memberIds: string[];
}
export interface PoiDistribution {
  /** Complete immutable candidate pool, including reserves and dormant identities. */
  candidates: PoiCandidate[];
  /** All current solved sites, not just active content owners. */
  sites: PoiSite[];
  domains: { id: string; outline: PlanPoint[] }[];
  spacingM: number;
  minAreaM2: number;
  /** Author inputs used for this solution; preview merges edits here and restarts from candidate origins. */
  overrides?: Record<string, import("../spatial/regions/PoiLayoutSolver").PoiLayoutOverride>;
  metrics: {
    /** Active content-owner count; derived, not a requested population. */
    count: number;
    candidateCount: number;
    dormantCount: number;
    maxUncoveredM: number;
    minSeparationM: number | null;
    /** Whether automatic sampling reached its internal workload budget; persisted identities are never dropped. */
    budgetLimited: boolean;
  };
}
/** @returns An independent copy of the unified default configuration. */
export function defaultPoiLayout(): PoiLayoutConfig {
  return structuredClone({ ...defaults, population });
}
/** Validate metric controls; computational budgets are not requested content counts.
 * @param config Unified POI author configuration.
 * @returns Nothing for valid values.
 * @throws If the schema version, spacing or minimum area is invalid.
 */
export function validatePoiConfig(config: PoiLayoutConfig): void {
  if (
    config.version !== 2 ||
    !Number.isFinite(config.spacingM) ||
    config.spacingM < 8 ||
    !Number.isFinite(config.minAreaM2) ||
    config.minAreaM2 < 0
  )
    throw new Error("POI 布点间距须至少为 8 米，最小区域面积须为非负有限数");
}
/** Refresh diagnostics without moving sites or changing their activation.
 * @param result Solved distribution whose metrics are updated in place.
 * @param _world Retained call-site compatibility; measurements use current candidate origins.
 * @param _config Retained call-site compatibility; measurements use the solved distribution.
 * @returns Nothing; only result.metrics is replaced.
 */
export function measurePoiDistribution(result: PoiDistribution, _world?: unknown, _config?: unknown): void {
  const active = result.sites.filter((site) => site.active);
  let separation = Infinity;
  for (let i = 0; i < active.length; i++)
    for (let j = i + 1; j < active.length; j++)
      separation = Math.min(
        separation,
        Math.hypot(active[i].center.x - active[j].center.x, active[i].center.z - active[j].center.z)
      );
  result.metrics = {
    ...result.metrics,
    count: active.length,
    candidateCount: result.candidates.length,
    dormantCount: result.candidates.length - active.length,
    minSeparationM: Number.isFinite(separation) ? separation : null,
    maxUncoveredM: active.length
      ? Math.max(
          0,
          ...result.candidates.map((c) =>
            Math.min(...active.map((s) => Math.hypot(c.origin.x - s.center.x, c.origin.z - s.center.z)))
          )
        )
      : 0
  };
}
/** Generate immutable candidates and solve their current ownership.
 * @param world Metric map and land domains.
 * @param config Unified spacing, minimum area and optional persisted candidate identities.
 * @returns Active and dormant sites together, with explicit workload metrics.
 * @throws For invalid author inputs, duplicate candidate identities or an excessive scan workload.
 */
export function distributePois(
  world: { width: number; depth: number; seed: number; domains: PoiDistribution["domains"] },
  config: PoiLayoutConfig
): PoiDistribution {
  validatePoiConfig(config);
  const queries = world.domains.map((d) => ({ ...d, query: createPlanningRingQuery(d.outline) }));
  const candidates: PoiCandidate[] = config.candidates ? structuredClone(config.candidates) : [];
  let budgetLimited = false;
  {
    const persisted = new Set(candidates.map((candidate) => candidate.id));
    const generated: PoiCandidate[] = [];
    const step = config.spacingM / 2;
    if ((world.width * world.depth) / (step * step) > 65536) throw new Error("POI 候选扫描超出计算预算");
    for (let iz = 0; (iz + 0.5) * step < world.depth; iz++)
      for (let ix = 0; (ix + 0.5) * step < world.width; ix++) {
        const id = `poi-${ix}-${iz}`;
        if (persisted.has(id)) continue;
        const origin = {
          x: (ix + 0.5 + (settlementRandom(world.seed, id + ":x") - 0.5) * 0.45) * step,
          z: (iz + 0.5 + (settlementRandom(world.seed, id + ":z") - 0.5) * 0.45) * step
        };
        const domain = queries.find((d) => d.query.inside(origin));
        if (domain)
          generated.push({
            id,
            origin,
            domainId: domain.id,
            reserve: !!config.candidates || ix % 2 !== 0 || iz % 2 !== 0
          });
      }
    if (generated.length + candidates.length > 128) {
      budgetLimited = true;
      generated.sort(
        (a, b) =>
          Number(!!a.reserve) - Number(!!b.reserve) ||
          settlementRandom(world.seed, a.id + ":budget") - settlementRandom(world.seed, b.id + ":budget") ||
          a.id.localeCompare(b.id)
      );
    }
    // Persisted identities are never truncated. The budget only limits newly sampled candidates.
    candidates.push(...generated.slice(0, Math.max(0, 128 - candidates.length)));
  }
  const ids = new Set<string>();
  for (const candidate of candidates) {
    if (
      !candidate.id ||
      ids.has(candidate.id) ||
      !Number.isFinite(candidate.origin.x) ||
      !Number.isFinite(candidate.origin.z)
    )
      throw new Error("POI 候选身份重复或原点无效");
    ids.add(candidate.id);
  }
  return solvePoiDistribution({
    candidates,
    sites: [],
    domains: structuredClone(world.domains),
    spacingM: config.spacingM,
    minAreaM2: config.minAreaM2,
    metrics: {
      count: 0,
      candidateCount: candidates.length,
      dormantCount: 0,
      maxUncoveredM: 0,
      minSeparationM: null,
      budgetLimited
    }
  });
}
