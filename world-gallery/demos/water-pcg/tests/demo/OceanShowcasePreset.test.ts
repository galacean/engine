import { describe, expect, it } from "vitest";
import { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";
import { compileWaterWaveAsset } from "../../compiler/wave/WaterWaveCompiler";
import { gerstnerFeatureOceanPreview, showcaseOceanPreview } from "../../demo/examples/ocean-preview/presets";
import { createOceanRingLayout } from "../../runtime/ocean/OceanRingGeometry";
import { OceanNearshoreCompiler } from "../../compiler/ocean/OceanNearshoreCompiler";
import { buildOceanBeachTerrainGeometry } from "../../demo/ocean/OceanBeachTerrainBuilder";
import { createOceanDuskEnvironmentState } from "../../demo/ocean/OceanDuskEnvironmentController";
import {
  buildOceanShowcaseCliffGeometry,
  buildOceanShowcaseRockGeometry
} from "../../demo/ocean/OceanShowcaseSceneController";
import { OceanNearshoreFieldResource } from "../../runtime/ocean/OceanNearshoreFieldResource";

describe("Ocean showcase presets", () => {
  it("locks the hero to High 12-wave rings and opt-in five-tap Planar reflection", () => {
    const waves = compileWaterWaveAsset(showcaseOceanPreview.waveAsset, showcaseOceanPreview.quality);
    const rings = createOceanRingLayout({
      size: showcaseOceanPreview.size,
      ringCount: 3,
      patchSegments: 12,
      waterLevel: showcaseOceanPreview.waterLevel,
      maxHorizontalDisplacement: waves.maxHorizontalDisplacement,
      maxVerticalDisplacement: waves.maxVerticalDisplacement,
      skirtDepth: 2
    });

    expect(showcaseOceanPreview.quality).toBe(WaterQualityTier.High);
    expect(waves.activeWaveCount).toBe(12);
    expect(rings.patches).toHaveLength(37);
    expect(showcaseOceanPreview.reflectionSource).toBe("planar");
    expect(showcaseOceanPreview.reflectionSampling?.highFilterSampleCount).toBe(5);
    expect(showcaseOceanPreview.nearshoreDescriptor).toBeDefined();
    const nearshore = OceanNearshoreCompiler.compile(
      showcaseOceanPreview.nearshoreDescriptor
    );
    expect(nearshore.valid).toBe(true);
    expect(nearshore.data?.stats).toMatchObject({
      texelCount: 256 * 128,
      obstacleCount: 3,
      atlasByteLength: 256 * 128 * 4
    });
    expect(nearshore.data?.stats.wetTexelCount).toBeGreaterThan(0);
    expect(nearshore.data?.stats.dryTexelCount).toBeGreaterThan(0);
    if (!nearshore.data) throw new Error("Nearshore preset did not compile.");
    const resource = OceanNearshoreFieldResource.create(nearshore.data);
    const terrain = buildOceanBeachTerrainGeometry(resource);
    expect(terrain.positions).toHaveLength(256 * 128 * 3);
    expect(terrain.normals).toHaveLength(256 * 128 * 3);
    expect(terrain.indices).toHaveLength(255 * 127 * 6);
    const probeIndex = 64 * 256 + 128;
    expect(terrain.positions[probeIndex * 3 + 1]).toBe(
      resource.bedHeightAt(probeIndex)
    );
    expect(terrain.normals[probeIndex * 3 + 1]).toBeGreaterThan(0.98);
    resource.dispose();
    expect(gerstnerFeatureOceanPreview.reflectionSource).toBe("planar");
    expect(
      gerstnerFeatureOceanPreview.reflectionSampling?.highFilterSampleCount
    ).toBe(1);
  });

  it("builds deterministic finite rock geometry with closed normalized seams", () => {
    const first = buildOceanShowcaseRockGeometry(20260723, 8, 12);
    const second = buildOceanShowcaseRockGeometry(20260723, 8, 12);

    expect(first.positions).toHaveLength(9 * 13);
    expect(first.normals).toHaveLength(first.positions.length);
    expect(first.indices).toHaveLength(8 * 12 * 6);
    expect(
      first.positions.map(({ x, y, z }) => [x, y, z])
    ).toEqual(
      second.positions.map(({ x, y, z }) => [x, y, z])
    );
    expect(
      first.positions.every(({ x, y, z }) =>
        [x, y, z].every(Number.isFinite)
      )
    ).toBe(true);
    for (const normal of first.normals) {
      expect(Math.hypot(normal.x, normal.y, normal.z)).toBeCloseTo(1, 6);
    }
    for (let latitude = 0; latitude <= 8; latitude++) {
      const firstNormal = first.normals[latitude * 13];
      const lastNormal = first.normals[latitude * 13 + 12];
      expect([lastNormal.x, lastNormal.y, lastNormal.z]).toEqual([
        firstNormal.x,
        firstNormal.y,
        firstNormal.z
      ]);
    }
    expect(first.bounds.minimum.y).toBeGreaterThanOrEqual(-0.76);
    expect(first.bounds.maximum.y).toBeGreaterThan(0.9);
    expect(() => buildOceanShowcaseRockGeometry(1.5)).toThrow(
      /parameters are invalid/
    );
    expect(() => buildOceanShowcaseRockGeometry(1, 3, 12)).toThrow(
      /parameters are invalid/
    );
  });

  it("builds deterministic submerged-edge coastal ridges", () => {
    const first = buildOceanShowcaseCliffGeometry(20260723, 16, 8);
    const second = buildOceanShowcaseCliffGeometry(20260723, 16, 8);

    expect(first.positions).toHaveLength(17 * 9);
    expect(first.normals).toHaveLength(first.positions.length);
    expect(first.tangents).toHaveLength(first.positions.length);
    expect(first.uvs).toHaveLength(first.positions.length);
    expect(first.indices).toHaveLength(16 * 8 * 6);
    expect(
      first.positions.map(({ x, y, z }) => [x, y, z])
    ).toEqual(
      second.positions.map(({ x, y, z }) => [x, y, z])
    );
    expect(first.bounds.minimum.y).toBeLessThan(-0.6);
    expect(first.bounds.maximum.y).toBeGreaterThan(0.4);
    expect(
      first.normals.every(({ x, y, z }) =>
        [x, y, z].every(Number.isFinite)
      )
    ).toBe(true);
    expect(() =>
      buildOceanShowcaseCliffGeometry(1, 7, 8)
    ).toThrow(/parameters are invalid/);
  });

  it("keeps the authored dusk sun, ambient SH, and atmosphere deterministic and finite", () => {
    const first = createOceanDuskEnvironmentState();
    const second = createOceanDuskEnvironmentState();
    const directionLength = Math.hypot(
      first.sunDirection.x,
      first.sunDirection.y,
      first.sunDirection.z
    );

    expect(directionLength).toBeCloseTo(1, 8);
    expect(first.sunDirection.y).toBeLessThan(0);
    expect(first.sunIntensity).toBeGreaterThan(0);
    expect(first.fogDensity).toBeGreaterThan(0);
    expect(first.aoEnabled).toBe(true);
    expect(first.iblIntensity).toBeGreaterThan(0);
    expect(Array.from(first.ambientSH.coefficients)).toEqual(
      Array.from(second.ambientSH.coefficients)
    );
    expect(
      Array.from(first.ambientSH.coefficients).every(Number.isFinite)
    ).toBe(true);
    expect([
      first.timeOfDay,
      first.sunIntensity,
      first.shadowStrength,
      first.skyExposure,
      first.atmosphereThickness,
      first.ambientIntensity,
      first.iblIntensity,
      first.fogDensity,
      first.aoIntensity,
      first.aoRadius,
      first.aoPower
    ].every(Number.isFinite)).toBe(true);
  });
});
