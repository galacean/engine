import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { TextureCube } from "@galacean/engine-core";
import { Downsampling, Layer } from "@galacean/engine-core";
import { describe, expect, it } from "vitest";
import { findWaterPcgCase } from "../../demo/navigation";
import { DEMO_REFLECTION_PROBE_PROVENANCE } from "../../demo/examples/water-optics-lab/DemoReflectionProbe";
import {
  createWaterOpticsLabMetrics,
  type WaterOpticsLabMetricsInput,
  writeWaterOpticsLabMetrics
} from "../../demo/examples/water-optics-lab/WaterOpticsLabMetrics";

function readWaterPcgSource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../../${relativePath}`, import.meta.url)), "utf8");
}

function readWorldGallerySource(relativePath: string): string {
  return readFileSync(fileURLToPath(new URL(`../../../../${relativePath}`, import.meta.url)), "utf8");
}

describe("Water Optics Lab integration contract", () => {
  it("registers an isolated hash route and template outside the River/Ocean examples registry", () => {
    expect(findWaterPcgCase("water-optics-lab")).toEqual({
      id: "water-optics-lab",
      label: "水反射与折射",
      kind: "optics-lab"
    });
    const router = readWaterPcgSource("demo/router.ts");
    const html = readWaterPcgSource("index.html");
    const registry = readWaterPcgSource("demo/examples/index.ts");
    expect(router).toMatch(/case "optics-lab":\s*void import\("\.\/examples\/water-optics-lab\/main"\)/);
    expect(html).toContain('template id="water-pcg-optics-lab-template"');
    expect(registry).not.toContain("water-optics-lab");
  });

  it("exposes the complete P0/P1 Demo controls without claiming unapproved P2 paths", () => {
    const controller = readWaterPcgSource("demo/examples/water-optics-lab/WaterOpticsLabController.ts");
    const scene = readWaterPcgSource("demo/examples/water-optics-lab/WaterOpticsLabScene.ts");
    const constants = readWaterPcgSource("demo/examples/water-optics-lab/constants.ts");
    const html = readWaterPcgSource("index.html");

    expect(controller).toContain('preset === "cross-body-optics" || preset === "lifecycle-stress"');
    expect(controller).toContain("async setWaterBody(body: WaterOpticsWaterBody)");
    expect(controller).toContain('return this._waterBody === "river" ? "probe" : "planar";');
    expect(controller).toContain('if (mode === "ssr") throw new Error');
    expect(controller).toContain("setReflectorTime(seconds: number)");
    expect(controller).toContain("setCameraMovementEnabled(enabled: boolean)");
    expect(controller).toContain("setFreeCameraEnabled(enabled: boolean)");
    expect(controller).toContain("cameraCut(): void");
    expect(controller).toContain("setLocalFoamMaskEnabled(enabled: boolean)");
    expect(controller).toContain("getPlanarOrientationExpectedPoints()");
    expect(scene).toContain('this.root.createChild("moving-reflector-boat")');
    expect(scene).toContain("Math.sin(phase) * motion.halfTravelX");
    expect(scene).toContain("setPlanarOrientationMarkersVisible(visible: boolean)");
    expect(constants).toContain('"planar-too-close": Object.freeze');
    expect(constants).toContain('"planar-underwater": Object.freeze');
    expect(constants).toContain('"planar-back-facing": Object.freeze');
    expect(html).toContain('data-optics-reflection="auto"');
    expect(html).toMatch(/data-optics-reflection="ssr"\s+disabled/);
    expect(html).toMatch(/data-optics-composition="dedicated"[\s\S]*?disabled/);
    expect(html).toContain('data-optics-water-body="pool"');
    expect(html).toContain('data-optics-water-body="river"');
    expect(html).toContain('data-optics-water-body="ocean"');
    expect(html).toContain('data-optics-water-body="multi"');
    expect(html).toContain('data-optics-preset="lifecycle-stress"');
    expect(html).toContain("data-optics-move-reflector");
    expect(html).toContain("data-optics-move-camera");
    expect(html).toContain("data-optics-free-camera");
    expect(html).toContain("data-optics-camera-cut");
    expect(html).toContain("data-optics-local-foam-mask");
  });

  it("integrates FreeControl without changing the fixed golden-scene default", () => {
    const controller = readWaterPcgSource("demo/examples/water-optics-lab/WaterOpticsLabController.ts");
    const main = readWaterPcgSource("demo/examples/water-optics-lab/main.ts");
    const metrics = readWaterPcgSource("demo/examples/water-optics-lab/WaterOpticsLabMetrics.ts");
    const types = readWaterPcgSource("demo/examples/water-optics-lab/types.ts");

    expect(main).toContain('import { FreeControl } from "@galacean/engine-toolkit-controls";');
    expect(main).toContain("class WaterOpticsLabFreeCameraControl extends FreeControl");
    expect(main).toContain("nextControl.floorMock = false;");
    expect(main).toContain("nextControl.movementSpeed = WATER_OPTICS_FREE_CAMERA_MOVEMENT_SPEED;");
    expect(main).toContain("nextControl.afterCameraUpdate = () => controller.tick();");
    expect(main).toContain("if (!controller.freeCameraEnabled) controller.tick();");
    expect(controller).toContain("private _freeCameraEnabled = false;");
    expect(controller).toContain("this._cameraMovementEnabled = false;");
    expect(controller).toContain("this._options.setFreeCameraControlEnabled(enabled);");
    expect(controller).toContain(
      'throw new Error("Formal Water Optics performance capture requires Free Camera off.")'
    );
    expect(metrics).toContain("element.dataset.freeCameraEnabled");
    expect(metrics).toContain('metrics.freeCameraEnabled ? "free" : metrics.cameraMovementEnabled ? "auto" : "fixed"');
    expect(types).toContain("readonly freeCameraEnabled: boolean;");
    expect(types).toContain("setFreeCameraEnabled(enabled: boolean): void;");
  });

  it("groups the debug controls and wires the highest implemented default into runtime sampling", () => {
    const constants = readWaterPcgSource("demo/examples/water-optics-lab/constants.ts");
    const controller = readWaterPcgSource("demo/examples/water-optics-lab/WaterOpticsLabController.ts");
    const html = readWaterPcgSource("index.html");

    expect(constants).toContain('tier: "high" as WaterOpticsTier');
    expect(constants).toContain('reflectionMode: "planar" as const');
    expect(constants).toContain("planarFilterEnabled: true");
    expect(controller).toContain("reflectionSampling: { highFilterSampleCount: this._planarFilterEnabled ? 5 : 1 }");
    expect(controller).toContain("this.setPlanarFilterEnabled(this._planarFilterEnabled);");
    expect(html).toContain('class="optics-control-groups"');
    for (const heading of [
      "Quality",
      "Time &amp; Motion",
      "Camera",
      "Test Scene",
      "Reflection",
      "Refraction &amp; Composite",
      "Planar",
      "Diagnostics"
    ]) {
      expect(html).toContain(`>${heading}`);
    }
    expect(html).toContain("@media (max-width: 680px)");
  });

  it("mounts exactly one optional Stats Script on the source camera and keeps it display-only", () => {
    const main = readWaterPcgSource("demo/examples/water-optics-lab/main.ts");
    const controller = readWaterPcgSource("demo/examples/water-optics-lab/WaterOpticsLabController.ts");
    const packageJson = readWorldGallerySource("package.json");
    const vite = readWorldGallerySource("vite.config.js");

    expect(main).toContain('import { Stats } from "@galacean/engine-toolkit-stats";');
    expect(main).toContain("if (statsEnabled) cameraEntity.addComponent(Stats);");
    expect(main.match(/addComponent\(Stats\)/g)).toHaveLength(1);
    expect(main).not.toContain("Stats.hookRequest");
    expect(main).not.toMatch(/\bCore\b/);
    expect(controller).toContain('statsRole: "display-only"');
    expect(controller).toContain("if (!this._options.statsEnabled) return;");
    expect(controller).toContain("this._statsPanels.push(...document.querySelectorAll");
    expect(controller).toContain('throw new Error("Formal Water Optics performance capture requires stats=0.")');
    expect(packageJson).toContain('"@galacean/engine-toolkit-stats": "latest"');
    expect(vite).toContain('"@galacean/engine-toolkit-stats"');
  });

  it("keeps formal performance evidence separate from Stats and exposes an auditable Gate", () => {
    const controller = readWaterPcgSource("demo/examples/water-optics-lab/WaterOpticsLabController.ts");
    const sampler = readWaterPcgSource("demo/examples/water-optics-lab/WaterOpticsPerformanceSampler.ts");
    const performanceE2e = readWaterPcgSource("e2e/water-optics-performance.mjs");

    expect(sampler).toContain("warmupDurationMs: 2000");
    expect(sampler).toContain("minimumFrameCount: 300");
    expect(sampler).toContain("minimumSampleDurationMs: 5000");
    expect(sampler).toContain('mode: "formal"');
    expect(sampler).toContain("phaseSequence: WATER_OPTICS_PERFORMANCE_PHASES");
    expect(sampler).toContain("statsEnabled: false");
    expect(sampler).toContain('statsRole: "display-only"');
    expect(sampler).toContain('gpuTimerStatus: "valid" | "unavailable" | "disjoint"');
    expect(sampler).toContain('"formal-total-optics" | "planar-pass-sub-gate"');
    expect(sampler).toContain("gpuCaptureMeetsSamplingProtocol");
    expect(sampler).toContain("measured: null");
    expect(sampler).toContain('overallStatus: "pass" | "fail" | "incomplete" | "smoke-only"');
    expect(sampler).not.toMatch(/planarP95Ms:\s*0/);
    expect(sampler).not.toMatch(/compositeP95Ms:\s*0/);
    expect(sampler).not.toMatch(/ssrP95Ms:\s*0/);

    expect(controller).toContain("engineMemory.textureMemory");
    expect(controller).toContain("engineMemory.bufferMemory");
    expect(controller).toContain("engineMemory.totalMemory");
    expect(controller).toContain("cameraFeatureBytes");
    expect(controller).toContain("planarBytes");
    expect(controller).toContain("probeBytes");
    expect(controller).toContain("compositeBytes: 0");
    expect(controller).toContain("historyBytes: 0");
    expect(controller).not.toContain("performance.memory");

    expect(performanceE2e).toContain('process.env.WATER_OPTICS_PERF_FAST === "1"');
    expect(performanceE2e).toContain('mode: "smoke"');
    expect(performanceE2e).toContain('status === "pass"');
    expect(performanceE2e).toContain('report.gate.frameStatus === "pass"');
    expect(performanceE2e).toContain('report.gpu.status === "unavailable"');
    expect(performanceE2e).toContain("report.gate.checks.opticsGpuP95Ms.measured === null");
    expect(performanceE2e).toContain('"frame-envelope" ? "formal-total-optics-gate" : "planar-pass-sub-gate"');
    expect(performanceE2e).toContain("WATER_OPTICS_PERF_SCENARIO");
    expect(performanceE2e).toContain('"refraction-only"');
    expect(performanceE2e).toContain('"refraction-plus-planar"');
    expect(performanceE2e).toContain("schemaVersion: 4");
    expect(performanceE2e).toContain('formalStatsQueryValue: "0"');
    expect(performanceE2e).toContain("gpuEvidenceStatus");
    expect(performanceE2e).toContain('finalReport.status === "incomplete"');
  });

  it("uses the Heightfield runtime without pulling PhysX into the deterministic optics scene", () => {
    const main = readWaterPcgSource("demo/examples/water-optics-lab/main.ts");
    const fixture = readWaterPcgSource("demo/examples/water-optics-lab/WaterOpticsLabFixture.ts");
    expect(main).toContain("HeightfieldWaterRuntimeController");
    expect(main).toContain("CameraWaterFeatureBroker");
    expect(main).toContain("WaterReflectionService");
    expect(main).not.toContain("PhysX");
    expect(fixture).toContain("seed: 0x0f71c5");
  });

  it("fail-closes P0 calibration and local Golden inputs while keeping the Planar marker hidden by default", () => {
    const controller = readWaterPcgSource("demo/examples/water-optics-lab/WaterOpticsLabController.ts");
    const scene = readWaterPcgSource("demo/examples/water-optics-lab/WaterOpticsLabScene.ts");
    const types = readWaterPcgSource("demo/examples/water-optics-lab/types.ts");
    const visualE2e = readWaterPcgSource("e2e/water-optics-p0-visual.mjs");
    const smokeE2e = readWaterPcgSource("e2e/water-optics-p0-smoke.mjs");
    const mediumBaselineSchema = JSON.parse(readWaterPcgSource("e2e/baselines/water-optics/p0/medium/roi.json"));
    const highBaselineSchema = JSON.parse(readWaterPcgSource("e2e/baselines/water-optics/p0/high/roi.json"));

    expect(types).toContain('export type WaterOpticsCalibrationMode = "none" | "cpu-reference" | "pure-transmission";');
    expect(types).toContain("getPlanarAnchorExpectedPoint()");
    expect(types).toContain("analyzeReferencePixel(input: WaterOpticsReferencePixelInput)");
    expect(controller).toContain("this._options.waterRuntime.setOpticsCalibrationMode(runtimeMode);");
    expect(controller).toContain("return analyzeWaterOpticsReferencePixel({ ...input, profile });");
    expect(scene).toContain("entity.isActive = false;");
    expect(scene).toContain("setPlanarAnchorVisible(visible: boolean)");
    expect(visualE2e).toContain('"pure-transmission"');
    expect(visualE2e).toContain('"cpu-reference"');
    expect(visualE2e).toContain("planarAnchorMaximumErrorPixels: 3");
    expect(visualE2e).toContain('"planar-anchor-reflection-hidden-b"');
    expect(visualE2e).toContain('"planar-anchor-reflection-visible"');
    expect(visualE2e).toContain("finalPlanarAnchor.passed");
    expect(visualE2e).toContain("reflectionMarkerNegativeControl.significantPixelCount === 0");
    expect(visualE2e).toContain("pureTransmissionMaximumMad: 2 / 255");
    expect(visualE2e).toContain("referenceMaximumChannelError: 2 / 255");
    expect(visualE2e).toContain('"reflection-source",');
    expect(visualE2e).toContain('"planar-uv",');
    expect(visualE2e).toContain('"clip-side",');
    expect(visualE2e).toContain("analyzeDebugRoiSignal");
    expect(visualE2e).toContain('extendedDebugSignals["reflection-source"].nonBlackPixelRatio >= 0.5');
    expect(visualE2e).toContain('["planar-too-close", "planar-camera-too-close"]');
    expect(visualE2e).toContain('["planar-underwater", "planar-camera-underwater"]');
    expect(visualE2e).toContain('["planar-back-facing", "planar-plane-back-facing"]');
    expect(visualE2e).toContain("const samples = await sampleRuntimeFrames(page, 30)");
    expect(visualE2e).toContain('"planar-micro-normal-distortion"');
    expect(visualE2e).toContain("planarMicroNormalDifference.srgbDecodedLinear.meanAbsoluteChannel >= 0.001");
    expect(visualE2e).toContain("analyzeDominantColorCoverage");
    expect(visualE2e).toContain("revealedReflectionPixelDelta");
    expect(visualE2e).toContain("WATER_OPTICS_P0_BASELINE_ROOT");
    expect(visualE2e).toContain('await readFile(schemaPath, "utf8")');
    expect(visualE2e).toContain("entry?.file === fileName");
    expect(visualE2e).toContain('createHash("sha256").update(bytes).digest("hex")');
    expect(visualE2e).toContain("sha256 === entry.sha256");
    expect(visualE2e).toContain('dataUrl: `data:image/png;base64,${bytes.toString("base64")}`');
    expect(visualE2e).toContain("committedBaseline.dataUrl");
    expect(visualE2e).toContain("WATER_OPTICS_P0_BASELINE_REVIEW_REASON");
    expect(visualE2e).toContain('gate: "water-optics-p0-baseline-review"');
    expect(visualE2e).toContain('const oldPath = resolve(reviewDirectory, "old.png")');
    expect(visualE2e).toContain('const nextPath = resolve(reviewDirectory, "new.png")');
    expect(visualE2e).toContain('const diffPath = resolve(reviewDirectory, "diff.png")');
    expect(visualE2e).not.toContain("fetch(imageUrl");
    expect(visualE2e.indexOf("await loadCommittedBaselines(tier)")).toBeLessThan(
      visualE2e.indexOf("await chromium.launch")
    );
    expect(smokeE2e).toContain('import { mkdir, writeFile } from "node:fs/promises";');
    expect(smokeE2e).toContain("function readGitProvenance()");
    expect(smokeE2e).toContain("source: readGitProvenance()");
    expect(smokeE2e).toContain('report.reportPath = resolve(OUTPUT_DIRECTORY, "result.json")');
    expect(smokeE2e).toContain("await writeFile(report.reportPath");
    for (const schema of [mediumBaselineSchema, highBaselineSchema]) {
      expect(schema.schemaVersion).toBe(3);
      expect(schema.fixtureVisualHash).toBe("0349ff4d5df5f19b07e99e6b05eeac8887e71712bad839c2599dbaae29111e8b");
      expect(schema.fixtureVisualState).toMatchObject({
        planarOrientationMarkersVisible: true,
        localFoamMaskEnabled: true,
        reflectorVisible: true,
        reflectorTime: 12.5,
        featureFlags: { waves: true, microNormals: true, foam: true }
      });
      expect(Object.entries(schema.baselines)).toHaveLength(3);
      for (const [fileName, entry] of Object.entries<{ file: string; sha256: string }>(schema.baselines)) {
        expect(entry.file).toBe(fileName);
        expect(entry.sha256).toMatch(/^[a-f0-9]{64}$/);
      }
    }
  });

  it("makes precomposed Blend-Off ordering an explicit renderer-priority and pixel A/B contract", () => {
    const runtime = readWaterPcgSource("runtime/heightfield/HeightfieldWaterRuntimeController.ts");
    const constants = readWaterPcgSource("demo/examples/water-optics-lab/constants.ts");
    const scene = readWaterPcgSource("demo/examples/water-optics-lab/WaterOpticsLabScene.ts");
    const controller = readWaterPcgSource("demo/examples/water-optics-lab/WaterOpticsLabController.ts");
    const visualE2e = readWaterPcgSource("e2e/water-optics-p0-visual.mjs");

    expect(runtime).toContain("renderer.priority = this._renderPriority;");
    expect(runtime).toContain("for (const chunk of runtimeSet.chunks) chunk.renderer.priority = priority;");
    expect(runtime).toContain("material.shaderData.getInt(HEIGHTFIELD_WATER_SHADER_PROPERTY.blendEnabled)");
    expect(constants).toContain("WATER_OPTICS_PRECOMPOSED_RENDER_PRIORITY = -100");
    expect(scene).toContain("WATER_OPTICS_TRANSPARENT_SENTINEL_NORMAL_PRIORITY = 0");
    expect(scene).toContain("WATER_OPTICS_TRANSPARENT_SENTINEL_BEFORE_WATER_PRIORITY = -200");
    expect(scene).toContain("material.isTransparent = true;");
    expect(controller).toContain("this._options.waterRuntime.setRenderPriority(renderPriority);");
    expect(controller).toContain("waterRendererPriority < runtime.transparentSentinelNormalPriority");
    expect(visualE2e).toContain('setTransparentOrderingProbeMode", "after-water"');
    expect(visualE2e).toContain('setTransparentOrderingProbeMode", "before-water"');
    expect(visualE2e).toContain("transparentOrderingContractSatisfied");
    expect(visualE2e).toContain("transparentOrderingProbeWaterFirst");
  });

  it("binds one deterministic procedural Probe and exposes auditable Probe diagnostics", () => {
    const main = readWaterPcgSource("demo/examples/water-optics-lab/main.ts");
    const types = readWaterPcgSource("demo/examples/water-optics-lab/types.ts");
    const metrics = readWaterPcgSource("demo/examples/water-optics-lab/WaterOpticsLabMetrics.ts");

    expect(main).toContain("const reflectionProbe = new DemoReflectionProbe(engine);");
    expect(main).toContain("reflectionService.setProbeTexture(reflectionProbe.texture);");
    expect(main).toContain("reflectionService.setProbeTexture(undefined);");
    expect(main).toContain("reflectionProbe.destroy();");
    expect(types).toContain("readonly probeTextureAvailable: boolean;");
    expect(types).toContain("readonly probeTextureBound: boolean;");
    expect(types).toContain("readonly probeResourceBytes: number;");
    expect(types).toContain("readonly probeFaceHashes:");
    expect(types).toContain("readonly probeProvenance:");
    expect(metrics).toContain('binding?.resolvedSource === "probe" && binding.probeTexture !== undefined');
    expect(metrics).toContain("element.dataset.probeTextureBound");
    expect(metrics).toContain("element.dataset.probeFaceHashes = JSON.stringify(metrics.probeFaceHashes);");
    expect(metrics).toContain("element.dataset.probeProvenance = JSON.stringify(metrics.probeProvenance);");
  });

  it("publishes the resolved Probe binding, bytes, hashes, and provenance through API and DOM snapshots", () => {
    const probeTexture = {} as TextureCube;
    const faceHashes = Object.freeze({
      positiveX: "px",
      negativeX: "nx",
      positiveY: "py",
      negativeY: "ny",
      positiveZ: "pz",
      negativeZ: "nz"
    });
    const input = {
      state: {
        ready: true,
        requestedTier: "high",
        resolvedTier: "high",
        preset: "reflection-correctness",
        cameraPreset: "reflection-front",
        waterBody: "pool",
        opticsMetricConsumerId: "water-optics-lab",
        reflectionMode: "probe",
        reflectionSource: "probe",
        refractionEnabled: true,
        compositionMode: "legacy",
        depthWriteEnabled: false,
        waterRendererPriority: -100,
        activeWaterRendererPriority: -100,
        waterBlendEnabled: false,
        transparentOrderingProbeMode: "hidden",
        transparentSentinelPriority: 0,
        transparentSentinelNormalPriority: 0,
        transparentSentinelTransparent: true,
        transparentOrderingContractSatisfied: true,
        transparentOrderingProbeWaterFirst: false,
        planarClipEnabled: true,
        debugView: "final",
        calibrationMode: "none",
        calibrationFeatureFlags: Object.freeze({ waves: true, microNormals: true, foam: true }),
        calibrationReferenceCompositionEnabled: false,
        calibrationEffectiveFresnelOverride: undefined,
        opticalDepthNormalizationMeters: 4,
        planarAnchorVisible: false,
        planarOrientationMarkersVisible: true,
        localFoamMaskEnabled: true,
        localFoamMaskCenterXZ: [-6, 1.5] as const,
        localFoamMaskHalfSizeXZ: [3.25, 4.25] as const,
        localFoamMaskFeatherMeters: 0.45,
        localFoamMaskSuppressesRefraction: true,
        reflectorMovementEnabled: true,
        reflectorVisible: true,
        reflectorTimeOverrideActive: false,
        reflectorAnimating: false,
        reflectorTime: 12.5,
        reflectorWorldPosition: [1, 0.62, -7.85] as const,
        cameraMovementEnabled: false,
        freeCameraEnabled: false,
        cameraWorldPosition: [0, 5.6, 18] as const,
        cameraWorldForward: [0, -0.22, -0.98] as const,
        cameraCutCount: 0,
        frozen: true,
        surfaceTime: 12.5,
        statsEnabled: false,
        statsPanelVisible: false,
        sourceHash: "fixture-hash",
        fixtureObjectCount: 15,
        waterBodyCount: 1,
        runtimeError: ""
      },
      cameraFeatures: {
        activeConsumerCount: 1,
        activeConsumerIds: Object.freeze(["water-optics-lab"]),
        depthTextureRequested: true,
        opaqueTextureRequested: true,
        depthCopyPassCount: 1,
        colorCopyPassCount: 1,
        incrementalDepthCopyPassCount: 1,
        incrementalColorCopyPassCount: 1,
        totalDepthCopyPassCount: 1,
        totalColorCopyPassCount: 1,
        underwaterRequested: false,
        postProcessEnabled: false,
        opaqueTextureDownsampling: Downsampling.None,
        estimatedRenderTargetBytes: 1024,
        incrementalEstimatedRenderTargetBytes: 1024,
        totalEstimatedRenderTargetBytes: 1024
      },
      reflection: {
        activeConsumerCount: 1,
        planarRequestCount: 0,
        waterLayerMask: Layer.Layer30,
        planarCameraCullingMask: Layer.Everything & ~Layer.Layer30,
        waterLayerExcludedFromPlanar: true,
        planarCameraCount: 0,
        planarUpdateCount: 0,
        planarSkippedUpdateCount: 0,
        planarFailureCount: 0,
        renderTargetCreateCount: 0,
        renderTargetDestroyCount: 0,
        renderTargetWidth: 0,
        renderTargetHeight: 0,
        estimatedRenderTargetBytes: 0,
        lastPlanarDrawCount: 0,
        totalPlanarDrawCount: 0,
        lastPlanarRenderCpuMs: 0,
        planarRenderCpuP95Ms: 0,
        planarGpuSampleCount: 0
      },
      reflectionBinding: {
        requestedSource: "probe",
        resolvedSource: "probe",
        probeTexture
      },
      probe: {
        textureAvailable: true,
        resourceBytes: 393216,
        faceHashes,
        provenance: DEMO_REFLECTION_PROBE_PROVENANCE
      },
      engineMemory: { textureMemory: 100, bufferMemory: 200, totalMemory: 300 }
    } satisfies WaterOpticsLabMetricsInput;

    const metrics = createWaterOpticsLabMetrics(input);
    expect(metrics).toMatchObject({
      resolvedReflectionSource: "probe",
      reflectionMode: "probe",
      waterBody: "pool",
      opticsMetricConsumerId: "water-optics-lab",
      localFoamMaskEnabled: true,
      localFoamMaskSuppressesRefraction: true,
      reflectorTime: 12.5,
      reflectorTimeOverrideActive: false,
      reflectorAnimating: false,
      freeCameraEnabled: false,
      cameraWorldPosition: [0, 5.6, 18],
      materialReflectionSource: "sky",
      planarFilterSampleCount: 1,
      planarClipEnabled: true,
      waterRendererPriority: -100,
      activeWaterRendererPriority: -100,
      waterBlendEnabled: false,
      transparentOrderingContractSatisfied: true,
      probeTextureAvailable: true,
      probeTextureBound: true,
      probeResourceBytes: 393216,
      probeFaceHashes: faceHashes,
      probeProvenance: DEMO_REFLECTION_PROBE_PROVENANCE
    });
    expect(Object.isFrozen(metrics)).toBe(true);

    const element = { dataset: {}, querySelector: () => null } as unknown as HTMLDListElement;
    writeWaterOpticsLabMetrics(element, metrics);
    expect(element.dataset).toMatchObject({
      resolvedReflectionSource: "probe",
      reflectionMode: "probe",
      waterBody: "pool",
      opticsMetricConsumerId: "water-optics-lab",
      localFoamMaskEnabled: "true",
      localFoamMaskSuppressesRefraction: "true",
      reflectorTime: "12.5",
      reflectorTimeOverrideActive: "false",
      reflectorAnimating: "false",
      freeCameraEnabled: "false",
      cameraWorldPosition: JSON.stringify([0, 5.6, 18]),
      cameraWorldForward: JSON.stringify([0, -0.22, -0.98]),
      materialReflectionSource: "sky",
      planarFilterSampleCount: "1",
      planarClipEnabled: "true",
      waterRendererPriority: "-100",
      activeWaterRendererPriority: "-100",
      waterBlendEnabled: "false",
      transparentOrderingProbeMode: "hidden",
      transparentSentinelPriority: "0",
      transparentSentinelNormalPriority: "0",
      transparentSentinelTransparent: "true",
      transparentOrderingContractSatisfied: "true",
      transparentOrderingProbeWaterFirst: "false",
      probeTextureAvailable: "true",
      probeTextureBound: "true",
      probeResourceBytes: "393216",
      probeFaceHashes: JSON.stringify(faceHashes),
      probeProvenance: JSON.stringify(DEMO_REFLECTION_PROBE_PROVENANCE)
    });
  });

  it("exposes immutable diagnostic snapshots, explicit Experimental fallback, and cleanup", () => {
    const controller = readWaterPcgSource("demo/examples/water-optics-lab/WaterOpticsLabController.ts");
    const metrics = readWaterPcgSource("demo/examples/water-optics-lab/WaterOpticsLabMetrics.ts");
    const main = readWaterPcgSource("demo/examples/water-optics-lab/main.ts");

    expect(controller).toContain('this._tierFallbackReason = "water-optics-experimental-resolved-high";');
    expect(metrics).toContain("experimentalFeaturesEnabled: false");
    expect(metrics).toContain("return Object.freeze({");
    expect(metrics).toContain("element.dataset.requestedTier");
    expect(metrics).toContain("element.dataset.planarRenderTargetBytes");
    expect(main).toContain("window.waterPcgOptics = controller;");
    expect(main).toContain("window.waterPcgOptics = undefined;");
    expect(main).toContain("WaterReflectionService.acquire(engine, root, camera");
    expect(main).toContain("reflectionServiceLease.release();");
    expect(main).toContain("cameraFeatures.destroy();");
    expect(main).toContain("waterRuntime.destroy();");
    expect(main).toContain("compileWorker.dispose();");
    expect(main).toContain("labScene.destroy();");
  });
});
