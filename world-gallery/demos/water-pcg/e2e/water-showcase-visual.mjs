import { createHash } from "node:crypto";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import {
  assertAcceptance,
  assertCanvasHealthy,
  assertCaseIdentity,
  assertNoPageErrors,
  assertRuntimeHealthy,
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
import { FIXED_ACCEPTANCE_ENVIRONMENT, WATER_SHOWCASE_CASES } from "./water-acceptance-cases.mjs";
import {
  assertImmutableShowcaseCases,
  assertMissingShowcaseBaselineAllowed,
  assertShowcaseBaselineCaseIds,
  commitShowcaseBaselineTransaction,
  resolveRetiredShowcaseCaseIds,
  resolveShowcaseVisualSelection,
  WATER_SHOWCASE_VISUAL_APPROVED_CASE_IDS,
  WATER_SHOWCASE_VISUAL_CANDIDATE_CASE_IDS
} from "./water-showcase-visual-policy.mjs";

const gate = "water-showcase-visual";
const run = createRunContext(gate);
const baseUrl = process.env.WATER_PCG_URL?.trim() || DEFAULT_WATER_PCG_URL;
const headed = process.env.WATER_PCG_HEADED === "1";
const requestedMode = (process.argv[2] ?? process.env.WATER_PCG_VISUAL_MODE ?? "compare").toLowerCase();
const CAPTURE_STATES = Object.freeze(["hero", "interaction", "detail"]);
const THRESHOLDS = Object.freeze({
  perChannelByteTolerance: 8,
  maximumDiffPixelRatio: 0.01,
  maximumMeanAbsoluteChannelDifference: 1.5
});
const UPDATE_REASON = (process.env.WATER_PCG_VISUAL_UPDATE_REASON ?? "").trim();
const UPDATE_APPROVAL = (process.env.WATER_PCG_VISUAL_UPDATE_APPROVAL ?? "").trim();
const CASE_FILTER = (process.env.WATER_PCG_VISUAL_CASE ?? "").trim();
const selection = resolveShowcaseVisualSelection({
  mode: requestedMode,
  caseFilter: CASE_FILTER,
  updateReason: UPDATE_REASON,
  updateApproval: UPDATE_APPROVAL,
  availableCaseIds: WATER_SHOWCASE_VISUAL_CANDIDATE_CASE_IDS,
  defaultCaseIds: WATER_SHOWCASE_VISUAL_APPROVED_CASE_IDS,
  updateEligibleCaseIds: WATER_SHOWCASE_VISUAL_APPROVED_CASE_IDS
});
const selectedDefinitions = WATER_SHOWCASE_CASES.filter((definition) =>
  selection.selectedCaseIds.includes(definition.id)
);
const WATER_EFFECT_CAPTURE_STYLE = `
  #example-bar,
  #case-intro,
  #fixture-mark,
  .gl-perf,
  [data-water-debug-panel],
  .dg.ac {
    display: none !important;
  }
`;
const SCRIPT_DIRECTORY = fileURLToPath(new URL(".", import.meta.url));
const DEFAULT_BASELINE_ROOT = resolve(SCRIPT_DIRECTORY, "baselines/showcases");
const baselineRoot = resolve(process.env.WATER_PCG_SHOWCASE_BASELINE_ROOT ?? DEFAULT_BASELINE_ROOT);
const manifestPath = resolve(baselineRoot, "manifest.json");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function baselineFilePath(definition, state) {
  return resolve(baselineRoot, definition.id, `${state}.png`);
}

function baselineFilePathAtRoot(root, definition, state) {
  return resolve(root, definition.id, `${state}.png`);
}

function artifactDirectory(definition, state) {
  return resolve(run.outputDirectory, definition.id, state);
}

async function readBaselineManifest() {
  if (!(await fileExists(manifestPath))) {
    assertAcceptance(requestedMode !== "compare", `Showcase baseline manifest is missing at ${manifestPath}.`);
    return undefined;
  }
  let manifest;
  try {
    manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  } catch (error) {
    throw new Error(
      `Showcase baseline manifest is unreadable or invalid at ${manifestPath}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
  assertAcceptance(manifest.schemaVersion === 1, "Showcase baseline manifest schemaVersion must be 1.", manifest);
  assertAcceptance(
    JSON.stringify(manifest.environment) === JSON.stringify(FIXED_ACCEPTANCE_ENVIRONMENT),
    "Showcase baseline fixed environment does not match the acceptance environment.",
    manifest.environment
  );
  assertAcceptance(
    JSON.stringify(manifest.captureStates) === JSON.stringify(CAPTURE_STATES),
    "Showcase baseline capture states changed.",
    manifest.captureStates
  );
  assertAcceptance(
    JSON.stringify(manifest.thresholds) === JSON.stringify(THRESHOLDS),
    "Showcase baseline thresholds changed.",
    manifest.thresholds
  );
  assertShowcaseBaselineCaseIds(
    Object.keys(manifest.cases ?? {}),
    WATER_SHOWCASE_VISUAL_APPROVED_CASE_IDS,
    requestedMode === "update" ? selection.selectedCaseIds : []
  );
  return manifest;
}

async function loadBaseline(definition, state, manifest) {
  const path = baselineFilePath(definition, state);
  if (!manifest) return { path, bytes: undefined, entry: undefined };
  const caseEntry = manifest.cases?.[definition.id];
  if (caseEntry === undefined) {
    assertMissingShowcaseBaselineAllowed(requestedMode, definition.id);
    return { path, bytes: undefined, entry: undefined };
  }
  const entry = caseEntry.states?.[state];
  assertAcceptance(
    entry?.file === `${definition.id}/${state}.png`,
    `${definition.id}/${state} manifest entry is missing.`
  );
  assertAcceptance(
    typeof entry.sha256 === "string" && /^[a-f0-9]{64}$/.test(entry.sha256),
    `${definition.id}/${state} manifest SHA-256 is invalid.`,
    entry
  );
  assertAcceptance(await fileExists(path), `${definition.id}/${state} baseline PNG is missing at ${path}.`);
  const bytes = await readFile(path);
  assertAcceptance(
    sha256(bytes) === entry.sha256,
    `${definition.id}/${state} baseline PNG does not match its manifest SHA-256.`
  );
  return { path, bytes, entry };
}

async function validateManifestFilesAtRoot(manifest, root) {
  const hashes = {};
  for (const [caseId, caseEntry] of Object.entries(manifest.cases ?? {})) {
    assertAcceptance(
      WATER_SHOWCASE_VISUAL_APPROVED_CASE_IDS.includes(caseId),
      `${caseId} is not approved for a tracked Showcase Golden.`
    );
    const definition = WATER_SHOWCASE_CASES.find((candidate) => candidate.id === caseId);
    assertAcceptance(definition, `Showcase baseline manifest contains unknown case '${caseId}'.`);
    assertAcceptance(
      caseEntry.runtime === definition.runtime && caseEntry.preset === definition.preset,
      `${caseId} baseline identity changed.`,
      caseEntry
    );
    hashes[caseId] = {};
    for (const state of CAPTURE_STATES) {
      const entry = caseEntry.states?.[state];
      const expectedFile = `${caseId}/${state}.png`;
      assertAcceptance(entry?.file === expectedFile, `${caseId}/${state} manifest entry is missing.`, entry);
      assertAcceptance(
        typeof entry.sha256 === "string" && /^[a-f0-9]{64}$/.test(entry.sha256),
        `${caseId}/${state} manifest SHA-256 is invalid.`,
        entry
      );
      const path = baselineFilePathAtRoot(root, definition, state);
      assertAcceptance(await fileExists(path), `${caseId}/${state} baseline PNG is missing at ${path}.`);
      const bytes = await readFile(path);
      const actualHash = sha256(bytes);
      assertAcceptance(actualHash === entry.sha256, `${caseId}/${state} PNG hash differs from its manifest.`);
      hashes[caseId][state] = actualHash;
    }
  }
  return hashes;
}

async function comparePngBytes(page, oldBytes, newBytes) {
  const oldDataUrl = `data:image/png;base64,${oldBytes.toString("base64")}`;
  const newDataUrl = `data:image/png;base64,${newBytes.toString("base64")}`;
  return page.evaluate(
    async ({ oldUrl, newUrl, thresholds }) => {
      const decode = (url) =>
        new Promise((resolveImage, rejectImage) => {
          const image = new Image();
          image.onload = () => resolveImage(image);
          image.onerror = () => rejectImage(new Error("Unable to decode PNG for showcase visual comparison."));
          image.src = url;
        });
      const [oldImage, newImage] = await Promise.all([decode(oldUrl), decode(newUrl)]);
      if (
        oldImage.naturalWidth !== newImage.naturalWidth ||
        oldImage.naturalHeight !== newImage.naturalHeight ||
        oldImage.naturalWidth <= 0 ||
        oldImage.naturalHeight <= 0
      ) {
        throw new Error(
          `PNG dimensions differ: old=${oldImage.naturalWidth}x${oldImage.naturalHeight}, ` +
            `new=${newImage.naturalWidth}x${newImage.naturalHeight}.`
        );
      }
      const width = oldImage.naturalWidth;
      const height = oldImage.naturalHeight;
      const makeCanvas = () => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        return canvas;
      };
      const oldCanvas = makeCanvas();
      const newCanvas = makeCanvas();
      const diffCanvas = makeCanvas();
      const oldContext = oldCanvas.getContext("2d", { willReadFrequently: true });
      const newContext = newCanvas.getContext("2d", { willReadFrequently: true });
      const diffContext = diffCanvas.getContext("2d");
      if (!oldContext || !newContext || !diffContext) throw new Error("2D comparison context is unavailable.");
      oldContext.drawImage(oldImage, 0, 0);
      newContext.drawImage(newImage, 0, 0);
      const oldPixels = oldContext.getImageData(0, 0, width, height).data;
      const newPixels = newContext.getImageData(0, 0, width, height).data;
      const diffImage = diffContext.createImageData(width, height);
      let diffPixelCount = 0;
      let absoluteChannelDifference = 0;
      let maximumChannelDifference = 0;
      for (let offset = 0; offset < oldPixels.length; offset += 4) {
        let pixelMaximum = 0;
        let pixelDifference = 0;
        for (let channel = 0; channel < 3; channel++) {
          const difference = Math.abs(oldPixels[offset + channel] - newPixels[offset + channel]);
          absoluteChannelDifference += difference;
          pixelMaximum = Math.max(pixelMaximum, difference);
          pixelDifference += difference;
        }
        maximumChannelDifference = Math.max(maximumChannelDifference, pixelMaximum);
        if (pixelMaximum > thresholds.perChannelByteTolerance) diffPixelCount++;
        const amplified = Math.min(255, pixelMaximum * 4);
        diffImage.data[offset] = amplified;
        diffImage.data[offset + 1] = Math.min(255, Math.round(pixelDifference / 3));
        diffImage.data[offset + 2] = amplified > 0 ? 32 : 0;
        diffImage.data[offset + 3] = 255;
      }
      diffContext.putImageData(diffImage, 0, 0);
      const pixelCount = width * height;
      return {
        width,
        height,
        pixelCount,
        diffPixelCount,
        diffPixelRatio: diffPixelCount / pixelCount,
        meanAbsoluteChannelDifference: absoluteChannelDifference / (pixelCount * 3),
        maximumChannelDifference,
        diffDataUrl: diffCanvas.toDataURL("image/png")
      };
    },
    { oldUrl: oldDataUrl, newUrl: newDataUrl, thresholds: THRESHOLDS }
  );
}

async function writeReviewArtifacts(page, definition, state, baseline, newBytes) {
  const directory = artifactDirectory(definition, state);
  await mkdir(directory, { recursive: true });
  const oldBytes = baseline.bytes ?? newBytes;
  const comparison = await comparePngBytes(page, oldBytes, newBytes);
  const { diffDataUrl, ...metrics } = comparison;
  const diffBytes = Buffer.from(diffDataUrl.slice(diffDataUrl.indexOf(",") + 1), "base64");
  const oldPath = resolve(directory, "old.png");
  const newPath = resolve(directory, "new.png");
  const diffPath = resolve(directory, "diff.png");
  const comparisonPath = resolve(directory, "comparison.json");
  const passed =
    metrics.diffPixelRatio <= THRESHOLDS.maximumDiffPixelRatio &&
    metrics.meanAbsoluteChannelDifference <= THRESHOLDS.maximumMeanAbsoluteChannelDifference;
  const result = {
    status: baseline.bytes ? (passed ? "passed" : "failed") : "created",
    baselineAvailable: Boolean(baseline.bytes),
    oldSource: baseline.bytes ? baseline.path : "new-capture-copy-for-initial-review",
    thresholds: THRESHOLDS,
    metrics,
    hashes: {
      old: sha256(oldBytes),
      new: sha256(newBytes),
      diff: sha256(diffBytes)
    },
    artifacts: { oldPath, newPath, diffPath, comparisonPath }
  };
  await Promise.all([
    writeFile(oldPath, oldBytes),
    writeFile(newPath, newBytes),
    writeFile(diffPath, diffBytes),
    writeFile(comparisonPath, `${JSON.stringify(result, null, 2)}\n`, "utf8")
  ]);
  return result;
}

async function assertFixedBrowserEnvironment(page) {
  const environment = await page.evaluate(() => {
    const canvas = document.querySelector("canvas#canvas");
    const rect = canvas instanceof HTMLCanvasElement ? canvas.getBoundingClientRect() : undefined;
    return {
      innerWidth,
      innerHeight,
      devicePixelRatio,
      canvasCssWidth: rect?.width ?? 0,
      canvasCssHeight: rect?.height ?? 0
    };
  });
  assertAcceptance(
    environment.innerWidth === FIXED_ACCEPTANCE_ENVIRONMENT.viewport.width &&
      environment.innerHeight === FIXED_ACCEPTANCE_ENVIRONMENT.viewport.height &&
      environment.devicePixelRatio === FIXED_ACCEPTANCE_ENVIRONMENT.deviceScaleFactor,
    "Browser viewport or DPR differs from the fixed Showcase visual environment.",
    environment
  );
  assertAcceptance(
    environment.canvasCssWidth === FIXED_ACCEPTANCE_ENVIRONMENT.viewport.width &&
      environment.canvasCssHeight === FIXED_ACCEPTANCE_ENVIRONMENT.viewport.height,
    "Showcase canvas does not fill the fixed visual viewport.",
    environment
  );
  return environment;
}

async function selectCaptureState(page, definition, state) {
  const apiState = await page.evaluate((requestedState) => {
    const api = window.waterPcgShowcase;
    if (!api) throw new Error("window.waterPcgShowcase is unavailable.");
    if (!Array.isArray(api.states) || !api.states.includes(requestedState)) {
      throw new Error(
        `window.waterPcgShowcase.states=${JSON.stringify(api.states)} does not include '${requestedState}'.`
      );
    }
    api.reset();
    api.setCaptureState(requestedState);
    return { states: [...api.states], currentState: api.currentState };
  }, state);
  assertAcceptance(
    apiState.currentState === state,
    `${definition.id} did not enter fixed capture state '${state}'.`,
    apiState
  );
  await waitForAnimationFrames(page, 8);
  const settledState = await page.evaluate(() => window.waterPcgShowcase?.currentState ?? "");
  assertAcceptance(settledState === state, `${definition.id} left fixed capture state '${state}'.`);
  return apiState;
}

async function captureShowcase(browser, definition, manifest) {
  const context = await browser.newContext({
    viewport: FIXED_ACCEPTANCE_ENVIRONMENT.viewport,
    deviceScaleFactor: FIXED_ACCEPTANCE_ENVIRONMENT.deviceScaleFactor
  });
  const page = await context.newPage();
  const diagnostics = collectPageDiagnostics(page);
  const url = createCaseUrl(baseUrl, definition);
  url.searchParams.set("visual", "1");
  const captures = [];
  try {
    await page.goto(url.href, { waitUntil: "domcontentloaded", timeout: 45_000 });
    const ready = await waitForCaseReady(page, definition);
    assertCaseIdentity(ready, definition);
    assertRuntimeHealthy(ready, definition);
    const environment = await assertFixedBrowserEnvironment(page);
    for (const state of CAPTURE_STATES) {
      const api = await selectCaptureState(page, definition, state);
      const snapshot = await readCaseSnapshot(page, definition);
      assertCaseIdentity(snapshot, definition);
      assertRuntimeHealthy(snapshot, definition);
      const probe = await readCanvasProbe(page);
      assertCanvasHealthy(probe, `${definition.id}/${state}`);
      const newBytes = await page.locator("canvas#canvas").screenshot({
        type: "png",
        animations: "disabled",
        style: WATER_EFFECT_CAPTURE_STYLE
      });
      const baseline = await loadBaseline(definition, state, manifest);
      const review = await writeReviewArtifacts(page, definition, state, baseline, newBytes);
      assertAcceptance(
        review.metrics.width === FIXED_ACCEPTANCE_ENVIRONMENT.viewport.width &&
          review.metrics.height === FIXED_ACCEPTANCE_ENVIRONMENT.viewport.height,
        `${definition.id}/${state} PNG is not 1280x720.`,
        review.metrics
      );
      if (requestedMode === "compare") {
        assertAcceptance(review.baselineAvailable, `${definition.id}/${state} has no reviewed baseline.`);
        assertAcceptance(review.status === "passed", `${definition.id}/${state} differs from its baseline.`, review);
      }
      captures.push({
        state,
        api,
        canvas: summarizeCanvasProbe(probe),
        acceptance: snapshot.acceptance,
        review,
        newBytes
      });
      assertNoPageErrors(diagnostics, `${definition.id}/${state}`);
    }
    await page.goto("about:blank", { waitUntil: "load", timeout: 10_000 });
    assertNoPageErrors(diagnostics, `${definition.id} cleanup`);
    return { id: definition.id, url: url.href, environment, diagnostics, captures };
  } finally {
    await context.close();
  }
}

async function updateBaselines(caseResults, previousManifest) {
  assertAcceptance(previousManifest, "A case-scoped baseline update requires the existing complete manifest.");
  assertAcceptance(caseResults.length === 1, "A baseline transaction must contain exactly one Showcase case.");
  const updatedCaseId = caseResults[0].id;
  assertAcceptance(
    selection.selectedCaseIds.length === 1 && selection.selectedCaseIds[0] === updatedCaseId,
    "Baseline transaction result does not match the explicitly approved case."
  );
  const previousHashes = await validateManifestFilesAtRoot(previousManifest, baselineRoot);
  const cases = { ...(previousManifest?.cases ?? {}) };
  for (const caseResult of caseResults) {
    const definition = WATER_SHOWCASE_CASES.find((candidate) => candidate.id === caseResult.id);
    assertAcceptance(definition, `Unknown Showcase result '${caseResult.id}'.`);
    const states = {};
    for (const capture of caseResult.captures) {
      states[capture.state] = {
        file: `${definition.id}/${capture.state}.png`,
        sha256: sha256(capture.newBytes)
      };
    }
    cases[definition.id] = {
      runtime: definition.runtime,
      preset: definition.preset,
      updateReason: UPDATE_REASON,
      states
    };
  }
  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    updateReason: UPDATE_REASON,
    environment: FIXED_ACCEPTANCE_ENVIRONMENT,
    captureStates: CAPTURE_STATES,
    thresholds: THRESHOLDS,
    cases,
    updatedCaseIds: [updatedCaseId],
    retiredCaseIds: resolveRetiredShowcaseCaseIds(
      previousManifest.retiredCaseIds,
      updatedCaseId
    )
  };
  assertImmutableShowcaseCases(previousManifest, manifest, updatedCaseId);

  const caseResult = caseResults[0];
  const transaction = await commitShowcaseBaselineTransaction({
    baselineRoot,
    manifest,
    updatedCaseId,
    files: caseResult.captures.map((capture) => ({
      relativePath: `${updatedCaseId}/${capture.state}.png`,
      bytes: capture.newBytes
    })),
    previousHashes,
    validateManifestFilesAtRoot
  });
  return { manifest, transaction };
}

const report = {
  schemaVersion: 1,
  gate,
  status: "running",
  mode: requestedMode,
  runId: run.runId,
  generatedAt: new Date().toISOString(),
  resultPath: run.resultPath,
  outputDirectory: run.outputDirectory,
  baselineRoot,
  manifestPath,
  baseUrl,
  headed,
  environment: FIXED_ACCEPTANCE_ENVIRONMENT,
  captureStates: CAPTURE_STATES,
  selectedCaseIds: selectedDefinitions.map(({ id }) => id),
  caseFilterExplicit: selection.requestedCaseIds.length > 0,
  updateApprovalVerified: requestedMode === "update",
  thresholds: THRESHOLDS,
  source: readGitEvidence(),
  cases: [],
  baselineUpdate: undefined,
  failures: []
};

let browser;
try {
  const manifest = await readBaselineManifest();
  if (requestedMode === "update") {
    assertAcceptance(manifest !== undefined, "A case-scoped baseline update requires the existing complete manifest.");
  }
  browser = await chromium.launch({ headless: !headed });
  report.browserVersion = browser.version();
  for (const definition of selectedDefinitions) {
    report.cases.push(await captureShowcase(browser, definition, manifest));
  }
  if (requestedMode === "update") {
    await browser.close();
    browser = undefined;
    report.baselineUpdate = await updateBaselines(report.cases, manifest);
  }
  report.status = "passed";
} catch (error) {
  report.failures.push(serializeError(error));
  report.status = "failed";
} finally {
  await browser?.close().catch((error) => {
    report.failures.push({ phase: "browser-close", ...serializeError(error) });
    report.status = "failed";
  });
}

for (const caseResult of report.cases) {
  for (const capture of caseResult.captures) delete capture.newBytes;
}
await writeAcceptanceReport(run, report);

const reportPath = relative(process.cwd(), run.resultPath) || run.resultPath;
if (report.status === "passed") {
  console.log(
    `Water Showcase visual ${requestedMode} passed: ${selectedDefinitions.length * CAPTURE_STATES.length} captures.`
  );
  console.log(`Report: ${reportPath}`);
} else {
  console.error(`Water Showcase visual ${requestedMode} failed. Report: ${reportPath}`);
  for (const failure of report.failures) console.error(failure.stack || failure.message);
  process.exitCode = 1;
}
