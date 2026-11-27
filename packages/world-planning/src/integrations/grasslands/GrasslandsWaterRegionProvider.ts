/** One-shot Terrain-to-Water region extraction for the authored Grasslands plane. */
import {
  WaterBathymetrySourceKind,
  WaterSpatialFieldSourceSchemaVersion,
  type TerrainBedSamplesWaterBathymetrySourceV1,
  WaterRegionSchemaVersion,
  type WaterRegionMaskV1,
  computeTerrainBedSamplesContentHash
} from "@galacean/engine-water/water/index";

import { hashWaterRegionMask } from "@galacean/engine-water/water/compiler/index";
import type { GrasslandsTerrainWaterLayoutSpec } from "./GrasslandsWaterDescriptor";

export const TERRAIN_GRASSLANDS_WATER_REGION_ID = "terrain-grasslands-water-region-v1";

export interface GrasslandsTerrainHeightSampler {
  sampleHeightInterpolated(worldX: number, worldZ: number): number | undefined;
}

const SAMPLE_OFFSETS = Object.freeze([
  [0.5, 0.5],
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1]
] as const);

function countWet(mask: Uint8Array): number {
  let count = 0;
  for (const value of mask) count += value;
  return count;
}

function closeIsolatedHoles(mask: Uint8Array, width: number, height: number): number {
  const repaired: number[] = [];
  for (let z = 1; z + 1 < height; z++) {
    for (let x = 1; x + 1 < width; x++) {
      const index = z * width + x;
      if (
        mask[index] === 0 &&
        mask[index - 1] === 1 &&
        mask[index + 1] === 1 &&
        mask[index - width] === 1 &&
        mask[index + width] === 1
      ) {
        repaired.push(index);
      }
    }
  }
  for (const index of repaired) mask[index] = 1;
  return repaired.length;
}

function collectComponents(mask: Uint8Array, width: number, height: number): number[][] {
  const visited = new Uint8Array(mask.length);
  const components: number[][] = [];
  for (let seed = 0; seed < mask.length; seed++) {
    if (mask[seed] === 0 || visited[seed] === 1) continue;
    const component: number[] = [];
    const queue = [seed];
    visited[seed] = 1;
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const index = queue[cursor];
      component.push(index);
      const x = index % width;
      const z = Math.floor(index / width);
      const neighbours = [
        x > 0 ? index - 1 : -1,
        x + 1 < width ? index + 1 : -1,
        z > 0 ? index - width : -1,
        z + 1 < height ? index + width : -1
      ];
      for (const neighbour of neighbours) {
        if (neighbour >= 0 && mask[neighbour] === 1 && visited[neighbour] === 0) {
          visited[neighbour] = 1;
          queue.push(neighbour);
        }
      }
    }
    components.push(component);
  }
  return components;
}

function validateConfig(spec: GrasslandsTerrainWaterLayoutSpec): void {
  const [width, height] = spec.region.resolution;
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width <= 0 ||
    height <= 0 ||
    width > 4096 ||
    height > 4096
  ) {
    throw new RangeError("Grasslands water region resolution must contain integer edges in [1, 4096].");
  }
  if (!Number.isFinite(spec.region.wetThreshold) || spec.region.wetThreshold < 0) {
    throw new RangeError("Grasslands water wet threshold must be finite and non-negative.");
  }
  if (
    !Number.isFinite(spec.region.maximumRepairRatio) ||
    spec.region.maximumRepairRatio < 0 ||
    spec.region.maximumRepairRatio > 1
  ) {
    throw new RangeError("Grasslands water maximum repair ratio must be in [0, 1].");
  }
  if (spec.region.componentPolicy !== "largest") {
    throw new Error("Grasslands water currently requires the explicit largest-component policy.");
  }
}

/**
 * Samples Terrain once and returns detached region data. The Water runtime
 * receives no reference to the sampler or its heightmap resources.
 */
export function createGrasslandsWaterRegion(
  spec: GrasslandsTerrainWaterLayoutSpec,
  terrain: GrasslandsTerrainHeightSampler
): WaterRegionMaskV1 {
  validateConfig(spec);
  const [width, height] = spec.region.resolution;
  const minimumX = spec.position[0] - spec.sizeXZ[0] * 0.5;
  const minimumZ = spec.position[2] - spec.sizeXZ[1] * 0.5;
  const maximumX = minimumX + spec.sizeXZ[0];
  const maximumZ = minimumZ + spec.sizeXZ[1];
  const cellSizeX = spec.sizeXZ[0] / width;
  const cellSizeZ = spec.sizeXZ[1] / height;
  const wetMask = new Uint8Array(width * height);
  let missingSampleCount = 0;
  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      let wet = false;
      for (const [offsetX, offsetZ] of SAMPLE_OFFSETS) {
        const terrainHeight = terrain.sampleHeightInterpolated(
          minimumX + (x + offsetX) * cellSizeX,
          minimumZ + (z + offsetZ) * cellSizeZ
        );
        if (terrainHeight === undefined) {
          missingSampleCount++;
          continue;
        }
        if (terrainHeight < spec.position[1] - spec.region.wetThreshold) {
          wet = true;
          break;
        }
      }
      wetMask[z * width + x] = wet ? 1 : 0;
    }
  }
  if (missingSampleCount > 0) {
    throw new Error(`Grasslands water region extraction encountered ${missingSampleCount} missing Terrain samples.`);
  }

  const candidateWetTexelCount = countWet(wetMask);
  const repairedTexelCount = spec.region.closeIsolatedHoles ? closeIsolatedHoles(wetMask, width, height) : 0;
  const maximumRepairs = Math.max(1, Math.floor(candidateWetTexelCount * spec.region.maximumRepairRatio));
  if (repairedTexelCount > maximumRepairs) {
    throw new Error(
      `Grasslands water region repaired ${repairedTexelCount} texels; policy allows at most ${maximumRepairs}.`
    );
  }

  const components = collectComponents(wetMask, width, height).sort((first, second) => second.length - first.length);
  if (components.length === 0) throw new Error("Grasslands Terrain did not produce a water region.");
  const retained = components[0];
  const retainedMask = new Uint8Array(wetMask.length);
  for (const index of retained) retainedMask[index] = 1;
  const wetTexelCount = retained.length;
  const discardedTexelCount = countWet(wetMask) - wetTexelCount;
  const bounds = Object.freeze({
    minimumXZ: Object.freeze([minimumX, minimumZ] as const),
    maximumXZ: Object.freeze([maximumX, maximumZ] as const)
  });
  const hashInput = {
    schemaVersion: WaterRegionSchemaVersion.V1,
    id: TERRAIN_GRASSLANDS_WATER_REGION_ID,
    bounds,
    waterLevel: spec.position[1],
    resolution: Object.freeze([width, height] as const),
    wetMask: retainedMask
  } as const;
  return Object.freeze({
    ...hashInput,
    contentHash: hashWaterRegionMask(hashInput),
    metrics: Object.freeze({
      sampledTexelCount: width * height,
      candidateWetTexelCount,
      wetTexelCount,
      componentCount: components.length,
      repairedTexelCount,
      discardedTexelCount
    })
  });
}

/**
 * Converts the same one-shot Terrain sampler into a detached Water-owned bed
 * grid. Dry texels are canonicalized to the water level because they never
 * participate in the compiled water body and must not invalidate its identity.
 */
export function createGrasslandsTerrainBedSamples(
  spec: GrasslandsTerrainWaterLayoutSpec,
  region: WaterRegionMaskV1,
  terrain: GrasslandsTerrainHeightSampler
): TerrainBedSamplesWaterBathymetrySourceV1 {
  validateConfig(spec);
  const [width, height] = spec.region.resolution;
  if (
    region.resolution[0] !== width ||
    region.resolution[1] !== height ||
    Math.abs(region.waterLevel - spec.position[1]) > 1e-6
  ) {
    throw new Error("Grasslands Terrain bed samples require the matching detached Water region.");
  }
  const minimumX = spec.position[0] - spec.sizeXZ[0] * 0.5;
  const minimumZ = spec.position[2] - spec.sizeXZ[1] * 0.5;
  const cellSizeX = spec.sizeXZ[0] / width;
  const cellSizeZ = spec.sizeXZ[1] / height;
  const bedHeights = new Array<number>(width * height);
  let maximumDepth = 0;
  let missingSampleCount = 0;
  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      const index = z * width + x;
      const terrainHeight = terrain.sampleHeightInterpolated(
        minimumX + (x + 0.5) * cellSizeX,
        minimumZ + (z + 0.5) * cellSizeZ
      );
      if (terrainHeight === undefined) {
        missingSampleCount++;
        bedHeights[index] = spec.position[1];
        continue;
      }
      if (region.wetMask[index] === 0) {
        bedHeights[index] = spec.position[1];
        continue;
      }
      const bedHeight = Math.min(terrainHeight, spec.position[1]);
      bedHeights[index] = bedHeight;
      maximumDepth = Math.max(maximumDepth, spec.position[1] - bedHeight);
    }
  }
  if (missingSampleCount > 0) {
    throw new Error(`Grasslands Terrain bed extraction encountered ${missingSampleCount} missing Terrain samples.`);
  }
  if (!(maximumDepth > 0)) {
    throw new Error("Grasslands Terrain bed extraction produced no positive Water depth.");
  }
  const frozenBedHeights = Object.freeze(bedHeights);
  const hashInput: Omit<TerrainBedSamplesWaterBathymetrySourceV1, "maximumDepth" | "contentHash"> = {
    schemaVersion: WaterSpatialFieldSourceSchemaVersion.V1,
    kind: WaterBathymetrySourceKind.TerrainBedSamples,
    sampleOrder: "row-major-region-grid",
    resolution: Object.freeze([width, height] as const),
    bedHeights: frozenBedHeights
  };
  return Object.freeze({
    ...hashInput,
    maximumDepth,
    contentHash: computeTerrainBedSamplesContentHash(hashInput)
  });
}
