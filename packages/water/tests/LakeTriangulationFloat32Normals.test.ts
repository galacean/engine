import { describe, expect, it } from "vitest";
import { createLake, WaterQualityTier, WaterWaveModel, WaterWaveSchemaVersion } from "../src/water/index";
import { HeightfieldWaterCompiler } from "../src/water/compiler/heightfield/HeightfieldWaterCompiler";
import { compileHeightfieldWaterRenderSurfaceChunks } from "../src/water/compiler/heightfield/HeightfieldWaterGeometryCompiler";
import { sampleLakeBoundary, triangulateLakeBoundary } from "../src/water/compiler/lake/LakeBoundaryCompiler";

describe("Lake Float32 triangulation & chunk normal integrity", () => {
  it("skips sub-Float32-ULP scanline bands so triangulateLakeBoundary never emits degenerate Float32 triangles", () => {
    const boundary = sampleLakeBoundary({
      schemaVersion: 1,
      waterLevel: 11.342404823303223,
      maxChordError: 0.025,
      maxSegmentLength: 50,
      queryCoverage: "boundary",
      rings: [
        [
          { position: [490, 504] },
          { position: [520, 504] },
          { position: [520, 506.49462890625] },
          { position: [520, 510] },
          { position: [490, 510] },
          { position: [490, 506.494643938023] },
          { position: [490, 506.494618744084] }
        ]
      ]
    });
    const triangles = triangulateLakeBoundary(boundary, 10000);
    expect(triangles.length).toBeGreaterThan(0);

    for (let i = 0; i < triangles.length; i += 9) {
      const ax = triangles[i]!,
        az = triangles[i + 2]!;
      const bx = triangles[i + 3]!,
        bz = triangles[i + 5]!;
      const cx = triangles[i + 6]!,
        cz = triangles[i + 8]!;
      const normalY = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
      expect(normalY).toBeGreaterThan(1e-8);
    }
  });

  it("drops degenerate render-surface triangles before deduplication so shared vertices never receive zero normals", () => {
    const grid = {
      originXZ: [490, 500] as const,
      cellSizeXZ: [1, 1] as const,
      width: 24,
      height: 24
    };
    const bedHeights = new Float32Array(grid.width * grid.height).fill(8);
    const waterLevel = 11.342404823303223;
    const boundary = {
      schemaVersion: 1 as const,
      waterLevel,
      maxChordError: 0.025,
      maxSegmentLength: 50,
      queryCoverage: "boundary" as const,
      rings: [
        [
          { position: [495, 504] as const },
          { position: [510, 504] as const },
          { position: [510, 506.49462890625] as const },
          { position: [510, 512] as const },
          { position: [495, 512] as const },
          { position: [495, 506.494643938023] as const },
          { position: [495, 506.494618744084] as const }
        ]
      ]
    };
    const lakeDescriptor = createLake({
      id: "lake:sub-ulp-test",
      grid,
      bedHeights,
      boundary,
      quality: WaterQualityTier.High,
      waveAsset: { schemaVersion: WaterWaveSchemaVersion.V1, model: WaterWaveModel.None },
      surfaceMotion: { waveStrength: 0, shoreDampingWidth: 1 },
      spatialField: { signedDistanceRange: 8 }
    });

    // Also verify compileHeightfieldWaterRenderSurfaceChunks directly against an injected degenerate triangle
    // preceding a valid triangle that shares its vertices (with lakeBoundary vertex deduplication enabled).
    const compiledFromLake = HeightfieldWaterCompiler.compile(lakeDescriptor);
    expect(compiledFromLake.valid, JSON.stringify(compiledFromLake.diagnostics)).toBe(true);
    for (const chunk of compiledFromLake.data!.chunks) {
      const normals = chunk.geometry.normals.borrowTypedArray();
      const tangents = chunk.geometry.tangents.borrowTypedArray();
      for (let v = 0; v < chunk.geometry.vertexCount; v++) {
        expect(Math.hypot(normals[v * 3]!, normals[v * 3 + 1]!, normals[v * 3 + 2]!)).toBeCloseTo(1, 5);
        expect(normals[v * 3 + 1]!).toBeCloseTo(1, 5);
        expect(Math.hypot(tangents[v * 4]!, tangents[v * 4 + 1]!, tangents[v * 4 + 2]!)).toBeCloseTo(1, 5);
      }
    }

    const injectedDegenerateFirst = new Float32Array([
      // Degenerate zero-area triangle sharing (495, y, 506.5) and (510, y, 506.5)
      495, waterLevel, 506.5, 510, waterLevel, 506.5, 510, waterLevel, 506.5,
      // Valid triangle immediately following on the same shared edge
      495, waterLevel, 506.5, 510, waterLevel, 510, 510, waterLevel, 506.5
    ]);
    const chunks = compileHeightfieldWaterRenderSurfaceChunks(
      {
        descriptor: {
          ...lakeDescriptor,
          renderSurface: {
            topology: "triangle-list",
            triangleVertices: injectedDegenerateFirst,
            coverage: "geometry"
          }
        },
        components: [{ index: 0 }]
      } as any,
      0
    );
    expect(chunks).toHaveLength(1);
    const chunk = chunks[0]!;
    expect(chunk.geometry.indexCount).toBe(3);
    const normals = chunk.geometry.normals.borrowTypedArray();
    const tangents = chunk.geometry.tangents.borrowTypedArray();
    for (let v = 0; v < chunk.geometry.vertexCount; v++) {
      expect(Math.hypot(normals[v * 3]!, normals[v * 3 + 1]!, normals[v * 3 + 2]!)).toBeCloseTo(1, 5);
      expect(normals[v * 3 + 1]!).toBeCloseTo(1, 5);
      expect(Math.hypot(tangents[v * 4]!, tangents[v * 4 + 1]!, tangents[v * 4 + 2]!)).toBeCloseTo(1, 5);
    }
  });
});
