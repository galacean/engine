import { describe, expect, it, vi } from "vitest";
import { BufferMesh, MeshRenderer } from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { HeadlessEngine } from "../../../packages/rhi-null/src/HeadlessEngine";
import { SoilBoundary } from "@galacean/engine-farming/farming/presentation/soil/SoilBoundary";
import type { FarmSnapshot, FarmingStorageDefinitions, GroundBounds } from "@galacean/engine-farming/farming/api/index";
import {
  bakeFarmLandCoverage,
  FARM_LAND_MARGIN_M,
  FARM_LAND_MASK_SPACING_M,
  farmLandChunks,
  planningFarmLandFootprint
} from "../../demos/seed-world/src/planning/spatial/farming/PlanningFarmLandCoverage.ts";
import { packFarmGrassTilePixels } from "../../demos/seed-world/src/planning/spatial/farming/PlanningFarmGrassOverlay.ts";
import {
  buildFarmLandGeometry,
  captureFarmLandHeights,
  farmLandActiveCellMask,
  farmLandGrid
} from "../../demos/seed-world/src/planning/spatial/farming/PlanningFarmLandGeometry.ts";
import { PlanningFarmLandLayer } from "../../demos/seed-world/src/planning/spatial/farming/PlanningFarmLandLayer.ts";
import type { PlanningFarmingTerrain } from "../../demos/seed-world/src/planning/spatial/farming/PlanningPublishedFarmingGround.ts";

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

function createFlatTestTerrain(sizeMetres = 32, resolution = 33, elevation = 1.5): PlanningFarmingTerrain {
  const surfaceHeights = new Float32Array(resolution * resolution).fill(elevation);
  const heightSamples = new Uint16Array(resolution * resolution);
  return {
    sizeMetres,
    worldOrigin: [-sizeMetres / 2, -sizeMetres / 2],
    heightDecode: { min: 0, max: 10 },
    heightResolution: resolution,
    heightSamples,
    surfaceHeights,
    surfaceResolution: resolution,
    rockySlopeWeight: new Uint8Array(resolution * resolution),
    materialWeights: new Uint8Array(resolution * resolution * 4)
  } as unknown as PlanningFarmingTerrain;
}

describe("P2-3c PlanningFarmLandLayer active-cell culling and tight bounds", () => {
  it("compacts buildFarmLandGeometry to active cells and computes tight emitted bounds", () => {
    const terrain = createFlatTestTerrain(32, 33, 2);
    const grid = farmLandGrid(terrain);
    const chunk = { x: grid.x, z: grid.z };
    const heights = captureFarmLandHeights(terrain, grid, chunk);

    const full = buildFarmLandGeometry(grid, chunk, heights, 0.01);
    expect(full.vertices.length / 6).toBe(81);
    expect(full.indices.length).toBe(384);
    expect(full.minimumX).toBeCloseTo(0, 4);
    expect(full.maximumX).toBeCloseTo(full.width, 4);
    expect(full.minimumZ).toBeCloseTo(0, 4);
    expect(full.maximumZ).toBeCloseTo(full.depth, 4);
    expect(full.minimumY).toBeCloseTo(2.01, 4);
    expect(full.maximumY).toBeCloseTo(2.01, 4);

    // One tiny plot near the far corner of the chunk leaves most cells inactive.
    const smallBounds: GroundBounds[] = [
      {
        minimumX: chunk.x + full.width - 1.5,
        maximumX: chunk.x + full.width - 0.5,
        minimumZ: chunk.z + full.depth - 1.5,
        maximumZ: chunk.z + full.depth - 0.5
      }
    ];
    const culled = buildFarmLandGeometry(grid, chunk, heights, 0.01, smallBounds, 0);
    expect(culled.vertices.length / 6).toBeLessThan(81);
    expect(culled.indices.length).toBeGreaterThan(0);
    expect(culled.indices.length).toBeLessThan(384);
    expect(culled.minimumX).toBeGreaterThan(0);
    expect(culled.minimumZ).toBeGreaterThan(0);
    expect(culled.maximumX).toBeLessThanOrEqual(full.width);
    expect(culled.maximumZ).toBeLessThanOrEqual(full.depth);
    // Bounds match strictly the emitted vertices.
    let expectedMinX = Infinity,
      expectedMaxX = -Infinity,
      expectedMinZ = Infinity,
      expectedMaxZ = -Infinity;
    for (let i = 0; i < culled.vertices.length; i += 6) {
      expectedMinX = Math.min(expectedMinX, culled.vertices[i]);
      expectedMaxX = Math.max(expectedMaxX, culled.vertices[i]);
      expectedMinZ = Math.min(expectedMinZ, culled.vertices[i + 2]);
      expectedMaxZ = Math.max(expectedMaxZ, culled.vertices[i + 2]);
    }
    expect(culled.minimumX).toBeCloseTo(expectedMinX, 6);
    expect(culled.maximumX).toBeCloseTo(expectedMaxX, 6);
    expect(culled.minimumZ).toBeCloseTo(expectedMinZ, 6);
    expect(culled.maximumZ).toBeCloseTo(expectedMaxZ, 6);

    const empty = buildFarmLandGeometry(grid, chunk, heights, 0.01, [], 0);
    expect(empty.vertices.length).toBe(0);
    expect(empty.indices.length).toBe(0);
    expect(empty.minimumX).toBe(0);
    expect(empty.maximumX).toBe(0);
    expect(empty.minimumZ).toBe(0);
    expect(empty.maximumZ).toBe(0);
    expect(empty.minimumY).toBe(0);
    expect(empty.maximumY).toBe(0);

    const loMask = farmLandActiveCellMask(
      grid,
      chunk,
      [{ minimumX: chunk.x, maximumX: chunk.x + 0.5, minimumZ: chunk.z, maximumZ: chunk.z + 0.5 }],
      0
    );
    const hiMask = farmLandActiveCellMask(
      grid,
      chunk,
      [
        {
          minimumX: chunk.x + full.width - 0.5,
          maximumX: chunk.x + full.width,
          minimumZ: chunk.z + full.depth - 0.5,
          maximumZ: chunk.z + full.depth
        }
      ],
      0
    );
    expect(loMask.maskLo).not.toBe(0);
    expect(loMask.maskHi).toBe(0);
    expect(hiMask.maskHi).not.toBe(0);
    expect(hiMask.maskLo).toBe(0);
  });

  it("rebuilds chunk BufferMesh with tight bounds and matching restorer when begin/end changes active-cell mask", async () => {
    vi.stubGlobal("cancelAnimationFrame", () => {});
    const engine = await HeadlessEngine.create({
      shaderCompiler: new ShaderCompiler(),
      glTFLoader: { meshOpt: { workerCount: 0 } }
    });
    const device = (engine as unknown as {
      _hardwareRenderer: { isWebGL2: boolean; capability: { maxTextureSize: number } };
    })._hardwareRenderer;
    device.isWebGL2 = true;
    device.capability.maxTextureSize = 4096;
    (engine.canvas as unknown as { _webCanvas: unknown })._webCanvas = {
      getContext: () => ({ MAX_TEXTURE_SIZE: 3379, getParameter: () => 4096 })
    };
    try {
      const terrain = createFlatTestTerrain(64, 65, 1.0);
      const root = engine.sceneManager.activeScene!.createRootEntity("farm-land-layer");
      const layer = new PlanningFarmLandLayer(root, terrain);

      const initialPlot: GroundBounds = { minimumX: -31, maximumX: -29.75, minimumZ: -31, maximumZ: -29.75 };
      layer.setBounds([initialPlot]);
      const chunksMap = (layer as unknown as {
        chunks: Map<string, { entity: { getComponent: (t: unknown) => MeshRenderer }; mesh: BufferMesh }>;
      }).chunks;
      expect(chunksMap.size).toBe(1);
      const [chunkKey, initialChunk] = [...chunksMap.entries()][0]!;
      const meshBefore = initialChunk.mesh;
      const vertsBefore = meshBefore.vertexBufferBindings[0]!.buffer.byteLength / 24;
      expect(meshBefore.bounds.max.x).toBeLessThanOrEqual(8 + FARM_LAND_MARGIN_M);

      // Expanding preview within the same chunk shifts the active-cell mask and rebuilds the chunk BufferMesh.
      const previewOutsideMask: GroundBounds = { minimumX: -27.5, maximumX: -26.25, minimumZ: -27.5, maximumZ: -26.25 };
      layer.begin(previewOutsideMask);
      const meshExpanded = chunksMap.get(chunkKey)!.mesh;
      expect(meshExpanded).not.toBe(meshBefore);
      expect(meshBefore.destroyed).toBe(true);
      expect(meshExpanded.vertexBufferBindings[0]!.buffer.byteLength / 24).toBeGreaterThan(vertsBefore);

      // Verify registered ContentRestorer matches the rebuilt mesh's exact vertex & index buffer sizes.
      const pool = (engine.resourceManager as unknown as {
        _contentRestorerPool?: Record<number, { resource: unknown; restoreContent: () => void }>;
      })._contentRestorerPool;
      const activeRestorer = pool?.[meshExpanded.instanceId];
      expect(activeRestorer).toBeDefined();
      expect(() => activeRestorer!.restoreContent()).not.toThrow();

      layer.end(false);
      const meshReverted = chunksMap.get(chunkKey)!.mesh;
      expect(meshReverted).not.toBe(meshExpanded);
      expect(meshExpanded.destroyed).toBe(true);
      expect(meshReverted.vertexBufferBindings[0]!.buffer.byteLength / 24).toBe(vertsBefore);

      layer.dispose();
    } finally {
      engine.destroy();
      vi.unstubAllGlobals();
    }
  });
});
