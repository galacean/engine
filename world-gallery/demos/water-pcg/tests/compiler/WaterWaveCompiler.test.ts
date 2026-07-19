import { describe, expect, it } from "vitest";
import {
  WATER_WAVE_MAX_HORIZONTAL_AMPLITUDE_RATIO,
  WATER_WAVE_PACKED_FLOATS_PER_WAVE,
  WATER_WAVE_PACKED_OFFSET
} from "../../authoring/wave/constants/WaterWaveLimits";
import { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";
import { WaterWaveDiagnosticCode } from "../../authoring/wave/enums/WaterWaveDiagnostic";
import { WaterWaveModel } from "../../authoring/wave/enums/WaterWaveModel";
import { WaterWaveSchemaVersion } from "../../authoring/wave/enums/WaterWaveSchemaVersion";
import { compileWaterWaveAsset, WaterWaveCompilationError } from "../../compiler/wave/WaterWaveCompiler";
import { directionalWaterWaveFixture } from "../fixtures/waterWaveFixtures";

describe("WaterWaveCompiler", () => {
  it("is byte-, hash-, wave-, and bounds-deterministic across 100 compiles", () => {
    const expected = compileWaterWaveAsset(directionalWaterWaveFixture, WaterQualityTier.High);
    const expectedBytes = expected.packedShaderData.toTypedArray();
    for (let iteration = 0; iteration < 100; iteration++) {
      const current = compileWaterWaveAsset(directionalWaterWaveFixture, WaterQualityTier.High);
      expect(current.sourceHash).toBe(expected.sourceHash);
      expect(current.waves).toEqual(expected.waves);
      expect(current.packedShaderData.toTypedArray()).toEqual(expectedBytes);
      expect(current.maxVerticalDisplacement).toBe(expected.maxVerticalDisplacement);
      expect(current.maxHorizontalDisplacement).toBe(expected.maxHorizontalDisplacement);
    }
  });

  it("selects fixed Low, Medium, and High budgets and packs two vec4 values per wave", () => {
    const expectedCounts: Readonly<Record<WaterQualityTier, number>> = {
      [WaterQualityTier.Low]: 2,
      [WaterQualityTier.Medium]: 6,
      [WaterQualityTier.High]: 12
    };
    for (const quality of Object.values(WaterQualityTier)) {
      const compiled = compileWaterWaveAsset(directionalWaterWaveFixture, quality);
      expect(compiled.activeWaveCount).toBe(expectedCounts[quality]);
      expect(compiled.shaderWaveCount).toBe(expectedCounts[quality]);
      expect(compiled.packedShaderData.length).toBe(compiled.activeWaveCount * WATER_WAVE_PACKED_FLOATS_PER_WAVE);
      const packed = compiled.packedShaderData.toTypedArray();
      expect(packed[WATER_WAVE_PACKED_OFFSET.directionX]).toBeCloseTo(compiled.waves[0].directionX, 6);
      expect(packed[WATER_WAVE_PACKED_OFFSET.angularFrequency]).toBeCloseTo(compiled.waves[0].angularFrequency, 6);
    }
  });

  it.each([
    [1, 1, 2],
    [3, 3, 6],
    [5, 5, 6],
    [7, 7, 12]
  ])(
    "zero-pads %i authored waves into the fixed %i-active/%i-slot contract",
    (waveCount, activeCount, shaderWaveCount) => {
      const compiled = compileWaterWaveAsset(
        {
          ...directionalWaterWaveFixture,
          generator: { ...directionalWaterWaveFixture.generator, waveCount }
        },
        WaterQualityTier.High
      );

      expect(compiled.activeWaveCount).toBe(activeCount);
      expect(compiled.shaderWaveCount).toBe(shaderWaveCount);
      expect(compiled.waves).toHaveLength(activeCount);
      expect(compiled.packedShaderData.length).toBe(activeCount * WATER_WAVE_PACKED_FLOATS_PER_WAVE);
      expect(compiled.diagnostics).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: WaterWaveDiagnosticCode.ShaderVariantPadded,
            path: "$.generator.waveCount"
          })
        ])
      );
    }
  );

  it("sorts by energy with a stable source-index tie-breaker and computes conservative bounds", () => {
    const compiled = compileWaterWaveAsset(
      {
        ...directionalWaterWaveFixture,
        generator: {
          ...directionalWaterWaveFixture.generator,
          randomness: 0,
          minAmplitude: 0.4,
          maxAmplitude: 0.4
        }
      },
      WaterQualityTier.Medium
    );

    expect(compiled.waves.map((wave) => wave.sourceIndex)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(compiled.maxVerticalDisplacement).toBeCloseTo(
      compiled.waves.reduce((sum, wave) => sum + Math.abs(wave.amplitude), 0),
      10
    );
    expect(compiled.maxHorizontalDisplacement).toBeCloseTo(
      compiled.waves.reduce((sum, wave) => sum + Math.abs(wave.horizontalAmplitude), 0),
      10
    );
    expect(
      compiled.waves.every(
        (wave) => wave.horizontalAmplitude <= wave.amplitude * WATER_WAVE_MAX_HORIZONTAL_AMPLITUDE_RATIO
      )
    ).toBe(true);
  });

  it("detaches compiled data from mutable input and returns defensive packed copies", () => {
    const mutableGenerator: Record<string, unknown> = { ...directionalWaterWaveFixture.generator };
    const mutableAsset: Record<string, unknown> = {
      schemaVersion: WaterWaveSchemaVersion.V1,
      model: WaterWaveModel.DirectionalGerstner,
      generator: mutableGenerator
    };
    const compiled = compileWaterWaveAsset(mutableAsset, WaterQualityTier.Low);
    const originalHash = compiled.sourceHash;
    const originalFirst = compiled.packedShaderData.at(0);
    mutableGenerator.seed = 999;
    const copy = compiled.packedShaderData.toTypedArray();
    copy[0] = 999;

    expect(compiled.sourceHash).toBe(originalHash);
    expect(compiled.packedShaderData.at(0)).toBe(originalFirst);
  });

  it("changes generated facts when the seed changes and compiles None to an empty set", () => {
    const first = compileWaterWaveAsset(directionalWaterWaveFixture, WaterQualityTier.Medium);
    const second = compileWaterWaveAsset(
      {
        ...directionalWaterWaveFixture,
        generator: { ...directionalWaterWaveFixture.generator, seed: directionalWaterWaveFixture.generator.seed + 1 }
      },
      WaterQualityTier.Medium
    );
    const none = compileWaterWaveAsset(
      { schemaVersion: WaterWaveSchemaVersion.V1, model: WaterWaveModel.None },
      WaterQualityTier.Low
    );

    expect(second.sourceHash).not.toBe(first.sourceHash);
    expect(second.waves).not.toEqual(first.waves);
    expect(none).toMatchObject({ model: WaterWaveModel.None, activeWaveCount: 0 });
    expect(none.packedShaderData.length).toBe(0);
  });

  it("throws typed diagnostics for invalid assets and qualities", () => {
    expect(() => compileWaterWaveAsset(null, WaterQualityTier.Low)).toThrow(WaterWaveCompilationError);
    expect(() => compileWaterWaveAsset(directionalWaterWaveFixture, "ultra" as WaterQualityTier)).toThrow(
      WaterWaveCompilationError
    );
  });
});
