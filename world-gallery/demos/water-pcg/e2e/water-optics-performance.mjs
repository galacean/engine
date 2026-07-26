import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const DEFAULT_URL = "http://127.0.0.1:4179/demos/water-pcg/#water-optics-lab";
const DEVICE_SCALE_FACTOR = 1;
const headed = process.env.WATER_OPTICS_HEADED === "1";
const fastSmoke = process.env.WATER_OPTICS_PERF_FAST === "1";
const requestedTier = process.env.WATER_OPTICS_PERF_TIER ?? "medium";
const requestedPreset = process.env.WATER_OPTICS_PERF_PRESET ?? "refraction-correctness";
const requestedScenarioId = process.env.WATER_OPTICS_PERF_SCENARIO?.trim() || undefined;
const requestedReflectionSourceOverride = process.env.WATER_OPTICS_PERF_REFLECTION?.trim() || undefined;
const PERFORMANCE_SCENARIOS = Object.freeze({
  "refraction-only": Object.freeze({
    id: "refraction-only",
    reflectionSource: "sky",
    planarEnabled: false,
    requiredTimerScopes: Object.freeze(["frame-envelope"])
  }),
  "refraction-plus-planar": Object.freeze({
    id: "refraction-plus-planar",
    reflectionSource: "planar",
    planarEnabled: true,
    requiredTimerScopes: Object.freeze(["frame-envelope", "planar-pass"])
  })
});
const VIEWPORTS = Object.freeze({
  medium: Object.freeze({ width: 1280, height: 720 }),
  high: Object.freeze({ width: 1920, height: 1080 })
});
const VIEWPORT = VIEWPORTS[requestedTier];
// requestAnimationFrame follows the display hosting the headed window. Pin
// formal captures to the primary display so multi-monitor window placement
// cannot silently switch the same run between different refresh rates.
const HEADED_BROWSER_LAUNCH_ARGUMENTS = Object.freeze(["--window-position=0,0"]);
const SCRIPT_DIRECTORY = fileURLToPath(new URL(".", import.meta.url));
const WORLD_GALLERY_ROOT = resolve(SCRIPT_DIRECTORY, "../../..");
const runId = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const OUTPUT_DIRECTORY = resolve(
  process.env.WATER_OPTICS_PERF_OUTPUT_DIR ?? resolve(WORLD_GALLERY_ROOT, "output/playwright/water-optics-performance"),
  runId
);
const RESULT_PATH = resolve(OUTPUT_DIRECTORY, "result.json");

const FAST_SMOKE_CAPTURE_OPTIONS = Object.freeze({
  mode: "smoke",
  warmupDurationMs: 100,
  minimumFrameCount: 30,
  minimumSampleDurationMs: 500,
  longFrameThresholdMs: 1000 / 60,
  phaseTimeoutMs: 15_000
});

let performanceScenario;
let requestedReflectionSource;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertApproximately(actual, expected, label, tolerance = 1e-9) {
  assert(
    Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance,
    `${label} was ${actual}, expected ${expected} ± ${tolerance}.`
  );
}

function assertFiniteNonNegative(value, label) {
  assert(Number.isFinite(value) && value >= 0, `${label} must be a finite non-negative value, got ${value}.`);
}

function serializeError(error) {
  return {
    name: error instanceof Error ? error.name : "Error",
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined
  };
}

function resolvePerformanceScenario() {
  const scenarioId =
    requestedScenarioId ??
    (requestedReflectionSourceOverride === "planar" ? "refraction-plus-planar" : "refraction-only");
  const scenario = PERFORMANCE_SCENARIOS[scenarioId];
  assert(
    scenario !== undefined,
    `Unsupported performance scenario ${scenarioId}; expected refraction-only or refraction-plus-planar.`
  );
  if (requestedReflectionSourceOverride !== undefined) {
    assert(
      requestedReflectionSourceOverride === scenario.reflectionSource,
      `WATER_OPTICS_PERF_REFLECTION=${requestedReflectionSourceOverride} conflicts with ` +
        `WATER_OPTICS_PERF_SCENARIO=${scenario.id}; expected ${scenario.reflectionSource}.`
    );
  }
  return scenario;
}

function createScenarioEvidence(scenario) {
  return {
    id: scenario.id,
    refractionEnabledDuringActivePhase: true,
    reflectionSource: scenario.reflectionSource,
    planarEnabledDuringActivePhase: scenario.planarEnabled,
    formalStatsQueryValue: "0",
    formalStatsEnabled: false,
    requiredTimerScopes: [...scenario.requiredTimerScopes]
  };
}

function readGitEvidence() {
  const execute = (args) =>
    execFileSync("git", args, {
      cwd: WORLD_GALLERY_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
  try {
    return Object.freeze({
      headSha: execute(["rev-parse", "HEAD"]),
      dirty: execute(["status", "--porcelain"]).length > 0
    });
  } catch {
    return Object.freeze({ headSha: "unavailable", dirty: null });
  }
}

function collectBrowserErrors(page, errors, driverPerformanceWarnings) {
  page.on("pageerror", (error) => errors.push(`[pageerror] ${error.stack ?? error.message}`));
  page.on("crash", () => errors.push("[page-crash] Chromium page crashed."));
  page.on("console", (message) => {
    const messageText = message.text();
    if (message.type() === "error") errors.push(`[console] ${messageText}`);
    if (message.type() === "warning" && /GPU stall due to ReadPixels/i.test(messageText)) {
      driverPerformanceWarnings.push(messageText);
      return;
    }
    if (
      message.type() === "warning" &&
      /WebGL(?:[\s:.-]|$)|Could not compile WebGL shader|Could not link WebGL program|INVALID_(?:ENUM|VALUE|OPERATION|FRAMEBUFFER_OPERATION)|CONTEXT_LOST_WEBGL/i.test(
        messageText
      )
    ) {
      errors.push(`[console-warning] ${messageText}`);
    }
  });
  page.on("requestfailed", (request) => {
    errors.push(`[requestfailed] ${request.url()} ${request.failure()?.errorText ?? "unknown"}`);
  });
  page.on("response", (response) => {
    if (response.status() >= 400) errors.push(`[http-${response.status()}] ${response.url()}`);
  });
}

function createTargetUrl(baseUrl, statsEnabled, reflectionSource = requestedReflectionSource) {
  const url = new URL(baseUrl);
  url.search = "";
  url.hash = "water-optics-lab";
  url.searchParams.set("quality", requestedTier);
  url.searchParams.set("waterOptics", requestedTier);
  url.searchParams.set("opticsPreset", requestedPreset);
  url.searchParams.set("stats", statsEnabled ? "1" : "0");
  url.searchParams.set("performanceHeaded", headed ? "1" : "0");
  url.searchParams.set("performanceReference", "desktop");
  url.searchParams.set("reflection", reflectionSource);
  return url;
}

async function waitForWaterOpticsReady(page) {
  await page.waitForFunction(() => window.waterPcgOptics?.ready === true, null, { timeout: 30_000 });
}

function assertOpticsState(phase, opticsEnabled) {
  const state = phase.opticsState;
  assert(state.refractionEnabled === opticsEnabled, `${phase.phase} refraction state drifted.`);
  const expectedCameraCopyCount = opticsEnabled ? 1 : 0;
  assert(
    state.cameraDepthCopyPassCount === expectedCameraCopyCount,
    `${phase.phase} Camera Depth Copy count was ${state.cameraDepthCopyPassCount}, expected ${expectedCameraCopyCount}.`
  );
  assert(
    state.cameraOpaqueCopyPassCount === expectedCameraCopyCount,
    `${phase.phase} Camera Opaque Copy count was ${state.cameraOpaqueCopyPassCount}, expected ${expectedCameraCopyCount}.`
  );
  const expectedPlanarCount = opticsEnabled && performanceScenario.planarEnabled ? 1 : 0;
  assert(
    state.planarCameraCount === expectedPlanarCount,
    `${phase.phase} Planar Camera count was ${state.planarCameraCount}, expected ${expectedPlanarCount}.`
  );
  assert(
    state.livePlanarRenderTargetCount === expectedPlanarCount,
    `${phase.phase} Planar RT count was ${state.livePlanarRenderTargetCount}, expected ${expectedPlanarCount}.`
  );
}

function assertGpuReport(report, expectedScope, phaseRequirements) {
  if (report.gpu.status === "valid") {
    assert(report.instrumentation.gpuTimerStatus === "valid", "Valid GPU data was not reflected in instrumentation.");
    assert(report.gpu.source === "EXT_disjoint_timer_query_webgl2", `Unexpected GPU source ${report.gpu.source}.`);
    assert(report.gpu.scope === expectedScope, `GPU scope was ${report.gpu.scope}, expected ${expectedScope}.`);
    assert(report.gpu.sampleCount > 0, "Valid GPU report has no samples.");
    assert(report.gpu.droppedSampleCount === 0, `GPU timer dropped ${report.gpu.droppedSampleCount} samples.`);
    assert(report.gpu.pendingQueryCount === 0, "GPU timer left pending queries.");

    if (expectedScope === "frame-envelope") {
      for (const phaseName of ["off-before", "on", "off-after"]) {
        const gpuPhase = report.gpu.phases[phaseName];
        assert(gpuPhase.sampleCount > 0, `${phaseName} frame-envelope GPU sample count is zero.`);
        if (!fastSmoke) {
          assert(
            gpuPhase.sampleCount >= phaseRequirements.minimumFrameCount,
            `${phaseName} accepted ${gpuPhase.sampleCount} GPU samples; expected at least ${phaseRequirements.minimumFrameCount}.`
          );
        }
        for (const metric of ["p50Ms", "p95Ms", "maxMs", "totalMs"]) {
          assertFiniteNonNegative(gpuPhase[metric], `gpu.phases.${phaseName}.${metric}`);
        }
      }
      assertFiniteNonNegative(report.gpu.baselineGpuP95Ms, "gpu.baselineGpuP95Ms");
      assertFiniteNonNegative(report.gpu.incrementalGpuP95EstimateMs, "gpu.incrementalGpuP95EstimateMs");
    } else {
      const minimumPlanarSamples = requestedTier === "medium" ? 120 : 250;
      if (!fastSmoke) {
        assert(
          report.gpu.sampleCount >= minimumPlanarSamples,
          `Planar pass accepted ${report.gpu.sampleCount} samples; expected at least ${minimumPlanarSamples}.`
        );
      }
      for (const metric of ["planarP50Ms", "planarP95Ms", "planarMaxMs", "planarTotalMs"]) {
        assertFiniteNonNegative(report.gpu[metric], `gpu.${metric}`);
      }
    }
    return;
  }

  assert(report.gpu.status === "unavailable", `Unexpected GPU result branch ${report.gpu.status}.`);
  assert(
    report.instrumentation.gpuTimerStatus === "unavailable",
    "Unavailable GPU data was not reflected in instrumentation."
  );
  assert(typeof report.gpu.reason === "string" && report.gpu.reason.length > 0, "GPU unavailable reason missing.");
  assert(!("incrementalGpuP95EstimateMs" in report.gpu), "Unavailable GPU timing fabricated an increment value.");
  assert(!("planarP95Ms" in report.gpu), "Unavailable GPU timing fabricated a Planar value.");
}

function assertFormalReport(report, expectedScope) {
  assert(report.valid === true, `Performance capture was invalid: ${JSON.stringify(report)}`);
  assert(report.environment.width === VIEWPORT.width, `Unexpected viewport width ${report.environment.width}.`);
  assert(report.environment.height === VIEWPORT.height, `Unexpected viewport height ${report.environment.height}.`);
  assert(report.environment.devicePixelRatio === DEVICE_SCALE_FACTOR, "Performance DPR changed during capture.");
  assert(typeof report.environment.browser === "string" && report.environment.browser.length > 0, "Browser missing.");
  assert(report.environment.graphicsApi === "webgl2", `Expected WebGL2, got ${report.environment.graphicsApi}.`);
  assert(report.environment.headed === headed, `Headed flag was ${report.environment.headed}, expected ${headed}.`);
  const expectedHeadedDetection = headed ? "query-parameter" : "headless-user-agent";
  assert(
    report.environment.headedDetection === expectedHeadedDetection,
    `Headed evidence source was ${report.environment.headedDetection}, expected ${expectedHeadedDetection}.`
  );
  assert(
    report.environment.gpuRendererStatus === "available" || report.environment.gpuRendererStatus === "unavailable",
    `Unexpected GPU renderer capability ${report.environment.gpuRendererStatus}.`
  );
  if (report.environment.gpuRendererStatus === "available") {
    assert(
      typeof report.environment.gpuRenderer === "string" && report.environment.gpuRenderer.length > 0,
      "Available GPU renderer did not include its renderer string."
    );
  }

  assert(report.instrumentation.statsEnabled === false, "Formal report must record statsEnabled=false.");
  assert(report.instrumentation.statsRole === "display-only", "Stats must remain display-only.");
  assert(report.instrumentation.frameSampler === "requestAnimationFrame", "Unexpected frame sampler.");
  assert(report.sampling.gpuTimerScope === expectedScope, `Sampling scope was ${report.sampling.gpuTimerScope}.`);
  assert(
    report.gate.target.reflectionSource === performanceScenario.reflectionSource,
    `Gate reflection source was ${report.gate.target.reflectionSource}, expected ${performanceScenario.reflectionSource}.`
  );
  const expectedGateKind = expectedScope === "frame-envelope" ? "formal-total-optics" : "planar-pass-sub-gate";
  assert(report.gate.kind === expectedGateKind, `Gate kind was ${report.gate.kind}, expected ${expectedGateKind}.`);

  const expectedMode = fastSmoke ? "smoke" : "formal";
  assert(report.sampling.mode === expectedMode, `Expected ${expectedMode} sampling, got ${report.sampling.mode}.`);
  assert(
    JSON.stringify(report.sampling.phaseSequence) === JSON.stringify(["off-before", "on", "off-after"]),
    "Performance phase sequence changed."
  );
  const phaseRequirements = fastSmoke
    ? FAST_SMOKE_CAPTURE_OPTIONS
    : { warmupDurationMs: 2000, minimumFrameCount: 300, minimumSampleDurationMs: 5000 };
  for (const [phaseName, opticsEnabled] of [
    ["off-before", false],
    ["on", true],
    ["off-after", false]
  ]) {
    const phase = report.phases[phaseName];
    assert(phase.phase === phaseName, `${phaseName} report used phase ${phase.phase}.`);
    assert(phase.opticsEnabled === opticsEnabled, `${phaseName} opticsEnabled was ${phase.opticsEnabled}.`);
    assert(phase.warmupDurationMs >= phaseRequirements.warmupDurationMs, `${phaseName} warmup was too short.`);
    assert(phase.frameCount >= phaseRequirements.minimumFrameCount, `${phaseName} frame sample was too small.`);
    assert(phase.sampleDurationMs >= phaseRequirements.minimumSampleDurationMs, `${phaseName} duration was too short.`);
    for (const metric of ["fps", "frameP50Ms", "frameP95Ms", "frameMaxMs", "longFrameRatio"]) {
      assertFiniteNonNegative(phase[metric], `${phaseName}.${metric}`);
    }
    assertOpticsState(phase, opticsEnabled);
  }

  const conservativeFps = Math.min(report.phases["off-before"].fps, report.phases["off-after"].fps);
  const conservativeP95 = Math.max(report.phases["off-before"].frameP95Ms, report.phases["off-after"].frameP95Ms);
  assertApproximately(report.comparison.baselineFps, conservativeFps, "Conservative FPS baseline");
  assertApproximately(report.comparison.baselineFrameP95Ms, conservativeP95, "Conservative P95 baseline");
  assertApproximately(
    report.comparison.activeToBaselineFpsRatio,
    report.phases.on.fps / conservativeFps,
    "Active/baseline FPS ratio"
  );
  assertApproximately(
    report.comparison.activeToBaselineFrameP95Ratio,
    report.phases.on.frameP95Ms / conservativeP95,
    "Active/baseline P95 ratio"
  );

  for (const key of ["textureBytes", "bufferBytes", "totalBytes"]) {
    assertFiniteNonNegative(report.engineMemory[key], `engineMemory.${key}`);
  }
  assert(
    report.engineMemory.totalBytes === report.engineMemory.textureBytes + report.engineMemory.bufferBytes,
    "Engine total bytes do not match texture + buffer bytes."
  );
  for (const key of [
    "cameraFeatureBytes",
    "planarBytes",
    "probeBytes",
    "compositeBytes",
    "historyBytes",
    "totalBytes"
  ]) {
    assertFiniteNonNegative(report.waterMemory[key], `waterMemory.${key}`);
  }
  assert(report.waterMemory.compositeBytes === 0, "P0 Composite bytes must remain explicitly zero.");
  assert(report.waterMemory.historyBytes === 0, "P0 History bytes must remain explicitly zero.");
  assert(
    report.waterMemory.totalBytes ===
      report.waterMemory.cameraFeatureBytes +
        report.waterMemory.planarBytes +
        report.waterMemory.probeBytes +
        report.waterMemory.compositeBytes +
        report.waterMemory.historyBytes,
    "Water total bytes do not match the attributed resources."
  );
  assert(report.memorySampledAtPhase === "on", "Memory must be sampled while optics are active.");

  const planar = performanceScenario.planarEnabled;
  if (planar) {
    assert(report.waterMemory.planarBytes > 0, "Refraction + Planar must attribute non-zero Planar bytes.");
  } else {
    assert(report.waterMemory.planarBytes === 0, "Refraction-only must not allocate Planar bytes.");
  }
  const expectedProfile = `${requestedTier}-refraction${planar ? "-planar" : ""}`;
  const expectedThresholds =
    requestedTier === "medium"
      ? planar
        ? { fpsRatio: 0.8, p95Ratio: 1.4, gpuP95Ms: 2.5 }
        : { fpsRatio: 0.9, p95Ratio: 1.2, gpuP95Ms: 2.5 }
      : planar
        ? { fpsRatio: 0.7, p95Ratio: 1.65, gpuP95Ms: 4 }
        : { fpsRatio: 0.85, p95Ratio: 1.3, gpuP95Ms: 4 };
  assert(report.gate.profile === expectedProfile, `Unexpected Gate profile ${report.gate.profile}.`);
  assert(
    report.gate.thresholds.minimumActiveToBaselineFpsRatio === expectedThresholds.fpsRatio,
    `${requestedTier} FPS threshold drifted.`
  );
  assert(
    report.gate.thresholds.maximumActiveToBaselineFrameP95Ratio === expectedThresholds.p95Ratio,
    `${requestedTier} P95 threshold drifted.`
  );
  assert(report.gate.thresholds.maximumActiveFrameP95Ms === 16.7, "Desktop P95 budget drifted.");
  assert(
    report.gate.thresholds.maximumOpticsGpuP95Ms === expectedThresholds.gpuP95Ms,
    `${requestedTier} GPU threshold drifted.`
  );

  assertGpuReport(report, expectedScope, phaseRequirements);
  if (report.gpu.status === "valid") {
    const expectedMeasurement =
      expectedScope === "frame-envelope" ? report.gpu.incrementalGpuP95EstimateMs : report.gpu.planarP95Ms;
    assertApproximately(report.gate.checks.opticsGpuP95Ms.measured, expectedMeasurement, "GPU Gate measurement");
    assert(report.gate.gpuStatus !== "unavailable", "Valid GPU timing left the GPU Gate unavailable.");
  } else {
    assert(report.gate.checks.opticsGpuP95Ms.status === "unavailable", "GPU Gate must be unavailable.");
    assert(report.gate.checks.opticsGpuP95Ms.measured === null, "Unavailable GPU Gate must use null, not zero.");
    assert(report.gate.gpuStatus === "unavailable", "GPU unavailable status drifted.");
    assert(
      report.gate.reasons.includes("gpu-timer-unavailable-formal-gate-incomplete"),
      "GPU-unavailable Gate reason missing."
    );
  }

  if (fastSmoke) {
    assert(report.gate.protocolStatus === "smoke-only", "Fast capture was not marked smoke-only.");
    assert(report.gate.overallStatus === "smoke-only", "Fast capture must not satisfy the formal Gate.");
  } else {
    assert(report.gate.protocolStatus === "pass", "Formal sampling protocol did not pass.");
    assert(report.gate.frameStatus === "pass", `Formal frame Gate failed: ${JSON.stringify(report.gate)}`);
    if (report.gpu.status === "valid") {
      assert(report.gate.gpuStatus === "pass", `Formal GPU Gate failed: ${JSON.stringify(report.gate)}`);
      assert(report.gate.overallStatus === "pass", `Formal Gate failed: ${JSON.stringify(report.gate)}`);
    } else {
      assert(report.gate.overallStatus === "incomplete", "Missing GPU timing must leave the Gate incomplete.");
    }
  }
}

async function runStatsOffCapture(browser, baseUrl, gpuTimerScope) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: DEVICE_SCALE_FACTOR });
  const page = await context.newPage();
  const errors = [];
  const driverPerformanceWarnings = [];
  collectBrowserErrors(page, errors, driverPerformanceWarnings);
  const url = createTargetUrl(baseUrl, false);
  try {
    await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await waitForWaterOpticsReady(page);
    assert((await page.locator(".gl-perf").count()) === 0, "Stats panel exists during stats=0 capture.");
    await page.evaluate(() => window.waterPcgOptics.setPlanarFilterEnabled(false));
    await page.evaluate((source) => window.waterPcgOptics.setReflectionSource(source), requestedReflectionSource);
    const options = { ...(fastSmoke ? FAST_SMOKE_CAPTURE_OPTIONS : {}), gpuTimerScope };
    const report = await page.evaluate(
      (captureOptions) => window.waterPcgOptics.runPerformanceCapture(captureOptions),
      options
    );
    await page.goto("about:blank", { waitUntil: "load", timeout: 10_000 });
    return {
      scenarioId: performanceScenario.id,
      role: gpuTimerScope === "frame-envelope" ? "formal-total-optics-gate" : "planar-pass-sub-gate",
      url: url.href,
      report,
      driverPerformanceWarnings: [...driverPerformanceWarnings],
      errors: [...errors]
    };
  } finally {
    await context.close();
  }
}

async function runValidatedStatsOffCapture(browser, baseUrl, gpuTimerScope) {
  const priorDisjointAttempts = [];
  for (let attempt = 1; attempt <= 2; attempt++) {
    const capture = await runStatsOffCapture(browser, baseUrl, gpuTimerScope);
    if (capture.report.valid === false && capture.report.reason === "gpu-timer-disjoint" && attempt === 1) {
      priorDisjointAttempts.push(capture);
      continue;
    }
    return {
      ...capture,
      attemptCount: attempt,
      disjointRetryCount: priorDisjointAttempts.length,
      priorDisjointAttempts
    };
  }
  throw new Error(`${gpuTimerScope} did not produce a result after its disjoint retry.`);
}

async function readStatsSnapshot(page) {
  return page.locator(".gl-perf").evaluate((panel) => {
    const labels = [...panel.querySelectorAll("dt")].map((element) =>
      (element.firstChild?.textContent ?? element.textContent ?? "").trim()
    );
    const values = [...panel.querySelectorAll("dd")].map((element) => (element.textContent ?? "").trim());
    const entries = Object.fromEntries(labels.map((label, index) => [label, values[index] ?? ""]));
    return {
      fps: Number(entries.FPS),
      drawCall: Number(entries.DrawCall),
      triangles: Number(entries.Triangles),
      textures: Number(entries.Textures),
      shaders: Number(entries.Shaders),
      webglContext: entries.WebGL,
      raw: entries
    };
  });
}

async function captureStatsDiagnostic(browser, baseUrl, reflectionSource) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: DEVICE_SCALE_FACTOR });
  const page = await context.newPage();
  const errors = [];
  const driverPerformanceWarnings = [];
  collectBrowserErrors(page, errors, driverPerformanceWarnings);
  const url = createTargetUrl(baseUrl, true, reflectionSource);
  try {
    await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await waitForWaterOpticsReady(page);
    await page.waitForFunction(() => document.querySelectorAll(".gl-perf").length === 1, null, { timeout: 5000 });
    await page.evaluate(() => window.waterPcgOptics.setPlanarFilterEnabled(false));
    await page.evaluate((source) => window.waterPcgOptics.setReflectionSource(source), reflectionSource);

    const rejection = await page.evaluate(async () => {
      try {
        await window.waterPcgOptics.runPerformanceCapture();
        return { rejected: false, message: "" };
      } catch (error) {
        return { rejected: true, message: error instanceof Error ? error.message : String(error) };
      }
    });
    assert(rejection.rejected, `stats=1 formal capture was not rejected for ${reflectionSource}.`);
    assert(rejection.message.includes("requires stats=0"), `Unexpected stats=1 rejection: ${rejection.message}`);

    if (fastSmoke) {
      await page.waitForTimeout(1200);
    } else {
      await page.waitForFunction(
        () => {
          const values = [...(document.querySelector(".gl-perf")?.querySelectorAll("dd") ?? [])];
          return values.length >= 8 && (values[7].textContent ?? "").trim() === "2.0";
        },
        null,
        { timeout: 70_000 }
      );
    }
    const snapshot = await readStatsSnapshot(page);
    for (const metric of ["fps", "drawCall", "triangles", "textures", "shaders"]) {
      assertFiniteNonNegative(snapshot[metric], `Stats(${reflectionSource}).${metric}`);
    }
    if (!fastSmoke) {
      assert(snapshot.fps > 0, `Stats(${reflectionSource}) FPS was not populated.`);
      assert(snapshot.webglContext === "2.0", `Stats(${reflectionSource}) did not report WebGL 2.0.`);
    }
    assert(errors.length === 0, `stats=1 ${reflectionSource} browser errors:\n${errors.join("\n")}`);
    return {
      url: url.href,
      statsPanelCount: 1,
      reflectionSource,
      snapshot,
      rejection,
      driverPerformanceWarnings: [...driverPerformanceWarnings],
      errors: [...errors]
    };
  } finally {
    await context.close();
  }
}

async function verifyStatsDisplayOnly(browser, baseUrl) {
  const [sky, planar] = await Promise.all([
    captureStatsDiagnostic(browser, baseUrl, "sky"),
    captureStatsDiagnostic(browser, baseUrl, "planar")
  ]);
  return {
    role: "display-only-diagnostic-not-a-formal-gate",
    sky,
    planar,
    planarMinusSky: {
      fps: planar.snapshot.fps - sky.snapshot.fps,
      drawCall: planar.snapshot.drawCall - sky.snapshot.drawCall,
      triangles: planar.snapshot.triangles - sky.snapshot.triangles
    }
  };
}

function resolveRunStatus(frameEnvelope, planarPass) {
  if (fastSmoke) return "incomplete";
  const captures = [frameEnvelope, planarPass].filter(Boolean);
  if (captures.some((capture) => capture.report.gate.overallStatus === "fail")) return "failed";
  if (captures.every((capture) => capture.report.gate.overallStatus === "pass")) return "pass";
  return "incomplete";
}

function createFormalGateSummary(status, frameEnvelope, planarPass) {
  const captures = [frameEnvelope, planarPass].filter(Boolean);
  const gpuStatuses = captures.map(
    (capture) => capture.report.gpu?.status ?? capture.report.instrumentation?.gpuTimerStatus ?? "invalid"
  );
  const gpuEvidenceStatus = gpuStatuses.some((gpuStatus) => gpuStatus === "unavailable")
    ? "unavailable"
    : gpuStatuses.length > 0 && gpuStatuses.every((gpuStatus) => gpuStatus === "valid")
      ? "valid"
      : "invalid";
  return {
    status,
    failClosed: true,
    gpuEvidenceStatus,
    frameEnvelopeStatus: frameEnvelope?.report.gate?.overallStatus ?? (frameEnvelope ? "invalid" : "not-run"),
    planarPassStatus:
      planarPass?.report.gate?.overallStatus ??
      (planarPass ? "invalid" : performanceScenario.planarEnabled ? "not-run" : "not-required"),
    requiredCaptureCount: performanceScenario.requiredTimerScopes.length,
    attemptedCaptureCount: captures.length,
    completedCaptureCount: captures.filter((capture) => capture.report.valid === true).length
  };
}

await mkdir(OUTPUT_DIRECTORY, { recursive: true });
const repository = readGitEvidence();
let targetUrl;
let browser;
let frameEnvelope;
let planarPass;
let statsDisplayOnly;
let finalReport;
let executionError;

try {
  performanceScenario = resolvePerformanceScenario();
  requestedReflectionSource = performanceScenario.reflectionSource;
  targetUrl = new URL(process.env.WATER_OPTICS_URL?.trim() || DEFAULT_URL);
  assert(["medium", "high"].includes(requestedTier), `Unsupported performance tier ${requestedTier}.`);
  assert(fastSmoke || headed, "Formal Water Optics performance capture requires WATER_OPTICS_HEADED=1.");
  browser = await chromium.launch({
    headless: !headed,
    args: headed ? [...HEADED_BROWSER_LAUNCH_ARGUMENTS] : []
  });
  frameEnvelope = await runValidatedStatsOffCapture(browser, targetUrl, "frame-envelope");
  assertFormalReport(frameEnvelope.report, "frame-envelope");
  assert(frameEnvelope.errors.length === 0, `frame-envelope browser errors:\n${frameEnvelope.errors.join("\n")}`);
  if (performanceScenario.planarEnabled) {
    planarPass = await runValidatedStatsOffCapture(browser, targetUrl, "planar-pass");
    assertFormalReport(planarPass.report, "planar-pass");
    assert(planarPass.errors.length === 0, `planar-pass browser errors:\n${planarPass.errors.join("\n")}`);
  }
  statsDisplayOnly = await verifyStatsDisplayOnly(browser, targetUrl);
  const status = resolveRunStatus(frameEnvelope, planarPass);
  assert(status !== "failed", `Water Optics performance Gate failed for ${performanceScenario.id}.`);
  assert(fastSmoke || status === "pass" || status === "incomplete", `Unexpected formal status ${status}.`);
  finalReport = {
    schemaVersion: 4,
    gate: "water-optics-performance",
    status,
    runId,
    capturedAtIso: new Date().toISOString(),
    headed,
    tier: requestedTier,
    preset: requestedPreset,
    scenario: createScenarioEvidence(performanceScenario),
    reflectionSource: requestedReflectionSource,
    browserVersion: browser.version(),
    browserLaunchArguments: headed ? HEADED_BROWSER_LAUNCH_ARGUMENTS : [],
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    samplingMode: fastSmoke ? "smoke" : "formal",
    formalMinimums: { warmupDurationMs: 2000, minimumFrameCount: 300, minimumSampleDurationMs: 5000 },
    repository,
    frameEnvelope,
    planarPass: planarPass ?? null,
    formalGateSummary: createFormalGateSummary(status, frameEnvelope, planarPass),
    statsDisplayOnly,
    resultPath: RESULT_PATH
  };
} catch (error) {
  executionError = error;
  finalReport = {
    schemaVersion: 4,
    gate: "water-optics-performance",
    status: "failed",
    runId,
    capturedAtIso: new Date().toISOString(),
    headed,
    tier: requestedTier,
    preset: requestedPreset,
    scenario: performanceScenario ? createScenarioEvidence(performanceScenario) : null,
    reflectionSource: requestedReflectionSource ?? requestedReflectionSourceOverride ?? null,
    browserVersion: browser?.version() ?? "unavailable",
    browserLaunchArguments: headed ? HEADED_BROWSER_LAUNCH_ARGUMENTS : [],
    viewport: VIEWPORT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    samplingMode: fastSmoke ? "smoke" : "formal",
    repository,
    frameEnvelope: frameEnvelope ?? null,
    planarPass: planarPass ?? null,
    formalGateSummary:
      performanceScenario && frameEnvelope ? createFormalGateSummary("failed", frameEnvelope, planarPass) : null,
    statsDisplayOnly: statsDisplayOnly ?? null,
    failure: serializeError(error),
    resultPath: RESULT_PATH
  };
} finally {
  try {
    await browser?.close();
  } catch (error) {
    const cleanupFailure = serializeError(error);
    if (!executionError) {
      executionError = error;
      finalReport = { ...finalReport, status: "failed", cleanupFailure };
    } else {
      finalReport = { ...finalReport, cleanupFailure };
    }
  }
  await writeFile(RESULT_PATH, `${JSON.stringify(finalReport, null, 2)}\n`, "utf8");
}

console.log(JSON.stringify(finalReport, null, 2));
if (executionError) throw executionError;
if (!fastSmoke && finalReport.status === "incomplete") process.exitCode = 2;
