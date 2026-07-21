import { Vector3 } from "@galacean/engine-math";
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
import { HeightfieldWaterSurfaceProvider } from "../../runtime/heightfield/HeightfieldWaterSurfaceProvider";
import {
  createHeightfieldWaterWaveSample,
  evaluateHeightfieldWaterWaves
} from "../../runtime/heightfield/HeightfieldWaterWaveEvaluator";
import {
  createWaterSurfaceBatchOutput,
  createWaterSurfaceQueryStatus,
  createWaterSurfaceSample,
  WaterSurfaceQueryFallback
} from "../../runtime/query/WaterSurfaceProvider";

describe("HeightfieldWaterSurfaceProvider", () => {
  it("inverts the normal-displaced macro surface and matches the CPU/GPU wave mirror", () => {
    const fixture = createHeightfieldWaterFixture(WaterQualityTier.Medium);
    const data = HeightfieldWaterCompiler.compile(fixture.descriptor).data!;
    const queryService = new HeightfieldWaterBaseQueryService(data);
    const elapsedTime = 3;
    const provider = new HeightfieldWaterSurfaceProvider({
      waterBodyId: data.sourceId,
      data,
      queryService,
      getElapsedTime: () => elapsedTime
    });
    const sourceIndex = Math.floor(fixture.descriptor.wetTexelIndices.length * 0.35);
    const texelIndex = fixture.descriptor.wetTexelIndices[sourceIndex];
    const column = texelIndex % fixture.descriptor.grid.width;
    const row = Math.floor(texelIndex / fixture.descriptor.grid.width);
    const restX = fixture.descriptor.grid.originXZ[0] + column * fixture.descriptor.grid.cellSizeXZ[0];
    const restZ = fixture.descriptor.grid.originXZ[1] + row * fixture.descriptor.grid.cellSizeXZ[1];
    const base = queryService.sampleBaseSurface(restX, restZ, createHeightfieldWaterBaseQueryResult());
    const rendered = evaluateHeightfieldWaterWaves(
      data.waveSet,
      base,
      restX,
      restZ,
      elapsedTime,
      data.material,
      true,
      createHeightfieldWaterWaveSample()
    );
    const sample = createWaterSurfaceSample();
    const status = createWaterSurfaceQueryStatus();

    expect(
      provider.sampleSurfaceWithStatus(new Vector3(rendered.displacedX, 0, rendered.displacedZ), sample, status)
    ).toBe(true);
    expect(sample.surfacePosition.y).toBeCloseTo(rendered.displacedY, 4);
    expect(sample.surfaceNormal.x).toBeCloseTo(rendered.normalX, 4);
    expect(sample.surfaceNormal.y).toBeCloseTo(rendered.normalY, 4);
    expect(sample.surfaceNormal.z).toBeCloseTo(rendered.normalZ, 4);
    expect(sample.waterVelocity.y).toBeCloseTo(rendered.displacementVelocityY, 4);
    expect(status.converged).toBe(true);
  });

  it("rejects dry holes and supports caller-owned batch storage", () => {
    const fixture = createHeightfieldWaterFixture(WaterQualityTier.Low);
    const data = HeightfieldWaterCompiler.compile(fixture.descriptor).data!;
    const provider = new HeightfieldWaterSurfaceProvider({
      waterBodyId: data.sourceId,
      data,
      queryService: new HeightfieldWaterBaseQueryService(data),
      getElapsedTime: () => 0
    });
    const [islandX, islandZ] = HEIGHTFIELD_FIXTURE_LANDMARKS.islandCenter;
    const batch = createWaterSurfaceBatchOutput(2);

    expect(provider.sampleSurfaceBatch(new Float32Array([islandX, 0, islandZ, -23, 0, 0]), batch)).toBe(2);
    expect(batch.hits[0]).toBe(0);
    expect(batch.capabilityFallbacks[0]).toBe(WaterSurfaceQueryFallback.OutsideFootprint);
    expect(batch.hits[1]).toBe(1);
    expect(batch.waterBodyIds[1]).toBe(data.sourceId);
  });
});
