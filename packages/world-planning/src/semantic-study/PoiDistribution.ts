import population from "../planning-data/poi-content-catalog.json";
import defaults from "../planning-data/poi-layout.json";
import type { PlanPoint } from "./IslandPlanModel";
import { createPlanningRingQuery } from "./WorldPlanningTerrain";
import { settlementRandom } from "./SettlementGeometry";

/** Invalidates derived point placement without changing author initialization streams. */
export const POI_DISTRIBUTION_VERSION = 2;

/** Distribution scales are independent of content kinds and display layers. */
export type PoiTier = "large" | "medium" | "small";
/** Minimum centre separation for this tier against all tiers placed before it. */
export interface PoiSpacing {
  minM: number;
}
/** A finite planning workload with a deliberately small content fixture. */
export interface PoiLayoutConfig {
  population?: import("./PoiContentCatalog").PoiPopulationConfig;
  version: number;
  candidateStepM: number;
  maxSitesPerTier: number;
  spacing: Record<PoiTier, PoiSpacing>;
  /** Relative management-area preferences; never a content size or exact land quota. */
  territoryWeights?: Record<PoiTier, number>;
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
/** A scale-tagged location. Content determines its own occupancy; a point owns no region. */
export interface PoiSite {
  /** Content budget, independent from spacing and ambient landscape influence. */
  radiusM?: number;
  contentRadiusM?: number;
  contentRecipeId?: string;
  id: string;
  tier: PoiTier;
  domainId: string;
  center: PlanPoint;
  parentId?: string;
  memberIds: string[];
}
/** Measured coverage is over the finite candidate set, not a continuous travel guarantee. */
export interface PoiDistribution {
  territoryWeights?: Record<PoiTier, number>;
  sites: PoiSite[];
  domains: { id: string; outline: PlanPoint[] }[];
  metrics: Record<
    PoiTier,
    {
      count: number;
      candidateCount: number;
      maxUncoveredM: number;
      minSeparationM: number | null;
      budgetLimited: boolean;
    }
  >;
}
/** Backward-compatible area preferences for recipes written before this control existed. */
export function poiTerritoryWeights(config: Pick<PoiLayoutConfig, "territoryWeights">): Record<PoiTier, number> {
  return { ...defaults.territoryWeights, ...config.territoryWeights };
}
/** Return independent defaults for an editable recipe. */
export function defaultPoiLayout(): PoiLayoutConfig {
  return structuredClone({ ...defaults, population });
}
/** Reject invalid units or excessive work before entering the distribution loop. */
export function validatePoiConfig(config: PoiLayoutConfig): void {
  if (
    config.version !== 1 ||
    !Number.isFinite(config.candidateStepM) ||
    config.candidateStepM < 8 ||
    !Number.isInteger(config.maxSitesPerTier) ||
    config.maxSitesPerTier < 1 ||
    config.maxSitesPerTier > 512
  )
    throw new Error("POI 采样步长或预算无效");
  for (const range of Object.values(config.spacing))
    if (!Number.isFinite(range.minM) || range.minM < 0) throw new Error("POI 最小中心间距须为非负数（米）");
  if (!Object.values(poiTerritoryWeights(config)).every((weight) => Number.isFinite(weight) && weight > 0))
    throw new Error("POI 区域面积权重须为正数");
}
const distance = (a: PlanPoint, b: PlanPoint): number => Math.hypot(a.x - b.x, a.z - b.z);

function samplePoiCandidates(
  world: { width: number; depth: number; seed: number; domains: PoiDistribution["domains"] },
  step: number
) {
  const { width, depth, seed, domains } = world;
  const queries = domains.map((d) => ({ id: d.id, ring: createPlanningRingQuery(d.outline) }));
  const candidates: { center: PlanPoint; domainId: string }[] = [];
  for (let z = step / 2; z < depth; z += step)
    for (let x = step / 2; x < width; x += step) {
      const center = {
        x: x + (settlementRandom(seed, `poi-x:${x}:${z}`) - 0.5) * step * 0.45,
        z: z + (settlementRandom(seed, `poi-z:${x}:${z}`) - 0.5) * step * 0.45
      };
      const domain = queries.find((d) => d.ring.inside(center) || d.ring.distance(center, 0.010001) <= 0.01);
      if (domain) candidates.push({ center, domainId: domain.id });
    }
  return candidates;
}

/** Re-measure authored point changes against the same finite candidate set as generation. */
export function measurePoiDistribution(
  result: PoiDistribution,
  world: { width: number; depth: number; seed: number },
  config: PoiLayoutConfig
): void {
  const candidates = samplePoiCandidates({ ...world, domains: result.domains }, config.candidateStepM);
  const tiers = ["large", "medium", "small"] as const;
  const prior: PoiSite[] = [];
  for (const tier of tiers) {
    const own = result.sites.filter((p) => p.tier === tier);
    const all = [...prior, ...own];
    let minimum = Infinity;
    for (const p of own)
      for (const q of all) if (p.id !== q.id) minimum = Math.min(minimum, distance(p.center, q.center));
    result.metrics[tier] = {
      count: own.length,
      candidateCount: candidates.length,
      minSeparationM: Number.isFinite(minimum) ? minimum : null,
      maxUncoveredM: all.length
        ? Math.max(0, ...candidates.map((c) => Math.min(...all.map((p) => distance(c.center, p.center)))))
        : Math.hypot(world.width, world.depth),
      budgetLimited: result.metrics[tier]?.budgetLimited ?? false
    };
    prior.push(...own);
  }
}

/** Allocate all land domains without a fixed POI count.
 * Large sites are placed first. Medium sites fill gaps between large sites, then small
 * sites fill the remaining gaps. The current tier spacing applies against every earlier
 * site, including larger tiers; a larger tier does not reserve its own spacing against later tiers.
 * Editing a tier only replans that tier and smaller tiers. This is global placement, not incremental insertion.
 * @param world Metric map bounds, land domains and stable seed.
 * @param config Per-tier minimum centre spacing and finite sampling budget.
 * @returns Stable sites and measured candidate coverage.
 */
export function distributePois(
  world: { width: number; depth: number; seed: number; domains: PoiDistribution["domains"] },
  config: PoiLayoutConfig
): PoiDistribution {
  validatePoiConfig(config);
  const { width, depth, seed, domains } = world;
  if (![width, depth].every((n) => Number.isFinite(n) && n > 0) || (width * depth) / config.candidateStepM ** 2 > 65536)
    throw new Error("POI 世界尺寸超出采样预算");
  const candidates = samplePoiCandidates(world, config.candidateStepM);
  const result: PoiDistribution = {
    territoryWeights: poiTerritoryWeights(config),
    sites: [],
    domains: structuredClone(domains),
    metrics: {} as PoiDistribution["metrics"]
  };
  // Every accepted anchor updates this cache once. Later tiers inherit it without rescanning earlier anchors.
  const nearestSquared = new Float64Array(candidates.length).fill(Infinity);
  const squaredDistance = (a: PlanPoint, b: PlanPoint) => (a.x - b.x) ** 2 + (a.z - b.z) ** 2;
  for (const tier of ["large", "medium", "small"] as const) {
    const thresholdSquared = config.spacing[tier].minM ** 2,
      sites: PoiSite[] = [];
    const focus = {
      x: width * (0.35 + 0.3 * settlementRandom(seed, `poi-focus-x:${tier}`)),
      z: depth * (0.35 + 0.3 * settlementRandom(seed, `poi-focus-z:${tier}`))
    };
    let next = result.sites.length
      ? nearestSquared.reduce((best, d, i) => (best < 0 || d > nearestSquared[best] ? i : best), -1)
      : candidates.reduce(
          (best, p, i) =>
            best < 0 || squaredDistance(p.center, focus) < squaredDistance(candidates[best].center, focus) ? i : best,
          -1
        );
    let budgetLimited = false,
      minSeparationSquared = Infinity;
    while (next >= 0) {
      // The best remaining point fails: every remaining point fails too. No random retry or rollback.
      // The zero check also excludes an already accepted point if a tiny positive threshold underflows when squared.
      if (nearestSquared[next] < thresholdSquared || nearestSquared[next] === 0) break;
      if (sites.length >= config.maxSitesPerTier) {
        budgetLimited = true;
        break;
      }
      minSeparationSquared = Math.min(minSeparationSquared, nearestSquared[next]);
      const candidate = candidates[next];
      const parent = result.sites.reduce<PoiSite | undefined>(
        (best, s) =>
          !best || squaredDistance(s.center, candidate.center) < squaredDistance(best.center, candidate.center)
            ? s
            : best,
        undefined
      );
      sites.push({
        id: `poi-${tier}-${sites.length}`,
        tier,
        ...candidate,
        ...(parent ? { parentId: parent.id } : {}),
        memberIds: []
      });
      let farthest = -1;
      for (let i = 0; i < candidates.length; i++) {
        nearestSquared[i] = Math.min(nearestSquared[i], squaredDistance(candidates[i].center, candidate.center));
        if (farthest < 0 || nearestSquared[i] > nearestSquared[farthest]) farthest = i;
      }
      next = farthest;
    }
    result.sites.push(...sites);
    result.metrics[tier] = {
      count: sites.length,
      candidateCount: candidates.length,
      maxUncoveredM: next < 0 ? 0 : Math.sqrt(nearestSquared[next]),
      minSeparationM: Number.isFinite(minSeparationSquared) ? Math.sqrt(minSeparationSquared) : null,
      budgetLimited
    };
  }
  return result;
}
