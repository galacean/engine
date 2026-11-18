import { RIVER_TERRAIN_CORRIDOR_COMPONENT } from "@galacean/engine-water/water/compiler/index";
import type {
  RiverTerrainInteractionData,
  RiverTerrainReachCorridorData
} from "@galacean/engine-water/water/compiler/index";
import type { TerrainHeightAtlasPatch } from "@galacean/engine-terrain/terrain/clipmap/TerrainClipmapMaterial";
import { decodeTerrainHeightSample, encodeTerrainHeightMetres } from "../../authoring/terrain/TerrainHeightfield.ts";
import type { TerrainProjectAsset } from "@galacean/engine-terrain/terrain/project/TerrainProjectAsset";
import { terrainRasterIndex } from "@galacean/engine-terrain/terrain/project/TerrainProjectCodec";

interface RiverTerrainCorridorPoint {
  readonly x: number;
  readonly z: number;
  readonly bedY: number;
  readonly halfWidth: number;
  readonly bankWidth: number;
  readonly surfaceY: number;
}

interface RiverTerrainCorridorSegment {
  readonly start: RiverTerrainCorridorPoint;
  readonly end: RiverTerrainCorridorPoint;
  readonly minX: number;
  readonly minZ: number;
  readonly maxX: number;
  readonly maxZ: number;
}

export interface GrasslandsRiverTerrainCouplingDiagnostics {
  readonly patchCount: number;
  readonly changedSampleCount: number;
  readonly affectedRegionIds: readonly string[];
  readonly maximumTerrainLowering: number;
  readonly minimumCenterlineClearance: number;
}

export interface GrasslandsRiverTerrainCoupling {
  readonly patches: readonly TerrainHeightAtlasPatch[];
  readonly diagnostics: GrasslandsRiverTerrainCouplingDiagnostics;
}

/**
 * Applies Water's compiled River corridor to Terrain-owned canonical Region samples.
 *
 * Water owns the surface/bed facts. Terrain owns the decision to lower its heightfield,
 * the bank feather, and the renderer patch upload. Existing terrain below the resolved
 * bed is preserved, so the coupling never creates fill or a second terrain surface.
 */
export function coupleGrasslandsTerrainToRiver(
  assets: readonly TerrainProjectAsset[],
  interaction: RiverTerrainInteractionData,
  bodyOrigin: readonly [x: number, z: number]
): GrasslandsRiverTerrainCoupling {
  const segments = createCorridorSegments(interaction.reachCorridors, bodyOrigin);
  const patches: TerrainHeightAtlasPatch[] = [];
  const affectedRegionIds: string[] = [];
  let changedSampleCount = 0;
  let maximumTerrainLowering = 0;

  for (const asset of assets) {
    const { document } = asset;
    const [width, height] = document.manifest.heightmap.sampleSize;
    const [worldX, , worldZ] = document.descriptor.worldPosition;
    const [worldWidth, , worldDepth] = document.descriptor.worldSize;
    const regionSegments = segments.filter(
      (segment) =>
        segment.maxX >= worldX &&
        segment.minX <= worldX + worldWidth &&
        segment.maxZ >= worldZ &&
        segment.minZ <= worldZ + worldDepth
    );
    if (regionSegments.length === 0) continue;

    const scanBounds = resolveSampleBounds(regionSegments, worldX, worldZ, worldWidth, worldDepth, width, height);
    let changedMinX = width;
    let changedMinZ = height;
    let changedMaxX = -1;
    let changedMaxZ = -1;
    for (let sampleZ = scanBounds.minZ; sampleZ <= scanBounds.maxZ; sampleZ++) {
      const sampleWorldZ = worldZ + (sampleZ / (height - 1)) * worldDepth;
      for (let sampleX = scanBounds.minX; sampleX <= scanBounds.maxX; sampleX++) {
        const sampleWorldX = worldX + (sampleX / (width - 1)) * worldWidth;
        const rasterIndex = terrainRasterIndex(sampleX, sampleZ, width);
        const encodedHeight = document.heightmap[rasterIndex];
        const currentHeight = decodeTerrainHeightSample(document, encodedHeight);
        const coupledHeight = resolveCoupledHeight(regionSegments, sampleWorldX, sampleWorldZ, currentHeight);
        if (coupledHeight >= currentHeight) continue;
        const coupledSample = encodeTerrainHeightMetres(document, coupledHeight);
        if (coupledSample >= encodedHeight) continue;
        document.heightmap[rasterIndex] = coupledSample;
        const encodedWorldHeight = decodeTerrainHeightSample(document, coupledSample);
        maximumTerrainLowering = Math.max(maximumTerrainLowering, currentHeight - encodedWorldHeight);
        changedSampleCount++;
        changedMinX = Math.min(changedMinX, sampleX);
        changedMinZ = Math.min(changedMinZ, sampleZ);
        changedMaxX = Math.max(changedMaxX, sampleX);
        changedMaxZ = Math.max(changedMaxZ, sampleZ);
      }
    }
    if (changedMaxX < changedMinX || changedMaxZ < changedMinZ) continue;
    affectedRegionIds.push(document.descriptor.id);
    const patchWidth = changedMaxX - changedMinX + 1;
    const patchHeight = changedMaxZ - changedMinZ + 1;
    const samples = new Uint16Array(patchWidth * patchHeight);
    for (let localZ = 0; localZ < patchHeight; localZ++) {
      for (let localX = 0; localX < patchWidth; localX++) {
        samples[terrainRasterIndex(localX, localZ, patchWidth)] =
          document.heightmap[terrainRasterIndex(changedMinX + localX, changedMinZ + localZ, width)];
      }
    }
    patches.push({
      regionId: document.descriptor.id,
      sampleOrigin: [changedMinX, changedMinZ],
      sampleSize: [patchWidth, patchHeight],
      samples
    });
  }

  const minimumCenterlineClearance = resolveMinimumCenterlineClearance(assets, segments);
  return Object.freeze({
    patches: Object.freeze(patches),
    diagnostics: Object.freeze({
      patchCount: patches.length,
      changedSampleCount,
      affectedRegionIds: Object.freeze(affectedRegionIds),
      maximumTerrainLowering,
      minimumCenterlineClearance
    })
  });
}

function createCorridorSegments(
  corridors: readonly RiverTerrainReachCorridorData[],
  bodyOrigin: readonly [x: number, z: number]
): RiverTerrainCorridorSegment[] {
  const segments: RiverTerrainCorridorSegment[] = [];
  for (const corridor of corridors) {
    const points = Array.from({ length: corridor.sampleCount }, (_, index) =>
      readCorridorPoint(corridor, index, bodyOrigin)
    );
    if (points.length === 1) segments.push(createCorridorSegment(points[0], points[0]));
    for (let index = 0; index < points.length - 1; index++) {
      segments.push(createCorridorSegment(points[index], points[index + 1]));
    }
  }
  return segments;
}

function readCorridorPoint(
  corridor: RiverTerrainReachCorridorData,
  sampleIndex: number,
  bodyOrigin: readonly [x: number, z: number]
): RiverTerrainCorridorPoint {
  const read = (component: number): number => corridor.samples.at(sampleIndex * corridor.stride + component) ?? 0;
  return {
    x: bodyOrigin[0] + read(RIVER_TERRAIN_CORRIDOR_COMPONENT.x),
    z: bodyOrigin[1] + read(RIVER_TERRAIN_CORRIDOR_COMPONENT.z),
    bedY: read(RIVER_TERRAIN_CORRIDOR_COMPONENT.riverBedY),
    surfaceY: read(RIVER_TERRAIN_CORRIDOR_COMPONENT.waterSurfaceY),
    halfWidth: read(RIVER_TERRAIN_CORRIDOR_COMPONENT.channelHalfWidth),
    bankWidth: read(RIVER_TERRAIN_CORRIDOR_COMPONENT.bankWetnessWidth)
  };
}

function resolveMinimumCenterlineClearance(
  assets: readonly TerrainProjectAsset[],
  segments: readonly RiverTerrainCorridorSegment[]
): number {
  let minimum = Number.POSITIVE_INFINITY;
  for (const point of segments.flatMap(({ start, end }) => [start, end])) {
    for (const asset of assets) {
      const terrainHeight = sampleAssetHeight(asset, point.x, point.z);
      if (terrainHeight === undefined) continue;
      minimum = Math.min(minimum, point.surfaceY - terrainHeight);
      break;
    }
  }
  return Number.isFinite(minimum) ? minimum : 0;
}

function sampleAssetHeight(asset: TerrainProjectAsset, worldX: number, worldZ: number): number | undefined {
  const { document } = asset;
  const [originX, , originZ] = document.descriptor.worldPosition;
  const [extentX, , extentZ] = document.descriptor.worldSize;
  const localX = (worldX - originX) / extentX;
  const localZ = (worldZ - originZ) / extentZ;
  if (localX < 0 || localX > 1 || localZ < 0 || localZ > 1) return undefined;
  const [width, height] = document.manifest.heightmap.sampleSize;
  const sampleX = localX * (width - 1);
  const sampleZ = localZ * (height - 1);
  const x0 = Math.floor(sampleX);
  const z0 = Math.floor(sampleZ);
  const x1 = Math.min(width - 1, x0 + 1);
  const z1 = Math.min(height - 1, z0 + 1);
  const tx = sampleX - x0;
  const tz = sampleZ - z0;
  const at = (x: number, z: number): number =>
    decodeTerrainHeightSample(document, document.heightmap[terrainRasterIndex(x, z, width)]);
  return mix(mix(at(x0, z0), at(x1, z0), tx), mix(at(x0, z1), at(x1, z1), tx), tz);
}

function createCorridorSegment(
  start: RiverTerrainCorridorPoint,
  end: RiverTerrainCorridorPoint
): RiverTerrainCorridorSegment {
  const startExtent = start.halfWidth + start.bankWidth;
  const endExtent = end.halfWidth + end.bankWidth;
  return {
    start,
    end,
    minX: Math.min(start.x - startExtent, end.x - endExtent),
    minZ: Math.min(start.z - startExtent, end.z - endExtent),
    maxX: Math.max(start.x + startExtent, end.x + endExtent),
    maxZ: Math.max(start.z + startExtent, end.z + endExtent)
  };
}

function resolveSampleBounds(
  segments: readonly RiverTerrainCorridorSegment[],
  worldX: number,
  worldZ: number,
  worldWidth: number,
  worldDepth: number,
  width: number,
  height: number
): { readonly minX: number; readonly minZ: number; readonly maxX: number; readonly maxZ: number } {
  const minWorldX = Math.min(...segments.map(({ minX }) => minX));
  const minWorldZ = Math.min(...segments.map(({ minZ }) => minZ));
  const maxWorldX = Math.max(...segments.map(({ maxX }) => maxX));
  const maxWorldZ = Math.max(...segments.map(({ maxZ }) => maxZ));
  return {
    minX: clamp(Math.floor(((minWorldX - worldX) / worldWidth) * (width - 1)), 0, width - 1),
    minZ: clamp(Math.floor(((minWorldZ - worldZ) / worldDepth) * (height - 1)), 0, height - 1),
    maxX: clamp(Math.ceil(((maxWorldX - worldX) / worldWidth) * (width - 1)), 0, width - 1),
    maxZ: clamp(Math.ceil(((maxWorldZ - worldZ) / worldDepth) * (height - 1)), 0, height - 1)
  };
}

function resolveCoupledHeight(
  segments: readonly RiverTerrainCorridorSegment[],
  worldX: number,
  worldZ: number,
  currentHeight: number
): number {
  let result = currentHeight;
  for (const segment of segments) {
    if (worldX < segment.minX || worldX > segment.maxX || worldZ < segment.minZ || worldZ > segment.maxZ) {
      continue;
    }
    const directionX = segment.end.x - segment.start.x;
    const directionZ = segment.end.z - segment.start.z;
    const lengthSquared = directionX * directionX + directionZ * directionZ;
    const projection =
      lengthSquared > 0
        ? clamp(
            ((worldX - segment.start.x) * directionX + (worldZ - segment.start.z) * directionZ) / lengthSquared,
            0,
            1
          )
        : 0;
    const centerX = mix(segment.start.x, segment.end.x, projection);
    const centerZ = mix(segment.start.z, segment.end.z, projection);
    const distance = Math.hypot(worldX - centerX, worldZ - centerZ);
    const halfWidth = Math.max(0, mix(segment.start.halfWidth, segment.end.halfWidth, projection));
    const bankWidth = Math.max(0, mix(segment.start.bankWidth, segment.end.bankWidth, projection));
    const outerWidth = halfWidth + bankWidth;
    if (distance > outerWidth) continue;
    const bedY = mix(segment.start.bedY, segment.end.bedY, projection);
    const bankProgress = bankWidth > 0 ? smoothStep((distance - halfWidth) / bankWidth) : 1;
    const targetHeight = distance <= halfWidth ? bedY : mix(bedY, currentHeight, bankProgress);
    result = Math.min(result, targetHeight);
  }
  return result;
}

function smoothStep(value: number): number {
  const clamped = clamp(value, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

function mix(left: number, right: number, amount: number): number {
  return left + (right - left) * amount;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
