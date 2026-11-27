const fs = require("node:fs/promises");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { createRequire } = require("node:module");
const root = path.resolve(__dirname, "../../../..");
const { chromium } = createRequire(root + "/package.json")("@playwright/test");
const out = process.env.BENCH_OUTPUT;
const url = process.env.BENCH_URL;
const trial = process.env.BENCH_TRIAL;
if (!out || !url || !trial) throw Error("Set BENCH_OUTPUT, BENCH_URL and BENCH_TRIAL");
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const errors = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await context.addInitScript(() => {
      const state = (globalThis.__sceneBenchState = {
        record: false,
        spans: [],
        modes: [],
        plans: [],
        guards: [],
        assets: [],
        frames: [],
        long: [],
        last: 0
      });
      globalThis.__seedWorldOnDiagnosticHost = (host) => {
        globalThis.__sceneBenchHost = host;
      };
      globalThis.__sceneBenchCall = (name, fn) => {
        if (!state.record) return fn();
        const start = performance.now();
        const end = () => state.spans.push({ name, start, end: performance.now() });
        try {
          const value = fn();
          if (value?.then) return value.finally(end);
          end();
          return value;
        } catch (error) {
          end();
          throw error;
        }
      };
      globalThis.__sceneBenchPlan = (plan) => {
        if (state.record) state.plans.push(plan);
      };
      globalThis.__sceneBenchAssets = (paths) => {
        if (state.record) state.assets.push([...paths]);
        return paths;
      };
      globalThis.__sceneBenchGuard = (result) => {
        if (state.record) state.guards.push(result);
      };
      globalThis.__sceneBenchMode = (mode, counts, guard) => {
        if (state.record) state.modes.push({ mode, counts, guard, t: performance.now() });
      };
      const tick = (t) => {
        if (state.record && state.last) state.frames.push({ end: t, dt: t - state.last });
        state.last = t;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      new PerformanceObserver((list) => {
        if (state.record) for (const e of list.getEntries()) state.long.push({ start: e.startTime, ms: e.duration });
      }).observe({ type: "longtask" });
    });
    const page = await context.newPage();
    page.on("pageerror", (e) => {
      errors.push(String(e));
      console.error("PAGEERROR", String(e));
    });
    page.on("console", (m) => {
      if (m.type() === "error") errors.push(m.text().slice(0, 1000));
    });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 120000 });
    try {
      await page.waitForFunction(
        () =>
          (globalThis.__sceneBenchHost?.ready && globalThis.__sceneBenchConfiguration?.definition?.beginEdit) ||
          document.body.innerText.includes("世界加载失败"),
        null,
        { timeout: 240000 }
      );
      if (
        !(await page.evaluate(
          () => !!globalThis.__sceneBenchHost?.ready && !!globalThis.__sceneBenchConfiguration?.definition?.beginEdit
        ))
      )
        throw Error("Seed World startup failed");
    } catch (error) {
      console.error(
        "STARTUP",
        JSON.stringify({
          errors,
          state: await page.evaluate(() => ({
            host: !!globalThis.__sceneBenchHost,
            ready: globalThis.__sceneBenchHost?.ready,
            configuration: !!globalThis.__sceneBenchConfiguration,
            definition: Object.keys(globalThis.__sceneBenchConfiguration?.definition ?? {}),
            text: document.body.innerText.slice(0, 3000)
          }))
        })
      );
      throw error;
    }
    await page.waitForTimeout(10000);
    await page.evaluate(await fs.readFile(path.join(__dirname, "scenario.js"), "utf8"));
    const inventory = await page.evaluate(() => __sceneBench.inventory());
    await fs.mkdir(out, { recursive: true });
    await fs.writeFile(
      path.join(out, trial + "-inventory.json"),
      JSON.stringify({ browser: browser.version(), url, inventory, errors }, null, 2)
    );
    await page.screenshot({ path: path.join(out, trial + "-scene.png") });
    console.log("READY", trial, JSON.stringify(inventory));
    await page.evaluate(() => __sceneBench.setup());
    const idle = await page.evaluate(() => __sceneBench.idle(3000));
    const results = [];
    const caseIdle = {};
    const cases = [
      "add-leaf",
      "add-parent",
      "replace-reference",
      "asset-change",
      "undo",
      "redo",
      "binding-drift",
      "prefab-add",
      "activation-failure",
      "recovery"
    ];
    const selected = process.env.BENCH_CASES ? process.env.BENCH_CASES.split(",") : cases;
    for (const name of selected) {
      await page.evaluate((name) => __sceneBench.select(name), name);
      caseIdle[name] = await page.evaluate(() => __sceneBench.idle(1000));
      const failureCase = name === "activation-failure" || name === "recovery";
      for (let i = failureCase ? 0 : -2; i < (failureCase ? 1 : Number(process.env.BENCH_REPEATS || 8)); i++) {
        let input;
        if (process.env.BENCH_INPUT_HASHES === "1") {
          const snapshot = await page.evaluate(() => __sceneBench.inputSnapshot());
          const ids = new Map([
            ...snapshot.scene.entities.map((e, index) => [e.id, `entity:${index}`]),
            ...snapshot.scene.components.map((c, index) => [c.id, `component:${index}`])
          ]);
          const normalize = (value) => {
            if (typeof value === "string") return ids.get(value) ?? value;
            if (Array.isArray(value)) return value.map(normalize);
            if (value && typeof value === "object")
              return Object.fromEntries(Object.keys(value).sort().map((key) => [key, normalize(value[key])]));
            return value;
          };
          const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
          input = {
            source: hash(snapshot.scene), normalizedSource: hash(normalize(snapshot.scene)),
            namespace: hash(snapshot.files.sort((a,b) => a.virtualPath.localeCompare(b.virtualPath))),
            entities: snapshot.scene.entities.length, components: snapshot.scene.components.length
          };
        }
        const result = await page.evaluate(async ({ name, i }) => __sceneBench.sample(name, i), { name, i });
        if (input) result.input = input;
        results.push(result);
        await fs.writeFile(
          path.join(out, trial + ".json"),
          JSON.stringify(
            { trial, url, browser: browser.version(), inventory, idle, caseIdle, results, errors },
            null,
            2
          )
        );
        console.log(
          "SAMPLE",
          trial,
          name,
          i,
          JSON.stringify({
            stages: result.stages,
            mode: result.modes,
            frameMax: Math.max(0, ...result.frames.map((f) => f.dt)),
            error: result.error,
            verified: result.verified
          })
        );
        if (!result.verified)
          console.error(
            "CHECK_FAILED",
            name,
            JSON.stringify({
              error: result.error,
              authoringRecovered: result.authoringRecovered,
              lifecycle: result.lifecycle,
              expectedLifecycle: result.expectedLifecycle
            })
          );
      }
    }
    await page.screenshot({ path: path.join(out, trial + "-final.png") });
    await fs.writeFile(
      path.join(out, trial + "-complete.json"),
      JSON.stringify(
        {
          trial,
          results: results.length,
          failedChecks: results
            .filter((r) => !r.verified)
            .map((r) => ({ case: r.case, error: r.error, authoringRecovered: r.authoringRecovered })),
          errors
        },
        null,
        2
      )
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
