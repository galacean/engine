import { describe, expect, it } from "vitest";
import { HeightfieldWaterDiagnosticCode } from "../../authoring/heightfield/HeightfieldWaterEnums";
import { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";
import { HeightfieldWaterCompiler } from "../../compiler/heightfield/HeightfieldWaterCompiler";
import { sampleHeightfieldWaterBase } from "../../compiler/heightfield/HeightfieldWaterQuery";
import {
  createHeightfieldWaterFixture,
  curvedHeightfieldFixture,
  diagonalHeightfieldFixture,
  ringHeightfieldFixture,
  singleTexelHeightfieldFixture
} from "../fixtures/heightfieldWaterFixtures";

function atlasAlpha(
  data: NonNullable<ReturnType<typeof HeightfieldWaterCompiler.compile>["data"]>,
  x: number,
  z: number
): number {
  return data.localMapAtlas.pixels.at((z * data.localMapAtlas.width + x) * 4 + 3) ?? -1;
}

function worldPositions(data: NonNullable<ReturnType<typeof HeightfieldWaterCompiler.compile>["data"]>): number[][] {
  return data.chunks.flatMap((chunk) => {
    const positions = chunk.geometry.positions.toTypedArray();
    return Array.from({ length: chunk.geometry.vertexCount }, (_value, index) => [
      positions[index * 3] + chunk.localOrigin[0],
      positions[index * 3 + 1] + chunk.localOrigin[1],
      positions[index * 3 + 2] + chunk.localOrigin[2]
    ]);
  });
}

describe("HeightfieldWaterCompiler", () => {
  it("keeps diagonal contact as two four-neighbour components", () => {
    const data = HeightfieldWaterCompiler.compile(diagonalHeightfieldFixture).data!;

    expect(data.components).toHaveLength(2);
    expect(data.components.map((component) => Array.from(component.wetTexelIndices))).toEqual([[0], [3]]);
    expect(data.queryGrid.componentIndices.toTypedArray()).toEqual(new Int32Array([0, -1, -1, 1]));
  });

  it("preserves a hole and emits signed inside/outside atlas values", () => {
    const data = HeightfieldWaterCompiler.compile(ringHeightfieldFixture).data!;

    expect(data.components).toHaveLength(1);
    expect(data.localMapAtlas.width).toBe(5);
    expect(data.localMapAtlas.height).toBe(5);
    expect(atlasAlpha(data, 0, 0)).toBeGreaterThan(127);
    expect(atlasAlpha(data, 2, 2)).toBeLessThan(128);
    expect(sampleHeightfieldWaterBase(data, 2, 2).inside).toBe(false);
  });

  it("compiles a single pixel into a centre plus four corners and four triangles", () => {
    const data = HeightfieldWaterCompiler.compile(singleTexelHeightfieldFixture).data!;
    const geometry = data.chunks[0].geometry;

    expect(data.stats.outputCellCount).toBe(1);
    expect(geometry.vertexCount).toBe(5);
    expect(geometry.indexCount).toBe(12);
    expect(data.stats.triangleCount).toBe(4);
    expect(Math.max(...geometry.indices.toTypedArray())).toBeLessThan(geometry.vertexCount);
  });

  it("shares component-scoped corners between adjacent High-quality cells", () => {
    const data = HeightfieldWaterCompiler.compile(
      createHeightfieldWaterFixture({
        id: "shared-corners",
        grid: { originXZ: [0, 0], cellSizeXZ: [1, 1], width: 2, height: 1 },
        cells: [
          { x: 0, z: 0, surfaceHeight: 1 },
          { x: 1, z: 0, surfaceHeight: 2 }
        ]
      })
    ).data!;

    expect(data.chunks).toHaveLength(1);
    expect(data.chunks[0].geometry.vertexCount).toBe(8);
    expect(data.chunks[0].geometry.indexCount).toBe(24);
  });

  it("preserves every High-quality source-centre height", () => {
    const data = HeightfieldWaterCompiler.compile(curvedHeightfieldFixture).data!;
    const positions = worldPositions(data);

    for (let z = 0; z < curvedHeightfieldFixture.grid.height; z++) {
      for (let x = 0; x < curvedHeightfieldFixture.grid.width; x++) {
        const sourceIndex = z * curvedHeightfieldFixture.grid.width + x;
        const worldX = curvedHeightfieldFixture.grid.originXZ[0] + x * curvedHeightfieldFixture.grid.cellSizeXZ[0];
        const worldZ = curvedHeightfieldFixture.grid.originXZ[1] + z * curvedHeightfieldFixture.grid.cellSizeXZ[1];
        expect(
          positions.some(
            (position) =>
              Math.abs(position[0] - worldX) < 1e-6 &&
              Math.abs(position[1] - curvedHeightfieldFixture.surfaceHeights[sourceIndex]) < 1e-6 &&
              Math.abs(position[2] - worldZ) < 1e-6
          )
        ).toBe(true);
      }
    }
  });

  it("uses 1x, 2x, and 4x output-cell aggregation by quality", () => {
    const cells = Array.from({ length: 16 }, (_value, index) => ({
      x: index % 4,
      z: Math.floor(index / 4),
      surfaceHeight: 1
    }));
    const compile = (quality: WaterQualityTier) =>
      HeightfieldWaterCompiler.compile(
        createHeightfieldWaterFixture({
          id: quality,
          grid: { originXZ: [0, 0], cellSizeXZ: [1, 1], width: 4, height: 4 },
          cells,
          quality
        })
      ).data!;

    expect(compile(WaterQualityTier.High).stats.outputCellCount).toBe(16);
    expect(compile(WaterQualityTier.Medium).stats.outputCellCount).toBe(4);
    expect(compile(WaterQualityTier.Low).stats.outputCellCount).toBe(1);
  });

  it("splits chunks at 64 output cells along an axis", () => {
    const data = HeightfieldWaterCompiler.compile(
      createHeightfieldWaterFixture({
        id: "chunk-boundary",
        grid: { originXZ: [0, 0], cellSizeXZ: [1, 1], width: 65, height: 1 },
        cells: Array.from({ length: 65 }, (_value, x) => ({ x, z: 0, surfaceHeight: 1 }))
      })
    ).data!;

    expect(data.chunks).toHaveLength(2);
    expect(data.chunks.map((chunk) => chunk.tileX)).toEqual([0, 1]);
    expect(data.chunks.every((chunk) => chunk.geometry.vertexCount <= 65535)).toBe(true);
  });

  it("emits upward finite normals and consistently wound triangles", () => {
    const data = HeightfieldWaterCompiler.compile(curvedHeightfieldFixture).data!;
    for (const chunk of data.chunks) {
      const normals = chunk.geometry.normals.toTypedArray();
      for (let index = 0; index < normals.length; index += 3) {
        expect(Number.isFinite(normals[index])).toBe(true);
        expect(normals[index + 1]).toBeGreaterThan(0);
      }
      const positions = chunk.geometry.positions.toTypedArray();
      const indices = chunk.geometry.indices.toTypedArray();
      for (let index = 0; index < indices.length; index += 3) {
        const a = indices[index] * 3;
        const b = indices[index + 1] * 3;
        const c = indices[index + 2] * 3;
        const normalY =
          (positions[b + 2] - positions[a + 2]) * (positions[c] - positions[a]) -
          (positions[b] - positions[a]) * (positions[c + 2] - positions[a + 2]);
        expect(normalY).toBeGreaterThan(0);
      }
    }
  });

  it("packs decodable flow and depth channels", () => {
    const data = HeightfieldWaterCompiler.compile(singleTexelHeightfieldFixture).data!;
    const pixels = data.localMapAtlas.pixels.toTypedArray();

    expect(data.localMapAtlas.flowDecodeScale).toBe(2);
    expect(data.localMapAtlas.maxDepth).toBe(3);
    expect(pixels[0]).toBe(255);
    expect(pixels[1]).toBeGreaterThan(0);
    expect(pixels[2]).toBe(255);
    expect(pixels[3]).toBeGreaterThan(127);
  });

  it("provides static base height, normal, depth, flow, and shore queries", () => {
    const data = HeightfieldWaterCompiler.compile(curvedHeightfieldFixture).data!;
    const sample = sampleHeightfieldWaterBase(data, 10, 20);

    expect(sample.inside).toBe(true);
    expect(sample.componentIndex).toBe(0);
    expect(sample.surfaceHeight).toBeCloseTo(2);
    expect(sample.normal[1]).toBeGreaterThan(0.8);
    expect(sample.depth).toBeCloseTo(3);
    expect(sample.flowVectorXZ).toEqual([0, 0]);
    expect(sample.shoreDistance).toBeGreaterThan(0);
  });

  it("is deterministic and isolates compiler buffers from caller mutation", () => {
    const first = HeightfieldWaterCompiler.compile(curvedHeightfieldFixture).data!;
    const second = HeightfieldWaterCompiler.compile(curvedHeightfieldFixture).data!;

    expect(first.sourceHash).toBe(second.sourceHash);
    expect(first.chunks.map((chunk) => Array.from(chunk.geometry.positions))).toEqual(
      second.chunks.map((chunk) => Array.from(chunk.geometry.positions))
    );
    expect(Array.from(first.localMapAtlas.pixels)).toEqual(Array.from(second.localMapAtlas.pixels));
    const copied = first.chunks[0].geometry.positions.toTypedArray();
    copied[0] = 999;
    expect(first.chunks[0].geometry.positions.at(0)).not.toBe(999);
  });

  it("returns structured diagnostics when compiled budgets are exceeded", () => {
    const result = HeightfieldWaterCompiler.compile({
      ...curvedHeightfieldFixture,
      budget: { maxVertexCount: 1, maxTriangleCount: 1, maxChunkCount: 1, maxMapPixelCount: 1 }
    });

    expect(result.valid).toBe(false);
    expect(result.data).toBeUndefined();
    expect(
      result.diagnostics.filter((diagnostic) => diagnostic.code === HeightfieldWaterDiagnosticCode.BudgetExceeded)
        .length
    ).toBeGreaterThanOrEqual(3);
  });
});
