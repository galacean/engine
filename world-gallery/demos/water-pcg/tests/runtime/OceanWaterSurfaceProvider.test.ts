import { Vector3 } from "@galacean/engine-math";
import { describe, expect, it } from "vitest";
import { WaterQueryAccuracy } from "../../authoring/wave/enums/WaterQueryAccuracy";
import { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";
import { compileWaterWaveAsset } from "../../compiler/wave/WaterWaveCompiler";
import { OceanNearshoreCompiler } from "../../compiler/ocean/OceanNearshoreCompiler";
import { OceanNearshoreFieldProvider } from "../../runtime/ocean/OceanNearshoreFieldProvider";
import { OceanNearshoreFieldResource } from "../../runtime/ocean/OceanNearshoreFieldResource";
import {
  createOceanNearshoreStateSample,
  OceanNearshoreStateField
} from "../../runtime/ocean/OceanNearshoreStateField";
import {
  createOceanNearshoreWaveDerivatives,
  createOceanNearshoreWaveDirection,
  createOceanNearshoreWaveModifier,
  evaluateOceanNearshoreWaveSet
} from "../../runtime/ocean/OceanNearshoreWaveEvaluator";
import { OceanWaterSurfaceProvider } from "../../runtime/ocean/OceanWaterSurfaceProvider";
import {
  createWaterSurfaceBatchOutput,
  createWaterSurfaceQueryStatus,
  createWaterSurfaceSample,
  WaterSurfaceQueryFallback
} from "../../runtime/query/WaterSurfaceProvider";
import { createWaterWaveSampleOutput, evaluateGerstnerWaveSet } from "../../runtime/wave/GerstnerWaveEvaluator";
import { directionalWaterWaveFixture } from "../fixtures/waterWaveFixtures";
import { createOceanNearshoreFixture } from "../fixtures/oceanNearshoreFixture";
import { showcaseOceanPreview } from "../../demo/examples/ocean-preview/presets";

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

  it("samples nearshore facts at inverse-solved rest XZ while keeping seaward outside unbounded", () => {
    const compiledField = OceanNearshoreCompiler.compile(
      createOceanNearshoreFixture()
    );
    if (!compiledField.valid || !compiledField.data) {
      throw new Error("Nearshore fixture did not compile.");
    }
    const fieldResource = OceanNearshoreFieldResource.create(compiledField.data);
    const nearshoreField = new OceanNearshoreFieldProvider(fieldResource);
    const waveSet = compileWaterWaveAsset(
      directionalWaterWaveFixture,
      WaterQualityTier.Medium
    );
    const provider = new OceanWaterSurfaceProvider({
      waterBodyId: "nearshore-ocean",
      waveSet,
      size: 20,
      waterLevel: 0,
      timeScale: 1,
      unbounded: true,
      nearshoreField,
      getElapsedTime: () => 0
    });
    const rendered = createWaterWaveSampleOutput();
    const sample = createWaterSurfaceSample();

    evaluateGerstnerWaveSet(
      waveSet,
      0,
      0,
      -1,
      0,
      1,
      WaterQueryAccuracy.Precise,
      rendered
    );
    expect(
      provider.sampleSurface(
        new Vector3(rendered.displacedX, 0, rendered.displacedZ),
        sample
      )
    ).toBe(true);
    expect(sample.waterDepth).toBeGreaterThan(0);
    expect(sample.waterDepth).toBeLessThan(4);
    expect(sample.waterVelocity.z).toBeLessThan(rendered.horizontalVelocityZ);

    evaluateGerstnerWaveSet(
      waveSet,
      0,
      0,
      2,
      0,
      1,
      WaterQueryAccuracy.Precise,
      rendered
    );
    expect(
      provider.sampleSurface(
        new Vector3(rendered.displacedX, 0, rendered.displacedZ),
        sample
      )
    ).toBe(false);
    expect(provider.lastQueryStatus.capabilityFallback).toBe(
      WaterSurfaceQueryFallback.OutsideFootprint
    );

    evaluateGerstnerWaveSet(
      waveSet,
      0,
      0,
      -20,
      0,
      1,
      WaterQueryAccuracy.Precise,
      rendered
    );
    expect(
      provider.sampleSurface(
        new Vector3(rendered.displacedX, 0, rendered.displacedZ),
        sample
      )
    ).toBe(true);
    expect(sample.waterDepth).toBe(Number.POSITIVE_INFINITY);

    nearshoreField.destroy();
    fieldResource.dispose();
  });

  it("matches the modified nearshore wave at inverse-solved rest XZ", () => {
    const compiledField = OceanNearshoreCompiler.compile(
      createOceanNearshoreFixture()
    );
    if (!compiledField.valid || !compiledField.data) {
      throw new Error("Nearshore fixture did not compile.");
    }
    const fieldResource = OceanNearshoreFieldResource.create(compiledField.data);
    const nearshoreField = new OceanNearshoreFieldProvider(fieldResource);
    const waveSet = compileWaterWaveAsset(
      directionalWaterWaveFixture,
      WaterQualityTier.Medium
    );
    const provider = new OceanWaterSurfaceProvider({
      waterBodyId: "modified-nearshore",
      waveSet,
      size: 20,
      waterLevel: 0,
      timeScale: 1,
      unbounded: true,
      nearshoreField,
      getElapsedTime: () => 1.75
    });
    const rendered = createWaterWaveSampleOutput();
    const modifier = createOceanNearshoreWaveModifier();
    const direction = createOceanNearshoreWaveDirection();
    const derivatives = createOceanNearshoreWaveDerivatives();
    evaluateOceanNearshoreWaveSet(
      waveSet,
      0,
      0,
      -1,
      1.75,
      1,
      WaterQueryAccuracy.Precise,
      {
        waterDepth: fieldResource.waterDepthAt(7),
        shoreDistance: fieldResource.shoreDistanceAt(7),
        shoreNormalX: fieldResource.shoreNormalXAt(7),
        shoreNormalZ: fieldResource.shoreNormalZAt(7)
      },
      rendered,
      modifier,
      direction,
      derivatives
    );
    const sample = createWaterSurfaceSample();

    expect(
      provider.sampleSurface(
        new Vector3(rendered.displacedX, 0, rendered.displacedZ),
        sample
      )
    ).toBe(true);
    expect(sample.surfacePosition.y).toBeCloseTo(rendered.displacedY, 5);
    expect(sample.surfaceNormal.x).toBeCloseTo(rendered.normalX, 5);
    expect(sample.surfaceNormal.y).toBeCloseTo(rendered.normalY, 5);
    expect(sample.surfaceNormal.z).toBeCloseTo(rendered.normalZ, 5);
    expect(sample.waterVelocity.x).toBeCloseTo(
      rendered.horizontalVelocityX +
        fieldResource.baseCurrentXAt(7),
      5
    );
    expect(sample.waterVelocity.z).toBeCloseTo(
      rendered.horizontalVelocityZ +
        fieldResource.baseCurrentZAt(7),
      5
    );

    nearshoreField.destroy();
    fieldResource.dispose();
  });

  it("queries dynamic thin film and backwash while keeping dry sand empty", () => {
    const compiledField = OceanNearshoreCompiler.compile(
      createOceanNearshoreFixture()
    );
    if (!compiledField.valid || !compiledField.data) {
      throw new Error("Nearshore fixture did not compile.");
    }
    const fieldResource = OceanNearshoreFieldResource.create(compiledField.data);
    const nearshoreField = new OceanNearshoreFieldProvider(fieldResource);
    const nearshoreState = new OceanNearshoreStateField(fieldResource, {
      swashPeriodSeconds: 4,
      minimumRunupDistance: 0,
      maximumRunupDistance: 2
    });
    const waveSet = compileWaterWaveAsset(
      directionalWaterWaveFixture,
      WaterQualityTier.Medium
    );
    let elapsedTime = 2;
    nearshoreState.seek(elapsedTime);
    const provider = new OceanWaterSurfaceProvider({
      waterBodyId: "dynamic-nearshore",
      waveSet,
      size: 20,
      waterLevel: 0,
      timeScale: 1,
      unbounded: true,
      nearshoreField,
      nearshoreState,
      getElapsedTime: () => elapsedTime
    });
    const sample = createWaterSurfaceSample();
    const stateSample = createOceanNearshoreStateSample();

    expect(nearshoreState.sample(0, 2, stateSample)).toBe(true);
    expect(stateSample.occupied).toBe(true);
    expect(provider.sampleSurface(new Vector3(0, 0, 2), sample)).toBe(true);
    expect(sample.surfacePosition.y).toBeCloseTo(
      stateSample.surfaceHeight,
      5
    );
    expect(sample.waterDepth).toBeGreaterThan(0);

    elapsedTime = 3;
    nearshoreState.seek(elapsedTime);
    expect(provider.sampleSurface(new Vector3(0, 0, 0), sample)).toBe(true);
    expect(sample.waterVelocity.z).toBeLessThan(-0.2);

    elapsedTime = 3.9;
    nearshoreState.seek(elapsedTime);
    expect(provider.sampleSurface(new Vector3(0, 0, 2), sample)).toBe(false);
    expect(provider.lastQueryStatus.capabilityFallback).toBe(
      WaterSurfaceQueryFallback.OutsideFootprint
    );

    nearshoreState.destroy();
    nearshoreField.destroy();
    fieldResource.dispose();
  });

  it("converges for the canonical fixed-time hero boat probe", () => {
    const descriptor = showcaseOceanPreview.nearshoreDescriptor;
    const waveAsset = showcaseOceanPreview.waveAsset;
    if (!descriptor || waveAsset.model !== "directionalGerstner") {
      throw new Error("Canonical Ocean showcase fixture is incomplete.");
    }
    const compiledField = OceanNearshoreCompiler.compile(descriptor);
    if (!compiledField.valid || !compiledField.data) {
      throw new Error("Canonical nearshore field did not compile.");
    }
    const fieldResource = OceanNearshoreFieldResource.create(compiledField.data);
    const nearshoreField = new OceanNearshoreFieldProvider(fieldResource);
    const nearshoreState = new OceanNearshoreStateField(fieldResource);
    const amplitudeScale = showcaseOceanPreview.amplitudeScale;
    const waveSet = compileWaterWaveAsset(
      {
        ...waveAsset,
        generator: {
          ...waveAsset.generator,
          minAmplitude:
            waveAsset.generator.minAmplitude * amplitudeScale,
          maxAmplitude:
            waveAsset.generator.maxAmplitude * amplitudeScale
        }
      },
      showcaseOceanPreview.quality
    );
    const elapsedTime = 12.5;
    nearshoreState.seek(elapsedTime);
    const provider = new OceanWaterSurfaceProvider({
      waterBodyId: "canonical-hero-ocean",
      waveSet,
      size: showcaseOceanPreview.size,
      waterLevel: showcaseOceanPreview.waterLevel,
      timeScale: showcaseOceanPreview.timeScale,
      unbounded: true,
      nearshoreField,
      nearshoreState,
      getElapsedTime: () => elapsedTime
    });
    const phase = elapsedTime * 0.16;
    const worldX = -1.5 + Math.sin(phase) * 9.5;
    const worldZ = -8 + Math.cos(phase) * 4.2;
    const sample = createWaterSurfaceSample();
    const status = createWaterSurfaceQueryStatus();
    const hit = provider.sampleSurfaceWithStatus(
      new Vector3(worldX, 0, worldZ),
      sample,
      status
    );

    expect({
      hit,
      converged: status.converged,
      fallback: status.capabilityFallback
    }).toEqual({
      hit: true,
      converged: true,
      fallback: WaterSurfaceQueryFallback.None
    });
    expect(status.horizontalError).toBeLessThanOrEqual(0.00001);
    expect(status.iterations).toBeLessThanOrEqual(12);
    expect(sample.waterDepth).toBeGreaterThan(0);
    expect(Number.isFinite(sample.surfacePosition.y)).toBe(true);

    nearshoreState.destroy();
    nearshoreField.destroy();
    fieldResource.dispose();
  });
});
