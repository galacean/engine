import { chromium } from "@playwright/test";
import {
  assertAcceptance,
  assertCanvasHealthy,
  assertCaseIdentity,
  assertNoPageErrors,
  assertRuntimeHealthy,
  collectNonFinite,
  collectPageDiagnostics,
  createCaseUrl,
  createRunContext,
  DEFAULT_WATER_PCG_URL,
  meanAbsoluteDifference,
  readCanvasProbe,
  readCaseSnapshot,
  readGitEvidence,
  serializeError,
  summarizeCanvasProbe,
  waitForAnimationFrames,
  waitForCaseReady,
  writeAcceptanceReport
} from "./water-acceptance-harness.mjs";
import { FIXED_ACCEPTANCE_ENVIRONMENT, WATER_FEATURE_CASES } from "./water-acceptance-cases.mjs";

const gate = "water-feature-cases-smoke";
const run = createRunContext(gate);
const baseUrl = process.env.WATER_PCG_URL?.trim() || DEFAULT_WATER_PCG_URL;
const headed = process.env.WATER_PCG_HEADED === "1";
const FEATURE_TIMEOUT_MS = 35_000;
const SIGNAL_EPSILON = 1e-9;
const VISUAL_CAUSAL_CASES = new Set([
  "feature-refraction",
  "feature-reflection",
  "feature-gerstner-waves",
  "feature-shore-foam",
  "feature-heightfield"
]);
const DEBUG_PANEL_SELECTORS = Object.freeze({
  river: Object.freeze(["#water-debug-panel", ".dg.main"]),
  pool: Object.freeze(["#interactive-pool-hud", "[data-p1-controls]"]),
  ocean: Object.freeze([".dg.main"]),
  heightfield: Object.freeze(["#heightfield-hud", ".dg.main"]),
  buoyancy: Object.freeze(["#buoyancy-hud"]),
  "optics-lab": Object.freeze(["#water-optics-hud"])
});

function parseDatasetNumber(value, label) {
  const parsed = Number(value);
  assertAcceptance(Number.isFinite(parsed), `${label} is not finite: ${String(value)}.`);
  return parsed;
}

async function invokeFeatureApi(page, method, argument) {
  await page.evaluate(
    async ({ methodName, value }) => {
      const api = window.waterPcgFeature;
      if (!api) throw new Error("window.waterPcgFeature is unavailable.");
      const candidate = api[methodName];
      if (typeof candidate !== "function") throw new Error(`window.waterPcgFeature.${methodName} is unavailable.`);
      await candidate.call(api, value);
    },
    { methodName: method, value: argument }
  );
  await waitForAnimationFrames(page, 3);
}

async function waitForSnapshot(page, definition, predicate, label, timeoutMs = FEATURE_TIMEOUT_MS) {
  const deadline = performance.now() + timeoutMs;
  let latest;
  while (performance.now() < deadline) {
    latest = await readCaseSnapshot(page, definition);
    if (predicate(latest)) return latest;
    await page.waitForTimeout(100);
  }
  throw new Error(
    `${definition.id}: ${label} did not become true within ${timeoutMs}ms. Latest=${JSON.stringify(latest)}`
  );
}

async function assertDebugPanelsVisible(page, definition) {
  const selectors = DEBUG_PANEL_SELECTORS[definition.runtime];
  assertAcceptance(selectors, `${definition.id} has no debug-panel selector contract.`);
  const panels = [];
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    const count = await locator.count();
    const visible = count > 0 && (await locator.isVisible());
    panels.push({ selector, count, visible });
  }
  assertAcceptance(
    panels.every(({ count, visible }) => count > 0 && visible),
    `${definition.id} does not show every debug panel on its acceptance route.`,
    panels
  );
  return panels;
}

function assertFeatureContract(snapshot, definition, expectedEnabled) {
  const feature = snapshot.feature;
  assertAcceptance(feature, `${definition.id} does not expose window.waterPcgFeature.`, snapshot);
  assertAcceptance(
    feature.caseId === definition.id,
    `${definition.id} feature API reported case '${feature.caseId}'.`,
    feature
  );
  assertAcceptance(
    feature.preset === definition.preset,
    `${definition.id} feature API reported preset '${feature.preset}', expected '${definition.preset}'.`,
    feature
  );
  assertAcceptance(feature.ready === true, `${definition.id} feature API is not ready.`, feature);
  assertAcceptance(feature.finite === true, `${definition.id} feature API is not finite.`, feature);
  assertAcceptance(
    feature.runtimeError === "",
    `${definition.id} feature API reported '${feature.runtimeError}'.`,
    feature
  );
  assertAcceptance(
    feature.enabled === expectedEnabled,
    `${definition.id} feature enabled=${feature.enabled}, expected ${expectedEnabled}.`,
    feature
  );
  assertAcceptance(Number.isFinite(feature.signal), `${definition.id} feature signal is not finite.`, feature);
  if (expectedEnabled) {
    assertAcceptance(feature.signal > SIGNAL_EPSILON, `${definition.id} produced no positive causal signal.`, feature);
  } else {
    assertAcceptance(
      Math.abs(feature.signal) <= SIGNAL_EPSILON,
      `${definition.id} retained causal signal ${feature.signal} while disabled.`,
      feature
    );
  }
}

async function waitForFeatureState(page, definition, enabled) {
  return waitForSnapshot(
    page,
    definition,
    (snapshot) => {
      const feature = snapshot.feature;
      if (
        !feature ||
        feature.caseId !== definition.id ||
        feature.preset !== definition.preset ||
        feature.ready !== true ||
        feature.finite !== true ||
        feature.runtimeError !== "" ||
        feature.enabled !== enabled ||
        !Number.isFinite(feature.signal)
      ) {
        return false;
      }
      return enabled ? feature.signal > SIGNAL_EPSILON : Math.abs(feature.signal) <= SIGNAL_EPSILON;
    },
    enabled ? "enabled feature signal" : "disabled zero-signal state"
  );
}

async function freezeOpticsIfPresent(page) {
  await page.evaluate(() => {
    if (window.waterPcgOptics) window.waterPcgOptics.freezeTime(true);
  });
  await waitForAnimationFrames(page, 3);
}

async function assertRefraction(page, definition) {
  const snapshot = await waitForSnapshot(
    page,
    definition,
    (candidate) =>
      candidate.optics?.ready === true &&
      candidate.optics.refractionEnabled === true &&
      candidate.optics.requestedTier === "high" &&
      candidate.optics.resolvedTier === "high",
    "High refraction runtime"
  );
  assertAcceptance(snapshot.optics.cameraDepthCopyPassCount <= 1, "Refraction allocated duplicate depth-copy passes.");
  assertAcceptance(
    snapshot.optics.cameraOpaqueCopyPassCount <= 1,
    "Refraction allocated duplicate opaque-copy passes."
  );
  return snapshot;
}

async function assertReflection(page, definition) {
  const snapshot = await waitForSnapshot(
    page,
    definition,
    (candidate) =>
      candidate.optics?.ready === true &&
      candidate.optics.reflectionSource === "planar" &&
      candidate.optics.resolvedReflectionSource === "planar" &&
      candidate.optics.planarCameraCount === 1 &&
      candidate.optics.planarRenderTargetCount === 1,
    "Planar reflection runtime"
  );
  assertAcceptance(snapshot.optics.planarFilterSampleCount === 5, "High reflection did not use five samples.");
  assertAcceptance(snapshot.optics.waterLayerExcludedFromPlanar === true, "Planar reflection did not exclude water.");
  return snapshot;
}

async function assertRipples(page, definition) {
  const snapshot = await waitForSnapshot(
    page,
    definition,
    (candidate) =>
      candidate.pool?.entryImpactCount > 0 &&
      candidate.pool.maximumAbsSurfaceHeight > 0 &&
      candidate.pool.rippleRadius > 0 &&
      candidate.pool.reflectedWaveObserved === true &&
      candidate.pool.rippleHighlightPeak > 0,
    "impact, propagation, highlight, and wall-reflection ripple signals"
  );
  assertAcceptance(
    snapshot.poolP1?.enabled === false,
    "Ripple case unexpectedly enabled the P1 fleet.",
    snapshot.poolP1
  );
  return snapshot;
}

async function assertWakeFoam(page, definition) {
  const snapshot = await waitForSnapshot(
    page,
    definition,
    (candidate) =>
      candidate.poolP1?.enabled === true &&
      candidate.poolP1.temporalFoamEnabled === true &&
      candidate.poolP1.bodyCount === 4 &&
      candidate.poolP1.acceptedEventCount > 0 &&
      candidate.poolP1.foamSourceInjectionCount > 0 &&
      candidate.poolP1.foamActiveHistoryPixelCount > 0 &&
      candidate.poolP1.foamPeakHistoryValue > 0 &&
      candidate.poolP1.foamHistoryEnergy > 0,
    "wake and temporal-foam history signals"
  );
  assertAcceptance(
    snapshot.poolP1.foamTextureUploadsPerRenderFrame <= 1,
    "Temporal foam uploaded more than once in one render frame.",
    snapshot.poolP1
  );
  assertAcceptance(snapshot.poolP1.foamFullSurfaceQueryCount === 0, "Temporal foam used full surface queries.");
  return snapshot;
}

async function assertUnderwater(page, definition) {
  const snapshot = await waitForSnapshot(
    page,
    definition,
    (candidate) =>
      candidate.underwater?.isUnderwater === true &&
      candidate.underwater.activeBodyId === "interactive-pool" &&
      candidate.underwater.passExecutionCount > 0 &&
      candidate.underwater.passMaterialAllocated === true,
    "underwater volume and post-process signals"
  );
  const continuity = snapshot.underwater.opticalContinuity;
  assertAcceptance(continuity?.finite === true, "Underwater optical continuity is not finite.", continuity);
  assertAcceptance(
    continuity.configuredReferenceConsistent === true,
    "Surface and underwater profiles are not shared."
  );
  assertAcceptance(continuity.activeReferenceConsistent === true, "Active underwater profile is not shared.");
  assertAcceptance(continuity.maximumResolvedProfileDelta <= 1e-12, "Resolved optical profiles diverged.", continuity);
  assertAcceptance(
    continuity.maximumMediumColorDelta <= 1e-12,
    "Surface/underwater medium colors diverged.",
    continuity
  );
  return snapshot;
}

async function assertBuoyancy(page, definition) {
  const gateResult = await page.evaluate(async () => {
    const api = window.waterBuoyancyDemo;
    if (!api) throw new Error("window.waterBuoyancyDemo is unavailable.");
    return api.runSinglePontoonGate();
  });
  assertAcceptance(gateResult.dwellMs >= 2000, "Buoyancy stability gate did not hold for two seconds.", gateResult);
  assertAcceptance(gateResult.runtimeError === "", "Buoyancy stability gate reported a runtime error.", gateResult);
  assertAcceptance(gateResult.maxLinearSpeed < 0.08, "Buoyancy body did not settle.", gateResult);
  assertAcceptance(gateResult.minSubmergedPontoonCount === 1, "Pontoon left the water during stability dwell.");
  assertAcceptance(gateResult.minQueryCountPerStep === 1, "Buoyancy skipped a surface query.");
  assertAcceptance(gateResult.minAppliedForceCountPerStep === 1, "Buoyancy skipped its point force.");
  const snapshot = await readCaseSnapshot(page, definition);
  assertAcceptance(snapshot.buoyancy?.scenario === "static-single", "Buoyancy case loaded the wrong scenario.");
  assertAcceptance(snapshot.buoyancy.pontoonCount === 1, "Buoyancy case does not use one Pontoon.");
  return { snapshot, gateResult };
}

async function assertCurrentDrift(page, definition) {
  const gateResult = await page.evaluate(async () => {
    const api = window.waterBuoyancyDemo;
    if (!api) throw new Error("window.waterBuoyancyDemo is unavailable.");
    return api.runCurrentForceCheck();
  });
  assertAcceptance(gateResult.firstHorizontalForceX > 0, "Current did not apply a downstream force.", gateResult);
  assertAcceptance(gateResult.downstreamDistance > 0, "Current did not move the body downstream.", gateResult);
  assertAcceptance(gateResult.maxDownstreamSpeed > 0, "Current produced no downstream speed.", gateResult);
  assertAcceptance(
    gateResult.finalRelativeSpeed < gateResult.initialRelativeSpeed,
    "Current did not reduce the body/water relative speed.",
    gateResult
  );
  assertAcceptance(gateResult.finite === true, "Current drift gate produced non-finite state.", gateResult);
  assertAcceptance(
    gateResult.maxDownstreamSpeed <= gateResult.waterSpeed * 1.05,
    "Current drift persistently exceeded water speed.",
    gateResult
  );
  const snapshot = await readCaseSnapshot(page, definition);
  assertAcceptance(snapshot.buoyancy?.scenario === "river-four", "Current-drift case loaded the wrong scenario.");
  return { snapshot, gateResult };
}

async function assertGerstner(page, definition) {
  const snapshot = await waitForSnapshot(
    page,
    definition,
    (candidate) =>
      candidate.ocean?.activeWaveCount > 0 &&
      candidate.ocean.waveModel === "directionalGerstner" &&
      candidate.ocean.perFrameMeshUpload === false,
    "Gerstner wave runtime"
  );
  assertAcceptance(snapshot.ocean.sourceHash.length > 0, "Gerstner case has no compiled source hash.");
  return snapshot;
}

async function assertShoreFoam(page, definition) {
  const snapshot = await waitForSnapshot(
    page,
    definition,
    (candidate) =>
      candidate.heightfield?.ready === true &&
      candidate.datasets?.heightfield?.foamEnabled === "true" &&
      candidate.datasets.heightfield.wavesEnabled === "false" &&
      candidate.datasets.heightfield.microNormalsEnabled === "false",
    "isolated shore-foam flags"
  );
  assertAcceptance(snapshot.heightfield.perFrameMeshUpload === false, "Shore foam reports per-frame mesh uploads.");
  return snapshot;
}

async function assertHeightfield(page, definition) {
  const snapshot = await waitForSnapshot(
    page,
    definition,
    (candidate) =>
      candidate.heightfield?.ready === true &&
      candidate.heightfield.quality === "high" &&
      candidate.heightfield.activeWaveCount > 0 &&
      candidate.datasets?.heightfield?.wavesEnabled === "true",
    "High animated heightfield runtime"
  );
  assertAcceptance(snapshot.heightfield.meshUploadCount > 0, "Heightfield did not upload its compiled mesh.");
  assertAcceptance(snapshot.heightfield.perFrameMeshUpload === false, "Heightfield reports per-frame mesh uploads.");
  return snapshot;
}

async function assertRiverConfluence(page, definition) {
  const snapshot = await waitForSnapshot(
    page,
    definition,
    (candidate) =>
      candidate.river?.status === "ready" &&
      candidate.river.stats?.nodeCount === 4 &&
      candidate.river.stats.reachCount === 3 &&
      candidate.river.stats.junctionCount === 1,
    "four-node, three-reach, one-junction confluence topology"
  );
  assertAcceptance(snapshot.river.resourceHash?.length > 0, "River confluence has no resource hash.");
  return snapshot;
}

async function assertSpecificFeature(page, definition) {
  switch (definition.id) {
    case "feature-refraction":
      return assertRefraction(page, definition);
    case "feature-reflection":
      return assertReflection(page, definition);
    case "feature-ripples":
      return assertRipples(page, definition);
    case "feature-wake-foam":
      return assertWakeFoam(page, definition);
    case "feature-underwater":
      return assertUnderwater(page, definition);
    case "feature-buoyancy":
      return assertBuoyancy(page, definition);
    case "feature-current-drift":
      return assertCurrentDrift(page, definition);
    case "feature-gerstner-waves":
      return assertGerstner(page, definition);
    case "feature-shore-foam":
      return assertShoreFoam(page, definition);
    case "feature-heightfield":
      return assertHeightfield(page, definition);
    case "feature-river-confluence":
      return assertRiverConfluence(page, definition);
    default:
      throw new Error(`Unknown Feature case ${definition.id}.`);
  }
}

function assertDisabledSemantics(snapshot, definition) {
  switch (definition.id) {
    case "feature-refraction":
      assertAcceptance(
        snapshot.optics?.refractionEnabled === false,
        "Refraction Off still reports refraction enabled."
      );
      break;
    case "feature-reflection":
      assertAcceptance(snapshot.optics?.reflectionSource === "sky", "Reflection A-state is not Sky.", snapshot.optics);
      assertAcceptance(snapshot.optics.planarCameraCount === 0, "Reflection Off retained a Planar Camera.");
      assertAcceptance(snapshot.optics.planarRenderTargetCount === 0, "Reflection Off retained a Planar RT.");
      break;
    case "feature-ripples":
      assertAcceptance(snapshot.pool?.entryImpactCount === 0, "Ripple Off retained entry-impact observations.");
      assertAcceptance(snapshot.pool.maximumAbsSurfaceHeight === 0, "Ripple Off retained surface displacement.");
      assertAcceptance(snapshot.pool.rippleRadius === 0, "Ripple Off retained a ripple radius.");
      break;
    case "feature-wake-foam":
      assertAcceptance(snapshot.poolP1?.dynamicEffectsEnabled === false, "Wake Off retained dynamic effects.");
      assertAcceptance(snapshot.poolP1.foamActiveHistoryPixelCount === 0, "Wake Off retained foam history pixels.");
      assertAcceptance(snapshot.poolP1.foamPeakHistoryValue === 0, "Wake Off retained a foam peak.");
      assertAcceptance(snapshot.poolP1.foamHistoryEnergy === 0, "Wake Off retained foam energy.");
      break;
    case "feature-underwater":
      assertAcceptance(snapshot.underwater?.isUnderwater === false, "Underwater Off remained inside a water body.");
      assertAcceptance(snapshot.underwater.passMaterialAllocated === false, "Underwater Off retained its material.");
      break;
    case "feature-buoyancy":
      assertAcceptance(snapshot.buoyancy?.buoyancyEnabled === false, "Buoyancy Off retained buoyancy forces.");
      break;
    case "feature-current-drift":
      assertAcceptance(snapshot.buoyancy?.currentEnabled === false, "Current Off retained water-current forces.");
      break;
    case "feature-gerstner-waves":
      assertAcceptance(snapshot.feature?.signal === 0, "Gerstner Off retained a wave signal.");
      break;
    case "feature-shore-foam":
      assertAcceptance(snapshot.datasets?.heightfield?.foamEnabled === "false", "Shore Foam Off retained foam.");
      break;
    case "feature-heightfield":
      assertAcceptance(snapshot.datasets?.heightfield?.wavesEnabled === "false", "Heightfield Off retained waves.");
      assertAcceptance(
        snapshot.datasets?.heightfield?.microNormalsEnabled === "false",
        "Heightfield Off retained micro normals."
      );
      break;
    case "feature-river-confluence":
      assertAcceptance(snapshot.feature?.signal === 0, "River Confluence Off retained a topology signal.");
      break;
    default:
      throw new Error(`Unknown Feature case ${definition.id}.`);
  }
}

function summarizeSpecificResult(result) {
  if (result?.snapshot) {
    return {
      gateResult: result.gateResult,
      runtime: {
        feature: result.snapshot.feature,
        buoyancy: result.snapshot.buoyancy
      }
    };
  }
  return {
    runtime: {
      feature: result.feature,
      river: result.river,
      pool: result.pool,
      poolP1: result.poolP1,
      underwater: result.underwater,
      ocean: result.ocean,
      reflection: result.reflection,
      optics: result.optics,
      heightfield: result.heightfield,
      buoyancy: result.buoyancy,
      datasets: result.datasets
    }
  };
}

function assertFiniteSpecificResult(result, definition) {
  const target = result?.snapshot ?? result;
  const nonFinite = collectNonFinite(
    {
      feature: target.feature,
      river: target.river,
      pool: target.pool,
      poolP1: target.poolP1,
      underwater: target.underwater,
      ocean: target.ocean,
      reflection: target.reflection,
      optics: target.optics,
      heightfield: target.heightfield,
      buoyancy: target.buoyancy
    },
    definition.id
  );
  assertAcceptance(nonFinite.length === 0, `${definition.id} exposed non-finite metrics: ${nonFinite.join(", ")}.`);
}

async function runFeatureCase(browser, definition) {
  const context = await browser.newContext({
    viewport: FIXED_ACCEPTANCE_ENVIRONMENT.viewport,
    deviceScaleFactor: FIXED_ACCEPTANCE_ENVIRONMENT.deviceScaleFactor
  });
  const page = await context.newPage();
  const diagnostics = collectPageDiagnostics(page);
  const url = createCaseUrl(baseUrl, definition);
  try {
    await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 45_000 });
    const ready = await waitForCaseReady(page, definition);
    assertCaseIdentity(ready, definition);
    assertRuntimeHealthy(ready, definition);
    const debugPanels = await assertDebugPanelsVisible(page, definition);
    await invokeFeatureApi(page, "reset");
    await freezeOpticsIfPresent(page);

    const initialOn = await waitForFeatureState(page, definition, true);
    assertCaseIdentity(initialOn, definition);
    assertRuntimeHealthy(initialOn, definition);
    assertFeatureContract(initialOn, definition, true);
    const initialProbe = await readCanvasProbe(page);
    assertCanvasHealthy(initialProbe, `${definition.id} initial`);
    await waitForAnimationFrames(page, 3);
    const controlProbe = await readCanvasProbe(page);

    await invokeFeatureApi(page, "setEnabled", false);
    const disabled = await waitForFeatureState(page, definition, false);
    assertFeatureContract(disabled, definition, false);
    assertDisabledSemantics(disabled, definition);
    const disabledProbe = await readCanvasProbe(page);
    assertCanvasHealthy(disabledProbe, `${definition.id} disabled`);

    await invokeFeatureApi(page, "setEnabled", true);
    await freezeOpticsIfPresent(page);
    const enabledAgain = await waitForFeatureState(page, definition, true);
    assertFeatureContract(enabledAgain, definition, true);
    const specificResult = await assertSpecificFeature(page, definition);
    assertFiniteSpecificResult(specificResult, definition);

    await invokeFeatureApi(page, "reset");
    await freezeOpticsIfPresent(page);
    const restored = await waitForFeatureState(page, definition, true);
    assertFeatureContract(restored, definition, true);
    const restoredProbe = await readCanvasProbe(page);
    assertCanvasHealthy(restoredProbe, `${definition.id} restored`);

    const visual = {
      required: VISUAL_CAUSAL_CASES.has(definition.id),
      controlMad: meanAbsoluteDifference(initialProbe.luminance, controlProbe.luminance),
      disabledMad: meanAbsoluteDifference(initialProbe.luminance, disabledProbe.luminance),
      restoredMad: meanAbsoluteDifference(initialProbe.luminance, restoredProbe.luminance),
      initial: summarizeCanvasProbe(initialProbe),
      disabled: summarizeCanvasProbe(disabledProbe),
      restored: summarizeCanvasProbe(restoredProbe)
    };
    if (visual.required) {
      const minimumCausalMad = Math.max(0.02, visual.controlMad * 3 + 0.01);
      const maximumRestoredMad = Math.max(0.25, visual.controlMad * 5 + 0.05);
      assertAcceptance(
        visual.disabledMad > minimumCausalMad,
        `${definition.id} visual A/B MAD ${visual.disabledMad.toFixed(4)} did not exceed ${minimumCausalMad.toFixed(4)}.`,
        visual
      );
      assertAcceptance(
        visual.restoredMad <= maximumRestoredMad,
        `${definition.id} reset MAD ${visual.restoredMad.toFixed(4)} exceeded ${maximumRestoredMad.toFixed(4)}.`,
        visual
      );
    }

    assertAcceptance(
      (await page.locator(".gl-perf").count()) === 0,
      `${definition.id} created a Stats panel during stats=0 acceptance.`
    );
    assertNoPageErrors(diagnostics, definition.id);
    await page.goto("about:blank", { waitUntil: "load", timeout: 10_000 });
    assertNoPageErrors(diagnostics, `${definition.id} cleanup`);
    return {
      id: definition.id,
      status: "passed",
      url: url.href,
      identity: restored.identity,
      debugPanels,
      ab: {
        initial: initialOn.feature,
        disabled: disabled.feature,
        enabledAgain: enabledAgain.feature,
        restored: restored.feature
      },
      visual,
      specific: summarizeSpecificResult(specificResult),
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
  runId: run.runId,
  generatedAt: new Date().toISOString(),
  resultPath: run.resultPath,
  outputDirectory: run.outputDirectory,
  baseUrl,
  headed,
  environment: FIXED_ACCEPTANCE_ENVIRONMENT,
  source: readGitEvidence(),
  cases: [],
  failures: []
};

let browser;
try {
  browser = await chromium.launch({ headless: !headed });
  report.browserVersion = browser.version();
  for (const definition of WATER_FEATURE_CASES) {
    try {
      report.cases.push(await runFeatureCase(browser, definition));
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
