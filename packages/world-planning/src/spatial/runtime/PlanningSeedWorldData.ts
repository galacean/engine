import { planningSoilCoverage } from "../../semantic-study/PlanningSoilWeights";
import type { IslandPlan, PlanPoint, PlanRoute } from "../../semantic-study/IslandPlanModel";
import type { PlanningPopulationTerrain } from "./PlanningPopulationData";
import { compilePlanningPopulation } from "./PlanningPopulationData";
import { planningQueryDataOwner } from "../PlanningQueryDataOwner";
import { rasterizeCoverageRegions } from "../ecology/CoverageRaster";
import { bakeTerrainNormalSamples } from "@galacean/engine-terrain/terrain/clipmap/TerrainNormalAtlas";
import { seedWorldRockySlopeWeight, type SeedWorldFields } from "../../runtime/SeedWorldFields.ts";
import type { SeedWorldRuntimePlan } from "../../world/SeedWorldRuntimePlan";
import type { SeedWorldPopulationPreview } from "../../runtime/SeedWorldPopulationPlan.ts";
import type { SeedWorldSurfaceMaterialIntent } from "../../runtime/SeedWorldSurfaceIntent.ts";
import {
  SEED_WORLD_CLIPMAP_MESH_SIZE,
  type SeedWorldTerrainGenerationSettings
} from "@galacean/engine-terrain/world/SeedWorldTerrainGenerationSettings";

/** Published planner inputs for the original Seed render/navigation/tool consumers.
 * This is a projection of existing geometry and rasters, never a second world solve.
 */
export interface PlanningSeedWorldData {
  readonly plan: SeedWorldRuntimePlan;
  readonly fields: SeedWorldFields;
  readonly population: SeedWorldPopulationPreview;
  readonly surfaceIntent: SeedWorldSurfaceMaterialIntent;
  readonly terrainSettings: SeedWorldTerrainGenerationSettings;
  readonly terrainNormalSamples: Uint8Array;
}
const snapshots = new WeakMap<IslandPlan, PlanningSeedWorldData>();

/** Reuse native data across query readers and authoring forks of the same immutable full plan. */
export function planningSeedWorldDataSnapshot(source: IslandPlan, terrain: () => PlanningPopulationTerrain) {
  const owner = planningQueryDataOwner(source);
  let data = snapshots.get(owner);
  if (!data) {
    data = compilePlanningSeedWorldData(source, terrain());
    snapshots.set(owner, data);
  }
  return data;
}

/** Publish native geometry/population for query readers without baking appearance textures. */
export function preparePlanningSeedWorldData(
  source: IslandPlan,
  terrain: PlanningPopulationTerrain,
  compiled?: PlanningSeedWorldData
): PlanningSeedWorldData {
  const data = compiled ?? compilePlanningSeedWorldData(source, terrain);
  // Raster Worker data is authoritative too; tool readback must not compile it again on the host.
  snapshots.set(planningQueryDataOwner(source), data);
  return data;
}

/** Pure data compilation is independently testable without an engine or old Seed planner. */
export function compilePlanningSeedWorldData(
  source: IslandPlan,
  terrain: PlanningPopulationTerrain,
  previous?: PlanningSeedWorldData
): PlanningSeedWorldData {
  const compiled = compilePlanningPopulation(source, terrain);
  const size = compiled.fields.sizeMetres,
    resolution = compiled.fields.surfaceResolution;
  const n = resolution * resolution,
    spacing = size / (resolution - 1);
  const riverMask = rasterizeCoverageRegions(
    source.waters.map((water) => [water.outline]),
    resolution,
    size,
    size
  );
  const riverBankDistanceMetres = distanceToMask(riverMask, resolution, spacing);
  const waterBoundaryDistanceMetres = distanceToMask(compiled.fields.waterMask, resolution, spacing);
  const roadMask = previous ? undefined : new Uint8Array(n);
  for (const road of roadMask ? source.routes : []) {
    for (let i = 1; i < road.points.length; i++)
      paintSegment(roadMask!, resolution, size, road.points[i - 1], road.points[i]);
  }
  const roadDistanceMetres = previous ? undefined : distanceToMask(roadMask!, resolution, spacing);
  const roadDistance =
    previous?.plan.roadDistance ??
    Uint16Array.from(roadDistanceMetres!, (distance) => Math.min(65535, Math.round(distance / spacing)));
  const rockySlopeWeight = new Uint8Array(n);
  // Match Seed's slope ownership using the actual canonical height decode.
  const h = terrain.height,
    hs = h.resolution,
    hHeights = h.heights,
    step = size / (hs - 1),
    sameRes = hs === resolution,
    resRatio = (hs - 1) / (resolution - 1),
    invHalfPi = 2 / Math.PI;
  for (let z = 0; z < resolution; z++) {
    const hz = sameRes ? z : Math.round(z * resRatio);
    const z0 = hz > 0 ? hz - 1 : 0,
      z1 = hz + 1 < hs ? hz + 1 : hs - 1;
    const invDz = 1 / ((z1 - z0) * step);
    const rowOff = z * resolution;
    const hzOff = hz * hs,
      z0Off = z0 * hs,
      z1Off = z1 * hs;
    for (let x = 0; x < resolution; x++) {
      const hx = sameRes ? x : Math.round(x * resRatio);
      const x0 = hx > 0 ? hx - 1 : 0,
        x1 = hx + 1 < hs ? hx + 1 : hs - 1;
      const dx = (hHeights[hzOff + x1] - hHeights[hzOff + x0]) / ((x1 - x0) * step),
        dz = (hHeights[z1Off + hx] - hHeights[z0Off + hx]) * invDz;
      rockySlopeWeight[rowOff + x] = Math.round(
        seedWorldRockySlopeWeight(Math.atan(Math.sqrt(dx * dx + dz * dz)) * invHalfPi) * 255
      );
    }
  }
  const fields: SeedWorldFields = {
    ...compiled.fields,
    rockySlopeWeight,
    riverBankDistanceMetres,
    waterBoundaryDistanceMetres,
    hash: hashBytes(
      compiled.fields.waterMask,
      hashBytes(
        compiled.fields.materialWeights,
        hashBytes(
          new Uint8Array(h.heights.buffer, h.heights.byteOffset, h.heights.byteLength),
          hashBytes(new Uint8Array(compiled.fields.heightSamples.buffer), compiled.fields.hash)
        )
      )
    )
  };
  const normalSource = {
    id: "published-planning-world",
    worldPosition: [0, 0, 0] as const,
    worldSize: [size, 1, size] as const,
    heightSampleSize: [hs, hs] as const,
    heightDecodeOffset: h.decodeOffset,
    heightDecodeScale: h.decodeScale,
    heightSamples: fields.heightSamples,
    surfaceHeights: h.heights
  };
  const norm = (p: PlanPoint) => ({ x: p.x / size, y: p.z / size });
  const plan: SeedWorldRuntimePlan = {
    rootSeed: source.parameters.seed,
    sizeMetres: size,
    worldOrigin: [0, 0],
    resolution,
    roadDistance,
    observationAnchor: compiled.world.observationAnchor,
    roads: source.routes
      .filter((road) => road.points.length >= 2)
      .map((road) => ({
        id: road.id,
        fromPoiId: road.from,
        toPoiId: road.to,
        points: road.points.map(norm),
        bridgeIntervals: roadBridgeIntervals(road, source)
      })),
    pois: (source.poiDistribution?.sites ?? []).map((site) => ({
      id: site.id,
      kind: site.memberIds.some((id) => source.regions.some((region) => region.id === id && region.kind === "village"))
        ? ("settlement" as const)
        : ("lookout" as const),
      position: norm(site.center)
    })),
    summits: source.mountains.flatMap((mountain) => {
      const rocks = source.rocks.filter((rock) => rock.groupId === mountain.id || mountain.rockIds.includes(rock.id));
      if (!rocks.length) return [];
      const summit = rocks.reduce((a, b) =>
        (a.baseHeight ?? h.sample(a.center)) + a.height > (b.baseHeight ?? h.sample(b.center)) + b.height ? a : b
      );
      return [
        {
          ...norm(summit.center),
          elevation: ((summit.baseHeight ?? h.sample(summit.center)) + summit.height - h.decodeOffset) / h.decodeScale
        }
      ];
    }),
    detailBrushOperations: compiled.population.detailBrushOperations
  };
  const baseHalfExtent = (SEED_WORLD_CLIPMAP_MESH_SIZE * 2 + 2) * step;
  const bed = terrain.alpha.riverBedCoverage;
  if (bed && terrain.alpha.resolution !== resolution)
    throw new Error("Planner river bed and Terrain surface must share their published sample lattice.");
  const soilCoverage = planningSoilCoverage(source, terrain.alpha, resolution);
  const clipmapLodCount = Math.max(0, Math.ceil(Math.log2((size * 2) / baseHalfExtent))) + 1;
  const terrainSettings: SeedWorldTerrainGenerationSettings = {
    heightSamplesPer1024: ((hs - 1) * 1024) / size + 1,
    coverageTexelsPer1024: (resolution * 1024) / size,
    worldSizeMetres: size,
    heightResolution: hs,
    coverageResolution: resolution,
    coverageBakeResolution: resolution,
    coverageSamplesPerAxis: 1,
    heightSampleSpacingMetres: step,
    coverageTexelSpacingMetres: size / resolution,
    clipmapLodCount,
    clipmapHalfExtentMetres: baseHalfExtent * 2 ** (clipmapLodCount - 1)
  };
  return {
    plan,
    fields,
    population: compiled.population,
    terrainSettings,
    surfaceIntent: {
      resolution,
      materialWeights: fields.materialWeights,
      riverBedCoverage: bed,
      soilCoverage,
      hash: hashBytes(
        soilCoverage,
        bed ? hashBytes(bed, hashBytes(fields.materialWeights)) : hashBytes(fields.materialWeights)
      )
    },
    terrainNormalSamples: bakeTerrainNormalSamples(normalSource)
  };
}

/** Two-pass octile distance on the actual footprint raster, in metres.
 * Pixel discretization has one-texel uncertainty; no water returns a finite world-diagonal distance.
 */
function distanceToMask(mask: Uint8Array, resolution: number, spacing: number): Float32Array {
  const len = mask.length;
  const maxDist = resolution * Math.SQRT2 * spacing;
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) out[i] = mask[i] > 0 ? 0 : maxDist;
  const diagonal = spacing * Math.SQRT2;
  for (let z = 0; z < resolution; z++) {
    const rowOff = z * resolution;
    const prevOff = rowOff - resolution;
    for (let x = 0; x < resolution; x++) {
      const i = rowOff + x;
      let v = out[i];
      if (x > 0) {
        const c = out[i - 1] + spacing;
        if (c < v) v = c;
      }
      if (z > 0) {
        let c = out[prevOff + x] + spacing;
        if (c < v) v = c;
        if (x > 0) {
          c = out[prevOff + x - 1] + diagonal;
          if (c < v) v = c;
        }
        if (x + 1 < resolution) {
          c = out[prevOff + x + 1] + diagonal;
          if (c < v) v = c;
        }
      }
      out[i] = v;
    }
  }
  for (let z = resolution - 1; z >= 0; z--) {
    const rowOff = z * resolution;
    const nextOff = rowOff + resolution;
    for (let x = resolution - 1; x >= 0; x--) {
      const i = rowOff + x;
      let v = out[i];
      if (x + 1 < resolution) {
        const c = out[i + 1] + spacing;
        if (c < v) v = c;
      }
      if (z + 1 < resolution) {
        let c = out[nextOff + x] + spacing;
        if (c < v) v = c;
        if (x > 0) {
          c = out[nextOff + x - 1] + diagonal;
          if (c < v) v = c;
        }
        if (x + 1 < resolution) {
          c = out[nextOff + x + 1] + diagonal;
          if (c < v) v = c;
        }
      }
      out[i] = v;
    }
  }
  return out;
}
function paintSegment(mask: Uint8Array, resolution: number, size: number, a: PlanPoint, b: PlanPoint): void {
  const scale = (resolution - 1) / size,
    steps = Math.max(1, Math.ceil(Math.max(Math.abs(a.x - b.x), Math.abs(a.z - b.z)) * scale));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps,
      x = Math.round((a.x + (b.x - a.x) * t) * scale),
      z = Math.round((a.z + (b.z - a.z) * t) * scale);
    if (x >= 0 && z >= 0 && x < resolution && z < resolution) mask[z * resolution + x] = 255;
  }
}
function projectPoint(point: PlanPoint, line: readonly PlanPoint[]): { distance: number; arc: number } {
  let distance = Infinity,
    arc = 0,
    length = 0;
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1],
      b = line[i],
      dx = b.x - a.x,
      dz = b.z - a.z,
      segment = Math.hypot(dx, dz);
    const t = segment > 0 ? Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.z - a.z) * dz) / segment ** 2)) : 0;
    const d = Math.hypot(point.x - a.x - dx * t, point.z - a.z - dz * t);
    if (d < distance) {
      distance = d;
      arc = length + segment * t;
    }
    length += segment;
  }
  return { distance, arc };
}
function roadBridgeIntervals(road: PlanRoute, source: IslandPlan): { startArcMetres: number; endArcMetres: number }[] {
  return source.bridges.flatMap((bridge) => {
    const a = projectPoint(bridge.a, road.points),
      b = projectPoint(bridge.b, road.points);
    if (Math.max(a.distance, b.distance) > Math.max(bridge.width, road.width) / 2 || Math.abs(a.arc - b.arc) < 0.1)
      return [];
    const startArcMetres = Math.min(a.arc, b.arc),
      endArcMetres = Math.max(a.arc, b.arc);
    return [{ startArcMetres, endArcMetres }];
  });
}
function hashBytes(bytes: Uint8Array, start = 2166136261): number {
  let hash = start;
  for (let i = 0, len = bytes.length; i < len; i++) hash = Math.imul(hash ^ bytes[i], 16777619);
  return hash >>> 0;
}
