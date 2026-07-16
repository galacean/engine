import { describe, expect, it } from "vitest";
import { WaterQueryAccuracy } from "../../authoring/wave/enums/WaterQueryAccuracy";
import { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";
import { WaterWaveModel } from "../../authoring/wave/enums/WaterWaveModel";
import { WaterWaveSchemaVersion } from "../../authoring/wave/enums/WaterWaveSchemaVersion";
import { compileWaterWaveAsset } from "../../compiler/wave/WaterWaveCompiler";
import type { CompiledWaterWaveSet } from "../../compiler/wave/types/CompiledWaterWaveTypes";
import { createWaterWaveSampleOutput, evaluateGerstnerWaveSet } from "../../runtime/wave/GerstnerWaveEvaluator";
import type { WaterWaveSampleOutput } from "../../runtime/wave/types/WaterWaveRuntimeTypes";
import { directionalWaterWaveFixture } from "../fixtures/waterWaveFixtures";

const REFERENCE_STEP = 0.0001;

function evaluatePosition(
  waveSet: CompiledWaterWaveSet,
  x: number,
  z: number,
  time: number,
  out: WaterWaveSampleOutput
): WaterWaveSampleOutput {
  return evaluateGerstnerWaveSet(waveSet, x, 0, z, time, 1, WaterQueryAccuracy.Precise, out);
}

describe("GerstnerWaveEvaluator rest-space evaluation", () => {
  it("returns the caller-owned output and handles None and non-finite inputs", () => {
    const none = compileWaterWaveAsset(
      { schemaVersion: WaterWaveSchemaVersion.V1, model: WaterWaveModel.None },
      WaterQualityTier.Low
    );
    const output = createWaterWaveSampleOutput();
    const returned = evaluateGerstnerWaveSet(
      none,
      Number.NaN,
      2,
      Number.POSITIVE_INFINITY,
      Number.NaN,
      Number.NaN,
      WaterQueryAccuracy.Precise,
      output
    );

    expect(returned).toBe(output);
    expect(output).toEqual({
      displacedX: 0,
      displacedY: 2,
      displacedZ: 0,
      normalX: 0,
      normalY: 1,
      normalZ: 0,
      verticalVelocity: 0
    });
  });

  it("is deterministic at fixed rest coordinates and t=0/3/10", () => {
    const compiled = compileWaterWaveAsset(directionalWaterWaveFixture, WaterQualityTier.High);
    for (const time of [0, 3, 10]) {
      const first = createWaterWaveSampleOutput();
      const second = createWaterWaveSampleOutput();
      evaluateGerstnerWaveSet(compiled, 4.25, 1.5, -8.75, time, 0.82, WaterQueryAccuracy.Precise, first);
      evaluateGerstnerWaveSet(compiled, 4.25, 1.5, -8.75, time, 0.82, WaterQueryAccuracy.Precise, second);
      expect(second).toEqual(first);
      expect(Object.values(first).every(Number.isFinite)).toBe(true);
      expect(Math.hypot(first.normalX, first.normalY, first.normalZ)).toBeCloseTo(1, 10);
    }
  });

  it("matches a finite-difference normal within 0.5 degrees", () => {
    const compiled = compileWaterWaveAsset(directionalWaterWaveFixture, WaterQualityTier.High);
    const center = createWaterWaveSampleOutput();
    const xNegative = createWaterWaveSampleOutput();
    const xPositive = createWaterWaveSampleOutput();
    const zNegative = createWaterWaveSampleOutput();
    const zPositive = createWaterWaveSampleOutput();
    evaluatePosition(compiled, 3.7, -5.2, 3, center);
    evaluatePosition(compiled, 3.7 - REFERENCE_STEP, -5.2, 3, xNegative);
    evaluatePosition(compiled, 3.7 + REFERENCE_STEP, -5.2, 3, xPositive);
    evaluatePosition(compiled, 3.7, -5.2 - REFERENCE_STEP, 3, zNegative);
    evaluatePosition(compiled, 3.7, -5.2 + REFERENCE_STEP, 3, zPositive);
    const dxX = xPositive.displacedX - xNegative.displacedX;
    const dxY = xPositive.displacedY - xNegative.displacedY;
    const dxZ = xPositive.displacedZ - xNegative.displacedZ;
    const dzX = zPositive.displacedX - zNegative.displacedX;
    const dzY = zPositive.displacedY - zNegative.displacedY;
    const dzZ = zPositive.displacedZ - zNegative.displacedZ;
    let normalX = dzY * dxZ - dzZ * dxY;
    let normalY = dzZ * dxX - dzX * dxZ;
    let normalZ = dzX * dxY - dzY * dxX;
    const length = Math.hypot(normalX, normalY, normalZ);
    normalX /= length;
    normalY /= length;
    normalZ /= length;
    const dot = Math.min(
      1,
      Math.max(-1, center.normalX * normalX + center.normalY * normalY + center.normalZ * normalZ)
    );
    const angleDegrees = (Math.acos(dot) * 180) / Math.PI;

    expect(angleDegrees).toBeLessThanOrEqual(0.5);
  });

  it("uses the leading two compiled waves for Fast and all waves for Precise", () => {
    const high = compileWaterWaveAsset(directionalWaterWaveFixture, WaterQualityTier.High);
    const firstTwo: CompiledWaterWaveSet = {
      ...high,
      activeWaveCount: 2,
      waves: high.waves.slice(0, 2)
    };
    const fast = createWaterWaveSampleOutput();
    const twoWavePrecise = createWaterWaveSampleOutput();
    const precise = createWaterWaveSampleOutput();
    evaluateGerstnerWaveSet(high, -2.4, 0, 7.1, 4.2, 1, WaterQueryAccuracy.Fast, fast);
    evaluateGerstnerWaveSet(firstTwo, -2.4, 0, 7.1, 4.2, 1, WaterQueryAccuracy.Precise, twoWavePrecise);
    evaluateGerstnerWaveSet(high, -2.4, 0, 7.1, 4.2, 1, WaterQueryAccuracy.Precise, precise);

    expect(fast).toEqual(twoWavePrecise);
    expect(precise).not.toEqual(fast);
  });

  it("computes vertical velocity as the derivative of displaced Y", () => {
    const compiled = compileWaterWaveAsset(directionalWaterWaveFixture, WaterQualityTier.Medium);
    const center = createWaterWaveSampleOutput();
    const before = createWaterWaveSampleOutput();
    const after = createWaterWaveSampleOutput();
    const time = 2.75;
    const timeStep = REFERENCE_STEP;
    evaluateGerstnerWaveSet(compiled, 1.2, 0, -3.4, time, 0.7, WaterQueryAccuracy.Precise, center);
    evaluateGerstnerWaveSet(compiled, 1.2, 0, -3.4, time - timeStep, 0.7, WaterQueryAccuracy.Precise, before);
    evaluateGerstnerWaveSet(compiled, 1.2, 0, -3.4, time + timeStep, 0.7, WaterQueryAccuracy.Precise, after);
    const finiteDifferenceVelocity = (after.displacedY - before.displacedY) / (timeStep * 2);

    expect(center.verticalVelocity).toBeCloseTo(finiteDifferenceVelocity, 5);
  });
});
