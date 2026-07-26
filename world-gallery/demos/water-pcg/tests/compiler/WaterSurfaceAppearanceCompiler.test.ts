import { describe, expect, it } from "vitest";
import {
  WaterSurfaceAppearanceSchemaVersion,
  WaterSurfaceCoastalAlphaModel,
  WaterSurfaceContactFoamModel,
  WaterSurfaceDepthTintModel,
  WaterSurfaceNormalModel
} from "../../authoring/surface/WaterSurfaceAppearanceTypes";
import { HeightfieldWaterCompiler } from "../../compiler/heightfield/HeightfieldWaterCompiler";
import { WaterSurfaceAppearanceCompiler } from "../../compiler/surface/WaterSurfaceAppearanceCompiler";
import { curvedHeightfieldFixture } from "../fixtures/heightfieldWaterFixtures";
import {
  grasslandsSurfaceAppearanceFixture,
  legacySurfaceAppearanceFixture
} from "../fixtures/waterSurfaceAppearanceFixtures";

describe("WaterSurfaceAppearanceCompiler", () => {
  it("produces deterministic normalized data across references, property order, and JSON round trips", () => {
    const reordered = {
      contactFoam: grasslandsSurfaceAppearanceFixture.contactFoam,
      coastalAlpha: grasslandsSurfaceAppearanceFixture.coastalAlpha,
      depthTint: grasslandsSurfaceAppearanceFixture.depthTint,
      normal: grasslandsSurfaceAppearanceFixture.normal,
      id: grasslandsSurfaceAppearanceFixture.id,
      schemaVersion: grasslandsSurfaceAppearanceFixture.schemaVersion
    };
    const fromJson: unknown = JSON.parse(JSON.stringify(grasslandsSurfaceAppearanceFixture));
    const first = WaterSurfaceAppearanceCompiler.compile(grasslandsSurfaceAppearanceFixture);
    const second = WaterSurfaceAppearanceCompiler.compile(reordered);
    const third = WaterSurfaceAppearanceCompiler.compile(fromJson);

    expect(first.valid).toBe(true);
    expect(first.data?.appearanceHash).toBe("3c1b8afc55c7059b");
    expect(second.data?.appearanceHash).toBe(first.data?.appearanceHash);
    expect(third.data?.appearanceHash).toBe(first.data?.appearanceHash);
    expect(first.data).toEqual(second.data);
    expect(first.data).toEqual(third.data);
    expect(Object.isFrozen(first.data)).toBe(true);
  });

  it("uses one stable shader-family variant instead of generating per-asset variants", () => {
    const full = WaterSurfaceAppearanceCompiler.compile(grasslandsSurfaceAppearanceFixture).data!;
    const legacy = WaterSurfaceAppearanceCompiler.compile(legacySurfaceAppearanceFixture).data!;
    const changedValue = WaterSurfaceAppearanceCompiler.compile({
      ...grasslandsSurfaceAppearanceFixture,
      normal: { ...grasslandsSurfaceAppearanceFixture.normal, strength: 0.4 }
    }).data!;

    expect(full.variantKey).toBe("surface-appearance-v1");
    expect(legacy.variantKey).toBe(full.variantKey);
    expect(changedValue.variantKey).toBe(full.variantKey);
    expect(legacy.appearanceHash).not.toBe(full.appearanceHash);
    expect(changedValue.appearanceHash).not.toBe(full.appearanceHash);
  });

  it("includes external content identity in the deterministic appearance hash", () => {
    const first = WaterSurfaceAppearanceCompiler.compile(grasslandsSurfaceAppearanceFixture).data!;
    const changedHash = WaterSurfaceAppearanceCompiler.compile({
      ...grasslandsSurfaceAppearanceFixture,
      normal: {
        ...grasslandsSurfaceAppearanceFixture.normal,
        textureContentHash: "1".repeat(64)
      }
    }).data!;

    expect(changedHash.appearanceHash).not.toBe(first.appearanceHash);
  });

  it("fails closed with no compiled data for invalid assets", () => {
    const result = WaterSurfaceAppearanceCompiler.compile({
      ...grasslandsSurfaceAppearanceFixture,
      depthTint: {
        ...grasslandsSurfaceAppearanceFixture.depthTint,
        distance: 0
      }
    });

    expect(result.valid).toBe(false);
    expect(result.data).toBeUndefined();
    expect(result.diagnostics).not.toEqual([]);
  });

  it("keeps compiled output engine-object-free and serializable", () => {
    const data = WaterSurfaceAppearanceCompiler.compile(grasslandsSurfaceAppearanceFixture).data!;
    const serialized = JSON.parse(JSON.stringify(data));

    expect(serialized).toEqual({
      schemaVersion: WaterSurfaceAppearanceSchemaVersion.V1,
      sourceId: "grasslands-stylized-water",
      appearanceHash: data.appearanceHash,
      variantKey: "surface-appearance-v1",
      normal: {
        model: WaterSurfaceNormalModel.ExternalTangentNormal,
        textureAssetId: "grasslands-water-normal-1024",
        textureContentHash: "0d9bfdded6d8c46cff4afe145cf052ec31f079ae03d89b73599ccb7807c02332",
        sampling: "world-xz-mirrored-dual",
        tiling: 0.05,
        scrollUvPerSecond: 0.02,
        strength: 0.2,
        flipGreen: false
      },
      depthTint: {
        model: WaterSurfaceDepthTintModel.SceneDepthPower,
        color: [0.21710525, 0.45953944, 0.55, 1],
        distance: 10,
        exponent: 0.5
      },
      coastalAlpha: { model: WaterSurfaceCoastalAlphaModel.SceneDepth, distance: 0.5 },
      contactFoam: {
        model: WaterSurfaceContactFoamModel.SceneDepthVoronoi,
        worldScale: 2.5,
        timeRate: 1,
        opacity: 0.453,
        contactDistance: 0.1791,
        octaves: { count: 3, weights: [0.5, 0.25, 0.125] },
        lacunarity: 2,
        suppressRefraction: 1,
        smoothnessReduction: 0.35
      },
      diagnostics: []
    });
    expect(JSON.stringify(data)).not.toMatch(/Texture2D|ImageBitmap|WebGL|GPU|https?:\/\//);
  });

  it("preserves the frozen Heightfield V1 source hash and compiled-output snapshot", () => {
    const data = HeightfieldWaterCompiler.compile(curvedHeightfieldFixture).data!;

    expect(data.sourceHash).toBe("0c87f7cea40e6a4f");
    expect({
      schemaVersion: data.schemaVersion,
      sourceId: data.sourceId,
      quality: data.quality,
      aggregationScale: data.aggregationScale,
      grid: data.grid,
      material: data.material,
      components: data.components.map((component) => ({
        id: component.id,
        wetTexelCount: component.wetTexelCount,
        minTexel: component.minTexel,
        maxTexel: component.maxTexel,
        bounds: component.bounds,
        minSurfaceHeight: component.minSurfaceHeight,
        maxSurfaceHeight: component.maxSurfaceHeight
      })),
      chunks: data.chunks.map((chunk) => ({
        id: chunk.id,
        tileX: chunk.tileX,
        tileZ: chunk.tileZ,
        part: chunk.part,
        localOrigin: chunk.localOrigin,
        componentIndices: chunk.componentIndices,
        atlasUvRect: chunk.atlasUvRect,
        vertexCount: chunk.geometry.vertexCount,
        indexCount: chunk.geometry.indexCount,
        bounds: chunk.geometry.bounds
      })),
      localMap: {
        width: data.localMapAtlas.width,
        height: data.localMapAtlas.height,
        worldToUv: data.localMapAtlas.worldToUv,
        flowDecodeScale: data.localMapAtlas.flowDecodeScale,
        maxDepth: data.localMapAtlas.maxDepth,
        signedDistanceRange: data.localMapAtlas.signedDistanceRange
      },
      stats: data.stats
    }).toEqual({
      schemaVersion: 1,
      sourceId: "curved-surface",
      quality: "high",
      aggregationScale: 1,
      grid: { originXZ: [10, 20], cellSizeXZ: [2, 3], width: 3, height: 2 },
      material: {
        shallowColor: [0.08, 0.48, 0.58, 0.72],
        deepColor: [0.01, 0.08, 0.2, 0.9],
        opacity: 0.78,
        shoreFoamWidth: 1.5,
        microNormalStrength: 0.7,
        waveStrength: 1
      },
      components: [
        {
          id: "curved-surface:component:0",
          wetTexelCount: 6,
          minTexel: [0, 0],
          maxTexel: [2, 1],
          bounds: { min: [9, 2, 18.5], max: [15, 3.75, 24.5] },
          minSurfaceHeight: 2,
          maxSurfaceHeight: 3.75
        }
      ],
      chunks: [
        {
          id: "curved-surface:chunk:0:0:0",
          tileX: 0,
          tileZ: 0,
          part: 0,
          localOrigin: [9, 2, 18.5],
          componentIndices: [0],
          atlasUvRect: [0, 0, 1, 1],
          vertexCount: 18,
          indexCount: 72,
          bounds: { min: [0, 0, 0], max: [6, 1.75, 6] }
        }
      ],
      localMap: {
        width: 3,
        height: 2,
        worldToUv: [1 / 6, 1 / 6, -1.5, -37 / 12],
        flowDecodeScale: 2,
        maxDepth: 4.75,
        signedDistanceRange: 6
      },
      stats: {
        sourceWetTexelCount: 6,
        componentCount: 1,
        outputCellCount: 6,
        vertexCount: 18,
        triangleCount: 24,
        chunkCount: 1,
        mapPixelCount: 6,
        minSurfaceHeight: 2,
        maxSurfaceHeight: 3.75,
        maxDepth: 4.75
      }
    });
  });

  it("does not add appearance data to the Heightfield V1 worker-facing result", () => {
    const result = HeightfieldWaterCompiler.compile(curvedHeightfieldFixture);

    expect(result.valid).toBe(true);
    expect(result.data).not.toHaveProperty("appearance");
    expect(result.data).not.toHaveProperty("appearanceHash");
    expect(result.data).not.toHaveProperty("variantKey");
  });
});
