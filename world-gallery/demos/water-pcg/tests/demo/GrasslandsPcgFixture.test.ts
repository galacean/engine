import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  WaterSurfaceCoastalAlphaModel,
  WaterSurfaceContactFoamModel,
  WaterSurfaceDepthTintModel,
  WaterSurfaceNormalModel,
  WaterSurfaceNormalSampling
} from "../../authoring/surface/WaterSurfaceAppearanceTypes";
import { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";
import { WaterWaveModel } from "../../authoring/wave/enums/WaterWaveModel";
import { HeightfieldWaterCompiler } from "../../compiler/heightfield/HeightfieldWaterCompiler";
import { WaterSurfaceAppearanceCompiler } from "../../compiler/surface/WaterSurfaceAppearanceCompiler";
import { createGrasslandsPcgFixture, serializeGrasslandsPcgFixture } from "../../demo/grasslands/GrasslandsPcgFixture";
import {
  GRASSLANDS_COMPILED_SURFACE_APPEARANCE,
  GRASSLANDS_NORMAL_ASSET_ID,
  GRASSLANDS_NORMAL_CONTENT_HASH,
  GRASSLANDS_PCG_DEFAULT_SEED,
  GRASSLANDS_PCG_PRESET,
  GRASSLANDS_SCENE_MATERIALS,
  GRASSLANDS_SOURCE_WAVE_SPEED,
  GRASSLANDS_SURFACE_APPEARANCE_ASSET,
  GRASSLANDS_SURFACE_APPEARANCE_ASSET_ID,
  GRASSLANDS_TARGET_MATERIAL_CONFIG,
  GRASSLANDS_WATER_CONTROLLER_PRESENTATION,
  GRASSLANDS_WATER_BOUNDS,
  GRASSLANDS_WATER_GRID,
  GRASSLANDS_WATER_OPTICAL_PROFILE,
  GRASSLANDS_WORLD_SCALE
} from "../../demo/grasslands/GrasslandsPcgPreset";
import { findWaterPcgCase, WATER_PCG_PUBLIC_CASES } from "../../demo/navigation";
import { HeightfieldWaterCompositionMode } from "../../runtime/heightfield/HeightfieldWaterRuntimeEnums";
import { DEFAULT_WATER_OPTICAL_PROFILE } from "../../runtime/optics/WaterOpticalProfile";

function readWaterPcgSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), "utf8");
}

describe("Grasslands PCG M2A fixture", () => {
  it("registers an independent developer route, template, and lifecycle without public promotion", () => {
    expect(findWaterPcgCase("showcase-grasslands-stylized-water")).toMatchObject({
      id: "showcase-grasslands-stylized-water",
      group: "developer",
      runtime: "grasslands",
      preset: "hero-grasslands"
    });
    expect(WATER_PCG_PUBLIC_CASES).toHaveLength(20);
    expect(WATER_PCG_PUBLIC_CASES.map(({ id }) => id)).not.toContain("showcase-grasslands-stylized-water");

    const router = readWaterPcgSource("demo/router.ts");
    const html = readWaterPcgSource("index.html");
    const main = readWaterPcgSource("demo/grasslands/main.ts");
    expect(router).toContain('grasslands: "water-pcg-grasslands-template"');
    expect(router).toContain('grasslands: () => import("./grasslands/main")');
    expect(html).toContain('template id="water-pcg-grasslands-template"');
    expect(html).toContain('data-grasslands-capture-state="hero"');
    expect(html).toContain('data-grasslands-toggle="contactFoam"');
    expect(main).toContain("window.waterPcgGrasslands = acceptanceApi;");
    expect(main).toContain('window.addEventListener("beforeunload", beforeUnloadHandler, { once: true });');
    expect(main).toContain("new GrasslandsAssetLoader");
    expect(main).toContain("new GrasslandsSceneController");
    expect(main).toContain("WebGLEngine.create");
    expect(main).toContain("HeightfieldWaterCompileWorkerClient");
    expect(main).toContain("HeightfieldWaterRuntimeController");
    expect(main).toContain("CameraWaterFeatureBroker");
    expect(main).not.toContain("WaterWorld");
  });

  it("builds the all-wet flat Heightfield V1 contract with no wave, flow, or gameplay query", () => {
    const fixture = createGrasslandsPcgFixture();
    const descriptor = fixture.descriptor;
    const expectedWetTexelCount = GRASSLANDS_WATER_GRID.width * GRASSLANDS_WATER_GRID.height;

    expect(GRASSLANDS_WORLD_SCALE).toBe(0.5);
    expect(fixture.descriptorHash).toBe("6f89fae07e777259");
    expect(fixture.fixtureHash).toBe("3512e137ff304939");
    expect(fixture).toMatchObject({
      schemaVersion: 1,
      seed: 20260724,
      caseId: "showcase-grasslands-stylized-water",
      runtime: "grasslands",
      preset: "hero-grasslands",
      waterBodyType: "heightfield",
      wetTexelCount: expectedWetTexelCount,
      gameplayQueryRegistered: false
    });
    expect(descriptor.grid).toEqual({
      originXZ: [-39.9375, -35.71875],
      cellSizeXZ: [0.5625, 0.5625],
      width: 143,
      height: 128
    });
    expect(descriptor.wetTexelIndices).toHaveLength(expectedWetTexelCount);
    expect(Array.from(descriptor.wetTexelIndices).every((value, index) => value === index)).toBe(true);
    expect(Array.from(descriptor.surfaceHeights).every((value) => value === 0)).toBe(true);
    expect(Array.from(descriptor.bedHeights ?? []).every((value) => value === -1.5)).toBe(true);
    expect(Array.from(descriptor.flowVectorsXZ ?? []).every((value) => value === 0)).toBe(true);
    expect(descriptor.waveAsset.model).toBe(WaterWaveModel.None);
    expect(descriptor.material.waveStrength).toBe(0);
    expect(descriptor.quality).toBe(WaterQualityTier.High);
    expect(fixture.waterBounds).toEqual({
      minimum: [-40.21875, 0, -36],
      maximum: [40.21875, 0, 36]
    });
    expect(fixture.waterBounds).toBe(GRASSLANDS_WATER_BOUNDS);
    expect(fixture.camera).toEqual({
      mode: "fixed",
      position: [4, 4.5, 34],
      target: [-2, -10, -20],
      forward: [-0.10669723123906885, -0.25785164216108303, -0.9602750811516196],
      fieldOfViewDegrees: 50,
      nearClip: 0.05,
      farClip: 160
    });
    expect(fixture.terrain).toMatchObject({
      model: "analytic-centerline-width",
      interpolation: "catmull-rom",
      bankNoise: "none",
      sampling: {
        longitudinalSegments: 192,
        grassLateralSegments: 24,
        sandLateralSegments: 6,
        bedLateralSegments: 64,
        sandBandWidth: 1.2
      }
    });
    expect(fixture.terrain.landscapeRegions.map(({ id }) => id)).toEqual([
      "far-river",
      "narrow-channel",
      "mid-bay",
      "near-shoal"
    ]);

    const compiled = HeightfieldWaterCompiler.compile(descriptor);
    expect(compiled.valid).toBe(true);
    expect(compiled.data?.sourceHash).toBe(fixture.descriptorHash);
    expect(compiled.data?.stats.sourceWetTexelCount).toBe(expectedWetTexelCount);
    expect(compiled.data?.waveSet.activeWaveCount).toBe(0);
  });

  it("owns and compiles every strict Grasslands material parameter in the preset", () => {
    const appearance = GRASSLANDS_SURFACE_APPEARANCE_ASSET;
    expect(appearance).toEqual({
      schemaVersion: 1,
      id: GRASSLANDS_SURFACE_APPEARANCE_ASSET_ID,
      normal: {
        model: WaterSurfaceNormalModel.ExternalTangentNormal,
        textureAssetId: GRASSLANDS_NORMAL_ASSET_ID,
        textureContentHash: GRASSLANDS_NORMAL_CONTENT_HASH,
        sampling: WaterSurfaceNormalSampling.WorldXzMirroredDual,
        tiling: 0.05,
        scrollUvPerSecond: 0.02,
        strength: 0.2,
        flipGreen: false
      },
      depthTint: {
        model: WaterSurfaceDepthTintModel.SceneDepthPower,
        color: [0.21710525, 0.45953944, 0.55, 1],
        distance: 10,
        exponent: 0.5
      },
      coastalAlpha: {
        model: WaterSurfaceCoastalAlphaModel.SceneDepth,
        distance: 0.5
      },
      contactFoam: {
        model: WaterSurfaceContactFoamModel.SceneDepthVoronoi,
        worldScale: 2.5,
        timeRate: 1,
        opacity: 0.453,
        contactDistance: 0.1791,
        octaves: {
          count: 3,
          weights: [0.5, 0.25, 0.125]
        },
        lacunarity: 2,
        suppressRefraction: 1,
        smoothnessReduction: 1
      }
    });
    expect(GRASSLANDS_SOURCE_WAVE_SPEED).toBe(0.2);
    expect(appearance).not.toHaveProperty("refractionStrength");
    expect(appearance).not.toHaveProperty("roughness");
    expect(appearance).not.toHaveProperty("reflectionIntensity");
    expect(appearance).not.toHaveProperty("compositionMode");
    expect(appearance).not.toHaveProperty("depthWriteEnabled");

    const first = WaterSurfaceAppearanceCompiler.compile(appearance);
    const independentReference = WaterSurfaceAppearanceCompiler.compile(JSON.parse(JSON.stringify(appearance)));
    expect(first.valid).toBe(true);
    expect(independentReference.valid).toBe(true);
    expect(first.data).toMatchObject({
      sourceId: GRASSLANDS_SURFACE_APPEARANCE_ASSET_ID,
      appearanceHash: "b137ea12b87e0af0",
      variantKey: "surface-appearance-v1"
    });
    expect(independentReference.data?.appearanceHash).toBe(first.data?.appearanceHash);
    expect(GRASSLANDS_COMPILED_SURFACE_APPEARANCE).toEqual(first.data);
  });

  it("keeps optical and Controller state in their existing owners outside Appearance", () => {
    expect(GRASSLANDS_WATER_OPTICAL_PROFILE).toEqual({
      ...DEFAULT_WATER_OPTICAL_PROFILE,
      refractionStrength: 0.1,
      roughness: 0,
      reflectionIntensity: 1
    });
    expect(GRASSLANDS_WATER_OPTICAL_PROFILE.absorptionCoefficient).toBe(
      DEFAULT_WATER_OPTICAL_PROFILE.absorptionCoefficient
    );
    expect(GRASSLANDS_WATER_OPTICAL_PROFILE.scatteringColor).toBe(DEFAULT_WATER_OPTICAL_PROFILE.scatteringColor);
    expect(GRASSLANDS_WATER_OPTICAL_PROFILE.scatteringCoefficient).toBe(
      DEFAULT_WATER_OPTICAL_PROFILE.scatteringCoefficient
    );
    expect(GRASSLANDS_WATER_OPTICAL_PROFILE.maximumViewDistance).toBe(
      DEFAULT_WATER_OPTICAL_PROFILE.maximumViewDistance
    );
    expect(GRASSLANDS_WATER_OPTICAL_PROFILE.indexOfRefraction).toBe(DEFAULT_WATER_OPTICAL_PROFILE.indexOfRefraction);
    expect(GRASSLANDS_WATER_OPTICAL_PROFILE.maximumSurfaceOpticalDistance).toBe(
      DEFAULT_WATER_OPTICAL_PROFILE.maximumSurfaceOpticalDistance
    );
    expect(GRASSLANDS_WATER_CONTROLLER_PRESENTATION).toEqual({
      compositionMode: HeightfieldWaterCompositionMode.PrecomposedReplace,
      depthWriteEnabled: true
    });
    expect(GRASSLANDS_TARGET_MATERIAL_CONFIG).toEqual({
      sourceWaveSpeed: 0.2,
      surfaceAppearance: GRASSLANDS_SURFACE_APPEARANCE_ASSET,
      opticalProfile: GRASSLANDS_WATER_OPTICAL_PROFILE,
      controller: GRASSLANDS_WATER_CONTROLLER_PRESENTATION
    });
  });

  it("keeps target material data out of Heightfield V1 and the Worker protocol", () => {
    const fixture = createGrasslandsPcgFixture();
    expect(fixture.targetMaterialConfig).toBe(GRASSLANDS_TARGET_MATERIAL_CONFIG);
    expect(GRASSLANDS_PCG_PRESET.targetMaterialConfig).toBe(GRASSLANDS_TARGET_MATERIAL_CONFIG);
    expect(fixture.targetMaterialConfig.surfaceAppearance).toBe(GRASSLANDS_SURFACE_APPEARANCE_ASSET);
    expect(fixture.appearanceAssetId).toBe(GRASSLANDS_SURFACE_APPEARANCE_ASSET_ID);
    expect(fixture.appearanceHash).toBe(GRASSLANDS_COMPILED_SURFACE_APPEARANCE.appearanceHash);
    expect(fixture.appearanceVariantKey).toBe("surface-appearance-v1");
    expect(fixture.externalAssetHash).toBe(GRASSLANDS_NORMAL_CONTENT_HASH);
    expect(fixture.descriptor).not.toHaveProperty("surfaceAppearance");
    expect(fixture.descriptor).not.toHaveProperty("appearanceAssetId");
    expect(fixture.descriptor).not.toHaveProperty("opticalProfile");
    expect(fixture.descriptor).not.toHaveProperty("compositionMode");
    expect(fixture.descriptor).not.toHaveProperty("depthWriteEnabled");

    const workerProtocol = readWaterPcgSource("compiler/heightfield/HeightfieldWaterCompileWorkerProtocol.ts");
    expect(workerProtocol).not.toContain("WaterSurfaceAppearance");
    expect(workerProtocol).not.toContain("appearanceAssetId");
    const targetMaterialJson = JSON.stringify(fixture.targetMaterialConfig);
    expect(targetMaterialJson).not.toMatch(/https?:|\\.png|local-assets|trackedUrl|Texture2D|Engine|GPU/);
  });

  it("reproduces hash, scene materials, rocks, camera, and ROIs for the same seed", () => {
    const first = createGrasslandsPcgFixture(GRASSLANDS_PCG_DEFAULT_SEED);
    const second = createGrasslandsPcgFixture(GRASSLANDS_PCG_DEFAULT_SEED);

    expect(first.descriptorHash).toBe(second.descriptorHash);
    expect(first.appearanceAssetId).toBe(second.appearanceAssetId);
    expect(first.appearanceHash).toBe(second.appearanceHash);
    expect(first.appearanceVariantKey).toBe(second.appearanceVariantKey);
    expect(first.externalAssetHash).toBe(second.externalAssetHash);
    expect(first.targetMaterialConfig).toBe(second.targetMaterialConfig);
    expect(first.fixtureHash).toBe(second.fixtureHash);
    expect(first.waterBounds).toEqual(second.waterBounds);
    expect(first.camera).toEqual(second.camera);
    expect(first.directLight).toEqual(second.directLight);
    expect(first.mechanismRois).toEqual(second.mechanismRois);
    expect(first.candidateValidationRois).toEqual(second.candidateValidationRois);
    expect(first.sceneMaterials).toEqual(second.sceneMaterials);
    expect(first.anchorRocks).toEqual(second.anchorRocks);
    expect(first.scenicRocks).toEqual(second.scenicRocks);
    expect(first.decorations).toEqual(second.decorations);
    expect(first.sceneMaterials).toBe(GRASSLANDS_SCENE_MATERIALS);
    expect(first.anchorRocks).toHaveLength(3);
    expect(first.scenicRocks).toHaveLength(15);
    expect(first.scenicRocks.filter(({ kind }) => kind === "underwater-bed")).toHaveLength(8);
    expect(first.scenicRocks.filter(({ kind }) => kind === "shore")).toHaveLength(7);
    expect(
      first.anchorRocks.every(
        ({ bounds, validationCritical }) => validationCritical && bounds.minimum[1] < 0 && bounds.maximum[1] > 0
      )
    ).toBe(true);
    expect(
      first.scenicRocks.every(({ kind, bounds, validationCritical }) =>
        kind === "underwater-bed"
          ? validationCritical === false && bounds.maximum[1] < first.terrain.waterSurfaceHeight
          : validationCritical === false && bounds.minimum[1] > first.terrain.waterSurfaceHeight
      )
    ).toBe(true);
    expect(new Set([...first.anchorRocks, ...first.scenicRocks].map(({ id }) => id)).size).toBe(
      first.anchorRocks.length + first.scenicRocks.length
    );
    expect(new Set(first.mechanismRois.map(({ id }) => id)).size).toBe(first.mechanismRois.length);
    expect(new Set(first.candidateValidationRois.map(({ id }) => id)).size).toBe(first.candidateValidationRois.length);
    expect(first.candidateValidationRois).toHaveLength(16);
    expect(serializeGrasslandsPcgFixture(first)).toBe(serializeGrasslandsPcgFixture(second));
  });

  it("lets a different seed change only non-acceptance decorations", () => {
    const baseline = createGrasslandsPcgFixture(GRASSLANDS_PCG_DEFAULT_SEED);
    const alternate = createGrasslandsPcgFixture(GRASSLANDS_PCG_DEFAULT_SEED + 1);

    expect(alternate.seed).not.toBe(baseline.seed);
    expect(alternate.fixtureHash).not.toBe(baseline.fixtureHash);
    expect(alternate.decorations).not.toEqual(baseline.decorations);
    expect(alternate.decorations.every(({ validationCritical }) => validationCritical === false)).toBe(true);
    expect(alternate.descriptorHash).toBe(baseline.descriptorHash);
    expect(alternate.appearanceAssetId).toBe(baseline.appearanceAssetId);
    expect(alternate.appearanceHash).toBe(baseline.appearanceHash);
    expect(alternate.appearanceVariantKey).toBe(baseline.appearanceVariantKey);
    expect(alternate.externalAssetHash).toBe(baseline.externalAssetHash);
    expect(alternate.targetMaterialConfig).toBe(baseline.targetMaterialConfig);
    expect(alternate.waterBounds).toEqual(baseline.waterBounds);
    expect(alternate.camera).toEqual(baseline.camera);
    expect(alternate.directLight).toEqual(baseline.directLight);
    expect(alternate.mechanismRois).toEqual(baseline.mechanismRois);
    expect(alternate.candidateValidationRois).toEqual(baseline.candidateValidationRois);
    expect(alternate.terrain).toEqual(baseline.terrain);
    expect(alternate.sceneMaterials).toEqual(baseline.sceneMaterials);
    expect(alternate.anchorRocks).toEqual(baseline.anchorRocks);
    expect(alternate.scenicRocks).toEqual(baseline.scenicRocks);
    expect(Array.from(alternate.descriptor.wetTexelIndices)).toEqual(Array.from(baseline.descriptor.wetTexelIndices));
    expect(Array.from(alternate.descriptor.surfaceHeights)).toEqual(Array.from(baseline.descriptor.surfaceHeights));
    expect(Array.from(alternate.descriptor.bedHeights ?? [])).toEqual(Array.from(baseline.descriptor.bedHeights ?? []));
    expect(Array.from(alternate.descriptor.flowVectorsXZ ?? [])).toEqual(
      Array.from(baseline.descriptor.flowVectorsXZ ?? [])
    );
  });

  it("serializes typed descriptor buffers into stable JSON and rejects invalid seeds", () => {
    const fixture = createGrasslandsPcgFixture();
    const serialized = serializeGrasslandsPcgFixture(fixture);
    const parsed = JSON.parse(serialized) as {
      readonly runtime: string;
      readonly preset: string;
      readonly appearanceAssetId: string;
      readonly appearanceHash: string;
      readonly appearanceVariantKey: string;
      readonly externalAssetHash: string;
      readonly sceneMaterials: unknown;
      readonly scenicRocks: readonly unknown[];
      readonly descriptor: {
        readonly wetTexelIndices: readonly number[];
        readonly surfaceHeights: readonly number[];
        readonly bedHeights: readonly number[];
        readonly flowVectorsXZ: readonly number[];
      };
    };

    expect(parsed.runtime).toBe(GRASSLANDS_PCG_PRESET.runtime);
    expect(parsed.preset).toBe(GRASSLANDS_PCG_PRESET.preset);
    expect(parsed.appearanceAssetId).toBe(GRASSLANDS_SURFACE_APPEARANCE_ASSET_ID);
    expect(parsed.appearanceHash).toBe(GRASSLANDS_COMPILED_SURFACE_APPEARANCE.appearanceHash);
    expect(parsed.appearanceVariantKey).toBe("surface-appearance-v1");
    expect(parsed.externalAssetHash).toBe(GRASSLANDS_NORMAL_CONTENT_HASH);
    expect(parsed.sceneMaterials).toEqual(GRASSLANDS_SCENE_MATERIALS);
    expect(parsed.scenicRocks).toHaveLength(15);
    expect(parsed.descriptor.wetTexelIndices).toHaveLength(143 * 128);
    expect(parsed.descriptor.surfaceHeights).toHaveLength(143 * 128);
    expect(parsed.descriptor.bedHeights).toHaveLength(143 * 128);
    expect(parsed.descriptor.flowVectorsXZ).toHaveLength(143 * 128 * 2);
    expect(() => createGrasslandsPcgFixture(-1)).toThrow(RangeError);
    expect(() => createGrasslandsPcgFixture(0x1_0000_0000)).toThrow(RangeError);
    expect(() => createGrasslandsPcgFixture(1.5)).toThrow(RangeError);
  });
});
