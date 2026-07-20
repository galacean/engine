import { chromium } from "@playwright/test";

const DEFAULT_URL = "http://127.0.0.1:4179/demos/water-pcg/buoyancy/";
const STATIC_EQUILIBRIUM_HEIGHT = 0.48;
const STATIC_HEIGHT_TOLERANCE = 0.08;
const ATTITUDE_RECOVERY_TOLERANCE_DEGREES = 12;
const FRAME_RATE_HEIGHT_SPREAD_TOLERANCE = 0.02;
const RIVER_RENDER_PARITY_TOLERANCE = 0.05;
const ALLOCATION_SAMPLE_WINDOW_MS = 3000;
const RIVER_DRIFT_SEED = 1831565813;
const RIVER_DRIFT_SPAWN_INTERVAL_SECONDS = 3;
const RIVER_DRIFT_INTERVAL_TOLERANCE_SECONDS = 0.12;
const RIVER_DRIFT_MIN_HEIGHT = 2.5;
const RIVER_DRIFT_MAX_HEIGHT = 5.5;
const RIVER_DRIFT_MIN_DOWNSTREAM_DISTANCE = 4;
const PHYSX_REQUEST_PATTERN = /engine-physics-physx|physics-physx|physx\.release/i;
const headed = process.env.BUOYANCY_HEADED === "1";
const requireActualFrameRateTargets = headed || process.env.BUOYANCY_REQUIRE_ACTUAL_FPS === "1";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertFiniteProfile(profile, label) {
  for (const stage of ["query", "solver", "applyForce", "total"]) {
    const sample = profile[stage];
    assert(sample.sampleCount === 120, `${label}.${stage} did not collect 120 samples.`);
    assert(Number.isFinite(sample.p50Ms) && sample.p50Ms >= 0, `${label}.${stage}.p50Ms is invalid.`);
    assert(Number.isFinite(sample.p95Ms) && sample.p95Ms >= sample.p50Ms, `${label}.${stage}.p95Ms is invalid.`);
    assert(Number.isFinite(sample.maxMs) && sample.maxMs >= sample.p95Ms, `${label}.${stage}.maxMs is invalid.`);
  }
}

async function readMetrics(page) {
  return page.evaluate(() => structuredClone(window.waterBuoyancyDemo.metrics));
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

function performanceMetricMap(result) {
  return new Map(result.metrics.map((metric) => [metric.name, metric.value]));
}

function metricDelta(before, after, name) {
  return (after.get(name) ?? 0) - (before.get(name) ?? 0);
}

function summarizeAllocationProfile(profile) {
  const summary = {
    sampledBytes: 0,
    featureOwnedSampledBytes: 0,
    demoHarnessSampledBytes: 0,
    nativePhysicsSampledBytes: 0,
    featureOwnedFrames: []
  };
  const nodes = [profile.head];
  while (nodes.length > 0) {
    const node = nodes.pop();
    if (!node) continue;
    const selfSize = Number.isFinite(node.selfSize) && node.selfSize > 0 ? node.selfSize : 0;
    const url = node.callFrame?.url ?? "";
    const functionName = node.callFrame?.functionName || "(anonymous)";
    summary.sampledBytes += selfSize;
    if (url.includes("/demos/water-pcg/runtime/")) {
      summary.featureOwnedSampledBytes += selfSize;
      if (selfSize > 0) summary.featureOwnedFrames.push({ functionName, url, selfSize });
    }
    if (url.includes("/demos/water-pcg/demo/buoyancy/")) summary.demoHarnessSampledBytes += selfSize;
    if (/physics-physx|physx\.release/i.test(url)) summary.nativePhysicsSampledBytes += selfSize;
    if (node.children) nodes.push(...node.children);
  }
  summary.featureOwnedFrames.sort((left, right) => right.selfSize - left.selfSize);
  return summary;
}

async function readTraceStream(cdp, stream) {
  let trace = "";
  while (true) {
    const chunk = await cdp.send("IO.read", { handle: stream });
    trace += chunk.data;
    if (chunk.eof) break;
  }
  await cdp.send("IO.close", { handle: stream });
  return JSON.parse(trace);
}

async function measureSteadyStateAllocation(context, page) {
  const allocationProbeBefore = await page.evaluate(() => window.waterBuoyancyDemo.prepareAllocationProbe());
  assert(allocationProbeBefore.ready, "The 100x4 allocation probe did not reach steady state.");
  assert(allocationProbeBefore.horizontalDragEnabled, "The allocation probe did not enable horizontal drag.");
  assert(
    allocationProbeBefore.queriesPerStep === allocationProbeBefore.expectedQueriesPerStep,
    "The allocation probe did not issue exactly one query per enabled Pontoon."
  );
  assert(allocationProbeBefore.preflightAllInsideFootprint, "Allocation probe Pontoons left the River footprint.");
  assert(allocationProbeBefore.preflightAllExpectedSource, "Allocation probe did not stay on the planned reach path.");

  const cdp = await context.newCDPSession(page);
  let samplingStarted = false;
  let tracingStarted = false;
  try {
    await cdp.send("Performance.enable");
    await cdp.send("HeapProfiler.enable");
    await cdp.send("HeapProfiler.collectGarbage");
    const heapBefore = await cdp.send("Runtime.getHeapUsage");
    const performanceBefore = performanceMetricMap(await cdp.send("Performance.getMetrics"));

    await cdp.send("HeapProfiler.startSampling", { samplingInterval: 16384 });
    samplingStarted = true;
    await cdp.send("Tracing.start", { categories: "v8", transferMode: "ReturnAsStream" });
    tracingStarted = true;
    await page.waitForTimeout(ALLOCATION_SAMPLE_WINDOW_MS);

    const allocationProbeAfter = await page.evaluate(() => window.waterBuoyancyDemo.getAllocationProbeSnapshot());
    assert(allocationProbeAfter?.ready, "The allocation probe became invalid during steady-state sampling.");
    assert(allocationProbeAfter.horizontalDragEnabled, "The sampled allocation hot path disabled horizontal drag.");
    assert(
      allocationProbeAfter.queriesPerStep === allocationProbeAfter.expectedQueriesPerStep,
      "The allocation probe query count changed during steady-state sampling."
    );
    const heapBeforeForcedGc = await cdp.send("Runtime.getHeapUsage");
    const performanceAfter = performanceMetricMap(await cdp.send("Performance.getMetrics"));
    const { profile } = await cdp.send("HeapProfiler.stopSampling");
    samplingStarted = false;

    const tracingComplete = new Promise((resolve) => cdp.once("Tracing.tracingComplete", resolve));
    await cdp.send("Tracing.end");
    tracingStarted = false;
    const { stream } = await tracingComplete;
    const trace = await readTraceStream(cdp, stream);
    await cdp.send("HeapProfiler.collectGarbage");
    const heapAfterForcedGc = await cdp.send("Runtime.getHeapUsage");

    const allocationProfile = summarizeAllocationProfile(profile);
    assert(
      allocationProfile.featureOwnedSampledBytes === 0,
      `Steady-state water-pcg runtime allocations were sampled:\n${JSON.stringify(allocationProfile.featureOwnedFrames)}`
    );
    const gcEvents = trace.traceEvents.filter(
      (event) => event.ph === "X" && (event.name === "MinorGC" || event.name === "MajorGC")
    );
    const observedFixedSteps = allocationProbeAfter.warmupSteps - allocationProbeBefore.warmupSteps;
    assert(observedFixedSteps > 0, "The allocation sample window observed no Galacean physics steps.");
    const scriptDurationMs = metricDelta(performanceBefore, performanceAfter, "ScriptDuration") * 1000;
    const taskDurationMs = metricDelta(performanceBefore, performanceAfter, "TaskDuration") * 1000;

    return {
      windowMs: ALLOCATION_SAMPLE_WINDOW_MS,
      observedFixedSteps,
      probeBefore: allocationProbeBefore,
      probeAfter: allocationProbeAfter,
      allocationProfile,
      heap: {
        usedBeforeBytes: heapBefore.usedSize,
        usedBeforeForcedGcBytes: heapBeforeForcedGc.usedSize,
        usedAfterForcedGcBytes: heapAfterForcedGc.usedSize,
        retainedDeltaBytes: heapAfterForcedGc.usedSize - heapBefore.usedSize
      },
      gc: {
        minorCount: gcEvents.filter((event) => event.name === "MinorGC").length,
        majorCount: gcEvents.filter((event) => event.name === "MajorGC").length,
        durationMs: gcEvents.reduce((total, event) => total + (event.dur ?? 0) / 1000, 0)
      },
      mainThread: {
        scriptDurationMs,
        taskDurationMs,
        scriptMsPerFixedStep: scriptDurationMs / observedFixedSteps,
        taskMsPerFixedStep: taskDurationMs / observedFixedSteps
      }
    };
  } finally {
    if (samplingStarted) await cdp.send("HeapProfiler.stopSampling").catch(() => undefined);
    if (tracingStarted) await cdp.send("Tracing.end").catch(() => undefined);
    await cdp.detach().catch(() => undefined);
    await page.evaluate(() => window.waterBuoyancyDemo.disposeAllocationProbe()).catch(() => undefined);
  }
}

async function verifyExistingWaterPageWithoutPhysX(browser, url, ready) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  const requests = [];
  const errors = [];
  collectBrowserErrors(page, errors);
  page.on("request", (request) => requests.push(request.url()));
  try {
    await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForFunction(ready, null, { timeout: 30_000 });
    const physXRequests = requests.filter((requestUrl) => PHYSX_REQUEST_PATTERN.test(requestUrl));
    assert(errors.length === 0, `${url.pathname} browser errors:\n${errors.join("\n")}`);
    assert(physXRequests.length === 0, `${url.pathname} loaded PhysX unexpectedly:\n${physXRequests.join("\n")}`);
    return { url: url.href, physXRequests, requestCount: requests.length };
  } finally {
    await context.close();
  }
}

async function verifyRiverDriftStream(browser, baseUrl) {
  const riverDriftUrl = new URL(baseUrl.href);
  riverDriftUrl.searchParams.set("scenario", "river-four");
  riverDriftUrl.searchParams.set("surfaceTime", "12.5");
  riverDriftUrl.searchParams.set("drift", "1");
  riverDriftUrl.searchParams.set("driftSeed", String(RIVER_DRIFT_SEED));
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const browserErrors = [];
  collectBrowserErrors(page, browserErrors);
  try {
    await page.goto(riverDriftUrl.href, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForFunction(
      () =>
        window.waterBuoyancyDemo?.metrics.ready === true && window.waterBuoyancyDemo.metrics.scenario === "river-four",
      null,
      { timeout: 30_000 }
    );
    const result = await page.evaluate(() => window.waterBuoyancyDemo.runRiverDriftGate());
    assert(result.seed === RIVER_DRIFT_SEED, `River drift used seed ${result.seed}, expected ${RIVER_DRIFT_SEED}.`);
    assert(result.observedSpawnCount >= 11, "River drift did not retain evidence for eleven spawned cubes.");
    assert(result.spawnedTotal >= 11, "River drift did not execute the eleventh three-second spawn.");
    assert(result.scheduledTimes.length === 3, "River drift did not report the first three scheduled spawn times.");
    for (let index = 0; index < result.scheduledTimes.length; index++) {
      const expectedTime = index * RIVER_DRIFT_SPAWN_INTERVAL_SECONDS;
      assert(
        Math.abs(result.scheduledTimes[index] - expectedTime) <= Number.EPSILON,
        `River drift spawn ${index} was scheduled at ${result.scheduledTimes[index]}, expected ${expectedTime}.`
      );
    }
    assert(result.actualIntervals.length === 2, "River drift did not report two observed spawn intervals.");
    for (const interval of result.actualIntervals) {
      assert(
        Math.abs(interval - RIVER_DRIFT_SPAWN_INTERVAL_SECONDS) <= RIVER_DRIFT_INTERVAL_TOLERANCE_SECONDS,
        `River drift spawn interval ${interval} left the 3 +/- 0.12 second window.`
      );
    }
    assert(result.heightOffsets.length === 3, "River drift did not report three spawn-height offsets.");
    assert(
      result.heightOffsets.every((height) => height >= RIVER_DRIFT_MIN_HEIGHT && height <= RIVER_DRIFT_MAX_HEIGHT),
      `River drift spawn heights left [${RIVER_DRIFT_MIN_HEIGHT}, ${RIVER_DRIFT_MAX_HEIGHT}].`
    );
    assert(result.distinctHeightCount >= 2, "River drift did not use at least two distinct spawn heights.");
    assert(result.freeFallCount === 3, "The first three River cubes did not all exhibit free fall.");
    assert(result.enteredWaterCount === 3, "The first three River cubes did not all enter the water.");
    assert(result.alignedMovingCount > 0, "No River cube moved in alignment with the sampled water velocity.");
    assert(
      result.maxDownstreamDistance >= RIVER_DRIFT_MIN_DOWNSTREAM_DISTANCE,
      `River cubes moved ${result.maxDownstreamDistance} downstream, expected at least ${RIVER_DRIFT_MIN_DOWNSTREAM_DISTANCE}.`
    );
    assert(result.maxObservedActiveCount <= 10, "River drift exceeded the ten-body active limit.");
    assert(result.activeCountBeforeCleanup <= 10, "River drift ended above the ten-body active limit.");
    assert(result.destroyedTotal >= 1, "River drift did not exercise automatic lifecycle cleanup.");
    assert(
      result.automaticLifecycleDestroyedCount >= 1,
      "River drift did not record capacity/downstream/expired/off-water cleanup."
    );
    assert(result.destroyReasons.length >= 1, "River drift did not expose its automatic destroy reasons.");
    if (result.capacityDestroyedCount > 0) {
      assert(result.destroyReasons.includes("capacity"), "Capacity eviction was not exposed in destroyReasons.");
    }
    assert(result.activeCountAfterCleanup === 0, "River drift cleanup left active cubes behind.");
    assert(result.finite, "River drift produced a non-finite body state.");
    assert(result.runtimeError === "", `River drift reported a runtime error: ${result.runtimeError}`);
    assert(browserErrors.length === 0, `River drift browser errors:\n${browserErrors.join("\n")}`);
    return { url: riverDriftUrl.href, result, browserErrors: [...browserErrors] };
  } finally {
    await context.close();
  }
}

const targetUrl = new URL(process.env.BUOYANCY_URL ?? DEFAULT_URL);
targetUrl.searchParams.set("scenario", "static-single");
targetUrl.searchParams.set("surfaceTime", "12.5");
targetUrl.searchParams.set("drift", "0");

const browser = await chromium.launch({ headless: !headed });
const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const browserErrors = [];
collectBrowserErrors(page, browserErrors);

try {
  await page.goto(targetUrl.href, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForFunction(() => window.waterBuoyancyDemo?.metrics.ready === true, null, { timeout: 30_000 });
  const staticGateResult = await page.evaluate(() => window.waterBuoyancyDemo.runSinglePontoonGate());
  assert(staticGateResult.dwellMs >= 2000, "The single-Pontoon gate did not hold for two seconds.");
  assert(staticGateResult.runtimeError === "", "The single-Pontoon dwell reported a runtime error.");
  assert(
    Math.abs(staticGateResult.minBodyHeight - STATIC_EQUILIBRIUM_HEIGHT) <= STATIC_HEIGHT_TOLERANCE &&
      Math.abs(staticGateResult.maxBodyHeight - STATIC_EQUILIBRIUM_HEIGHT) <= STATIC_HEIGHT_TOLERANCE,
    "The single-Pontoon body left its equilibrium-height tolerance during the dwell."
  );
  assert(staticGateResult.maxLinearSpeed < 0.08, "The single-Pontoon body was not stationary during the dwell.");
  assert(staticGateResult.minSubmergedPontoonCount === 1, "The single Pontoon left the water during the dwell.");
  assert(staticGateResult.minQueryCountPerStep === 1, "The single-Pontoon dwell skipped a surface query.");
  assert(staticGateResult.minAppliedForceCountPerStep === 1, "The single-Pontoon dwell skipped point force.");
  const staticResult = await readMetrics(page);
  assert(staticResult.surfaceTime === 12.5, "The fixed River surface clock was not exposed by the demo.");
  assert(staticResult.pontoonCount === 1, "The static fixture must use one Pontoon.");
  assert(staticResult.submergedPontoonCount === 1, "The static Pontoon must be submerged at equilibrium.");
  assert(staticResult.queryCountPerStep === 1, "The static fixture must issue one query per physics step.");
  assert(staticResult.appliedForceCountPerStep === 1, "The static fixture must apply one point force per step.");
  const kinematicResult = await page.evaluate(() => window.waterBuoyancyDemo.runKinematicCheck());
  assert(kinematicResult.isKinematic, "The kinematic integration fixture did not use a kinematic collider.");
  assert(kinematicResult.diagnostic === "kinematic", "The kinematic fixture did not report its public guard.");
  assert(kinematicResult.queriesPerStep === 0, "The kinematic fixture queried water.");
  assert(kinematicResult.appliedForcesPerStep === 0, "The kinematic fixture applied buoyancy.");
  assert(kinematicResult.submergedPontoonCount === 0, "The kinematic fixture reported immersion.");
  const parentTransformResult = await page.evaluate(() => window.waterBuoyancyDemo.runParentTransformCheck());
  assert(parentTransformResult.dynamicCollider, "The transformed-parent fixture was not a dynamic collider.");
  assert(parentTransformResult.queriesPerStep === 1, "The transformed-parent fixture skipped its surface query.");
  assert(parentTransformResult.diagnostic === "", "The transformed-parent fixture reported a diagnostic.");
  assert(parentTransformResult.worldPositionError <= 1e-6, "Parent/world Pontoon position conversion diverged.");
  assert(parentTransformResult.worldRadiusError <= 1e-6, "Parent/world Pontoon radius scaling diverged.");
  const currentForceResult = await page.evaluate(() => window.waterBuoyancyDemo.runCurrentForceCheck());
  assert(currentForceResult.firstHorizontalForceX > 0, "The current-control fixture did not receive +X water force.");
  assert(currentForceResult.downstreamDistance > 0, "The current-control fixture did not move downstream.");
  assert(currentForceResult.maxDownstreamSpeed > 0, "The current-control fixture gained no downstream velocity.");
  assert(
    currentForceResult.finalRelativeSpeed < currentForceResult.initialRelativeSpeed,
    "The current-control fixture did not reduce its speed relative to the water."
  );
  assert(currentForceResult.finite, "The current-control fixture produced a non-finite body state.");
  assert(
    currentForceResult.maxDownstreamSpeed <= currentForceResult.waterSpeed * 1.05,
    "The current-control fixture persistently exceeded the water speed."
  );
  await page.evaluate(() => window.waterBuoyancyDemo.selectScenario("river-four"));
  await page.waitForFunction(
    () => {
      const metrics = window.waterBuoyancyDemo?.metrics;
      return (
        metrics?.scenario === "river-four" &&
        metrics.ready &&
        metrics.runtimeError === "" &&
        metrics.finite &&
        !metrics.driftEnabled
      );
    },
    null,
    { timeout: 20_000 }
  );
  const riverScenarioMetrics = await readMetrics(page);
  assert(riverScenarioMetrics.bodyCount === 0, "The drift-disabled River scenario retained a permanent control body.");
  const sleepWakeResult = await page.evaluate(() => window.waterBuoyancyDemo.runSleepWakeCheck());
  assert(sleepWakeResult.surfaceKind === "reach", "Sleep/wake did not use a dynamic River reach.");
  assert(sleepWakeResult.surfaceHeightDelta >= 0.01, "Sleep/wake River height range was too small.");
  assert(
    sleepWakeResult.highSurfaceHeight > sleepWakeResult.lowSurfaceHeight &&
      sleepWakeResult.highSurfaceTime !== sleepWakeResult.lowSurfaceTime,
    "Sleep/wake did not select distinct dynamic River surface states."
  );
  assert(sleepWakeResult.lowDryQueryCount === 1, "The dry sleeping Pontoon skipped its River query.");
  assert(sleepWakeResult.lowDryAppliedForceCount === 0, "The low River surface applied a force while dry.");
  assert(sleepWakeResult.lowDrySubmergedPontoonCount === 0, "The low River surface was not dry.");
  assert(sleepWakeResult.sleptImmediately, "PhysX did not enter sleep when requested through DynamicCollider.");
  assert(sleepWakeResult.drySleepFixedSteps >= 5, "The dry body was not observed across enough fixed steps.");
  assert(sleepWakeResult.remainedSleepingWhileDry, "The dry River body woke before re-immersion.");
  assert(sleepWakeResult.wokeFromPointForce, "River re-immersion did not wake the body through point force.");
  assert(sleepWakeResult.appliedForceCount === 1, "The re-immersion step did not submit one point force.");
  assert(
    sleepWakeResult.highWetSubmergedPontoonCount === 1,
    "The raised River surface did not re-immerse the Pontoon."
  );
  const renderParityResult = await page.evaluate(() => window.waterBuoyancyDemo.runRenderParityCheck());
  assert(renderParityResult.sampledVertexCount > 0, "The render-parity check sampled no visible vertices.");
  assert(renderParityResult.missedVertexCount === 0, "Some visible River vertices were outside the Provider.");
  assert(
    renderParityResult.maxHeightError <= RIVER_RENDER_PARITY_TOLERANCE,
    `River render/query height error ${renderParityResult.maxHeightError} exceeded ${RIVER_RENDER_PARITY_TOLERANCE}.`
  );
  const offshoreResult = await page.evaluate(() => window.waterBuoyancyDemo.runOffshoreCheck());
  assert(offshoreResult.providerRejected, "The River Provider accepted the planned offshore point.");
  assert(offshoreResult.queriesPerStep === 1, "The offshore Pontoon did not issue exactly one query.");
  assert(offshoreResult.appliedForcesPerStep === 0, "The offshore Pontoon applied a force.");
  assert(offshoreResult.submergedPontoonCount === 0, "The offshore Pontoon reported immersion.");

  const recoveryGateResult = await page.evaluate(() => window.waterBuoyancyDemo.runRecoveryGate());
  const maxRecoveryAttitude = Math.max(recoveryGateResult.maxAbsRollDegrees, recoveryGateResult.maxAbsPitchDegrees);
  assert(recoveryGateResult.dwellMs >= 2000, "The River recovery gate did not hold for two seconds.");
  assert(recoveryGateResult.runtimeError === "", "The recovered River body reported a runtime error.");
  assert(
    recoveryGateResult.disturbedAttitudeDegrees > 10,
    "The River body did not enter the planned disturbed attitude."
  );
  assert(
    recoveryGateResult.disturbedSampledPontoonCount === 4 && recoveryGateResult.disturbedAppliedForceCount >= 2,
    "The disturbed River body did not submit multiple real PhysX point forces."
  );
  assert(
    recoveryGateResult.disturbedPontoonForceSpread > 0 && recoveryGateResult.disturbedSubmergedRatioSpread > 0,
    "The disturbed River body did not exhibit asymmetric Pontoon immersion/force."
  );
  assert(
    maxRecoveryAttitude < ATTITUDE_RECOVERY_TOLERANCE_DEGREES,
    `Recovered attitude left the ${ATTITUDE_RECOVERY_TOLERANCE_DEGREES}-degree dwell window.`
  );
  assert(recoveryGateResult.maxLinearSpeed < 0.4, "The recovered River body retained excessive speed.");
  assert(recoveryGateResult.minQueryCountPerStep === 4, "The recovery dwell skipped a River Pontoon query.");
  assert(recoveryGateResult.minAppliedForceCountPerStep > 0, "The recovery dwell applied no point force.");

  const frameRateResults = await page.evaluate(() => window.waterBuoyancyDemo.runFrameRateConsistency());
  assert(
    frameRateResults.map((result) => result.targetFrameRate).join(",") === "30,60,120",
    "The frame-rate matrix must cover 30, 60, and 120 FPS."
  );
  const frameRateHeights = frameRateResults.map((result) => result.bodyHeight);
  const heightSpread = Math.max(...frameRateHeights) - Math.min(...frameRateHeights);
  assert(
    heightSpread <= FRAME_RATE_HEIGHT_SPREAD_TOLERANCE,
    `Fixed-step height spread ${heightSpread} exceeded ${FRAME_RATE_HEIGHT_SPREAD_TOLERANCE}.`
  );
  for (const result of frameRateResults) {
    assert(Number.isFinite(result.bodyHeight), `${result.targetFrameRate} FPS produced a non-finite height.`);
    assert(Math.abs(result.rollDegrees) < 0.1, `${result.targetFrameRate} FPS produced unexpected roll.`);
    assert(Math.abs(result.pitchDegrees) < 0.1, `${result.targetFrameRate} FPS produced unexpected pitch.`);
    assert(result.renderFrameCount > 0, `${result.targetFrameRate} FPS recorded no Galacean render updates.`);
    assert(result.renderElapsedMs >= 2000, `${result.targetFrameRate} FPS did not cover the stability dwell.`);
    assert(
      Number.isFinite(result.actualRenderFps) && result.actualRenderFps > 0,
      `${result.targetFrameRate} target produced an invalid actual FPS value.`
    );
    if (requireActualFrameRateTargets) {
      assert(
        result.actualRenderFps >= result.targetFrameRate * 0.55 &&
          result.actualRenderFps <= result.targetFrameRate * 1.35,
        `${result.targetFrameRate} target produced ${result.actualRenderFps} actual FPS.`
      );
    }
  }
  if (requireActualFrameRateTargets) {
    assert(
      frameRateResults[1].actualRenderFps > frameRateResults[0].actualRenderFps * 1.25 &&
        frameRateResults[2].actualRenderFps > frameRateResults[1].actualRenderFps * 1.25,
      "Actual Galacean render update rates did not increase across 30/60/120 targets."
    );
  }

  const performanceResults = await page.evaluate(() => window.waterBuoyancyDemo.runPerformanceMatrix());
  assert(performanceResults.length === 6, "The performance matrix did not return all six planned cases.");
  for (const result of performanceResults) {
    const horizontalLabel = result.horizontalDragEnabled ? "horizontal-on" : "horizontal-off";
    assertFiniteProfile(result, `${result.surfaceKind}:${result.bodyCount}x${result.pontoonCount}:${horizontalLabel}`);
    assert(typeof result.horizontalDragEnabled === "boolean", "Performance result omitted horizontal-drag state.");
    const expectedQueries = result.bodyCount * result.pontoonCount;
    assert(
      result.queriesPerStep === expectedQueries,
      `${result.bodyCount}x${result.pontoonCount} issued ${result.queriesPerStep}, expected ${expectedQueries} queries.`
    );
    assert(
      result.appliedForcesPerStep > 0 && result.appliedForcesPerStep <= result.queriesPerStep,
      `${result.bodyCount}x${result.pontoonCount} reported an invalid point-force count.`
    );
    assert(result.expectedQueriesPerStep === expectedQueries, "The profile expected-query contract is inconsistent.");
    assert(result.preflightPontoonCount === expectedQueries, "The profile did not preflight every Pontoon.");
    assert(result.preflightAllInsideFootprint, "A performance Pontoon was outside the River footprint.");
    assert(result.preflightAllExpectedSource, "A performance Pontoon sampled the wrong River source kind.");
    assert(Number.isFinite(result.fixedStepBudgetMs) && result.fixedStepBudgetMs > 0, "Invalid fixed-step budget.");
    assert(
      Number.isFinite(result.mainThreadBudgetShareP95) && result.mainThreadBudgetShareP95 >= 0,
      "Invalid fixed-step budget share."
    );
  }
  assert(
    performanceResults.some(
      (result) =>
        result.surfaceKind === "reach" &&
        result.bodyCount === 100 &&
        result.pontoonCount === 4 &&
        !result.horizontalDragEnabled
    ),
    "The horizontal-off reach 100 bodies x 4 Pontoons control case is missing."
  );
  assert(
    performanceResults.some(
      (result) =>
        result.surfaceKind === "reach" &&
        result.bodyCount === 100 &&
        result.pontoonCount === 4 &&
        result.horizontalDragEnabled
    ),
    "The horizontal-on reach 100 bodies x 4 Pontoons comparison case is missing."
  );
  assert(
    performanceResults.some((result) => result.bodyCount === 20 && result.pontoonCount === 8),
    "The 8-Pontoon limit case is missing."
  );
  assert(
    performanceResults.some(
      (result) => result.surfaceKind === "junction" && result.bodyCount === 100 && result.pontoonCount === 4
    ),
    "The multi-tributary 100x4 junction hotspot case is missing."
  );

  const allocationEvidence = await measureSteadyStateAllocation(context, page);

  const riverDriftResult = await verifyRiverDriftStream(browser, targetUrl);

  const existingWaterUrl = new URL("../", targetUrl);
  existingWaterUrl.search = "?webgl=1&quality=medium&surfaceTime=12.5";
  const heightfieldUrl = new URL("../heightfield/", targetUrl);
  heightfieldUrl.search = "?webgl=1&quality=medium&surfaceTime=12.5";
  const existingWaterPages = [
    await verifyExistingWaterPageWithoutPhysX(browser, existingWaterUrl, () => window.waterPcgDebug != null),
    await verifyExistingWaterPageWithoutPhysX(
      browser,
      heightfieldUrl,
      () => window.heightfieldWaterDemo?.metrics.ready === true
    )
  ];

  assert(browserErrors.length === 0, browserErrors.join("\n"));
  console.log(
    JSON.stringify(
      {
        url: targetUrl.href,
        static: {
          height: staticResult.bodyHeight,
          speed: staticResult.linearSpeed,
          queriesPerStep: staticResult.queryCountPerStep,
          stability: staticGateResult,
          kinematic: kinematicResult,
          parentTransform: parentTransformResult
        },
        currentForce: currentForceResult,
        river: {
          scenarioMetrics: riverScenarioMetrics,
          renderParityResult,
          offshoreResult,
          sleepWakeResult,
          recovery: recoveryGateResult,
          dwellMaxAttitudeDegrees: maxRecoveryAttitude
        },
        riverDrift: riverDriftResult,
        performanceResults,
        allocationEvidence,
        frameRateResults,
        frameRateHeightSpread: heightSpread,
        actualFrameRateGateEnforced: requireActualFrameRateTargets,
        existingWaterPages,
        browserErrors
      },
      null,
      2
    )
  );
} finally {
  await browser.close();
}
