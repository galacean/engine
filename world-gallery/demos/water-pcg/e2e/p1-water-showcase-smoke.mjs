import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const DEFAULT_URL = "http://127.0.0.1:4179/demos/water-pcg/#p1-water-showcase";
const BODY_COUNTS = [1, 4, 8, 16];
const PERFORMANCE_BODY_COUNTS = [4, 8, 16];
const FOAM_DEBUG_VIEWS = ["source", "history", "final"];
const PERFORMANCE_SAMPLE_DURATION_MS = 1600;
const MINIMUM_ACTIVE_TO_CONTROL_FPS_RATIO = 0.65;
const MAXIMUM_ACTIVE_TO_CONTROL_P95_RATIO = 2.5;
const EXPECTED_FOAM_UPDATE_RATE_HZ = 30;
const OPTICAL_CONTINUITY_ROUNDS = 3;
const OPTICAL_CONTINUITY_MAXIMUM_DELTA = 1e-12;
const OPTICAL_CONTINUITY_ROI = Object.freeze([0.25, 0.2, 0.5, 0.6]);
const headed = process.env.P1_WATER_HEADED === "1";
const continuityOnly = process.env.P1_WATER_CONTINUITY_ONLY === "1";
const allowPlanarFailureFallback = process.env.P1_WATER_ALLOW_PLANAR_FALLBACK === "1";
const minimumAbsoluteActiveFps = readOptionalPositiveEnvironmentNumber("P1_WATER_MIN_ACTIVE_FPS");
const maximumAbsoluteActiveP95Ms = readOptionalPositiveEnvironmentNumber("P1_WATER_MAX_ACTIVE_P95_MS");
const scriptDirectory = fileURLToPath(new URL(".", import.meta.url));
const worldGalleryRoot = resolve(scriptDirectory, "../../..");
const runId = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const outputDirectory = resolve(
  process.env.P1_WATER_OUTPUT_DIR ?? resolve(worldGalleryRoot, "output/playwright/p1-water-showcase-smoke"),
  runId
);
const resultPath = resolve(outputDirectory, "result.json");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertFiniteNonNegative(value, label) {
  assert(Number.isFinite(value) && value >= 0, `${label} must be finite and non-negative.`);
}

function findNonFinite(value, path = "value") {
  if (typeof value === "number") return Number.isFinite(value) ? [] : [path];
  if (!value || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([key, child]) => findNonFinite(child, `${path}.${key}`));
}

function readOptionalPositiveEnvironmentNumber(name) {
  const rawValue = process.env[name];
  if (rawValue === undefined || rawValue === "") return null;
  const value = Number(rawValue);
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a finite positive number.`);
  return value;
}

function percentile(values, ratio) {
  assert(values.length > 0, "Frame timing window produced no samples.");
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

function assertUniformFoamSnapshot(metrics, label) {
  assert(metrics.foamCurrentSnapshotKind === "uniform", `${label} did not use a uniform current snapshot.`);
  assert(metrics.foamCurrentSnapshotRevision === 0, `${label} rebuilt or replaced revision 0 current data.`);
  assert(metrics.foamCurrentSnapshotBuildCount === 1, `${label} did not retain exactly one current snapshot build.`);
  assert(
    metrics.foamTargetUpdateRateHz === EXPECTED_FOAM_UPDATE_RATE_HZ,
    `${label} reported a ${metrics.foamTargetUpdateRateHz} Hz foam target instead of ${EXPECTED_FOAM_UPDATE_RATE_HZ} Hz.`
  );
}

function meanAbsoluteDifference(left, right, startRatio = 0) {
  assert(left.length === right.length && left.length > 0, "Canvas probes have incompatible sample counts.");
  const startIndex = Math.floor(left.length * startRatio);
  let difference = 0;
  for (let index = startIndex; index < left.length; index++) difference += Math.abs(left[index] - right[index]);
  return difference / (left.length - startIndex);
}

function collectBrowserErrors(page, errors) {
  page.on("pageerror", (error) => errors.push(`[pageerror] ${error.stack ?? error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`[console] ${message.text()}`);
    if (
      message.type() === "warning" &&
      /WebGL:|Could not compile WebGL shader|Could not link WebGL program/.test(message.text())
    ) {
      errors.push(`[console-warning] ${message.text()}`);
    }
  });
  page.on("requestfailed", (request) => {
    errors.push(`[requestfailed] ${request.url()} ${request.failure()?.errorText ?? "unknown"}`);
  });
}

function createTargetUrl(baseUrl, hash, parameters) {
  const url = new URL(baseUrl);
  url.search = "";
  url.hash = hash;
  for (const [name, value] of Object.entries(parameters)) url.searchParams.set(name, String(value));
  return url;
}

async function readPoolSnapshot(page) {
  return page.evaluate(() => ({
    pool: structuredClone(window.waterPcgInteractivePoolMetrics),
    p1: structuredClone(window.waterPcgP1?.metrics),
    underwater: window.waterPcgUnderwater
      ? {
          isUnderwater: window.waterPcgUnderwater.isUnderwater,
          activeBodyId: window.waterPcgUnderwater.activeBodyId,
          signedSurfaceDistance: window.waterPcgUnderwater.signedSurfaceDistance,
          submergedDepth: window.waterPcgUnderwater.submergedDepth,
          transitionCount: window.waterPcgUnderwater.transitionCount,
          passExecutionCount: window.waterPcgUnderwater.passExecutionCount,
          passMaterialAllocated: window.waterPcgUnderwater.passMaterialAllocated,
          passMaterialCreateCount: window.waterPcgUnderwater.passMaterialCreateCount,
          passMaterialDestroyCount: window.waterPcgUnderwater.passMaterialDestroyCount,
          opticalContinuity: structuredClone(window.waterPcgUnderwater.opticalContinuity)
        }
      : undefined
  }));
}

async function waitForPool(page, predicate, message, timeout = 15_000) {
  await page.waitForFunction(predicate, null, { timeout }).catch((error) => {
    throw new Error(`${message}\n${error instanceof Error ? error.message : String(error)}`);
  });
  return readPoolSnapshot(page);
}

async function waitForStableFoamSources(page, stableMilliseconds = 1200, timeout = 15_000) {
  const startedAt = performance.now();
  let stableSince = startedAt;
  let previousCount = -1;
  let latest;
  while (performance.now() - startedAt < timeout) {
    await page.waitForTimeout(120);
    latest = await readPoolSnapshot(page);
    const sourceCount = latest.p1.foamSourceInjectionCount;
    if (sourceCount !== previousCount) {
      previousCount = sourceCount;
      stableSince = performance.now();
    } else if (performance.now() - stableSince >= stableMilliseconds) {
      return { snapshot: latest, stableMilliseconds: performance.now() - stableSince };
    }
  }
  throw new Error(
    `Temporal foam sources did not become stable within ${timeout}ms (last count ${latest?.p1.foamSourceInjectionCount ?? "unknown"}).`
  );
}

async function verifyBodyCounts(page) {
  const snapshots = [];
  for (const bodyCount of BODY_COUNTS) {
    await page.evaluate((count) => window.waterPcgP1.setBodyCount(count), bodyCount);
    await page.waitForFunction(
      (count) => {
        const metrics = window.waterPcgP1?.metrics;
        return metrics?.bodyCount === count && metrics.additionalBodyCount === count - 1;
      },
      bodyCount,
      { timeout: 5_000 }
    );
    await page.waitForTimeout(120);
    const { p1 } = await readPoolSnapshot(page);
    assert(p1.bodyCount === bodyCount, `P1 body selector reported ${p1.bodyCount}, expected ${bodyCount}.`);
    assert(
      p1.additionalBodyCount === bodyCount - 1,
      `${bodyCount}-body mode created ${p1.additionalBodyCount} additional bodies.`
    );
    snapshots.push({
      bodyCount: p1.bodyCount,
      additionalBodyCount: p1.additionalBodyCount,
      drivingBodyCount: p1.drivingBodyCount,
      submergedBodyCount: p1.submergedBodyCount
    });
  }
  return snapshots;
}

async function verifyQueueAndMovingWakes(page) {
  await page.evaluate(() => {
    window.waterPcgP1.setBodyCount(16);
    window.waterPcgP1.restartWakes();
  });
  const before = (await readPoolSnapshot(page)).p1;
  const moving = await waitForPool(
    page,
    () => {
      const metrics = window.waterPcgP1?.metrics;
      return (
        metrics?.bodyCount === 16 &&
        metrics.drivingBodyCount > 0 &&
        metrics.maximumHorizontalSpeed > 0.05 &&
        metrics.acceptedEventCount > 0
      );
    },
    "The 16-body fleet did not produce bounded moving-wake events."
  );
  const metrics = moving.p1;
  assert(metrics.queueCapacity > 0, "P1 wake queue did not expose a positive capacity.");
  assert(metrics.emitterCapacity >= 16, "P1 wake queue cannot represent all 16 public emitter slots.");
  assert(
    metrics.peakQueuedEventCount <= metrics.queueCapacity,
    `Wake queue peak ${metrics.peakQueuedEventCount} exceeded capacity ${metrics.queueCapacity}.`
  );
  assertFiniteNonNegative(metrics.droppedEventCount, "P1 dropped/overflow event count");
  assertFiniteNonNegative(metrics.aggregatedEventCount, "P1 aggregated motion event count");
  assert(
    metrics.acceptedEventCount > before.acceptedEventCount,
    "Moving bodies did not increase accepted wake events."
  );

  await page.waitForFunction(
    (baseline) => window.waterPcgP1?.metrics.aggregatedEventCount > baseline,
    before.aggregatedEventCount,
    { timeout: 10_000 }
  );
  const aggregated = (await readPoolSnapshot(page)).p1;
  assert(
    aggregated.peakQueuedEventCount <= aggregated.queueCapacity,
    "Per-emitter aggregation allowed the bounded queue to exceed capacity."
  );
  return {
    capacity: aggregated.queueCapacity,
    emitterCapacity: aggregated.emitterCapacity,
    peakCount: aggregated.peakQueuedEventCount,
    acceptedCount: aggregated.acceptedEventCount,
    aggregatedCount: aggregated.aggregatedEventCount,
    droppedOverflowCount: aggregated.droppedEventCount,
    maximumHorizontalSpeed: aggregated.maximumHorizontalSpeed
  };
}

async function settleLegacyBallAndVerifyStationaryRejection(page) {
  await page.evaluate(() => window.waterPcgP1.setBodyCount(1));
  await waitForPool(
    page,
    () => window.waterPcgInteractivePoolMetrics?.settled === true,
    "The legacy pool ball did not settle before the stationary-wake gate.",
    30_000
  );
  const before = (await readPoolSnapshot(page)).p1;
  await page.waitForTimeout(1400);
  const after = (await readPoolSnapshot(page)).p1;
  assert(
    after.stationaryRejectedEventCount > before.stationaryRejectedEventCount,
    "Settled water contacts were not rejected by the stationary wake threshold."
  );
  assert(
    after.foamSourceInjectionCount - before.foamSourceInjectionCount <= 1,
    "A settled body continued injecting temporal-foam sources."
  );
  return {
    stationaryRejectedDelta: after.stationaryRejectedEventCount - before.stationaryRejectedEventCount,
    sourceInjectionDelta: after.foamSourceInjectionCount - before.foamSourceInjectionCount
  };
}

async function verifyTemporalFoam(page) {
  await page.evaluate(() => {
    window.waterPcgP1.setDynamicEffectsEnabled(false);
    window.waterPcgP1.setDebugView("source");
  });
  await page.waitForTimeout(160);
  await page.evaluate(() => {
    window.waterPcgP1.setDynamicEffectsEnabled(true);
    window.waterPcgP1.setBodyCount(16);
    window.waterPcgP1.restartWakes();
  });
  const before = (await readPoolSnapshot(page)).p1;
  const source = await waitForPool(
    page,
    () => {
      const metrics = window.waterPcgP1?.metrics;
      return (
        metrics?.debugView === "source" &&
        metrics.temporalFoamEnabled &&
        metrics.foamSourceInjectionCount > 0 &&
        metrics.foamPeakHistoryValue > 0 &&
        metrics.foamActiveHistoryPixelCount > 0
      );
    },
    "Moving wakes did not inject visible temporal-foam source/history data."
  );
  assert(
    source.p1.foamTextureUploadCount > before.foamTextureUploadCount,
    "Temporal foam produced no R8 texture upload."
  );
  assert(
    source.p1.foamTextureUploadsPerRenderFrame <= 1,
    "Temporal foam uploaded more than one texture in a render frame."
  );

  const debugSnapshots = [{ view: "source", uploadCount: source.p1.foamTextureUploadCount }];
  for (const view of FOAM_DEBUG_VIEWS.slice(1)) {
    await page.evaluate((nextView) => window.waterPcgP1.setDebugView(nextView), view);
    await page.waitForFunction((nextView) => window.waterPcgP1?.metrics.debugView === nextView, view, {
      timeout: 5_000
    });
    await page.waitForTimeout(100);
    const snapshot = (await readPoolSnapshot(page)).p1;
    assert(snapshot.foamTextureUploadsPerRenderFrame <= 1, `${view} view exceeded one texture upload per frame.`);
    debugSnapshots.push({ view, uploadCount: snapshot.foamTextureUploadCount });
  }

  await page.waitForFunction(() => window.waterPcgP1?.metrics.drivingBodyCount === 0, null, { timeout: 8_000 });
  const stable = await waitForStableFoamSources(page);
  const retained = stable.snapshot.p1;
  assert(retained.foamActiveHistoryPixelCount > 0, "Foam history vanished as soon as wake source injection stopped.");
  assert(retained.foamPeakHistoryValue > 0, "Foam history retained no measurable peak after the wake ended.");
  const retainedSourceCount = retained.foamSourceInjectionCount;
  const retainedPeak = retained.foamPeakHistoryValue;
  await page.waitForTimeout(450);
  const lifetime = (await readPoolSnapshot(page)).p1;
  assert(
    lifetime.foamActiveHistoryPixelCount > 0 && lifetime.foamPeakHistoryValue > 0,
    "Temporal foam did not retain a visible lifetime after source injection stopped."
  );
  await page.waitForFunction(
    ({ sourceCount, peak }) => {
      const metrics = window.waterPcgP1?.metrics;
      return (
        metrics?.foamSourceInjectionCount === sourceCount &&
        metrics.foamPeakHistoryValue > 0 &&
        metrics.foamPeakHistoryValue < peak * 0.85
      );
    },
    { sourceCount: retainedSourceCount, peak: retainedPeak },
    { timeout: 8_000 }
  );
  const decayed = (await readPoolSnapshot(page)).p1;
  assert(decayed.foamTextureUploadsPerRenderFrame <= 1, "Foam decay exceeded one R8 upload per render frame.");
  await page.waitForFunction(
    (sourceCount) => {
      const metrics = window.waterPcgP1?.metrics;
      return (
        metrics?.foamSourceInjectionCount === sourceCount &&
        metrics.foamActiveHistoryPixelCount === 0 &&
        metrics.foamPeakHistoryValue === 0
      );
    },
    retainedSourceCount,
    { timeout: 12_000 }
  );
  const idle = (await readPoolSnapshot(page)).p1;
  const idleUploadCount = idle.foamTextureUploadCount;
  await page.waitForTimeout(500);
  const idleAfterWait = (await readPoolSnapshot(page)).p1;
  assert(idleAfterWait.foamActiveHistoryPixelCount === 0, "Temporal foam became active again without a source.");
  assert(idleAfterWait.foamPeakHistoryValue === 0, "Temporal foam retained a quantized non-zero tail.");
  assert(
    idleAfterWait.foamTextureUploadCount === idleUploadCount,
    "Idle temporal foam continued uploading an unchanged R8 texture."
  );
  assert(idleAfterWait.foamTextureUploadsPerRenderFrame === 0, "Idle temporal foam reported an R8 upload.");
  return {
    debugSnapshots,
    sourceInjectionCount: retainedSourceCount,
    stableSourceMilliseconds: stable.stableMilliseconds,
    retainedActivePixels: retained.foamActiveHistoryPixelCount,
    retainedPeak,
    lifetimePeak: lifetime.foamPeakHistoryValue,
    decayedPeak: decayed.foamPeakHistoryValue,
    idleActivePixels: idleAfterWait.foamActiveHistoryPixelCount,
    idlePeak: idleAfterWait.foamPeakHistoryValue,
    idleUploadCount,
    updateCount: decayed.foamUpdateCount,
    textureUploadCount: decayed.foamTextureUploadCount,
    textureUploadsPerRenderFrame: decayed.foamTextureUploadsPerRenderFrame,
    resourceBytes: decayed.foamResourceBytes
  };
}

async function readFixedContinuityRoi(page, screenshotDataUrl) {
  return page.evaluate(
    async ({ dataUrl, roi: [xRatio, yRatio, widthRatio, heightRatio] }) => {
      const image = new Image();
      image.src = dataUrl;
      await image.decode();
      const probe = document.createElement("canvas");
      probe.width = 64;
      probe.height = 48;
      const context = probe.getContext("2d", { willReadFrequently: true });
      if (!context) throw new Error("Continuity ROI 2D context is unavailable.");
      const sourceX = Math.floor(image.naturalWidth * xRatio);
      const sourceY = Math.floor(image.naturalHeight * yRatio);
      const sourceWidth = Math.max(1, Math.floor(image.naturalWidth * widthRatio));
      const sourceHeight = Math.max(1, Math.floor(image.naturalHeight * heightRatio));
      context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, probe.width, probe.height);
      const pixels = context.getImageData(0, 0, probe.width, probe.height).data;
      let sum = 0;
      let sumSquares = 0;
      for (let index = 0; index < pixels.length; index += 4) {
        const luminance = pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722;
        sum += luminance;
        sumSquares += luminance * luminance;
      }
      const sampleCount = pixels.length / 4;
      const mean = sum / sampleCount;
      return {
        normalizedRoi: [xRatio, yRatio, widthRatio, heightRatio],
        sourceCanvasWidth: image.naturalWidth,
        sourceCanvasHeight: image.naturalHeight,
        sampleWidth: probe.width,
        sampleHeight: probe.height,
        meanLuminance: mean,
        luminanceVariance: sumSquares / sampleCount - mean * mean
      };
    },
    { dataUrl: screenshotDataUrl, roi: OPTICAL_CONTINUITY_ROI }
  );
}

async function captureOpticalContinuityState(page, tierDirectory, round, order, state) {
  await page.waitForTimeout(80);
  const screenshotPath = resolve(
    tierDirectory,
    `round-${String(round).padStart(2, "0")}-${String(order).padStart(2, "0")}-${state}.png`
  );
  const screenshot = await page.locator("canvas#canvas").screenshot({ path: screenshotPath, type: "png" });
  const roi = await readFixedContinuityRoi(page, `data:image/png;base64,${screenshot.toString("base64")}`);
  assert(
    Number.isFinite(roi.meanLuminance) && Number.isFinite(roi.luminanceVariance) && roi.luminanceVariance > 1,
    `${state} continuity ROI is blank or invalid: ${JSON.stringify(roi)}.`
  );
  return { screenshotPath, roi };
}

function assertOpticalContinuitySnapshot(snapshot, quality, state, baselineFingerprint, requireShaderBinding) {
  const continuity = snapshot.underwater?.opticalContinuity;
  assert(continuity, `${quality} ${state} did not expose optical-continuity diagnostics.`);
  const nonFinite = findNonFinite(continuity, `${quality}.${state}.opticalContinuity`);
  assert(nonFinite.length === 0, `${quality} ${state} has non-finite diagnostics: ${nonFinite.join(", ")}.`);
  assert(continuity.quality === quality, `${quality} ${state} reported continuity tier ${continuity.quality}.`);
  assert(continuity.configuredReferenceConsistent, `${quality} ${state} split the configured profile reference.`);
  assert(
    continuity.surfaceProfileFingerprint === continuity.underwaterProfileFingerprint,
    `${quality} ${state} resolved two optical-profile fingerprints.`
  );
  assert(
    continuity.surfaceProfileFingerprint === baselineFingerprint,
    `${quality} ${state} changed the optical-profile fingerprint during a boundary transition.`
  );
  assert(
    continuity.maximumResolvedProfileDelta <= OPTICAL_CONTINUITY_MAXIMUM_DELTA,
    `${quality} ${state} profile delta ${continuity.maximumResolvedProfileDelta} exceeded the continuity budget.`
  );
  assert(
    continuity.maximumMediumColorDelta <= OPTICAL_CONTINUITY_MAXIMUM_DELTA,
    `${quality} ${state} same-depth medium delta ${continuity.maximumMediumColorDelta} exceeded the continuity budget.`
  );
  assert(continuity.finite, `${quality} ${state} continuity readback was not finite.`);
  if (snapshot.underwater.isUnderwater) {
    assert(
      continuity.activeReferenceConsistent === true,
      `${quality} ${state} active WaterWorld profile was not shared.`
    );
    assert(
      continuity.activeProfileFingerprint === baselineFingerprint,
      `${quality} ${state} active WaterWorld profile resolved to a different medium.`
    );
  } else {
    assert(
      continuity.activeReferenceConsistent === null && continuity.activeProfileFingerprint === "",
      `${quality} ${state} retained an active WaterWorld profile outside the volume.`
    );
  }
  if (requireShaderBinding) {
    assert(
      continuity.underwaterShaderProfileBindCount > 0 &&
        continuity.shaderBoundUnderwaterProfileFingerprint === baselineFingerprint,
      `${quality} ${state} did not bind the shared resolved profile to the underwater shader.`
    );
  }
  return continuity;
}

async function verifyUnderwaterPresets(page, quality, tierDirectory) {
  await mkdir(tierDirectory, { recursive: true });
  await page.evaluate(() => {
    window.waterPcgP1.setDynamicEffectsEnabled(false);
    window.waterPcgP1.setBodyCount(1);
    window.waterPcgUnderwater.setPreset("outside");
  });
  const initial = await waitForPool(
    page,
    () =>
      window.waterPcgUnderwater?.isUnderwater === false && window.waterPcgUnderwater?.passMaterialAllocated === false,
    `${quality} outside preset remained inside a water volume.`
  );
  const baselineFingerprint = initial.underwater.opticalContinuity.surfaceProfileFingerprint;
  assert(baselineFingerprint.length > 0, `${quality} surface profile fingerprint is empty.`);
  assertOpticalContinuitySnapshot(initial, quality, "initial-outside", baselineFingerprint, false);

  const rounds = [];
  let shaderBindingObserved = initial.underwater.opticalContinuity.underwaterShaderProfileBindCount > 0;
  for (let round = 1; round <= OPTICAL_CONTINUITY_ROUNDS; round++) {
    const transitionCountBefore = (await readPoolSnapshot(page)).underwater.transitionCount;
    const states = [];

    const outside = await waitForPool(
      page,
      () =>
        window.waterPcgUnderwater?.isUnderwater === false && window.waterPcgUnderwater?.passMaterialAllocated === false,
      `${quality} round ${round} did not start outside.`
    );
    const outsideContinuity = assertOpticalContinuitySnapshot(
      outside,
      quality,
      `round-${round}-outside`,
      baselineFingerprint,
      shaderBindingObserved
    );
    states.push({
      state: "outside",
      underwater: outside.underwater,
      continuity: outsideContinuity,
      visual: await captureOpticalContinuityState(page, tierDirectory, round, 1, "outside")
    });

    await page.evaluate(() => window.waterPcgUnderwater.setPreset("surface"));
    const surfaceAir = await waitForPool(
      page,
      () => {
        const api = window.waterPcgUnderwater;
        return api?.isUnderwater === false && api.passMaterialAllocated === false;
      },
      `${quality} round ${round} air-side surface crossed the enter hysteresis.`
    );
    const surfaceAirContinuity = assertOpticalContinuitySnapshot(
      surfaceAir,
      quality,
      `round-${round}-surface-air`,
      baselineFingerprint,
      shaderBindingObserved
    );
    states.push({
      state: "surface-air",
      underwater: surfaceAir.underwater,
      continuity: surfaceAirContinuity,
      visual: await captureOpticalContinuityState(page, tierDirectory, round, 2, "surface-air")
    });

    const passBeforeInside = surfaceAir.underwater.passExecutionCount;
    const materialCreatesBeforeInside = surfaceAir.underwater.passMaterialCreateCount;
    await page.evaluate(() => window.waterPcgUnderwater.setPreset("inside"));
    await waitForPool(
      page,
      () => {
        const api = window.waterPcgUnderwater;
        return (
          api?.isUnderwater === true &&
          api.activeBodyId === "interactive-pool" &&
          api.submergedDepth > 0.25 &&
          api.passMaterialAllocated === true
        );
      },
      `${quality} round ${round} inside preset did not activate the pool volume.`
    );
    await page.waitForFunction(
      (baseline) => window.waterPcgUnderwater?.passExecutionCount > baseline,
      passBeforeInside,
      {
        timeout: 5_000
      }
    );
    const inside = await readPoolSnapshot(page);
    assert(
      inside.underwater.passMaterialCreateCount > materialCreatesBeforeInside,
      `${quality} round ${round} did not lazily create the underwater material.`
    );
    shaderBindingObserved = true;
    const insideContinuity = assertOpticalContinuitySnapshot(
      inside,
      quality,
      `round-${round}-inside`,
      baselineFingerprint,
      true
    );
    states.push({
      state: "inside",
      underwater: inside.underwater,
      continuity: insideContinuity,
      visual: await captureOpticalContinuityState(page, tierDirectory, round, 3, "inside")
    });

    await page.evaluate(() => window.waterPcgUnderwater.setPreset("surface"));
    const surfaceWater = await waitForPool(
      page,
      () => {
        const api = window.waterPcgUnderwater;
        return (
          api?.isUnderwater === true &&
          api.activeBodyId === "interactive-pool" &&
          Math.abs(api.signedSurfaceDistance) <= 0.12 &&
          api.passMaterialAllocated === true
        );
      },
      `${quality} round ${round} water-side surface did not preserve the exit hysteresis.`
    );
    const surfaceWaterContinuity = assertOpticalContinuitySnapshot(
      surfaceWater,
      quality,
      `round-${round}-surface-water`,
      baselineFingerprint,
      true
    );
    states.push({
      state: "surface-water",
      underwater: surfaceWater.underwater,
      continuity: surfaceWaterContinuity,
      visual: await captureOpticalContinuityState(page, tierDirectory, round, 4, "surface-water")
    });

    await page.evaluate(() => window.waterPcgUnderwater.setPreset("outside"));
    await page.waitForFunction(
      () =>
        window.waterPcgUnderwater?.isUnderwater === false && window.waterPcgUnderwater?.passMaterialAllocated === false,
      null,
      { timeout: 5_000 }
    );
    await page.waitForTimeout(160);
    const finalOutside = await readPoolSnapshot(page);
    assert(
      finalOutside.underwater.passMaterialDestroyCount > inside.underwater.passMaterialDestroyCount,
      `${quality} round ${round} did not destroy the underwater material on exit.`
    );
    const outsidePassExecutionCount = finalOutside.underwater.passExecutionCount;
    await page.waitForTimeout(240);
    const finalOutsideAfterWait = await readPoolSnapshot(page);
    assert(
      finalOutsideAfterWait.underwater.passExecutionCount === outsidePassExecutionCount,
      `${quality} round ${round} underwater pass continued executing after exit.`
    );
    const finalOutsideContinuity = assertOpticalContinuitySnapshot(
      finalOutsideAfterWait,
      quality,
      `round-${round}-final-outside`,
      baselineFingerprint,
      true
    );
    states.push({
      state: "final-outside",
      underwater: finalOutsideAfterWait.underwater,
      continuity: finalOutsideContinuity,
      visual: await captureOpticalContinuityState(page, tierDirectory, round, 5, "final-outside")
    });

    const transitionCountDelta = finalOutsideAfterWait.underwater.transitionCount - transitionCountBefore;
    assert(
      transitionCountDelta === 2,
      `${quality} round ${round} produced ${transitionCountDelta} transitions instead of one enter and one exit.`
    );
    rounds.push({ round, transitionCountDelta, states });
  }

  return {
    quality,
    rounds: OPTICAL_CONTINUITY_ROUNDS,
    sequence: ["outside", "surface-air", "inside", "surface-water", "final-outside"],
    maximumAllowedDelta: OPTICAL_CONTINUITY_MAXIMUM_DELTA,
    fixedDepthMeters: initial.underwater.opticalContinuity.surfaceMediumReadback.opticalDistanceMeters,
    baselineFingerprint,
    evidence: rounds
  };
}

async function preparePerformancePhase(page, bodyCount, dynamicEffectsEnabled) {
  const before = await readPoolSnapshot(page);
  await page.evaluate(
    ({ count, enabled }) => {
      const api = window.waterPcgP1;
      if (!api) throw new Error("P1 debug API is unavailable.");
      api.setDynamicEffectsEnabled(false);
      api.setBodyCount(count);
      api.setDebugView("final");
      if (enabled) api.setDynamicEffectsEnabled(true);
      api.restartWakes();
    },
    { count: bodyCount, enabled: dynamicEffectsEnabled }
  );
  await page.waitForFunction(
    ({ count, enabled, sourceBaseline }) => {
      const metrics = window.waterPcgP1?.metrics;
      if (
        metrics?.bodyCount !== count ||
        metrics.dynamicEffectsEnabled !== enabled ||
        metrics.drivingBodyCount <= 0 ||
        metrics.maximumHorizontalSpeed <= 0.05
      ) {
        return false;
      }
      return (
        !enabled ||
        (metrics.foamSourceInjectionCount > sourceBaseline &&
          metrics.foamPeakHistoryValue > 0 &&
          metrics.foamActiveHistoryPixelCount > 0)
      );
    },
    {
      count: bodyCount,
      enabled: dynamicEffectsEnabled,
      sourceBaseline: before.p1.foamSourceInjectionCount
    },
    { timeout: 15_000 }
  );
  const activated = await readPoolSnapshot(page);
  assertUniformFoamSnapshot(activated.p1, `${bodyCount}-body ${dynamicEffectsEnabled ? "active" : "control"} phase`);
  return { before, activated };
}

async function capturePerformanceWindow(page) {
  const raw = await page.evaluate(
    (durationMilliseconds) =>
      new Promise((resolve, reject) => {
        const intervals = [];
        let startTimestamp = 0;
        let previousTimestamp = 0;
        let startCounters;
        const readCounters = () => {
          const pool = window.waterPcgInteractivePoolMetrics;
          const p1 = window.waterPcgP1?.metrics;
          if (!pool || !p1) throw new Error("P1 performance counters are unavailable.");
          return {
            renderFrameCount: pool.renderFrameCount,
            foamUpdateCount: p1.foamUpdateCount,
            foamSourceInjectionCount: p1.foamSourceInjectionCount,
            foamCurrentLookupCount: p1.foamCurrentLookupCount,
            foamFullSurfaceQueryCount: p1.foamFullSurfaceQueryCount,
            foamRateLimitedFrameCount: p1.foamRateLimitedFrameCount
          };
        };
        const sampleFrame = (timestamp) => {
          try {
            if (!startCounters) {
              startTimestamp = timestamp;
              previousTimestamp = timestamp;
              startCounters = readCounters();
              requestAnimationFrame(sampleFrame);
              return;
            }
            intervals.push(timestamp - previousTimestamp);
            previousTimestamp = timestamp;
            if (timestamp - startTimestamp < durationMilliseconds) {
              requestAnimationFrame(sampleFrame);
              return;
            }
            resolve({
              elapsedMs: timestamp - startTimestamp,
              frameIntervalsMs: intervals,
              start: startCounters,
              end: readCounters()
            });
          } catch (error) {
            reject(error);
          }
        };
        requestAnimationFrame(sampleFrame);
      }),
    PERFORMANCE_SAMPLE_DURATION_MS
  );
  assert(raw.frameIntervalsMs.length >= 3, "P1 performance window collected fewer than three animation frames.");
  const renderFrameDelta = raw.end.renderFrameCount - raw.start.renderFrameCount;
  const foamUpdateDelta = raw.end.foamUpdateCount - raw.start.foamUpdateCount;
  assert(renderFrameDelta > 0, "P1 performance window recorded no Galacean render frames.");
  return {
    elapsedMs: raw.elapsedMs,
    animationFrameSampleCount: raw.frameIntervalsMs.length,
    renderFrameDelta,
    engineFps: (renderFrameDelta * 1000) / raw.elapsedMs,
    animationFrameFps: (raw.frameIntervalsMs.length * 1000) / raw.elapsedMs,
    frameP50Ms: percentile(raw.frameIntervalsMs, 0.5),
    frameP95Ms: percentile(raw.frameIntervalsMs, 0.95),
    frameMaxMs: Math.max(...raw.frameIntervalsMs),
    foamUpdateDelta,
    foamUpdateRateHz: (foamUpdateDelta * 1000) / raw.elapsedMs,
    foamSourceInjectionDelta: raw.end.foamSourceInjectionCount - raw.start.foamSourceInjectionCount,
    foamCurrentLookupDelta: raw.end.foamCurrentLookupCount - raw.start.foamCurrentLookupCount,
    foamFullSurfaceQueryDelta: raw.end.foamFullSurfaceQueryCount - raw.start.foamFullSurfaceQueryCount,
    foamRateLimitedFrameDelta: raw.end.foamRateLimitedFrameCount - raw.start.foamRateLimitedFrameCount
  };
}

async function measurePerformancePhase(page, bodyCount, dynamicEffectsEnabled) {
  const label = `${bodyCount}-body ${dynamicEffectsEnabled ? "active" : "control"} phase`;
  const { before, activated } = await preparePerformancePhase(page, bodyCount, dynamicEffectsEnabled);
  const frameWindow = await capturePerformanceWindow(page);
  const after = await readPoolSnapshot(page);
  assertUniformFoamSnapshot(after.p1, label);
  const fullSurfaceQueryDelta = after.p1.foamFullSurfaceQueryCount - before.p1.foamFullSurfaceQueryCount;
  assert(fullSurfaceQueryDelta === 0, `${label} performed ${fullSurfaceQueryDelta} full surface queries.`);
  assert(
    frameWindow.foamFullSurfaceQueryDelta === 0,
    `${label} performed ${frameWindow.foamFullSurfaceQueryDelta} full surface queries inside the timing window.`
  );

  if (dynamicEffectsEnabled) {
    const activationSourceInjectionDelta = activated.p1.foamSourceInjectionCount - before.p1.foamSourceInjectionCount;
    assert(activationSourceInjectionDelta > 0, `${label} did not inject a moving-wake foam source.`);
    assert(frameWindow.foamUpdateDelta > 0, `${label} performed no temporal-foam updates.`);
    assert(after.p1.foamActiveHistoryPixelCount > 0, `${label} ended without active temporal-foam history.`);
    assert(
      after.p1.foamLastStepDeltaSeconds + 1e-6 >= 1 / EXPECTED_FOAM_UPDATE_RATE_HZ,
      `${label} stepped faster than the ${EXPECTED_FOAM_UPDATE_RATE_HZ} Hz cap.`
    );
    const maximumScheduledUpdates = Math.ceil((frameWindow.elapsedMs * EXPECTED_FOAM_UPDATE_RATE_HZ) / 1000) + 1;
    assert(
      frameWindow.foamUpdateDelta <= maximumScheduledUpdates,
      `${label} performed ${frameWindow.foamUpdateDelta} updates; at most ${maximumScheduledUpdates} fit the capped window.`
    );
  } else {
    assert(frameWindow.foamUpdateDelta === 0, `${label} updated temporal foam while dynamic effects were disabled.`);
  }

  return {
    bodyCount,
    dynamicEffectsEnabled,
    activationSourceInjectionDelta: activated.p1.foamSourceInjectionCount - before.p1.foamSourceInjectionCount,
    fullSurfaceQueryDelta,
    snapshot: {
      kind: after.p1.foamCurrentSnapshotKind,
      revision: after.p1.foamCurrentSnapshotRevision,
      buildCount: after.p1.foamCurrentSnapshotBuildCount
    },
    targetUpdateRateHz: after.p1.foamTargetUpdateRateHz,
    lastStepDeltaSeconds: after.p1.foamLastStepDeltaSeconds,
    ...frameWindow
  };
}

async function runBodyPerformanceAttempt(page, bodyCount) {
  const controlBefore = await measurePerformancePhase(page, bodyCount, false);
  const active = await measurePerformancePhase(page, bodyCount, true);
  const controlAfter = await measurePerformancePhase(page, bodyCount, false);
  const controlFps = Math.min(controlBefore.engineFps, controlAfter.engineFps);
  const controlFrameP95Ms = Math.max(controlBefore.frameP95Ms, controlAfter.frameP95Ms);
  return {
    bodyCount,
    controlBefore,
    active,
    controlAfter,
    controlFps,
    controlFrameP95Ms,
    activeToControlFpsRatio: active.engineFps / controlFps,
    activeToControlP95Ratio: active.frameP95Ms / controlFrameP95Ms
  };
}

function collectPerformanceFailures(attempt) {
  const failures = [];
  if (attempt.activeToControlFpsRatio < MINIMUM_ACTIVE_TO_CONTROL_FPS_RATIO) {
    failures.push(`FPS ratio ${attempt.activeToControlFpsRatio.toFixed(3)} < ${MINIMUM_ACTIVE_TO_CONTROL_FPS_RATIO}`);
  }
  if (attempt.activeToControlP95Ratio > MAXIMUM_ACTIVE_TO_CONTROL_P95_RATIO) {
    failures.push(`P95 ratio ${attempt.activeToControlP95Ratio.toFixed(3)} > ${MAXIMUM_ACTIVE_TO_CONTROL_P95_RATIO}`);
  }
  if (minimumAbsoluteActiveFps !== null && attempt.active.engineFps < minimumAbsoluteActiveFps) {
    failures.push(`active FPS ${attempt.active.engineFps.toFixed(2)} < ${minimumAbsoluteActiveFps}`);
  }
  if (maximumAbsoluteActiveP95Ms !== null && attempt.active.frameP95Ms > maximumAbsoluteActiveP95Ms) {
    failures.push(`active P95 ${attempt.active.frameP95Ms.toFixed(2)}ms > ${maximumAbsoluteActiveP95Ms}ms`);
  }
  return failures;
}

async function verifyMediumPoolPerformance(browser, baseUrl) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  collectBrowserErrors(page, errors);
  const url = createTargetUrl(baseUrl, "p1-water-showcase", { quality: "medium", bodies: 4 });
  try {
    await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForFunction(
      () => window.waterPcgInteractivePoolMetrics?.ready === true && window.waterPcgP1?.metrics.enabled === true,
      null,
      { timeout: 30_000 }
    );
    await page.evaluate(() => window.waterPcgSetInteractivePoolTargetFrameRate?.(60));
    const initial = await readPoolSnapshot(page);
    assert(initial.pool.quality === "medium", "P1 performance route did not select Medium quality.");
    assertUniformFoamSnapshot(initial.p1, "P1 performance route");
    assert(initial.p1.foamFullSurfaceQueryCount === 0, "P1 performance route started with a foam surface query.");

    const bodyCounts = [];
    for (const bodyCount of PERFORMANCE_BODY_COUNTS) {
      const attempts = [await runBodyPerformanceAttempt(page, bodyCount)];
      let failures = collectPerformanceFailures(attempts[0]);
      if (failures.length > 0) {
        attempts.push(await runBodyPerformanceAttempt(page, bodyCount));
        failures = collectPerformanceFailures(attempts[1]);
      }
      assert(
        failures.length === 0,
        `${bodyCount}-body active performance gate failed after ${attempts.length} attempt(s): ${failures.join(
          "; "
        )}. Attempts: ${JSON.stringify(
          attempts.map((attempt) => ({
            activeFps: attempt.active.engineFps,
            controlFps: attempt.controlFps,
            fpsRatio: attempt.activeToControlFpsRatio,
            activeP95Ms: attempt.active.frameP95Ms,
            controlP95Ms: attempt.controlFrameP95Ms,
            p95Ratio: attempt.activeToControlP95Ratio
          }))
        )}`
      );
      bodyCounts.push({ selectedAttempt: attempts.length, attempts });
    }

    const final = await readPoolSnapshot(page);
    assert(final.p1.foamFullSurfaceQueryCount === 0, "P1 performance matrix executed a full foam surface query.");
    assert(errors.length === 0, `P1 performance browser errors:\n${errors.join("\n")}`);
    await page.goto("about:blank", { waitUntil: "load", timeout: 10_000 });
    assert(errors.length === 0, `P1 performance cleanup errors:\n${errors.join("\n")}`);
    return {
      url: url.href,
      thresholds: {
        minimumActiveToControlFpsRatio: MINIMUM_ACTIVE_TO_CONTROL_FPS_RATIO,
        maximumActiveToControlP95Ratio: MAXIMUM_ACTIVE_TO_CONTROL_P95_RATIO,
        minimumAbsoluteActiveFps,
        maximumAbsoluteActiveP95Ms,
        targetFoamUpdateRateHz: EXPECTED_FOAM_UPDATE_RATE_HZ
      },
      bodyCounts
    };
  } finally {
    await page.evaluate(() => window.waterPcgSetInteractivePoolTargetFrameRate?.(60)).catch(() => undefined);
    await context.close();
  }
}

async function verifyMediumPool(browser, baseUrl, tierDirectory) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  collectBrowserErrors(page, errors);
  const url = createTargetUrl(baseUrl, "p1-water-showcase", { quality: "medium" });
  try {
    await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForFunction(
      () =>
        window.waterPcgInteractivePoolMetrics?.ready === true &&
        window.waterPcgP1?.metrics.enabled === true &&
        window.waterPcgUnderwater != null,
      null,
      { timeout: 30_000 }
    );
    const apiContract = await page.evaluate(() => ({
      setBodyCount: typeof window.waterPcgP1?.setBodyCount,
      setDebugView: typeof window.waterPcgP1?.setDebugView,
      setDynamicEffectsEnabled: typeof window.waterPcgP1?.setDynamicEffectsEnabled,
      restartWakes: typeof window.waterPcgP1?.restartWakes,
      setUnderwaterPreset: typeof window.waterPcgUnderwater?.setPreset
    }));
    assert(
      Object.values(apiContract).every((value) => value === "function"),
      `P1 debug API is incomplete: ${JSON.stringify(apiContract)}.`
    );
    const initial = await readPoolSnapshot(page);
    assert(initial.pool.quality === "medium", "P1 Medium route did not select the Medium pool grid.");
    assert(initial.pool.finite && initial.pool.runtimeError === "", "P1 Medium route started invalid.");
    assert(initial.p1.temporalFoamEnabled, "P1 Medium route did not enable temporal foam.");
    assert(initial.p1.querySource === "cpu-height-field", "P1 did not preserve the CPU query source.");
    assert(initial.p1.requiresGpuReadback === false, "P1 CPU queries unexpectedly require GPU readback.");

    const bodyCounts = await verifyBodyCounts(page);
    const queueAndWake = await verifyQueueAndMovingWakes(page);
    const stationary = await settleLegacyBallAndVerifyStationaryRejection(page);
    const temporalFoam = await verifyTemporalFoam(page);
    const underwater = await verifyUnderwaterPresets(page, "medium", tierDirectory);
    const final = await readPoolSnapshot(page);
    assert(final.pool.finite && final.pool.runtimeError === "", "P1 Medium route ended invalid.");
    assert(errors.length === 0, `P1 Medium browser errors:\n${errors.join("\n")}`);
    await page.goto("about:blank", { waitUntil: "load", timeout: 10_000 });
    assert(errors.length === 0, `P1 Medium cleanup errors:\n${errors.join("\n")}`);
    return { url: url.href, apiContract, initial, bodyCounts, queueAndWake, stationary, temporalFoam, underwater };
  } finally {
    await page.evaluate(() => window.waterPcgSetInteractivePoolTargetFrameRate?.(60)).catch(() => undefined);
    await context.close();
  }
}

async function verifyPoolOpticalContinuityTier(browser, baseUrl, quality, tierDirectory) {
  assert(quality === "medium" || quality === "high", `Unsupported optical continuity quality ${quality}.`);
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  collectBrowserErrors(page, errors);
  const url = createTargetUrl(baseUrl, "p1-water-showcase", { quality, bodies: 1 });
  try {
    await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForFunction(
      () =>
        window.waterPcgInteractivePoolMetrics?.ready === true &&
        window.waterPcgP1?.metrics.enabled === true &&
        window.waterPcgUnderwater != null,
      null,
      { timeout: 30_000 }
    );
    const initial = await readPoolSnapshot(page);
    assert(initial.pool.quality === quality, `${quality} continuity route resolved ${initial.pool.quality}.`);
    assert(initial.pool.finite && initial.pool.runtimeError === "", `${quality} continuity route started invalid.`);
    assert(
      initial.p1.surfaceOpticsRequestedTier === quality && initial.p1.surfaceOpticsResolvedTier === quality,
      `${quality} continuity route did not bind the ${quality} surface-optics tier.`
    );
    const continuity = await verifyUnderwaterPresets(page, quality, tierDirectory);
    const final = await readPoolSnapshot(page);
    assert(final.pool.finite && final.pool.runtimeError === "", `${quality} continuity route ended invalid.`);
    assert(errors.length === 0, `${quality} continuity browser errors:\n${errors.join("\n")}`);
    await page.goto("about:blank", { waitUntil: "load", timeout: 10_000 });
    assert(errors.length === 0, `${quality} continuity cleanup errors:\n${errors.join("\n")}`);
    return { url: url.href, initial, continuity };
  } finally {
    await context.close();
  }
}

async function verifyLowPoolFallback(browser, baseUrl) {
  const context = await browser.newContext({ viewport: { width: 960, height: 640 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  collectBrowserErrors(page, errors);
  const url = createTargetUrl(baseUrl, "p1-water-showcase", { quality: "low" });
  try {
    await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForFunction(
      () => window.waterPcgInteractivePoolMetrics?.ready === true && window.waterPcgP1?.metrics.enabled === true,
      null,
      { timeout: 30_000 }
    );
    await page.evaluate(() => {
      window.waterPcgP1.setBodyCount(16);
      window.waterPcgP1.restartWakes();
      window.waterPcgP1.setDebugView("final");
    });
    await page.waitForTimeout(800);
    const snapshot = await readPoolSnapshot(page);
    assert(snapshot.pool.quality === "low", "P1 Low route did not select the Low pool grid.");
    assert(snapshot.pool.finite && snapshot.pool.runtimeError === "", "P1 Low analytic fallback became invalid.");
    assert(snapshot.p1.temporalFoamEnabled === false, "Low unexpectedly enabled temporal-foam textures.");
    assert(snapshot.p1.foamTextureUploadCount === 0, "Low uploaded a temporal-foam texture.");
    assert(snapshot.p1.foamTextureUploadsPerRenderFrame === 0, "Low reported a per-frame foam texture upload.");
    assert(snapshot.p1.foamResourceBytes === 0, "Low allocated temporal-foam texture resources.");
    assert(snapshot.p1.querySource === "cpu-height-field", "Low lost its analytic CPU water query.");
    assert(snapshot.p1.requiresGpuReadback === false, "Low analytic fallback requires GPU readback.");
    assert(errors.length === 0, `P1 Low browser errors:\n${errors.join("\n")}`);
    await page.goto("about:blank", { waitUntil: "load", timeout: 10_000 });
    assert(errors.length === 0, `P1 Low cleanup errors:\n${errors.join("\n")}`);
    return {
      url: url.href,
      quality: snapshot.pool.quality,
      analyticFallback: true,
      temporalFoamEnabled: snapshot.p1.temporalFoamEnabled,
      textureUploadCount: snapshot.p1.foamTextureUploadCount,
      resourceBytes: snapshot.p1.foamResourceBytes,
      querySource: snapshot.p1.querySource,
      requiresGpuReadback: snapshot.p1.requiresGpuReadback
    };
  } finally {
    await context.close();
  }
}

async function readOceanSnapshot(page) {
  return page.evaluate(() => ({
    ocean: structuredClone(window.waterPcgGetOceanMetrics?.()),
    reflection: structuredClone(window.waterPcgGetReflectionMetrics?.())
  }));
}

async function readCanvasLuminanceVariance(page) {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        requestAnimationFrame(() => {
          try {
            const source = document.querySelector("canvas#canvas");
            if (!(source instanceof HTMLCanvasElement)) throw new Error("Water PCG canvas is unavailable.");
            const probe = document.createElement("canvas");
            probe.width = 64;
            probe.height = 36;
            const context = probe.getContext("2d", { willReadFrequently: true });
            if (!context) throw new Error("2D canvas context is unavailable for the visual smoke probe.");
            context.drawImage(source, 0, 0, probe.width, probe.height);
            const pixels = context.getImageData(0, 0, probe.width, probe.height).data;
            let sum = 0;
            let sumSquares = 0;
            for (let index = 0; index < pixels.length; index += 4) {
              const luminance = pixels[index] * 0.2126 + pixels[index + 1] * 0.7152 + pixels[index + 2] * 0.0722;
              sum += luminance;
              sumSquares += luminance * luminance;
            }
            const sampleCount = pixels.length / 4;
            const mean = sum / sampleCount;
            resolve({
              width: source.width,
              height: source.height,
              mean,
              variance: sumSquares / sampleCount - mean * mean,
              samples: Array.from({ length: sampleCount }, (_, sampleIndex) => {
                const pixelIndex = sampleIndex * 4;
                return pixels[pixelIndex] * 0.2126 + pixels[pixelIndex + 1] * 0.7152 + pixels[pixelIndex + 2] * 0.0722;
              })
            });
          } catch (error) {
            reject(error);
          }
        });
      })
  );
}

async function setReflectionSource(page, source) {
  await page.evaluate((nextSource) => window.waterPcgSetOceanReflectionSource(nextSource), source);
  await page.waitForTimeout(120);
  return readOceanSnapshot(page);
}

async function verifyOcean(browser, baseUrl, quality) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  collectBrowserErrors(page, errors);
  const url = createTargetUrl(baseUrl, "curved-main-river", {
    mode: "ocean",
    quality,
    reflection: "sky",
    surfaceTime: 12.5
  });
  try {
    await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForFunction(
      () =>
        typeof window.waterPcgGetOceanMetrics === "function" &&
        typeof window.waterPcgGetReflectionMetrics === "function" &&
        window.waterPcgGetOceanMetrics()?.frameCount > 2,
      null,
      { timeout: 30_000 }
    );
    const initial = await readOceanSnapshot(page);
    const expectedRingCount = quality === "low" ? 2 : 3;
    const expectedPatchCount = 1 + 12 * expectedRingCount;
    assert(initial.ocean.quality === quality, `Ocean reported ${initial.ocean.quality}, expected ${quality}.`);
    assert(initial.ocean.ringCount === expectedRingCount, `${quality} Ocean has the wrong ring count.`);
    assert(initial.ocean.patchCount === expectedPatchCount, `${quality} Ocean has the wrong patch count.`);
    assert(initial.ocean.activeMeshCount === expectedPatchCount, `${quality} Ocean mesh ownership is unbalanced.`);
    assert(initial.ocean.activeMaterialCount === 1, `${quality} Ocean did not share one material across rings.`);
    assert(
      initial.ocean.meshUploadCount === expectedPatchCount,
      `${quality} Ocean initial mesh uploads are not fixed.`
    );
    assert(initial.ocean.perFrameMeshUpload === false, `${quality} Ocean reported per-frame mesh uploads.`);
    assert(
      initial.reflection.activeConsumerCount === 1,
      `${quality} Ocean registered the wrong reflection consumer count.`
    );
    assert(initial.reflection.planarCameraCount <= 1, `${quality} Ocean created more than one planar camera.`);
    const visualProbe = await readCanvasLuminanceVariance(page);
    const { samples: _initialSamples, ...visual } = visualProbe;
    assert(
      visual.width > 0 && visual.height > 0 && visual.variance > 100,
      `${quality} Ocean canvas is blank or visually uniform: ${JSON.stringify(visual)}.`
    );

    const snapBefore = initial.ocean.originSnapCount;
    const uploadsBefore = initial.ocean.meshUploadCount;
    await page.evaluate(({ x, z }) => window.waterPcgSetOceanCameraPosition(x, z), {
      x: initial.ocean.originX + initial.ocean.baseCellSize * 2.25,
      z: initial.ocean.originZ - initial.ocean.baseCellSize * 1.75
    });
    await page.waitForFunction(
      (baseline) => window.waterPcgGetOceanMetrics?.().originSnapCount > baseline,
      snapBefore,
      { timeout: 5_000 }
    );
    const snapped = await readOceanSnapshot(page);
    assert(snapped.ocean.meshUploadCount === uploadsBefore, "Camera-cell snapping rebuilt immutable Ocean buffers.");
    assert(snapped.ocean.perFrameMeshUpload === false, "Camera travel enabled per-frame Ocean mesh uploads.");
    assert(snapped.ocean.patchCount === expectedPatchCount, "Camera travel changed the Ocean patch budget.");

    const sky = await setReflectionSource(page, "sky");
    assert(sky.ocean.reflectionSource === "sky", `${quality} Ocean did not resolve explicit sky reflection.`);
    assert(sky.reflection.planarCameraCount === 0, "Sky reflection retained a planar camera.");
    assert(sky.reflection.estimatedRenderTargetBytes === 0, "Sky reflection retained a planar render target.");
    const skyVisualProbe = await readCanvasLuminanceVariance(page);
    await page.waitForTimeout(120);
    const skyVisualControlProbe = await readCanvasLuminanceVariance(page);
    const skyVisualControlDifference = meanAbsoluteDifference(
      skyVisualProbe.samples,
      skyVisualControlProbe.samples,
      0.4
    );

    const probe = await setReflectionSource(page, "probe");
    assert(
      probe.ocean.reflectionSource === "sky",
      `${quality} Ocean did not fall back Probe -> Sky when no probe texture was bound.`
    );
    assert(probe.reflection.planarCameraCount === 0, "Probe fallback allocated a planar camera.");
    assert(probe.reflection.estimatedRenderTargetBytes === 0, "Probe fallback allocated a planar render target.");

    const planar = await setReflectionSource(page, "planar");
    assert(planar.reflection.planarCameraCount <= 1, `${quality} Ocean exceeded one planar camera.`);
    let planarOutcome;
    let planarVisualMeanAbsoluteDifference = 0;
    if (quality === "low") {
      assert(planar.ocean.reflectionSource === "sky", "Low did not fall back Planar -> Sky.");
      assert(planar.reflection.planarCameraCount === 0, "Low allocated a forbidden planar camera.");
      assert(planar.reflection.renderTargetCreateCount === 0, "Low allocated a forbidden planar render target.");
      assert(planar.reflection.estimatedRenderTargetBytes === 0, "Low retained planar render-target bytes.");
      planarOutcome = "low-quality-sky-fallback";
    } else if (planar.ocean.reflectionSource === "planar") {
      assert(planar.reflection.planarOwnerId === "ocean-preview", "Medium planar owner is not the Ocean preview.");
      assert(planar.reflection.planarRequestCount === 1, "Medium registered more than one planar request.");
      assert(planar.reflection.planarCameraCount === 1, "Medium planar reflection did not own exactly one camera.");
      assert(
        planar.reflection.renderTargetWidth > 0 && planar.reflection.renderTargetHeight > 0,
        "Planar RT is empty."
      );
      assert(
        planar.reflection.estimatedRenderTargetBytes ===
          planar.reflection.renderTargetWidth * planar.reflection.renderTargetHeight * 8,
        "Planar RT byte metrics do not describe the single owned target."
      );
      assert(planar.reflection.planarUpdateCount > 0, "Medium planar reflection never rendered.");
      const planarVisualProbe = await readCanvasLuminanceVariance(page);
      planarVisualMeanAbsoluteDifference = meanAbsoluteDifference(
        skyVisualControlProbe.samples,
        planarVisualProbe.samples,
        0.4
      );
      assert(
        planarVisualMeanAbsoluteDifference > Math.max(0.01, skyVisualControlDifference * 3 + 0.005),
        `Medium Planar did not exceed the stable-Sky visual baseline: planar delta ${planarVisualMeanAbsoluteDifference}, Sky control delta ${skyVisualControlDifference}.`
      );
      planarOutcome = "planar";
    } else {
      assert(
        allowPlanarFailureFallback,
        "Medium reference smoke requires a working Planar result; set P1_WATER_ALLOW_PLANAR_FALLBACK=1 only when intentionally validating fallback cleanup."
      );
      assert(
        planar.ocean.reflectionSource === "sky" && planar.reflection.planarFailureCount > 0,
        "Medium planar fallback was neither a valid planar result nor an instrumented failure fallback."
      );
      assert(planar.reflection.planarCameraCount === 0, "Failed planar fallback leaked its camera.");
      assert(planar.reflection.estimatedRenderTargetBytes === 0, "Failed planar fallback leaked its render target.");
      planarOutcome = "instrumented-planar-failure-sky-fallback";
    }

    const cleaned = await setReflectionSource(page, "sky");
    assert(cleaned.reflection.planarCameraCount === 0, "Returning to Sky leaked the planar camera.");
    assert(cleaned.reflection.estimatedRenderTargetBytes === 0, "Returning to Sky leaked the planar render target.");
    assert(cleaned.ocean.meshUploadCount === uploadsBefore, "Reflection switching rebuilt Ocean mesh buffers.");
    assert(errors.length === 0, `${quality} Ocean browser errors:\n${errors.join("\n")}`);
    await page.goto("about:blank", { waitUntil: "load", timeout: 10_000 });
    assert(errors.length === 0, `${quality} Ocean cleanup errors:\n${errors.join("\n")}`);
    return {
      url: url.href,
      quality,
      initial,
      visual,
      snapped,
      reflections: {
        sky: sky.ocean.reflectionSource,
        probeFallback: probe.ocean.reflectionSource,
        planarOutcome,
        skyVisualControlDifference,
        planarVisualMeanAbsoluteDifference,
        planarMetrics: planar.reflection,
        cleanedMetrics: cleaned.reflection
      }
    };
  } finally {
    await context.close();
  }
}

const targetUrl = new URL(process.env.P1_WATER_URL ?? DEFAULT_URL);
await mkdir(outputDirectory, { recursive: true });
const report = {
  schemaVersion: 2,
  gate: "p1-water-showcase-smoke",
  status: "running",
  runId,
  generatedAt: new Date().toISOString(),
  resultPath,
  outputDirectory,
  targetUrl: targetUrl.href,
  headed,
  continuityOnly,
  opticalContinuityGate: {
    tiers: ["medium", "high"],
    rounds: OPTICAL_CONTINUITY_ROUNDS,
    sequence: ["outside", "surface-air", "inside", "surface-water", "outside"],
    fixedDepthMeters: 1.25,
    maximumProfileAndMediumDelta: OPTICAL_CONTINUITY_MAXIMUM_DELTA,
    visualComparisonPolicy: "fixed screenshots and non-blank ROI evidence only; cross-camera frame equality is not used"
  },
  results: {},
  failures: []
};

let browser;
try {
  browser = await chromium.launch({ headless: !headed });
  report.browserVersion = browser.version();
  if (continuityOnly) {
    report.results.mediumContinuity = await verifyPoolOpticalContinuityTier(
      browser,
      targetUrl,
      "medium",
      resolve(outputDirectory, "medium")
    );
  } else {
    report.results.mediumPoolPerformance = await verifyMediumPoolPerformance(browser, targetUrl);
    report.results.mediumPool = await verifyMediumPool(browser, targetUrl, resolve(outputDirectory, "medium"));
  }
  report.results.highContinuity = await verifyPoolOpticalContinuityTier(
    browser,
    targetUrl,
    "high",
    resolve(outputDirectory, "high")
  );
  if (!continuityOnly) {
    report.results.lowPool = await verifyLowPoolFallback(browser, targetUrl);
    report.results.oceanLow = await verifyOcean(browser, targetUrl, "low");
    report.results.oceanMedium = await verifyOcean(browser, targetUrl, "medium");
  }
} catch (error) {
  report.failures.push(error instanceof Error ? `${error.message}\n${error.stack ?? ""}` : String(error));
} finally {
  await browser?.close().catch((error) => report.failures.push(`[browser-close] ${String(error)}`));
  report.status = report.failures.length === 0 ? "passed" : "failed";
  report.completedAt = new Date().toISOString();
  await writeFile(resultPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report, null, 2));
}

if (report.status !== "passed") process.exitCode = 1;
