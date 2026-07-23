import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { findWaterPcgCase, resolveWaterPcgCase } from "../../demo/navigation";
import { POOL_P1_BODY_COUNTS, resolvePoolP1ShowcaseConfig } from "../../demo/pool/PoolP1ShowcaseConfig";

function readWaterPcgSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), "utf8");
}

function readDataAttributeValues(source: string, attribute: string): string[] {
  return Array.from(source.matchAll(new RegExp(`${attribute}="([^"]+)"`, "g")), (match) => match[1]);
}

describe("P1 water showcase integration contract", () => {
  it("merges P1 and the legacy interactive pool into one public pool showcase", () => {
    expect(findWaterPcgCase("showcase-pool")).toMatchObject({
      id: "showcase-pool",
      label: "泳池",
      group: "showcase",
      runtime: "pool",
      preset: "hero-pool"
    });
    expect(resolveWaterPcgCase({ hash: "#p1-water-showcase", search: "" }).id).toBe("showcase-pool");
    expect(resolveWaterPcgCase({ hash: "#indoor-reflective-pool", search: "" }).id).toBe("showcase-pool");

    const routerSource = readWaterPcgSource("demo/router.ts");
    expect(routerSource).toContain('pool: "water-pcg-interactive-pool-template"');
    expect(routerSource).toContain('pool: () => import("./pool/main")');
  });

  it("shows bounded body-count and texture diagnostics in every Pool case", () => {
    const htmlSource = readWaterPcgSource("index.html");
    const poolMainSource = readWaterPcgSource("demo/pool/main.ts");

    expect(POOL_P1_BODY_COUNTS).toEqual([1, 4, 8, 16]);
    expect(readDataAttributeValues(htmlSource, "data-p1-body-count")).toEqual(["1", "4", "8", "16"]);
    expect(readDataAttributeValues(htmlSource, "data-p1-debug-view")).toEqual(["source", "history", "final"]);
    expect(htmlSource.match(/data-p1-dynamic-effects/g)).toHaveLength(1);
    expect(htmlSource).toContain('<div class="hud-controls" data-p1-controls aria-label=');
    expect(htmlSource).not.toContain("data-p1-controls hidden");

    for (const bodyCount of POOL_P1_BODY_COUNTS) {
      expect(
        resolvePoolP1ShowcaseConfig({
          hash: "#developer-pool-diagnostics",
          search: `?bodies=${bodyCount}`
        }).bodyCount
      ).toBe(bodyCount);
    }
    expect(resolvePoolP1ShowcaseConfig({ hash: "#indoor-reflective-pool", search: "" })).toMatchObject({
      preset: "hero-pool",
      enabled: true,
      bodyCount: 4,
      temporalFoamEnabled: true,
      developerControls: false
    });
    expect(resolvePoolP1ShowcaseConfig({ hash: "#developer-pool-diagnostics", search: "" })).toMatchObject({
      preset: "p1-diagnostics",
      developerControls: true
    });

    expect(poolMainSource).toContain('p1Controls?.removeAttribute("hidden");');
    expect(poolMainSource).toContain("const setP1DynamicEffectsEnabled = (enabled: boolean): void => {");
    expect(poolMainSource).toContain("interactionQueue.clearEvents();");
    expect(poolMainSource).toContain("if (!dynamicEffectsEnabled) temporalFoamTextures?.clear();");
    expect(poolMainSource).toContain("p1Metrics.additionalBodyCount = fleetMetrics.bodyCount;");
    expect(poolMainSource).toContain('p1DynamicButton?.addEventListener("click", handleP1DynamicClick);');
    expect(poolMainSource).toContain("setDynamicEffectsEnabled: setP1DynamicEffectsEnabled");
  });

  it("samples one-channel temporal foam in world space and bounds uploads to one per render frame", () => {
    const textureServiceSource = readWaterPcgSource("demo/pool/TemporalFoamTextureService.ts");
    const temporalFoamFieldSource = readWaterPcgSource("runtime/interaction/TemporalFoamField.ts");
    const currentSnapshotSource = readWaterPcgSource("runtime/interaction/WaterCurrentFieldSnapshot.ts");
    const rippleMaterialSource = readWaterPcgSource("demo/pool/InteractivePoolRippleMaterial.ts");
    const poolMainSource = readWaterPcgSource("demo/pool/main.ts");

    expect(textureServiceSource).toContain("TextureFormat.R8");
    expect(textureServiceSource).toContain("if (renderFrame === this._lastRenderFrame) return false;");
    expect(textureServiceSource).toContain("if (!texture || this._mutableMetrics.lastFrameUploadCount >= 1) return;");
    expect(textureServiceSource).toContain("texture.setPixelBuffer(pixels);");
    expect(textureServiceSource).toContain("this.field.clear();");
    expect(textureServiceSource).toContain("this._forceUpload = true;");
    expect(poolMainSource).toContain(
      "temporalFoamTextures?.updateFrame(metrics.renderFrameCount, deltaTime, temporalFoamCurrentSnapshot);"
    );
    expect(poolMainSource).toContain("createUniformWaterCurrentFieldSnapshot({");
    expect(poolMainSource).toContain("sample.tangent[0] * sample.flowSpeed - referenceCurrentX");
    expect(poolMainSource).toContain("const foamSurfaceQueryCountBefore = provider.sampleCount;");
    expect(poolMainSource).toContain(
      "p1Metrics.foamFullSurfaceQueryCount += provider.sampleCount - foamSurfaceQueryCountBefore;"
    );
    expect(temporalFoamFieldSource).not.toContain("WaterLocalFieldProvider");
    expect(temporalFoamFieldSource).not.toContain("sampleLocalField");
    expect(currentSnapshotSource).not.toContain("WaterSurfaceProvider");
    expect(currentSnapshotSource).not.toContain("sampleSurface");
    expect(textureServiceSource).toContain("const DEFAULT_TARGET_UPDATE_RATE_HZ = 30;");

    expect(rippleMaterialSource).toContain("sampler2D material_TemporalFoamTexture;");
    expect(rippleMaterialSource).toContain("(attr.POSITION.xz - material_TemporalFoamRegion.xy)");
    expect(rippleMaterialSource).toMatch(
      /texture2D\(material_TemporalFoamTexture, clamp\(uv, vec2\(0\.0\), vec2\(1\.0\)\)\)\.r/
    );
    expect(poolMainSource).toContain("minX: poolBounds.minX");
    expect(poolMainSource).toContain("minZ: poolBounds.minZ");
    expect(poolMainSource).toContain("inverseSizeX: 1 / (poolBounds.maxX - poolBounds.minX)");
    expect(poolMainSource).toContain("inverseSizeZ: 1 / (poolBounds.maxZ - poolBounds.minZ)");
  });

  it("publishes local-field and underwater hooks through the registered WaterBody", () => {
    const waterBodySource = readWaterPcgSource("runtime/body/WaterBodyRuntime.ts");
    const poolMainSource = readWaterPcgSource("demo/pool/main.ts");

    expect(waterBodySource).toContain("readonly localField?: WaterLocalFieldProvider;");
    expect(waterBodySource).toContain("readonly volume?: WaterVolumeProvider;");
    expect(waterBodySource).toContain("readonly opticalProfile?: WaterOpticalProfile;");
    expect(waterBodySource).toContain("this.localField = config.localField;");
    expect(waterBodySource).toContain("this.volume = config.volume;");
    expect(waterBodySource).toContain("this.opticalProfile = config.opticalProfile;");

    expect(poolMainSource).toContain('const localField = new WaterLocalFieldComposer("interactive-pool");');
    expect(poolMainSource).toContain("localField,");
    expect(poolMainSource).toContain("volume: volumeProvider,");
    expect(poolMainSource).toContain("opticalProfile: POOL_WATER_OPTICAL_PROFILE,");
    expect(poolMainSource).toContain("const underwaterController = new UnderwaterController({");
    expect(poolMainSource).toContain("world: waterWorld,");
    expect(poolMainSource).toContain("cameraFeatures: cameraFeatureBroker,");
    expect(poolMainSource).toContain("postProcess: underwaterPass,");
  });

  it("binds the merged High pool to one recursion-safe planar reflection service", () => {
    const poolMainSource = readWaterPcgSource("demo/pool/main.ts");
    const poolSurfaceSource = readWaterPcgSource("demo/pool/InteractivePoolSurfaceController.ts");

    expect(poolMainSource).toContain("WaterReflectionService.acquire(engine, root, camera)");
    expect(poolMainSource).toContain('preferredSource: "planar"');
    expect(poolMainSource).toContain("waterLayerMask: Layer.Layer30");
    expect(poolMainSource).toContain('highFilterSampleCount: quality === "high" ? 5 : 1');
    expect(poolMainSource).toContain("reflectionService.update(metrics.renderFrameCount)");
    expect(poolMainSource).toContain("reflectionServiceLease.release()");
    expect(poolSurfaceSource).toContain("surfaceEntity.layer = Layer.Layer30");
  });

  it("publishes resolved-profile identity and same-depth Medium/High continuity evidence", () => {
    const poolMainSource = readWaterPcgSource("demo/pool/main.ts");
    const poolTypesSource = readWaterPcgSource("demo/pool/types.ts");
    const underwaterPassSource = readWaterPcgSource("runtime/optics/UnderwaterPostProcessPass.ts");
    const smokeSource = readWaterPcgSource("e2e/p1-water-showcase-smoke.mjs");

    expect(poolMainSource).toContain("createOpticalContinuityReadback");
    expect(poolMainSource).toContain("surfaceProfileFingerprint");
    expect(poolMainSource).toContain("underwaterProfileFingerprint");
    expect(poolMainSource).toContain("shaderBoundUnderwaterProfileFingerprint");
    expect(poolMainSource).toContain("configuredReferenceConsistent");
    expect(poolMainSource).toContain("activeReferenceConsistent");
    expect(poolMainSource).toContain("maximumMediumColorDelta");
    expect(poolMainSource).toContain('quality === "high" ? "high" : "medium"');
    expect(poolTypesSource).toContain('export type InteractivePoolGridQuality = "low" | "medium" | "high";');
    expect(poolTypesSource).toContain("surfaceResolvedProfile: Readonly<ResolvedWaterOpticalProfile>");
    expect(poolTypesSource).toContain("underwaterResolvedProfile: Readonly<ResolvedWaterOpticalProfile>");
    expect(underwaterPassSource).toContain("sanitizeWaterOpticalProfileInto(profile, this._resolvedProfile)");
    expect(underwaterPassSource).toContain("createResolvedWaterOpticalProfileFingerprint");
    expect(smokeSource).toContain("OPTICAL_CONTINUITY_ROUNDS = 3");
    expect(smokeSource).toContain('["medium", "high"]');
    expect(smokeSource).toContain("surface-air");
    expect(smokeSource).toContain("surface-water");
    expect(smokeSource).toContain("maximumMediumColorDelta");
    expect(smokeSource).toContain("writeFile(resultPath");
  });
});
