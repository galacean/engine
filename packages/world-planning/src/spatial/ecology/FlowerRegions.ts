import { poiTerritoryWeights } from "../../semantic-study/PoiDistribution";
import { footprintLookup } from "../layout/FootprintLookup";
import { flowerInfluenceField, type LegacyFlowerContext } from "./FlowerInfluences";
import { coverageBoundaries } from "./CoverageContours";
import defaults from "../../planning-data/flower-regions.json";
import type { IslandPlan, PlanPoint } from "../../semantic-study/IslandPlanModel";
import type { SemanticEdit } from "../../semantic-study/WorldPlanningContract";
import { createPlanningRingQuery } from "../../semantic-study/WorldPlanningTerrain";
import { cachedPlanningHeightmap, planningGroundSurface } from "../../semantic-study/PlanningHeightmap";
import { flowerShape, type FlowerShapeAlgorithm } from "./FlowerShape";
import { territoryLookup } from "./PoiTerritories";
import { ringArea, polygonBounds } from "../../semantic-study/WorldPlanningGeometry";
import {
  resolveFlowerAssetWeights,
  resolveGeneratedFlowerAssetWeights,
  type FlowerAssetWeights
} from "../../planning-data/FlowerAssetWeights";
/** Coverage is an artistic field threshold, not an exact area or instance quota. */
export interface FlowerConfig {
  coverage: number;
  /** Nominal candidate density inside the flower area; rejected clumps are not replaced. */
  densityPerM2: number;
  patchSizeM: number;
  maxSlopeDegrees: number;
  /** Sparse author weights override the Seed/region-generated species composition. */
  assetWeights?: FlowerAssetWeights;
}
/** One editable coverage region may contain many disconnected patches and holes. */
export interface FlowerRegion {
  id: string;
  ownerId: string;
  label: string;
  outlines: PlanPoint[][];
  outline: PlanPoint[];
  areaM2: number;
  config: FlowerConfig;
  /** Preview cells from the same distribution field consumed by native planting. */
  patches: PlanPoint[][];
  eligibleAreaM2: number;
}
export const FLOWER_DEFAULTS: FlowerConfig = {
  coverage: defaults.coverage,
  densityPerM2: defaults.densityPerM2,
  patchSizeM: defaults.patchSizeM,
  maxSlopeDegrees: defaults.maxSlopeDegrees
};
/** Input compatibility only; region outputs and the public flower component contain intrinsic fields. */
export type FlowerInput = Partial<FlowerConfig> & LegacyFlowerContext;
/** Generate contour patches from a continuous field; hard footprints and roads remain clear.
 * World → POI → local source/region overrides share the same component contract.
 */
const cache = new Map<string, FlowerRegion[]>();
// A road edit changes the exclusion mask, not the underlying terrain/POI ownership samples.
// Retain one complete input-keyed field; never retain a mutable plan or assume identity survives a worker clone.
let surfaceCache:
  | {
      key: string;
      lookup: ReturnType<typeof territoryLookup>;
      samples: Map<string, { mask: number; height?: number; near?: ReturnType<ReturnType<typeof territoryLookup>> }>;
      shapes: Map<string, Map<number, Map<string, number>>>;
    }
  | undefined;
export function planFlowerRegions(
  plan: IslandPlan,
  config: FlowerInput | undefined,
  edits: Record<string, SemanticEdit>,
  boundaryBlendM = 20,
  shape: FlowerShapeAlgorithm = flowerShape,
  scope?: { owners: ReadonlySet<string>; previous: FlowerRegion[] },
  candidateRocks?: readonly { outline: PlanPoint[] }[]
): FlowerRegion[] {
  if (!plan.poiDistribution) return [];
  const key = JSON.stringify([
    shape.id,
    scope ? [...scope.owners].sort() : undefined,
    plan.parameters,
    plan.regionFields?.elevation,
    plan.land,
    plan.islands,
    plan.buildings,
    plan.rocks,
    candidateRocks ?? plan.landscapes?.filter((p) => p.kind === "rock"),
    plan.waters,
    plan.routes,
    plan.plazas,
    plan.planning?.profiles,
    plan.poiDistribution.sites,
    plan.poiDistribution.domains,
    poiTerritoryWeights(plan.poiDistribution),
    config,
    boundaryBlendM,
    Object.entries(edits)
      .filter(([, e]) => e.flowers || e.flowerInfluence)
      .map(([id, e]) => [id, e.flowers, e.flowerInfluence])
  ]);
  const publish = (regions: FlowerRegion[]): FlowerRegion[] =>
    scope
      ? [...scope.previous.filter((f) => !scope.owners.has(f.ownerId)), ...regions].sort((a, b) =>
          a.id.localeCompare(b.id)
        )
      : regions;
  const cached = cache.get(key);
  if (cached) return publish(cached);
  const surfaceKey = JSON.stringify([
    plan.parameters,
    plan.regionFields?.elevation,
    plan.land,
    plan.islands,
    plan.waters,
    plan.planning?.profiles.filter((p) => p.kind === "bed"),
    plan.poiDistribution.domains,
    plan.poiDistribution.sites.map(({ id, center, domainId, tier }) => ({ id, center, domainId, tier })),
    poiTerritoryWeights(plan.poiDistribution),
    boundaryBlendM
  ]);
  if (surfaceCache?.key !== surfaceKey) {
    const lookup = territoryLookup(plan);
    const ownership = new Map<string, ReturnType<typeof lookup>>();
    surfaceCache = {
      key: surfaceKey,
      samples: new Map(),
      shapes: new Map(),
      lookup: (p, blend = 0) => {
        const id = `${p.x}:${p.z}:${blend}`;
        let value = ownership.get(id);
        if (!value) {
          value = lookup(p, blend);
          ownership.set(id, value);
        }
        return value;
      }
    };
  }
  const surface = surfaceCache;
  const base = { ...FLOWER_DEFAULTS, ...config },
    lookup = surface.lookup,
    ground = (cachedPlanningHeightmap(plan) ?? planningGroundSurface(plan)).sample,
    lands = [plan.land, ...plan.islands].map(createPlanningRingQuery);
  const footprints = [
    ...plan.buildings,
    ...plan.rocks,
    ...(candidateRocks ?? (plan.landscapes ?? []).filter((p) => p.kind === "rock")),
    ...plan.waters,
    ...(plan.plazas ?? []),
    ...plan.routes
  ]
    .filter((o) => o.outline?.length)
    .map((o) => ({ outline: o.outline!, query: createPlanningRingQuery(o.outline!) }));
  const nearby = footprintLookup(footprints, (o) => o.outline);
  const influences = flowerInfluenceField(plan, edits);
  const pointCache = new Map<
    string,
    { mask: number; surface: { mask: number; height?: number; near?: ReturnType<ReturnType<typeof territoryLookup>> } }
  >();
  const at = (p: PlanPoint) => {
    const id = `${p.x}:${p.z}`;
    let value = pointCache.get(id);
    if (value) return value;
    let sample = surface.samples.get(id);
    if (!sample) {
      const land = lands.find((l) => l.inside(p));
      let mask = land ? Math.min(1, land.distance(p, 6) / 6) : -1;
      sample = { mask };
      surface.samples.set(id, sample);
    }
    let mask = sample.mask;
    for (const { query: o } of nearby(p, 12)) {
      // -1 is the field's lower bound. Further exact obstacle queries cannot
      // change an already excluded vertex or any clipped triangle using it.
      if (mask === -1) break;
      if (o.within(p, 12)) mask = Math.min(mask, o.inside(p) ? -1 : (o.distance(p, 12) - 2) / 6);
    }
    value = { surface: sample, mask };
    pointCache.set(id, value);
    return value;
  };
  type Vertex = PlanPoint & { score: number };
  type Group = { owner: string; label: string; config: FlowerConfig; cells: Vertex[][]; eligibleAreaM2: number };
  const groups = new Map<string, Group>(),
    step = defaults.sampleStepM;
  // Clip the same linear scalar field on both sides of each shared mesh edge.
  const clip = <T extends PlanPoint>(
    ring: T[],
    value: (p: T) => number,
    interpolate: (a: T, b: T, t: number) => T
  ): T[] => {
    const out: T[] = [];
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i],
        b = ring[(i + 1) % ring.length],
        u = value(a),
        v = value(b);
      if (u >= 0) out.push(a);
      if (u >= 0 !== v >= 0) out.push(interpolate(a, b, u / (u - v)));
    }
    return out;
  };
  const interpolate = (a: Vertex, b: Vertex, t: number): Vertex => ({
    x: a.x + (b.x - a.x) * t,
    z: a.z + (b.z - a.z) * t,
    score: a.score + (b.score - a.score) * t
  });
  type ResolvedFlowerScope = { base: FlowerInput & FlowerConfig; local: FlowerInput & FlowerConfig };
  const resolved = new Map<string, Map<string | undefined, ResolvedFlowerScope>>();
  const resolve = (owner: string, poi?: string, localRegion = true) => {
    let byPoi = resolved.get(owner);
    if (!byPoi) resolved.set(owner, (byPoi = new Map()));
    let scope = byPoi.get(poi);
    if (!scope) {
      const regional = {
        ...base,
        ...(poi ? edits[poi]?.flowers : {}),
        ...edits[owner]?.flowers,
        assetWeights: resolveGeneratedFlowerAssetWeights(
          plan.parameters.seed,
          owner,
          base.assetWeights,
          poi ? edits[poi]?.flowers?.assetWeights : undefined,
          edits[owner]?.flowers?.assetWeights
        )
      };
      const local = edits["flowers:" + owner]?.flowers;
      scope = {
        base: regional,
        local: {
          ...regional,
          ...local,
          ...(local?.assetWeights
            ? { assetWeights: resolveFlowerAssetWeights(regional.assetWeights, local.assetWeights) }
            : {})
        }
      };
      byPoi.set(poi, scope);
    }
    return localRegion ? scope.local : scope.base;
  };
  let shapeSamples = surface.shapes.get(shape.id);
  if (!shapeSamples) {
    shapeSamples = new Map();
    surface.shapes.set(shape.id, shapeSamples);
    if (surface.shapes.size > 2) surface.shapes.delete(surface.shapes.keys().next().value!);
  }
  const value = (p: PlanPoint, q: FlowerConfig, multiplier: number) => {
    let points = shapeSamples.get(q.patchSizeM);
    if (!points) {
      points = new Map();
      shapeSamples.set(q.patchSizeM, points);
      if (shapeSamples.size > 8) shapeSamples.delete(shapeSamples.keys().next().value!);
    }
    const id = `${p.x}:${p.z}`;
    let threshold = points.get(id);
    if (threshold === undefined) {
      threshold = shape.threshold(plan.parameters.seed, p, q.patchSizeM);
      points.set(id, threshold);
    }
    // Coverage and proximity directly control a local field. No world/region area
    // integration or quantile solve: changing an obstacle never refills distant gaps.
    const coverage = Math.max(0, Math.min(1, q.coverage));
    const level = coverage + (multiplier - 0.45) * coverage * (1 - coverage) * 0.5;
    const t = Math.max(0, Math.min(1, (threshold - 0.2) / 0.6));
    return t * t * (3 - 2 * t) - level;
  };
  // Adjacent cells repeatedly query identical corners with the same resolved authoring scope.
  const weights = new WeakMap<object, Map<string, number>>();
  const multiplier = (p: PlanPoint, q: FlowerInput, source?: ReturnType<typeof influences.ownerAt>) => {
    let points = weights.get(q);
    if (!points) {
      points = new Map();
      weights.set(q, points);
    }
    const id = `${p.x}:${p.z}:${source?.id ?? ""}`;
    let value = points.get(id);
    if (value === undefined) {
      value = influences.multiplierAt(p, q, source);
      points.set(id, value);
    }
    return value;
  };
  for (let z = 0; z < plan.parameters.depth; z += step)
    for (let x = 0; x < plan.parameters.width; x += step) {
      const center = { x: x + step / 2, z: z + step / 2 },
        near = lookup(center, boundaryBlendM),
        poi = near[0]?.site.id;
      if (!poi) continue;
      const source = influences.ownerAt(center),
        owner = source?.id ?? poi,
        q = resolve(owner, poi);
      if (q.coverage <= 0 || (scope && !scope.owners.has(owner))) continue;
      const corners = [
        { x, z },
        { x: Math.min(plan.parameters.width, x + step), z },
        { x: Math.min(plan.parameters.width, x + step), z: Math.min(plan.parameters.depth, z + step) },
        { x, z: Math.min(plan.parameters.depth, z + step) }
      ];
      if (corners.every((p) => at(p).mask < 0)) continue;
      const heights = corners.map((p) => {
        const sample = at(p).surface;
        return (sample.height ??= ground(p));
      });
      if ((Math.atan((Math.max(...heights) - Math.min(...heights)) / step) * 180) / Math.PI > q.maxSlopeDegrees)
        continue;
      const samples = corners.map((p) => {
        const sample = at(p).surface;
        const field = source
          ? value(p, q, multiplier(p, q, source))
          : (sample.near ??= lookup(p, boundaryBlendM)).reduce((sum, n) => {
              // Regional intent may blend across POIs; an individual flower-region edit owns
              // only that region's output cells and must not erase a neighbour's patches.
              const local = resolve(n.site.id, n.site.id, n.site.id === owner);
              return sum + n.weight * value(p, local, multiplier(p, local));
            }, 0);
        return field;
      });
      for (const tri of [
        [0, 1, 2],
        [0, 2, 3]
      ]) {
        const vertices = tri.map((i) => ({ ...corners[i], score: samples[i], mask: at(corners[i]).mask }));
        const eligible = clip(
          vertices,
          (p) => p.mask,
          (a, b, t) => ({ ...interpolate(a, b, t), mask: 0 })
        );
        const area = ringArea(eligible);
        if (eligible.length < 3 || area <= 0) continue;
        let group = groups.get(owner);
        if (!group) {
          group = { owner, label: source?.label ?? "区域花丛", config: q, cells: [], eligibleAreaM2: 0 };
          groups.set(owner, group);
        }
        group.cells.push(eligible);
        group.eligibleAreaM2 += area;
      }
    }
  const result: FlowerRegion[] = [];
  for (const group of groups.values()) {
    // One field clip per eligible cell. Area below is descriptive preview data only.
    const patches = group.cells
      .map((cell) => clip(cell, (p) => -p.score, interpolate))
      .filter((r) => r.length >= 3 && ringArea(r) > 0)
      .map((r) => r.map(({ x, z }) => ({ x, z })));
    if (!patches.length) continue;
    const outlines = coverageBoundaries(patches),
      b = polygonBounds(outlines.flat());
    result.push({
      id: "flowers:" + group.owner,
      ownerId: group.owner,
      label: group.label,
      config: {
        coverage: group.config.coverage,
        densityPerM2: group.config.densityPerM2,
        patchSizeM: group.config.patchSizeM,
        maxSlopeDegrees: group.config.maxSlopeDegrees,
        ...(group.config.assetWeights ? { assetWeights: { ...group.config.assetWeights } } : {})
      },
      outlines,
      patches,
      areaM2: patches.reduce((sum, ring) => sum + ringArea(ring), 0),
      eligibleAreaM2: group.eligibleAreaM2,
      outline: [
        { x: b.minX, z: b.minZ },
        { x: b.maxX, z: b.minZ },
        { x: b.maxX, z: b.maxZ },
        { x: b.minX, z: b.maxZ }
      ]
    });
  }
  result.sort((a, b) => a.id.localeCompare(b.id));
  cache.set(key, result);
  if (cache.size > 3) cache.delete(cache.keys().next().value!);
  return publish(result);
}
