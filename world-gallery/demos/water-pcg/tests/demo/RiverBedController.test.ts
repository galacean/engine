import { Vector3 } from "@galacean/engine-math";
import { describe, expect, it } from "vitest";
import { RIVER_TERRAIN_CORRIDOR_COMPONENT } from "../../compiler/river/constants";
import { RiverNetworkCompiler } from "../../compiler/river/RiverNetworkCompiler";
import type { RiverTerrainReachCorridorData } from "../../compiler/river/types";
import {
  createLakeBedTexturePixels,
  createPoolBedTexturePixels,
  createRiverBedChunkGeometries,
  createRiverBedTexturePixels,
  createWaterTerrainHeightSampler
} from "../../demo/decoration/RiverBedController";
import { WaterDecorationStyle, WATER_BED_PROFILE, WATER_TERRAIN_GRID_STYLE } from "../../demo/decoration/constants";
import { riverExpandedLakeExample } from "../../demo/examples/lake/riverExpandedLake";
import { indoorReflectivePoolExample } from "../../demo/examples/pool/indoorReflectivePool";
import { curvedMainRiverExample } from "../../demo/examples/river/curvedMainRiver";
import { multiTributaryRiverExample } from "../../demo/examples/river/multiTributaryRiver";
import { createRiverNetworkQueryResult, RiverNetworkQueryService } from "../../runtime/river/RiverQueryService";

type RiverTerrainCorridorComponent =
  (typeof RIVER_TERRAIN_CORRIDOR_COMPONENT)[keyof typeof RIVER_TERRAIN_CORRIDOR_COMPONENT];

function readCorridorSample(
  corridor: RiverTerrainReachCorridorData,
  sampleIndex: number,
  component: RiverTerrainCorridorComponent
): number {
  return corridor.samples.at(sampleIndex * corridor.stride + component) ?? 0;
}

function countTextureColors(pixels: Uint8Array): number {
  const colors = new Set<string>();
  for (let offset = 0; offset < pixels.length; offset += 4) {
    colors.add(`${pixels[offset]},${pixels[offset + 1]},${pixels[offset + 2]}`);
    expect(pixels[offset + 3]).toBe(255);
  }
  return colors.size;
}

describe("RiverBedController terrain", () => {
  it.each([curvedMainRiverExample, multiTributaryRiverExample])(
    "creates deterministic broad terrain with varied channel depths for $id",
    (example) => {
      const data = RiverNetworkCompiler.compile(example.riverDescriptor).data!;
      const queryService = new RiverNetworkQueryService(data);
      const geometries = createRiverBedChunkGeometries(data);
      const geometry = geometries[0];
      const profile = WATER_BED_PROFILE[WaterDecorationStyle.River];

      expect(geometries).toHaveLength(1);
      expect(createRiverBedChunkGeometries(data)).toEqual(geometries);
      expect(geometry.positions.length).toBeGreaterThan(1000);
      expect(geometry.positions.length).toBeLessThanOrEqual((WATER_TERRAIN_GRID_STYLE.maxCellsPerAxis + 1) ** 2);
      expect(Math.max(...geometry.indices)).toBeLessThan(geometry.positions.length);

      let minCenterX = Number.POSITIVE_INFINITY;
      let minCenterZ = Number.POSITIVE_INFINITY;
      let maxCenterX = Number.NEGATIVE_INFINITY;
      let maxCenterZ = Number.NEGATIVE_INFINITY;
      for (const corridor of data.terrainInteraction.reachCorridors) {
        for (let sampleIndex = 0; sampleIndex < corridor.sampleCount; sampleIndex++) {
          const x = readCorridorSample(corridor, sampleIndex, RIVER_TERRAIN_CORRIDOR_COMPONENT.x);
          const z = readCorridorSample(corridor, sampleIndex, RIVER_TERRAIN_CORRIDOR_COMPONENT.z);
          minCenterX = Math.min(minCenterX, x);
          minCenterZ = Math.min(minCenterZ, z);
          maxCenterX = Math.max(maxCenterX, x);
          maxCenterZ = Math.max(maxCenterZ, z);
        }
      }
      expect(geometry.bounds.min[0]).toBeLessThanOrEqual(minCenterX - profile.minimumTerrainMargin);
      expect(geometry.bounds.min[2]).toBeLessThanOrEqual(minCenterZ - profile.minimumTerrainMargin);
      expect(geometry.bounds.max[0]).toBeGreaterThanOrEqual(maxCenterX + profile.minimumTerrainMargin);
      expect(geometry.bounds.max[2]).toBeGreaterThanOrEqual(maxCenterZ + profile.minimumTerrainMargin);

      const queryResult = createRiverNetworkQueryResult();
      const channelDepths = new Set<number>();
      for (const position of geometry.positions) {
        const worldPosition = new Vector3(...position);
        if (!queryService.sampleSurface(worldPosition, queryResult)) continue;
        expect(position[1]).toBeLessThan(queryResult.surfaceHeight);
        channelDepths.add(Math.round((queryResult.surfaceHeight - position[1]) * 100) / 100);
      }
      expect(channelDepths.size).toBeGreaterThan(8);

      const sampleTerrainHeight = createWaterTerrainHeightSampler(data, WaterDecorationStyle.River);
      for (const junction of data.junctions) {
        expect(sampleTerrainHeight(junction.position[0], junction.position[2])).toBeLessThan(junction.position[1]);
      }
    }
  );

  it("creates a broad, irregular lake basin and natural sediment texture", () => {
    const data = RiverNetworkCompiler.compile(riverExpandedLakeExample.riverDescriptor).data!;
    const geometry = createRiverBedChunkGeometries(data, WaterDecorationStyle.Lake)[0];
    const corridor = data.terrainInteraction.reachCorridors[0];
    const profile = WATER_BED_PROFILE[WaterDecorationStyle.Lake];
    const sampleTerrainHeight = createWaterTerrainHeightSampler(data, WaterDecorationStyle.Lake);
    const texturePixels = createLakeBedTexturePixels();
    const centerDepths = new Set<number>();

    expect(geometry.positions.length).toBeGreaterThan(1000);
    expect(Math.max(...geometry.indices)).toBeLessThan(geometry.positions.length);
    expect(geometry.bounds.min[0]).toBeLessThanOrEqual(
      readCorridorSample(corridor, 0, RIVER_TERRAIN_CORRIDOR_COMPONENT.x) - profile.minimumTerrainMargin
    );
    expect(geometry.bounds.max[0]).toBeGreaterThanOrEqual(
      readCorridorSample(corridor, corridor.sampleCount - 1, RIVER_TERRAIN_CORRIDOR_COMPONENT.x) +
        profile.minimumTerrainMargin
    );
    for (let sampleIndex = 0; sampleIndex < corridor.sampleCount; sampleIndex += 8) {
      const x = readCorridorSample(corridor, sampleIndex, RIVER_TERRAIN_CORRIDOR_COMPONENT.x);
      const z = readCorridorSample(corridor, sampleIndex, RIVER_TERRAIN_CORRIDOR_COMPONENT.z);
      const surfaceY = readCorridorSample(corridor, sampleIndex, RIVER_TERRAIN_CORRIDOR_COMPONENT.waterSurfaceY);
      centerDepths.add(Math.round((surfaceY - sampleTerrainHeight(x, z)) * 100) / 100);
    }
    expect(centerDepths.size).toBeGreaterThan(5);
    expect(countTextureColors(texturePixels)).toBeGreaterThan(64);
  });

  it("uses a non-checker natural texture for the expanded river terrain", () => {
    expect(countTextureColors(createRiverBedTexturePixels())).toBeGreaterThan(64);
  });

  it("keeps the indoor pool floor flat and tiled", () => {
    const data = RiverNetworkCompiler.compile(indoorReflectivePoolExample.riverDescriptor).data!;
    const geometry = createRiverBedChunkGeometries(data, WaterDecorationStyle.Pool)[0];
    const corridor = data.terrainInteraction.reachCorridors[0];
    const crossSectionCount = WATER_BED_PROFILE[WaterDecorationStyle.Pool].crossSectionFractions.length;
    const texturePixels = createPoolBedTexturePixels();

    expect(geometry.positions).toHaveLength(corridor.sampleCount * crossSectionCount);
    for (let row = 0; row < corridor.sampleCount; row++) {
      const rowStart = row * crossSectionCount;
      const floorY = geometry.positions[rowStart][1];
      for (let column = 1; column < crossSectionCount; column++) {
        expect(geometry.positions[rowStart + column][1]).toBeCloseTo(floorY, 6);
      }
    }
    expect(countTextureColors(texturePixels)).toBe(3);
  });
});
