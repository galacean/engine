import { describe, expect, it } from "vitest";
import { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";
import { WaterWaveModel } from "../../authoring/wave/enums/WaterWaveModel";
import { HeightfieldWaterCompiler } from "../../compiler/heightfield/HeightfieldWaterCompiler";
import {
  HEIGHTFIELD_FIXTURE_LANDMARKS,
  HEIGHTFIELD_FIXTURE_SIZE,
  createHeightfieldWaterFixture
} from "../../demo/heightfield/heightfieldFixture";
import {
  createHeightfieldBedGeometry,
  createHeightfieldBedTexturePixels
} from "../../demo/heightfield/HeightfieldBedController";

function countFourConnectedComponents(width: number, height: number, wetIndices: Uint32Array): number {
  const wet = new Uint8Array(width * height);
  wetIndices.forEach((index) => (wet[index] = 1));
  const visited = new Uint8Array(wet.length);
  const queue = new Uint32Array(wet.length);
  let componentCount = 0;
  for (const start of wetIndices) {
    if (visited[start] === 1) continue;
    componentCount++;
    let queueStart = 0;
    let queueEnd = 0;
    queue[queueEnd++] = start;
    visited[start] = 1;
    while (queueStart < queueEnd) {
      const current = queue[queueStart++];
      const column = current % width;
      const neighbours = [
        column > 0 ? current - 1 : -1,
        column + 1 < width ? current + 1 : -1,
        current >= width ? current - width : -1,
        current + width < wet.length ? current + width : -1
      ];
      for (const neighbour of neighbours) {
        if (neighbour < 0 || wet[neighbour] === 0 || visited[neighbour] === 1) continue;
        visited[neighbour] = 1;
        queue[queueEnd++] = neighbour;
      }
    }
  }
  return componentCount;
}

function findSampleIndexAtWorldPosition(
  x: number,
  z: number,
  wetIndices: Uint32Array,
  originXZ: readonly [number, number]
): number {
  const column = Math.round(x - originXZ[0]);
  const row = Math.round(z - originXZ[1]);
  const texelIndex = row * HEIGHTFIELD_FIXTURE_SIZE.width + column;
  return wetIndices.findIndex((index) => index === texelIndex);
}

describe("standalone heightfield-water fixture", () => {
  it("contains a curved S body, an island hole, and one disconnected still pond", () => {
    const { descriptor, stats } = createHeightfieldWaterFixture();
    const { width, height } = descriptor.grid;

    expect(width).toBe(192);
    expect(height).toBe(128);
    expect(countFourConnectedComponents(width, height, descriptor.wetTexelIndices)).toBe(2);
    expect(stats.mainBodyTexelCount).toBeGreaterThan(1800);
    expect(stats.pondTexelCount).toBeGreaterThan(400);
    expect(stats.islandDryTexelCount).toBeGreaterThan(60);
    expect(stats.flowingTexelCount).toBe(stats.mainBodyTexelCount);
    expect(stats.stillTexelCount).toBe(stats.pondTexelCount);

    const islandSample = findSampleIndexAtWorldPosition(
      HEIGHTFIELD_FIXTURE_LANDMARKS.islandCenter[0],
      HEIGHTFIELD_FIXTURE_LANDMARKS.islandCenter[1],
      descriptor.wetTexelIndices,
      descriptor.grid.originXZ
    );
    expect(islandSample).toBe(-1);
  });

  it("splits the upstream current around both sides of the island", () => {
    const { descriptor } = createHeightfieldWaterFixture();
    const sampleFlow = (x: number, z: number): readonly [number, number] => {
      const sampleIndex = findSampleIndexAtWorldPosition(x, z, descriptor.wetTexelIndices, descriptor.grid.originXZ);
      expect(sampleIndex).toBeGreaterThanOrEqual(0);
      return [descriptor.flowVectorsXZ?.[sampleIndex * 2] ?? 0, descriptor.flowVectorsXZ?.[sampleIndex * 2 + 1] ?? 0];
    };
    const leftBranch = sampleFlow(-10, 16);
    const rightBranch = sampleFlow(-6, 16);

    expect(leftBranch[0]).toBeLessThan(-0.25);
    expect(rightBranch[0]).toBeGreaterThan(0.25);
    expect(leftBranch[1]).toBeLessThan(0);
    expect(rightBranch[1]).toBeLessThan(0);
  });

  it.each([WaterQualityTier.Low, WaterQualityTier.Medium, WaterQualityTier.High])(
    "builds deterministic, valid typed arrays for %s",
    (quality) => {
      const first = createHeightfieldWaterFixture(quality);
      const second = createHeightfieldWaterFixture(quality);
      const { descriptor, stats } = first;

      expect(descriptor.quality).toBe(quality);
      expect(Array.from(descriptor.wetTexelIndices)).toEqual(Array.from(second.descriptor.wetTexelIndices));
      expect(Array.from(descriptor.surfaceHeights)).toEqual(Array.from(second.descriptor.surfaceHeights));
      expect(Array.from(descriptor.bedHeights ?? [])).toEqual(Array.from(second.descriptor.bedHeights ?? []));
      expect(descriptor.surfaceHeights).toHaveLength(descriptor.wetTexelIndices.length);
      expect(descriptor.bedHeights).toHaveLength(descriptor.wetTexelIndices.length);
      expect(descriptor.flowVectorsXZ).toHaveLength(descriptor.wetTexelIndices.length * 2);
      expect(descriptor.wetTexelIndices.every((value, index, values) => index === 0 || value > values[index - 1])).toBe(
        true
      );
      expect(stats.maxSurfaceHeight - stats.minSurfaceHeight).toBeGreaterThan(2);
      expect(stats.minBedDepth).toBeGreaterThan(0.3);
      expect(stats.maxBedDepth).toBeGreaterThan(2.5);
      expect(descriptor.material.shallowColor[1]).toBeLessThan(0.4);
      expect(descriptor.material.opacity).toBeLessThan(0.82);
      expect(descriptor.material.microNormalStrength).toBeGreaterThan(0.8);
      expect(descriptor.material.shoreFoamWidth).toBeLessThan(1);
      expect(descriptor.material.waveStrength).toBeLessThan(0.4);
      expect(descriptor.waveAsset.model).toBe(WaterWaveModel.DirectionalGerstner);
      if (descriptor.waveAsset.model !== WaterWaveModel.DirectionalGerstner)
        throw new Error("Expected Gerstner waves.");
      expect(descriptor.waveAsset.generator.maxWavelength).toBeLessThan(10);
      expect(descriptor.waveAsset.generator.maxAmplitude).toBeLessThan(0.15);
    }
  );

  it("keeps adjacent main-body heights continuous while remaining visibly non-planar", () => {
    const { descriptor } = createHeightfieldWaterFixture();
    const sampleByTexel = new Map<number, number>();
    descriptor.wetTexelIndices.forEach((texelIndex, sampleIndex) => sampleByTexel.set(texelIndex, sampleIndex));
    let adjacentPairCount = 0;
    let maxAdjacentDelta = 0;
    for (let sampleIndex = 0; sampleIndex < descriptor.wetTexelIndices.length; sampleIndex++) {
      const texelIndex = descriptor.wetTexelIndices[sampleIndex];
      for (const neighbour of [texelIndex + 1, texelIndex + descriptor.grid.width]) {
        const neighbourSample = sampleByTexel.get(neighbour);
        if (neighbourSample === undefined) continue;
        const flowA = Math.hypot(
          descriptor.flowVectorsXZ?.[sampleIndex * 2] ?? 0,
          descriptor.flowVectorsXZ?.[sampleIndex * 2 + 1] ?? 0
        );
        const flowB = Math.hypot(
          descriptor.flowVectorsXZ?.[neighbourSample * 2] ?? 0,
          descriptor.flowVectorsXZ?.[neighbourSample * 2 + 1] ?? 0
        );
        if (flowA === 0 || flowB === 0) continue;
        maxAdjacentDelta = Math.max(
          maxAdjacentDelta,
          Math.abs(descriptor.surfaceHeights[sampleIndex] - descriptor.surfaceHeights[neighbourSample])
        );
        adjacentPairCount++;
      }
    }
    expect(adjacentPairCount).toBeGreaterThan(3000);
    expect(maxAdjacentDelta).toBeLessThan(0.09);
  });

  it.each([
    [WaterQualityTier.Low, 4_000, 2],
    [WaterQualityTier.Medium, 16_000, 6],
    [WaterQualityTier.High, 60_000, 12]
  ] as const)("compiles the %s fixture within its visual-demo budget", (quality, vertexBudget, waveCount) => {
    const result = HeightfieldWaterCompiler.compile(createHeightfieldWaterFixture(quality).descriptor);
    expect(result.valid, result.diagnostics.map((diagnostic) => diagnostic.message).join("\n")).toBe(true);
    expect(result.data?.components).toHaveLength(2);
    expect(result.data?.stats.vertexCount).toBeLessThanOrEqual(vertexBudget);
    expect(result.data?.stats.chunkCount).toBeLessThanOrEqual(8);
    expect(result.data?.waveSet.activeWaveCount).toBe(waveCount);
    expect(result.data?.localMapAtlas.width).toBeLessThanOrEqual(quality === WaterQualityTier.Low ? 128 : 192);
    expect(result.data?.localMapAtlas.height).toBeLessThanOrEqual(128);
    const atlasPixels = result.data?.localMapAtlas.pixels.toTypedArray() ?? new Uint8Array();
    const signedDistanceChannels: number[] = [];
    for (let offset = 3; offset < atlasPixels.length; offset += 4) signedDistanceChannels.push(atlasPixels[offset]);
    expect(Math.min(...signedDistanceChannels)).toBeLessThan(96);
    expect(Math.max(...signedDistanceChannels)).toBeGreaterThan(160);
  });
});

describe("heightfield demo bed", () => {
  it("uses authored bed heights and raises dry banks including the island", () => {
    const { descriptor } = createHeightfieldWaterFixture();
    const geometry = createHeightfieldBedGeometry(descriptor);
    const vertexWidth = descriptor.grid.width + 1;
    const firstX = descriptor.grid.originXZ[0] - 0.5;
    const firstZ = descriptor.grid.originXZ[1] - 0.5;
    const sampleHeight = (x: number, z: number): number => {
      const column = Math.round(x - firstX);
      const row = Math.round(z - firstZ);
      return geometry.positions[row * vertexWidth + column][1];
    };

    expect(geometry.positions).toHaveLength((descriptor.grid.width + 1) * (descriptor.grid.height + 1));
    expect(geometry.normals).toHaveLength(geometry.positions.length);
    expect(geometry.uvs).toHaveLength(geometry.positions.length);
    expect(geometry.indices).toHaveLength(descriptor.grid.width * descriptor.grid.height * 6);
    let maximumIndex = 0;
    for (const index of geometry.indices) maximumIndex = Math.max(maximumIndex, index);
    expect(maximumIndex).toBeLessThan(geometry.positions.length);
    expect(sampleHeight(-8, 8)).toBeGreaterThan(6);
    expect(sampleHeight(58, -24)).toBeLessThan(6);
  });

  it("creates a deterministic natural sediment texture", () => {
    const first = createHeightfieldBedTexturePixels();
    const second = createHeightfieldBedTexturePixels();
    const colors = new Set<string>();
    for (let offset = 0; offset < first.length; offset += 4) {
      colors.add(`${first[offset]},${first[offset + 1]},${first[offset + 2]}`);
      expect(first[offset + 3]).toBe(255);
    }
    expect(first).toEqual(second);
    expect(colors.size).toBeGreaterThan(24);
  });
});
