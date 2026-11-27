import { createVegetationSpeciesRegions, type SpeciesRegionSettings } from "./VegetationSpeciesRegions";
import { vegetationRank as rank } from "./VegetationRandom";
import { vegetationColorVariation, type PlantAppearanceSample } from "./VegetationColorVariation";
import { createLandscapePolylineQuery, landscapeSegmentDistance } from "./LandscapePolylineQuery";
export { landscapeSegmentDistance } from "./LandscapePolylineQuery";
import type { PlantFoliageVariation } from "../asset-assembly/PlantSpeciesCatalog";
import {
  createVegetationCompanionPatches,
  validateCompanionRecipe,
  type VegetationCompanionRecipe,
  type VegetationCompanionAnchor
} from "./VegetationCompanionPatches";
export { sampleLandscapeSpeciesWeights } from "./VegetationRandom";
/** Portable regional vegetation planning. Coordinates and dimensions are world metres, Y is up.
 * Object semantics are metadata: geometry, access and visibility own every placement constraint.
 */
export type LandscapePoint = readonly [x: number, z: number];
export type LandscapePosition = readonly [x: number, y: number, z: number];
export interface LandscapeBounds {
  readonly min: LandscapePosition;
  readonly max: LandscapePosition;
}
export interface LandscapePolygon {
  readonly outer: readonly LandscapePoint[];
  readonly holes?: readonly (readonly LandscapePoint[])[];
}
export interface LandscapeView {
  readonly id: string;
  readonly eye: LandscapePosition;
  readonly lookAt: LandscapePosition;
  readonly weight: number;
  /** Forward distances used for composition, unrelated to rendering LOD. */
  readonly depthBreaks: readonly [nearEnd: number, middleEnd: number];
}
/** A solid's projected envelope or an actual triangular surface to keep visible. */
export type LandscapeVisibilityTarget = { readonly viewId: string } & (
  | { readonly bounds: LandscapeBounds; readonly padding: number; readonly surface?: never }
  | {
      readonly surface: readonly [LandscapePosition, LandscapePosition, LandscapePosition];
      readonly bounds?: never;
      readonly padding?: never;
    }
);
export interface LandscapeFocus {
  readonly id: string;
  readonly objectId: string;
  /** Informational only. Buildings, trees, rocks and future object types use the same solver. */
  readonly kind: string;
  readonly bounds: LandscapeBounds;
  /** Optional physical support volume; null means a non-solid region, with no occupied box. */
  readonly occupiedBounds?: LandscapeBounds | null;
  /** Population members are part of this subject, not obstacles to its own visibility. */
  readonly members?: readonly { readonly layerId: string; readonly scopeId: string }[];
  readonly clearance: number;
  /** Protect the requested visible part: a facade, crown, rock face, etc. */
  readonly visibility: readonly LandscapeVisibilityTarget[];
}
export interface LandscapePath {
  readonly id: string;
  readonly points: readonly LandscapePoint[];
  readonly width: number;
  readonly clearance: number;
  /** Walkable core stays clear; the outer shoulder gradually admits vegetation. */
  readonly shoulder?: number;
}
export interface LandscapeSeam {
  readonly id: string;
  readonly points: readonly LandscapePoint[];
  /** Full width of the blending strip, in metres. */
  readonly width: number;
  readonly layers: readonly string[];
  readonly densityMultiplier: number;
}
export interface LandscapeGrowthInfluence {
  readonly id: string;
  /** Upstream story, e.g. frequent footsteps or an undisturbed wall corner; metadata only. */
  readonly description: string;
  readonly polygon: LandscapePolygon;
  readonly falloff: number;
  readonly densityMultipliers: Readonly<Record<string, number>>;
}
export interface LandscapeLayerRule {
  readonly id: string;
  readonly palette: readonly {
    readonly assetId: string;
    readonly speciesGroup?: string;
    readonly mixtureGroup?: string;
    readonly foliageVariation?: PlantFoliageVariation;
    readonly barkVariation?: PlantFoliageVariation;
    readonly weight: number;
    /** Optional species-owned size ranges override the layer's uniform size. */
    readonly scale?: readonly [minimum: number, maximum: number];
    readonly heightScale?: readonly [minimum: number, maximum: number];
    readonly horizontalVariation?: readonly [minimum: number, maximum: number];
  }[];
  /** Baseline candidates per square metre, before habitat/composition rejection and local growth boosts. */
  readonly density: number;
  /** Floor before habitat, paths and story suppression; composition alone cannot thin a continuous ground layer below it. */
  readonly minimumDensity?: number;
  readonly spacing: number;
  readonly crownSeparation: number;
  readonly scale: readonly [minimum: number, maximum: number];
  readonly clusterRadius: number;
  readonly clusterScale?: readonly [minimum: number, maximum: number];
  readonly clusterAspect?: readonly [minimum: number, maximum: number];
  /** Nominal area covered by cluster cores; lower values leave larger gaps between patches. */
  readonly clusterCoverage?: number;
  readonly clusterStrength: number;
  readonly speciesCoherence: number;
  /** When present, a shared world field chooses species; density clustering stays independent. */
  readonly speciesRegions?: SpeciesRegionSettings;
  readonly edgeFade: number;
  readonly edgeGrowth?: { readonly width: number; readonly densityMultiplier: number };
  /** Root footprint / crown radius. Leaves can overlap a seam while roots avoid solids and paths.
   * Exclusions and protected sightlines always use the full plant envelope. Defaults to 1. */
  readonly footprintRatio?: number;
  readonly depthWeights: readonly [near: number, middle: number, far: number];
  readonly depthFalloff?: "step" | "smooth";
  readonly maxSlopeDegrees: number;
  /** Accepted members reserve their solid bounds against roots in subsequent layers. */
  readonly occupiesGround?: boolean;
  /** An earlier layer may provide canopy centres for understory. */
  readonly associateWith?: { readonly layerId: string; readonly radius: number; readonly strength: number };
  readonly companionPlanting?: {
    readonly patches: VegetationCompanionRecipe;
    readonly strength: number;
    readonly densityMultiplier: number;
    /** Optional local density derived from desired companion coverage and actual asset footprint. */
    readonly densityPerM2?: number;
  };
}
export interface VegetationLandscapeRequest {
  readonly version: 1;
  readonly regionId: string;
  readonly seed: number;
  readonly region: LandscapePolygon;
  readonly views: readonly LandscapeView[];
  readonly focalTargets: readonly LandscapeFocus[];
  readonly occupied: readonly { readonly id: string; readonly bounds: LandscapeBounds; readonly clearance: number }[];
  /** Water, activity clearings and other areas where plants must not occur. */
  readonly exclusions: readonly {
    readonly id: string;
    readonly polygon: LandscapePolygon;
    readonly clearance: number;
  }[];
  readonly paths: readonly LandscapePath[];
  readonly seams?: readonly LandscapeSeam[];
  readonly influences?: readonly LandscapeGrowthInfluence[];
  readonly layers: readonly LandscapeLayerRule[];
  /** Explicit work/output budgets: overflow fails instead of silently truncating a region. */
  readonly budget: { readonly candidates: number; readonly instances: number };
}
/** Published non-overlapping convex ground cells with physical clump density.
 * This optional area quota replaces baseline Poisson thinning for that layer only.
 */
export interface LandscapePopulationArea {
  /** Independent authoring scope; changing one scope cannot resample its neighbours. */
  readonly scopeId?: string;
  readonly polygon: readonly LandscapePoint[];
  readonly densityPerM2: number;
}
export interface LandscapePlantAsset {
  readonly id: string;
  /** Bounds measured from the chosen asset/variant, including its authored scale. */
  readonly height: number;
  readonly radius: number;
  /** Measured horizontal clump envelope area, distinct from the conservative clearance radius. */
  readonly footprintArea?: number;
  /** Geometry bottom relative to its planting plane, in the same units as height. */
  readonly groundingOffset?: number;
}
export interface LandscapeSurfaceSample {
  readonly height: number;
  readonly slopeDegrees: number;
  /** Habitat suitability by layer, supplied by the owning terrain/ecology system. Missing layers default to 1. */
  readonly suitability?: Readonly<Record<string, number>>;
}
export interface LandscapePlantInstance {
  readonly id: string;
  readonly assetId: string;
  readonly layerId: string;
  readonly clusterId: string;
  /** Seeded foliage/bark chromaticity and gain before global season and explicit overrides. Never changes placement. */
  readonly appearance?: PlantAppearanceSample;
  readonly companionAnchorId?: string;
  /** Native population area owner, independent of instance identity. */
  readonly scopeId?: string;
  readonly position: LandscapePosition;
  readonly yaw: number;
  readonly scale: number;
  /** Exact per-axis scale, when the species has independent height/width growth. */
  readonly scaleAxes?: LandscapePosition;
  readonly radius: number;
  readonly height: number;
  /** Scaled geometry-bottom offset from position.y, which remains the planting plane. */
  readonly groundingOffset?: number;
}
export interface VegetationLandscapePlan {
  readonly version: 1;
  readonly regionId: string;
  readonly seed: number;
  readonly instances: readonly LandscapePlantInstance[];
  readonly diagnostics: {
    readonly candidates: number;
    readonly rejected: Readonly<Record<string, number>>;
    readonly layers: Readonly<Record<string, number>>;
    readonly views: Readonly<Record<string, readonly [number, number, number]>>;
    /** Finite decoration proposals; no expected count or shortfall contract. */
    readonly decorations?: Readonly<
      Record<string, { attempts: number; placed: number; rejected: Readonly<Record<string, number>> }>
    >;
    readonly populations: Readonly<
      Record<
        string,
        {
          expected: number;
          requested: number;
          placed: number;
          shortfall: number;
          attempts: number;
          rejected: Readonly<Record<string, number>>;
        }
      >
    >;
  };
}

type Plane = readonly [number, number, number, number];
const dot = (a: readonly number[], b: readonly number[]) => a.reduce((sum, v, i) => sum + v * b[i], 0);
const subtract = (a: LandscapePosition, b: LandscapePosition): LandscapePosition => [
  a[0] - b[0],
  a[1] - b[1],
  a[2] - b[2]
];
const normalize = (v: LandscapePosition): LandscapePosition => {
  const n = Math.hypot(...v);
  return [v[0] / n, v[1] / n, v[2] / n];
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const clamp = (v: number) => Math.max(0, Math.min(1, v));
function ringInside(p: LandscapePoint, ring: readonly LandscapePoint[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i],
      b = ring[j];
    if (a[1] > p[1] !== b[1] > p[1] && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
/** Test a world-metre point against polygon rings without calculating edge distances.
 * @param point Query position in XZ metres.
 * @param polygon Outer ring and optional holes.
 * @returns Whether the point is inside the outer ring and outside its holes.
 */
export function landscapePolygonContains(point: LandscapePoint, polygon: LandscapePolygon): boolean {
  return ringInside(point, polygon.outer) && !(polygon.holes ?? []).some((hole) => ringInside(point, hole));
}
/** Positive inside the polygon, negative outside or in a hole. */
export function landscapePolygonDistance(p: LandscapePoint, polygon: LandscapePolygon): number {
  let distance = Infinity;
  const measure = (ring: readonly LandscapePoint[]) => {
    for (let i = 0; i < ring.length; i++)
      distance = Math.min(distance, landscapeSegmentDistance(p, ring[i], ring[(i + 1) % ring.length]));
  };
  measure(polygon.outer);
  for (const hole of polygon.holes ?? []) measure(hole);
  return (landscapePolygonContains(p, polygon) ? 1 : -1) * distance;
}
function corners(b: LandscapeBounds): LandscapePosition[] {
  return [b.min[0], b.max[0]].flatMap((x) =>
    [b.min[1], b.max[1]].flatMap((y) => [b.min[2], b.max[2]].map((z) => [x, y, z] as const))
  );
}
function visibilityPlanes(view: LandscapeView, bounds: LandscapeBounds, padding: number): Plane[] {
  const center = bounds.min.map((v, i) => (v + bounds.max[i]) / 2) as unknown as LandscapePosition;
  const forward = normalize(subtract(center, view.eye));
  const right: LandscapePosition =
    Math.hypot(forward[0], forward[2]) > 0 ? normalize([forward[2], 0, -forward[0]]) : [1, 0, 0];
  const up: LandscapePosition = [
    forward[1] * right[2] - forward[2] * right[1],
    forward[2] * right[0] - forward[0] * right[2],
    forward[0] * right[1] - forward[1] * right[0]
  ];
  const projected = corners({
    min: bounds.min.map((v) => v - padding) as unknown as LandscapePosition,
    max: bounds.max.map((v) => v + padding) as unknown as LandscapePosition
  }).map((p) => {
    const delta = subtract(p, view.eye),
      z = dot(delta, forward);
    if (!(z > 0)) throw new Error(`${view.id}: visibility target must be in front of the observer`);
    return [dot(delta, right) / z, dot(delta, up) / z, z];
  });
  const left = Math.min(...projected.map((p) => p[0])),
    rightEdge = Math.max(...projected.map((p) => p[0]));
  const bottom = Math.min(...projected.map((p) => p[1])),
    top = Math.max(...projected.map((p) => p[1]));
  const plane = (a: LandscapePosition, b: LandscapePosition, factor: number): Plane => {
    const n = a.map((v, i) => v + b[i] * factor);
    return [n[0], n[1], n[2], -dot(n, view.eye)];
  };
  return [
    plane(right, forward, -left),
    plane(forward.map((v) => v * rightEdge) as unknown as LandscapePosition, right, -1),
    plane(up, forward, -bottom),
    plane(forward.map((v) => v * top) as unknown as LandscapePosition, up, -1),
    [...forward, -dot(forward, view.eye)] as Plane,
    [-forward[0], -forward[1], -forward[2], dot(forward, view.eye) + Math.max(...projected.map((p) => p[2]))]
  ];
}
/** The convex hull of the eye and a triangle is the exact sight volume to that surface. */
function surfaceVisibilityPlanes(eye: LandscapePosition, surface: readonly LandscapePosition[]): Plane[] {
  const vertices = [eye, ...surface];
  return vertices.map((opposite, index) => {
    const [a, b, c] = vertices.filter((_, i) => i !== index);
    const u = subtract(b, a),
      v = subtract(c, a);
    const normal: LandscapePosition = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const side = dot(normal, subtract(opposite, a));
    if (side === 0) throw new Error("Visibility surface and observer must enclose a nonzero sight volume");
    const n = normalize(normal).map((value) => value * Math.sign(side));
    return [n[0], n[1], n[2], -dot(n, a)] as Plane;
  });
}
function intersectsPlanes(bounds: LandscapeBounds, planes: readonly Plane[]): boolean {
  // Conservative AABB/frustum test: a separating face proves no possible occlusion.
  return planes.every(
    (p) => p[3] + p.slice(0, 3).reduce((s, n, i) => s + n * (n >= 0 ? bounds.max[i] : bounds.min[i]), 0) >= 0
  );
}
export function landscapePlantBounds(
  instance: Pick<LandscapePlantInstance, "position" | "radius" | "height" | "groundingOffset">
): LandscapeBounds {
  const [x, y, z] = instance.position,
    r = instance.radius;
  const bottom = y + (instance.groundingOffset ?? 0);
  return { min: [x - r, bottom, z - r], max: [x + r, bottom + instance.height, z + r] };
}
export function landscapePlantOccludes(
  instance: Pick<LandscapePlantInstance, "position" | "radius" | "height" | "groundingOffset">,
  view: LandscapeView,
  bounds: LandscapeBounds,
  padding = 0
): boolean {
  return intersectsPlanes(landscapePlantBounds(instance), visibilityPlanes(view, bounds, padding));
}
/** Prepare authored sight volumes once, including exact triangular targets.
 * @param views Observers in world metres.
 * @param targets Subjects whose requested surfaces must remain visible.
 * @returns A predicate rejecting occluding plants, except members of their own subject.
 */
export function createLandscapeVisibilityQuery(views: readonly LandscapeView[], targets: readonly LandscapeFocus[]) {
  const byView = new Map(views.map((view) => [view.id, view]));
  const volumes = targets.flatMap((target) =>
    target.visibility.map((visibility) => ({
      members: target.members,
      planes: visibility.surface
        ? surfaceVisibilityPlanes(byView.get(visibility.viewId)!.eye, visibility.surface)
        : visibilityPlanes(byView.get(visibility.viewId)!, visibility.bounds, visibility.padding)
    }))
  );
  return (instance: LandscapePlantInstance) =>
    volumes.some(
      (volume) =>
        !volume.members?.some((member) => member.layerId === instance.layerId && member.scopeId === instance.scopeId) &&
        intersectsPlanes(landscapePlantBounds(instance), volume.planes)
    );
}
function depthBand(p: LandscapePosition, view: LandscapeView): 0 | 1 | 2 {
  const depth = dot(subtract(p, view.eye), normalize(subtract(view.lookAt, view.eye)));
  return depth < view.depthBreaks[0] ? 0 : depth < view.depthBreaks[1] ? 1 : 2;
}

const smooth = (t: number) => {
  const c = clamp(t);
  return c * c * (3 - 2 * c);
};
function depthWeight(p: LandscapePosition, view: LandscapeView, layer: LandscapeLayerRule): number {
  if (layer.depthFalloff !== "smooth") return layer.depthWeights[depthBand(p, view)];
  const depth = Math.max(0, dot(subtract(p, view.eye), normalize(subtract(view.lookAt, view.eye))));
  const [near, middle, far] = layer.depthWeights,
    [a, b] = view.depthBreaks;
  return depth < a ? lerp(near, middle, smooth(depth / a)) : lerp(middle, far, smooth((depth - a) / (b - a)));
}

/** Homogeneous Poisson arrival process: zero, one or many samples anywhere; no sampling lattice.
 * Independent hashed domains keep species, scale and placement reproducible. */
function* poissonIds(seed: number, key: string, mean: number): Generator<string> {
  let arrival = 0;
  for (let i = 0; ; i++) {
    const id = `${key}/${i}`;
    arrival -= Math.log(1 - rank(seed, `${id}/arrival`));
    if (arrival >= mean) return;
    yield id;
  }
}

/** Compile once, then consume exact instances. Moving the render camera never regenerates a plan. */
export function compileVegetationLandscape(
  request: VegetationLandscapeRequest,
  assets: readonly LandscapePlantAsset[],
  sampleSurface: (x: number, z: number) => LandscapeSurfaceSample = () => ({ height: 0, slopeDegrees: 0 }),
  sampling?: {
    /** Stable spatial partition; region/exclusions remain the physical boundary. */
    readonly bounds: { readonly min: LandscapePoint; readonly max: LandscapePoint };
    /** Already published canopy anchors participate in association, without being regenerated. */
    readonly plants?: readonly LandscapePlantInstance[];
    readonly anchors?: readonly VegetationCompanionAnchor[];
    readonly populationAreas?: Readonly<Record<string, readonly LandscapePopulationArea[]>>;
    /** Published native-asset weights per layer and authoring scope; reuse the same species RNG domain. */
    readonly populationAssetWeights?: Readonly<
      Record<string, Readonly<Record<string, Readonly<Record<string, number>>>>>
    >;
  }
): VegetationLandscapePlan {
  validateLandscapeRequest(request, assets);
  const byAsset = new Map(assets.map((a) => [a.id, a]));
  const byView = new Map(request.views.map((v) => [v.id, v]));
  const sightVolumes = request.focalTargets.flatMap((f) =>
    f.visibility.map((v) => ({
      members: f.members,
      planes: v.surface
        ? surfaceVisibilityPlanes(byView.get(v.viewId)!.eye, v.surface)
        : visibilityPlanes(byView.get(v.viewId)!, v.bounds, v.padding)
    }))
  );
  const instances: LandscapePlantInstance[] = [];
  const rejected: Record<string, number> = {},
    layerCounts: Record<string, number> = {};
  const populations: Record<
    string,
    {
      expected: number;
      requested: number;
      placed: number;
      shortfall: number;
      attempts: number;
      rejected: Record<string, number>;
    }
  > = {};
  const reject = (reason: string) => {
    rejected[reason] = (rejected[reason] ?? 0) + 1;
  };
  const minX = sampling?.bounds.min[0] ?? Math.min(...request.region.outer.map((p) => p[0])),
    maxX = sampling?.bounds.max[0] ?? Math.max(...request.region.outer.map((p) => p[0]));
  const minZ = sampling?.bounds.min[1] ?? Math.min(...request.region.outer.map((p) => p[1])),
    maxZ = sampling?.bounds.max[1] ?? Math.max(...request.region.outer.map((p) => p[1]));
  if (![minX, maxX, minZ, maxZ].every(Number.isFinite) || minX >= maxX || minZ >= maxZ)
    throw new Error("Invalid landscape sampling bounds");
  const occupied = [
    ...request.occupied,
    ...request.focalTargets
      .filter((f) => f.occupiedBounds !== null)
      .map((f) => ({ ...f, bounds: f.occupiedBounds ?? f.bounds }))
  ];
  // A footprint cannot touch a polygon outside its bounds expanded by radius + clearance.
  // This broad phase preserves the exact polygon/hole test for every possible contact.
  const exclusions = request.exclusions.map((exclusion) => ({
    ...exclusion,
    minX: Math.min(...exclusion.polygon.outer.map((p) => p[0])),
    maxX: Math.max(...exclusion.polygon.outer.map((p) => p[0])),
    minZ: Math.min(...exclusion.polygon.outer.map((p) => p[1])),
    maxZ: Math.max(...exclusion.polygon.outer.map((p) => p[1]))
  }));
  const viewWeight = request.views.reduce((sum, v) => sum + v.weight, 0);
  const paths = request.paths.map((path) => ({ ...path, query: createLandscapePolylineQuery(path.points) }));
  const preparedSeams = (request.seams ?? []).map((seam) => ({
    ...seam,
    query: createLandscapePolylineQuery(seam.points)
  }));
  const jobs = request.layers.flatMap<{
    layer: LandscapeLayerRule;
    scopeId: string;
    areas?: readonly LandscapePopulationArea[];
  }>((layer) => {
    const areas = sampling?.populationAreas?.[layer.id];
    if (!areas) return [{ layer, areas: undefined, scopeId: "" }];
    const scopes = new Map<string, LandscapePopulationArea[]>();
    for (const area of areas) {
      const key = area.scopeId ?? "",
        group = scopes.get(key) ?? [];
      group.push(area);
      scopes.set(key, group);
    }
    if (!scopes.size) scopes.set("", []);
    return [...scopes]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([scopeId, areas]) => {
        const weights = sampling?.populationAssetWeights?.[layer.id]?.[scopeId];
        if (!weights) return { layer, scopeId, areas };
        for (const [assetId, weight] of Object.entries(weights)) {
          if (
            !Number.isFinite(weight) ||
            weight < 0 ||
            (weight > 0 && !layer.palette.some((member) => member.assetId === assetId))
          )
            throw new Error(`${layer.id}/${scopeId}: invalid population asset weight: ${assetId}`);
        }
        const palette = layer.palette
          .map((member) => ({ ...member, weight: weights[member.assetId] ?? member.weight }))
          .filter((member) => member.weight > 0);
        // An explicitly empty species selection generates no plants; no alternative asset is inserted.
        return { layer: palette.length ? { ...layer, palette } : { ...layer, density: 0 }, scopeId, areas };
      });
  });
  const quotaLayerCount = jobs.filter((job) => job.areas !== undefined).length;
  const quotaWorkBudget = Math.floor(request.budget.candidates / jobs.length);
  const normalWorkBudget = request.budget.candidates - quotaLayerCount * quotaWorkBudget;
  const scopePopulations: Record<string, (typeof populations)[string][]> = {};
  let candidates = 0,
    normalWork = 0;
  const spend = () => {
    if (++normalWork > normalWorkBudget) throw new Error("Landscape candidate budget exceeded");
  };
  for (const layer of request.layers) layerCounts[layer.id] = 0;
  for (const { layer, areas, scopeId } of jobs) {
    const previousCount = layerCounts[layer.id];
    const sampleKey = scopeId ? `${request.regionId}/${scopeId}` : request.regionId;
    if (layer.density === 0) continue;
    const sightPlanes = sightVolumes
      .filter((volume) => !volume.members?.some((member) => member.layerId === layer.id && member.scopeId === scopeId))
      .map((volume) => volume.planes);
    const palette = [...layer.palette].sort((a, b) => a.assetId.localeCompare(b.assetId));
    const totalWeight = palette.reduce((s, p) => s + p.weight, 0);
    const speciesAt = layer.speciesRegions
      ? createVegetationSpeciesRegions(request.seed, palette, layer.speciesRegions)
      : undefined;
    const maxRadius = Math.max(
      ...palette.map(
        (p) => byAsset.get(p.assetId)!.radius * (p.scale ?? layer.scale)[1] * (p.horizontalVariation?.[1] ?? 1)
      )
    );
    // A grid only accelerates neighbour queries; it never determines candidate positions.
    const packCell = Math.max(layer.spacing, 2 * maxRadius * layer.crownSeparation, 1 / Math.sqrt(layer.density));
    const packing = new Map<string, LandscapePlantInstance[]>();
    const association = layer.associateWith;
    const parents = association
      ? [...(sampling?.plants ?? []), ...instances].filter((p) => p.layerId === association.layerId)
      : [];
    const companion = layer.companionPlanting?.strength ? layer.companionPlanting : undefined;
    const companionAt = companion
      ? createVegetationCompanionPatches(
          request.seed,
          [...(sampling?.anchors ?? []), ...(sampling?.plants ?? []), ...instances],
          companion.patches
        )
      : undefined;
    const localCompanions = companion?.densityPerM2 !== undefined && !areas;
    const seams = preparedSeams.filter((s) => s.layers.includes(layer.id));
    const influences = (request.influences ?? []).filter((i) => i.densityMultipliers[layer.id] !== undefined);
    const envelope = Math.max(
      1,
      localCompanions ? 1 : (companion?.densityMultiplier ?? 1),
      layer.edgeGrowth?.densityMultiplier ?? 1,
      ...seams.map((s) => s.densityMultiplier),
      ...influences.map((i) => i.densityMultipliers[layer.id])
    );
    const triangles: { points: LandscapePoint[]; mass: number }[] = [];
    let expected = 0;
    if (areas)
      for (const area of areas) {
        if (!Number.isFinite(area.densityPerM2) || area.densityPerM2 < 0)
          throw new Error("Invalid population area density");
        if (area.densityPerM2 === 0) continue;
        if (area.polygon.length < 3 || area.polygon.some((p) => p.length !== 2 || !p.every(Number.isFinite)))
          throw new Error("Invalid population area polygon");
        let polygon = [...area.polygon];
        for (const [axis, bound, sign] of [
          [0, minX, 1],
          [0, maxX, -1],
          [1, minZ, 1],
          [1, maxZ, -1]
        ]) {
          const clipped: LandscapePoint[] = [];
          for (let i = 0; i < polygon.length; i++) {
            const a = polygon[i],
              b = polygon[(i + 1) % polygon.length];
            const u = (a[axis] - bound) * sign,
              v = (b[axis] - bound) * sign;
            if (u >= 0) clipped.push(a);
            if (u >= 0 !== v >= 0) clipped.push([lerp(a[0], b[0], u / (u - v)), lerp(a[1], b[1], u / (u - v))]);
          }
          polygon = clipped;
        }
        for (let i = 1; i + 1 < polygon.length; i++) {
          const [a, b, c] = [polygon[0], polygon[i], polygon[i + 1]];
          const mass =
            (Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2) * area.densityPerM2;
          if (mass > 0) {
            expected += mass;
            triangles.push({ points: [a, b, c], mass: expected });
          }
        }
      }
    const requested =
      Math.floor(expected) + (rank(request.seed, `${sampleKey}/${layer.id}/round`) < expected % 1 ? 1 : 0);
    const quota = areas
      ? { expected, requested, placed: 0, shortfall: requested, attempts: 0, rejected: {} as Record<string, number> }
      : undefined;
    if (quota) (scopePopulations[layer.id] ??= []).push(quota);
    if (quota && requested === 0) continue;
    const rejectedBefore = { ...rejected };
    const mean =
      (maxX - minX) * (maxZ - minZ) * layer.density * envelope * (localCompanions ? 1 - companion!.strength : 1);
    if (!Number.isFinite(mean)) throw new Error("Landscape candidate budget exceeded");
    const clusterScale = layer.clusterScale ?? [1, 1],
      clusterAspect = layer.clusterAspect ?? [1, 1];
    const margin = layer.clusterRadius * clusterScale[1] * Math.sqrt(clusterAspect[1]);
    const clusterArea = (maxX - minX + 2 * margin) * (maxZ - minZ + 2 * margin);
    const clusters = [] as { id: string; x: number; z: number; a: number; b: number; cos: number; sin: number }[];
    let quotaWork = 0;
    const clusterIntensity = layer.clusterCoverage === undefined ? 1 : -Math.log(1 - layer.clusterCoverage);
    for (const id of poissonIds(
      request.seed,
      `${sampleKey}/${layer.id}/cluster`,
      (clusterIntensity * clusterArea) / (Math.PI * layer.clusterRadius ** 2)
    )) {
      if (quota) {
        if (++quotaWork > quotaWorkBudget) {
          quota.rejected["cluster-budget"] = 1;
          break;
        }
      } else spend();
      const r = layer.clusterRadius * lerp(...clusterScale, rank(request.seed, `${id}/scale`));
      const aspect = Math.sqrt(lerp(...clusterAspect, rank(request.seed, `${id}/aspect`)));
      const angle = rank(request.seed, `${id}/angle`) * 2 * Math.PI;
      clusters.push({
        id,
        x: lerp(minX - margin, maxX + margin, rank(request.seed, `${id}/x`)),
        z: lerp(minZ - margin, maxZ + margin, rank(request.seed, `${id}/z`)),
        a: r * aspect,
        b: r / aspect,
        cos: Math.cos(angle),
        sin: Math.sin(angle)
      });
    }
    // Equal per-layer work reservation prevents an impossible quota from consuming other layers' budget.
    if (quota?.rejected["cluster-budget"]) continue;
    const attemptBudget = quotaWorkBudget - quotaWork;
    function* populationIds() {
      for (let i = 0; i < attemptBudget && layerCounts[layer.id] - previousCount < requested; i++)
        yield `${sampleKey}/${layer.id}/plant/${i}`;
    }
    function* candidatesWithPositions() {
      for (const id of quota
        ? populationIds()
        : poissonIds(request.seed, `${request.regionId}/${layer.id}/plant`, mean))
        yield { id, position: undefined as LandscapePoint | undefined, local: false };
      // Sample only each pocket's physical support. IDs exclude stream cells, so a seam
      // neither duplicates nor resamples companions. No per-tree count or retry target.
      if (localCompanions)
        for (const patch of companionAt!.patches) {
          const dx = Math.hypot(patch.a * patch.cos, patch.b * patch.sin);
          const dz = Math.hypot(patch.a * patch.sin, patch.b * patch.cos);
          if (patch.x + dx < minX || patch.x - dx >= maxX || patch.z + dz < minZ || patch.z - dz >= maxZ) continue;
          const mass = Math.PI * patch.a * patch.b * companion!.densityPerM2! * companion!.strength * envelope;
          if (!Number.isFinite(mass)) throw new Error("Landscape candidate budget exceeded");
          for (const id of poissonIds(request.seed, `${patch.id}/${layer.id}/plant`, mass)) {
            const r = Math.sqrt(rank(request.seed, `${id}/radius`)),
              angle = rank(request.seed, `${id}/angle`) * Math.PI * 2;
            const u = r * Math.cos(angle) * patch.a,
              v = r * Math.sin(angle) * patch.b;
            const position: LandscapePoint = [
              patch.x + u * patch.cos - v * patch.sin,
              patch.z + u * patch.sin + v * patch.cos
            ];
            if (position[0] >= minX && position[0] < maxX && position[1] >= minZ && position[1] < maxZ)
              yield { id, position, local: true };
            else spend();
          }
        }
    }
    for (const candidate of candidatesWithPositions()) {
      const { id } = candidate;
      if (quota) quota.attempts++;
      else spend();
      candidates++;
      const random = (domain: string) => rank(request.seed, `${id}/${domain}`);
      let p: LandscapePoint = candidate.position ?? [lerp(minX, maxX, random("x")), lerp(minZ, maxZ, random("z"))];
      if (quota) {
        const mass = random("area") * expected;
        let low = 0,
          high = triangles.length - 1;
        while (low < high) {
          const mid = (low + high) >>> 1;
          if (triangles[mid].mass > mass) high = mid;
          else low = mid + 1;
        }
        const [a, b, c] = triangles[low].points,
          u = Math.sqrt(random("x")),
          v = random("z");
        p = [a[0] * (1 - u) + b[0] * u * (1 - v) + c[0] * u * v, a[1] * (1 - u) + b[1] * u * (1 - v) + c[1] * u * v];
      }
      let clusterId = id,
        distance2 = Infinity;
      for (const c of clusters) {
        const dx = p[0] - c.x,
          dz = p[1] - c.z;
        const d2 = ((dx * c.cos + dz * c.sin) / c.a) ** 2 + ((-dx * c.sin + dz * c.cos) / c.b) ** 2;
        if (d2 < distance2) {
          distance2 = d2;
          clusterId = c.id;
        }
      }
      const pocket = companionAt?.(p);
      if (candidate.local && pocket?.patchId) clusterId = pocket.patchId;
      const background = lerp(1, Math.exp(-distance2 / 2), layer.clusterStrength);
      // Overlapping proposal ellipses must not multiply the shared density field.
      const clustered = localCompanions
        ? candidate.local
          ? pocket!.weight / pocket!.overlapCount
          : background
        : companion
          ? lerp(background, pocket!.weight, companion.strength)
          : background;
      let chosen = palette[palette.length - 1];
      const speciesRegion = speciesAt?.(p, id);
      if (speciesRegion) chosen = speciesRegion.member;
      else {
        let selection =
          (random("coherence") < layer.speciesCoherence
            ? rank(request.seed, `${clusterId}/species`)
            : random("species")) * totalWeight;
        for (const member of palette) {
          selection -= member.weight;
          if (selection < 0) {
            chosen = member;
            break;
          }
        }
      }
      const asset = byAsset.get(chosen.assetId)!;
      const range = chosen.scale ?? layer.scale;
      const heightRange = chosen.heightScale ?? range;
      const scale = lerp(range[0], range[1], random("scale"));
      const variation = chosen.horizontalVariation ?? [1, 1];
      const scaleAxes: LandscapePosition = [
        scale * lerp(variation[0], variation[1], random("scale-x")),
        lerp(heightRange[0], heightRange[1], random("scale")),
        scale * lerp(variation[0], variation[1], random("scale-z"))
      ];
      const radius = asset.radius * Math.max(scaleAxes[0], scaleAxes[2]),
        height = asset.height * scaleAxes[1];
      const footprint = radius * (layer.footprintRatio ?? 1);
      const edge = landscapePolygonDistance(p, request.region) - footprint;
      if (edge < 0) {
        reject("region");
        continue;
      }
      if (
        exclusions.some((e) => {
          const reach = radius + e.clearance;
          return (
            p[0] >= e.minX - reach &&
            p[0] <= e.maxX + reach &&
            p[1] >= e.minZ - reach &&
            p[1] <= e.maxZ + reach &&
            landscapePolygonDistance(p, e.polygon) >= -reach
          );
        })
      ) {
        reject("exclusion");
        continue;
      }
      let pathWeight = 1;
      for (const path of paths) {
        const shoulderDistance = path.query.distance(p) - footprint - path.width / 2 - path.clearance;
        pathWeight *= shoulderDistance < 0 ? 0 : path.shoulder ? smooth(shoulderDistance / path.shoulder) : 1;
      }
      if (pathWeight === 0) {
        reject("path");
        continue;
      }
      const surface = sampleSurface(...p);
      if (
        !Number.isFinite(surface.height) ||
        !Number.isFinite(surface.slopeDegrees) ||
        surface.slopeDegrees < 0 ||
        surface.slopeDegrees > 90
      )
        throw new Error("Invalid landscape surface sample");
      const suitability = surface.suitability?.[layer.id] ?? 1;
      if (!Number.isFinite(suitability) || suitability < 0 || suitability > 1)
        throw new Error("Invalid landscape habitat suitability");
      if (surface.slopeDegrees > layer.maxSlopeDegrees) {
        reject("slope");
        continue;
      }
      const instance: LandscapePlantInstance = {
        ...(pocket?.anchorId ? { companionAnchorId: pocket.anchorId } : {}),
        ...(speciesRegion && (chosen.foliageVariation || chosen.barkVariation)
          ? {
              appearance: {
                ...(chosen.foliageVariation
                  ? {
                      foliage: vegetationColorVariation(
                        request.seed,
                        chosen.speciesGroup ?? chosen.assetId,
                        id,
                        speciesRegion,
                        chosen.foliageVariation,
                        "foliage"
                      )
                    }
                  : {}),
                ...(chosen.barkVariation
                  ? {
                      bark: vegetationColorVariation(
                        request.seed,
                        chosen.speciesGroup ?? chosen.assetId,
                        id,
                        speciesRegion,
                        chosen.barkVariation,
                        "bark"
                      )
                    }
                  : {})
              }
            }
          : {}),
        id,
        assetId: asset.id,
        layerId: layer.id,
        clusterId,
        ...(scopeId ? { scopeId } : {}),
        position: [p[0], surface.height, p[1]],
        yaw: random("yaw") * 360,
        scale,
        ...(chosen.heightScale || chosen.horizontalVariation ? { scaleAxes } : {}),
        radius,
        height,
        ...(asset.groundingOffset !== undefined ? { groundingOffset: asset.groundingOffset * scaleAxes[1] } : {})
      };
      const bounds = landscapePlantBounds(instance);
      const rootBounds = landscapePlantBounds({ ...instance, radius: footprint });
      if (
        occupied.some((o) =>
          [0, 1, 2].every(
            (a) =>
              rootBounds.max[a] > o.bounds.min[a] - o.clearance && rootBounds.min[a] < o.bounds.max[a] + o.clearance
          )
        )
      ) {
        reject("occupied");
        continue;
      }
      if (sightPlanes.some((planes) => intersectsPlanes(bounds, planes))) {
        reject("visibility");
        continue;
      }
      const depth = viewWeight
        ? request.views.reduce((s, v) => s + v.weight * depthWeight(instance.position, v, layer), 0) / viewWeight
        : 1;
      const nearestParent = parents.reduce(
        (d, parent) => Math.min(d, Math.hypot(p[0] - parent.position[0], p[1] - parent.position[2])),
        Infinity
      );
      const associated = association
        ? lerp(1, Math.exp(-(nearestParent ** 2) / (2 * association.radius ** 2)), association.strength)
        : 1;
      let boost = 1,
        suppression = 1;
      const influence = (multiplier: number, strength: number) => {
        const factor = lerp(1, multiplier, strength);
        if (factor >= 1) boost = Math.max(boost, factor);
        else suppression *= factor;
      };
      if (companion && !localCompanions) influence(companion.densityMultiplier, pocket!.weight);
      for (const seam of seams)
        influence(seam.densityMultiplier, 1 - smooth(seam.query.distance(p, seam.width / 2) / (seam.width / 2)));
      for (const zone of influences) {
        const distance = landscapePolygonDistance(p, zone.polygon);
        influence(
          zone.densityMultipliers[layer.id],
          distance >= 0 ? 1 : zone.falloff ? 1 - smooth(-distance / zone.falloff) : 0
        );
      }
      if (layer.edgeGrowth) influence(layer.edgeGrowth.densityMultiplier, 1 - smooth(edge / layer.edgeGrowth.width));
      const edgeWeight = layer.edgeFade ? smooth(edge / layer.edgeFade) : 1;
      const compositionDensity = Math.max(layer.minimumDensity ?? 0, layer.density * depth * clustered * associated);
      if (
        random("density") >=
        (((suitability * compositionDensity) / layer.density) * edgeWeight * pathWeight * boost * suppression) /
          envelope
      ) {
        reject("density");
        continue;
      }
      const px = Math.floor(p[0] / packCell),
        pz = Math.floor(p[1] / packCell);
      let collision = false;
      for (let x = px - 1; x <= px + 1; x++)
        for (let z = pz - 1; z <= pz + 1; z++)
          if (
            (packing.get(`${x}/${z}`) ?? []).some(
              (other) =>
                Math.hypot(p[0] - other.position[0], p[1] - other.position[2]) <
                Math.max(layer.spacing, (radius + other.radius) * layer.crownSeparation)
            )
          )
            collision = true;
      if (collision) {
        reject("spacing");
        continue;
      }
      if (instances.length >= request.budget.instances) {
        if (quota) {
          reject("instance-budget");
          break;
        }
        throw new Error("Landscape instance budget exceeded");
      }
      instances.push(instance);
      if (layer.occupiesGround) occupied.push({ id, bounds, clearance: 0 });
      layerCounts[layer.id]++;
      const key = `${px}/${pz}`,
        bucket = packing.get(key) ?? [];
      bucket.push(instance);
      packing.set(key, bucket);
    }
    if (quota) {
      quota.placed = layerCounts[layer.id] - previousCount;
      quota.shortfall = quota.requested - quota.placed;
      for (const [reason, count] of Object.entries(rejected)) {
        const delta = count - (rejectedBefore[reason] ?? 0);
        if (delta) quota.rejected[reason] = delta;
      }
    }
  }
  for (const [layer, scopes] of Object.entries(scopePopulations)) {
    const total = (populations[layer] = {
      expected: 0,
      requested: 0,
      placed: 0,
      shortfall: 0,
      attempts: 0,
      rejected: {} as Record<string, number>
    });
    for (const scope of scopes) {
      for (const key of ["expected", "requested", "placed", "shortfall", "attempts"] as const) total[key] += scope[key];
      for (const [reason, count] of Object.entries(scope.rejected))
        total.rejected[reason] = (total.rejected[reason] ?? 0) + count;
    }
  }
  return {
    version: 1,
    regionId: request.regionId,
    seed: request.seed,
    instances,
    diagnostics: {
      candidates,
      populations,
      rejected,
      layers: layerCounts,
      views: Object.fromEntries(
        request.views.map((v) => {
          const counts: [number, number, number] = [0, 0, 0];
          instances.forEach((p) => counts[depthBand(p.position, v)]++);
          return [v.id, counts];
        })
      )
    }
  };
}

export function validateLandscapeRequest(r: VegetationLandscapeRequest, assets: readonly LandscapePlantAsset[]): void {
  const require = (condition: boolean, message: string) => {
    if (!condition) throw new Error(`Landscape: ${message}`);
  };
  const number = (v: number, min = 0, max = Infinity) => Number.isFinite(v) && v >= min && v <= max;
  const point = (p: readonly number[], size: number) =>
    Array.isArray(p) && p.length === size && p.every(Number.isFinite);
  const bounds = (b: LandscapeBounds) =>
    !!b &&
    point(b.min, 3) &&
    point(b.max, 3) &&
    b.min.every((v, i) => v <= b.max[i]) &&
    b.min.some((v, i) => v < b.max[i]);
  const unique = (ids: readonly string[]) =>
    ids.every((id) => typeof id === "string" && id.length > 0) && new Set(ids).size === ids.length;
  const polygon = (p: LandscapePolygon) => {
    require(!!p && Array.isArray(p.outer), "polygon is required");
    require(p.holes === undefined || Array.isArray(p.holes), "invalid polygon holes");
    const rings = [p.outer, ...(p.holes ?? [])];
    const orientation = (a: LandscapePoint, b: LandscapePoint, c: LandscapePoint) =>
      (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const onSegment = (a: LandscapePoint, b: LandscapePoint, p: LandscapePoint) =>
      orientation(a, b, p) === 0 &&
      p[0] >= Math.min(a[0], b[0]) &&
      p[0] <= Math.max(a[0], b[0]) &&
      p[1] >= Math.min(a[1], b[1]) &&
      p[1] <= Math.max(a[1], b[1]);
    const intersects = (a: LandscapePoint, b: LandscapePoint, c: LandscapePoint, d: LandscapePoint) => {
      const abC = orientation(a, b, c),
        abD = orientation(a, b, d),
        cdA = orientation(c, d, a),
        cdB = orientation(c, d, b);
      return (
        (abC * abD < 0 && cdA * cdB < 0) ||
        onSegment(a, b, c) ||
        onSegment(a, b, d) ||
        onSegment(c, d, a) ||
        onSegment(c, d, b)
      );
    };
    for (const ring of rings) {
      require(ring.length >= 3 && ring.every((p) => point(p, 2)), "polygon rings need at least three finite points");
      const area = ring.reduce((s, a, i) => {
        const b = ring[(i + 1) % ring.length];
        return s + a[0] * b[1] - b[0] * a[1];
      }, 0);
      require(Math.abs(area) > 0, "polygon has no area");
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i],
          b = ring[(i + 1) % ring.length];
        require(a[0] !== b[0] || a[1] !== b[1], "polygon contains a zero-length edge; do not repeat the first vertex");
        for (let j = i + 2; j < ring.length; j++)
          if (i !== 0 || j !== ring.length - 1)
            require(!intersects(a, b, ring[j], ring[(j + 1) % ring.length]), "polygon must not self-intersect");
      }
    }
    for (let i = 1; i < rings.length; i++) {
      require(rings[i].every((vertex) => ringInside(vertex, p.outer)), "holes must be inside the outer ring");
      for (let j = 0; j < i; j++) {
        for (let a = 0; a < rings[i].length; a++)
          for (let b = 0; b < rings[j].length; b++)
            require(!intersects(
              rings[i][a],
              rings[i][(a + 1) % rings[i].length],
              rings[j][b],
              rings[j][(b + 1) % rings[j].length]
            ), "polygon rings must not intersect");
        if (j > 0)
          require(!ringInside(rings[i][0], rings[j]) &&
            !ringInside(rings[j][0], rings[i]), "polygon holes must not overlap");
      }
    }
  };
  require(!!r &&
    r.version === 1 &&
    typeof r.regionId === "string" &&
    r.regionId.length > 0, "invalid request identity/version");
  require(Number.isInteger(r.seed) && number(r.seed, 0, 4294967295), "seed must be uint32");
  require([r.views, r.focalTargets, r.occupied, r.exclusions, r.paths, r.layers].every(
    Array.isArray
  ), "missing request collections");
  require((r.seams === undefined || Array.isArray(r.seams)) &&
    (r.influences === undefined || Array.isArray(r.influences)), "invalid growth collections");
  polygon(r.region);
  require(!!r.budget &&
    Number.isSafeInteger(r.budget.candidates) &&
    r.budget.candidates > 0 &&
    Number.isSafeInteger(r.budget.instances) &&
    r.budget.instances > 0, "invalid budgets");
  require(unique(assets.map((a) => a.id)) &&
    assets.every(
      (a) => number(a.radius) && number(a.height) && a.radius > 0 && a.height > 0
    ), "invalid asset dimensions or duplicate asset id");
  require(unique(r.views.map((v) => v.id)) &&
    unique(r.layers.map((l) => l.id)) &&
    unique(r.focalTargets.map((f) => f.id)), "duplicate or empty identities");
  for (const v of r.views)
    require(point(v.eye, 3) &&
      point(v.lookAt, 3) &&
      Math.hypot(...subtract(v.eye, v.lookAt)) > 0 &&
      number(v.weight) &&
      point(v.depthBreaks, 2) &&
      v.depthBreaks[0] > 0 &&
      v.depthBreaks[1] > v.depthBreaks[0], `${v.id}: invalid view`);
  for (const o of [...r.occupied, ...r.focalTargets])
    require(bounds(o.bounds) && number(o.clearance), `${o.id}: invalid occupied bounds`);
  for (const f of r.focalTargets) {
    require(typeof f.objectId === "string" &&
      !!f.objectId &&
      typeof f.kind === "string" &&
      Array.isArray(f.visibility), `${f.id}: invalid focus`);
    require(f.occupiedBounds === undefined ||
      f.occupiedBounds === null ||
      bounds(f.occupiedBounds), `${f.id}: invalid support bounds`);
    require(f.members === undefined ||
      (Array.isArray(f.members) &&
        f.members.every(
          (member) =>
            r.layers.some((layer) => layer.id === member.layerId) &&
            typeof member.scopeId === "string" &&
            !!member.scopeId
        )), `${f.id}: invalid population membership`);
    for (const v of f.visibility)
      require(r.views.some((x) => x.id === v.viewId) &&
        (v.surface !== undefined
          ? v.bounds === undefined &&
            v.padding === undefined &&
            Array.isArray(v.surface) &&
            v.surface.length === 3 &&
            v.surface.every((p) => point(p, 3))
          : bounds(v.bounds) && number(v.padding)), `${f.id}: invalid visibility target`);
  }
  for (const e of r.exclusions) {
    polygon(e.polygon);
    require(number(e.clearance), `${e.id}: invalid exclusion clearance`);
  }
  for (const p of r.paths)
    require(Array.isArray(p.points) &&
      p.points.length >= 2 &&
      p.points.every((v) => point(v, 2)) &&
      number(p.width) &&
      p.width > 0 &&
      number(p.clearance) &&
      (p.shoulder === undefined || number(p.shoulder)), `${p.id}: invalid path`);
  for (const asset of assets)
    require(asset.footprintArea === undefined ||
      (number(asset.footprintArea) && asset.footprintArea > 0), `${asset.id}: invalid footprint area`);
  for (const asset of assets)
    require(asset.groundingOffset === undefined ||
      Number.isFinite(asset.groundingOffset), `${asset.id}: invalid grounding offset`);
  const assetIds = new Set(assets.map((a) => a.id)),
    previous = new Set<string>();
  for (const l of r.layers) {
    require(Array.isArray(l.palette) &&
      l.palette.length > 0 &&
      unique(l.palette.map((p) => p.assetId)) &&
      l.palette.every((p) => assetIds.has(p.assetId) && number(p.weight) && p.weight > 0), `${l.id}: invalid palette`);
    for (const member of l.palette)
      for (const range of [member.scale, member.heightScale, member.horizontalVariation]) {
        require(range === undefined ||
          (Array.isArray(range) &&
            range.length === 2 &&
            range.every((v) => number(v) && v > 0) &&
            range[1] >= range[0]), `${l.id}: invalid species scale`);
      }
    require(l.minimumDensity === undefined ||
      number(l.minimumDensity, 0, l.density), `${l.id}: invalid minimum density`);
    require([l.density, l.spacing, l.edgeFade].every((v) => number(v)) &&
      number(l.clusterRadius) &&
      l.clusterRadius > 0 &&
      [l.crownSeparation, l.clusterStrength, l.speciesCoherence].every((v) => number(v, 0, 1)) &&
      number(l.maxSlopeDegrees, 0, 90) &&
      point(l.scale, 2) &&
      l.scale[0] > 0 &&
      l.scale[1] >= l.scale[0] &&
      point(l.depthWeights, 3) &&
      l.depthWeights.every((v) => number(v, 0, 1)), `${l.id}: invalid rule`);
    for (const range of [l.clusterScale, l.clusterAspect])
      require(range === undefined ||
        (point(range, 2) && range[0] > 0 && range[1] >= range[0]), `${l.id}: invalid cluster shape`);
    require(l.occupiesGround === undefined ||
      typeof l.occupiesGround === "boolean", `${l.id}: invalid ground occupancy`);
    require(l.footprintRatio === undefined || number(l.footprintRatio, 0, 1), `${l.id}: invalid root footprint`);
    require(l.clusterCoverage === undefined ||
      (number(l.clusterCoverage) &&
        l.clusterCoverage > 0 &&
        l.clusterCoverage < 1), `${l.id}: invalid cluster coverage`);
    require(l.depthFalloff === undefined ||
      l.depthFalloff === "step" ||
      l.depthFalloff === "smooth", `${l.id}: invalid depth falloff`);
    if (l.edgeGrowth)
      require(number(l.edgeGrowth.width) &&
        l.edgeGrowth.width > 0 &&
        number(l.edgeGrowth.densityMultiplier), `${l.id}: invalid edge growth`);
    if (l.companionPlanting) {
      validateCompanionRecipe(l.companionPlanting.patches);
      require(!l.associateWith &&
        number(l.companionPlanting.strength, 0, 1) &&
        number(l.companionPlanting.densityMultiplier, 0) &&
        (l.companionPlanting.densityPerM2 === undefined ||
          number(l.companionPlanting.densityPerM2, 0)), `${l.id}: invalid companion planting`);
    }
    if (l.associateWith)
      require(previous.has(l.associateWith.layerId) &&
        number(l.associateWith.radius) &&
        l.associateWith.radius > 0 &&
        number(l.associateWith.strength, 0, 1), `${l.id}: association must refer to an earlier layer`);
    previous.add(l.id);
  }
  require(unique((r.seams ?? []).map((s) => s.id)) &&
    unique((r.influences ?? []).map((i) => i.id)), "duplicate growth identities");
  for (const seam of r.seams ?? [])
    require(Array.isArray(seam.points) &&
      seam.points.length >= 2 &&
      seam.points.every((p) => point(p, 2)) &&
      number(seam.width) &&
      seam.width > 0 &&
      Array.isArray(seam.layers) &&
      seam.layers.length > 0 &&
      unique(seam.layers) &&
      seam.layers.every((id) => previous.has(id)) &&
      number(seam.densityMultiplier), `${seam.id}: invalid seam`);
  for (const zone of r.influences ?? []) {
    polygon(zone.polygon);
    require(typeof zone.description === "string" &&
      number(zone.falloff) &&
      !!zone.densityMultipliers &&
      Object.entries(zone.densityMultipliers).every(
        ([id, multiplier]) => previous.has(id) && number(multiplier)
      ), `${zone.id}: invalid growth influence`);
  }
}
