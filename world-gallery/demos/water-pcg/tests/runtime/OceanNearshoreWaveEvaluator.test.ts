import { describe, expect, it } from "vitest";
import { WaterQueryAccuracy } from "../../authoring/wave/enums/WaterQueryAccuracy";
import { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";
import { compileWaterWaveAsset } from "../../compiler/wave/WaterWaveCompiler";
import { showcaseOceanPreview } from "../../demo/examples/ocean-preview/presets";
import {
  createOceanNearshoreWaveDirection,
  createOceanNearshoreWaveDerivatives,
  createOceanNearshoreWaveModifier,
  createOceanNearshoreWaveModifierGlsl,
  evaluateOceanNearshoreWaveSet,
  resolveOceanNearshoreWaveDirection,
  resolveOceanNearshoreWaveModifier,
  resolveOceanNearshoreWaveModifierF32
} from "../../runtime/ocean/OceanNearshoreWaveEvaluator";
import {
  createWaterWaveSampleOutput,
  evaluateGerstnerWaveSet
} from "../../runtime/wave/GerstnerWaveEvaluator";

const waveSet = compileWaterWaveAsset(
  showcaseOceanPreview.waveAsset,
  WaterQualityTier.High
);

describe("OceanNearshoreWaveEvaluator", () => {
  it("is an exact identity modifier in deep or unbounded water", () => {
    const modifier = createOceanNearshoreWaveModifier();
    resolveOceanNearshoreWaveModifier(
      {
        waterDepth: Number.POSITIVE_INFINITY,
        shoreDistance: 100,
        shoreNormalX: 0,
        shoreNormalZ: 1
      },
      modifier
    );
    expect(modifier).toMatchObject({
      influence: 0,
      directionBlend: 0,
      phaseSpeedScale: 1,
      waveNumberScale: 1,
      amplitudeScale: 1,
      horizontalAmplitudeScale: 1,
      shoreDamping: 1,
      breakerTendency: 0
    });

    const base = createWaterWaveSampleOutput();
    const nearshore = createWaterWaveSampleOutput();
    evaluateGerstnerWaveSet(
      waveSet,
      4,
      0,
      -28,
      12.5,
      0.82,
      WaterQueryAccuracy.Precise,
      base
    );
    evaluateOceanNearshoreWaveSet(
      waveSet,
      4,
      0,
      -28,
      12.5,
      0.82,
      WaterQueryAccuracy.Precise,
      {
        waterDepth: Number.POSITIVE_INFINITY,
        shoreDistance: 100,
        shoreNormalX: 0,
        shoreNormalZ: 1
      },
      nearshore,
      modifier,
      createOceanNearshoreWaveDirection(),
      createOceanNearshoreWaveDerivatives()
    );
    expect(nearshore).toEqual(base);
  });

  it("slows, refracts, shoals, steepens, and then damps waves continuously", () => {
    const modifier = createOceanNearshoreWaveModifier();
    const direction = createOceanNearshoreWaveDirection();
    resolveOceanNearshoreWaveModifier(
      {
        waterDepth: 1.8,
        shoreDistance: 10,
        shoreNormalX: 0,
        shoreNormalZ: 1
      },
      modifier
    );
    resolveOceanNearshoreWaveDirection(1, 0, modifier, direction);
    expect(modifier.influence).toBeGreaterThan(0.9);
    expect(modifier.phaseSpeedScale).toBeLessThan(0.5);
    expect(modifier.waveNumberScale).toBeGreaterThan(2);
    expect(modifier.amplitudeScale).toBeGreaterThan(1);
    expect(modifier.horizontalAmplitudeScale).toBeGreaterThan(
      modifier.amplitudeScale
    );
    expect(modifier.breakerTendency).toBeGreaterThan(0.2);
    expect(direction.z).toBeGreaterThan(direction.x);

    resolveOceanNearshoreWaveModifier(
      {
        waterDepth: 0.08,
        shoreDistance: 0.1,
        shoreNormalX: 0,
        shoreNormalZ: 1
      },
      modifier
    );
    expect(modifier.amplitudeScale).toBeLessThan(0.05);
    expect(modifier.horizontalAmplitudeScale).toBeLessThan(0.08);
  });

  it("keeps the CPU and float32 GLSL references within probe tolerance", () => {
    const probes = [
      [Number.POSITIVE_INFINITY, 100, 0, 1],
      [8, 30, 0.2, 0.98],
      [2.1, 13, 0, 1],
      [0.45, 3, -0.3, 0.95],
      [0, -2, 0, 1]
    ] as const;
    for (const [waterDepth, shoreDistance, shoreNormalX, shoreNormalZ] of probes) {
      const cpu = createOceanNearshoreWaveModifier();
      const gpu = createOceanNearshoreWaveModifier();
      const facts = {
        waterDepth,
        shoreDistance,
        shoreNormalX,
        shoreNormalZ
      };
      resolveOceanNearshoreWaveModifier(facts, cpu);
      resolveOceanNearshoreWaveModifierF32(facts, gpu);
      for (const key of Object.keys(cpu) as (keyof typeof cpu)[]) {
        expect(gpu[key]).toBeCloseTo(cpu[key], 6);
        expect(Number.isFinite(gpu[key])).toBe(true);
      }
    }
  });

  it("generates GLSL from the same bounded profile and contains no dynamic loop", () => {
    const source = createOceanNearshoreWaveModifierGlsl();
    expect(source).toContain("resolveOceanNearshoreWaveModifier");
    expect(source).toContain("breakerTendency");
    expect(source).toContain("horizontalAmplitudeScale");
    expect(source).not.toMatch(/for\s*\(/);
  });

  it("keeps invalid facts finite and bounded", () => {
    const modifier = createOceanNearshoreWaveModifier();
    resolveOceanNearshoreWaveModifier(
      {
        waterDepth: Number.NaN,
        shoreDistance: Number.NaN,
        shoreNormalX: Number.POSITIVE_INFINITY,
        shoreNormalZ: Number.NaN
      },
      modifier
    );
    for (const value of Object.values(modifier)) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });
});
