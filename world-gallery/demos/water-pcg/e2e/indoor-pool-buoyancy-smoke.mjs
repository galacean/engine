import { chromium } from "@playwright/test";

const DEFAULT_URL = "http://127.0.0.1:4179/demos/water-pcg/#indoor-reflective-pool";
const PHYSX_REQUEST_PATTERN = /engine-physics-physx|physics-physx|physx\.release/i;
const TARGET_FRAME_RATES = [30, 60, 120];
const headed = process.env.POOL_HEADED === "1";
const requireActualFrameRateTargets = headed || process.env.POOL_REQUIRE_ACTUAL_FPS === "1";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function collectBrowserErrors(page, errors) {
  page.on("pageerror", (error) => errors.push(`[pageerror] ${error.stack ?? error.message}`));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(`[console] ${message.text()}`);
  });
  page.on("requestfailed", (request) => {
    errors.push(`[requestfailed] ${request.url()} ${request.failure()?.errorText ?? "unknown"}`);
  });
}

async function readMetrics(page) {
  return page.evaluate(() => structuredClone(window.waterPcgInteractivePoolMetrics));
}

async function measureFrameRates(page, initialFixedTimeStep) {
  const results = [];
  for (const targetFrameRate of TARGET_FRAME_RATES) {
    const before = await page.evaluate((target) => {
      window.waterPcgSetInteractivePoolTargetFrameRate(target);
      const metrics = window.waterPcgInteractivePoolMetrics;
      return { frameCount: metrics.renderFrameCount, fixedTimeStep: metrics.physicsFixedTimeStep };
    }, targetFrameRate);
    const startedAt = performance.now();
    await page.waitForTimeout(1600);
    const elapsedMs = performance.now() - startedAt;
    const after = await readMetrics(page);
    const actualFramesPerSecond = ((after.renderFrameCount - before.frameCount) * 1000) / elapsedMs;
    assert(after.finite && after.runtimeError === "", `${targetFrameRate} FPS produced an invalid pool state.`);
    assert(
      Math.abs(after.physicsFixedTimeStep - initialFixedTimeStep) <= 1e-9 &&
        Math.abs(before.fixedTimeStep - initialFixedTimeStep) <= 1e-9,
      `${targetFrameRate} FPS changed the Galacean fixed physics step.`
    );
    assert(
      after.meshUploadsPerRenderFrame <= 1,
      `${targetFrameRate} FPS uploaded the surface more than once per frame.`
    );
    results.push({ targetFrameRate, actualFramesPerSecond, elapsedMs });
  }
  if (requireActualFrameRateTargets) {
    for (const result of results) {
      assert(
        result.actualFramesPerSecond >= result.targetFrameRate * 0.5 &&
          result.actualFramesPerSecond <= result.targetFrameRate * 1.4,
        `${result.targetFrameRate} target produced ${result.actualFramesPerSecond.toFixed(1)} FPS.`
      );
    }
    assert(
      results[1].actualFramesPerSecond > results[0].actualFramesPerSecond * 1.2 &&
        results[2].actualFramesPerSecond > results[1].actualFramesPerSecond * 1.2,
      "Actual render update rates did not increase across 30/60/120 targets."
    );
  }
  return results;
}

async function verifyInteractivePool(browser, baseUrl, options) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  const requests = [];
  collectBrowserErrors(page, errors);
  page.on("request", (request) => requests.push(request.url()));
  const url = new URL(baseUrl);
  url.searchParams.set("quality", options.quality);
  let screenshotCaptured = false;
  try {
    await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForFunction(() => window.waterPcgInteractivePoolMetrics?.ready === true, null, { timeout: 30_000 });
    await page.waitForFunction(() => window.waterPcgInteractivePoolMetrics?.ballSpawned === true, null, {
      timeout: 10_000
    });
    const initial = await readMetrics(page);
    assert(initial.initialBallHeightAboveSurface > 5.5, "Pool ball did not start at least 5.5m above the surface.");
    assert(
      initial.surfaceVertexCount === options.expectedVertexCount,
      `Unexpected ${options.quality} surface grid size.`
    );
    assert(initial.physicsFixedTimeStep > 0, "Pool did not expose the Galacean fixed physics step.");
    assert(initial.finite && initial.runtimeError === "", "Pool was invalid before the first impact.");

    const rippleRadii = [];
    let sustainedDepressionSamples = 0;
    let last = initial;
    const deadline = performance.now() + 24_000;
    while (performance.now() < deadline) {
      await page.waitForTimeout(50);
      last = await readMetrics(page);
      assert(last.finite, "Pool produced a non-finite runtime state.");
      assert(last.runtimeError === "", `Pool reported a runtime error: ${last.runtimeError}`);
      assert(last.meshUploadsPerRenderFrame <= 1, "Pool uploaded its dynamic mesh more than once per render frame.");
      if (last.entryImpactCount > 0 && last.rippleRadius > 0) rippleRadii.push(last.rippleRadius);
      if (last.ballInWater && last.currentContactDepression >= 0.04 && last.currentContactRimHeight >= 0.001) {
        sustainedDepressionSamples++;
      }
      if (
        options.screenshotPath &&
        !screenshotCaptured &&
        last.currentContactDepression >= 0.1 &&
        last.currentContactRimHeight >= 0.01 &&
        last.ballHeight >= 0.2 &&
        last.ballHeight <= 0.65 &&
        last.ballVerticalSpeed >= 0.5
      ) {
        await page.screenshot({ path: options.screenshotPath });
        screenshotCaptured = true;
      }
      if (
        last.entryImpactCount >= 1 &&
        last.continuousInteractionCount >= 1 &&
        last.reflectedWaveObserved &&
        last.upwardBounceObserved &&
        last.settled
      ) {
        break;
      }
    }

    const positiveRadii = rippleRadii.filter((radius) => radius > 0);
    const minimumObservedRadius = positiveRadii.length > 0 ? Math.min(...positiveRadii) : 0;
    const maximumObservedRadius = positiveRadii.length > 0 ? Math.max(...positiveRadii) : 0;
    assert(last.freeFallObserved, "Pool did not observe negative vertical speed before water entry.");
    assert(last.entryImpactCount >= 1, "Pool did not register a dry-to-wet entry impact.");
    assert(last.continuousInteractionCount >= 1, "Pool did not register continuous submerged movement.");
    assert(last.contactInteractionCount >= 30, "Pool did not sustain a pressure footprint while submerged.");
    assert(last.maximumAbsSurfaceHeight >= 0.01, "Pool surface deformation stayed below 0.01m.");
    assert(last.maximumContactDepression >= 0.08, "Pool contact depression stayed below 0.08m.");
    assert(last.maximumContactRimHeight >= 0.002, "Pool did not displace water into a raised contact rim.");
    assert(sustainedDepressionSamples >= 10, "Pool contact depression was not sustained across observable frames.");
    assert(last.rippleHighlightPeak >= 0.5, "Pool ripple highlight never reached a clearly visible intensity.");
    assert(
      last.maximumHighlightedVertexCount >= 16,
      "Pool ripple highlight did not cover enough dynamic-surface vertices."
    );
    assert(maximumObservedRadius >= minimumObservedRadius + 1, "Pool ripple front did not expand away from impact.");
    assert(last.reflectedWaveObserved, "Pool did not observe the wave at a reflective boundary.");
    assert(last.upwardBounceObserved, "Pool ball did not rebound upward after entry.");
    assert(last.settled, "Pool ball did not settle near the dynamic surface before timeout.");
    assert(errors.length === 0, `Pool browser errors:\n${errors.join("\n")}`);
    const physXRequests = requests.filter((requestUrl) => PHYSX_REQUEST_PATTERN.test(requestUrl));
    assert(physXRequests.length > 0, "Interactive pool did not lazily request its PhysX runtime.");

    const frameRateResults = options.measureFrameRates
      ? await measureFrameRates(page, initial.physicsFixedTimeStep)
      : [];

    await page.evaluate(() => window.waterPcgResetInteractivePool());
    await page.waitForFunction(() => window.waterPcgInteractivePoolMetrics?.ballSpawned === false, null, {
      timeout: 2_000
    });
    await page.waitForFunction(() => window.waterPcgInteractivePoolMetrics?.ballSpawned === true, null, {
      timeout: 5_000
    });
    const reset = await readMetrics(page);
    assert(reset.initialBallHeightAboveSurface > 5.5, "Reset did not recreate the ball above the surface.");
    assert(reset.entryImpactCount === 0, "Reset reused an already-submerged body instead of creating a new one.");
    assert(reset.finite && reset.runtimeError === "", "Reset produced an invalid pool state.");

    await page.goto("about:blank", { waitUntil: "load", timeout: 10_000 });
    assert(errors.length === 0, `Pool cleanup produced browser errors:\n${errors.join("\n")}`);
    return {
      url: url.href,
      quality: options.quality,
      initial,
      final: last,
      minimumObservedRadius,
      maximumObservedRadius,
      sustainedDepressionSamples,
      frameRateResults,
      physXRequestCount: physXRequests.length,
      screenshotCaptured,
      reset,
      errors
    };
  } finally {
    await context.close();
  }
}

async function verifyPageWithoutPhysX(browser, url, readyExpression) {
  const context = await browser.newContext({ viewport: { width: 960, height: 640 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const requests = [];
  const errors = [];
  collectBrowserErrors(page, errors);
  page.on("request", (request) => requests.push(request.url()));
  try {
    await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForFunction(readyExpression, null, { timeout: 30_000 });
    const physXRequests = requests.filter((requestUrl) => PHYSX_REQUEST_PATTERN.test(requestUrl));
    assert(errors.length === 0, `${url.hash} browser errors:\n${errors.join("\n")}`);
    assert(physXRequests.length === 0, `${url.hash} loaded PhysX unexpectedly:\n${physXRequests.join("\n")}`);
    return { url: url.href, requestCount: requests.length, physXRequests };
  } finally {
    await context.close();
  }
}

const targetUrl = new URL(process.env.POOL_URL ?? DEFAULT_URL);
targetUrl.hash = "indoor-reflective-pool";
const browser = await chromium.launch({ headless: !headed });

try {
  const medium = await verifyInteractivePool(browser, targetUrl, {
    quality: "medium",
    expectedVertexCount: 26985,
    measureFrameRates: true,
    screenshotPath: process.env.POOL_SCREENSHOT_PATH
  });
  const low = await verifyInteractivePool(browser, targetUrl, {
    quality: "low",
    expectedVertexCount: 6837,
    measureFrameRates: false
  });

  const nonPhysicsCases = [
    ["curved-main-river", () => window.waterPcgDebug != null],
    ["multi-tributary-river", () => window.waterPcgDebug != null],
    ["heightfield-water", () => window.heightfieldWaterDemo?.metrics.ready === true]
  ];
  const isolation = [];
  for (const [caseId, readyExpression] of nonPhysicsCases) {
    const url = new URL(targetUrl);
    url.search = "?quality=low&surfaceTime=12.5";
    url.hash = caseId;
    isolation.push(await verifyPageWithoutPhysX(browser, url, readyExpression));
  }

  console.log(JSON.stringify({ medium, low, isolation, headed, requireActualFrameRateTargets }, null, 2));
} finally {
  await browser.close();
}
