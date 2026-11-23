import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

const origin = process.env.SEED_BASE_URL ?? "http://127.0.0.1:5193";
const templates = ["original", "sakura-pearl", "emerald-forest", "low-poly", "titan-wasteland"];
const evidenceDir = process.env.SEED_EVIDENCE_DIR;
const cases = ["webgl2", "webgpu"].flatMap(rhi => templates.map(template => ({ rhi, template, expected: rhi })));
cases.push(
  { rhi: "auto", template: "titan-wasteland", expected: "webgpu" },
  { rhi: "auto", template: "titan-wasteland", expected: "webgl2", unavailable: "api" },
  { rhi: "auto", template: "titan-wasteland", expected: "webgl2", unavailable: "adapter" },
  { rhi: "auto", template: "titan-wasteland", expected: "webgl2", unavailable: "device" },
  { rhi: "auto", template: "titan-wasteland", expected: "webgl2", unavailable: "context" },
  { rhi: "auto", template: "titan-wasteland", expected: "error", unavailable: "configure" },
  { rhi: "webgpu", template: "titan-wasteland", expected: "error", unavailable: "adapter" }
);
if (evidenceDir) await mkdir(evidenceDir, { recursive: true });

async function exerciseEnvironment(page) {
  return page.evaluate(async () => {
    const app = window.__acceptanceHost.tools.application;
    const signal = AbortSignal.timeout(90000);
    const observed = [];
    // Exercise the same tool transaction the Agent publishes when its model asks to edit time.
    const edit = app.beginEdit("rhi-acceptance-time", signal);
    const water = edit.tools.find(tool => tool.name === "water.config.get");
    const time = edit.tools.find(tool => tool.name === "time.update");
    await water.execute({}, { signal });
    await time.execute({ timeHours: 21, transitionDuration: 0, waitForIbl: false }, { signal });
    await edit.prepare(signal);
    edit.commit();
    await edit.activate(signal);
    if (app.getTime().timeHours !== 21) throw new Error("Agent time edit was not applied to the scene");
    const presets = [[23, "winter", "snow"], [12, "summer", "rain"], [12, "summer", "storm"], [12, "summer", "clear"]];
    for (const [hours, season, weatherPreset] of presets) {
      await app.updateTime({ timeHours: hours, season, transitionDuration: 0, waitForIbl: false }, signal);
      await app.updateAtmosphere({ weatherPreset, transitionDuration: 0, waitForIbl: false }, signal);
      const time = app.getTime();
      const weather = app.getAtmosphere().environment;
      // Loading particle assets is asynchronous. Check the live emitters as well as the weather channels.
      const deadline = performance.now() + 20000;
      let precipitation;
      while (true) {
        precipitation = window.__acceptanceHost.environment.precipitation;
        const rainActive = precipitation.rainParticlesPerSecond > 0;
        const snowActive = precipitation.snowParticlesPerSecond > 0;
        if (rainActive === (weather.rainIntensity > 0) && snowActive === (weather.snowIntensity > 0)) break;
        if (performance.now() >= deadline) {
          throw new Error(`Weather ${weatherPreset} failed to update precipitation emitters: ${JSON.stringify(precipitation)}`);
        }
        await new Promise(requestAnimationFrame);
      }
      observed.push({ hours: time.timeHours, season: time.season, rain: weather.rainIntensity, snow: weather.snowIntensity,
        rainParticlesPerSecond: precipitation.rainParticlesPerSecond, snowParticlesPerSecond: precipitation.snowParticlesPerSecond });
    }
    return observed;
  });
}

async function exerciseEditHistory(page) {
  return page.evaluate(async () => {
    const parameters = window.__acceptanceHost.tools.parameterDebug;
    const enabled = () => parameters.inspect("world").components.find(item => item.type === "animals").values.enabled;
    const before = enabled();
    const receipt = await parameters.dispatch([{ op: "set", entity: "world", component: "animals", values: { enabled: !before } }]);
    if (receipt.status !== "accepted") throw new Error("Scene edit was rejected");
    const edited = enabled();
    await parameters.undo();
    const undone = enabled();
    await parameters.redo();
    const redone = enabled();
    await parameters.undo();
    return { before, edited, undone, redone, restored: enabled() };
  });
}

async function inspectScene(page) {
  return page.evaluate(async () => {
    const snapshots = window.__acceptanceHost.tools.application.requireViewSnapshots();
    const shot = await snapshots.snapshot(AbortSignal.timeout(60000));
    const { width, height } = shot.image;
    const points = [0.35, 0.5, 0.65, 0.8].flatMap(y =>
      [0.25, 0.5, 0.75].map(x => ({ x: Math.floor(width * x), y: Math.floor(height * y) }))
    );
    const selection = snapshots.pick({ file_path: shot.imagePath, points });
    return { width, height, entities: selection.hits.filter(item => item.hit).map(item => item.hit.ref.entityId) };
  });
}

async function readView(page) {
  return page.evaluate(() => {
    const scene = window.__acceptanceHost.engine.sceneManager.activeScene;
    const camera = scene._componentsManager._activeCameras.get(0);
    const { worldPosition: p, worldRotationQuaternion: q } = camera.entity.transform;
    return [p.x, p.y, p.z, q.x, q.y, q.z, q.w, camera.fieldOfView];
  });
}

async function checkDirector(browser, rhi) {
  const page = await browser.newPage({ viewport: { width: 1152, height: 770 } });
  try {
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    const url = new URL("/world/demos/seed-world/index.html", origin);
    url.search = new URLSearchParams({ debug: "1", template: "original", seed: "20261122", rhi }).toString();
    await page.goto(url.href, { waitUntil: "commit" });
    await page.locator("[data-action=director]").click({ timeout: 120000 });
    await page.locator("[data-d=mask]").check({ timeout: 120000 });
    const canvas = page.locator("canvas[data-semantic-report], canvas[data-semantic-error]").first();
    await canvas.waitFor({ state: "attached", timeout: 60000 });
    const state = await canvas.evaluate(element => ({ ...element.dataset }));
    assert.equal(state.semanticError, undefined);
    assert.equal(state.rhi, rhi);
    const report = JSON.parse(state.semanticReport);
    assert.equal(report.pixels, report.width * report.height);
    assert.ok(report.categories.sky > 0 && report.solidScreen > 0);
    await page.locator("[data-d=close]").click();
    await page.locator("[data-action=generate]").click();
    const world = page.locator("canvas[data-status=ready]");
    await world.waitFor({ state: "attached", timeout: 120000 });
    assert.equal(new URL(page.url()).searchParams.get("rhi"), rhi);
    assert.equal(await world.getAttribute("data-rhi"), rhi);
    const selector = page.locator("select[data-seed-rhi]");
    assert.equal(await selector.inputValue(), rhi);
    await page.waitForFunction(() => /FPS\s+[\d.]+/i.test(document.querySelector("[data-seed-fps]")?.textContent ?? ""));
    const target = rhi === "webgl2" ? "webgpu" : "webgl2";
    const expectedURL = new URL(page.url());
    expectedURL.searchParams.set("rhi", target);
    await selector.selectOption(target);
    await page.waitForURL(expectedURL.href);
    await world.waitFor({ state: "attached", timeout: 120000 });
    assert.equal(await world.getAttribute("data-rhi"), target);
    assert.equal(await selector.inputValue(), target);
    assert.ok((await page.locator("[data-seed-active-rhi]").innerText()).toLowerCase().includes(target));
    assert.deepEqual(errors, []);
    return { pixels: report.pixels, solidScreen: report.solidScreen, worldRhi: rhi, switchedTo: target };
  } finally {
    await page.close();
  }
}

async function checkCase(browser, { rhi, template, expected, unavailable }) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    await page.addInitScript(mode => {
      if (mode === "api") Object.defineProperty(navigator, "gpu", { value: undefined });
      if (mode === "adapter") Object.defineProperty(navigator.gpu, "requestAdapter", { value: async () => null });
      window.__acceptanceGpuErrors = [];
      window.__seedWorldOnDiagnosticHost = host => { window.__acceptanceHost = host; };
      if (mode === "configure") {
        GPUCanvasContext.prototype.configure = () => { throw new Error("WebGPU configuration failed"); };
      }
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(kind, ...args) {
        if (mode === "context" && kind === "webgpu") return null;
        const ctx = original.call(this, kind, ...args);
        if (ctx && this.matches("canvas[data-status]")) this.dataset.observedContext = kind;
        return ctx;
      };
      if (window.GPUAdapter) {
        const requestDevice = GPUAdapter.prototype.requestDevice;
        GPUAdapter.prototype.requestDevice = async function(...args) {
          if (mode === "device") throw new DOMException("Device unavailable", "OperationError");
          const device = await requestDevice.apply(this, args);
          device.addEventListener("uncapturederror", event => window.__acceptanceGpuErrors.push(event.error.message));
          return device;
        };
      }
    }, unavailable);
    const url = new URL("/world/demos/seed-world/index.html", origin);
    url.search = new URLSearchParams({ rhi, template, seed: "20261122", view: "3d", fps: "1" }).toString();
    await page.goto(url.href, { waitUntil: "commit" });
    const canvas = page.locator("canvas[data-status]").first();
    await page.waitForFunction(() => ["ready", "error"].includes(document.querySelector("canvas[data-status]")?.dataset.status), null, { timeout: 150000 });
    const state = await canvas.evaluate(element => ({ ...element.dataset }));
    if (expected === "error") {
      assert.equal(state.status, "error");
      assert.match(state.error ?? "", unavailable === "configure" ? /WebGPU configuration failed/ : /webgpu|adapter/i);
      assert.notEqual(state.observedContext, "webgl2");
      return { error: state.error.split("\n")[0] };
    }
    assert.equal(state.status, "ready", state.error);
    assert.equal(state.rhi, expected);
    assert.equal(state.observedContext, expected);
    assert.equal(await page.locator("select[data-seed-rhi]").count(), 0);
    assert.equal(state.worldTemplate ? JSON.parse(state.worldTemplate).id : "original", template);
    const spawn = JSON.parse(state.spawn);
    assert.ok(Number.isFinite(spawn.x) && Number.isFinite(spawn.z));
    const start = await page.evaluate(() => window.__acceptanceHost.engine.time.frameCount);
    if (evidenceDir) {
      await page.waitForFunction(first => window.__acceptanceHost.engine.time.frameCount >= first + 15, start);
      await page.screenshot({ path: path.join(evidenceDir, [rhi, template, unavailable].filter(Boolean).join("-") + ".jpg") });
    }
    const beforeDrag = await page.evaluate(() => window.__acceptanceHost.engine.time.frameCount);
    const view = await readView(page);
    const box = await canvas.boundingBox();
    await page.mouse.move(box.x + box.width * 0.52, box.y + box.height * 0.48);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.59, box.y + box.height * 0.51, { steps: 8 });
    await page.mouse.up();
    await page.waitForFunction(first => window.__acceptanceHost.engine.time.frameCount >= first + 15, beforeDrag);
    const result = { context: state.observedContext, spawn, view };
    if (template === "titan-wasteland" && rhi !== "auto") {
      result.pick = await inspectScene(page);
      assert.ok(result.pick.entities.length, "Expected a registered scene object in the snapshot");
      result.history = await exerciseEditHistory(page);
      const { before, edited, undone, redone, restored } = result.history;
      assert.deepEqual([edited, undone, redone, restored], [!before, before, !before, before]);
      result.environment = await exerciseEnvironment(page);
      const [night, day, storm, clear] = result.environment;
      assert.ok(night.hours === 23 && night.season === "winter" && night.snow > 0, JSON.stringify(night));
      assert.ok(day.hours === 12 && day.season === "summer" && day.rain > 0, JSON.stringify(day));
      assert.ok(storm.rain > day.rain && storm.snow === 0, JSON.stringify(storm));
      assert.ok(clear.rain === 0 && clear.snow === 0, JSON.stringify(clear));
      await page.waitForFunction(() => document.querySelector("canvas[data-status]").dataset.photoPreparation === "ready");
      // At the fixed 1280 × 800 viewport this point is inside the photo button in the bottom-right HUD.
      await page.mouse.click(box.x + box.width - 53, box.y + box.height - 50);
      await page.waitForFunction(() => document.querySelector("canvas[data-status]").dataset.photoPhase === "editing");
      result.photo = "editing";
    }
    assert.deepEqual(await page.evaluate(() => window.__acceptanceGpuErrors), []);
    assert.deepEqual(errors, []);
    return result;
  } finally {
    await context.close();
  }
}

const browser = await chromium.launch({ channel: "chrome", headless: false });
const initialViews = new Map();
try {
  for (const spec of cases) {
    try {
      const observed = await checkCase(browser, spec);
      if (observed.spawn) {
        const prior = initialViews.get(spec.template);
        if (prior) {
          assert.deepEqual(observed.spawn, prior.spawn);
          assert.ok(observed.view.every((value, i) => Math.abs(value - prior.view[i]) < 1e-5),
            `Startup camera differs for ${spec.template}: ${observed.view} vs ${prior.view}`);
        } else {
          initialViews.set(spec.template, { spawn: observed.spawn, view: observed.view });
        }
      }
      console.log(JSON.stringify({ ...spec, passed: true, ...observed }));
    } catch (error) {
      process.exitCode = 1;
      console.error(JSON.stringify({ ...spec, passed: false, error: error.message }));
    }
  }
  for (const rhi of ["webgl2", "webgpu"]) {
    try {
      const report = await checkDirector(browser, rhi);
      console.log(JSON.stringify({ director: true, rhi, passed: true, ...report }));
    } catch (error) {
      process.exitCode = 1;
      console.error(JSON.stringify({ director: true, rhi, passed: false, error: error.message }));
    }
  }
} finally {
  await browser.close();
}
