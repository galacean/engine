import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
const root = path.resolve(import.meta.dirname, "../../..");
const out = path.join(root, "world/.acceptance", process.env.ACCEPTANCE_BROWSER_DIR || "browser");
fs.mkdirSync(out, { recursive: true });
const mapping = JSON.parse(fs.readFileSync(path.join(root, "world/migration/files.json")));
const reverse = new Map(Object.entries(mapping).map(([a, b]) => [b, a]));
const inventory = JSON.parse(fs.readFileSync(path.join(root, "world/demos.json")));
const demos = inventory.filter(
  (d) =>
    (!process.env.DEMO_MODE || d.mode === process.env.DEMO_MODE) &&
    (!process.env.DEMO_FILTER || d.entry.includes(process.env.DEMO_FILTER)) &&
    (!process.env.DEMO_MATCH || new RegExp(process.env.DEMO_MATCH).test(d.entry))
);
const browser = await chromium.launch({
  headless: true,
  args: [
    "--ignore-gpu-blocklist",
    "--use-angle=metal",
    "--disable-background-timer-throttling",
    "--disable-renderer-backgrounding"
  ]
});
const all = [];
for (const demo of demos) {
  const id = demo.entry.replace(/[^a-zA-Z0-9]+/g, "-");
  const resultFile = path.join(out, id + ".json");
  if (fs.existsSync(resultFile) && !process.env.RERUN && JSON.parse(fs.readFileSync(resultFile)).complete !== false) {
    all.push(JSON.parse(fs.readFileSync(resultFile)));
    continue;
  }
  const row = { ...demo, id, runs: [] };
  for (const variant of process.env.ACCEPTANCE_VARIANT
    ? [process.env.ACCEPTANCE_VARIANT]
    : (inventory.filter((item) => item.mode === demo.mode).indexOf(demo) + Number(Boolean(process.env.REVERSE_ORDER))) % 2
      ? ["migrated", "baseline"]
      : ["baseline", "migrated"]) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
      ignoreHTTPSErrors: true
    });
    const page = await context.newPage();
    const errors = [],
      requests = [];
    page.on("pageerror", (e) => {
      if (errors.length < 100) errors.push(String(e));
    });
    page.on("console", (m) => {
      if (m.type() === "error" && errors.length < 100) errors.push(m.text());
    });
    page.on("response", (r) => {
      if (r.status() >= 400 && requests.length < 100) requests.push({ status: r.status(), url: r.url() });
    });
    page.on("requestfailed", (r) => {
      if (requests.length < 100) requests.push({ failure: r.failure(), url: r.url() });
    });
    await page.addInitScript(() => {
      let seed = 193;
      Math.random = () => {
        seed = (Math.imul(1664525, seed) + 1013904223) | 0;
        return (seed >>> 0) / 4294967296;
      };
      const state = (window.__acceptance = {
        frames: [],
        cpu: [],
        draws: 0,
        drawFrames: [],
        contexts: [],
        start: performance.now(),
        active: false
      });
      const raf = window.requestAnimationFrame.bind(window);
      let previous,
        lastStamp,
        frameDraws = 0;
      window.requestAnimationFrame = (callback) =>
        raf((t) => {
          const start = performance.now();
          if (lastStamp !== t) {
            if (state.active && previous !== undefined) {
              state.frames.push(t - previous);
              state.drawFrames.push(state.draws - frameDraws);
            }
            previous = t;
            lastStamp = t;
            frameDraws = state.draws;
          }
          try {
            callback(t);
          } finally {
            if (state.active) state.cpu.push(performance.now() - start);
          }
        });
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) {
        const gl = original.call(this, type, ...args);
        if (gl && /webgl/.test(type) && !state.contexts.includes(gl)) {
          state.contexts.push(gl);
          for (const name of ["drawArrays", "drawElements", "drawArraysInstanced", "drawElementsInstanced"]) {
            if (gl[name]) {
              const fn = gl[name].bind(gl);
              gl[name] = (...a) => {
                state.draws++;
                return fn(...a);
              };
            }
          }
        }
        return gl;
      };
    });
    const url =
      variant === "baseline"
        ? (process.env.BASELINE_ORIGIN || "http://127.0.0.1:5191") +
          "/" +
          (process.env.BASELINE_ENTRY || reverse.get("world/" + demo.entry)) +
          (process.env.DEMO_QUERY || "")
        : (process.env.MIGRATED_ORIGIN || "http://127.0.0.1:5192") +
          "/world/" +
          demo.entry +
          (process.env.DEMO_QUERY || "");
    const result = { variant, url, errors, requests };
    const action = {
      "demos/building-components/native-access.html": {
        button: "#run",
        done: "nativeAccessDone",
        error: "nativeAccessError",
        result: "nativeAccessResults",
        finite: true
      },
      "demos/building-components/validation.html": {
        button: "#run",
        done: "crDone",
        error: "crError",
        result: "crResults",
        finite: true
      },
      "demos/building-components/presets.html": { button: "#verify", done: "presetResult", result: "presetResult" },
      "demos/building-components/generated.html": {
        button: "#verify",
        done: "generatedBuildingResult",
        result: "generatedBuildingResult"
      }
    }[demo.entry];
    const started = Date.now();
    console.log("START", demo.entry, variant);
    let deadline;
    try {
      await Promise.race([
        (async () => {
          await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
          // Wait for compilation, assets, and first draws, bounded for UI-only/service pages.
          if (demo.entry === "demos/agent-trajectory/index.html") {
            // Let Vite finish its initial dependency reload before importing user data.
            await page.waitForTimeout(10000);
            const { exampleTrace } = await import(
              path.join(root, "world/.acceptance/tests/demos/agent-trajectory/tests/fixture.ts")
            );
            await page.locator('input[type="file"]').setInputFiles({
              name: "acceptance-example.json",
              mimeType: "application/json",
              buffer: Buffer.from(JSON.stringify(exampleTrace()))
            });
            await page.locator("tr[data-record-index]").first().waitFor({ timeout: 30000 });
            result.action = "Import the original deterministic offline Trace fixture (no LLM request)";
            result.functional = { rows: await page.locator("tr[data-record-index]").count() };
          }
          if (action) {
            await page.locator(action.button).click({ timeout: 120000 });
            result.action = "Run the Demo's built-in acceptance checks";
            await page.waitForFunction((a) => !!window[a.done] || (a.error && !!window[a.error]), action, {
              timeout: 180000
            });
            result.functional = await page.evaluate(
              (a) => ({
                done: !!window[a.done],
                error: a.error ? window[a.error] : window[a.result]?.error,
                result: window[a.result]
              }),
              action
            );
            if (result.functional.error || result.functional.result?.ok === false)
              errors.push("Built-in acceptance failed: " + (result.functional.error || "false result"));
          }
          await page.waitForTimeout(10000);
          if (demo.entry === "demos/animals/roaming/index.html") {
            await page.waitForFunction(
              () => document.querySelector("#status")?.textContent?.startsWith("100 个角色已加载"),
              {},
              { timeout: 180000 }
            );
            await page.waitForTimeout(10000);
            result.functional = { loadedAnimals: 100, autonomousMotion: true };
          }
          if (
            !action?.finite &&
            ![
              "demos/agent-trajectory/index.html",
              "demos/canyon-shape-study/index.html",
              "demos/landform-study/index.html",
              "demos/free-control-pitch-repro/index.html",
              "demos/seed-world/dev/scene-visual-intent/index.html",
              "demos/seed-world/dev/loading-preview.html",
              "demos/tree-reconstruction/index.html"
            ].includes(demo.entry)
          )
            await page
              .waitForFunction(
                () => window.__acceptance.draws > 30 || !!window.terrainDemoError || !!window.assetAssemblyError,
                {},
                { timeout: 45000 }
              )
              .catch(() => {});
          const readiness = {
            "demos/seed-world/index.html": "seed",
            "demos/seed-world/dev/planning/index.html": "seed",
            "demos/integrated-world/index.html": "terrain",
            "demos/vegetation/index.html": "vegetation",
            "demos/wind-tree/index.html": "wind",
            "demos/wind-tree/benchmark.html": "wind",
            "demos/rain-wind/index.html": "rain",
            "demos/water/island/index.html": "water",
            "demos/water/ocean/index.html": "water",
            "demos/water/planner/index.html": "water",
            "demos/seed-world/dev/loading-preview.html": "loading"
          }[demo.entry];
          if (readiness) {
            await page
              .waitForFunction(
                (kind) => {
                  if (kind === "seed")
                    return (
                      document.body.dataset.worldReady === "true" ||
                      document.querySelector('canvas[data-status="error"]')
                    );
                  if (kind === "terrain") return window.terrainDemo?.ready || window.terrainDemoError;
                  if (kind === "vegetation") return window.assetAssembly?.ready || window.assetAssemblyError;
                  if (kind === "wind") return window.windVegetationTest?.ready || window.windVegetationTestError;
                  if (kind === "rain") return window.rainWindLab?.ready || window.rainWindLabError;
                  if (kind === "water") return document.body.dataset.ready === "true";
                  if (kind === "loading") return !document.querySelector("#loading-canvas");
                },
                readiness,
                { timeout: 180000 }
              )
              .catch((e) => {
                result.readinessTimeout = String(e);
              });
            if (readiness === "water" && !process.env.SMOKE_ONLY) await page.waitForTimeout(10000);
          }
          if (process.env.WIND_GATES && demo.entry === "demos/wind-tree/benchmark.html") {
            result.benchmarks = {};
            for (const method of ["runAssetPerformanceAcceptance", "runWindPerformanceComparison"]) {
              console.log("BENCHMARK", variant, method);
              result.benchmarks[method] = await page.evaluate((name) => window.windVegetationTest[name](), method);
              console.log("BENCHMARK DONE", variant, method);
            }
          }
          result.readiness = await page.evaluate(() => ({
            worldReady: document.body.dataset.worldReady,
            bodyReady: document.body.dataset.ready,
            canvasStates: [...document.querySelectorAll("canvas")].map((c) => ({
              status: c.dataset.status,
              error: c.dataset.error,
              terrainStatus: c.dataset.terrainStatus,
              terrainError: c.dataset.terrainError
            })),
            terrain: window.terrainDemo?.ready,
            vegetation: window.assetAssembly?.ready,
            wind: window.windVegetationTest?.ready,
            rain: window.rainWindLab?.ready
          }));
          result.loadMs = Date.now() - started;
          console.log("LOADED", demo.entry, variant, result.loadMs, result.readiness);
          const cdp = await context.newCDPSession(page);
          await cdp.send("Performance.enable");
          const before = await cdp.send("Performance.getMetrics");
          await page.evaluate(() => {
            window.__acceptance.active = true;
            window.__acceptance.frames = [];
            window.__acceptance.cpu = [];
            window.__acceptance.drawFrames = [];
            window.__acceptance.engineCpu = [];
          });
          result.windows = [];
          for (let interval = 0; interval < (process.env.SMOKE_ONLY || action?.finite ? 0 : 3); interval++) {
            const sizes = await page.evaluate(() => ({
              frames: window.__acceptance.frames.length,
              cpu: window.__acceptance.engineCpu.length
            }));
            await page.waitForTimeout(5000);
            result.windows.push(
              await page.evaluate((sizes) => {
                const stats = (a) => {
                  a = a.filter(Number.isFinite).sort((x, y) => x - y);
                  return {
                    count: a.length,
                    median: a[Math.floor(a.length * 0.5)] ?? null,
                    p95: a[Math.floor(a.length * 0.95)] ?? null,
                    mean: a.reduce((x, y) => x + y, 0) / (a.length || 1)
                  };
                };
                return {
                  frameMs: stats(window.__acceptance.frames.slice(sizes.frames)),
                  engineCpuMs: stats(window.__acceptance.engineCpu.slice(sizes.cpu))
                };
              }, sizes)
            );
          }
          const after = await cdp.send("Performance.getMetrics");
          result.metrics = await page.evaluate(() => {
            const s = window.__acceptance;
            s.active = false;
            const stats = (a) => {
              a = a.filter(Number.isFinite).sort((x, y) => x - y);
              return {
                count: a.length,
                median: a[Math.floor(a.length * 0.5)] ?? null,
                p95: a[Math.floor(a.length * 0.95)] ?? null,
                mean: a.reduce((x, y) => x + y, 0) / (a.length || 1)
              };
            };
            return {
              frameMs: stats(s.frames),
              callbackCpuMs: stats(s.cpu),
              engineCpuMs: stats(s.engineCpu || []),
              engineCount: window.__acceptanceEngines?.length || 0,
              drawCallsPerFrame: stats(s.drawFrames),
              totalDraws: s.draws,
              canvases: [...document.querySelectorAll("canvas")].map((c) => ({
                width: c.width,
                height: c.height,
                cssWidth: c.clientWidth,
                cssHeight: c.clientHeight,
                visible: c.getClientRects().length > 0 && getComputedStyle(c).visibility !== "hidden"
              })),
              gpu: s.contexts.map((gl) => {
                const e = gl.getExtension("WEBGL_debug_renderer_info");
                return {
                  renderer: e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
                  vendor: e ? gl.getParameter(e.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR),
                  lost: gl.isContextLost()
                };
              }),
              text: document.body.innerText.slice(0, 5000),
              runtimeErrors: ["terrainDemoError", "assetAssemblyError", "promptNoiseWorldDemoError"].map((k) => [
                k,
                String(window[k] || "")
              ])
            };
          });
          if (
            !action?.finite &&
            demo.entry !== "demos/seed-world/dev/loading-preview.html" &&
            result.metrics.totalDraws > 30 &&
            !result.metrics.canvases.some((canvas) => canvas.visible && canvas.cssWidth > 0 && canvas.cssHeight > 0)
          ) {
            errors.push("Rendering produced draw calls but no canvas is visible");
          }
          for (const canvas of result.readiness.canvasStates) {
            if (canvas.error || canvas.terrainError || canvas.status === "error" || canvas.terrainStatus === "failed")
              errors.push("Canvas reported failure: " + JSON.stringify(canvas));
          }
          for (const [name, message] of result.metrics.runtimeErrors) {
            if (message) errors.push(name + ": " + message);
          }
          const a = Object.fromEntries(after.metrics.map((x) => [x.name, x.value])),
            b = Object.fromEntries(before.metrics.map((x) => [x.name, x.value]));
          result.metrics.cdp = {
            taskSeconds: a.TaskDuration - b.TaskDuration,
            scriptSeconds: a.ScriptDuration - b.ScriptDuration,
            heapUsedBytes: a.JSHeapUsedSize,
            domNodes: a.Nodes
          };
          // SSR provides a fixed simulation time specifically for visual acceptance.
          if (demo.entry === "demos/screen-space-reflection/index.html") {
            await page.evaluate(() => {
              window.ssrDemo?.freezeTime(true);
              window.ssrDemo?.setCameraPose("acceptance");
            });
            await page.waitForTimeout(1500);
            result.captureMode = "SSR fixed acceptance time and camera";
          } else result.captureMode = "default view after readiness; animated time is not synchronized";
          if (demo.entry === "demos/agent-trajectory/index.html") {
            result.functional.finalRows = await page.locator("tr[data-record-index]").count();
            if (result.functional.finalRows !== 6) errors.push("Imported Trace records did not remain visible");
          }
          const shot = path.join(out, id + "-" + variant + ".png");
          await page.screenshot({ path: shot, timeout: 30000 });
          result.screenshot = path.relative(root, shot);
        })(),
        new Promise((_, reject) => {
          deadline = setTimeout(
            () => reject(new Error("Demo acceptance exceeded its deadline")),
            Number(process.env.RUN_TIMEOUT_MS || 300000)
          );
        })
      ]);
    } catch (e) {
      result.fatal = String(e);
      await page
        .screenshot({ path: path.join(out, id + "-" + variant + "-error.png"), timeout: 10000 })
        .catch(() => {});
    }
    clearTimeout(deadline);
    row.runs.push(result);
    fs.writeFileSync(resultFile, JSON.stringify({ ...row, complete: false }, null, 2));
    await context.close();
  }
  row.complete = true;
  fs.writeFileSync(resultFile, JSON.stringify(row, null, 2));
  all.push(row);
  console.log(
    demo.entry,
    row.runs.map((r) => ({
      variant: r.variant,
      draws: r.metrics?.totalDraws,
      errors: r.errors.length,
      failedRequests: r.requests.length,
      fatal: r.fatal
    }))
  );
}
await browser.close();
fs.writeFileSync(path.join(out, "summary.json"), JSON.stringify(all, null, 2));
