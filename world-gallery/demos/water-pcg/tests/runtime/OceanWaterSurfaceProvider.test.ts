import { Vector3 } from "@galacean/engine-math";
import { describe, expect, it } from "vitest";
import { WaterQueryAccuracy } from "../../authoring/wave/enums/WaterQueryAccuracy";
import { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";
import { compileWaterWaveAsset } from "../../compiler/wave/WaterWaveCompiler";
import { OceanWaterSurfaceProvider } from "../../runtime/ocean/OceanWaterSurfaceProvider";
import {
  createWaterSurfaceBatchOutput,
  createWaterSurfaceQueryStatus,
  createWaterSurfaceSample,
  WaterSurfaceQueryFallback
} from "../../runtime/query/WaterSurfaceProvider";
import { createWaterWaveSampleOutput, evaluateGerstnerWaveSet } from "../../runtime/wave/GerstnerWaveEvaluator";
import { directionalWaterWaveFixture } from "../fixtures/waterWaveFixtures";

describe("OceanWaterSurfaceProvider", () => {
  it("matches the rendered Gerstner surface and velocity at fixed time", () => {
    const waveSet = compileWaterWaveAsset(directionalWaterWaveFixture, WaterQualityTier.Medium);
    const time = 3;
    const timeScale = 0.82;
    const provider = new OceanWaterSurfaceProvider({
      waterBodyId: "test-ocean",
      waveSet,
      size: 90,
      waterLevel: 1.25,
      timeScale,
      getElapsedTime: () => time
    });
    const rendered = createWaterWaveSampleOutput();
    evaluateGerstnerWaveSet(waveSet, 4.25, 1.25, -8.75, time, timeScale, WaterQueryAccuracy.Precise, rendered);
    const sample = createWaterSurfaceSample();
    const status = createWaterSurfaceQueryStatus();

    expect(
      provider.sampleSurfaceWithStatus(new Vector3(rendered.displacedX, 0, rendered.displacedZ), sample, status)
    ).toBe(true);
    expect(sample.waterBodyId).toBe("test-ocean");
    expect(sample.surfacePosition.y).toBeCloseTo(rendered.displacedY, 5);
    expect(sample.surfaceNormal.x).toBeCloseTo(rendered.normalX, 5);
    expect(sample.surfaceNormal.y).toBeCloseTo(rendered.normalY, 5);
    expect(sample.surfaceNormal.z).toBeCloseTo(rendered.normalZ, 5);
    expect(sample.waterVelocity.x).toBeCloseTo(rendered.horizontalVelocityX, 5);
    expect(sample.waterVelocity.y).toBeCloseTo(rendered.verticalVelocity, 5);
    expect(sample.waterVelocity.z).toBeCloseTo(rendered.horizontalVelocityZ, 5);
    expect(sample.waterDepth).toBe(Number.POSITIVE_INFINITY);
    expect(status.converged).toBe(true);
  });

  it("rejects outside points and writes a reusable batch", () => {
    const waveSet = compileWaterWaveAsset(directionalWaterWaveFixture, WaterQualityTier.Low);
    const provider = new OceanWaterSurfaceProvider({
      waterBodyId: "bounded-ocean",
      waveSet,
      size: 20,
      waterLevel: 0,
      timeScale: 1,
      getElapsedTime: () => 0
    });
    const batch = createWaterSurfaceBatchOutput(2);

    expect(provider.sampleSurfaceBatch(new Float32Array([0, 0, 0, 100, 0, 100]), batch)).toBe(2);
    expect(Array.from(batch.hits)).toEqual([1, 0]);
    expect(batch.waterBodyIds[0]).toBe("bounded-ocean");
    expect(batch.capabilityFallbacks[1]).toBe(WaterSurfaceQueryFallback.OutsideFootprint);
  });

  it("samples world-space waves outside the old preview footprint for camera-relative rings", () => {
    const waveSet = compileWaterWaveAsset(directionalWaterWaveFixture, WaterQualityTier.Medium);
    const provider = new OceanWaterSurfaceProvider({
      waterBodyId: "unbounded-ocean",
      waveSet,
      size: 20,
      waterLevel: 0,
      timeScale: 1,
      unbounded: true,
      getElapsedTime: () => 2
    });
    const sample = createWaterSurfaceSample();

    expect(provider.horizontalExtent).toBe(Number.POSITIVE_INFINITY);
    expect(provider.sampleSurface(new Vector3(10_000, 0, -8_000), sample)).toBe(true);
    expect(sample.waterBodyId).toBe("unbounded-ocean");
  });
});
