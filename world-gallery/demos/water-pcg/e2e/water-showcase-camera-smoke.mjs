import { chromium } from "@playwright/test";
import {
  assertAcceptance,
  assertCaseIdentity,
  assertNoPageErrors,
  assertRuntimeHealthy,
  collectPageDiagnostics,
  createCaseUrl,
  createRunContext,
  DEFAULT_WATER_PCG_URL,
  readCaseSnapshot,
  readGitEvidence,
  serializeError,
  waitForAnimationFrames,
  waitForCaseReady,
  writeAcceptanceReport
} from "./water-acceptance-harness.mjs";
import { FIXED_ACCEPTANCE_ENVIRONMENT, WATER_SHOWCASE_CASES } from "./water-acceptance-cases.mjs";

const gate = "water-showcase-camera-smoke";
const run = createRunContext(gate);
const baseUrl = process.env.WATER_PCG_URL?.trim() || DEFAULT_WATER_PCG_URL;
const headed = process.env.WATER_PCG_HEADED === "1";
const MOVEMENT_EPSILON = 0.1;
const STATIONARY_EPSILON = 1e-4;

function distance(left, right) {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

function createFreeCameraUrl(definition) {
  const url = new URL(baseUrl);
  url.hash = definition.id;
  url.search = "";
  url.searchParams.set("quality", "high");
  url.searchParams.set("stats", "0");
  url.searchParams.set("tour", "0");
  return url;
}

async function readDebugPanelState(page, definition) {
  switch (definition.id) {
    case "showcase-river":
      return {
        primaryVisible: await page.locator("#water-debug-panel").isVisible(),
        advancedVisible: await page.locator(".dg.main").first().isVisible()
      };
    case "showcase-pool":
      return {
        primaryVisible: await page.locator("#interactive-pool-hud").isVisible(),
        advancedVisible: await page.locator("[data-p1-controls]").isVisible()
      };
    case "showcase-ocean":
      return {
        primaryVisible: await page.locator(".dg.main").first().isVisible(),
        advancedVisible: await page.locator(".dg.main").first().isVisible()
      };
    case "showcase-grasslands-stylized-water":
      return {
        primaryVisible: await page.locator("#grasslands-water-hud").isVisible(),
        advancedVisible: await page.locator("#grasslands-water-metrics").isVisible()
      };
    default:
      throw new Error(`Unknown Showcase ${definition.id}.`);
  }
}

async function readCamera(page, definition) {
  const snapshot = await readCaseSnapshot(page, definition);
  assertCaseIdentity(snapshot, definition);
  assertAcceptance(snapshot.camera, `${definition.id} does not expose the Showcase camera diagnostic API.`, snapshot);
  return { runtime: snapshot, camera: snapshot.camera };
}

async function holdForward(page, durationMs = 350) {
  await page.keyboard.down("w");
  try {
    await page.waitForTimeout(durationMs);
  } finally {
    await page.keyboard.up("w");
  }
  await waitForAnimationFrames(page, 2);
}

async function runCameraCase(browser, definition) {
  const context = await browser.newContext({
    viewport: FIXED_ACCEPTANCE_ENVIRONMENT.viewport,
    deviceScaleFactor: FIXED_ACCEPTANCE_ENVIRONMENT.deviceScaleFactor
  });
  const page = await context.newPage();
  const diagnostics = collectPageDiagnostics(page);
  const freeUrl = createFreeCameraUrl(definition);
  const fixedUrl = createCaseUrl(baseUrl, definition);
  try {
    await page.goto(freeUrl.href, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await waitForCaseReady(page, definition);
    const canvas = page.locator("canvas#canvas");
    const freeBefore = await readCamera(page, definition);
    assertRuntimeHealthy(freeBefore.runtime, definition);
    assertAcceptance(
      freeBefore.camera.mode === "free",
      `${definition.id} is not in free camera mode.`,
      freeBefore.camera
    );
    assertAcceptance(
      freeBefore.camera.active === true,
      `${definition.id} FreeControl is not active.`,
      freeBefore.camera
    );
    assertAcceptance(freeBefore.camera.floorMock === false, `${definition.id} camera is constrained to a mock floor.`);
    assertAcceptance(
      Number.isFinite(freeBefore.camera.movementSpeed) && freeBefore.camera.movementSpeed > 0,
      `${definition.id} movement speed is invalid.`,
      freeBefore.camera
    );
    const freeDebugPanel = await readDebugPanelState(page, definition);
    assertAcceptance(
      freeDebugPanel.primaryVisible && freeDebugPanel.advancedVisible,
      `${definition.id} does not show its default debug panel.`,
      freeDebugPanel
    );

    await holdForward(page);
    const freeAfterMove = await readCamera(page, definition);
    const forwardMovement = distance(freeBefore.camera.position, freeAfterMove.camera.position);
    assertAcceptance(
      forwardMovement > MOVEMENT_EPSILON,
      `${definition.id} did not move after holding W (${forwardMovement}).`,
      { before: freeBefore.camera, after: freeAfterMove.camera }
    );

    await waitForAnimationFrames(page, 8);
    const freeAfterRelease = await readCamera(page, definition);
    const movementAfterRelease = distance(freeAfterMove.camera.position, freeAfterRelease.camera.position);
    assertAcceptance(
      movementAfterRelease <= STATIONARY_EPSILON,
      `${definition.id} camera kept moving after W was released (${movementAfterRelease}).`,
      { before: freeAfterMove.camera, after: freeAfterRelease.camera }
    );

    const box = await canvas.boundingBox();
    assertAcceptance(box, `${definition.id} canvas has no pointer target.`);
    const pointerX = box.x + box.width * 0.5;
    const pointerY = box.y + box.height * 0.5;
    await page.mouse.move(pointerX, pointerY);
    await page.mouse.down({ button: "left" });
    await page.mouse.move(pointerX + 120, pointerY + 50, { steps: 6 });
    await page.mouse.up({ button: "left" });
    await waitForAnimationFrames(page, 2);
    const freeAfterLook = await readCamera(page, definition);
    const forwardRotation = distance(freeAfterRelease.camera.forward, freeAfterLook.camera.forward);
    assertAcceptance(
      forwardRotation > 1e-3,
      `${definition.id} view direction did not change after pointer drag (${forwardRotation}).`,
      { before: freeAfterRelease.camera, after: freeAfterLook.camera }
    );

    let freeResetMovement = 0;
    let freeResetPositionError = 0;
    let freeResetForwardError = 0;
    if (definition.runtime === "grasslands") {
      const resetApiState = await page.evaluate(() => {
        const api = window.waterPcgShowcase;
        if (!api) throw new Error("window.waterPcgShowcase is unavailable.");
        api.reset();
        return { currentState: api.currentState };
      });
      await waitForAnimationFrames(page, 2);
      const freeAfterReset = await readCamera(page, definition);
      freeResetPositionError = distance(freeBefore.camera.position, freeAfterReset.camera.position);
      freeResetForwardError = distance(freeBefore.camera.forward, freeAfterReset.camera.forward);
      assertAcceptance(resetApiState.currentState === "hero", `${definition.id} reset did not restore Hero state.`);
      assertAcceptance(
        freeAfterReset.camera.mode === "free" && freeAfterReset.camera.active === true,
        `${definition.id} reset disabled ordinary FreeControl.`,
        freeAfterReset.camera
      );
      assertAcceptance(
        freeResetPositionError <= STATIONARY_EPSILON && freeResetForwardError <= STATIONARY_EPSILON,
        `${definition.id} reset did not restore the interactive Hero camera.`,
        { freeResetPositionError, freeResetForwardError }
      );
      await holdForward(page);
      const freeAfterResetMove = await readCamera(page, definition);
      freeResetMovement = distance(freeAfterReset.camera.position, freeAfterResetMove.camera.position);
      assertAcceptance(
        freeResetMovement > MOVEMENT_EPSILON,
        `${definition.id} FreeControl no longer moves after reset (${freeResetMovement}).`,
        { before: freeAfterReset.camera, after: freeAfterResetMove.camera }
      );
    }

    await page.goto(fixedUrl.href, { waitUntil: "domcontentloaded", timeout: 45_000 });
    await waitForCaseReady(page, definition);
    if (definition.runtime === "grasslands") {
      await page.evaluate(() => window.waterPcgShowcase?.reset());
      await waitForAnimationFrames(page, 2);
    }
    const fixedBefore = await readCamera(page, definition);
    assertRuntimeHealthy(fixedBefore.runtime, definition);
    assertAcceptance(fixedBefore.camera.mode === "fixed", `${definition.id} acceptance camera is not fixed.`);
    assertAcceptance(fixedBefore.camera.active === false, `${definition.id} acceptance FreeControl is active.`);
    const fixedDebugPanel = await readDebugPanelState(page, definition);
    const fixedDebugVisible = fixedDebugPanel.primaryVisible && fixedDebugPanel.advancedVisible;
    if (definition.runtime === "grasslands") {
      assertAcceptance(
        fixedDebugPanel.primaryVisible === false && fixedDebugPanel.advancedVisible === false,
        `${definition.id} automation route did not hide its acceptance HUD.`,
        fixedDebugPanel
      );
    } else {
      assertAcceptance(
        fixedDebugVisible,
        `${definition.id} automation route does not keep its debug panel visible.`,
        fixedDebugPanel
      );
    }
    await holdForward(page);
    const fixedAfter = await readCamera(page, definition);
    const fixedMovement = distance(fixedBefore.camera.position, fixedAfter.camera.position);
    assertAcceptance(
      fixedMovement <= STATIONARY_EPSILON,
      `${definition.id} fixed acceptance camera moved after W (${fixedMovement}).`,
      { before: fixedBefore.camera, after: fixedAfter.camera }
    );
    assertNoPageErrors(diagnostics, `${definition.id} camera smoke`);
    await page.goto("about:blank", { waitUntil: "load", timeout: 10_000 });
    assertNoPageErrors(diagnostics, `${definition.id} camera cleanup`);

    return {
      id: definition.id,
      freeUrl: freeUrl.href,
      fixedUrl: fixedUrl.href,
      movementSpeed: freeBefore.camera.movementSpeed,
      forwardMovement,
      movementAfterRelease,
      forwardRotation,
      freeResetMovement,
      freeResetPositionError,
      freeResetForwardError,
      fixedMovement,
      freeDebugPanel,
      fixedDebugPanel,
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
  for (const definition of WATER_SHOWCASE_CASES) {
    report.cases.push(await runCameraCase(browser, definition));
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
  report.completedAt = new Date().toISOString();
  await writeAcceptanceReport(run, report);
  console.log(JSON.stringify(report, null, 2));
}

if (report.status !== "passed") process.exitCode = 1;
