import { describe, expect, it } from "vitest";
import { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";
import { HeightfieldWaterCompiler } from "../../compiler/heightfield/HeightfieldWaterCompiler";
import {
  HEIGHTFIELD_FIXTURE_LANDMARKS,
  createHeightfieldWaterFixture
} from "../../demo/heightfield/heightfieldFixture";
import {
  HeightfieldWaterBaseQueryService,
  createHeightfieldWaterBaseQueryResult
} from "../../runtime/heightfield/HeightfieldWaterQueryService";

describe("HeightfieldWaterBaseQueryService", () => {
  it("samples exact source-centre base height, depth, flow, and an upward curved normal", () => {
    const fixture = createHeightfieldWaterFixture(WaterQualityTier.Medium);
    const data = HeightfieldWaterCompiler.compile(fixture.descriptor).data!;
    const service = new HeightfieldWaterBaseQueryService(data);
    const sampleIndex = Math.floor(fixture.descriptor.wetTexelIndices.length * 0.35);
    const texelIndex = fixture.descriptor.wetTexelIndices[sampleIndex];
    const x = texelIndex % fixture.descriptor.grid.width;
    const z = Math.floor(texelIndex / fixture.descriptor.grid.width);
    const worldX = fixture.descriptor.grid.originXZ[0] + x * fixture.descriptor.grid.cellSizeXZ[0];
    const worldZ = fixture.descriptor.grid.originXZ[1] + z * fixture.descriptor.grid.cellSizeXZ[1];
    const out = createHeightfieldWaterBaseQueryResult();

    expect(service.sampleBaseSurface(worldX, worldZ, out)).toBe(out);
    expect(out.inside).toBe(true);
    expect(out.componentIndex).toBeGreaterThanOrEqual(0);
    expect(out.surfaceHeight).toBeCloseTo(fixture.descriptor.surfaceHeights[sampleIndex], 5);
    expect(out.depth).toBeCloseTo(
      fixture.descriptor.surfaceHeights[sampleIndex] - fixture.descriptor.bedHeights![sampleIndex],
      5
    );
    expect(out.flowVectorXZ[0]).toBeCloseTo(fixture.descriptor.flowVectorsXZ![sampleIndex * 2], 5);
    expect(out.flowVectorXZ[1]).toBeCloseTo(fixture.descriptor.flowVectorsXZ![sampleIndex * 2 + 1], 5);
    expect(out.surfaceNormal[1]).toBeGreaterThan(0.95);
    expect(Math.hypot(...out.surfaceNormal)).toBeCloseTo(1, 6);
    expect(out.signedShoreDistance).toBeGreaterThan(0);
  });

  it("reports the island hole and out-of-grid points without leaking the previous result", () => {
    const fixture = createHeightfieldWaterFixture(WaterQualityTier.Low);
    const data = HeightfieldWaterCompiler.compile(fixture.descriptor).data!;
    const service = new HeightfieldWaterBaseQueryService(data);
    const out = createHeightfieldWaterBaseQueryResult();
    const [islandX, islandZ] = HEIGHTFIELD_FIXTURE_LANDMARKS.islandCenter;

    service.sampleBaseSurface(islandX, islandZ, out);
    expect(out.inside).toBe(false);
    expect(out.componentIndex).toBe(-1);
    expect(Number.isNaN(out.surfaceHeight)).toBe(true);
    expect(out.signedShoreDistance).toBeLessThan(0);

    service.sampleBaseSurface(Number.NaN, 0, out);
    expect(out.inside).toBe(false);
    expect(out.surfaceNormal).toEqual([0, 1, 0]);
    expect(out.flowVectorXZ).toEqual([0, 0]);
  });
});
