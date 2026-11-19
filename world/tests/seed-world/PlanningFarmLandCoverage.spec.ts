import { describe, expect, it } from "vitest";
import { SoilBoundary } from "@galacean/engine-farming/farming/presentation/soil/SoilBoundary";
import type { FarmSnapshot, FarmingStorageDefinitions, GroundBounds } from "@galacean/engine-farming/farming/api/index";
import {
  bakeFarmLandCoverage,
  FARM_LAND_MASK_SPACING_M,
  farmLandChunks,
  planningFarmLandFootprint
} from "../../demos/seed-world/src/planning/spatial/farming/PlanningFarmLandCoverage.ts";
import { packFarmGrassTilePixels } from "../../demos/seed-world/src/planning/spatial/farming/PlanningFarmGrassOverlay.ts";

function sampleGrid(
  pixels: Uint8Array,
  resolution: number,
  chunkX: number,
  chunkZ: number,
  size: number,
  wx: number,
  wz: number
): number {
  const ix = Math.round(((wx - chunkX) / size) * (resolution - 1));
  const iz = Math.round(((wz - chunkZ) / size) * (resolution - 1));
  return pixels[iz * resolution + ix];
}

describe("PlanningFarmLandCoverage soil interior cutout", () => {
  const cellSize = 1.25;
  const chunkSize = 8;

  it("cuts out only the strictly opaque interior of an isolated plot and matches SoilBoundary opacity", () => {
    const plot: GroundBounds = { minimumX: 2, minimumZ: 2, maximumX: 2 + cellSize, maximumZ: 2 + cellSize };
    const [chunk] = farmLandChunks([plot], chunkSize, 0, 0, 2);
    const baked = bakeFarmLandCoverage(chunk, chunkSize, [], [plot]);
    expect(baked.cutoutPixels).toBeDefined();
    const cutout = baked.cutoutPixels!;

    // Center of plot is strictly inside the opaque soil interior.
    expect(sampleGrid(baked.pixels, baked.resolution, chunk.x, chunk.z, chunkSize, 2.6, 2.6)).toBe(255);
    expect(sampleGrid(cutout, baked.resolution, chunk.x, chunk.z, chunkSize, 2.6, 2.6)).toBe(255);

    // Near the soft edge (< 0.245 m from boundary), cutout must be 0 so FarmLand remains underneath the soft soil fade.
    expect(sampleGrid(cutout, baked.resolution, chunk.x, chunk.z, chunkSize, 2.1, 2.6)).toBe(0);
    expect(sampleGrid(cutout, baked.resolution, chunk.x, chunk.z, chunkSize, 2.2, 2.6)).toBe(0);
    // Outside the plot in the 2m transition ring, cutout must be 0 while dirt coverage remains positive.
    expect(sampleGrid(cutout, baked.resolution, chunk.x, chunk.z, chunkSize, 1.5, 2.6)).toBe(0);
    expect(sampleGrid(baked.pixels, baked.resolution, chunk.x, chunk.z, chunkSize, 1.5, 2.6)).toBeGreaterThan(0);

    // Exhaustive invariant: every texel marked 255 must have SoilBoundary coverage === 1.
    const centerX = (plot.minimumX + plot.maximumX) / 2;
    const centerZ = (plot.minimumZ + plot.maximumZ) / 2;
    const boundary = new SoilBoundary(cellSize, centerX, centerZ);
    boundary.setNeighbors(1 << 4);
    for (let z = 0; z < baked.resolution; z++) {
      for (let x = 0; x < baked.resolution; x++) {
        if (cutout[z * baked.resolution + x] !== 255) continue;
        const wx = chunk.x + (x * chunkSize) / (baked.resolution - 1);
        const wz = chunk.z + (z * chunkSize) / (baked.resolution - 1);
        expect(boundary.coverage(wx - centerX, wz - centerZ)).toBe(1);
      }
    }
  });

  it("merges cutout seamlessly across shared edges in a 2x2 cluster while keeping concave L-corners safe", () => {
    const plots2x2: GroundBounds[] = [
      { minimumX: 2, minimumZ: 2, maximumX: 3.25, maximumZ: 3.25 },
      { minimumX: 3.25, minimumZ: 2, maximumX: 4.5, maximumZ: 3.25 },
      { minimumX: 2, minimumZ: 3.25, maximumX: 3.25, maximumZ: 4.5 },
      { minimumX: 3.25, minimumZ: 3.25, maximumX: 4.5, maximumZ: 4.5 }
    ];
    const [chunk2x2] = farmLandChunks(plots2x2, chunkSize, 0, 0, 2);
    const baked2x2 = bakeFarmLandCoverage(chunk2x2, chunkSize, [], plots2x2);
    expect(sampleGrid(baked2x2.cutoutPixels!, baked2x2.resolution, chunk2x2.x, chunk2x2.z, chunkSize, 3.2, 3.2)).toBe(255);
    expect(sampleGrid(baked2x2.cutoutPixels!, baked2x2.resolution, chunk2x2.x, chunk2x2.z, chunkSize, 3.3, 3.3)).toBe(255);

    // L-shape missing the top-right cell [3.25..4.5, 3.25..4.5]:
    const plotsL = plots2x2.slice(0, 3);
    const [chunkL] = farmLandChunks(plotsL, chunkSize, 0, 0, 2);
    const bakedL = bakeFarmLandCoverage(chunkL, chunkSize, [], plotsL);
    expect(sampleGrid(bakedL.cutoutPixels!, bakedL.resolution, chunkL.x, chunkL.z, chunkSize, 3.2, 3.2)).toBe(0);
    expect(sampleGrid(bakedL.cutoutPixels!, bakedL.resolution, chunkL.x, chunkL.z, chunkSize, 2.6, 2.6)).toBe(255);
  });

  it("skips cutout allocation when opaquePlots is empty and keeps container grass holes uncut", () => {
    const plot: GroundBounds = { minimumX: 2, minimumZ: 2, maximumX: 3.25, maximumZ: 3.25 };
    const [chunk] = farmLandChunks([plot], chunkSize, 0, 0, 2);
    const previewOnly = bakeFarmLandCoverage(chunk, chunkSize, [], []);
    expect(previewOnly.cutoutPixels).toBeUndefined();
    expect(sampleGrid(previewOnly.pixels, previewOnly.resolution, chunk.x, chunk.z, chunkSize, 2.6, 2.6)).toBe(255);

    const hole: GroundBounds = { minimumX: 2.4, minimumZ: 2.4, maximumX: 2.8, maximumZ: 2.8 };
    const withHole = bakeFarmLandCoverage(chunk, chunkSize, [hole], [plot]);
    expect(sampleGrid(withHole.cutoutPixels!, withHole.resolution, chunk.x, chunk.z, chunkSize, 2.6, 2.6)).toBe(0);
    expect(sampleGrid(withHole.pixels, withHole.resolution, chunk.x, chunk.z, chunkSize, 2.6, 2.6)).toBe(0);
    expect(FARM_LAND_MASK_SPACING_M).toBe(0.1);
  });

  it("adapts corner/texel safety inset for larger plot sizes (> 1.6 m)", () => {
    const largeSize = 2.5;
    const plot: GroundBounds = { minimumX: 2, minimumZ: 2, maximumX: 2 + largeSize, maximumZ: 2 + largeSize };
    const [chunk] = farmLandChunks([plot], chunkSize, 0, 0, 2);
    const baked = bakeFarmLandCoverage(chunk, chunkSize, [], [plot]);
    const cutout = baked.cutoutPixels!;
    // Corner radius = 2.5 * 0.16 = 0.40 m, safety = 2.5 / 64 = 0.039 m -> inset >= 0.439 m.
    expect(sampleGrid(cutout, baked.resolution, chunk.x, chunk.z, chunkSize, 2.4, 3.2)).toBe(0);
    expect(sampleGrid(cutout, baked.resolution, chunk.x, chunk.z, chunkSize, 3.2, 3.2)).toBe(255);

    const centerX = (plot.minimumX + plot.maximumX) / 2;
    const centerZ = (plot.minimumZ + plot.maximumZ) / 2;
    const boundary = new SoilBoundary(largeSize, centerX, centerZ);
    boundary.setNeighbors(1 << 4);
    for (let z = 0; z < baked.resolution; z++) {
      for (let x = 0; x < baked.resolution; x++) {
        if (cutout[z * baked.resolution + x] !== 255) continue;
        const wx = chunk.x + (x * chunkSize) / (baked.resolution - 1);
        const wz = chunk.z + (z * chunkSize) / (baked.resolution - 1);
        expect(boundary.coverage(wx - centerX, wz - centerZ)).toBe(1);
      }
    }
  });

  it("excludes unavailable plots from planningFarmLandFootprint.opaquePlots", () => {
    const snapshot = {
      grid: { originX: 0, originZ: 0, cellSize: 1.25 },
      plots: [
        {
          plotId: "p1",
          groundId: "terrain",
          cellX: 0,
          cellZ: 0,
          ground: { availability: "available" },
          soil: { preparation: "leveled" }
        },
        {
          plotId: "p2",
          groundId: "terrain",
          cellX: 1,
          cellZ: 0,
          ground: { availability: "unavailable", reason: "steep" },
          soil: { preparation: "leveled" }
        }
      ],
      storage: { containers: [] }
    } as unknown as FarmSnapshot;
    const definitions = { containers: [] } as unknown as FarmingStorageDefinitions;
    const footprint = planningFarmLandFootprint(snapshot, definitions);
    expect(footprint.plots).toHaveLength(2);
    expect(footprint.opaquePlots).toHaveLength(1);
    expect(footprint.opaquePlots[0]).toEqual(footprint.plots[0]);
  });

  it("packs FarmGrassTile RGBA channels preserving R/G dirt coverage and placing cutout in B", () => {
    const packed = packFarmGrassTilePixels({
      pixels: new Uint8Array([10, 200, 255]),
      beforePixels: new Uint8Array([0, 120, 255]),
      cutoutPixels: new Uint8Array([0, 0, 255])
    });
    expect([...packed]).toEqual([0, 10, 0, 255, 120, 200, 0, 255, 255, 255, 255, 255]);

    const withoutOptional = packFarmGrassTilePixels({
      pixels: new Uint8Array([42, 255])
    });
    expect([...withoutOptional]).toEqual([42, 42, 0, 255, 255, 255, 0, 255]);
  });
});
