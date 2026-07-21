import { describe, expect, it } from "vitest";
import { WaterQueryAccuracy } from "../../authoring/wave/enums/WaterQueryAccuracy";
import { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";
import { compileWaterWaveAsset } from "../../compiler/wave/WaterWaveCompiler";
import {
  createGerstnerInverseQueryResult,
  solveGerstnerSurfaceAtWorldXZ
} from "../../runtime/query/GerstnerInverseSurfaceQuery";
import { createWaterSurfaceQueryStatus, WaterSurfaceQueryFallback } from "../../runtime/query/WaterSurfaceProvider";
import { createWaterWaveSampleOutput, evaluateGerstnerWaveSet } from "../../runtime/wave/GerstnerWaveEvaluator";
import { directionalWaterWaveFixture } from "../fixtures/waterWaveFixtures";

describe("GerstnerInverseSurfaceQuery", () => {
  it("recovers rest coordinates from the visible displaced XZ surface", () => {
    const waveSet = compileWaterWaveAsset(directionalWaterWaveFixture, WaterQualityTier.High);
    const rendered = createWaterWaveSampleOutput();
    const solved = createWaterWaveSampleOutput();
    const inverse = createGerstnerInverseQueryResult();
    const status = createWaterSurfaceQueryStatus();

    for (const [restX, restZ, time] of [
      [0, 0, 0],
      [4.25, -8.75, 3],
      [-12.5, 9.2, 10]
    ] as const) {
      evaluateGerstnerWaveSet(waveSet, restX, 1.25, restZ, time, 0.82, WaterQueryAccuracy.Precise, rendered);
      expect(
        solveGerstnerSurfaceAtWorldXZ(
          waveSet,
          rendered.displacedX,
          1.25,
          rendered.displacedZ,
          time,
          0.82,
          WaterQueryAccuracy.Precise,
          solved,
          inverse,
          status
        )
      ).toBe(true);
      expect(inverse.restX).toBeCloseTo(restX, 5);
      expect(inverse.restZ).toBeCloseTo(restZ, 5);
      expect(solved.displacedY).toBeCloseTo(rendered.displacedY, 6);
      expect(status.horizontalError).toBeLessThanOrEqual(0.00001);
      expect(status.iterations).toBeLessThanOrEqual(8);
    }
  });

  it("reports invalid coordinates as explicit non-convergence", () => {
    const waveSet = compileWaterWaveAsset(directionalWaterWaveFixture, WaterQualityTier.Low);
    const status = createWaterSurfaceQueryStatus();
    const solved = solveGerstnerSurfaceAtWorldXZ(
      waveSet,
      Number.NaN,
      0,
      0,
      0,
      1,
      WaterQueryAccuracy.Fast,
      createWaterWaveSampleOutput(),
      createGerstnerInverseQueryResult(),
      status
    );

    expect(solved).toBe(false);
    expect(status.converged).toBe(false);
    expect(status.capabilityFallback).toBe(WaterSurfaceQueryFallback.NonConverged);
  });
});
