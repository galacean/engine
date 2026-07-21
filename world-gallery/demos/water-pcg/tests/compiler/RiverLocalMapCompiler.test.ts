import { describe, expect, it } from "vitest";
import { RiverNetworkCompiler } from "../../compiler/river/RiverNetworkCompiler";
import { RiverLocalMapRegionKind } from "../../compiler/river/RiverGeometryEnums";
import { RIVER_LOCAL_MAP_TUNING } from "../../compiler/river/constants";
import { RiverDiagnosticCode } from "../../compiler/shared/diagnostics";
import { RiverNetworkSchemaVersion } from "../../authoring/river/RiverAuthoringEnums";
import { curvedMainRiverExample } from "../../demo/examples/river/curvedMainRiver";
import { multiTributaryRiverExample } from "../../demo/examples/river/multiTributaryRiver";
import { RiverResource } from "../../runtime/river/RiverResource";

function readPixel(pixels: { at(index: number): number | undefined }, width: number, x: number, y: number): number[] {
  const offset = (y * width + x) * 4;
  return [0, 1, 2, 3].map((channel) => pixels.at(offset + channel) ?? -1);
}

function readWorldPixel(
  atlas: NonNullable<ReturnType<typeof RiverNetworkCompiler.compile>["data"]>["terrainInteraction"]["localMapAtlas"],
  tileIndex: number,
  worldX: number,
  worldZ: number
): number[] {
  if (!atlas) throw new Error("Expected a local-map atlas.");
  const tile = atlas.tiles[tileIndex];
  const uvX = worldX * tile.worldToUv[0] + tile.worldToUv[2];
  const uvY = worldZ * tile.worldToUv[1] + tile.worldToUv[3];
  const pixelX = Math.min(
    tile.pixelRect[0] + tile.pixelRect[2] - 1,
    Math.max(tile.pixelRect[0], Math.round(uvX * atlas.width - 0.5))
  );
  const pixelY = Math.min(
    tile.pixelRect[1] + tile.pixelRect[3] - 1,
    Math.max(tile.pixelRect[1], Math.round(uvY * atlas.height - 0.5))
  );
  return readPixel(atlas.pixels, atlas.width, pixelX, pixelY);
}

describe("RiverLocalMapCompiler", () => {
  it("packs deterministic obstacle tiles with real RGBA pixels, padding, and per-tile chunks", () => {
    const descriptor = curvedMainRiverExample.riverDescriptor;
    if (descriptor.schemaVersion !== RiverNetworkSchemaVersion.V2) throw new Error("Expected a V2 fixture.");
    const first = RiverNetworkCompiler.compile(descriptor).data!;
    const second = RiverNetworkCompiler.compile(descriptor).data!;
    const atlas = first.terrainInteraction.localMapAtlas;
    const secondAtlas = second.terrainInteraction.localMapAtlas;
    if (!atlas || !secondAtlas) throw new Error("Expected an obstacle atlas.");

    expect(atlas.tiles).toHaveLength(descriptor.disturbances?.length ?? 0);
    expect(atlas.tiles.every((tile) => tile.kind === RiverLocalMapRegionKind.Obstacle)).toBe(true);
    expect(first.stats.mapPixelCount).toBe(atlas.width * atlas.height);
    expect(atlas.pixels.length).toBe(first.stats.mapPixelCount * 4);
    expect(Array.from(atlas.pixels)).toEqual(Array.from(secondAtlas.pixels));
    expect(new Set(atlas.pixels).size).toBeGreaterThan(8);
    expect(RiverResource.create(descriptor, first).metadata.compiledHash).toBe(
      RiverResource.create(descriptor, second).metadata.compiledHash
    );

    for (const tile of atlas.tiles) {
      const pixelX = tile.pixelRect[0];
      const pixelY = tile.pixelRect[1];
      expect(readPixel(atlas.pixels, atlas.width, pixelX - 1, pixelY)).toEqual(
        readPixel(atlas.pixels, atlas.width, pixelX, pixelY)
      );
      expect(tile.worldToUv[0]).toBeGreaterThan(0);
      expect(tile.worldToUv[1]).toBeGreaterThan(0);
    }

    const referencedTileIndices = new Set(
      first.chunks.flatMap((chunk) => (chunk.localMapTileIndex === undefined ? [] : [chunk.localMapTileIndex]))
    );
    expect(referencedTileIndices).toEqual(new Set(atlas.tiles.map((_tile, index) => index)));
  });

  it("removes atlas pixels and local-map chunks with the obstacle facts", () => {
    const source = curvedMainRiverExample.riverDescriptor;
    const descriptor = { ...source, disturbances: [] };
    const data = RiverNetworkCompiler.compile(descriptor).data!;

    expect(data.disturbances).toHaveLength(0);
    expect(data.terrainInteraction.localMapBakeRegions).toHaveLength(0);
    expect(data.terrainInteraction.localMapAtlas).toBeUndefined();
    expect(data.stats.mapPixelCount).toBe(0);
    expect(data.chunks.every((chunk) => chunk.localMapTileIndex === undefined)).toBe(true);
  });

  it("bakes converging side flows and broken foam ribbons behind obstacles", () => {
    const data = RiverNetworkCompiler.compile(curvedMainRiverExample.riverDescriptor).data!;
    const atlas = data.terrainInteraction.localMapAtlas;
    if (!atlas) throw new Error("Expected an obstacle atlas.");
    const disturbanceIndex = data.disturbances.findIndex((disturbance) => disturbance.id === "lower-bend-boulder");
    const disturbance = data.disturbances[disturbanceIndex];
    const tileIndex = atlas.tiles.findIndex(
      (tile) => tile.kind === RiverLocalMapRegionKind.Obstacle && tile.sourceIndex === disturbanceIndex
    );
    let nearestDistanceSquared = Number.POSITIVE_INFINITY;
    let flowX = 1;
    let flowZ = 0;
    for (const reach of data.reaches) {
      for (const sample of reach.artifact.samples) {
        const deltaX = disturbance.position[0] - sample.position[0];
        const deltaZ = disturbance.position[2] - sample.position[2];
        const distanceSquared = deltaX * deltaX + deltaZ * deltaZ;
        if (distanceSquared >= nearestDistanceSquared) continue;
        nearestDistanceSquared = distanceSquared;
        const flowLength = Math.hypot(sample.tangent[0], sample.tangent[2]);
        flowX = sample.tangent[0] / flowLength;
        flowZ = sample.tangent[2] / flowLength;
      }
    }
    const lateralX = -flowZ;
    const lateralZ = flowX;
    const downstreamDistance = disturbance.radius * 1.2;
    const wakeWidth = disturbance.radius * 0.55 + downstreamDistance * RIVER_LOCAL_MAP_TUNING.obstacleWakeHalfAngle;
    const acrossDistance = wakeWidth * 0.55;
    const sampleWake = (across: number): number[] =>
      readWorldPixel(
        atlas,
        tileIndex,
        disturbance.position[0] + flowX * downstreamDistance + lateralX * across,
        disturbance.position[2] + flowZ * downstreamDistance + lateralZ * across
      );
    const leftWake = sampleWake(-acrossDistance);
    const rightWake = sampleWake(acrossDistance);
    const farSide = sampleWake(disturbance.radius * 3);
    const decodeFlow = (pixel: number[]): readonly [number, number] => [
      (pixel[0] / 255) * 2 - 1,
      (pixel[1] / 255) * 2 - 1
    ];
    const leftFlow = decodeFlow(leftWake);
    const rightFlow = decodeFlow(rightWake);

    expect(atlas.tiles[tileIndex].resolution).toBe(48);
    expect(leftWake[2]).toBeGreaterThan(64);
    expect(rightWake[2]).toBeGreaterThan(64);
    expect(farSide[2]).toBeLessThan(32);
    expect(leftFlow[0] * lateralX + leftFlow[1] * lateralZ).toBeGreaterThan(0.15);
    expect(rightFlow[0] * lateralX + rightFlow[1] * lateralZ).toBeLessThan(-0.15);
    expect(leftFlow[0] * flowX + leftFlow[1] * flowZ).toBeGreaterThan(0.3);
    expect(rightFlow[0] * flowX + rightFlow[1] * flowZ).toBeGreaterThan(0.3);
  });

  it("localizes confluence foam instead of filling the entire junction patch", () => {
    const data = RiverNetworkCompiler.compile(multiTributaryRiverExample.riverDescriptor).data!;
    const atlas = data.terrainInteraction.localMapAtlas;
    if (!atlas) throw new Error("Expected a confluence atlas.");

    for (const tile of atlas.tiles) {
      expect(tile.kind).toBe(RiverLocalMapRegionKind.Confluence);
      const foamValues: number[] = [];
      for (let y = tile.pixelRect[1]; y < tile.pixelRect[1] + tile.pixelRect[3]; y++) {
        for (let x = tile.pixelRect[0]; x < tile.pixelRect[0] + tile.pixelRect[2]; x++) {
          foamValues.push(atlas.pixels.at((y * atlas.width + x) * 4 + 2) ?? 0);
        }
      }
      const saturatedPixelCount = foamValues.filter((value) => value >= 230).length;
      expect(Math.min(...foamValues)).toBeLessThan(32);
      expect(Math.max(...foamValues)).toBeGreaterThan(32);
      expect(saturatedPixelCount / foamValues.length).toBeLessThan(0.2);
    }
  });

  it("charges actual atlas pixels to the network budget", () => {
    const source = curvedMainRiverExample.riverDescriptor;
    const baseline = RiverNetworkCompiler.compile(source).data!;
    const result = RiverNetworkCompiler.compile({
      ...source,
      budget: {
        maxMapPixelCount: baseline.stats.mapPixelCount - 1
      }
    });

    expect(result.valid).toBe(false);
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([expect.objectContaining({ code: RiverDiagnosticCode.NetworkBudgetExceeded })])
    );
  });
});
