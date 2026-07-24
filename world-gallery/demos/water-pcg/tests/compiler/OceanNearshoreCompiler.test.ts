import { describe, expect, it } from "vitest";
import { OceanNearshoreCompiler } from "../../compiler/ocean/OceanNearshoreCompiler";
import type { OceanNearshoreCompiledData } from "../../compiler/ocean/OceanNearshoreCompiledTypes";
import { createOceanNearshoreFixture } from "../fixtures/oceanNearshoreFixture";

function compileFixture(): OceanNearshoreCompiledData {
  const result = OceanNearshoreCompiler.compile(createOceanNearshoreFixture());
  if (!result.valid || !result.data) {
    throw new Error(`Fixture failed: ${JSON.stringify(result.diagnostics)}`);
  }
  return result.data;
}

function decodeSigned(channel: number, scale: number): number {
  return ((channel - 128) / 127) * scale;
}

describe("OceanNearshoreCompiler", () => {
  it("produces byte-for-byte deterministic immutable CPU and GPU resources", () => {
    const first = compileFixture();
    const second = compileFixture();

    expect(first.sourceHash).toBe(second.sourceHash);
    expect(first.stats).toEqual(second.stats);
    expect(first.stats).toMatchObject({
      texelCount: 25,
      wetTexelCount: 15,
      dryTexelCount: 10,
      obstacleCount: 1,
      atlasByteLength: 100,
      maximumDepth: 4
    });
    expect(first.queryGrid.wetMask.toTypedArray()).toEqual(
      second.queryGrid.wetMask.toTypedArray()
    );
    expect(first.queryGrid.bedHeights.toTypedArray()).toEqual(
      second.queryGrid.bedHeights.toTypedArray()
    );
    expect(first.queryGrid.shoreDistances.toTypedArray()).toEqual(
      second.queryGrid.shoreDistances.toTypedArray()
    );
    expect(first.staticAtlas.pixels.toTypedArray()).toEqual(
      second.staticAtlas.pixels.toTypedArray()
    );
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.obstacles)).toBe(true);
  });

  it("keeps compiler buffers immutable through defensive copies", () => {
    const data = compileFixture();
    const pixels = data.staticAtlas.pixels.toTypedArray();
    const bed = data.queryGrid.bedHeights.toTypedArray();
    pixels.fill(0);
    bed.fill(999);

    expect(data.staticAtlas.pixels.at(0)).not.toBe(0);
    expect(data.queryGrid.bedHeights.at(0)).toBeCloseTo(-3.9);
  });

  it("keeps fixed CPU probes within the declared 8-bit atlas decode error", () => {
    const data = compileFixture();
    const pixels = data.staticAtlas.pixels.toTypedArray();
    const depths = data.queryGrid.waterDepths.toTypedArray();
    const distances = data.queryGrid.shoreDistances.toTypedArray();
    const currents = data.queryGrid.baseCurrentsXZ.toTypedArray();
    const atlas = data.staticAtlas;
    const currentTolerance = atlas.currentDecodeScale / 127 + 1e-6;
    const depthTolerance = atlas.maximumDepth / 255 + 1e-6;
    const distanceTolerance = atlas.shoreDistanceRange / 127 + 1e-6;

    for (const index of [0, 2, 7, 12, 17, 24]) {
      const offset = index * 4;
      expect(
        Math.abs(
          decodeSigned(pixels[offset], atlas.currentDecodeScale) -
            currents[index * 2]
        )
      ).toBeLessThanOrEqual(currentTolerance);
      expect(
        Math.abs(
          decodeSigned(pixels[offset + 1], atlas.currentDecodeScale) -
            currents[index * 2 + 1]
        )
      ).toBeLessThanOrEqual(currentTolerance);
      expect(
        Math.abs((pixels[offset + 2] / 255) * atlas.maximumDepth - depths[index])
      ).toBeLessThanOrEqual(depthTolerance);
      expect(
        Math.abs(
          decodeSigned(pixels[offset + 3], atlas.shoreDistanceRange) -
            distances[index]
        )
      ).toBeLessThanOrEqual(distanceTolerance);
      expect(pixels[offset + 3] > 128).toBe(distances[index] > 0);
    }
  });

  it("compiles shore normals toward dry land and exact texture transforms", () => {
    const data = compileFixture();
    const normals = data.queryGrid.shoreNormalsXZ.toTypedArray();
    const centerWetIndex = 2 * data.grid.width + 2;
    expect(normals[centerWetIndex * 2]).toBeCloseTo(0, 5);
    expect(normals[centerWetIndex * 2 + 1]).toBeGreaterThan(0.9);

    const transform = data.staticAtlas.worldToUv;
    expect(data.grid.originXZ[0] * transform[0] + transform[2]).toBeCloseTo(
      0.5 / data.grid.width
    );
    expect(data.grid.originXZ[1] * transform[1] + transform[3]).toBeCloseTo(
      0.5 / data.grid.height
    );
  });

  it("changes the source hash for any authored bed/current/policy fact", () => {
    const baseline = compileFixture().sourceHash;
    const bed = createOceanNearshoreFixture();
    bed.bedHeights[0] += 0.125;
    const current = createOceanNearshoreFixture();
    current.baseCurrentsXZ![0] += 0.125;
    const policy = createOceanNearshoreFixture();
    const changedPolicy = {
      ...policy,
      outsidePolicy: {
        ...policy.outsidePolicy,
        negativeX: policy.outsidePolicy.positiveZ
      }
    };

    expect(OceanNearshoreCompiler.compile(bed).data?.sourceHash).not.toBe(baseline);
    expect(OceanNearshoreCompiler.compile(current).data?.sourceHash).not.toBe(
      baseline
    );
    expect(OceanNearshoreCompiler.compile(changedPolicy).data?.sourceHash).not.toBe(
      baseline
    );
  });
});
