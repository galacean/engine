import {
  inspectFarmingStarter,
  type FarmingStarterPlacement,
  type FarmingDiagnosticIssue,
  type FarmingDiagnosticCheck,
  type FarmingGroundView
} from "@galacean/engine-farming/farming/api/index";
import type { IslandPlan, PlanPoint } from "../../semantic-study/IslandPlanModel";
import { createPlanningGroundSampler, createPlanningRingQuery } from "../../semantic-study/WorldPlanningTerrain";
import { ribbonOutline } from "../../semantic-study/WorldRibbon";
import { overlap } from "../../semantic-study/WorldPlanningGeometry";
import { poiTerritories } from "../ecology/PoiTerritories";
import { RoadObstacleIndex, type LayoutGroup } from "../layout/LayoutKernel";
import { bounds, intersects } from "../layout/Volumes";
import { planningWhiteboxes } from "../../semantic-study/PlanningWhiteboxes";
import { createPlanningFarmingGroundView, farmingBoundsOutline } from "./PlanningFarmingGround";
import { PLANNING_FARMING_DEFAULTS, type PlanningFarmingOptions } from "./PlanningFarmingComponent";

/** Work budgets, not a claim that the world has no other suitable land. */
export const FARMING_PLACEMENT_CANDIDATES = 128;
export const FARMING_LOCATION_SAMPLES = 2048;
export const FARMING_SEARCH_BAND_M = 16;
const SEARCH_STEP_M = 4;
const NEAR_SEARCH_RADIUS_M = 64;
const INSPECTIONS_PER_BAND = 8;
export const FARMING_CONTAINER_ATTEMPTS = 64;
export interface PlanningFarmSearch {
  readonly inspected: number;
  readonly sampled: number;
  readonly regionIds: readonly string[];
  readonly failures: Readonly<Record<string, number>>;
}
export interface PlanningFarmLayout {
  readonly farmId: string;
  readonly groundId: string;
  readonly poiId: string | null;
  readonly planningRevision: number;
  readonly options: PlanningFarmingOptions;
  readonly managementOutline: PlanPoint[];
  readonly placement?: FarmingStarterPlacement;
  readonly placementCheck: FarmingDiagnosticCheck;
  /** Access means a valid internal operating corridor, not public-road connectivity. */
  readonly accessCheck: FarmingDiagnosticCheck;
  readonly entrance?: PlanPoint;
  readonly search?: PlanningFarmSearch;
}
const issue = (code: string, message: string, target: string): FarmingDiagnosticIssue => ({
  code,
  message,
  source: "planner",
  target
});

/** Search existing free land around the final spawn. Distance defines expanding bands;
 * slope is the only terrain preference within a band. Water and roads are occupancy facts only.
 * No terrain edits, road repair, neighbour relocation or second facility search.
 */
export function preparePlanningFarmLayout(
  plan: IslandPlan,
  groups: readonly LayoutGroup[],
  planningRevision: number,
  authored: Partial<PlanningFarmingOptions> = {}
): PlanningFarmLayout {
  const options = { ...PLANNING_FARMING_DEFAULTS, ...authored };
  const farmId = `seed-world/seed-${plan.parameters.seed}/starter`,
    groundId = `seed-world/seed-${plan.parameters.seed}/ground`;
  const sites = (plan.poiDistribution?.sites ?? [])
    .filter((site) => (options.poiId !== "auto" ? site.id === options.poiId : site.domainId === "land-main"))
    .slice()
    .sort((a, b) => a.id.localeCompare(b.id));
  const base = {
    farmId,
    groundId,
    planningRevision,
    options,
    poiId: sites[0]?.id ?? null,
    managementOutline: [] as PlanPoint[],
    accessCheck: { state: "blocked" as const, issues: [issue("FARM_NOT_PLACED", "农场设施尚未获得合法位置", farmId)] }
  };
  if (!sites.length)
    return {
      ...base,
      placementCheck: {
        state: "blocked",
        issues: [issue("FARM_REGION_MISSING", "没有可用的农场管理 POI", farmId)]
      }
    };
  // One immutable search context; never build terrain/obstacle indices for individual candidates.
  const terrain = createPlanningGroundSampler(plan);
  // Exact-coordinate, search-local memoization: repeated container support probes share terrain work.
  // Bound memory independently of author plot count and discard everything after this search.
  const heights = new Map<number, Map<number, number>>();
  let heightCount = 0;
  const height = (x: number, z: number) => {
    const cached = heights.get(x)?.get(z);
    if (cached !== undefined) return cached;
    const value = terrain({ x, z });
    if (heightCount >= 32768) {
      heights.clear();
      heightCount = 0;
    }
    let column = heights.get(x);
    if (!column) heights.set(x, (column = new Map()));
    column.set(z, value);
    heightCount++;
    return value;
  };
  const waters = plan.waters.map((w) => createPlanningRingQuery(w.outline));
  const obstacles = new RoadObstacleIndex(
    plan.buildings && plan.rocks
      ? planningWhiteboxes(plan, terrain)
          .filter((part) => part.layer !== "tree" && part.layer !== "landscape-rock" && part.layer !== "bridge")
          .map((part) => ({
            id: part.id,
            owner: part.id,
            boxes: part.boxes.map((box) => ({
              center: box.center,
              elevation: box.elevation ?? 0,
              width: box.sizeX,
              depth: box.sizeZ,
              height: box.sizeY,
              yaw: box.yaw
            }))
          }))
      : groups.flatMap((group) => group.volumes)
  );
  const paths = [
    ...(plan.routes ?? []).flatMap((route) => (route.outline ? [route.outline] : [])),
    ...(plan.planning?.reservations.filter((area) => area.kind === "activity").map((area) => area.outline) ?? [])
  ];
  // Standalone callers may supply internal paths before the world has projected routes.
  if (!plan.routes?.length)
    for (const group of groups)
      for (const path of group.paths)
        paths.push(
          ribbonOutline(
            path.points,
            path.points.map(() => path.width)
          )
        );
  const pathAreas = paths.map((outline) => ({ outline, bounds: bounds(outline) }));
  const blocked = (outline: PlanPoint[]) => {
    const b = bounds(outline);
    return (
      obstacles.collides(outline) ||
      pathAreas.some((path) => intersects(b, path.bounds) && overlap(path.outline, outline))
    );
  };
  const territories = new Map(poiTerritories(plan).map((t) => [t.poiId, t.outline]));
  const domains = new Map(plan.poiDistribution!.domains.map((d) => [d.id, d.outline]));
  const regions = sites.map((site) => {
    const outline = territories.get(site.id)!;
    const territory = createPlanningRingQuery(outline);
    const domain = createPlanningRingQuery(domains.get(site.domainId)!);
    const view = createPlanningFarmingGroundView({
      revision: planningRevision,
      groundId,
      domains: [domains.get(site.domainId)!],
      allowedArea: outline,
      height,
      underwater: (x, z) => waters.some((w) => w.inside({ x, z })),
      blocked: (b) => blocked(farmingBoundsOutline(b))
    });
    const searchView: FarmingGroundView = {
      ...view,
      inspectBounds(id, footprint) {
        const outline = farmingBoundsOutline(footprint);
        if (id !== groundId || !territory.containsPolygon(outline) || !domain.containsPolygon(outline))
          return { covered: false, maximumSlopeDegrees: 0, surfaces: [], underwater: false, blocked: false };
        // Search-only rejection: known occupied land needs no dense terrain/support probes.
        if (blocked(outline))
          return { covered: true, maximumSlopeDegrees: 0, surfaces: ["soil"], underwater: false, blocked: true };
        return view.inspectBounds(id, footprint);
      }
    };
    return { site, outline, territory, domain, view: searchView, bounds: bounds(outline) };
  });
  const anchor = plan.spawn;
  const distanceSquared = (point: PlanPoint) => (point.x - anchor.x) ** 2 + (point.z - anchor.z) ** 2;
  const nearest = Math.min(
    ...regions.map(({ bounds: b }) =>
      Math.hypot(Math.max(b.x0 - anchor.x, 0, anchor.x - b.x1), Math.max(b.z0 - anchor.z, 0, anchor.z - b.z1))
    )
  );
  const farthest = Math.max(...regions.flatMap(({ outline }) => outline.map((p) => Math.sqrt(distanceSquared(p)))));
  const regionIds = new Set<string>();
  const failures: Record<string, number> = {};
  const examples = new Map<string, FarmingDiagnosticIssue>();
  let sampled = 0,
    inspected = 0,
    dry = 0,
    bandLimited = false;
  const search = (): PlanningFarmSearch => ({
    sampled,
    inspected,
    regionIds: [...regionIds],
    failures: { ...failures }
  });
  const firstBand = Math.floor(nearest / FARMING_SEARCH_BAND_M);
  for (let band = firstBand; band <= Math.floor(farthest / FARMING_SEARCH_BAND_M); band++) {
    const low = band * FARMING_SEARCH_BAND_M,
      high = low + FARMING_SEARCH_BAND_M;
    // Keep nearby detail; spend fewer samples per outer band to reach farther free land.
    // This changes candidate coverage only. Full facility and support checks stay unchanged.
    const step = low < NEAR_SEARCH_RADIUS_M ? SEARCH_STEP_M : SEARCH_STEP_M * 2;
    terrain.prepareBounds?.([anchor.x - high - 16, anchor.z - high - 16, anchor.x + high + 16, anchor.z + high + 16]);
    const candidates: { point: PlanPoint; slope: number; region: (typeof regions)[number] }[] = [];
    for (const region of regions) {
      const b = region.bounds;
      const x0 = Math.ceil((Math.max(b.x0, anchor.x - high) - anchor.x) / step),
        x1 = Math.floor((Math.min(b.x1, anchor.x + high) - anchor.x) / step),
        z0 = Math.ceil((Math.max(b.z0, anchor.z - high) - anchor.z) / step),
        z1 = Math.floor((Math.min(b.z1, anchor.z + high) - anchor.z) / step);
      for (let iz = z0; iz <= z1 && sampled < FARMING_LOCATION_SAMPLES; iz++)
        for (let ix = x0; ix <= x1 && sampled < FARMING_LOCATION_SAMPLES; ix++) {
          const point = { x: anchor.x + ix * step, z: anchor.z + iz * step };
          const d2 = distanceSquared(point);
          if (d2 < low * low || d2 >= high * high || !region.territory.inside(point) || !region.domain.inside(point))
            continue;
          sampled++;
          regionIds.add(region.site.id);
          if (waters.some((w) => w.inside(point))) continue;
          const sample = region.view.sample(groundId, point.x, point.z);
          if (!sample) continue;
          dry++;
          candidates.push({ point, region, slope: Math.acos(Math.min(1, Math.max(-1, sample.normal[1]))) });
        }
    }
    candidates.sort(
      (a, b) =>
        a.slope - b.slope ||
        distanceSquared(a.point) - distanceSquared(b.point) ||
        a.point.z - b.point.z ||
        a.point.x - b.point.x ||
        a.region.site.id.localeCompare(b.region.site.id)
    );
    bandLimited ||= candidates.length > INSPECTIONS_PER_BAND;
    for (const { point, region } of candidates.slice(0, INSPECTIONS_PER_BAND)) {
      inspected++;
      const result = inspectFarmingStarter(region.view, farmId, groundId, point.x, point.z, undefined, {
        ...options,
        maximumContainerPlacementAttempts: FARMING_CONTAINER_ATTEMPTS
      });
      if (result.ok) {
        const entrances = result.placement.entrances.slice().sort((a, b) => distanceSquared(a) - distanceSquared(b));
        return {
          ...base,
          poiId: region.site.id,
          managementOutline: region.outline,
          placement: { ...result.placement, entrances },
          entrance: { ...entrances[0] },
          placementCheck: { state: "ready", issues: [] },
          accessCheck: {
            state: "ready",
            issues: [],
            evidence: [
              {
                code: "FARM_OPERATION_CLEAR",
                source: "planner",
                target: `${farmId}/operation`,
                relatedIds: []
              }
            ]
          },
          search: search()
        };
      }
      for (const code of new Set(result.issues.map((i) => i.code))) failures[code] = (failures[code] ?? 0) + 1;
      for (const problem of result.issues) {
        const previous = examples.get(problem.code);
        if (
          !previous ||
          (typeof problem.actual === "number" &&
            typeof previous.actual === "number" &&
            problem.actual < previous.actual)
        )
          examples.set(problem.code, problem);
      }
      if (inspected >= FARMING_PLACEMENT_CANDIDATES) break;
    }
    if (sampled >= FARMING_LOCATION_SAMPLES || inspected >= FARMING_PLACEMENT_CANDIDATES) break;
  }
  const limited = bandLimited || sampled >= FARMING_LOCATION_SAMPLES || inspected >= FARMING_PLACEMENT_CANDIDATES;
  return {
    ...base,
    search: search(),
    placementCheck: {
      state: "blocked",
      issues: [
        issue(
          "FARM_SEARCH_EXHAUSTED",
          `围绕出生点已采样 ${sampled}/${FARMING_LOCATION_SAMPLES} 个位置，检查 ${inspected}/${FARMING_PLACEMENT_CANDIDATES} 个设施候选；${limited ? "搜索预算耗尽" : "当前采样候选已检查完"}，不代表整张地图无可行位置`,
          farmId
        ),
        ...(!dry ? [issue("NO_DRY_FARM_CANDIDATES", "当前已检查范围没有可采样的干燥陆地候选", farmId)] : []),
        ...examples.values()
      ]
    }
  };
}

/** Add walkable open regions and explicit road exclusion parcels, not fake buildings or rocks. */
export function publishPlanningFarmGeometry(plan: IslandPlan): void {
  const farm = plan.farming,
    p = farm?.placement;
  if (!farm || !p || !farm.poiId) return;
  const operationId = `${farm.farmId}/operation`;
  plan.planning!.ports = plan.planning!.ports.filter((port) => !port.id.startsWith(`${farm.farmId}/entrance-`));
  plan.regions.push({
    id: operationId,
    label: "农场操作通道",
    kind: "open",
    outline: farmingBoundsOutline(p.operationBounds),
    navigationArea: farmingBoundsOutline(p.operationBounds)
  });
  for (const [index, occupied] of p.occupiedBounds.entries())
    plan.regions.push({
      id: `${farm.farmId}/parcel-${index}`,
      label: occupied.label,
      kind: "open",
      roadExcluded: true,
      outline: farmingBoundsOutline(occupied.bounds)
    });
  const members = plan.regions.filter((area) => area.id.startsWith(`${farm.farmId}/`)).map((area) => area.id);
  const site = plan.poiDistribution!.sites.find((site) => site.id === farm.poiId)!;
  site.memberIds = [...site.memberIds, ...members];
  site.contentRadiusM = Math.max(
    site.contentRadiusM ?? 0,
    ...farmingBoundsOutline(p.facilityBounds).map((point) =>
      Math.hypot(point.x - site.center.x, point.z - site.center.z)
    )
  );
  const module = plan.planning!.modules.find((module) => module.id === farm.poiId);
  if (module) module.memberIds = [...(module.memberIds ?? []), ...members];
}

/** Farm occupancy masks procedural landscape decoration without changing its author data. */
export function excludePlanningFarmLandscape(plan: IslandPlan): void {
  const farm = plan.farming;
  if (farm?.placementCheck.state !== "ready" || !farm.placement) return;
  const footprint = farmingBoundsOutline(farm.placement.facilityBounds);
  plan.landscapes = plan.landscapes?.filter((plant) => !overlap(plant.outline, footprint));
}
