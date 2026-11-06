import { poiTerritoryWeights } from "./PoiDistribution";
import { prepareLandscapeFalloff } from "../spatial/ecology/LandscapeFalloff";
import { footprintLookup } from "../spatial/layout/FootprintLookup";
import { boxGroundBottom } from "../spatial/layout/VolumeTerrain";
import type { Bounds } from "../spatial/layout/Volumes";
import { createNaturalTreeDimensions, naturalVegetationDensity } from "../planning-data/NaturalVegetationProfile";
import { PLANT_TREE_SPECIES } from "@galacean/engine-vegetation/asset-assembly/PlantSpeciesCatalog";
import { landscapeInfluenceLookup, landscapeInfluenceHeightRange } from "../spatial/ecology/LandscapeInfluences";
import { territoryLookup } from "../spatial/ecology/PoiTerritories";
import { resolveParameters, type ParameterPatch } from "./ParameterScopes";
import type { SemanticEdit } from "./WorldPlanningContract";
import rules from "../planning-data/landscape-contexts.json";
import { SETTLEMENT_PROFILE as profile } from "../planning-data/SettlementProfile";
import type { IslandPlan, PlanLandscape, PlanPoint } from "./IslandPlanModel";
import { envelope } from "./IslandPlanAtoms";
import { polygonBounds, boundsOverlap } from "./WorldPlanningGeometry";
import { settlementRandom as random } from "./SettlementGeometry";
import { createPlanningRingQuery } from "./WorldPlanningTerrain";
import {
  cachedPlanningHeightmap,
  planningGroundSurface,
  type PlanningGroundSurface,
  type PlanningHeightmap
} from "./PlanningHeightmap";

export type LandscapeContext = "road" | "building" | "landform" | "poi" | "openland";
/** Semantic abundance is separate from metric proximity and collision rules. */
export interface LandscapeConfig
  extends Partial<import("../planning-data/NaturalVegetationProfile").NaturalVegetationSettings> {
  vegetation?: import("../planning-data/NaturalVegetationProfile").NaturalVegetationDensity;
  /** World-only native species growth range overrides; absent endpoints inherit the recipe. */
  plantSizes?: import("../runtime/NaturalVegetationLayers.ts").NaturalVegetationSizeOverrides;
  /** Residual population beyond the content-relative cluster radius, and finite border blending. */
  edgeDensity?: number;
  /** Decay length relative to the owning management cell. 1 = 100%; never expands ownership. */
  falloffRatio?: number;
  boundaryBlendM?: number;
  treeHeightMinM: number;
  treeHeightMaxM: number;
  density: number;
  /** World-only multiplier, applied after all regional overrides. Zero disables ambient scenery. */
  multiplier?: number;
  /** Candidate points per 1000 square metres before footprint and habitat rejection. */
  samplingDensityPer1000M2?: number;
  /** Optional tier override; missing means inherit world abundance. Applies only to surroundings. */
  tierDensity?: Partial<Record<import("./PoiDistribution").PoiTier, number>>;
  /** Component scope adapter: all landscape fields may be overridden per tier. */
  tierOverrides?: Partial<
    Record<import("./PoiDistribution").PoiTier, ParameterPatch<Omit<LandscapeConfig, "tierDensity" | "tierOverrides">>>
  >;
  maxAltitudeM: number;
  maxSlopeDegrees: number;
  contexts: Record<Exclude<LandscapeContext, "openland">, number> & { openland?: number };
}

/** Compact, smooth falloff from the occupied POI shape to its surrounding clearings.
 * A zero residual density therefore reaches an actual empty band, not an infinite Gaussian tail.
 */
export function landscapeRadialWeight(distanceM: number, falloffM: number): number {
  const t = Math.max(0, Math.min(1, falloffM > 0 ? distanceM / falloffM : distanceM > 0 ? 1 : 0));
  return 1 - t * t * (3 - 2 * t);
}

/** Use existing content geometry, not the editable allocation radius or the management cell.
 * Large villages/landforms need planting outside their occupied edge, not at a blocked centre.
 */
function preparePoiContentDistance(plan: IslandPlan) {
  const byOwner = new Map<string, Set<PlanPoint[]>>();
  const add = (id: string | undefined, outline: PlanPoint[] | undefined) => {
    if (!id || !outline?.length) return;
    const outlines = byOwner.get(id) ?? new Set<PlanPoint[]>();
    outlines.add(outline);
    byOwner.set(id, outlines);
  };
  for (const source of [
    ...(plan.regions ?? []),
    ...(plan.mountains ?? []),
    ...plan.buildings,
    ...plan.rocks,
    ...(plan.landscapes ?? []).filter((p) => p.role === "poi")
  ]) {
    add(source.id, source.outline);
    if ("regionId" in source) add(source.regionId, source.outline);
    if ("groupId" in source) add(source.groupId, source.outline);
  }
  const outlines = new Map(
    (plan.poiDistribution?.sites ?? []).map((site) => [
      site.id,
      [...new Set(site.memberIds.flatMap((id) => [...(byOwner.get(id) ?? [])]))].map(createPlanningRingQuery)
    ])
  );
  return (id: string, point: PlanPoint, centreDistance: number, limit: number): number => {
    const rings = outlines.get(id);
    if (!rings?.length) return centreDistance;
    let nearest = limit;
    for (const ring of rings) {
      if (!ring.within(point, nearest)) continue;
      if (ring.inside(point)) return 0;
      nearest = Math.min(nearest, ring.distance(point, nearest));
    }
    return nearest;
  };
}

/** Resolve context from published spatial elements. Priority makes overlapping bands unambiguous. */
function prepareSourceLookup(plan: IslandPlan, query = createPlanningRingQuery) {
  const cellSize = 64;
  type Source = { id: string; center?: PlanPoint; ring?: ReturnType<typeof createPlanningRingQuery> };
  const sources = Object.fromEntries(
    (rules.priority as LandscapeContext[]).map((context) => {
      const cells = new Map<string, Source[]>(),
        margin = rules.contexts[context].distanceM[1],
        owners =
          context === "road"
            ? plan.routes
            : context === "building"
              ? plan.buildings
              : context === "landform"
                ? plan.rocks
                : (plan.poiDistribution?.sites ?? []);
      // Expanded AABBs are conservative only. Insert in original source order so
      // equidistant sources keep exactly the same first-source tie as the linear scan.
      for (const owner of owners) {
        const outline = "outline" in owner ? owner.outline : undefined,
          center = "center" in owner ? owner.center : undefined,
          bounds = outline
            ? polygonBounds(outline)
            : center
              ? { minX: center.x, maxX: center.x, minZ: center.z, maxZ: center.z }
              : undefined;
        if (!bounds || !Object.values(bounds).every(Number.isFinite)) continue;
        const source: Source = { id: owner.id, center, ring: outline ? query(outline) : undefined };
        for (
          let z = Math.floor((bounds.minZ - margin) / cellSize);
          z <= Math.floor((bounds.maxZ + margin) / cellSize);
          z++
        )
          for (
            let x = Math.floor((bounds.minX - margin) / cellSize);
            x <= Math.floor((bounds.maxX + margin) / cellSize);
            x++
          ) {
            const key = `${x}:${z}`,
              bucket = cells.get(key);
            if (bucket) bucket.push(source);
            else cells.set(key, [source]);
          }
      }
      return [context, cells];
    })
  );
  return (p: PlanPoint): { context: LandscapeContext; sourceId: string; contextWeight: number } | undefined => {
    const cell = `${Math.floor(p.x / cellSize)}:${Math.floor(p.z / cellSize)}`;
    for (const context of rules.priority as LandscapeContext[]) {
      const q = rules.contexts[context];
      let nearest: { id: string; distance: number } | undefined;
      for (const source of sources[context].get(cell) ?? []) {
        if (nearest?.distance === 0) break;
        const limit = nearest?.distance ?? q.distanceM[1] + 1;
        if (source.ring && !source.ring.within(p, Math.min(q.distanceM[1], limit))) continue;
        const distance = source.ring
          ? source.ring.inside(p)
            ? 0
            : source.ring.distance(p, limit)
          : source.center
            ? Math.hypot(p.x - source.center.x, p.z - source.center.z)
            : Infinity;
        if (distance >= q.distanceM[0] && distance <= q.distanceM[1] && (!nearest || distance < nearest.distance))
          nearest = { id: source.id, distance };
      }
      if (nearest) {
        const t = (nearest.distance - q.distanceM[0]) / (q.distanceM[1] - q.distanceM[0]);
        return { context, sourceId: nearest.id, contextWeight: 0.15 + 0.85 * (0.5 + 0.5 * Math.cos(Math.PI * t)) };
      }
    }
  };
}

/** Separate a bounded computation budget from authored density; callers report any reduced resolution. */
export function landscapeSampling(plan: Pick<IslandPlan, "parameters">, config: LandscapeConfig) {
  const requestedDensity = config.samplingDensityPer1000M2 ?? 1000 / rules.sampleSpacingM ** 2;
  const requestedStep = Math.sqrt(1000 / requestedDensity);
  const count = (step: number) =>
    Math.max(0, Math.ceil(plan.parameters.width / step - 0.5)) *
    Math.max(0, Math.ceil(plan.parameters.depth / step - 0.5));
  let step = requestedStep;
  if (count(step) > rules.maxCandidates) {
    let low = step,
      high = Math.max(plan.parameters.width, plan.parameters.depth);
    for (let i = 0; i < 64; i++) {
      const middle = (low + high) / 2;
      if (count(middle) > rules.maxCandidates) low = middle;
      else high = middle;
    }
    step = high;
  }
  return {
    step,
    requestedDensity,
    actualDensity: 1000 / step ** 2,
    limited: step > requestedStep,
    candidateCount: count(step)
  };
}
/** Deterministic placement candidates. Trees acquire habitat/grounding only when revealed. */
export type LandscapeCandidate = Omit<PlanLandscape, "baseHeight"> & { baseHeight?: number };
export interface LandscapeBasemap {
  readonly signature: string;
  readonly slots: readonly LandscapeCandidate[];
  /** Complete candidates before guidance exclusions; local rebuilds must restore rejected scenery too. */
  readonly candidateSlots?: readonly LandscapeCandidate[];
  /** Geometry-dependent weights reject invisible candidates before terrain validation. */
  readonly weights: Readonly<Record<string, { distanceM: number; falloffM: number; rank: number; patch: number }>>;
}

/** Finite water/terrain influence including habitat probes and both thinning neighbourhoods. */
export function landscapeWaterInfluence(
  plan: IslandPlan,
  config: LandscapeConfig,
  edits: Record<string, SemanticEdit>
): number {
  const locals = resolveLandscapeConfigs(plan, config, edits);
  const heights = [
    config.treeHeightMaxM,
    ...[...locals.values()].map((q) => q.treeHeightMaxM),
    ...Object.values(edits).flatMap((edit) =>
      [
        edit.landscape?.treeHeightMaxM,
        edit.landscapeInfluence?.treeHeightMinM,
        edit.landscapeInfluence?.treeHeightMaxM
      ].filter((value): value is number => value !== undefined)
    )
  ];
  const ratio = Math.max(...PLANT_TREE_SPECIES.map(({ sourceDimensionsM: [w, h, d] }) => Math.max(w, d) / h));
  const span = Math.max(Math.max(...heights) * ratio, profile.landscape.rockWidthMax);
  const step = landscapeSampling(plan, config).step;
  return (
    Math.max(...Object.values(rules.contexts).map((c) => c.distanceM[1])) +
    4 * (span + profile.landscape.instanceGap) +
    step * (2 + rules.jitter)
  );
}

/** Build compliant candidates from planning inputs; abundance and instance edits are not construction inputs. */
export function prepareLandscapeBasemap(
  plan: IslandPlan,
  config: LandscapeConfig,
  edits: Record<string, SemanticEdit> = {},
  scope?: Bounds,
  reuse?: { base: LandscapeBasemap; area: Bounds }
): LandscapeBasemap {
  const locals = resolveLandscapeConfigs(plan, config, edits),
    territory = territoryLookup(plan),
    regionAt = landscapeRegionLookup(plan, config, edits),
    influenceAt = landscapeInfluenceLookup(plan, edits),
    { step } = landscapeSampling(plan, config);
  const generation = (q: Partial<LandscapeConfig>) => [
    q.treeHeightMinM,
    q.treeHeightMaxM,
    q.maxAltitudeM,
    q.maxSlopeDegrees
  ];
  const key = JSON.stringify([
    step,
    scope,
    [config, ...locals.values()].map(generation),
    (plan.poiDistribution?.domains ?? []).map((domain) => [
      domain.id,
      generation(resolveParameters(config, edits[domain.id]?.landscape))
    ]),
    Object.entries(edits)
      .filter(
        ([, edit]) =>
          edit.landscapeInfluence?.treeHeightMinM !== undefined || edit.landscapeInfluence?.treeHeightMaxM !== undefined
      )
      .map(([id, edit]) => [id, edit.landscapeInfluence?.treeHeightMinM, edit.landscapeInfluence?.treeHeightMaxM]),
    plan.parameters,
    plan.regionFields?.elevation,
    plan.land,
    plan.islands,
    plan.waters,
    plan.rocks,
    plan.routes.map((r) => [r.id, r.outline]),
    plan.buildings.map((b) => [b.id, b.outline]),
    plan.regions,
    plan.mountains,
    plan.plazas?.map((p) => p.outline),
    plan.fences,
    plan.planning?.profiles,
    plan.planning?.ports.filter((p) => p.id.endsWith("-door")),
    plan.poiDistribution?.domains,
    plan.poiDistribution?.sites,
    poiTerritoryWeights(plan.poiDistribution ?? {}),
    plan.landscapes?.filter((p) => p.role === "poi").map((p) => p.outline)
  ]);
  const cached = slotCache.get(key);
  if (cached) return cached;
  const slots = createSlots(
    plan,
    step,
    (center, source) => {
      const poiId = territory(center)[0]?.site.id;
      return landscapeInfluenceHeightRange((poiId && locals.get(poiId)) || regionAt(center), influenceAt(source));
    },
    Math.max(
      config.treeHeightMaxM,
      ...[...locals.values()].map((q) => q.treeHeightMaxM),
      ...Object.values(edits).flatMap((edit) =>
        [
          edit.landscape?.treeHeightMaxM,
          edit.landscapeInfluence?.treeHeightMinM,
          edit.landscapeInfluence?.treeHeightMaxM
        ].filter((value): value is number => value !== undefined)
      )
    ),
    scope ?? reuse?.area
  ).filter((slot) => {
    slot.poiId = territory(slot.center)[0]?.site.id;
    slot.ownerId = slot.poiId ?? "landscape";
    slot.role = "ambient";
    const q = (slot.poiId && locals.get(slot.poiId)) || regionAt(slot.center);
    return (
      !slot.habitat ||
      (slot.habitat.suitability > 0 &&
        slot.habitat.altitudeM <= q.maxAltitudeM &&
        slot.habitat.slopeDegrees <= q.maxSlopeDegrees)
    );
  });
  const contentDistance = preparePoiContentDistance(plan),
    falloffAt = prepareLandscapeFalloff(plan);
  let weights = Object.fromEntries(
    slots.map((slot) => {
      const distance = territory(slot.center)[0]?.distance ?? 0;
      const distanceM = slot.poiId ? contentDistance(slot.poiId, slot.center, distance, Infinity) : distance;
      return [
        slot.id,
        {
          distanceM,
          falloffM: falloffAt(slot.poiId, slot.center, distanceM, 1),
          rank: random(plan.parameters.seed, slot.id + "keep"),
          patch: landscapePatchWeight(plan.parameters.seed, slot.center)
        }
      ];
    })
  );
  if (reuse?.base.candidateSlots) {
    slots.push(...reuse.base.candidateSlots.filter((slot) => !withinScope(slot.center, reuse.area)));
    // Restore the generator's row-major proposal order, independent of edit history.
    const address = new Map(slots.map((slot) => [slot.id, slot.id.split("-").slice(1).map(Number)]));
    slots.sort(
      (a, b) => address.get(a.id)![1] - address.get(b.id)![1] || address.get(a.id)![0] - address.get(b.id)![0]
    );
    weights = Object.fromEntries(slots.map((slot) => [slot.id, weights[slot.id] ?? reuse.base.weights[slot.id]]));
  }
  const base: LandscapeBasemap = { signature: key, slots, candidateSlots: slots, weights };
  slotCache.set(key, base);
  if (slotCache.size > 4) slotCache.delete(slotCache.keys().next().value!);
  return base;
}

/** Reveal fixed candidates and validate newly visible trees on the exact terrain.
 * Rejected candidates are never replaced; repeated reveals share terrain samples.
 */
export function revealLandscapeBasemap(
  plan: IslandPlan,
  base: LandscapeBasemap,
  config: LandscapeConfig,
  edits: Record<string, SemanticEdit> = {}
): PlanLandscape[] {
  const locals = resolveLandscapeConfigs(plan, config, edits),
    regionAt = landscapeRegionLookup(plan, config, edits),
    influenceAt = landscapeInfluenceLookup(plan, edits);
  const treeDensities = new Map<LandscapeConfig, number>();
  const treeDensity = (q: LandscapeConfig) => {
    let value = treeDensities.get(q);
    if (value === undefined) {
      value = naturalVegetationDensity(q.vegetation).trees!;
      treeDensities.set(q, value);
    }
    return value;
  };
  const habitatAt = prepareHabitatSampler(plan, landscapeSampling(plan, config).step);
  const ambient = base.slots.flatMap((slot) => {
    const weight = base.weights[slot.id];
    // Other generators (for example road guidance) may publish fixed scenery into the completed base.
    if (!weight) return slot.baseHeight === undefined ? [] : [{ ...slot, baseHeight: slot.baseHeight }];
    const q = (slot.poiId && locals.get(slot.poiId)) || regionAt(slot.center);
    const ratio = q.falloffRatio ?? 1;
    const radial = landscapeRadialWeight(weight.distanceM, ratio === 0 ? 0 : weight.falloffM * ratio);
    const edge = q.edgeDensity ?? rules.distribution.edgeDensity;
    const context = slot.context === "openland" ? q.contexts.poi : q.contexts[slot.context!]!;
    const residual =
      slot.context === "openland" ? (q.contexts.openland ?? rules.distribution.openlandDensity) : context;
    const abundance = q.density * (edge * residual + (1 - edge) * radial * context);
    const threshold =
      abundance *
      (slot.kind === "tree" ? treeDensity(q) : 1) *
      (influenceAt(slot)?.densityMultiplier ?? 1) *
      (config.multiplier ?? 1) *
      weight.patch;
    // Suitability is bounded by one. Invisible proposals need neither contact
    // vertices nor slope probes; all published instances still pass both.
    if (!(weight.rank < threshold)) return [];
    const sample =
      slot.habitat && slot.baseHeight !== undefined
        ? { habitat: slot.habitat, baseHeight: slot.baseHeight }
        : habitatAt(slot.center, Math.max(slot.width, slot.depth) / 2, slot.kind, slot.yaw);
    if (
      sample.habitat.altitudeM > q.maxAltitudeM ||
      sample.habitat.slopeDegrees > q.maxSlopeDegrees ||
      !(weight.rank < threshold * sample.habitat.suitability)
    )
      return [];
    return [{ ...slot, habitat: sample.habitat, baseHeight: sample.baseHeight! }];
  });
  return [...(plan.landscapes ?? []).filter((p) => p.role === "poi"), ...ambient].sort((a, b) =>
    a.id.localeCompare(b.id)
  );
}

/** Compatibility entry for bounded geometry changes and standalone ecology callers. */
export function planContextLandscape(
  plan: IslandPlan,
  config: LandscapeConfig,
  edits: Record<string, SemanticEdit> = {},
  scope?: { bounds: Bounds; previous: PlanLandscape[] }
): PlanLandscape[] {
  const base = prepareLandscapeBasemap(plan, config, edits, scope?.bounds);
  const revealed = revealLandscapeBasemap(plan, base, config, edits);
  return [
    ...revealed,
    ...(scope?.previous.filter((p) => p.role !== "poi" && !withinScope(p.center, scope.bounds)) ?? [])
  ].sort((a, b) => a.id.localeCompare(b.id));
}

const slotCache = new Map<string, LandscapeBasemap>();
type HabitatSample = { habitat: NonNullable<PlanLandscape["habitat"]>; baseHeight?: number };
type HabitatSampler = (
  center: PlanPoint,
  radius: number,
  kind: "tree" | "rock",
  yaw: number,
  grounding?: boolean
) => HabitatSample;
const terrainHabitatCache = new WeakMap<PlanningHeightmap | PlanningGroundSurface, Map<string, HabitatSampler>>();

/** Habitat and grounding depend on terrain, not nearby solid tops or roads.
 * Occupancy is checked separately; never cache its decisions here.
 */
function prepareHabitatSampler(plan: IslandPlan, step: number): HabitatSampler {
  const map = cachedPlanningHeightmap(plan) ?? planningGroundSurface(plan),
    key = String(step);
  let surfaces = terrainHabitatCache.get(map);
  if (!surfaces) terrainHabitatCache.set(map, (surfaces = new Map()));
  const previous = surfaces.get(key);
  if (previous) return previous;
  const samples = new Map<string, HabitatSample>();
  const sample: HabitatSampler = (center, radius, kind, yaw, grounding = true) => {
    const id = `${center.x}:${center.z}:${radius}:${kind}:${yaw}`;
    let result = samples.get(id);
    if (!result) {
      result = {
        habitat: sampleLandscapeHabitat(
          center,
          kind === "tree" ? profile.landscape.trunkRadius : radius,
          kind,
          map.sample
        )
      };
      samples.set(id, result);
    }
    // Flower masks consume rock habitat/footprints, not their contact elevation.
    // Only a published object pays for the full bottom-face support samples.
    if (grounding && result.baseHeight === undefined) {
      result.baseHeight = boxGroundBottom(
        {
          center,
          width: kind === "tree" ? profile.landscape.trunkRadius * 2 : radius * 2,
          depth: kind === "tree" ? profile.landscape.trunkRadius * 2 : radius * 1.6,
          yaw
        },
        map.sample
      );
    }
    return result;
  };
  surfaces.set(key, sample);
  if (surfaces.size > 2) surfaces.delete(surfaces.keys().next().value!);
  return sample;
}

type StaticPlacement = (center: PlanPoint, width: number, depth: number, yaw: number, outline: PlanPoint[]) => boolean;
const staticPlacementCache = new Map<string, StaticPlacement>();

/** Cache only road-independent exact placement tests. A rerouted path must still
 * recheck its own shape/clearance and every accepted candidate's mutual spacing.
 */
function prepareStaticPlacement(plan: IslandPlan, step: number): StaticPlacement {
  const domains = (plan.poiDistribution?.domains ?? [{ outline: plan.land }]).map((domain) => domain.outline),
    buildings = plan.buildings.map((building) => building.outline),
    obstacles = [
      ...buildings,
      ...(plan.planning?.reservations.filter((area) => area.kind === "activity").map((area) => area.outline) ?? []),
      ...(plan.plazas ?? []).map((plaza) => plaza.outline),
      ...plan.rocks.map((rock) => rock.outline),
      ...plan.waters.map((water) => water.outline),
      ...(plan.landscapes ?? []).filter((landscape) => landscape.role === "poi").map((landscape) => landscape.outline),
      ...(plan.fences ?? []).map((fence) => envelope(fence.center, fence.sizeX, fence.sizeZ, fence.yaw))
    ],
    doors =
      plan.planning?.ports.filter((port) => port.id.endsWith("-door")).map((port) => ({ ...port.position })) ?? [],
    key = JSON.stringify([
      plan.parameters.seed,
      plan.parameters.width,
      plan.parameters.depth,
      step,
      domains,
      obstacles,
      buildings,
      doors
    ]);
  const previous = staticPlacementCache.get(key);
  if (previous) return previous;
  const coast = domains.map(createPlanningRingQuery),
    solid = footprintLookup(
      obstacles.map((outline) => ({ outline, query: createPlanningRingQuery(outline) })),
      (o) => o.outline
    ),
    buildingEdges = footprintLookup(
      buildings.map((outline) => ({ outline, query: createPlanningRingQuery(outline) })),
      (o) => o.outline
    ),
    accepted = new Map<string, boolean>(),
    q = profile.landscape;
  const eligible: StaticPlacement = (center, width, depth, yaw, outline) => {
    const id = `${center.x}:${center.z}:${width}:${depth}:${yaw}`;
    let valid = accepted.get(id);
    if (valid === undefined) {
      const radius = Math.max(width, depth) / 2,
        diagonalRadius = Math.hypot(width, depth) / 2,
        clearance = radius + q.buildingClearance;
      valid =
        coast.some((domain) => domain.containsPolygon(outline)) &&
        !solid(center, diagonalRadius).some(
          ({ query: obstacle }) => obstacle.within(center, diagonalRadius) && obstacle.overlapsPolygon(outline)
        ) &&
        !buildingEdges(center, clearance + 1).some(
          ({ query: edge }) =>
            edge.within(center, clearance) && (edge.inside(center) || edge.distance(center, clearance + 1) < clearance)
        ) &&
        !doors.some((door) => Math.hypot(door.x - center.x, door.z - center.z) < radius + q.doorClearance);
      accepted.set(id, valid);
    }
    return valid;
  };
  staticPlacementCache.set(key, eligible);
  if (staticPlacementCache.size > 4) staticPlacementCache.delete(staticPlacementCache.keys().next().value!);
  return eligible;
}

function withinScope(p: PlanPoint, b: Bounds): boolean {
  return p.x >= b.x0 && p.x <= b.x1 && p.z >= b.z0 && p.z <= b.z1;
}
function createSlots(
  plan: IslandPlan,
  step: number,
  heightAt: (p: PlanPoint, source: Pick<PlanLandscape, "context" | "sourceId">) => { min: number; max: number },
  maxTreeHeight: number,
  scope?: Bounds
): LandscapeCandidate[] {
  const queries = new Map<PlanPoint[], ReturnType<typeof createPlanningRingQuery>>();
  const query = (ring: PlanPoint[]) => {
    let q = queries.get(ring);
    if (!q) {
      q = createPlanningRingQuery(ring);
      queries.set(ring, q);
    }
    return q;
  };
  const seed = plan.parameters.seed,
    q = profile.landscape,
    habitatAt = prepareHabitatSampler(plan, step),
    staticPlacement = prepareStaticPlacement(plan, step),
    sourceAt = prepareSourceLookup(plan, query);
  const lands = (plan.poiDistribution?.domains ?? [{ outline: plan.land }]).map((domain) => query(domain.outline));
  const roadQueries = plan.routes.map((r) => ({ outline: r.outline!, ring: query(r.outline!) }));
  const roadsAt = footprintLookup(roadQueries, (r) => r.outline);
  const gapBelow = (ring: ReturnType<typeof createPlanningRingQuery>, p: PlanPoint, margin: number) =>
    ring.within(p, margin) && (ring.inside(p) || ring.distance(p, margin + 1) < margin);
  // Measured species proportions bound every crown for the authored height ranges.
  // Use the same finite support for full and scoped solves, before generating proposals.
  const treeSpanRatio = Math.max(
    ...PLANT_TREE_SPECIES.map(({ sourceDimensionsM: [width, height, depth] }) => Math.max(width, depth) / height)
  );
  const binSize = Math.max(maxTreeHeight * treeSpanRatio, q.rockWidthMax) + q.instanceGap;
  // Include every proposal in the queried candidates' 3x3 thinning bins, even
  // outside the edited scope. Those rejected/unowned neighbours still participate.
  const halo = 2 * binSize + (step * rules.jitter) / 2;
  const coordinates = (length: number, low: number, high: number) => {
    const values: number[] = [];
    // Preserve the original repeated-addition coordinates and thus random IDs,
    // including non-integer sample spacing. Skip hashing the rest of the world.
    for (let n = step / 2; n < length; n += step) if (n >= low && n <= high) values.push(n);
    return values;
  };
  const xs = coordinates(
      plan.parameters.width,
      scope ? scope.x0 - halo : -Infinity,
      scope ? scope.x1 + halo : Infinity
    ),
    zs = coordinates(plan.parameters.depth, scope ? scope.z0 - halo : -Infinity, scope ? scope.z1 + halo : Infinity);
  const candidates: { id: string; center: PlanPoint; order: number }[] = [];
  for (const z of zs)
    for (const x of xs) {
      const id = `landscape-${x}-${z}`;
      candidates.push({
        id,
        order: random(seed, id + "order"),
        center: {
          x: x + (random(seed, id + "x") - 0.5) * step * rules.jitter,
          z: z + (random(seed, id + "z") - 0.5) * step * rules.jitter
        }
      });
    }
  const treeDimensions = createNaturalTreeDimensions(seed);
  const slots: LandscapeCandidate[] = [];
  // Acceptance reads proposal priorities, never a previously accepted candidate.
  // A global priority sort cannot change this result; publication sorts by ID.
  // Fixed-priority proposal thinning has finite spatial support. A local obstacle edit cannot ripple
  // through a world-wide greedy acceptance order. Rejected proposals still define the sampling pattern.
  const bins = new Map<string, typeof candidates>();
  for (const candidate of candidates) {
    const key = `${Math.floor(candidate.center.x / binSize)}:${Math.floor(candidate.center.z / binSize)}`;
    const bucket = bins.get(key) ?? [];
    bucket.push(candidate);
    bins.set(key, bucket);
  }
  const nearSlots = (p: PlanPoint) => {
    const result: typeof candidates = [],
      x = Math.floor(p.x / binSize),
      z = Math.floor(p.z / binSize);
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) result.push(...(bins.get(`${x + dx}:${z + dz}`) ?? []));
    return result;
  };
  for (const { id, center, order } of candidates) {
    if (scope && !withinScope(center, scope)) continue;
    if (!lands.some((land) => land.inside(center))) continue;
    const source = sourceAt(center) ?? { context: "openland" as const, sourceId: "land-main", contextWeight: 1 };
    const range = heightAt(center, source);
    const sample = (key: string) => random(seed, id + key),
      kind = sample("kind") < rules.contexts[source.context].treeFraction ? "tree" : "rock",
      tree = treeDimensions(id, range.min + sample("height") * (range.max - range.min), center),
      width = kind === "tree" ? tree.width : q.rockWidthMin + sample("size") * (q.rockWidthMax - q.rockWidthMin),
      depth = kind === "tree" ? tree.depth : width * 0.8,
      radius = Math.max(width, depth) / 2,
      yaw = sample("yaw") * Math.PI * 2;
    // Thinning depends on all proposals, never their acceptance. Eliminate the
    // same losers before constructing footprints and running exact occupancy tests.
    if (
      nearSlots(center).some(
        (s) => s.order < order && Math.hypot(s.center.x - center.x, s.center.z - center.z) < radius + q.instanceGap
      )
    )
      continue;
    const outline = envelope(center, width, depth, yaw),
      occupiedWidth = kind === "tree" ? q.trunkRadius * 2 : width,
      occupiedDepth = kind === "tree" ? q.trunkRadius * 2 : depth,
      occupiedOutline = envelope(center, occupiedWidth, occupiedDepth, yaw),
      occupiedRadius = Math.hypot(occupiedWidth, occupiedDepth) / 2;
    const nearbyRoads = roadsAt(center, occupiedRadius + q.roadClearance);
    if (
      !staticPlacement(center, occupiedWidth, occupiedDepth, yaw, occupiedOutline) ||
      nearbyRoads.some(
        ({ ring: road }) => road.within(center, occupiedRadius) && road.overlapsPolygon(occupiedOutline)
      ) ||
      nearbyRoads.some(({ ring }) => gapBelow(ring, center, occupiedRadius + q.roadClearance))
    )
      continue;
    const sampleGround = kind === "rock" ? habitatAt(center, radius, kind, yaw, false) : undefined;
    const slot: LandscapeCandidate = {
      ...(sampleGround ? { habitat: { ...sampleGround.habitat } } : {}),
      id,
      ownerId: "landscape",
      ...source,
      kind,
      ...(kind === "tree" ? { assetId: tree.assetId } : {}),
      center,
      width,
      depth,
      yaw,
      outline,
      height: kind === "tree" ? tree.height : q.rockHeightMin + sample("height") * (q.rockHeightMax - q.rockHeightMin),
      collisionRadius: kind === "tree" ? q.trunkRadius : Math.hypot(width, depth) / 2,
      ...(kind === "tree" ? { canopyRadius: radius } : {})
    };
    slots.push(slot);
  }
  return slots;
}

/** Probe the actual terrain surface; nearby solid tops are not ground habitat. Hard limits
 * and gradual density attenuation come from the species habitat configuration.
 */
export function sampleLandscapeHabitat(
  center: PlanPoint,
  radius: number,
  kind: "tree" | "rock",
  surface: (p: PlanPoint) => number
): NonNullable<PlanLandscape["habitat"]> {
  const q = rules.habitats[kind],
    height = surface(center),
    offset = Math.max(2, radius);
  const probes = [
    { x: center.x - offset, z: center.z },
    { x: center.x + offset, z: center.z },
    { x: center.x, z: center.z - offset },
    { x: center.x, z: center.z + offset }
  ].map(surface);
  const reliefM = Math.max(height, ...probes) - Math.min(height, ...probes),
    slopeDegrees = (Math.atan(Math.max(...probes.map((h) => Math.abs(h - height))) / offset) * 180) / Math.PI;
  const fade = (v: number, min: number, max: number) => Math.max(0, Math.min(1, (v - min) / (max - min)));
  // Coast and water occupancy are already tested geometrically. Low dry land is not a habitat veto.
  const altitude = height <= q.optimalAltitudeM[1] ? 1 : 1 - fade(height, q.optimalAltitudeM[1], q.altitudeM[1]);
  const slope = 1 - fade(slopeDegrees, q.slopeDegrees[0], q.slopeDegrees[1]);
  const suitability = reliefM > q.maxFootprintReliefM ? 0 : altitude * slope;
  return { altitudeM: height, slopeDegrees, reliefM, suitability };
}

/** Exact narrow-phase occupancy validation, with prepared obstacle bounds per transaction. */
export function landscapeOccupancyValid(plan: IslandPlan, previous?: IslandPlan): boolean {
  const old = new Map(previous?.landscapes?.map((p) => [p.id, JSON.stringify(p.outline)]));
  const changed = (plan.landscapes ?? []).filter((item) => old.get(item.id) !== JSON.stringify(item.outline));
  if (!changed.length) return true;
  const obstacles = [
    ...(plan.planning?.reservations.filter((area) => area.kind === "activity").map((area) => area.outline) ?? []),
    ...plan.routes.map((r) => r.outline!),
    ...plan.buildings.map((b) => b.outline),
    ...(plan.plazas ?? []).map((p) => p.outline),
    ...plan.rocks.map((r) => r.outline)
  ].map((ring) => ({ bounds: polygonBounds(ring), query: createPlanningRingQuery(ring) }));
  return !changed.some((item) => {
    const bounds = polygonBounds(item.outline);
    return obstacles.some((o) => boundsOverlap(bounds, o.bounds) && o.query.overlapsPolygon(item.outline));
  });
}

/** Shared world → tier → instance precedence for UI and generation. */
export function poiLandscapeConfig(
  config: LandscapeConfig,
  site: import("./PoiDistribution").PoiSite,
  edit?: SemanticEdit,
  region?: SemanticEdit
): LandscapeConfig {
  return resolveParameters(
    config,
    { density: config.tierDensity?.[site.tier] },
    config.tierOverrides?.[site.tier],
    region?.landscape,
    edit?.landscape
  );
}
function landscapeRegionLookup(plan: IslandPlan, config: LandscapeConfig, edits: Record<string, SemanticEdit>) {
  const regions = (plan.poiDistribution?.domains ?? [])
    .filter((d) => edits[d.id]?.landscape)
    .map((d) => ({
      ring: createPlanningRingQuery(d.outline),
      config: resolveParameters(config, edits[d.id].landscape)
    }));
  return (point: PlanPoint) => regions.find((r) => r.ring.inside(point))?.config ?? config;
}
function resolveLandscapeConfigs(plan: IslandPlan, config: LandscapeConfig, edits: Record<string, SemanticEdit>) {
  if (!Number.isFinite(config.multiplier ?? 1) || (config.multiplier ?? 1) < 0)
    throw new Error("全局景观倍率须为有限非负数");
  const sampling = config.samplingDensityPer1000M2 ?? 1000 / rules.sampleSpacingM ** 2;
  if (!Number.isFinite(sampling) || sampling <= 0) throw new Error("景观候选密度须为有限正数");
  for (const n of [config.density, ...Object.values(config.contexts), ...Object.values(config.tierDensity ?? {})])
    if (!Number.isFinite(n) || n < 0) throw new Error("景观密度须为有限非负数");
  if (
    ![config.maxAltitudeM, config.maxSlopeDegrees].every((v) => Number.isFinite(v) && v >= 0) ||
    config.maxSlopeDegrees > 90
  )
    throw new Error("景观海拔与坡度上限无效");
  const occupied = plan.poiDistribution?.sites ?? [];
  const locals = new Map(occupied.map((p) => [p.id, poiLandscapeConfig(config, p, edits[p.id], edits[p.domainId])]));
  for (const q of [config, ...locals.values()])
    if (
      !(q.treeHeightMinM > 0 && q.treeHeightMaxM >= q.treeHeightMinM && Number.isFinite(q.treeHeightMaxM)) ||
      ![q.density, ...Object.values(q.contexts)].every((v) => Number.isFinite(v) && v >= 0) ||
      !Number.isFinite(q.edgeDensity ?? rules.distribution.edgeDensity) ||
      (q.edgeDensity ?? rules.distribution.edgeDensity) < 0 ||
      (q.edgeDensity ?? rules.distribution.edgeDensity) > 1 ||
      !Number.isFinite(q.falloffRatio ?? 1) ||
      (q.falloffRatio ?? 1) < 0 ||
      ![q.maxAltitudeM, q.maxSlopeDegrees].every((v) => Number.isFinite(v) && v >= 0) ||
      q.maxSlopeDegrees > 90
    )
      throw new Error("景观高度或密度范围无效");
  return locals;
}

/** Height changes also change crown occupancy; rerun the same deterministic placement rules. */
export function retuneLandscapeHeights(
  plan: IslandPlan,
  config: LandscapeConfig,
  edits: Record<string, SemanticEdit>
): PlanLandscape[] {
  return planContextLandscape(plan, config, edits);
}

/** Low-frequency coherent thinning keeps clearings between clusters, independently of candidate density. */
export function landscapePatchWeight(seed: number, p: PlanPoint): number {
  const x = p.x / rules.distribution.patchScaleM,
    z = p.z / rules.distribution.patchScaleM,
    ix = Math.floor(x),
    iz = Math.floor(z);
  const smooth = (v: number) => v * v * (3 - 2 * v),
    u = smooth(x - ix),
    v = smooth(z - iz),
    n = (a: number, b: number) => random(seed, `ecology-patch:${a}:${b}`);
  const field =
    (n(ix, iz) * (1 - u) + n(ix + 1, iz) * u) * (1 - v) + (n(ix, iz + 1) * (1 - u) + n(ix + 1, iz + 1) * u) * v;
  return rules.distribution.patchFloor + (1 - rules.distribution.patchFloor) * field * field;
}
