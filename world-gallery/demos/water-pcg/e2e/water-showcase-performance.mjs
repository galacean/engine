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
  readCaseSnapshot,
  readGitEvidence,
  serializeError,
  SOFTWARE_RENDERER_PATTERN,
  summarizeCanvasProbe,
  waitForCaseReady,
  writeAcceptanceReport
} from "./water-acceptance-harness.mjs";
import { FIXED_ACCEPTANCE_ENVIRONMENT, WATER_SHOWCASE_CASES } from "./water-acceptance-cases.mjs";

const gate = "water-showcase-performance";
const run = createRunContext(gate);
const baseUrl = process.env.WATER_PCG_URL?.trim() || DEFAULT_WATER_PCG_URL;
const fastMode = process.env.WATER_PCG_PERF_FAST === "1";
const headed = process.env.WATER_PCG_HEADED === "0" ? false : !fastMode || process.env.WATER_PCG_HEADED === "1";
const profile = fastMode
  ? Object.freeze({ name: "smoke-only", warmupDurationMs: 250, minimumFrameCount: 30, minimumSampleDurationMs: 500 })
  : Object.freeze({ name: "formal", warmupDurationMs: 2000, minimumFrameCount: 300, minimumSampleDurationMs: 5000 });
const thresholds = Object.freeze({ minimumAverageFps: 55, maximumP95FrameMs: 20 });

function percentile(sorted, percentileValue) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * percentileValue) - 1));
  return sorted[index];
}

async function waitAnimationDuration(page, durationMs) {
  await page.evaluate(
    (minimumDurationMs) =>
      new Promise((resolveDuration, rejectDuration) => {
        const timeout = window.setTimeout(
          () => rejectDuration(new Error(`Animation warmup timed out after ${minimumDurationMs + 15_000}ms.`)),
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
  return page.evaluate(async (requestedSampleCount) => {
    const canvas = document.querySelector("canvas#canvas");
    if (!(canvas instanceof HTMLCanvasElement)) {
      return { status: "unavailable", supported: false, reason: "canvas-unavailable", sampleCount: 0 };
    }
    const gl = canvas.getContext("webgl2");
    if (!gl) return { status: "unavailable", supported: false, reason: "webgl2-unavailable", sampleCount: 0 };
    const extension = gl.getExtension("EXT_disjoint_timer_query_webgl2");
    if (!extension) {
      return { status: "unavailable", supported: false, reason: "extension-unavailable", sampleCount: 0 };
    }
    const nextFrame = () => new Promise((resolveFrame) => requestAnimationFrame(resolveFrame));
    const waitForResult = async (query) => {
      const deadline = performance.now() + 10_000;
      while (performance.now() < deadline) {
        const available = gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE);
        const disjoint = gl.getParameter(extension.GPU_DISJOINT_EXT);
        if (available) {
          if (disjoint) throw new Error("GPU timer became disjoint.");
          return Number(gl.getQueryParameter(query, gl.QUERY_RESULT));
        }
        await nextFrame();
      }
      throw new Error("GPU timer query timed out.");
    };

    const nanoseconds = [];
    try {
      for (let index = 0; index < requestedSampleCount; index++) {
        const query = gl.createQuery();
        if (!query) throw new Error("Unable to allocate a GPU timer query.");
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
        reason: error instanceof Error ? error.message : String(error),
        sampleCount: nanoseconds.length
      };
    }
    return {
      status: "available",
      supported: true,
      source: "EXT_disjoint_timer_query_webgl2",
      sampleCount: nanoseconds.length,
      nanoseconds
    };
  }, sampleCount);
}

function summarizeGpuTimer(result) {
  if (result.status !== "available") return result;
  const milliseconds = result.nanoseconds.map((value) => value / 1_000_000);
  const sorted = [...milliseconds].sort((left, right) => left - right);
  return {
    status: "available",
    supported: true,
    source: result.source,
    sampleCount: milliseconds.length,
    averageFrameMs: milliseconds.reduce((sum, value) => sum + value, 0) / milliseconds.length,
    p95FrameMs: percentile(sorted, 0.95),
    maximumFrameMs: sorted.at(-1) ?? 0
  };
}

function readAcceptanceSnapshot(snapshot, definition) {
  const acceptance = snapshot.acceptance;
  assertAcceptance(acceptance, `${definition.id} does not expose window.waterPcgAcceptance.`, snapshot);
  assertAcceptance(acceptance.ready === true, `${definition.id} acceptance snapshot is not ready.`, acceptance);
  assertAcceptance(
    acceptance.caseId === definition.id,
    `${definition.id} acceptance caseId is '${acceptance.caseId}'.`
  );
  assertAcceptance(
    acceptance.runtime === definition.runtime,
    `${definition.id} acceptance runtime is '${acceptance.runtime}'.`
  );
  assertAcceptance(
    acceptance.preset === definition.preset,
    `${definition.id} acceptance preset is '${acceptance.preset}'.`
  );
  assertAcceptance(
    acceptance.runtimeError === null,
    `${definition.id} acceptance runtimeError is not null.`,
    acceptance
  );
  assertAcceptance(acceptance.finite === true, `${definition.id} acceptance snapshot is not finite.`, acceptance);
  assertAcceptance(acceptance.qualityTier === "high", `${definition.id} is not High quality.`, acceptance);
  assertAcceptance(acceptance.opticsTier === "high", `${definition.id} is not High optics.`, acceptance);
  assertAcceptance(acceptance.refractionEnabled === true, `${definition.id} disabled refraction.`, acceptance);
  assertAcceptance(
    acceptance.frame?.finite === true,
    `${definition.id} runtime frame metrics are not finite.`,
    acceptance
  );
  assertAcceptance(acceptance.resources, `${definition.id} has no resource metrics.`, acceptance);
  assertAcceptance(acceptance.reflection, `${definition.id} has no reflection metrics.`, acceptance);
  assertAcceptance(
    acceptance.reflection.cameraCount <= 1,
    `${definition.id} owns duplicate Planar Cameras.`,
    acceptance
  );
  assertAcceptance(
    acceptance.reflection.renderTargetCount <= 1,
    `${definition.id} owns duplicate Planar RTs.`,
    acceptance
  );
  assertAcceptance(acceptance.reflection.failureCount === 0, `${definition.id} Planar reflection failed.`, acceptance);
  if (definition.runtime === "pool" || definition.runtime === "ocean") {
    assertAcceptance(
      acceptance.reflection.effectiveSource === "planar" &&
        acceptance.reflection.cameraCount === 1 &&
        acceptance.reflection.renderTargetCount === 1,
      `${definition.id} did not keep one effective Planar reflection owner.`,
      acceptance.reflection
    );
    assertAcceptance(
      acceptance.reflection.filterSampleCount === 5,
      `${definition.id} High Planar reflection did not use five samples.`,
      acceptance.reflection
    );
  }
  if (definition.runtime === "river" || definition.runtime === "ocean" || definition.runtime === "grasslands") {
    assertAcceptance(
      acceptance.resources.perFrameMeshUpload === false,
      `${definition.id} reports per-frame static mesh uploads.`,
      acceptance.resources
    );
  }
  const nonFinite = collectNonFinite(acceptance, `${definition.id}.acceptance`);
  assertAcceptance(
    nonFinite.length === 0,
    `${definition.id} acceptance has non-finite values: ${nonFinite.join(", ")}.`
  );
  return acceptance;
}

function assertStableResources(before, after, definition) {
  const fields = ["bufferMemory", "textureMemory", "totalMemory", "liveRenderTargets", "liveReflectionCameras"];
  if (definition.runtime === "river" || definition.runtime === "ocean" || definition.runtime === "grasslands") {
    fields.push("meshUploadCount");
  }
  const growth = Object.fromEntries(
    fields.map((field) => [field, Number(after.resources[field]) - Number(before.resources[field])])
  );
  for (const field of fields) {
    assertAcceptance(
      growth[field] === 0,
      `${definition.id} resource '${field}' changed by ${growth[field]} during stable sampling.`,
      { before: before.resources, after: after.resources, growth }
    );
  }
  assertAcceptance(
    before.reflection.cameraCount === after.reflection.cameraCount &&
      before.reflection.renderTargetCount === after.reflection.renderTargetCount &&
      before.reflection.ownerCount === after.reflection.ownerCount,
    `${definition.id} reflection ownership changed during stable sampling.`,
    { before: before.reflection, after: after.reflection }
  );
  return growth;
}

function readPlanarUpdateCount(snapshot, definition) {
  if (definition.runtime === "pool") {
    const value = Number(snapshot.datasets?.pool?.planarUpdateCount);
    return Number.isFinite(value) ? value : 0;
  }
  if (definition.runtime === "ocean") return Number(snapshot.reflection?.planarUpdateCount ?? 0);
  return 0;
}

async function runPerformanceCase(browser, definition) {
  const context = await browser.newContext({
    viewport: FIXED_ACCEPTANCE_ENVIRONMENT.viewport,
    deviceScaleFactor: FIXED_ACCEPTANCE_ENVIRONMENT.deviceScaleFactor
  });
  const page = await context.newPage();
  const diagnostics = collectPageDiagnostics(page);
  const url = createCaseUrl(baseUrl, definition, { profile: true });
  try {
    await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 45_000 });
    if (headed) await page.bringToFront();
    const ready = await waitForCaseReady(page, definition);
    assertCaseIdentity(ready, definition);
    assertRuntimeHealthy(ready, definition);
    const webgl = await collectWebGlEnvironment(page);
    assertAcceptance(webgl.graphicsApi === "webgl2", `${definition.id} did not use WebGL2.`, webgl);
    if (!fastMode) {
      const rendererEvidence = `${webgl.unmaskedRenderer ?? ""} ${webgl.renderer ?? ""}`.trim();
      assertAcceptance(rendererEvidence.length > 0, `${definition.id} exposed no renderer evidence.`, webgl);
      assertAcceptance(
        !SOFTWARE_RENDERER_PATTERN.test(rendererEvidence),
        `${definition.id} formal lane resolved a software renderer: ${rendererEvidence}.`,
        webgl
      );
    }
    assertAcceptance((await page.locator(".gl-perf").count()) === 0, `${definition.id} created a Stats panel.`);

    await waitAnimationDuration(page, profile.warmupDurationMs);
    const beforeSnapshot = await readCaseSnapshot(page, definition);
    const beforeAcceptance = readAcceptanceSnapshot(beforeSnapshot, definition);
    const beforePlanarUpdates = readPlanarUpdateCount(beforeSnapshot, definition);
    const frame = await sampleAnimationFrames(page, profile);
    const afterSnapshot = await readCaseSnapshot(page, definition);
    const afterAcceptance = readAcceptanceSnapshot(afterSnapshot, definition);
    const afterPlanarUpdates = readPlanarUpdateCount(afterSnapshot, definition);
    const resourceGrowth = assertStableResources(beforeAcceptance, afterAcceptance, definition);

    assertAcceptance(frame.sampleCount >= profile.minimumFrameCount, `${definition.id} sampled too few frames.`, frame);
    assertAcceptance(
      frame.durationMs >= profile.minimumSampleDurationMs,
      `${definition.id} sampled too briefly.`,
      frame
    );
    const nonFiniteFrame = collectNonFinite(frame, `${definition.id}.frame`);
    assertAcceptance(nonFiniteFrame.length === 0, `${definition.id} frame metrics are non-finite.`, frame);
    if (!fastMode) {
      assertAcceptance(
        frame.averageFps >= thresholds.minimumAverageFps,
        `${definition.id} averaged ${frame.averageFps.toFixed(2)} FPS, below ${thresholds.minimumAverageFps}.`,
        frame
      );
      assertAcceptance(
        frame.p95FrameMs <= thresholds.maximumP95FrameMs,
        `${definition.id} frame P95 ${frame.p95FrameMs.toFixed(2)}ms exceeds ${thresholds.maximumP95FrameMs}ms.`,
        frame
      );
    }
    if (definition.runtime === "pool" || definition.runtime === "ocean") {
      assertAcceptance(
        afterPlanarUpdates > beforePlanarUpdates,
        `${definition.id} Planar reflection did not update during frame sampling.`,
        { beforePlanarUpdates, afterPlanarUpdates }
      );
    }

    const gpuTimer = summarizeGpuTimer(await sampleGpuFrameEnvelope(page, fastMode ? 2 : 8));
    if (gpuTimer.supported) {
      assertAcceptance(
        gpuTimer.status === "available" && gpuTimer.sampleCount === (fastMode ? 2 : 8),
        `${definition.id} exposes GPU timer support but did not record every requested sample.`,
        gpuTimer
      );
      assertAcceptance(
        collectNonFinite(gpuTimer, `${definition.id}.gpuTimer`).length === 0 &&
          gpuTimer.averageFrameMs > 0 &&
          gpuTimer.p95FrameMs > 0,
        `${definition.id} GPU timer samples are empty or non-finite.`,
        gpuTimer
      );
    }
    const canvas = await readCanvasProbe(page);
    assertCanvasHealthy(canvas, `${definition.id} post-performance`);
    assertNoPageErrors(diagnostics, definition.id);
    await page.goto("about:blank", { waitUntil: "load", timeout: 10_000 });
    assertNoPageErrors(diagnostics, `${definition.id} cleanup`);
    return {
      id: definition.id,
      status: "passed",
      url: url.href,
      identity: afterSnapshot.identity,
      webgl,
      frame,
      gpuTimer,
      canvas: summarizeCanvasProbe(canvas),
      resourceGrowth,
      planarUpdates: { before: beforePlanarUpdates, after: afterPlanarUpdates },
      runtime: { before: beforeAcceptance, after: afterAcceptance },
      diagnostics
    };
  } finally {
    await context.close();
  }
}

const report = {
  schemaVersion: 1,
  gate,
  status: "running",
  qualification: profile.name,
  runId: run.runId,
  generatedAt: new Date().toISOString(),
  resultPath: run.resultPath,
  outputDirectory: run.outputDirectory,
  baseUrl,
  headed,
  profile,
  thresholds,
  environment: FIXED_ACCEPTANCE_ENVIRONMENT,
  source: readGitEvidence(),
  cases: [],
  failures: []
};

let browser;
try {
  assertAcceptance(fastMode || headed, "Formal performance acceptance requires a headed browser.");
  browser = await chromium.launch({ headless: !headed });
  report.browserVersion = browser.version();
  for (const definition of WATER_SHOWCASE_CASES) {
    try {
      report.cases.push(await runPerformanceCase(browser, definition));
    } catch (error) {
      const failure = { caseId: definition.id, ...serializeError(error) };
      report.failures.push(failure);
      report.cases.push({ id: definition.id, status: "failed", failure });
    }
  }
  report.status = report.failures.length === 0 ? "passed" : "failed";
} catch (error) {
  report.failures.push({ phase: "browser-launch", ...serializeError(error) });
  report.status = "failed";
} finally {
  await browser?.close().catch((error) => {
    report.failures.push({ phase: "browser-close", ...serializeError(error) });
    report.status = "failed";
  });
  report.completedAt = new Date().toISOString();
  await writeAcceptanceReport(run, report);
  console.log(JSON.stringify(report, null, 2));
}

if (report.status !== "passed") process.exitCode = 1;
