import { describe, expect, it } from "vitest";
import { RiverNetworkCompiler } from "../../compiler/river/RiverNetworkCompiler";
import { RiverLocalMapRegionKind } from "../../compiler/river/RiverGeometryEnums";
import { RiverDiagnosticCode } from "../../compiler/shared/diagnostics";
import { RiverNetworkSchemaVersion } from "../../authoring/river/RiverAuthoringEnums";
import { curvedMainRiverExample } from "../../demo/examples/river/curvedMainRiver";
import { multiTributaryRiverExample } from "../../demo/examples/river/multiTributaryRiver";
import { RiverResource } from "../../runtime/river/RiverResource";

function readPixel(pixels: { at(index: number): number | undefined }, width: number, x: number, y: number): number[] {
  const offset = (y * width + x) * 4;
  return [0, 1, 2, 3].map((channel) => pixels.at(offset + channel) ?? -1);
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
