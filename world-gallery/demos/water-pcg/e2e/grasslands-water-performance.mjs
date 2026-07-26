import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

import { chromium } from "@playwright/test";

import {
  assertAcceptance,
  assertCanvasHealthy,
  assertNoPageErrors,
  collectNonFinite,
  collectPageDiagnostics,
  collectWebGlEnvironment,
  createRunContext,
  DEFAULT_WATER_PCG_URL,
  readCanvasProbe,
  serializeError,
  SOFTWARE_RENDERER_PATTERN,
  summarizeCanvasProbe,
  waitForAnimationFrames,
  writeAcceptanceReport,
  WORLD_GALLERY_ROOT
} from "./water-acceptance-harness.mjs";

const GATE = "grasslands-water-performance";
const CASE_ID = "showcase-grasslands-stylized-water";
const VIEWPORT = Object.freeze({ width: 1340, height: 662 });
const DEVICE_SCALE_FACTOR = 1;
const FIXED_SURFACE_TIME = 12.5;
const FIXED_SEED = 20260724;
const HEADED_BROWSER_ARGUMENTS = Object.freeze(["--window-position=0,0"]);
const FORMAL_PROFILE = Object.freeze({
  name: "formal",
  warmupFrames: 60,
  minimumFrameCount: 300,
  minimumSampleDurationMs: 5_000,
  gpuSampleCount: 8
});
const FAST_PROFILE = Object.freeze({
  name: "smoke-only",
  warmupFrames: 10,
  minimumFrameCount: 30,
  minimumSampleDurationMs: 500,
  gpuSampleCount: 2
});
const THRESHOLDS = Object.freeze({
  minimumAverageFps: 55,
  maximumP95FrameMs: 20,
  maximumWaterDrawCalls: 8,
  maximumDepthCopyPassCount: 1,
  maximumColorCopyPassCount: 1,
  expectedPlanarCameraCount: 0,
  expectedPlanarRenderTargetCount: 0
});
const PHASES = Object.freeze([
  Object.freeze({ id: "off-before", appearanceEnabled: false }),
  Object.freeze({ id: "on", appearanceEnabled: true }),
  Object.freeze({ id: "off-after", appearanceEnabled: false })
]);
const NORMAL_WIDTH = 1024;
const NORMAL_HEIGHT = 1024;
const RGBA8_BYTES_PER_PIXEL = 4;
const COMPLETE_MIP_FACTOR = 4 / 3;
const EXPECTED_NORMAL_BYTES = NORMAL_WIDTH * NORMAL_HEIGHT * RGBA8_BYTES_PER_PIXEL * COMPLETE_MIP_FACTOR;
const REPOSITORY_ROOT = resolve(WORLD_GALLERY_ROOT, "..");

const fastMode = process.env.GRASSLANDS_WATER_PERF_FAST === "1";
const headed = process.env.WATER_PCG_HEADED === "1";
const profile = fastMode ? FAST_PROFILE : FORMAL_PROFILE;
const baseUrl = process.env.GRASSLANDS_WATER_URL?.trim() || process.env.WATER_PCG_URL?.trim() || DEFAULT_WATER_PCG_URL;
const runEnvironment = { ...process.env };
if (process.env.GRASSLANDS_WATER_PERFORMANCE_OUTPUT_DIR?.trim()) {
  runEnvironment.WATER_PCG_ACCEPTANCE_OUTPUT_DIR = process.env.GRASSLANDS_WATER_PERFORMANCE_OUTPUT_DIR.trim();
}
const run = createRunContext(GATE, runEnvironment);

function percentile(sorted, percentileValue) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * percentileValue) - 1));
  return sorted[index];
}

function runGit(args) {
  return execFileSync("git", args, { cwd: REPOSITORY_ROOT, encoding: "utf8" }).trim();
}

function readGitEvidence() {
  try {
    return {
      root: runGit(["rev-parse", "--show-toplevel"]),
      head: runGit(["rev-parse", "HEAD"]),
      branch: runGit(["branch", "--show-current"]) || "detached",
      fullRepositoryStatus: runGit(["status", "--porcelain=v1", "--untracked-files=all"]),
      waterPcgStatus: runGit([
        "status",
        "--porcelain=v1",
        "--untracked-files=all",
        "--",
        "world-gallery/demos/water-pcg"
      ])
    };
  } catch (error) {
    return { status: "unavailable", error: serializeError(error) };
  }
}

function assertCleanGitBoundary(evidence, label) {
  assertAcceptance(evidence.status !== "unavailable", `${label} Git evidence is unavailable.`, evidence);
  assertAcceptance(evidence.root === REPOSITORY_ROOT, `${label} repository root drifted.`, evidence);
  assertAcceptance(evidence.fullRepositoryStatus === "", `${label} repository is not clean.`, evidence);
  assertAcceptance(evidence.waterPcgStatus === "", `${label} water-pcg scope is not clean.`, evidence);
}

function createGrasslandsUrl() {
  const url = new URL(baseUrl);
  url.search = "";
  url.hash = CASE_ID;
  url.searchParams.set("mode", "dev");
  url.searchParams.set("quality", "high");
  url.searchParams.set("surfaceTime", String(FIXED_SURFACE_TIME));
  url.searchParams.set("seed", String(FIXED_SEED));
  url.searchParams.set("stats", "0");
  url.searchParams.set("tour", "0");
  url.searchParams.set("acceptance", "1");
  url.searchParams.set("profile", "1");
  return url;
}

function assertNativeWebGl(webgl) {
  assertAcceptance(webgl.graphicsApi === "webgl2", "Grasslands performance lane did not use WebGL2.", webgl);
  const rendererEvidence = `${webgl.unmaskedRenderer ?? ""} ${webgl.renderer ?? ""}`.trim();
  assertAcceptance(rendererEvidence.length > 0, "Grasslands performance lane exposed no GPU renderer.", webgl);
  assertAcceptance(
    !SOFTWARE_RENDERER_PATTERN.test(rendererEvidence),
    `Grasslands performance lane resolved a software renderer: ${rendererEvidence}.`,
    webgl
  );
}

function assertFiniteReport(value, path) {
  const nonFinite = collectNonFinite(value, path);
  assertAcceptance(nonFinite.length === 0, `${path} contains non-finite values: ${nonFinite.join(", ")}.`, value);
}

async function installWebGlActivityProbe(context) {
  await context.addInitScript(() => {
    window.__grasslandsPerformanceWebGlActivity = {
      createTexture: 0,
      createBuffer: 0,
      createFramebuffer: 0,
      createRenderbuffer: 0,
      arrayBufferData: 0,
      elementArrayBufferData: 0,
      arrayBufferSubData: 0,
      elementArrayBufferSubData: 0
    };
    const prototype = WebGL2RenderingContext.prototype;
    for (const method of ["createTexture", "createBuffer", "createFramebuffer", "createRenderbuffer"]) {
      const original = prototype[method];
      if (typeof original !== "function") continue;
      Object.defineProperty(prototype, method, {
        configurable: true,
        writable: true,
        value: function (...args) {
          window.__grasslandsPerformanceWebGlActivity[method]++;
          return Reflect.apply(original, this, args);
        }
      });
    }
    for (const method of ["bufferData", "bufferSubData"]) {
      const original = prototype[method];
      if (typeof original !== "function") continue;
      Object.defineProperty(prototype, method, {
        configurable: true,
        writable: true,
        value: function (target, ...args) {
          const targetName =
            target === this.ARRAY_BUFFER
              ? "arrayBuffer"
              : target === this.ELEMENT_ARRAY_BUFFER
                ? "elementArrayBuffer"
                : null;
          if (targetName) {
            const suffix = method === "bufferData" ? "Data" : "SubData";
            window.__grasslandsPerformanceWebGlActivity[`${targetName}${suffix}`]++;
          }
          return Reflect.apply(original, this, [target, ...args]);
        }
      });
    }
  });
}

async function waitForGrasslandsReady(page) {
  await page.waitForFunction(
    () => {
      const snapshot = window.waterPcgGrasslands?.snapshot();
      return snapshot?.ready === true && snapshot.phase === "ready";
    },
    undefined,
    { timeout: 45_000 }
  );
}

async function readSnapshot(page) {
  return page.evaluate(() => {
    const api = window.waterPcgGrasslands;
    if (!api) throw new Error("window.waterPcgGrasslands is unavailable.");
    return structuredClone(api.snapshot());
  });
}

async function readWebGlActivity(page) {
  return page.evaluate(() => structuredClone(window.__grasslandsPerformanceWebGlActivity));
}

function resourceVector(snapshot) {
  const resources = snapshot.resources;
  return {
    bufferMemory: resources.bufferMemory,
    textureMemory: resources.textureMemory,
    totalMemory: resources.totalMemory,
    ownedTextureCount: resources.ownedTextureCount,
    borrowedTextureCount: resources.borrowedTextureCount,
    textureCreateCount: resources.textureCreateCount,
    textureDestroyCount: resources.textureDestroyCount,
    materialCount: resources.materialCount,
    runtimeSetCreateCount: resources.runtimeSetCreateCount,
    runtimeSetDestroyCount: resources.runtimeSetDestroyCount,
    materialCreateCount: resources.materialCreateCount,
    materialDestroyCount: resources.materialDestroyCount,
    localMapTextureCreateCount: resources.localMapTextureCreateCount,
    localMapTextureDestroyCount: resources.localMapTextureDestroyCount,
    meshCreateCount: resources.meshCreateCount,
    meshDestroyCount: resources.meshDestroyCount,
    sceneMeshCreateCount: resources.sceneMeshCreateCount,
    sceneMeshDestroyCount: resources.sceneMeshDestroyCount,
    sceneMaterialCreateCount: resources.sceneMaterialCreateCount,
    sceneMaterialDestroyCount: resources.sceneMaterialDestroyCount,
    sceneEntityCreateCount: resources.sceneEntityCreateCount,
    sceneEntityDestroyCount: resources.sceneEntityDestroyCount,
    sceneMeshUploadCount: resources.sceneMeshUploadCount,
    environmentTextureCreateCount: resources.environmentTextureCreateCount,
    environmentTextureDestroyCount: resources.environmentTextureDestroyCount,
    environmentMaterialCreateCount: resources.environmentMaterialCreateCount,
    environmentMaterialDestroyCount: resources.environmentMaterialDestroyCount,
    environmentGltfResourceCreateCount: resources.environmentGltfResourceCreateCount,
    environmentGltfResourceDestroyCount: resources.environmentGltfResourceDestroyCount,
    environmentMeshCreateCount: resources.environmentMeshCreateCount,
    environmentMeshDestroyCount: resources.environmentMeshDestroyCount,
    environmentTemplateEntityCreateCount: resources.environmentTemplateEntityCreateCount,
    environmentTemplateEntityDestroyCount: resources.environmentTemplateEntityDestroyCount,
    environmentActiveRockInstanceCount: resources.environmentActiveRockInstanceCount,
    environmentRockInstanceCreateCount: resources.environmentRockInstanceCreateCount,
    environmentRockInstanceDestroyCount: resources.environmentRockInstanceDestroyCount,
    renderTargetCount: resources.renderTargetCount,
    reflectionCameraCount: resources.reflectionCameraCount,
    cameraCount: resources.cameraCount,
    runtimeActiveSetCount: snapshot.runtimeSet.activeSetCount,
    runtimeChunkCount: snapshot.runtimeSet.chunkCount,
    runtimeDrawCount: snapshot.runtimeSet.drawCount,
    runtimeMeshUploadCount: snapshot.runtimeSet.meshUploadCount,
    brokerConsumerCount: snapshot.cameraFeatures.effective.activeConsumerCount,
    depthCopyPassCount: snapshot.cameraFeatures.effective.depthCopyPassCount,
    colorCopyPassCount: snapshot.cameraFeatures.effective.colorCopyPassCount
  };
}

function webGlStabilityVector(activity) {
  return {
    createTexture: activity.createTexture,
    createBuffer: activity.createBuffer,
    createFramebuffer: activity.createFramebuffer,
    createRenderbuffer: activity.createRenderbuffer,
    arrayBufferData: activity.arrayBufferData,
    elementArrayBufferData: activity.elementArrayBufferData,
    arrayBufferSubData: activity.arrayBufferSubData,
    elementArrayBufferSubData: activity.elementArrayBufferSubData
  };
}

function recoveryResourceVector(vector) {
  return {
    bufferMemory: vector.bufferMemory,
    textureMemory: vector.textureMemory,
    totalMemory: vector.totalMemory,
    ownedTextureCount: vector.ownedTextureCount,
    borrowedTextureCount: vector.borrowedTextureCount,
    materialCount: vector.materialCount,
    environmentActiveRockInstanceCount: vector.environmentActiveRockInstanceCount,
    renderTargetCount: vector.renderTargetCount,
    reflectionCameraCount: vector.reflectionCameraCount,
    cameraCount: vector.cameraCount,
    runtimeActiveSetCount: vector.runtimeActiveSetCount,
    runtimeChunkCount: vector.runtimeChunkCount,
    runtimeDrawCount: vector.runtimeDrawCount,
    brokerConsumerCount: vector.brokerConsumerCount,
    depthCopyPassCount: vector.depthCopyPassCount,
    colorCopyPassCount: vector.colorCopyPassCount
  };
}

function assertDeepEqual(actual, expected, message) {
  assertAcceptance(JSON.stringify(actual) === JSON.stringify(expected), message, { actual, expected });
}

function assertPhaseState(snapshot, phase) {
  assertAcceptance(
    snapshot.ready === true && snapshot.phase === "ready",
    `${phase.id} runtime is not ready.`,
    snapshot
  );
  assertAcceptance(
    snapshot.finite === true && snapshot.runtimeError === null,
    `${phase.id} runtime is unhealthy.`,
    snapshot
  );
  assertAcceptance(snapshot.qualityTier === "high", `${phase.id} quality is not High.`, snapshot);
  assertAcceptance(snapshot.opticsTier === "high", `${phase.id} optics tier is not High.`, snapshot);
  assertAcceptance(
    snapshot.surfaceTime === FIXED_SURFACE_TIME,
    `${phase.id} surfaceTime is not fixed at 12.5.`,
    snapshot
  );
  assertAcceptance(
    snapshot.appearanceEnabled === phase.appearanceEnabled,
    `${phase.id} Appearance state drifted.`,
    snapshot
  );
  assertAcceptance(
    snapshot.runtimeSet.perFrameMeshUpload === false,
    `${phase.id} reports per-frame mesh upload.`,
    snapshot
  );
  assertAcceptance(
    snapshot.runtimeSet.drawCount <= THRESHOLDS.maximumWaterDrawCalls,
    `${phase.id} has ${snapshot.runtimeSet.drawCount} water draws.`,
    snapshot.runtimeSet
  );
  assertAcceptance(
    snapshot.reflection.cameraCount === THRESHOLDS.expectedPlanarCameraCount &&
      snapshot.reflection.renderTargetCount === THRESHOLDS.expectedPlanarRenderTargetCount &&
      snapshot.scene.planarCameraCount === THRESHOLDS.expectedPlanarCameraCount &&
      snapshot.scene.renderTargetCount === THRESHOLDS.expectedPlanarRenderTargetCount &&
      snapshot.resources.reflectionCameraCount === THRESHOLDS.expectedPlanarCameraCount &&
      snapshot.resources.renderTargetCount === THRESHOLDS.expectedPlanarRenderTargetCount,
    `${phase.id} created an excluded Planar camera or render target.`,
    {
      reflection: snapshot.reflection,
      scene: snapshot.scene,
      resources: snapshot.resources
    }
  );
  assertAcceptance(
    snapshot.cameraFeatures.effective.depthCopyPassCount <= THRESHOLDS.maximumDepthCopyPassCount &&
      snapshot.cameraFeatures.effective.colorCopyPassCount <= THRESHOLDS.maximumColorCopyPassCount,
    `${phase.id} exceeded the Scene Color/Depth copy budget.`,
    snapshot.cameraFeatures
  );
  assertFiniteReport(snapshot.frame, `${phase.id}.frame`);
}

async function setAppearance(page, enabled) {
  return page.evaluate((appearanceEnabled) => {
    const api = window.waterPcgGrasslands;
    if (!api) throw new Error("window.waterPcgGrasslands is unavailable.");
    const startedAt = performance.now();
    api.setAppearanceEnabled(appearanceEnabled);
    const activationSliceMs = performance.now() - startedAt;
    return { activationSliceMs, snapshot: structuredClone(api.snapshot()) };
  }, enabled);
}

async function sampleAnimationFrames(page, samplingProfile) {
  const intervals = await page.evaluate(
    ({ minimumFrameCount, minimumSampleDurationMs }) =>
      new Promise((resolveSamples, rejectSamples) => {
        const timeout = window.setTimeout(
          () =>
            rejectSamples(
              new Error(`Frame sampling timed out before ${minimumFrameCount} frames / ${minimumSampleDurationMs}ms.`)
            ),
          Math.max(30_000, minimumSampleDurationMs + 20_000)
        );
        const samples = [];
        let startedAt;
        let previousTimestamp;
        const sample = (timestamp) => {
          startedAt ??= timestamp;
          if (previousTimestamp !== undefined) samples.push(timestamp - previousTimestamp);
          previousTimestamp = timestamp;
          const elapsedMs = timestamp - startedAt;
          if (samples.length >= minimumFrameCount && elapsedMs >= minimumSampleDurationMs) {
            window.clearTimeout(timeout);
            resolveSamples(samples);
          } else {
            requestAnimationFrame(sample);
          }
        };
        requestAnimationFrame(sample);
      }),
    samplingProfile
  );
  const sorted = [...intervals].sort((left, right) => left - right);
  const durationMs = intervals.reduce((sum, value) => sum + value, 0);
  const averageFrameMs = durationMs / intervals.length;
  return {
    sampleCount: intervals.length,
    durationMs,
    averageFrameMs,
    averageFps: averageFrameMs > 0 ? 1000 / averageFrameMs : 0,
    p50FrameMs: percentile(sorted, 0.5),
    p95FrameMs: percentile(sorted, 0.95),
    maximumFrameMs: sorted.at(-1) ?? 0
  };
}

async function sampleGpuFrameEnvelope(page, sampleCount) {
  const result = await page.evaluate(async (requestedSampleCount) => {
    const canvas = document.querySelector("canvas#canvas");
    if (!(canvas instanceof HTMLCanvasElement)) {
      return {
        status: "unavailable",
        source: null,
        reason: "canvas-unavailable",
        sampleCount: 0,
        pendingQueryCount: 0,
        droppedSampleCount: 0,
        nanoseconds: []
      };
    }
    const gl = canvas.getContext("webgl2");
    if (!gl) {
      return {
        status: "unavailable",
        source: null,
        reason: "webgl2-unavailable",
        sampleCount: 0,
        pendingQueryCount: 0,
        droppedSampleCount: 0,
        nanoseconds: []
      };
    }
    const extension = gl.getExtension("EXT_disjoint_timer_query_webgl2");
    if (!extension) {
      return {
        status: "unavailable",
        source: null,
        reason: "extension-unavailable",
        sampleCount: 0,
        pendingQueryCount: 0,
        droppedSampleCount: 0,
        nanoseconds: []
      };
    }
    const nextFrame = () => new Promise((resolveFrame) => requestAnimationFrame(resolveFrame));
    const waitForResult = async (query) => {
      const deadline = performance.now() + 10_000;
      while (performance.now() < deadline) {
        const available = gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE);
        const disjoint = gl.getParameter(extension.GPU_DISJOINT_EXT);
        if (disjoint) throw new Error("GPU timer became disjoint.");
        if (available) return Number(gl.getQueryParameter(query, gl.QUERY_RESULT));
        await nextFrame();
      }
      throw new Error("GPU timer query timed out.");
    };

    const nanoseconds = [];
    let droppedSampleCount = 0;
    for (let index = 0; index < requestedSampleCount; index++) {
      const query = gl.createQuery();
      if (!query) {
        droppedSampleCount++;
        continue;
      }
      try {
        await nextFrame();
        gl.beginQuery(extension.TIME_ELAPSED_EXT, query);
        await nextFrame();
        gl.endQuery(extension.TIME_ELAPSED_EXT);
        nanoseconds.push(await waitForResult(query));
      } catch (error) {
        droppedSampleCount++;
        return {
          status: "unavailable",
          source: "EXT_disjoint_timer_query_webgl2",
          reason: error instanceof Error ? error.message : String(error),
          sampleCount: nanoseconds.length,
          pendingQueryCount: 0,
          droppedSampleCount,
          nanoseconds
        };
      } finally {
        gl.deleteQuery(query);
      }
    }
    return {
      status: "valid",
      source: "EXT_disjoint_timer_query_webgl2",
      scope: "full-frame-envelope",
      reason: null,
      sampleCount: nanoseconds.length,
      pendingQueryCount: 0,
      droppedSampleCount,
      nanoseconds
    };
  }, sampleCount);

  const milliseconds = result.nanoseconds.map((value) => value / 1_000_000);
  const sorted = [...milliseconds].sort((left, right) => left - right);
  return {
    status: result.status,
    source: result.source,
    scope: result.scope ?? null,
    reason: result.reason,
    sampleCount: result.sampleCount,
    pendingQueryCount: result.pendingQueryCount,
    droppedSampleCount: result.droppedSampleCount,
    averageMs:
      milliseconds.length > 0 ? milliseconds.reduce((sum, value) => sum + value, 0) / milliseconds.length : null,
    p95Ms: milliseconds.length > 0 ? percentile(sorted, 0.95) : null,
    maximumMs: milliseconds.length > 0 ? sorted.at(-1) : null
  };
}

function assertGpuTimer(gpu, phase) {
  assertAcceptance(gpu.status === "valid", `${phase.id} GPU timer is not valid.`, gpu);
  assertAcceptance(
    gpu.source === "EXT_disjoint_timer_query_webgl2" && gpu.scope === "full-frame-envelope",
    `${phase.id} GPU timer provenance drifted.`,
    gpu
  );
  assertAcceptance(gpu.sampleCount === profile.gpuSampleCount, `${phase.id} GPU sample count drifted.`, gpu);
  assertAcceptance(
    gpu.pendingQueryCount === 0 && gpu.droppedSampleCount === 0,
    `${phase.id} GPU timer left pending or dropped queries.`,
    gpu
  );
  assertFiniteReport({ averageMs: gpu.averageMs, p95Ms: gpu.p95Ms, maximumMs: gpu.maximumMs }, `${phase.id}.gpu`);
}

async function runPhase(page, phase) {
  const transition = await setAppearance(page, phase.appearanceEnabled);
  assertAcceptance(
    Number.isFinite(transition.activationSliceMs) && transition.activationSliceMs >= 0,
    `${phase.id} activation slice is invalid.`,
    transition
  );
  await waitForAnimationFrames(page, profile.warmupFrames);
  const before = await readSnapshot(page);
  assertPhaseState(before, phase);
  const beforeResources = resourceVector(before);
  const beforeWebGl = webGlStabilityVector(await readWebGlActivity(page));
  const frame = await sampleAnimationFrames(page, profile);
  const after = await readSnapshot(page);
  assertPhaseState(after, phase);
  const afterResources = resourceVector(after);
  const afterWebGl = webGlStabilityVector(await readWebGlActivity(page));
  assertDeepEqual(afterResources, beforeResources, `${phase.id} resources changed during stable frame sampling.`);
  assertDeepEqual(
    afterWebGl,
    beforeWebGl,
    `${phase.id} created GPU resources or uploaded static mesh buffers during stable frame sampling.`
  );
  assertAcceptance(frame.sampleCount >= profile.minimumFrameCount, `${phase.id} sampled too few frames.`, frame);
  assertAcceptance(frame.durationMs >= profile.minimumSampleDurationMs, `${phase.id} sampled too briefly.`, frame);
  assertFiniteReport(frame, `${phase.id}.frame`);
  if (!fastMode && phase.id === "on") {
    assertAcceptance(
      frame.averageFps >= THRESHOLDS.minimumAverageFps,
      `Appearance On averaged ${frame.averageFps.toFixed(2)} FPS, below ${THRESHOLDS.minimumAverageFps}.`,
      frame
    );
    assertAcceptance(
      frame.p95FrameMs <= THRESHOLDS.maximumP95FrameMs,
      `Appearance On frame P95 ${frame.p95FrameMs.toFixed(2)}ms exceeds ${THRESHOLDS.maximumP95FrameMs}ms.`,
      frame
    );
  }
  const gpu = await sampleGpuFrameEnvelope(page, profile.gpuSampleCount);
  assertGpuTimer(gpu, phase);
  return {
    id: phase.id,
    appearanceEnabled: phase.appearanceEnabled,
    activationSliceMs: transition.activationSliceMs,
    frame,
    gpu,
    resourceStability: {
      before: beforeResources,
      after: afterResources,
      stable: true
    },
    webGlStability: {
      before: beforeWebGl,
      after: afterWebGl,
      stable: true
    },
    runtime: {
      surfaceTime: after.surfaceTime,
      frame: after.frame,
      appearance: after.appearance,
      normal: after.normal,
      cameraFeatures: after.cameraFeatures,
      reflection: after.reflection,
      runtimeSet: after.runtimeSet,
      resources: after.resources
    }
  };
}

function assertNormalBudget(onPhase) {
  const { normal, resources } = onPhase.runtime;
  const externalTextureCreateCount =
    resources.textureCreateCount - resources.localMapTextureCreateCount - resources.environmentTextureCreateCount;
  const externalTextureDestroyCount =
    resources.textureDestroyCount - resources.localMapTextureDestroyCount - resources.environmentTextureDestroyCount;
  assertAcceptance(
    normal.active === true &&
      normal.width === NORMAL_WIDTH &&
      normal.height === NORMAL_HEIGHT &&
      normal.mipmaps === true &&
      normal.ownership === "borrowed",
    "Appearance On normal texture contract drifted.",
    normal
  );
  assertAcceptance(
    externalTextureCreateCount === 1 && externalTextureDestroyCount === 0,
    "Grasslands duplicated or destroyed the borrowed external normal texture.",
    { externalTextureCreateCount, externalTextureDestroyCount, resources }
  );
  return {
    format: "RGBA8",
    width: NORMAL_WIDTH,
    height: NORMAL_HEIGHT,
    mipmaps: true,
    estimatedBytes: EXPECTED_NORMAL_BYTES,
    estimatedMiB: EXPECTED_NORMAL_BYTES / (1024 * 1024),
    externalTextureCreateCount,
    externalTextureDestroyCount,
    duplicateAllocationDetected: false
  };
}

function createCostComparison(phases) {
  const offBefore = phases[0];
  const on = phases[1];
  const offAfter = phases[2];
  assertDeepEqual(
    recoveryResourceVector(offAfter.resourceStability.after),
    recoveryResourceVector(offBefore.resourceStability.after),
    "OFF-after resources did not recover to the OFF-before baseline."
  );
  const ratio = (numerator, denominator) => (denominator > 0 ? numerator / denominator : null);
  return {
    sequence: phases.map((phase) => phase.id),
    activeToOffBeforeFpsRatio: ratio(on.frame.averageFps, offBefore.frame.averageFps),
    activeToOffBeforeP95Ratio: ratio(on.frame.p95FrameMs, offBefore.frame.p95FrameMs),
    offAfterToOffBeforeFpsRatio: ratio(offAfter.frame.averageFps, offBefore.frame.averageFps),
    offAfterToOffBeforeP95Ratio: ratio(offAfter.frame.p95FrameMs, offBefore.frame.p95FrameMs),
    resourceRecovery: "passed",
    relativeCostThresholdSource: "water-optics-performance-separate-m4-matrix"
  };
}

const report = {
  schemaVersion: 1,
  gate: GATE,
  status: "running",
  runId: run.runId,
  generatedAt: new Date().toISOString(),
  resultPath: run.resultPath,
  outputDirectory: run.outputDirectory,
  baseUrl,
  headed,
  profile,
  thresholds: THRESHOLDS,
  environment: {
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    quality: "high",
    surfaceTime: FIXED_SURFACE_TIME,
    seed: FIXED_SEED,
    rendererLane: "native-hardware-webgl2"
  },
  source: {
    start: readGitEvidence(),
    end: null
  },
  browserVersion: null,
  webgl: null,
  phases: [],
  costComparison: null,
  normalBudget: null,
  suggestedObservations: null,
  canvas: null,
  diagnostics: null,
  failures: []
};

let browser;
try {
  assertAcceptance(fastMode || headed, "Formal Grasslands performance acceptance requires a headed browser.");
  assertCleanGitBoundary(report.source.start, "Performance start");
  browser = await chromium.launch({
    headless: !headed,
    args: headed ? [...HEADED_BROWSER_ARGUMENTS] : []
  });
  report.browserVersion = browser.version();
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: DEVICE_SCALE_FACTOR });
  await installWebGlActivityProbe(context);
  const page = await context.newPage();
  const diagnostics = collectPageDiagnostics(page);
  report.diagnostics = diagnostics;
  try {
    const url = createGrasslandsUrl();
    await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 45_000 });
    if (headed) await page.bringToFront();
    await waitForGrasslandsReady(page);
    const initial = await readSnapshot(page);
    assertAcceptance(
      initial.caseId === CASE_ID && initial.runtime === "grasslands",
      "Grasslands identity drifted.",
      initial
    );
    assertAcceptance(
      (await page.locator(".gl-perf").count()) === 0,
      "Grasslands performance lane created a Stats panel."
    );
    report.webgl = await collectWebGlEnvironment(page);
    assertNativeWebGl(report.webgl);
    for (const phase of PHASES) report.phases.push(await runPhase(page, phase));
    report.costComparison = createCostComparison(report.phases);
    report.normalBudget = assertNormalBudget(report.phases[1]);
    report.suggestedObservations = {
      waterMaterialGpuP95Ms: null,
      waterMaterialGpuP95Reason: "full-frame-envelope-timer-cannot-isolate-water-material",
      fullFrameEnvelopeGpuP95Ms: report.phases[1].gpu.p95Ms,
      fullSceneDrawCalls: null,
      fullSceneDrawCallsReason: "not-exposed-by-grasslands-acceptance",
      appearanceActivationSliceMs: report.phases[1].activationSliceMs,
      thresholdsAreNonBlocking: true
    };
    const canvas = await readCanvasProbe(page);
    assertCanvasHealthy(canvas, "Grasslands post-performance");
    report.canvas = summarizeCanvasProbe(canvas);
    assertNoPageErrors(diagnostics, "Grasslands performance");
    await page.goto("about:blank", { waitUntil: "load", timeout: 10_000 });
    assertNoPageErrors(diagnostics, "Grasslands performance cleanup");
  } finally {
    await context.close();
  }
  report.source.end = readGitEvidence();
  assertCleanGitBoundary(report.source.end, "Performance end");
  assertAcceptance(
    report.source.end.head === report.source.start.head,
    "Repository HEAD changed during Grasslands performance capture.",
    report.source
  );
  report.status = "passed";
} catch (error) {
  report.failures.push(serializeError(error));
  report.status = "failed";
  report.source.end ??= readGitEvidence();
} finally {
  await browser?.close().catch((error) => {
    report.failures.push({ phase: "browser-close", ...serializeError(error) });
    report.status = "failed";
  });
}

await writeAcceptanceReport(run, report);
console.log(JSON.stringify(report, null, 2));
if (report.status !== "passed") process.exitCode = 1;
