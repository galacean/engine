import {
  waterTerrainContentHash,
  captureWaterTerrainSnapshot,
  type WaterTerrainSnapshot
} from "@galacean/engine-water/water/authoring/terrain/index";
import { RIVER_BANK_PROFILE_VERSION } from "./PlanningRiverBank";
import profile from "../planning-data/settlement-profile.json";
import type { IslandPlan, PlanPoint } from "./IslandPlanModel";
import { createPlanningGroundSampler, createPlanningRingQuery } from "./WorldPlanningTerrain";
import { sampleFloat32GridTriangle as sampleTerrainGrid } from "@galacean/engine-terrain/geometry/GridInterpolation";
import { planningTerrainAuthoringInputs } from "../spatial/PlanningResources";

/** Metre heights on an inclusive grid; rows advance along world +Z. */
export interface PlanningHeightmap {
  resolution: number;
  spacingX: number;
  spacingZ: number;
  heights: Float32Array;
  /** R16 material payload; geometry and contact use canonical Float32 heights. */
  encoded: Uint16Array;
  decodeOffset: number;
  decodeScale: number;
  sample: (point: PlanPoint) => number;
}
const snapshots = new WeakMap<IslandPlan, PlanningHeightmap>();
const terrains = new Map<string, PlanningHeightmap>();
const snapshotKeys = new WeakMap<IslandPlan, string>();
type Bounds = readonly [number, number, number, number];
export type PlanningHeightBounds = Bounds;
const rawSources = new WeakMap<PlanningHeightmap, { plan: IslandPlan; heights: Float32Array }>();
export interface PlanningHeightmapWork {
  backgroundSamples: number;
  /** Wall time in milliseconds, only for the build that produced this map. */
  timings: { prepare: number; background: number; encoding: number; total: number };
}
const work = new WeakMap<PlanningHeightmap, PlanningHeightmapWork>();
export function planningHeightmapWork(map: PlanningHeightmap): PlanningHeightmapWork | undefined {
  return work.get(map);
}

/** A local contact view of the canonical fixed Float32 grid. No raster is allocated. */
export interface PlanningGroundSurface {
  readonly spacingX: number;
  readonly spacingZ: number;
  readonly sample: (point: PlanPoint) => number;
  readonly work: { backgroundSamples: number };
}
interface GroundSurface extends PlanningGroundSurface {
  vertex(x: number, z: number): number;
  prepareBounds(bounds: Bounds): void;
  raster?: Float32Array;
  published?: PlanningHeightmap;
  materializing: boolean;
  releaseSparseBackground(): void;
}
const groundSurfaces = new Map<string, GroundSurface>();
const surfaceSnapshots = new WeakMap<IslandPlan, GroundSurface>();

/** Query final terrain without compiling the full fixed-grid background.
 * Stable vertex addresses, Float32 heights and a--d triangles are shared with planningHeightmap.
 */
export function planningGroundSurface(plan: IslandPlan): PlanningGroundSurface {
  return groundSurface(plan);
}
function groundSurface(plan: IslandPlan): GroundSurface {
  const snapshot = surfaceSnapshots.get(plan);
  if (snapshot) return snapshot;
  const resolution = profile.world.heightmapResolution,
    key = snapshotKeys.get(plan) ?? heightKey(plan, resolution);
  snapshotKeys.set(plan, key);
  // Publication/reconciliation may detach a plan with structuredClone. Its
  // canonical raster remains authoritative even after WeakMap identity is lost.
  const adopted = snapshots.get(plan) ?? terrains.get(key);
  if (adopted) {
    snapshots.set(plan, adopted);
    const surface: GroundSurface = {
      spacingX: adopted.spacingX,
      spacingZ: adopted.spacingZ,
      sample: adopted.sample,
      work: { backgroundSamples: 0 },
      vertex: (x, z) => adopted.heights[z * adopted.resolution + x],
      prepareBounds: () => {},
      raster: adopted.heights,
      published: adopted,
      materializing: false,
      releaseSparseBackground: () => {}
    };
    surfaceSnapshots.set(plan, surface);
    return surface;
  }
  const saved = groundSurfaces.get(key);
  if (saved) {
    surfaceSnapshots.set(plan, saved);
    return saved;
  }
  const spacingX = plan.parameters.width / (resolution - 1),
    spacingZ = plan.parameters.depth / (resolution - 1),
    ground = createPlanningGroundSampler(plan),
    sparse = new Map<number, number | (() => number)>(),
    measured = { backgroundSamples: 0 };
  seedBridgeLandingVertices(plan, ground, sparse, resolution, spacingX, spacingZ, () => measured.backgroundSamples++);
  const surface: GroundSurface = {
    spacingX,
    spacingZ,
    work: measured,
    materializing: false,
    prepareBounds: (bounds) => {
      ground.prepareBounds?.(bounds);
    },
    releaseSparseBackground: () => {
      sparse.clear();
    },
    vertex(x, z) {
      const index = z * resolution + x;
      if (surface.raster) return surface.raster[index];
      let value = sparse.get(index);
      if (value === undefined) {
        value = Math.fround(ground({ x: x * spacingX, z: z * spacingZ }));
        measured.backgroundSamples++;
        if (!surface.materializing) sparse.set(index, value);
      } else if (typeof value === "function") {
        value = value();
        sparse.set(index, value);
      }
      return value;
    },
    sample: (p) => (surface.published ? surface.published.sample(p) : background(p))
  };
  const grid = { origin: [0, 0] as const, spacing: spacingX, spacingZ, columns: resolution, rows: resolution },
    background = (p: PlanPoint) => sampleTerrainGrid(grid, p.x, p.z, surface.vertex);
  groundSurfaces.set(key, surface);
  surfaceSnapshots.set(plan, surface);
  if (groundSurfaces.size > 2) groundSurfaces.delete(groundSurfaces.keys().next().value!);
  return surface;
}

/** Bake the small dry-bank landing footprints into existing grid vertices once.
 * The normal raster loop and runtime queries perform no extra bridge lookup. */
function seedBridgeLandingVertices(
  plan: IslandPlan,
  ground: (p: PlanPoint) => number,
  vertices: Map<number, number | (() => number)>,
  resolution: number,
  spacingX: number,
  spacingZ: number,
  sampled: () => void
): void {
  const landings = plan.roadApproaches?.flatMap((a) => a.approach?.landings ?? []) ?? [];
  if (!landings.length) return;
  const waters = plan.waters.map((w) => ({
    ring: createPlanningRingQuery(w.outline),
    holes: (w.lake?.holes ?? []).map(createPlanningRingQuery)
  }));
  const smooth = (t: number) => {
    t = Math.max(0, Math.min(1, t));
    return t * t * (3 - 2 * t);
  };
  for (const landing of landings) {
    const [a, b] = landing.edge,
      cell = landing.terrainCellM,
      size = Math.hypot(b.x - a.x, b.z - a.z),
      cx = (a.x + b.x) / 2,
      cz = (a.z + b.z) / 2;
    const margin = cell * 3;
    const x0 = Math.max(0, Math.floor((Math.min(a.x, b.x) - margin) / spacingX)),
      x1 = Math.min(resolution - 1, Math.ceil((Math.max(a.x, b.x) + margin) / spacingX));
    const z0 = Math.max(0, Math.floor((Math.min(a.z, b.z) - margin) / spacingZ)),
      z1 = Math.min(resolution - 1, Math.ceil((Math.max(a.z, b.z) + margin) / spacingZ));
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) {
        const p = { x: x * spacingX, z: z * spacingZ },
          along = (p.x - cx) * landing.inward.x + (p.z - cz) * landing.inward.z;
        const across = Math.abs(((p.x - cx) * (b.x - a.x) + (p.z - cz) * (b.z - a.z)) / size);
        const weight =
          (1 - smooth((Math.abs(along) - cell) / (cell * 0.5))) *
          (1 - smooth((across - size / 2 - cell) / (cell * 0.5)));
        if (weight <= 0 || waters.some((w) => w.ring.inside(p) && !w.holes.some((h) => h.inside(p)))) continue;
        const depth = Math.max(0, along),
          target = (a.y + b.y) / 2 + landing.deckSlope * depth + landing.deckCurvature * depth * depth - 0.08;
        const index = z * resolution + x,
          cached = vertices.get(index);
        // Planning queries far from the bridge must not pay for its terrain samples.
        // This lazy sparse entry is evaluated once when the existing vertex cache is read.
        vertices.set(index, () => {
          const base = typeof cached === "function" ? cached() : (cached ?? ground(p));
          if (cached === undefined) sampled();
          return Math.fround(base + (target - base) * weight);
        });
      }
  }
}

/** Conservative fast path: only carved-lake depths may change, with a fixed finite bank envelope.
 * All other terrain inputs and water profiles must match. Unknown changes take the full path.
 */
function lakeDepthBounds(before: IslandPlan, after: IslandPlan, resolution: number): Bounds[] | undefined {
  if (
    !before.spatialLayout ||
    !after.spatialLayout ||
    !before.settlementLayout ||
    !after.settlementLayout ||
    before.villageStudy ||
    after.villageStudy ||
    before.landformStudy ||
    after.landformStudy ||
    before.canyonStudy ||
    after.canyonStudy ||
    before.waters.length !== after.waters.length ||
    !before.planning ||
    !after.planning
  )
    return;
  const ids = new Set<string>(),
    bounds: Bounds[] = [];
  for (let i = 0; i < before.waters.length; i++) {
    const a = before.waters[i],
      b = after.waters[i];
    if (JSON.stringify(a) === JSON.stringify(b)) continue;
    if (
      !a.lake?.carved ||
      !b.lake?.carved ||
      a.bankWidthM === undefined ||
      !Number.isFinite(a.bankWidthM) ||
      JSON.stringify(a) !== JSON.stringify({ ...b, lake: { ...b.lake, depthM: a.lake.depthM } })
    )
      return;
    ids.add(a.id);
    const shoulder = Math.max(0, a.bankWidthM, ...(a.bankWidths ?? []));
    bounds.push([
      Math.min(...a.outline.map((p) => p.x)) - shoulder,
      Math.min(...a.outline.map((p) => p.z)) - shoulder,
      Math.max(...a.outline.map((p) => p.x)) + shoulder,
      Math.max(...a.outline.map((p) => p.z)) + shoulder
    ]);
  }
  if (!ids.size) return;
  const profiles = after.planning.profiles.map((profile) => {
    if (profile.kind !== "bed" || !ids.has(profile.ownerId)) return profile;
    const old = before.planning!.profiles.find((p) => p.id === profile.id);
    // Depth-only lake beds are constant. Do not accept arbitrary longitudinal changes.
    if (old?.points.length !== 1 || profile.points.length !== 1) return profile;
    return { ...profile, points: [{ ...profile.points[0], y: old.points[0].y }] };
  });
  const normalized = { ...after, waters: before.waters, planning: { ...after.planning, profiles } };
  return heightKey(before, resolution) === heightKey(normalized, resolution) ? bounds : undefined;
}
function retain(key: string, map: PlanningHeightmap): void {
  terrains.delete(key);
  terrains.set(key, map);
  if (terrains.size > 2) terrains.delete(terrains.keys().next().value!);
}

/** Read an already compiled raster without turning a cached 2D restore into terrain work. */
export function cachedPlanningHeightmap(plan: IslandPlan): PlanningHeightmap | undefined {
  return (
    snapshots.get(plan) ?? terrains.get(snapshotKeys.get(plan) ?? heightKey(plan, profile.world.heightmapResolution))
  );
}

/** Reuse terrain for a copy-on-write edit whose caller has already proved terrain inputs unchanged.
 * Copies cache ownership only; it performs no terrain hashing, sampling or raster allocation.
 * @returns Whether a local query surface or a complete raster was available to inherit.
 */
export function inheritPlanningHeightmap(plan: IslandPlan, previous: IslandPlan): boolean {
  const key = snapshotKeys.get(previous),
    surface = surfaceSnapshots.get(previous),
    map = snapshots.get(previous) ?? (key ? terrains.get(key) : undefined);
  if (!key || (!surface && !map)) return false;
  snapshotKeys.set(plan, key);
  if (surface) surfaceSnapshots.set(plan, surface);
  if (map) snapshots.set(plan, map);
  return true;
}

/** Materialize the FBM surface for whitebox rendering and movement, lazily.
 * @param plan Published vector layout; it is never mutated by raster generation.
 * @returns Cached canonical vertices and their triangle sampler, including both world edges.
 */
export function planningHeightmap(plan: IslandPlan): PlanningHeightmap {
  const saved = snapshots.get(plan);
  if (saved) {
    retain(snapshotKeys.get(plan)!, saved);
    return saved;
  }
  const resolution = profile.world.heightmapResolution,
    intervals = resolution - 1;
  const key = heightKey(plan, resolution);
  snapshotKeys.set(plan, key);
  const shared = terrains.get(key);
  if (shared) {
    snapshots.set(plan, shared);
    return shared;
  }
  const spacingX = plan.parameters.width / intervals,
    spacingZ = plan.parameters.depth / intervals;
  let previous: PlanningHeightmap | undefined, dirty: Bounds[] | undefined;
  for (const candidate of terrains.values()) {
    const raw = rawSources.get(candidate);
    const bounds = raw && lakeDepthBounds(raw.plan, plan, resolution);
    if (bounds) {
      previous = candidate;
      dirty = bounds;
      break;
    }
  }
  const raw = previous && rawSources.get(previous);
  const started = performance.now();
  const surface = groundSurface(plan),
    heights = raw ? raw.heights.slice() : new Float32Array(resolution * resolution);
  surface.materializing = true;
  let stageStarted = performance.now();
  const measured: PlanningHeightmapWork = {
    backgroundSamples: 0,
    timings: { prepare: stageStarted - started, background: 0, encoding: 0, total: 0 }
  };
  try {
    for (let z = 0; z < resolution; z++)
      for (let x = 0; x < resolution; x++) {
        const wx = x * spacingX,
          wz = z * spacingZ;
        if (dirty && !dirty.some(([x0, z0, x1, z1]) => wx >= x0 && wx <= x1 && wz >= z0 && wz <= z1)) continue;
        heights[z * resolution + x] = surface.vertex(x, z);
        measured.backgroundSamples++;
      }
    surface.raster = heights;
    measured.timings.background = performance.now() - stageStarted;
    stageStarted = performance.now();
    // Keep unquantized samples: a changed global R16 range must re-encode original values, not decoded values.
    const rawHeights = heights;
    let minimum = Infinity,
      maximum = -Infinity;
    for (const value of heights) {
      minimum = Math.min(minimum, value);
      maximum = Math.max(maximum, value);
    }
    const decodeOffset = Math.floor(minimum),
      decodeScale = Math.max(1, Math.ceil(maximum) - decodeOffset);
    const encoded = new Uint16Array(heights.length);
    for (let i = 0; i < heights.length; i++) {
      encoded[i] = Math.round(((heights[i] - decodeOffset) / decodeScale) * 65535);
    }
    const data: Omit<PlanningHeightmap, "sample"> = {
      resolution,
      spacingX,
      spacingZ,
      heights,
      encoded,
      decodeOffset,
      decodeScale
    };
    const map = { ...data, sample: heightSampler(data) };
    surface.releaseSparseBackground();
    measured.timings.encoding = performance.now() - stageStarted;
    measured.timings.total = performance.now() - started;
    rawSources.set(map, { plan, heights: rawHeights });
    work.set(map, measured);
    snapshots.set(plan, map);
    retain(key, map);
    return map;
  } finally {
    surface.materializing = false;
  }
}

/** Re-encode canonical Float32 values without changing the sample lattice or its precision. */
export function encodePlanningHeightSamples(
  grid: Pick<PlanningHeightmap, "resolution" | "spacingX" | "spacingZ">,
  heights: Float32Array
): Omit<PlanningHeightmap, "sample"> {
  if (heights.length !== grid.resolution ** 2) throw new Error("Invalid canonical height lattice");
  let minimum = Infinity,
    maximum = -Infinity;
  for (const height of heights) {
    if (!Number.isFinite(height)) throw new Error("Non-finite canonical height");
    minimum = Math.min(minimum, height);
    maximum = Math.max(maximum, height);
  }
  const decodeOffset = Math.floor(minimum),
    decodeScale = Math.max(1, Math.ceil(maximum) - decodeOffset);
  const encoded = Uint16Array.from(heights, (height) => Math.round(((height - decodeOffset) / decodeScale) * 65535));
  return { ...grid, heights, encoded, decodeOffset, decodeScale };
}

/** A copy-on-write authored layer over the complete global bed, including its approach grading. */
export function compilePlanningWaterHeightmap(
  plan: IslandPlan,
  base: PlanningHeightmap,
  bounds: readonly Bounds[]
): PlanningHeightmap {
  // Canonical input keys include the layer, author geometry, natural bed and approach grading.
  // A replay/undo may reuse a completed immutable raster, just like planningHeightmap itself.
  const cached = cachedPlanningHeightmap(plan);
  if (cached) return adoptPlanningHeightmap(plan, cached);
  const start = performance.now(),
    heights = base.heights.slice(),
    surface = groundSurface(plan);
  if (surface.spacingX !== base.spacingX || surface.spacingZ !== base.spacingZ)
    throw new Error("Water patch must use the canonical terrain lattice");
  surface.materializing = true;
  try {
    let samples = 0;
    for (const [minX, minZ, maxX, maxZ] of bounds) {
      const x0 = Math.max(0, Math.floor(minX / base.spacingX)),
        x1 = Math.min(base.resolution - 1, Math.ceil(maxX / base.spacingX));
      const z0 = Math.max(0, Math.floor(minZ / base.spacingZ)),
        z1 = Math.min(base.resolution - 1, Math.ceil(maxZ / base.spacingZ));
      surface.prepareBounds([x0 * base.spacingX, z0 * base.spacingZ, x1 * base.spacingX, z1 * base.spacingZ]);
      for (let z = z0; z <= z1; z++)
        for (let x = x0; x <= x1; x++) {
          heights[z * base.resolution + x] = surface.vertex(x, z);
          samples++;
        }
    }
    const sampled = performance.now();
    const map = adoptPlanningHeightmap(
      plan,
      encodePlanningHeightSamples(
        { resolution: base.resolution, spacingX: base.spacingX, spacingZ: base.spacingZ },
        heights
      )
    );
    work.set(map, {
      backgroundSamples: samples,
      timings: {
        prepare: 0,
        background: sampled - start,
        encoding: performance.now() - sampled,
        total: performance.now() - start
      }
    });
    return map;
  } finally {
    surface.materializing = false;
  }
}

function heightKey(plan: IslandPlan, resolution: number): string {
  return JSON.stringify([
    "canonical-float32-v1",
    RIVER_BANK_PROFILE_VERSION,
    plan.authoredWaterLayer,
    resolution,
    plan.roadApproaches?.map((a) => [a.approach?.grading, a.approach?.gradingWeights, a.approach?.landings]),
    planningTerrainAuthoringInputs(plan.authoredResources),
    plan.settlementLayout || plan.landformStudy || plan.canyonStudy
      ? {
          seed: plan.parameters.seed,
          landformSeed: plan.parameters.landformSeed,
          width: plan.parameters.width,
          depth: plan.parameters.depth,
          terrainPatches: plan.parameters.terrainPatches,
          worldElevation: plan.parameters.worldElevation
        }
      : plan.parameters,
    plan.regionFields?.elevation,
    !plan.spatialLayout &&
    (plan.parameters.terrainPatches?.length ||
      plan.parameters.worldElevation?.riseM ||
      plan.regionFields?.elevation?.cells.some((cell) => cell.value !== 0))
      ? plan.buildings.map(({ center, width, depth, yaw }) => ({ center, width, depth, yaw }))
      : null,
    plan.villageStudy,
    plan.landformStudy,
    plan.canyonStudy,
    plan.villageStudy
      ? null
      : plan.settlementLayout || plan.landformStudy || plan.canyonStudy
        ? [
            plan.land,
            plan.islands,
            plan.waters.map(({ id, outline, widths, bankWidthM, bankWidths, lake, course }) => ({
              id,
              outline,
              widths,
              bankWidthM,
              bankWidths,
              lake,
              course
            })),
            plan.planning?.profiles.filter((profile) => profile.kind === "bed" || profile.kind === "water")
          ]
        : [
            plan.land,
            plan.islands,
            plan.waters,
            plan.planning?.profiles.filter((profile) => profile.kind === "bed" || profile.kind === "water"),
            plan.mountains,
            plan.rocks,
            plan.ridges,
            plan.structures
          ]
  ]);
}

function heightSampler({
  resolution,
  spacingX,
  spacingZ,
  heights
}: Pick<PlanningHeightmap, "resolution" | "spacingX" | "spacingZ" | "heights">) {
  return (p: PlanPoint): number => {
    return sampleTerrainGrid(
      { origin: [0, 0], spacing: spacingX, spacingZ, columns: resolution, rows: resolution },
      p.x,
      p.z,
      (x, z) => heights[z * resolution + x]
    );
  };
}

/** Adopt a worker-built canonical raster without repeating CPU terrain evaluation.
 * @param plan Exact immutable plan associated with the worker response.
 * @param data Decoded and encoded samples produced by planningHeightmap in the worker.
 * @returns Shared snapshot sampler; identical cached inputs retain their residency identity.
 */
export function adoptPlanningHeightmap(plan: IslandPlan, data: Omit<PlanningHeightmap, "sample">): PlanningHeightmap {
  const key = heightKey(plan, data.resolution);
  const map = terrains.get(key) ?? { ...data, sample: heightSampler(data) };
  snapshots.set(plan, map);
  snapshotKeys.set(plan, key);
  retain(key, map);
  const surface = surfaceSnapshots.get(plan);
  if (surface) {
    surface.published = map;
    surface.raster = map.heights;
    surface.releaseSparseBackground();
  }
  return map;
}

const waterSnapshots = new WeakMap<PlanningHeightmap, WaterTerrainSnapshot>();

/** Identity body transform: planning world XZ/Y are also River asset-local XZ/Y.
 * Copies the canonical Float32 vertices once; caller/worker Float32Arrays cannot mutate a published Water bed.
 */
export function planningWaterTerrainSnapshot(plan: IslandPlan): WaterTerrainSnapshot {
  const map = planningHeightmap(plan);
  const cached = waterSnapshots.get(map);
  if (cached) return cached;
  const grid = {
    origin: [0, 0] as const,
    spacing: map.spacingX,
    spacingZ: map.spacingZ,
    columns: map.resolution,
    rows: map.resolution,
    surface: "float32-triangles" as const
  };
  // Hash exact decoded samples, rather than an unrelated layout revision or time.
  const id = `planning-terrain:${waterTerrainContentHash({ ...grid, heights: map.heights })}`;
  const terrain = captureWaterTerrainSnapshot(
    { ...grid, id, revision: 0 },
    (x, z) => map.heights[Math.round(z / map.spacingZ) * map.resolution + Math.round(x / map.spacingX)]
  );
  waterSnapshots.set(map, terrain);
  return terrain;
}
