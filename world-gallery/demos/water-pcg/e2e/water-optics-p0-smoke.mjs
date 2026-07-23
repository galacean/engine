import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const DEFAULT_URL = "http://127.0.0.1:4179/demos/water-pcg/#water-optics-lab";
const FIXED_SURFACE_TIME = 12.5;
const VIEWPORT = Object.freeze({ width: 1280, height: 720 });
const DEVICE_SCALE_FACTOR = 1;
const FRESH_CONTEXT_RELOAD_COUNT = 3;
const headed = process.env.WATER_OPTICS_HEADED === "1";
const SCRIPT_DIRECTORY = fileURLToPath(new URL(".", import.meta.url));
const WORLD_GALLERY_ROOT = resolve(SCRIPT_DIRECTORY, "../../..");
const runId = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const OUTPUT_DIRECTORY = resolve(
  process.env.WATER_OPTICS_P0_SMOKE_OUTPUT_DIR ??
    resolve(WORLD_GALLERY_ROOT, "output/playwright/water-optics-p0-smoke"),
  runId
);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function readGitProvenance() {
  try {
    return {
      head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: WORLD_GALLERY_ROOT, encoding: "utf8" }).trim(),
      dirty:
        execFileSync("git", ["status", "--porcelain", "--", "demos/water-pcg", "package.json", "../pnpm-lock.yaml"], {
          cwd: WORLD_GALLERY_ROOT,
          encoding: "utf8"
        }).trim().length > 0
    };
  } catch (error) {
    return { head: "unavailable", dirty: "unavailable", error: error instanceof Error ? error.message : String(error) };
  }
}

function collectBrowserErrors(page, errors, readbackWarnings) {
  page.on("pageerror", (error) => errors.push(`[pageerror] ${error.stack ?? error.message}`));
  page.on("console", (message) => {
    const text = message.text();
    if (message.type() === "error") errors.push(`[console] ${text}`);
    if (message.type() === "warning" && /GPU stall due to ReadPixels/i.test(text)) {
      // The smoke's explicit canvas variance probe causes this Chromium driver
      // performance notice. Keep it as instrumentation evidence, not a render error.
      readbackWarnings.push(text);
      return;
    }
    if (
      message.type() === "warning" &&
      /WebGL(?:[\s:.-]|$)|Could not compile WebGL shader|Could not link WebGL program|INVALID_(?:ENUM|VALUE|OPERATION|FRAMEBUFFER_OPERATION)/i.test(
        text
      )
    ) {
      errors.push(`[console-warning] ${text}`);
    }
  });
  page.on("requestfailed", (request) => {
    errors.push(`[requestfailed] ${request.url()} ${request.failure()?.errorText ?? "unknown"}`);
  });
}

function createTargetUrl(baseUrl, statsEnabled) {
  const url = new URL(baseUrl);
  url.search = "";
  url.hash = "water-optics-lab";
  url.searchParams.set("quality", "medium");
  url.searchParams.set("waterOptics", "medium");
  url.searchParams.set("opticsPreset", "refraction-correctness");
  url.searchParams.set("reflection", "sky");
  url.searchParams.set("surfaceTime", String(FIXED_SURFACE_TIME));
  url.searchParams.set("stats", statsEnabled ? "1" : "0");
  url.searchParams.set("statsPanel", "visible");
  return url;
}

function createDefaultTargetUrl(baseUrl) {
  const url = new URL(baseUrl);
  url.search = "";
  url.hash = "water-optics-lab";
  return url;
}

async function waitForWaterOpticsReady(page) {
  await page.waitForFunction(() => window.waterPcgOptics?.ready === true, null, { timeout: 30_000 });
}

async function waitForRenderedFrame(page) {
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      })
  );
}

async function readMetrics(page) {
  return page.evaluate(() => structuredClone(window.waterPcgOptics.metrics));
}

async function freezeAndReadMetrics(page) {
  await page.evaluate(() => window.waterPcgOptics.freezeTime(true));
  await waitForRenderedFrame(page);
  return readMetrics(page);
}

async function readCanvasLuminanceVariance(page) {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        requestAnimationFrame(() => {
          try {
            const source = document.querySelector("canvas#canvas");
            if (!(source instanceof HTMLCanvasElement)) throw new Error("Water Optics canvas is unavailable.");
            const probe = document.createElement("canvas");
            probe.width = 64;
            probe.height = 36;
            const context = probe.getContext("2d", { willReadFrequently: true });
            if (!context) throw new Error("2D canvas context is unavailable for the visual smoke probe.");
            context.drawImage(source, 0, 0, probe.width, probe.height);
            const pixels = context.getImageData(0, 0, probe.width, probe.height).data;
            let sum = 0;
            let sumSquares = 0;
            let fingerprint = 0x811c9dc5;
            for (let index = 0; index < pixels.length; index += 4) {
              const luminance = pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722;
              sum += luminance;
              sumSquares += luminance * luminance;
              for (let channel = 0; channel < 4; channel++) {
                fingerprint ^= pixels[index + channel];
                fingerprint = Math.imul(fingerprint, 0x01000193);
              }
            }
            const sampleCount = pixels.length / 4;
            const mean = sum / sampleCount;
            resolve({
              width: source.width,
              height: source.height,
              sampleCount,
              mean,
              variance: sumSquares / sampleCount - mean * mean,
              fingerprint: (fingerprint >>> 0).toString(16).padStart(8, "0")
            });
          } catch (error) {
            reject(error);
          }
        });
      })
  );
}

function assertFixedMediumMetrics(metrics, statsEnabled, label) {
  assert(metrics.ready === true, `${label} did not expose a ready metrics snapshot.`);
  assert(metrics.requestedTier === "medium", `${label} requested ${metrics.requestedTier}, expected medium.`);
  assert(metrics.resolvedTier === "medium", `${label} resolved ${metrics.resolvedTier}, expected medium.`);
  assert(metrics.fallbackReason === undefined, `${label} unexpectedly reported ${metrics.fallbackReason}.`);
  assert(metrics.frozen === true, `${label} did not keep the fixed scene frozen.`);
  assert(metrics.freeCameraEnabled === false, `${label} unexpectedly enabled Free Camera.`);
  assert(metrics.surfaceTime === FIXED_SURFACE_TIME, `${label} changed fixed surfaceTime to ${metrics.surfaceTime}.`);
  assert(
    typeof metrics.sourceHash === "string" && metrics.sourceHash.trim().length > 0,
    `${label} did not expose a non-empty sourceHash.`
  );
  assert(
    Number.isInteger(metrics.fixtureObjectCount) && metrics.fixtureObjectCount > 0,
    `${label} reported invalid fixtureObjectCount ${metrics.fixtureObjectCount}.`
  );
  assert(metrics.runtimeError === "", `${label} reported a runtime error: ${metrics.runtimeError}`);
  assert(metrics.statsEnabled === statsEnabled, `${label} exposed the wrong statsEnabled state.`);
  assert(metrics.statsPanelVisible === statsEnabled, `${label} exposed the wrong Stats panel visibility.`);
  assert(metrics.statsRole === "display-only", `${label} did not identify Stats as display-only.`);
  assert(metrics.cameraDepthCopyPassCount <= 1, `${label} exceeded one Camera depth copy pass.`);
  assert(metrics.cameraOpaqueCopyPassCount <= 1, `${label} exceeded one Camera opaque copy pass.`);
  assert(metrics.planarCameraCount === 0, `${label} unexpectedly retained a Planar Camera.`);
  assert(metrics.planarRenderTargetCount === 0, `${label} unexpectedly retained a Planar render target.`);
}

function assertHighestDefaultMetrics(metrics, label) {
  assert(metrics.ready === true, `${label} did not expose a ready metrics snapshot.`);
  assert(metrics.requestedTier === "high", `${label} requested ${metrics.requestedTier}, expected high.`);
  assert(metrics.resolvedTier === "high", `${label} resolved ${metrics.resolvedTier}, expected high.`);
  assert(metrics.reflectionMode === "planar", `${label} reflection mode is ${metrics.reflectionMode}.`);
  assert(metrics.reflectionSource === "planar", `${label} reflection source is ${metrics.reflectionSource}.`);
  assert(
    metrics.resolvedReflectionSource === "planar",
    `${label} resolved reflection source is ${metrics.resolvedReflectionSource}.`
  );
  assert(metrics.refractionEnabled === true, `${label} unexpectedly disabled refraction.`);
  assert(metrics.compositionMode === "precomposed", `${label} composition is ${metrics.compositionMode}.`);
  assert(metrics.depthWriteEnabled === false, `${label} unexpectedly enabled DepthWrite.`);
  assert(metrics.planarClipEnabled === true, `${label} unexpectedly disabled Planar clipping.`);
  assert(metrics.planarFilterSampleCount === 5, `${label} Planar sampling is not 5-tap.`);
  assert(metrics.opaqueDownsampling === "full", `${label} opaque sampling is ${metrics.opaqueDownsampling}.`);
  assert(metrics.planarCameraCount === 1, `${label} did not create exactly one Planar Camera.`);
  assert(metrics.planarRenderTargetCount === 1, `${label} did not create exactly one Planar render target.`);
  assert(metrics.runtimeError === "", `${label} reported a runtime error: ${metrics.runtimeError}`);
}

function assertStableMetrics(first, second, label) {
  assert(
    JSON.stringify(first) === JSON.stringify(second),
    `${label} metrics drifted while frozen:\nfirst=${JSON.stringify(first)}\nsecond=${JSON.stringify(second)}`
  );
}

async function readStatsPanelCountAfterRender(page, statsEnabled, label) {
  await waitForRenderedFrame(page);
  if (statsEnabled) {
    await page.waitForFunction(() => document.querySelectorAll(".gl-perf").length > 0, null, { timeout: 5_000 });
  }
  const count = await page.locator(".gl-perf").count();
  const expected = statsEnabled ? 1 : 0;
  assert(count === expected, `${label} rendered ${count} .gl-perf panels, expected ${expected}.`);
  return count;
}

async function verifyFixedScenario(browser, baseUrl, statsEnabled) {
  const label = statsEnabled ? "Medium stats=1" : "Medium stats=0";
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: DEVICE_SCALE_FACTOR });
  const page = await context.newPage();
  const errors = [];
  const readbackWarnings = [];
  const url = createTargetUrl(baseUrl, statsEnabled);
  collectBrowserErrors(page, errors, readbackWarnings);
  try {
    await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await waitForWaterOpticsReady(page);
    const statsPanelCountAfterRender = await readStatsPanelCountAfterRender(page, statsEnabled, label);
    const firstFrozenMetrics = await freezeAndReadMetrics(page);
    const secondFrozenMetrics = await freezeAndReadMetrics(page);
    assertFixedMediumMetrics(firstFrozenMetrics, statsEnabled, `${label} first frozen sample`);
    assertFixedMediumMetrics(secondFrozenMetrics, statsEnabled, `${label} second frozen sample`);
    assertStableMetrics(firstFrozenMetrics, secondFrozenMetrics, label);

    const canvas = await readCanvasLuminanceVariance(page);
    assert(
      canvas.width > 0 &&
        canvas.height > 0 &&
        canvas.sampleCount > 0 &&
        Number.isFinite(canvas.mean) &&
        Number.isFinite(canvas.variance) &&
        canvas.variance > 0,
      `${label} canvas is blank or visually uniform: ${JSON.stringify(canvas)}.`
    );
    assert(errors.length === 0, `${label} browser errors:\n${errors.join("\n")}`);

    await page.goto("about:blank", { waitUntil: "load", timeout: 10_000 });
    assert(errors.length === 0, `${label} cleanup errors:\n${errors.join("\n")}`);
    return {
      url: url.href,
      statsEnabled,
      statsPanelCountAfterRender,
      frozenMetricsStable: true,
      firstFrozenMetrics,
      secondFrozenMetrics,
      canvas,
      readbackWarnings: [...readbackWarnings],
      errors: [...errors]
    };
  } finally {
    await context.close();
  }
}

async function verifyHighestDefaultScenario(browser, baseUrl) {
  const label = "No-query highest default";
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: DEVICE_SCALE_FACTOR });
  const page = await context.newPage();
  const errors = [];
  const readbackWarnings = [];
  const url = createDefaultTargetUrl(baseUrl);
  collectBrowserErrors(page, errors, readbackWarnings);
  try {
    await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await waitForWaterOpticsReady(page);
    await waitForRenderedFrame(page);
    const snapshot = await readMetrics(page);
    assertHighestDefaultMetrics(snapshot, label);
    assert((await page.locator(".gl-perf").count()) === 0, `${label} unexpectedly created Stats.`);
    assert(errors.length === 0, `${label} browser errors:\n${errors.join("\n")}`);
    return {
      url: url.href,
      metrics: snapshot,
      readbackWarnings: [...readbackWarnings],
      errors: [...errors]
    };
  } finally {
    await context.close();
  }
}

async function verifyFreshContextReload(browser, baseUrl, expected, iteration) {
  const label = `Medium fresh-context reload ${iteration}`;
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: DEVICE_SCALE_FACTOR });
  const page = await context.newPage();
  const errors = [];
  const readbackWarnings = [];
  const url = createTargetUrl(baseUrl, false);
  collectBrowserErrors(page, errors, readbackWarnings);
  try {
    await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await waitForWaterOpticsReady(page);
    const beforeReload = await freezeAndReadMetrics(page);
    assertFixedMediumMetrics(beforeReload, false, `${label} before reload`);
    assert((await page.locator(".gl-perf").count()) === 0, `${label} created Stats with stats=0.`);

    await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
    await waitForWaterOpticsReady(page);
    const afterReload = await freezeAndReadMetrics(page);
    const canvas = await readCanvasLuminanceVariance(page);
    assertFixedMediumMetrics(afterReload, false, `${label} after reload`);
    assert((await page.locator(".gl-perf").count()) === 0, `${label} reload created Stats with stats=0.`);

    assert(
      beforeReload.sourceHash === afterReload.sourceHash && afterReload.sourceHash === expected.sourceHash,
      `${label} sourceHash drifted: ${beforeReload.sourceHash} -> ${afterReload.sourceHash}, expected ${expected.sourceHash}.`
    );
    assert(
      beforeReload.fixtureObjectCount === afterReload.fixtureObjectCount &&
        afterReload.fixtureObjectCount === expected.fixtureObjectCount,
      `${label} fixtureObjectCount drifted: ${beforeReload.fixtureObjectCount} -> ${afterReload.fixtureObjectCount}, expected ${expected.fixtureObjectCount}.`
    );
    assert(
      canvas.fingerprint === expected.canvasFingerprint,
      `${label} fixed canvas fingerprint drifted: ${canvas.fingerprint}, expected ${expected.canvasFingerprint}.`
    );
    assert(errors.length === 0, `${label} browser errors:\n${errors.join("\n")}`);

    await page.goto("about:blank", { waitUntil: "load", timeout: 10_000 });
    assert(errors.length === 0, `${label} cleanup errors:\n${errors.join("\n")}`);
    return {
      iteration,
      url: url.href,
      beforeReload: {
        sourceHash: beforeReload.sourceHash,
        fixtureObjectCount: beforeReload.fixtureObjectCount
      },
      afterReload: {
        sourceHash: afterReload.sourceHash,
        fixtureObjectCount: afterReload.fixtureObjectCount,
        canvasFingerprint: canvas.fingerprint
      },
      readbackWarnings: [...readbackWarnings],
      errors: [...errors]
    };
  } finally {
    await context.close();
  }
}

const targetUrl = new URL(process.env.WATER_OPTICS_URL ?? DEFAULT_URL);
await mkdir(OUTPUT_DIRECTORY, { recursive: true });
const report = {
  schemaVersion: 1,
  gate: "water-optics-p0-smoke",
  status: "running",
  generatedAt: new Date().toISOString(),
  outputDirectory: OUTPUT_DIRECTORY,
  headed,
  viewport: VIEWPORT,
  deviceScaleFactor: DEVICE_SCALE_FACTOR,
  fixedSurfaceTime: FIXED_SURFACE_TIME,
  formalPerformanceCaptureRun: false,
  source: readGitProvenance(),
  failures: []
};
let browser;
try {
  browser = await chromium.launch({ headless: !headed });
  report.browserVersion = browser.version();
  report.highestDefault = await verifyHighestDefaultScenario(browser, targetUrl);
  report.statsOff = await verifyFixedScenario(browser, targetUrl, false);
  report.statsOn = await verifyFixedScenario(browser, targetUrl, true);
  const fixedExpected = Object.freeze({
    sourceHash: report.statsOff.secondFrozenMetrics.sourceHash,
    fixtureObjectCount: report.statsOff.secondFrozenMetrics.fixtureObjectCount,
    canvasFingerprint: report.statsOff.canvas.fingerprint
  });
  report.freshContextReloads = [];
  for (let iteration = 1; iteration <= FRESH_CONTEXT_RELOAD_COUNT; iteration++) {
    report.freshContextReloads.push(await verifyFreshContextReload(browser, targetUrl, fixedExpected, iteration));
  }
  report.status = "passed";
} catch (error) {
  report.failures.push(error instanceof Error ? (error.stack ?? error.message) : String(error));
  report.status = "failed";
} finally {
  await browser?.close().catch((error) => {
    report.failures.push(`[browser-close] ${String(error)}`);
    report.status = "failed";
  });
  report.completedAt = new Date().toISOString();
  report.reportPath = resolve(OUTPUT_DIRECTORY, "result.json");
  await writeFile(report.reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

if (report.status !== "passed") process.exitCode = 1;
