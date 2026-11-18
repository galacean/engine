import { generateTerrainHydrology } from "./TerrainHydrology";
import { generateSeedIslandOutlines } from "../../semantic-study/WorldLandDomain";
import { generateTerrainRoad } from "../../spatial/layout/TerrainRoad";
import type { PlanPoint as TerrainPoint } from "../../semantic-study/IslandPlanModel";
import { sampleSeedWorldCenteredFbm } from "@galacean/engine-terrain/world/SeedWorldFbm";

export class TerrainIslandGenerationError extends Error {}

import type {
  TerrainHydrologyPreview,
  TerrainIslandShape,
  TerrainPreviewResult,
  TerrainRoadPlan,
  TerrainRoadPreview
} from "./TerrainIslandTypes";
export type {
  TerrainHydrologyPreview,
  TerrainIslandShape,
  TerrainLakePlan,
  TerrainPreviewOptions,
  TerrainPreviewResult,
  TerrainRoadPlan,
  TerrainRoadPreview,
  TerrainWaterCountRange
} from "./TerrainIslandTypes";

const terrainSize = 1024;
const heightSamples = terrainSize + 1;
const minHeight = -32;
const maxHeight = 128;
const heightGridSteps = 256;
const surfaceSamples = 1024;
const step = terrainSize / heightGridSteps;

function signedDistance(x: number, z: number, ring: TerrainPoint[]): number {
  let inside = false;
  let squared = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[j];
    const b = ring[i];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    if (a.z > z !== b.z > z && x < a.x + ((z - a.z) * dx) / dz) inside = !inside;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
    squared = Math.min(squared, (x - a.x - t * dx) ** 2 + (z - a.z - t * dz) ** 2);
  }
  return Math.sqrt(squared) * (inside ? 1 : -1);
}

function smooth(min: number, max: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return t * t * (3 - 2 * t);
}

function random(seed: number, index: number): number {
  let hash = Math.imul(index ^ seed, 0x9e3779b1);
  hash = Math.imul(hash ^ (hash >>> 16), 0x21f0aaad);
  return ((hash ^ (hash >>> 15)) >>> 0) / 4294967296;
}

function createTerrainField({ seed, reliefAmplitudeMetres }: TerrainIslandShape) {
  const { mainland, islands } = generateSeedIslandOutlines(seed, terrainSize);
  if (islands.length === 0)
    throw new TerrainIslandGenerationError("The terrain seed did not leave room for an offshore island");
  const grid = heightGridSteps + 1;
  const coastalDistance = new Float32Array(grid * grid);
  const mainlandDistance = new Float32Array(grid * grid);
  for (let row = 0; row < grid; row++) {
    const z = row * step;
    for (let column = 0; column < grid; column++) {
      const x = column * step;
      const index = row * grid + column;
      const main = signedDistance(x, z, mainland);
      mainlandDistance[index] = main;
      let distance = main;
      for (const island of islands) distance = Math.max(distance, signedDistance(x, z, island));
      coastalDistance[index] = distance;
    }
  }
  const sample = (field: Float32Array, x: number, z: number): number => {
    const i = Math.min(heightGridSteps - 1, Math.floor(x / step));
    const j = Math.min(heightGridSteps - 1, Math.floor(z / step));
    const u = x / step - i;
    const v = z / step - j;
    const k = j * grid + i;
    return (
      (field[k] * (1 - u) + field[k + 1] * u) * (1 - v) + (field[k + grid] * (1 - u) + field[k + grid + 1] * u) * v
    );
  };
  function heightAt(x: number, z: number): number {
    const distance = sample(coastalDistance, x, z);
    const relief = sampleSeedWorldCenteredFbm(x / 142, z / 142, seed, 5);
    const height =
      distance < 0
        ? -24 * smooth(0, 96, -distance)
        : distance * 0.07 + smooth(0, 84, distance) * (23 + reliefAmplitudeMetres * relief);
    return Math.max(minHeight, Math.min(maxHeight, height));
  }
  return {
    landPolygons: [mainland, ...islands],
    islandCount: islands.length,
    heightAt,
    coastAt: (x: number, z: number) => sample(coastalDistance, x, z),
    mainlandAt: (x: number, z: number) => sample(mainlandDistance, x, z)
  };
}

function planTerrain(shape: TerrainIslandShape) {
  const field = createTerrainField(shape);
  const hydrology =
    shape.rivers !== undefined || shape.lakes !== undefined || shape.ocean
      ? generateTerrainHydrology({
          seed: shape.seed,
          width: terrainSize,
          depth: terrainSize,
          landPolygons: field.landPolygons,
          heightAt: field.heightAt,
          rivers: shape.rivers,
          lakes: shape.lakes,
          ocean: shape.ocean
        })
      : undefined;
  return { ...field, heightAt: hydrology?.heightAt ?? field.heightAt, hydrology };
}

type TerrainField = ReturnType<typeof planTerrain>;

function hydrologyPreview(field: TerrainField, ocean = false): TerrainHydrologyPreview | undefined {
  const water = field.hydrology;
  if (!water) return undefined;
  return {
    counts: water.counts,
    diagnostics: water.diagnostics.map((check) => check.message),
    ocean,
    rivers: water.rivers.map(({ id, outline, points }) => ({
      id,
      outline,
      points: points.map(({ x, z, elevation, width }) => ({ x, z, elevation, width }))
    })),
    lakes: water.lakes.map(({ id, shoreline, referenceLevel, levelOffsetM }) => ({
      id,
      shoreline: shoreline.map(({ x, z }) => ({ x, z })),
      waterLevel: referenceLevel + levelOffsetM
    }))
  };
}

function roadMeasurements(
  road: number,
  keypoints: TerrainPoint[],
  points: TerrainPoint[],
  field: TerrainField
): TerrainRoadPreview {
  let lengthMetres = 0;
  let keypointDistanceMetres = 0;
  let coastClearanceMetres = Infinity;
  let maxGradePercent = 0;
  let maxLegDetour = 0;
  let maxDetourLeg = 0;
  let leg = 1;
  let legLength = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const distance = Math.hypot(b.x - a.x, b.z - a.z);
    lengthMetres += distance;
    legLength += distance;
    const steps = Math.max(1, Math.ceil(distance / 2));
    let previousHeight = field.heightAt(a.x, a.z);
    coastClearanceMetres = Math.min(coastClearanceMetres, field.mainlandAt(a.x, a.z));
    for (let step = 1; step <= steps; step++) {
      const x = a.x + ((b.x - a.x) * step) / steps;
      const z = a.z + ((b.z - a.z) * step) / steps;
      const h = field.heightAt(x, z);
      coastClearanceMetres = Math.min(coastClearanceMetres, field.mainlandAt(x, z));
      if (distance > 0)
        maxGradePercent = Math.max(maxGradePercent, (100 * Math.abs(h - previousHeight) * steps) / distance);
      previousHeight = h;
    }
    const key = keypoints[leg];
    if (key && Math.hypot(key.x - b.x, key.z - b.z) < 1e-6) {
      const start = keypoints[leg - 1];
      const direct = Math.hypot(key.x - start.x, key.z - start.z);
      const ratio = legLength / direct;
      if (ratio > maxLegDetour) {
        maxLegDetour = ratio;
        maxDetourLeg = leg - 1;
      }
      keypointDistanceMetres += direct;
      legLength = 0;
      leg++;
    }
  }
  return {
    road,
    lengthMetres: Math.round(lengthMetres),
    keypointDistanceMetres: Math.round(keypointDistanceMetres),
    maxLegDetour: Math.round(maxLegDetour * 100) / 100,
    maxDetourLeg,
    coastClearanceMetres: Math.round(coastClearanceMetres),
    maxGradePercent: Math.round(maxGradePercent)
  };
}

function compileRoads(roads: TerrainRoadPlan[], field: TerrainField, resolution: number) {
  return roads.map(({ keypoints, widthMetres = 7 }, index) => {
    const road = generateTerrainRoad({
      sizeMetres: terrainSize,
      keypoints,
      widthMetres,
      shoulderMetres: (5 * widthMetres) / 7,
      resolution,
      heightAt: field.heightAt,
      clearanceAt: (x, z) => {
        let clearance = field.mainlandAt(x, z);
        for (const river of field.hydrology?.rivers ?? [])
          clearance = Math.min(clearance, -signedDistance(x, z, river.outline));
        for (const lake of field.hydrology?.lakes ?? [])
          clearance = Math.min(
            clearance,
            -signedDistance(
              x,
              z,
              lake.shoreline.filter((point) => point.ring === "shore")
            )
          );
        return clearance;
      }
    });
    if (!road) {
      throw new TerrainIslandGenerationError(`Road ${index + 1} cannot connect its keypoints on the mainland`);
    }
    return road;
  });
}

export function previewTerrainIsland(shape: TerrainIslandShape): TerrainPreviewResult {
  const field = planTerrain(shape);
  const spacingMetres = 64;
  const count = terrainSize / spacingMetres + 1;
  const samples = Array.from({ length: count }, (_, row) =>
    Array.from({ length: count }, (_, column): [number, number, number] => {
      const x = column * spacingMetres;
      const z = row * spacingMetres;
      const h = field.heightAt(x, z);
      const x0 = Math.max(0, x - 4);
      const x1 = Math.min(terrainSize, x + 4);
      const z0 = Math.max(0, z - 4);
      const z1 = Math.min(terrainSize, z + 4);
      const slope = Math.hypot(
        (field.heightAt(x1, z) - field.heightAt(x0, z)) / (x1 - x0),
        (field.heightAt(x, z1) - field.heightAt(x, z0)) / (z1 - z0)
      );
      return [Math.round(h), Math.round(field.mainlandAt(x, z)), Math.round(slope * 100)];
    })
  );
  const roads = shape.roads ?? [];
  return {
    seed: shape.seed,
    reliefAmplitudeMetres: shape.reliefAmplitudeMetres,
    spacingMetres,
    samples,
    ...(field.hydrology ? { hydrology: hydrologyPreview(field, shape.ocean) } : {}),
    roads: compileRoads(roads, field, 2).map(({ points }, i) => roadMeasurements(i, roads[i].keypoints, points, field))
  };
}

export function generateTerrainIsland(shape: TerrainIslandShape, grass = true) {
  const field = planTerrain(shape);
  const { heightAt, coastAt, islandCount } = field;
  const { seed } = shape;
  const roads = shape.roads ?? [];
  const roadCoverage = new Float32Array(surfaceSamples ** 2);
  for (const { coverage } of compileRoads(roads, field, surfaceSamples)) {
    for (let i = 0; i < coverage.length; i++) roadCoverage[i] = Math.max(roadCoverage[i], coverage[i]);
  }
  const heightmap = new Uint8Array(heightSamples ** 2 * 4);
  for (let z = 0; z < heightSamples; z++) {
    for (let x = 0; x < heightSamples; x++) {
      const height = heightAt(x, z);
      if (!Number.isFinite(height) || height < minHeight || height > maxHeight)
        throw new TerrainIslandGenerationError(`Generated height at ${x},${z} exceeds the RG16 terrain range`);
      const fraction = (height - minHeight) / (maxHeight - minHeight);
      const value = Math.round(Math.min(1, Math.max(0, fraction)) * 65535);
      const offset = (z * heightSamples + x) * 4;
      heightmap[offset] = value >>> 8;
      heightmap[offset + 1] = value & 255;
      heightmap[offset + 3] = 255;
    }
  }
  const alphamap = new Uint8Array(surfaceSamples ** 2 * 4);
  const density = new Uint8Array(alphamap.length);
  for (let row = 0; row < surfaceSamples; row++) {
    for (let column = 0; column < surfaceSamples; column++) {
      const index = row * surfaceSamples + column;
      const x = (column * terrainSize) / (surfaceSamples - 1);
      const z = (row * terrainSize) / (surfaceSamples - 1);
      const d = coastAt(x, z);
      const water = field.hydrology?.sample(x, z);
      const road = roadCoverage[index];
      if (water?.water && road > 0)
        throw new TerrainIslandGenerationError("Road intersects generated water; choose different keypoints");
      const sea = water?.water ? 1 : 1 - smooth(-7, 2, d);
      const green = smooth(4, 27, d) * (1 - (water?.bank ?? 0));
      const trailWeight = Math.round(road * 255);
      const naturalWeight = 255 - trailWeight;
      const lowGround = Math.round(sea * naturalWeight);
      const coast = Math.round((1 - green) * (naturalWeight - lowGround));
      const meadow = naturalWeight - lowGround - coast;
      const channels = [lowGround, coast, meadow, trailWeight];
      alphamap.set(channels, index * 4);
      const coverage = grass ? Math.round(meadow * (0.36 + 0.64 * random(seed, index))) : 0;
      density.set([coverage, 0, 0, 255], index * 4);
    }
  }
  return {
    alphamap,
    density,
    heightSamples,
    surfaceSamples,
    islandCount,
    heightmap,
    landPolygons: field.landPolygons,
    water: field.hydrology,
    hydrology: hydrologyPreview(field, shape.ocean)
  };
}
