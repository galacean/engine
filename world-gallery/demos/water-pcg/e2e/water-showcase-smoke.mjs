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
  readCanvasProbe,
  readCaseSnapshot,
  readGitEvidence,
  serializeError,
  summarizeCanvasProbe,
  waitForAnimationFrames,
  waitForCaseReady,
  writeAcceptanceReport
} from "./water-acceptance-harness.mjs";
import { FIXED_ACCEPTANCE_ENVIRONMENT, WATER_FEATURE_CASES, WATER_SHOWCASE_CASES } from "./water-acceptance-cases.mjs";

const gate = "water-showcase-smoke";
const run = createRunContext(gate);
const baseUrl = process.env.WATER_PCG_URL?.trim() || DEFAULT_WATER_PCG_URL;
const headed = process.env.WATER_PCG_HEADED === "1";
const REENTRY_ROUNDS = 2;

function numberFromDataset(value, label) {
  const parsed = Number(value);
  assertAcceptance(Number.isFinite(parsed), `${label} is not a finite number: ${String(value)}.`);
  return parsed;
}

function assertPublicNavigation(navigation) {
  const publicGroups = [...new Set(navigation.filter((item) => !item.hidden).map((item) => item.group))].sort();
  assertAcceptance(
    JSON.stringify(publicGroups) === JSON.stringify(["feature", "showcase"]),
    `Public navigation groups are ${JSON.stringify(publicGroups)}, expected ["feature","showcase"].`,
    navigation
  );
  const publicShowcases = navigation
    .filter((item) => !item.hidden && item.group === "showcase")
    .map((item) => item.caseId)
    .sort();
  assertAcceptance(
    JSON.stringify(publicShowcases) === JSON.stringify(WATER_SHOWCASE_CASES.map((definition) => definition.id).sort()),
    `Public Showcase navigation is ${JSON.stringify(publicShowcases)}.`,
    navigation
  );
  const publicFeatures = navigation
    .filter((item) => !item.hidden && item.group === "feature")
    .map((item) => item.caseId)
    .sort();
  assertAcceptance(
    JSON.stringify(publicFeatures) === JSON.stringify(WATER_FEATURE_CASES.map((definition) => definition.id).sort()),
    `Public Feature navigation is ${JSON.stringify(publicFeatures)}.`,
    navigation
  );
}

function assertShowcaseAcceptance(snapshot, definition) {
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
  assertAcceptance(acceptance.refractionEnabled === true, `${definition.id} did not enable refraction.`, acceptance);
  assertAcceptance(acceptance.frame?.finite === true, `${definition.id} frame metrics are not finite.`, acceptance);
  assertAcceptance(
    snapshot.camera?.mode === "fixed",
    `${definition.id} acceptance camera is not fixed.`,
    snapshot.camera
  );
  assertAcceptance(
    snapshot.camera?.active === false,
    `${definition.id} acceptance camera control is active.`,
    snapshot.camera
  );
  assertAcceptance(
    acceptance.scene?.cameraMode === "fixed",
    `${definition.id} acceptance scene did not report a fixed camera.`,
    acceptance.scene
  );
  assertAcceptance(
    acceptance.reflection?.cameraCount <= 1,
    `${definition.id} owns duplicate Planar Cameras.`,
    acceptance
  );
  assertAcceptance(
    acceptance.reflection?.renderTargetCount <= 1,
    `${definition.id} owns duplicate Planar RTs.`,
    acceptance
  );
  assertAcceptance(
    acceptance.reflection?.failureCount === 0,
    `${definition.id} Planar reflection reported failures.`,
    acceptance
  );
}

function assertRiverShowcase(snapshot) {
  assertAcceptance(snapshot.river?.quality === "high", "River Showcase did not resolve High quality.", snapshot.river);
  assertAcceptance(snapshot.river.status === "ready", "River Showcase debug context is not ready.", snapshot.river);
  const stats = snapshot.river.stats;
  assertAcceptance(stats?.nodeCount === 4, `River Showcase node count is ${stats?.nodeCount}, expected 4.`, stats);
  assertAcceptance(stats?.reachCount === 3, `River Showcase reach count is ${stats?.reachCount}, expected 3.`, stats);
  assertAcceptance(
    stats?.junctionCount === 1,
    `River Showcase junction count is ${stats?.junctionCount}, expected 1.`,
    stats
  );
  const riverBody = snapshot.p0?.bodyMetrics?.find((body) => body.type === "river" && body.enabled);
  assertAcceptance(riverBody, "River Showcase did not register one enabled River body.", snapshot.p0);
  assertAcceptance(
    Number.isFinite(riverBody.meshUploadCount) && riverBody.meshUploadCount > 0,
    "River Showcase did not expose its fixed mesh upload count.",
    riverBody
  );
}

function assertPoolShowcase(snapshot) {
  assertAcceptance(snapshot.pool?.quality === "high", "Pool Showcase did not resolve High quality.", snapshot.pool);
  assertAcceptance(snapshot.poolP1?.enabled === true, "Pool Showcase did not enable P1 effects.", snapshot.poolP1);
  assertAcceptance(
    snapshot.poolP1.bodyCount === 4,
    `Pool Showcase body count is ${snapshot.poolP1.bodyCount}, expected 4.`
  );
  assertAcceptance(snapshot.poolP1.temporalFoamEnabled === true, "Pool Showcase did not enable Temporal Foam.");
  assertAcceptance(
    snapshot.poolP1.surfaceOpticsRequestedTier === "high" && snapshot.poolP1.surfaceOpticsResolvedTier === "high",
    "Pool Showcase did not bind High surface optics.",
    snapshot.poolP1
  );
  assertAcceptance(snapshot.poolP1.surfaceRefractionEnabled === true, "Pool Showcase did not enable refraction.");
  assertAcceptance(
    snapshot.poolP1.surfaceReflectionSource === "planar",
    `Pool Showcase reflection source is ${snapshot.poolP1.surfaceReflectionSource}, expected planar.`
  );
  assertAcceptance(snapshot.underwater, "Pool Showcase did not expose the underwater runtime.");
  const poolDataset = snapshot.datasets?.pool ?? {};
  assertAcceptance(
    numberFromDataset(poolDataset.planarCameraCount, "Pool Planar Camera count") === 1,
    "Pool Showcase must own exactly one Planar Camera.",
    poolDataset
  );
  assertAcceptance(
    numberFromDataset(poolDataset.planarRenderTargetCount, "Pool Planar RT count") === 1,
    "Pool Showcase must own exactly one Planar render target.",
    poolDataset
  );
  assertAcceptance(
    numberFromDataset(poolDataset.planarFilterSampleCount, "Pool Planar filter sample count") === 5,
    "Pool Showcase High reflection must use five filter samples.",
    poolDataset
  );
}

function assertOceanShowcase(snapshot) {
  const ocean = snapshot.ocean;
  assertAcceptance(ocean?.quality === "high", "Ocean Showcase did not resolve High quality.", ocean);
  assertAcceptance(ocean.ringCount === 3, `Ocean Showcase ring count is ${ocean.ringCount}, expected 3.`, ocean);
  assertAcceptance(ocean.patchCount === 37, `Ocean Showcase patch count is ${ocean.patchCount}, expected 37.`, ocean);
  assertAcceptance(ocean.activeMeshCount === 37, "Ocean Showcase does not own exactly 37 active patch meshes.", ocean);
  assertAcceptance(ocean.activeWaveCount === 12, "Ocean Showcase does not expose exactly 12 Gerstner waves.", ocean);
  assertAcceptance(ocean.refractionEnabled === true, "Ocean Showcase did not enable refraction.", ocean);
  assertAcceptance(
    ocean.requestedOpticsTier === "high" && ocean.resolvedOpticsTier === "high",
    "Ocean Showcase did not bind High surface optics.",
    ocean
  );
  assertAcceptance(ocean.reflectionSource === "planar", "Ocean Showcase did not resolve Planar reflection.", ocean);
  assertAcceptance(ocean.perFrameMeshUpload === false, "Ocean Showcase reports per-frame mesh uploads.", ocean);
  const reflection = snapshot.reflection;
  assertAcceptance(
    reflection?.planarCameraCount === 1,
    "Ocean Showcase must own exactly one Planar Camera.",
    reflection
  );
  assertAcceptance(
    reflection.liveRenderTargetCount === 1,
    "Ocean Showcase must own exactly one Planar RT.",
    reflection
  );
  assertAcceptance(reflection.planarUpdateCount > 0, "Ocean Showcase Planar reflection never rendered.", reflection);
}

function assertShowcaseSemantics(snapshot, definition) {
  assertShowcaseAcceptance(snapshot, definition);
  switch (definition.id) {
    case "showcase-river":
      assertRiverShowcase(snapshot);
      break;
    case "showcase-pool":
      assertPoolShowcase(snapshot);
      break;
    case "showcase-ocean":
      assertOceanShowcase(snapshot);
      break;
    default:
      throw new Error(`Unknown Showcase ${definition.id}.`);
  }
  const nonFinite = collectNonFinite(
    {
      river: snapshot.river,
      p0: snapshot.p0,
      pool: snapshot.pool,
      poolP1: snapshot.poolP1,
      underwater: snapshot.underwater,
      ocean: snapshot.ocean,
      reflection: snapshot.reflection
    },
    definition.id
  );
  assertAcceptance(nonFinite.length === 0, `${definition.id} exposed non-finite metrics: ${nonFinite.join(", ")}.`);
}

async function readNavigation(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll("#example-bar [data-case-id]"), (element) => ({
      caseId: element.dataset.caseId ?? "",
      group: element.dataset.caseGroup ?? "",
      hidden: element.hidden || element.closest("[hidden]") !== null
    }))
  );
}

async function runShowcaseRound(browser, definition, round) {
  const context = await browser.newContext({
    viewport: FIXED_ACCEPTANCE_ENVIRONMENT.viewport,
    deviceScaleFactor: FIXED_ACCEPTANCE_ENVIRONMENT.deviceScaleFactor
  });
  const page = await context.newPage();
  const diagnostics = collectPageDiagnostics(page);
  const url = createCaseUrl(baseUrl, definition);
  try {
    await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 45_000 });
    const initial = await waitForCaseReady(page, definition);
    assertCaseIdentity(initial, definition);
    assertRuntimeHealthy(initial, definition);
    await waitForAnimationFrames(page, 3);
    const snapshot = await readCaseSnapshot(page, definition);
    assertCaseIdentity(snapshot, definition);
    assertRuntimeHealthy(snapshot, definition);
    assertShowcaseSemantics(snapshot, definition);
    const canvas = await readCanvasProbe(page);
    assertCanvasHealthy(canvas, `${definition.id} round ${round}`);
    const navigation = await readNavigation(page);
    assertPublicNavigation(navigation);
    assertAcceptance(
      (await page.locator(".gl-perf").count()) === 0,
      `${definition.id} created a Stats panel during stats=0 acceptance.`
    );
    assertNoPageErrors(diagnostics, `${definition.id} round ${round}`);

    await page.goto("about:blank", { waitUntil: "load", timeout: 10_000 });
    assertNoPageErrors(diagnostics, `${definition.id} round ${round} cleanup`);
    return {
      id: definition.id,
      round,
      url: url.href,
      identity: snapshot.identity,
      canvas: summarizeCanvasProbe(canvas),
      navigation,
      runtime: snapshot,
      diagnostics
    };
  } finally {
    await context.close();
  }
}

async function runShowcaseSwitchSequence(browser) {
  const context = await browser.newContext({
    viewport: FIXED_ACCEPTANCE_ENVIRONMENT.viewport,
    deviceScaleFactor: FIXED_ACCEPTANCE_ENVIRONMENT.deviceScaleFactor
  });
  const page = await context.newPage();
  const diagnostics = collectPageDiagnostics(page);
  const sequence = [...WATER_SHOWCASE_CASES, WATER_SHOWCASE_CASES[0]];
  const steps = [];
  try {
    for (const [index, definition] of sequence.entries()) {
      const url = createCaseUrl(baseUrl, definition);
      await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await waitForCaseReady(page, definition);
      await waitForAnimationFrames(page, 3);
      const snapshot = await readCaseSnapshot(page, definition);
      assertCaseIdentity(snapshot, definition);
      assertRuntimeHealthy(snapshot, definition);
      assertShowcaseSemantics(snapshot, definition);
      const canvas = await readCanvasProbe(page);
      assertCanvasHealthy(canvas, `${definition.id} switch step ${index + 1}`);
      assertNoPageErrors(diagnostics, `${definition.id} switch step ${index + 1}`);
      steps.push({
        index: index + 1,
        id: definition.id,
        url: url.href,
        identity: snapshot.identity,
        canvas: summarizeCanvasProbe(canvas),
        acceptance: snapshot.acceptance
      });
    }
    await page.goto("about:blank", { waitUntil: "load", timeout: 10_000 });
    assertNoPageErrors(diagnostics, "Showcase switch cleanup");
    return { status: "passed", steps, diagnostics };
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
  switchSequence: undefined,
  failures: []
};

let browser;
try {
  browser = await chromium.launch({ headless: !headed });
  report.browserVersion = browser.version();
  for (let round = 1; round <= REENTRY_ROUNDS; round++) {
    for (const definition of WATER_SHOWCASE_CASES) {
      report.cases.push(await runShowcaseRound(browser, definition, round));
    }
  }
  report.switchSequence = await runShowcaseSwitchSequence(browser);
  report.status = "passed";
} catch (error) {
  report.failures.push(serializeError(error));
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
