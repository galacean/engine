import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";
import { createGrasslandsPcgFixture } from "../../demo/grasslands/GrasslandsPcgFixture";
import type { GrasslandsAnchorRockReadback } from "../../demo/grasslands/GrasslandsSceneController";
import {
  createGrasslandsShowcaseAcceptanceApi,
  GRASSLANDS_CAPTURE_DEBUG_MODE,
  GRASSLANDS_CAPTURE_STATES,
  type GrasslandsAcceptanceRuntimeReadback,
  type GrasslandsCausalFeature,
  type GrasslandsShowcaseAcceptanceBridge
} from "../../demo/grasslands/GrasslandsShowcaseAcceptance";
import { HeightfieldWaterDebugMode } from "../../runtime/heightfield/HeightfieldWaterRuntimeEnums";
import type { HeightfieldWaterSurfaceAppearanceFeatureFlags } from "../../runtime/heightfield/types";

function readWaterPcgSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), "utf8");
}

function createRockReadback(id: string): GrasslandsAnchorRockReadback {
  return Object.freeze({
    id,
    state: "default",
    active: true,
    position: Object.freeze([0, -0.25, 0] as const),
    bounds: Object.freeze({
      minimum: Object.freeze([-1, -1, -1] as const),
      maximum: Object.freeze([1, 1, 1] as const)
    }),
    crossesWaterSurface: true,
    sceneDepthContactExpected: true
  });
}

function createRuntimeReadback(): GrasslandsAcceptanceRuntimeReadback {
  const fixture = createGrasslandsPcgFixture();
  return Object.freeze({
    phase: "ready",
    ready: true,
    strictMaterialReady: true,
    finite: true,
    runtimeError: null,
    disposed: false,
    qualityTier: WaterQualityTier.High,
    opticsTier: "high",
    surfaceTime: 12.5,
    runtimeCompiledHash: fixture.descriptorHash,
    effectiveDebugMode: HeightfieldWaterDebugMode.Final,
    appearanceFallbackReason: null,
    foamOctaveCount: 3,
    normal: Object.freeze({
      requested: true,
      active: true,
      source: "tracked",
      assetId: "grasslands-water-normal-1024",
      contentHash: fixture.externalAssetHash,
      expectedContentHash: fixture.externalAssetHash,
      width: 1024,
      height: 1024,
      colorSpace: "linear",
      wrapU: "repeat",
      wrapV: "repeat",
      filter: "bilinear",
      mipmaps: true,
      anisotropy: 1,
      textureDestroyed: false,
      flipGreen: false,
      layerCount: 2,
      tiling: 0.05,
      scrollUvPerSecond: 0.02,
      strength: 0.2,
      ownership: "borrowed",
      fallbackReason: null
    }),
    appearance: Object.freeze({
      requested: true,
      active: true,
      enabled: true,
      assetId: fixture.appearanceAssetId,
      appearanceHash: fixture.appearanceHash,
      variantKey: fixture.appearanceVariantKey,
      featureFlags: Object.freeze({
        externalNormal: true,
        depthTint: true,
        coastalAlpha: true,
        contactFoam: true,
        directSpecular: true
      }),
      depthTint: Object.freeze({
        model: "scene-depth-power",
        enabled: true,
        color: Object.freeze([0.21710525, 0.45953944, 0.55, 1] as const),
        distance: 10,
        exponent: 0.5
      }),
      coastalAlpha: Object.freeze({
        model: "scene-depth",
        enabled: true,
        distance: 0.5
      }),
      contactFoam: Object.freeze({
        model: "scene-depth-voronoi",
        enabled: true,
        worldScale: 2.5,
        timeRate: 1,
        opacity: 0.453,
        contactDistance: 0.1791,
        octaveCount: 3,
        weights: Object.freeze([0.5, 0.25, 0.125]),
        lacunarity: 2,
        suppressRefraction: 1,
        smoothnessReduction: 1
      }),
      fallbackReason: null
    }),
    cameraFeatures: Object.freeze({
      requested: Object.freeze({
        depthTexture: true,
        opaqueTexture: true,
        quality: "high",
        opaqueDownsampling: "none"
      }),
      effective: Object.freeze({
        depthTexture: true,
        opaqueTexture: true,
        activeConsumerCount: 1,
        depthCopyPassCount: 1,
        colorCopyPassCount: 1,
        opaqueDownsampling: "none"
      })
    }),
    directLight: Object.freeze({
      bound: true,
      matchesFixture: true,
      count: 1,
      state: "default",
      enabled: true,
      color: fixture.directLight.color,
      effectiveColor: Object.freeze([1.05, 1.05, 1.05] as const),
      intensity: 1.05,
      forward: fixture.directLight.forward
    }),
    compositionMode: "precomposed-replace",
    depthWriteEnabled: true,
    reflection: Object.freeze({
      contributionEnabled: true,
      requestedSource: "sky",
      effectiveSource: "sky",
      intensity: 1,
      effectiveIntensity: 1,
      fallbackReason: null,
      cameraCount: 0,
      renderTargetCount: 0
    }),
    runtimeSet: Object.freeze({
      activeSetCount: 1,
      activeId: "grasslands-heightfield-water",
      compiledHash: fixture.descriptorHash,
      chunkCount: 6,
      drawCount: 6,
      meshUploadCount: 6,
      perFrameMeshUpload: false,
      activeWaveCount: 0,
      waveStrength: 0,
      gameplayQueryRegistered: false
    }),
    resources: Object.freeze({
      bufferMemory: 1,
      textureMemory: 1,
      totalMemory: 2,
      ownedTextureCount: 1,
      borrowedTextureCount: 1,
      textureCreateCount: 1,
      textureDestroyCount: 0,
      materialCount: 1,
      runtimeSetCreateCount: 1,
      runtimeSetDestroyCount: 0,
      materialCreateCount: 1,
      materialDestroyCount: 0,
      localMapTextureCreateCount: 1,
      localMapTextureDestroyCount: 0,
      meshCreateCount: 6,
      meshDestroyCount: 0,
      sceneMeshCreateCount: 2,
      sceneMeshDestroyCount: 0,
      sceneMaterialCreateCount: 3,
      sceneMaterialDestroyCount: 0,
      sceneEntityCreateCount: 14,
      sceneEntityDestroyCount: 0,
      renderTargetCount: 0,
      reflectionCameraCount: 0,
      cameraCount: 1
    }),
    frame: Object.freeze({
      engineUpdateCount: 60,
      sampleCount: 60,
      fps: 60,
      p95FrameMs: 16.67,
      finite: true
    }),
    camera: Object.freeze({
      mode: "fixed",
      freeControlActive: false,
      movementSpeed: 14,
      position: fixture.camera.position,
      forward: fixture.camera.forward
    }),
    scene: Object.freeze({
      ready: true,
      finite: true,
      fixtureId: fixture.fixtureId,
      fixtureHash: fixture.fixtureHash,
      bounds: fixture.waterBounds,
      terrainEntityCount: 1,
      anchorRockCount: 3,
      activeRockCount: 3,
      scenicRockCount: 7,
      submergedScenicRockCount: 3,
      shoreScenicRockCount: 4,
      contactProbeCount: 3,
      terrainIndexCount: 92160,
      terrainBedIndexCount: 27522,
      terrainBankIndexCount: 64638,
      directLightCount: 1,
      skyboxCount: 0,
      planarCameraCount: 0,
      reflectionProbeCount: 0,
      renderTargetCount: 0,
      anchorRocks: Object.freeze(fixture.anchorRocks.map(({ id }) => createRockReadback(id)))
    }),
    exclusionResources: Object.freeze({
      source: "runtime-observed",
      cameraComponentCount: 1,
      directLightComponentCount: 1,
      skyboxCount: 0,
      planarCameraCount: 0,
      reflectionProbeCount: 0,
      renderTargetCount: 0
    })
  });
}

function createBridge() {
  let runtimeReadback = createRuntimeReadback();
  const calls = {
    flags: [] as Readonly<HeightfieldWaterSurfaceAppearanceFeatureFlags>[],
    refraction: [] as boolean[],
    reflection: [] as boolean[],
    reflectionScenario: [] as string[],
    appearance: [] as boolean[],
    debug: [] as HeightfieldWaterDebugMode[],
    directLight: [] as string[],
    quality: [] as WaterQualityTier[],
    cameraReset: 0,
    restoreAll: 0
  };
  const bridge: GrasslandsShowcaseAcceptanceBridge = {
    readRuntime: () => runtimeReadback,
    setSurfaceAppearanceFeatureFlags(flags) {
      calls.flags.push(flags);
    },
    setAppearanceEnabled(enabled) {
      calls.appearance.push(enabled);
    },
    setRefractionEnabled(enabled) {
      calls.refraction.push(enabled);
    },
    setReflectionEnabled(enabled) {
      calls.reflection.push(enabled);
    },
    setReflectionScenario(scenario) {
      calls.reflectionScenario.push(scenario);
    },
    setDebugMode(mode) {
      calls.debug.push(mode);
      runtimeReadback = Object.freeze({ ...runtimeReadback, effectiveDebugMode: mode });
    },
    setDirectLightState(state) {
      calls.directLight.push(state);
    },
    async setQuality(quality) {
      calls.quality.push(quality);
      runtimeReadback = Object.freeze({
        ...runtimeReadback,
        qualityTier: quality,
        opticsTier: quality === WaterQualityTier.Low ? "off" : quality === WaterQualityTier.High ? "high" : "medium"
      });
    },
    resetHeroCamera() {
      calls.cameraReset++;
    },
    raiseContactProbe: createRockReadback,
    removeContactProbe: createRockReadback,
    restoreContactProbe: createRockReadback,
    restoreAllContactProbes() {
      calls.restoreAll++;
    },
    async readControlledCalibration() {
      throw new Error("Controlled calibration is not configured in this unit bridge.");
    },
    dispose() {
      runtimeReadback = Object.freeze({
        ...runtimeReadback,
        phase: "disposed",
        ready: false,
        strictMaterialReady: false,
        disposed: true
      });
      return api.snapshot();
    }
  };
  const api = createGrasslandsShowcaseAcceptanceApi(createGrasslandsPcgFixture(), bridge);
  return { api, calls };
}

describe("Grasslands Showcase Acceptance", () => {
  it("maps the eight parity capture states to the frozen Debug ABI", () => {
    expect(GRASSLANDS_CAPTURE_STATES).toEqual([
      "hero",
      "detail-normal",
      "refraction",
      "depth-color",
      "contact-foam",
      "coastal-alpha",
      "direct-specular",
      "reflection"
    ]);
    expect(GRASSLANDS_CAPTURE_DEBUG_MODE).toEqual({
      hero: HeightfieldWaterDebugMode.Final,
      "detail-normal": HeightfieldWaterDebugMode.DetailNormal,
      refraction: HeightfieldWaterDebugMode.RefractionUvDelta,
      "depth-color": HeightfieldWaterDebugMode.DepthTint,
      "contact-foam": HeightfieldWaterDebugMode.ContactFoam,
      "coastal-alpha": HeightfieldWaterDebugMode.CoastalAlpha,
      "direct-specular": HeightfieldWaterDebugMode.DirectSpecular,
      reflection: HeightfieldWaterDebugMode.ReflectionColor
    });

    const { api, calls } = createBridge();
    for (const state of GRASSLANDS_CAPTURE_STATES) {
      api.setCaptureState(state);
      expect(api.currentState).toBe(state);
      expect(api.snapshot().requestedDebugMode).toBe(GRASSLANDS_CAPTURE_DEBUG_MODE[state]);
    }
    expect(calls.debug).toEqual(GRASSLANDS_CAPTURE_STATES.map((state) => GRASSLANDS_CAPTURE_DEBUG_MODE[state]));
  });

  it("exposes raw Debug 24/29, Appearance binding, and real DirectLight diagnostic controls", () => {
    const { api, calls } = createBridge();
    api.setDebugMode(HeightfieldWaterDebugMode.SceneDepthDelta);
    expect(api.snapshot().requestedDebugMode).toBe(HeightfieldWaterDebugMode.SceneDepthDelta);
    api.setDebugMode(HeightfieldWaterDebugMode.EffectiveRoughness);
    expect(api.snapshot().requestedDebugMode).toBe(HeightfieldWaterDebugMode.EffectiveRoughness);
    expect(() => api.setDebugMode(30 as never)).toThrow(RangeError);

    api.setAppearanceEnabled(false);
    api.setAppearanceEnabled(true);
    api.setAppearanceEnabled(false);
    expect(calls.appearance).toEqual([false, true, false]);
    expect(api.snapshot().appearanceEnabled).toBe(false);

    api.setDirectLightState("rotated");
    api.setDirectLightState("disabled");
    api.setDirectLightState("default");
    expect(calls.directLight).toEqual(["rotated", "disabled", "default"]);

    api.setReflectionScenario("missing-probe");
    api.setReflectionScenario("analytic-sky");
    expect(calls.reflectionScenario).toEqual(["missing-probe", "analytic-sky"]);
  });

  it("uses fixed uniform gates for five Appearance features and separate refraction/reflection owners", () => {
    const { api, calls } = createBridge();
    api.setCausalFeature("externalNormal", false);
    api.setCausalFeature("depthColor", false);
    api.setCausalFeature("contactFoam", false);
    api.setCausalFeature("coastalAlpha", false);
    api.setCausalFeature("directSpecular", false);
    api.setCausalFeature("refraction", false);
    api.setCausalFeature("reflection", false);

    expect(calls.flags.at(-1)).toEqual({
      externalNormal: false,
      depthTint: false,
      coastalAlpha: false,
      contactFoam: false,
      directSpecular: false
    });
    expect(calls.refraction).toEqual([false]);
    expect(calls.reflection).toEqual([false]);
    expect(api.snapshot().activeAbState).toEqual({
      externalNormal: false,
      refraction: false,
      depthColor: false,
      contactFoam: false,
      coastalAlpha: false,
      directSpecular: false,
      reflection: false
    });
  });

  it("publishes the deterministic fixture identity and restores the strict High Hero state", async () => {
    const { api, calls } = createBridge();
    const fixture = api.fixture;
    expect(api.snapshot()).toMatchObject({
      ready: true,
      strictMaterialReady: true,
      finite: true,
      runtimeError: null,
      caseId: "showcase-grasslands-stylized-water",
      runtime: "grasslands",
      preset: "hero-grasslands",
      waterBodyType: "heightfield",
      descriptorSchema: 1,
      descriptorHash: fixture.descriptorHash,
      fixtureHash: fixture.fixtureHash,
      appearanceHash: fixture.appearanceHash,
      externalAssetHash: fixture.externalAssetHash,
      qualityTier: WaterQualityTier.High,
      surfaceTime: 12.5
    });

    api.setCausalFeature("reflection", false);
    api.setCaptureState("contact-foam");
    await api.setQuality(WaterQualityTier.Low);
    await api.reset();
    expect(calls.quality).toEqual([WaterQualityTier.Low, WaterQualityTier.High]);
    expect(calls.cameraReset).toBe(1);
    expect(calls.restoreAll).toBe(1);
    expect(calls.refraction.at(-1)).toBe(true);
    expect(calls.reflection.at(-1)).toBe(true);
    expect(calls.reflectionScenario.at(-1)).toBe("analytic-sky");
    expect(calls.appearance.at(-1)).toBe(true);
    expect(calls.directLight.at(-1)).toBe("default");
    expect(api.currentState).toBe("hero");
    expect(api.snapshot().activeAbState).toEqual({
      externalNormal: true,
      refraction: true,
      depthColor: true,
      contactFoam: true,
      coastalAlpha: true,
      directSpecular: true,
      reflection: true
    });
  });

  it("fails closed on unknown capture or causal feature names", () => {
    const { api } = createBridge();
    expect(() => api.setCaptureState("unknown" as never)).toThrow(RangeError);
    expect(() => api.setCausalFeature("unknown" as GrasslandsCausalFeature, true)).toThrow(RangeError);
  });

  it("mounts the real engine/loader/scene path and keeps the observed gameplay registry empty", () => {
    const main = readWaterPcgSource("demo/grasslands/main.ts");
    expect(main).toContain("WebGLEngine.create");
    expect(main).toContain("new ShaderCompiler()");
    expect(main).toContain("new GrasslandsAssetLoader");
    expect(main).toContain("new GrasslandsSceneController");
    expect(main).toContain("new HeightfieldWaterCompileWorkerClient");
    expect(main).toContain("new HeightfieldWaterRuntimeController");
    expect(main).toContain("new CameraWaterFeatureBroker");
    expect(main).toContain("runtimeController.setSurfaceTimeOverride(GRASSLANDS_SURFACE_TIME)");
    expect(main).toContain("runtimeController.setCompositionMode(HeightfieldWaterCompositionMode.PrecomposedReplace)");
    expect(main).toContain("runtimeController.setDepthWriteEnabled(true)");
    expect(main).toContain('Object.defineProperty(window, "waterPcgAcceptance"');
    expect(main).toContain("window.waterPcgGrasslands = acceptanceApi");
    expect(main).not.toContain("WaterWorld");

    const activation = main.lastIndexOf("await compileAndActivateImpl(WaterQualityTier.High)");
    const run = main.lastIndexOf("engine.run()");
    expect(activation).toBeGreaterThan(-1);
    expect(run).toBeGreaterThan(activation);
  });

  it("registers teardown before the first await and keeps every async continuation abortable", () => {
    const main = readWaterPcgSource("demo/grasslands/main.ts");
    const beforeUnloadRegistration = main.indexOf('window.addEventListener("beforeunload"');
    const firstAwait = main.indexOf("const createdEngine = await teardownBarrier.track");
    expect(beforeUnloadRegistration).toBeGreaterThan(-1);
    expect(firstAwait).toBeGreaterThan(beforeUnloadRegistration);
    expect(main.match(/if \(lifecycleDisposed\)/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(main).toContain("assetLoader.requestDisposeAfterRuntimeDetach()");
    expect(main).toContain("teardownBarrier.track(assetLoader.load())");
    expect(main).toContain(
      "const createdEngine = await teardownBarrier.track(\n      WebGLEngine.create(engineConfiguration).then((createdEngine) => {"
    );
    expect(main).toContain("engine = createdEngine;");
    expect(main).toContain("teardownBarrier.track(compileOperation)");
    expect(main).toContain("teardownBarrier.track(\n          runtime.replaceActiveIncremental");
    expect(main).toContain("teardownBarrier.requestFinalize()");
    expect(main).toContain("if (revision !== rebuildRevision || lifecycleDisposed) return");
    expect(main).not.toContain("resourcesDisposed");
    expect(main).not.toContain("lifecycleDisposed ? 0");
  });

  it("uses actual Runtime, Scene, and broker facts for strict and lifecycle readback", () => {
    const main = readWaterPcgSource("demo/grasslands/main.ts");
    for (const token of [
      "runtimeController?.resourceMetrics",
      "runtimeController?.surfaceAppearanceFeatureFlags",
      "runtimeController?.compositionMode",
      "runtimeController?.depthWriteEnabled",
      "runtimeController?.refractionEnabled",
      'scene?.directLight.state === "default"',
      "directLightMatchesFixture",
      "vectorsMatch(scene.directLight.forward, fixture.directLight.forward)",
      "observeGrasslandsExcludedResources(activeScene, sceneController?.camera, optics)",
      "isGrasslandsExclusionClean(exclusionResources)",
      "runtimeController?.surfaceTimeOverride",
      'optics?.requestedSource === "sky"',
      'optics.effectiveSource === "sky"',
      "appearance.flipGreen === GRASSLANDS_NORMAL_FLIP_GREEN",
      "ready: operationalReady",
      "perFrameMeshUpload: perFrameMeshUploadDetected"
    ]) {
      expect(main, token).toContain(token);
    }
    const preset = readWaterPcgSource("demo/grasslands/GrasslandsPcgPreset.ts");
    expect(preset).toContain("flipGreen: GRASSLANDS_NORMAL_FLIP_GREEN");
    expect(readWaterPcgSource("demo/grasslands/GrasslandsRuntimeObservation.ts")).toContain(
      'source: "runtime-observed"'
    );
    expect(main).not.toContain("drawCount: runtimeController?.activeChunkCount");
    expect(main).not.toContain("materialCount: activeSetCount");

    const cameraControl = readWaterPcgSource("demo/showcase/ShowcaseCameraControl.ts");
    expect(cameraControl).toContain("@galacean/engine-toolkit-controls/dist/es/FreeControl.js");
    expect(cameraControl).not.toContain('from "@galacean/engine-toolkit-controls";');
  });

  it("keeps borrowed-texture disposal ahead of the settled Engine finalizer", () => {
    const main = readWaterPcgSource("demo/grasslands/main.ts");
    const cleanupStart = main.indexOf('cleanupImpl = (mode = "manual")');
    const cleanupEnd = main.indexOf("const resizeCanvas", cleanupStart);
    const cleanup = main.slice(cleanupStart, cleanupEnd);
    const immediateCleanupTokens = [
      "rebuildRevision++",
      "runtimeController.setSurfaceAppearanceBinding(undefined)",
      "runtimeController.destroy()",
      "activeResource.dispose()",
      "compileWorker.dispose()",
      "cameraFeatureBroker.destroy()",
      "teardownBarrier.requestFinalize()"
    ];
    let previousIndex = -1;
    for (const token of immediateCleanupTokens) {
      const index = cleanup.indexOf(token, previousIndex + 1);
      expect(index, token).toBeGreaterThan(previousIndex);
      previousIndex = index;
    }

    const finalizerStart = main.indexOf("finalizeEngineTeardown =");
    const finalizerEnd = main.indexOf('cleanupImpl = (mode = "manual")', finalizerStart);
    const finalizer = main.slice(finalizerStart, finalizerEnd);
    const settledFinalizerTokens = [
      "releaseRuntimeBorrow()",
      "assetLoader.requestDisposeAfterRuntimeDetach()",
      "cameraController.destroy()",
      "sceneController.destroy()",
      "root.destroy()",
      "engine.destroy()",
      'writeLifecycleJournal("final")'
    ];
    previousIndex = -1;
    for (const token of settledFinalizerTokens) {
      const index = finalizer.indexOf(token, previousIndex + 1);
      expect(index, token).toBeGreaterThan(previousIndex);
      previousIndex = index;
    }
    expect(cleanup).toContain('writeLifecycleJournal(teardownBarrier.finalized ? "final" : "interim")');
  });

  it("keeps structured M3 approval and Regression Golden validation fail closed", () => {
    const parity = readWaterPcgSource("e2e/grasslands-water-parity.mjs");
    expect(parity).toContain("function hasExactObjectKeys(value, expectedKeys)");
    expect(parity).toContain("hasExactObjectKeys(captureHashes, CAPTURE_STATES)");
    expect(parity).not.toContain("JSON.stringify(Object.keys(captureHashes))");
    expect(parity).toContain('if (golden.status === "pending-m3-user-approval")');
    expect(parity).toContain('if (golden.status !== "approved")');
    expect(parity).toContain('failures: ["regressionGolden must be an object"]');
    expect(parity).toContain("hasExactObjectKeys(golden.states, CAPTURE_STATES)");
    expect(parity).toContain("if (!isRecord(definition))");
    expect(parity).toContain('const fileIsValid = typeof definition.file === "string"');
    expect(parity).toContain("if (!fileIsValid || !hashIsValid || !dimensionsAreValid) continue");
    expect(parity).toContain("Golden metadata is unreadable");
    expect(parity).toContain("Golden PNG is unreadable");
    expect(parity).toContain("Golden PNG is invalid");
    expect(parity).toContain("Golden comparison failed");
    expect(parity).toContain("approval capture-state SHA-256 map does not define exactly the eight reviewed states");
    expect(parity).toContain("approval.record?.reviewedEvidence?.captureStatePngSha256?.[state] === definition.sha256");
    expect(parity).not.toContain("captureHashes[state] === expected.captureHashes[state]");
    expect(parity).not.toContain("record.reviewedEvidence?.sideBySidePngSha256 === expected.sideBySidePngSha256");

    const failedStatusIndex = parity.indexOf(
      'referenceParityStatus === "failed" || report.regressionGoldenEvaluation.status === "failed"'
    );
    const pendingStatusIndex = parity.indexOf(
      'referenceParityStatus === "pending-user-review" || report.regressionGoldenEvaluation.status === "pending"'
    );
    expect(failedStatusIndex).toBeGreaterThan(-1);
    expect(pendingStatusIndex).toBeGreaterThan(failedStatusIndex);
  });
});
