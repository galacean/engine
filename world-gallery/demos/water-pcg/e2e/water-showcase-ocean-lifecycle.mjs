import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import {
  assertAcceptance,
  assertCanvasHealthy,
  assertCaseIdentity,
  assertNoPageErrors,
  assertRuntimeHealthy,
  collectNonFinite,
  collectPageDiagnostics,
  collectWebGlEnvironment,
  createCaseUrl,
  createRunContext,
  DEFAULT_WATER_PCG_URL,
  readCanvasProbe,
  readGitEvidence,
  serializeError,
  SOFTWARE_RENDERER_PATTERN,
  waitForAnimationFrames,
  waitForCaseReady,
  writeAcceptanceReport
} from "./water-acceptance-harness.mjs";
import {
  FIXED_ACCEPTANCE_ENVIRONMENT,
  WATER_SHOWCASE_CASES
} from "./water-acceptance-cases.mjs";

const gate = "water-showcase-ocean-lifecycle";
const run = createRunContext(gate);
const baseUrl =
  process.env.WATER_PCG_URL?.trim() || DEFAULT_WATER_PCG_URL;
const headed = process.env.WATER_PCG_HEADED !== "0";
const lifecycleRounds = 10;
const stableFrameCount = 300;
const performanceProfile = Object.freeze({
  warmupDurationMs: 2000,
  minimumFrameCount: 300,
  minimumSampleDurationMs: 5000
});
const performanceThresholds = Object.freeze({
  minimumActiveToControlFpsRatio: 0.65,
  maximumActiveToControlP95Ratio: 2.5
});
const oceanDefinition = WATER_SHOWCASE_CASES.find(
  (definition) => definition.id === "showcase-ocean"
);
const otherDefinition = WATER_SHOWCASE_CASES.find(
  (definition) => definition.id === "showcase-river"
);
assertAcceptance(
  oceanDefinition && otherDefinition,
  "Ocean lifecycle acceptance case definitions are unavailable."
);

function percentile(sorted, percentileValue) {
  if (sorted.length === 0) return 0;
  const index = Math.min(
    sorted.length - 1,
    Math.max(
      0,
      Math.ceil(sorted.length * percentileValue) - 1
    )
  );
  return sorted[index];
}

function hashBuffer(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function hashJson(value) {
  return createHash("sha256")
    .update(JSON.stringify(value))
    .digest("hex");
}

async function waitAnimationDuration(page, durationMs) {
  await page.evaluate(
    (minimumDurationMs) =>
      new Promise((resolveDuration, rejectDuration) => {
        const timeout = window.setTimeout(
          () =>
            rejectDuration(
              new Error(
                `Animation wait timed out after ${minimumDurationMs + 15_000}ms.`
              )
            ),
          minimumDurationMs + 15_000
        );
        let startedAt;
        const sample = (timestamp) => {
          startedAt ??= timestamp;
          if (timestamp - startedAt >= minimumDurationMs) {
            window.clearTimeout(timeout);
            resolveDuration();
          } else {
            requestAnimationFrame(sample);
          }
        };
        requestAnimationFrame(sample);
      }),
    durationMs
  );
}

async function sampleAnimationFrames(
  page,
  minimumFrameCount,
  minimumSampleDurationMs = 0
) {
  const intervals = await page.evaluate(
    ({ frameCount, durationMs }) =>
      new Promise((resolveSamples, rejectSamples) => {
        const timeout = window.setTimeout(
          () =>
            rejectSamples(
              new Error(
                `Frame sampling timed out before ${frameCount} frames / ${durationMs}ms.`
              )
            ),
          Math.max(30_000, durationMs + 20_000)
        );
        const samples = [];
        let startedAt;
        let previousTimestamp;
        const sample = (timestamp) => {
          startedAt ??= timestamp;
          if (previousTimestamp !== undefined) {
            samples.push(timestamp - previousTimestamp);
          }
          previousTimestamp = timestamp;
          if (
            samples.length >= frameCount &&
            timestamp - startedAt >= durationMs
          ) {
            window.clearTimeout(timeout);
            resolveSamples(samples);
          } else {
            requestAnimationFrame(sample);
          }
        };
        requestAnimationFrame(sample);
      }),
    {
      frameCount: minimumFrameCount,
      durationMs: minimumSampleDurationMs
    }
  );
  const sorted = [...intervals].sort(
    (left, right) => left - right
  );
  const durationMs = intervals.reduce(
    (sum, value) => sum + value,
    0
  );
  const averageFrameMs = durationMs / intervals.length;
  return Object.freeze({
    sampleCount: intervals.length,
    durationMs,
    averageFps:
      averageFrameMs > 0 ? 1000 / averageFrameMs : 0,
    p50FrameMs: percentile(sorted, 0.5),
    p95FrameMs: percentile(sorted, 0.95),
    maximumFrameMs: sorted.at(-1) ?? 0
  });
}

async function sampleGpuFrameEnvelope(page, sampleCount) {
  return page.evaluate(async (requestedSampleCount) => {
    const canvas = document.querySelector("canvas#canvas");
    if (!(canvas instanceof HTMLCanvasElement)) {
      return {
        status: "unavailable",
        supported: false,
        reason: "canvas-unavailable",
        sampleCount: 0
      };
    }
    const gl = canvas.getContext("webgl2");
    if (!gl) {
      return {
        status: "unavailable",
        supported: false,
        reason: "webgl2-unavailable",
        sampleCount: 0
      };
    }
    const extension = gl.getExtension(
      "EXT_disjoint_timer_query_webgl2"
    );
    if (!extension) {
      return {
        status: "unavailable",
        supported: false,
        reason: "extension-unavailable",
        sampleCount: 0
      };
    }
    const nextFrame = () =>
      new Promise((resolveFrame) =>
        requestAnimationFrame(resolveFrame)
      );
    const waitForResult = async (query) => {
      const deadline = performance.now() + 10_000;
      while (performance.now() < deadline) {
        const available = gl.getQueryParameter(
          query,
          gl.QUERY_RESULT_AVAILABLE
        );
        const disjoint = gl.getParameter(
          extension.GPU_DISJOINT_EXT
        );
        if (available) {
          if (disjoint) {
            throw new Error("GPU timer became disjoint.");
          }
          return Number(gl.getQueryParameter(query, gl.QUERY_RESULT));
        }
        await nextFrame();
      }
      throw new Error("GPU timer query timed out.");
    };
    const nanoseconds = [];
    try {
      for (
        let index = 0;
        index < requestedSampleCount;
        index++
      ) {
        const query = gl.createQuery();
        if (!query) {
          throw new Error("Unable to allocate a GPU timer query.");
        }
        try {
          await nextFrame();
          gl.beginQuery(extension.TIME_ELAPSED_EXT, query);
          await nextFrame();
          gl.endQuery(extension.TIME_ELAPSED_EXT);
          nanoseconds.push(await waitForResult(query));
        } finally {
          gl.deleteQuery(query);
        }
      }
    } catch (error) {
      return {
        status: "unavailable",
        supported: true,
        reason:
          error instanceof Error ? error.message : String(error),
        sampleCount: nanoseconds.length
      };
    }
    return {
      status: "available",
      supported: true,
      source: "EXT_disjoint_timer_query_webgl2",
      sampleCount: nanoseconds.length,
      milliseconds: nanoseconds.map(
        (value) => value / 1_000_000
      )
    };
  }, sampleCount);
}

async function readLifecycleSnapshot(page) {
  return page.evaluate(() => {
    const api = window.waterPcgOceanLifecycle;
    if (!api) {
      throw new Error(
        "window.waterPcgOceanLifecycle is unavailable."
      );
    }
    return structuredClone(api.snapshot());
  });
}

async function setFeatureStack(page, enabled, liveTime) {
  await page.evaluate(
    ({ nextEnabled, useLiveTime }) => {
      const api = window.waterPcgOceanLifecycle;
      if (!api) {
        throw new Error(
          "window.waterPcgOceanLifecycle is unavailable."
        );
      }
      api.setFeatureStackEnabled(nextEnabled);
      if (useLiveTime) window.waterPcgSetSurfaceTime?.();
    },
    { nextEnabled: enabled, useLiveTime: liveTime }
  );
}

async function resetDeterministicState(page) {
  await page.evaluate((surfaceTime) => {
    const api = window.waterPcgOceanLifecycle;
    if (!api) {
      throw new Error(
        "window.waterPcgOceanLifecycle is unavailable."
      );
    }
    api.setFeatureStackEnabled(true);
    api.reset(surfaceTime);
  }, FIXED_ACCEPTANCE_ENVIRONMENT.surfaceTime);
}

function assertFiniteLifecycle(snapshot, label) {
  const nonFinite = collectNonFinite(snapshot, label);
  assertAcceptance(
    nonFinite.length === 0,
    `${label} contains non-finite values: ${nonFinite.join(", ")}.`,
    snapshot
  );
}

function assertActiveResources(snapshot, label) {
  const {
    runtime,
    reflection,
    scene,
    splash,
    foamDetail
  } = snapshot;
  assertAcceptance(
    snapshot.disposed === false &&
      snapshot.featureStackEnabled === true,
    `${label} did not expose an active feature stack.`,
    snapshot
  );
  assertAcceptance(
    runtime.nearshoreWaveEnabled &&
      runtime.nearshoreStateEnabled &&
      runtime.nearshoreBreakerEnabled,
    `${label} did not enable every nearshore stage.`,
    runtime
  );
  assertAcceptance(
    runtime.activeNearshoreTextureCount === 3,
    `${label} nearshore texture count is not fixed at three.`,
    runtime
  );
  assertAcceptance(
    runtime.foamEnabled &&
      runtime.foamTextureCount === 3 &&
      runtime.activeFoamEventQueueCount === 1,
    `${label} did not own the bounded Foam resources.`,
    runtime
  );
  assertAcceptance(
    runtime.foamEventCapacity === 16 &&
      runtime.foamCurrentSurfaceQueryCount === 0,
    `${label} Foam queue/query budgets are invalid.`,
    runtime
  );
  assertAcceptance(
    runtime.nearshoreStateUpdateRateHz <= 30 &&
      runtime.foamTargetUpdateRateHz <= 30 &&
      runtime.foamContactUpdateRateHz <= 30,
    `${label} exceeded the 30 Hz dynamic-field budget.`,
    runtime
  );
  assertAcceptance(
    runtime.nearshoreWetnessUploadRateHz <
        runtime.nearshoreStateUpdateRateHz &&
      scene.wetSandUploadRateHz <
        runtime.nearshoreStateUpdateRateHz,
    `${label} wetness uploads do not use an independent lower rate.`,
    { runtime, scene }
  );
  assertAcceptance(
    scene.wetSandEnabled &&
      scene.wetSandTextureCount === 4 &&
      scene.wetSandTextureCreateCount -
        scene.wetSandTextureDestroyCount ===
        4,
    `${label} wet-sand texture ownership is invalid.`,
    scene
  );
  assertAcceptance(
    foamDetail?.ownership === "borrowed" &&
      foamDetail.destroyed === false &&
      foamDetail.textureCount === 1 &&
      foamDetail.textureCreateCount === 1 &&
      foamDetail.textureDestroyCount === 0 &&
      foamDetail.resourceBytes > 0 &&
      runtime.foamDetailTextureCount === 1 &&
      runtime.foamDetailTextureSource === "external" &&
      runtime.foamDetailResourceBytes ===
        foamDetail.resourceBytes,
    `${label} external Foam detail texture ownership is invalid.`,
    { runtime, foamDetail }
  );
  assertAcceptance(
    splash?.enabled === true &&
      splash.activeEmitterCount === 1 &&
      splash.activeMaterialCount === 1 &&
      splash.particleCapacity === 96,
    `${label} splash pool ownership is invalid.`,
    splash
  );
  assertAcceptance(
    reflection.planarCameraCount === 1 &&
      reflection.liveRenderTargetCount === 1 &&
      reflection.planarOwnerId,
    `${label} did not keep exactly one Planar owner.`,
    reflection
  );
  assertFiniteLifecycle(snapshot, label);
}

function assertDisabledResources(snapshot, label) {
  const { runtime, scene, splash, foamDetail } = snapshot;
  assertAcceptance(
    snapshot.featureStackEnabled === false,
    `${label} still reports an active feature stack.`,
    snapshot
  );
  assertAcceptance(
    !runtime.nearshoreWaveEnabled &&
      !runtime.nearshoreStateEnabled &&
      !runtime.nearshoreBreakerEnabled,
    `${label} retained a nearshore stage.`,
    runtime
  );
  assertAcceptance(
    runtime.nearshoreThinFilmTexelCount === 0 &&
      runtime.nearshoreBreakerTexelCount === 0 &&
      runtime.nearshoreWetnessTexelCount === 0 &&
      runtime.nearshoreBreakerPeak === 0 &&
      runtime.nearshoreWetnessPeak === 0,
    `${label} retained dynamic nearshore signal.`,
    runtime
  );
  assertAcceptance(
    runtime.foamEnabled === false &&
      runtime.foamTextureCount === 0 &&
      runtime.activeFoamEventQueueCount === 0 &&
      runtime.foamPendingEventCount === 0 &&
      runtime.foamHistoryPixelCount === 0 &&
      runtime.foamHistoryEnergy === 0 &&
      runtime.foamDetailTextureCount === 0 &&
      runtime.foamDetailTextureSource === "none" &&
      runtime.foamDetailResourceBytes === 0,
    `${label} retained Foam history, texture, or events.`,
    runtime
  );
  assertAcceptance(
    foamDetail?.ownership === "borrowed" &&
      foamDetail.destroyed === false &&
      foamDetail.textureCount === 1 &&
      foamDetail.textureCreateCount === 1 &&
      foamDetail.textureDestroyCount === 0 &&
      foamDetail.resourceBytes > 0,
    `${label} did not preserve the borrowed Foam detail owner.`,
    foamDetail
  );
  assertAcceptance(
    scene.wetSandEnabled === false,
    `${label} retained wet-sand darkening.`,
    scene
  );
  assertAcceptance(
    splash?.enabled === false &&
      splash.hasLiveParticles === false,
    `${label} retained active splash particles.`,
    splash
  );
  assertFiniteLifecycle(snapshot, label);
}

function stableResourceVector(snapshot) {
  return Object.freeze({
    bufferMemory: snapshot.engine.bufferMemory,
    textureMemory: snapshot.engine.textureMemory,
    totalMemory: snapshot.engine.totalMemory,
    meshUploadCount: snapshot.runtime.meshUploadCount,
    activeMeshCount: snapshot.runtime.activeMeshCount,
    activeMaterialCount: snapshot.runtime.activeMaterialCount,
    nearshoreTextureCount:
      snapshot.runtime.activeNearshoreTextureCount,
    foamTextureCount: snapshot.runtime.foamTextureCount,
    foamEventQueueCount:
      snapshot.runtime.activeFoamEventQueueCount,
    foamDetailTextureCount:
      snapshot.foamDetail?.textureCount ?? 0,
    foamDetailTextureCreateCount:
      snapshot.foamDetail?.textureCreateCount ?? 0,
    foamDetailTextureDestroyCount:
      snapshot.foamDetail?.textureDestroyCount ?? 0,
    foamDetailResourceBytes:
      snapshot.foamDetail?.resourceBytes ?? 0,
    wetSandTextureCount: snapshot.scene.wetSandTextureCount,
    splashEmitterCount:
      snapshot.splash?.activeEmitterCount ?? 0,
    splashMaterialCount:
      snapshot.splash?.activeMaterialCount ?? 0,
    particleCapacity:
      snapshot.splash?.particleCapacity ?? 0,
    reflectionCameraCount:
      snapshot.reflection.planarCameraCount,
    renderTargetCount:
      snapshot.reflection.liveRenderTargetCount ?? 0,
    renderTargetBytes:
      snapshot.reflection.estimatedRenderTargetBytes
  });
}

function assertStableResources(before, after, label) {
  const beforeVector = stableResourceVector(before);
  const afterVector = stableResourceVector(after);
  assertAcceptance(
    JSON.stringify(beforeVector) === JSON.stringify(afterVector),
    `${label} resource vector changed during stable sampling.`,
    { before: beforeVector, after: afterVector }
  );
  return afterVector;
}

function assertIdleUpdatesStopped(before, after, label) {
  const deltas = Object.freeze({
    nearshoreState:
      after.runtime.nearshoreStateUpdateCount -
      before.runtime.nearshoreStateUpdateCount,
    nearshoreUpload:
      after.runtime.nearshoreStateUploadCount -
      before.runtime.nearshoreStateUploadCount,
    wetnessUpload:
      after.runtime.nearshoreWetnessUploadCount -
      before.runtime.nearshoreWetnessUploadCount,
    wetSandBaseColor:
      after.scene.wetSandBaseColorUploadCount -
      before.scene.wetSandBaseColorUploadCount,
    wetSandRoughness:
      after.scene.wetSandRoughnessUploadCount -
      before.scene.wetSandRoughnessUploadCount
  });
  assertAcceptance(
    Object.values(deltas).every((value) => value === 0),
    `${label} continued dynamic uploads while disabled/idle.`,
    deltas
  );
  return deltas;
}

function assertActiveUpdateRates(before, after, durationMs, label) {
  const durationSeconds = durationMs / 1000;
  const rates = Object.freeze({
    nearshoreState:
      (after.runtime.nearshoreStateUpdateCount -
        before.runtime.nearshoreStateUpdateCount) /
      durationSeconds,
    foamHistory:
      (after.runtime.foamHistoryUpdateCount -
        before.runtime.foamHistoryUpdateCount) /
      durationSeconds,
    wetnessUpload:
      (after.runtime.nearshoreWetnessUploadCount -
        before.runtime.nearshoreWetnessUploadCount) /
      durationSeconds,
    wetSandBaseColor:
      (after.scene.wetSandBaseColorUploadCount -
        before.scene.wetSandBaseColorUploadCount) /
      durationSeconds,
    wetSandRoughness:
      (after.scene.wetSandRoughnessUploadCount -
        before.scene.wetSandRoughnessUploadCount) /
      durationSeconds
  });
  assertAcceptance(
    rates.nearshoreState <= 30.5 &&
      rates.foamHistory <= 30.5 &&
      rates.wetnessUpload <= 12.5 &&
      rates.wetSandBaseColor <= 10.5 &&
      rates.wetSandRoughness <= 10.5,
    `${label} exceeded a fixed update-rate budget.`,
    rates
  );
  return rates;
}

function deterministicSignature(snapshot) {
  return Object.freeze({
    sourceHash: snapshot.runtime.sourceHash,
    nearshoreSourceHash: snapshot.runtime.nearshoreSourceHash,
    originX: snapshot.runtime.originX,
    originZ: snapshot.runtime.originZ,
    nearshoreWaveEnabled:
      snapshot.runtime.nearshoreWaveEnabled,
    nearshoreStateEnabled:
      snapshot.runtime.nearshoreStateEnabled,
    nearshoreBreakerEnabled:
      snapshot.runtime.nearshoreBreakerEnabled,
    breakerTexelCount:
      snapshot.runtime.nearshoreBreakerTexelCount,
    breakerPeak: snapshot.runtime.nearshoreBreakerPeak,
    wetnessTexelCount:
      snapshot.runtime.nearshoreWetnessTexelCount,
    wetnessPeak: snapshot.runtime.nearshoreWetnessPeak,
    foamHistoryPixelCount:
      snapshot.runtime.foamHistoryPixelCount,
    foamHistoryPeak: snapshot.runtime.foamHistoryPeak,
    foamHistoryEnergy: snapshot.runtime.foamHistoryEnergy,
    boatX: snapshot.scene.boatX,
    boatY: snapshot.scene.boatY,
    boatZ: snapshot.scene.boatZ,
    wakeEnergy: snapshot.scene.wakeEnergy,
    surfaceTime: snapshot.surfaceTime,
    resourceVector: stableResourceVector(snapshot),
    planarColorFormat: snapshot.reflection.colorFormat,
    planarHDR: snapshot.reflection.planarHDR
  });
}

async function runPerformancePhase(page, id, enabled) {
  await setFeatureStack(page, enabled, true);
  await waitAnimationDuration(
    page,
    performanceProfile.warmupDurationMs
  );
  const before = await readLifecycleSnapshot(page);
  if (enabled) assertActiveResources(before, `${id}/before`);
  else assertDisabledResources(before, `${id}/before`);
  const frame = await sampleAnimationFrames(
    page,
    performanceProfile.minimumFrameCount,
    performanceProfile.minimumSampleDurationMs
  );
  const after = await readLifecycleSnapshot(page);
  if (enabled) assertActiveResources(after, `${id}/after`);
  else assertDisabledResources(after, `${id}/after`);
  const resources = assertStableResources(
    before,
    after,
    id
  );
  const updateEvidence = enabled
    ? assertActiveUpdateRates(
        before,
        after,
        frame.durationMs,
        id
      )
    : assertIdleUpdatesStopped(before, after, id);
  return {
    id,
    enabled,
    frame,
    resources,
    updateEvidence,
    planarUpdates: {
      before: before.reflection.planarUpdateCount,
      after: after.reflection.planarUpdateCount
    }
  };
}

async function runActiveWindow(page) {
  const offBefore = await runPerformancePhase(
    page,
    "off-before",
    false
  );
  const active = await runPerformancePhase(page, "on", true);
  const gpuTimer = await sampleGpuFrameEnvelope(page, 8);
  const offAfter = await runPerformancePhase(
    page,
    "off-after",
    false
  );
  const slowerControlFps = Math.min(
    offBefore.frame.averageFps,
    offAfter.frame.averageFps
  );
  const worseControlP95 = Math.max(
    offBefore.frame.p95FrameMs,
    offAfter.frame.p95FrameMs
  );
  const comparison = Object.freeze({
    activeToSlowerControlFpsRatio:
      active.frame.averageFps / slowerControlFps,
    activeToWorseControlP95Ratio:
      active.frame.p95FrameMs / worseControlP95
  });
  assertAcceptance(
    comparison.activeToSlowerControlFpsRatio >=
      performanceThresholds.minimumActiveToControlFpsRatio,
    "Ocean active-window FPS ratio is below 65%.",
    { offBefore, active, offAfter, comparison }
  );
  assertAcceptance(
    comparison.activeToWorseControlP95Ratio <=
      performanceThresholds.maximumActiveToControlP95Ratio,
    "Ocean active-window P95 ratio exceeds 2.5x.",
    { offBefore, active, offAfter, comparison }
  );
  for (const phase of [offBefore, active, offAfter]) {
    assertAcceptance(
      phase.frame.sampleCount >=
          performanceProfile.minimumFrameCount &&
        phase.frame.durationMs >=
          performanceProfile.minimumSampleDurationMs,
      `${phase.id} did not satisfy the formal sample envelope.`,
      phase.frame
    );
    assertAcceptance(
      phase.planarUpdates.after >
        phase.planarUpdates.before,
      `${phase.id} Planar reflection did not update.`,
      phase.planarUpdates
    );
  }
  if (gpuTimer.supported) {
    assertAcceptance(
      gpuTimer.status === "available" &&
        gpuTimer.sampleCount === 8 &&
        gpuTimer.milliseconds.every(
          (value) => Number.isFinite(value) && value > 0
        ),
      "Ocean active window did not capture eight valid GPU samples.",
      gpuTimer
    );
  }
  return {
    profile: performanceProfile,
    thresholds: performanceThresholds,
    phases: { offBefore, active, offAfter },
    comparison,
    gpuTimer
  };
}

function assertDisposed(snapshot, label) {
  const {
    runtime,
    reflection,
    scene,
    splash,
    foamDetail
  } = snapshot;
  assertAcceptance(
    snapshot.disposed === true,
    `${label} did not report disposal.`,
    snapshot
  );
  assertAcceptance(
    runtime.activeMeshCount === 0 &&
      runtime.activeMaterialCount === 0 &&
      runtime.meshCreateCount === runtime.meshDestroyCount &&
      runtime.materialCreateCount ===
        runtime.materialDestroyCount,
    `${label} mesh/material ownership is unbalanced.`,
    runtime
  );
  assertAcceptance(
    runtime.activeNearshoreTextureCount === 0 &&
      runtime.nearshoreTextureCreateCount ===
        runtime.nearshoreTextureDestroyCount &&
      runtime.nearshoreResourceBytes === 0 &&
      runtime.nearshoreDynamicResourceBytes === 0,
    `${label} nearshore texture/resource ownership is unbalanced.`,
    runtime
  );
  assertAcceptance(
    runtime.foamTextureCount === 0 &&
      runtime.foamTextureCreateCount ===
        runtime.foamTextureDestroyCount &&
      runtime.activeFoamEventQueueCount === 0 &&
      runtime.foamEventQueueCreateCount ===
        runtime.foamEventQueueDestroyCount &&
      runtime.foamPendingEventCount === 0 &&
      runtime.foamResourceBytes === 0,
    `${label} Foam texture/event ownership is unbalanced.`,
    runtime
  );
  assertAcceptance(
    scene.wetSandTextureCount === 0 &&
      scene.wetSandTextureCreateCount ===
        scene.wetSandTextureDestroyCount &&
      scene.wetSandResourceBytes === 0,
    `${label} wet-sand textures are unbalanced.`,
    scene
  );
  assertAcceptance(
    foamDetail?.ownership === "borrowed" &&
      foamDetail.destroyed === true &&
      foamDetail.textureCount === 0 &&
      foamDetail.textureCreateCount === 1 &&
      foamDetail.textureDestroyCount === 1 &&
      foamDetail.resourceBytes === 0,
    `${label} external Foam detail texture ownership is unbalanced.`,
    foamDetail
  );
  assertAcceptance(
    splash?.activeEmitterCount === 0 &&
      splash.activeMaterialCount === 0 &&
      splash.emitterCreateCount ===
        splash.emitterDestroyCount &&
      splash.materialCreateCount ===
        splash.materialDestroyCount &&
      splash.hasLiveParticles === false,
    `${label} splash emitter/material ownership is unbalanced.`,
    splash
  );
  assertAcceptance(
    reflection.planarCameraCount === 0 &&
      reflection.liveRenderTargetCount === 0 &&
      reflection.reflectionCameraCreateCount ===
        reflection.reflectionCameraDestroyCount &&
      reflection.renderTargetCreateCount ===
        reflection.renderTargetDestroyCount,
    `${label} reflection Camera/RT ownership is unbalanced.`,
    reflection
  );
  assertFiniteLifecycle(snapshot, label);
}

async function disposeOcean(page) {
  return page.evaluate(() => {
    const api = window.waterPcgOceanLifecycle;
    if (!api) {
      throw new Error(
        "window.waterPcgOceanLifecycle is unavailable."
      );
    }
    return structuredClone(api.dispose());
  });
}

async function gotoCase(page, definition) {
  const url = createCaseUrl(baseUrl, definition);
  await page.goto(url.href, {
    waitUntil: "domcontentloaded",
    timeout: 45_000
  });
  const snapshot = await waitForCaseReady(page, definition);
  assertCaseIdentity(snapshot, definition);
  assertRuntimeHealthy(snapshot, definition);
  return { url: url.href, snapshot };
}

async function runLifecycleRound(
  page,
  round,
  deterministicBaseline
) {
  await resetDeterministicState(page);
  await waitForAnimationFrames(page, 5);
  const before = await readLifecycleSnapshot(page);
  assertActiveResources(before, `round-${round}/before`);
  const frame = await sampleAnimationFrames(
    page,
    stableFrameCount
  );
  const after = await readLifecycleSnapshot(page);
  assertActiveResources(after, `round-${round}/after`);
  const resources = assertStableResources(
    before,
    after,
    `round-${round}`
  );
  const canvasProbe = await readCanvasProbe(page);
  assertCanvasHealthy(canvasProbe, `round-${round}`);
  const signature = deterministicSignature(after);
  const signatureHash = hashJson(signature);
  const screenshot = await page
    .locator("canvas#canvas")
    .screenshot({ type: "png" });
  const screenshotHash = hashBuffer(screenshot);
  if (deterministicBaseline) {
    assertAcceptance(
      signatureHash === deterministicBaseline.signatureHash,
      `round-${round} deterministic snapshot changed.`,
      {
        expected: deterministicBaseline.signature,
        actual: signature,
        expectedHash: deterministicBaseline.signatureHash,
        actualHash: signatureHash
      }
    );
    assertAcceptance(
      screenshotHash === deterministicBaseline.screenshotHash,
      `round-${round} deterministic screenshot changed.`,
      {
        expectedHash: deterministicBaseline.screenshotHash,
        actualHash: screenshotHash
      }
    );
  }
  if (round === 1 || round === lifecycleRounds) {
    await writeFile(
      resolve(
        run.outputDirectory,
        `round-${round}-deterministic.png`
      ),
      screenshot
    );
  }
  const disposed = await disposeOcean(page);
  assertDisposed(disposed, `round-${round}/disposed`);
  const other = await gotoCase(page, otherDefinition);
  const reentry = await gotoCase(page, oceanDefinition);
  return {
    round,
    frame,
    resources,
    signature,
    signatureHash,
    screenshotHash,
    disposed,
    navigation: {
      other: {
        url: other.url,
        caseId: other.snapshot.identity.caseId
      },
      reentry: {
        url: reentry.url,
        caseId: reentry.snapshot.identity.caseId
      }
    },
    baseline:
      deterministicBaseline ??
      Object.freeze({
        signature,
        signatureHash,
        screenshotHash
      })
  };
}

const report = {
  schemaVersion: 1,
  gate,
  status: "running",
  runId: run.runId,
  generatedAt: new Date().toISOString(),
  resultPath: run.resultPath,
  outputDirectory: run.outputDirectory,
  baseUrl,
  headed,
  environment: FIXED_ACCEPTANCE_ENVIRONMENT,
  source: readGitEvidence(),
  lifecycleRounds,
  stableFrameCount,
  activeWindow: null,
  rounds: [],
  finalDisposed: null,
  failures: []
};

let browser;
try {
  assertAcceptance(
    headed,
    "Formal Ocean lifecycle acceptance requires a headed browser."
  );
  await mkdir(run.outputDirectory, { recursive: true });
  browser = await chromium.launch({ headless: !headed });
  report.browserVersion = browser.version();
  const context = await browser.newContext({
    viewport: FIXED_ACCEPTANCE_ENVIRONMENT.viewport,
    deviceScaleFactor:
      FIXED_ACCEPTANCE_ENVIRONMENT.deviceScaleFactor
  });
  const page = await context.newPage();
  const diagnostics = collectPageDiagnostics(page);
  report.diagnostics = diagnostics;
  await gotoCase(page, oceanDefinition);
  await page.bringToFront();
  const webgl = await collectWebGlEnvironment(page);
  report.webgl = webgl;
  const rendererEvidence =
    `${webgl.unmaskedRenderer ?? ""} ${webgl.renderer ?? ""}`.trim();
  assertAcceptance(
    webgl.graphicsApi === "webgl2" &&
      rendererEvidence.length > 0 &&
      !SOFTWARE_RENDERER_PATTERN.test(rendererEvidence),
    "Ocean lifecycle formal lane did not resolve native WebGL2.",
    webgl
  );
  report.activeWindow = await runActiveWindow(page);

  await setFeatureStack(page, true, false);
  let deterministicBaseline;
  for (let round = 1; round <= lifecycleRounds; round++) {
    const result = await runLifecycleRound(
      page,
      round,
      deterministicBaseline
    );
    deterministicBaseline ??= result.baseline;
    delete result.baseline;
    report.rounds.push(result);
  }
  await resetDeterministicState(page);
  await waitForAnimationFrames(page, 5);
  const finalSnapshot = await readLifecycleSnapshot(page);
  assertActiveResources(finalSnapshot, "final-reentry");
  report.finalDisposed = await disposeOcean(page);
  assertDisposed(report.finalDisposed, "final-reentry/disposed");
  await page.goto("about:blank", {
    waitUntil: "load",
    timeout: 10_000
  });
  assertNoPageErrors(diagnostics, gate);
  await context.close();
  report.status = "passed";
} catch (error) {
  report.failures.push(serializeError(error));
  report.status = "failed";
} finally {
  await browser?.close().catch((error) => {
    report.failures.push({
      phase: "browser-close",
      ...serializeError(error)
    });
    report.status = "failed";
  });
  report.completedAt = new Date().toISOString();
  await writeAcceptanceReport(run, report);
  console.log(JSON.stringify(report, null, 2));
}

if (report.status !== "passed") process.exitCode = 1;
