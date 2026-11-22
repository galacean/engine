const fs = require("node:fs/promises");
const path = require("node:path");
const { createRequire } = require("node:module");
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const root = path.resolve(__dirname, "../../../..");
const { chromium } = createRequire(root + "/package.json")("@playwright/test");
const { instrument, files } = require("./instrument.cjs");
const out = process.env.AUDIT_OUTPUT;
if (!out) throw Error("Set AUDIT_OUTPUT to an evidence directory outside the repository");
const demo =
  process.env.AUDIT_URL ||
  "http://127.0.0.1:4174/world/demos/seed-world/index.html?template=original&seed=1&aiChat=1&agentTrace=1";
(async () => {
  await fs.mkdir(out, { recursive: true });
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const errors = [],
    hooks = [];
  try {
    const changed = execFileSync("git", ["ls-files", "-m", "-o", "--exclude-standard", "-z"], {
      cwd: root,
      encoding: "utf8"
    })
      .split("\0")
      .filter(Boolean);
    const hashes = {};
    for (const file of changed)
      hashes[file] = createHash("sha256")
        .update(await fs.readFile(path.join(root, file)))
        .digest("hex");
    await fs.writeFile(
      path.join(out, "manifest.json"),
      JSON.stringify(
        {
          startedAt: new Date().toISOString(),
          url: demo,
          viewport: { width: 1280, height: 800 },
          browser: browser.version(),
          head: execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim(),
          dirtyFileSha256: hashes,
          caseFile: process.env.AUDIT_CASES,
          measurement:
            "Instrumented headless Chrome; wall time includes asynchronous waits. Public tools use the real AgentLoop with deterministic model-turn dispatch. No model calls."
        },
        null,
        2
      )
    );
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    await context.addInitScript({ path: path.join(__dirname, "observe.js") });
    await context.addInitScript(() => {
      window.__seedWorldOnDiagnosticHost = (host) => {
        window.__diag = host;
      };
      window.__sourceWrites = [];
      window.__auditStages = [];
      window.__auditSync = (name, fn) => {
        const start = performance.now();
        try {
          return fn();
        } finally {
          __auditStages.push({ name, start, ms: performance.now() - start });
        }
      };
    });
    const direct = await fs.readFile(path.join(__dirname, "direct-execute.js"), "utf8");
    const publicDispatch = await fs.readFile(path.join(__dirname, "public-dispatch.js"), "utf8");
    for (const file of new Set([...files, "SeedWorldDemo.ts", "SeedWorldChatPanel.ts", "agent-types.ts"])) {
      await context.route("**/" + file + "*", async (route) => {
        try {
          const response = await route.fetch();
          let body = await response.text();
          const result = instrument(body, file);
          body = result.body;
          hooks.push({ file, hits: result.hits });
          if (file === "SeedWorldDemo.ts") {
            if (!body.includes("__seedWorldOnDiagnosticHost")) {
              const anchor = "pickPreparation = new RuntimePickPreparation(engine)";
              if (!body.includes(anchor)) throw Error("Missing engine anchor");
              body = body.replace(
                anchor,
                "window.__diag={engine,get tools(){return tools},get ready(){return ready},get animals(){return animals},get current(){return publication?.current}};" +
                  anchor
              );
            }
            const publication = "const preparePublicationContent = async (document2, result, context) => {";
            if (body.includes(publication))
              body = body.replace(
                publication,
                publication +
                  "(globalThis.__auditPublications??=[]).push({phase:globalThis.__checksPhase,t:performance.now(),execution:result.execution,worldUnchanged:context.worldUnchanged,contentOnly:context.contentOnly,forceFull:context.forceFull});"
              );
          }
          if (file === "SeedWorldChatPanel.ts") {
            if (!body.includes("agent: new AgentLoop(")) throw Error("Missing AgentLoop anchor");
            body = body.replace("agent: new AgentLoop(", "agent: window.__auditAgent = new AgentLoop(");
            body = body.replace(
              "const session = new AIChatSession(",
              "window.__auditConfiguration=configuration;const session = new AIChatSession("
            );
          }
          if (file === "agent-loop.ts") {
            if (!body.includes("async #executeTool(")) throw Error("Missing executeTool anchor");
            body = body.replace("async #executeTool(", direct + "\nasync #executeTool(");
            if (!body.includes("async #requestModelTurn(input) {")) throw Error("Missing public dispatch anchor");
            body = body.replace(
              "async #requestModelTurn(input) {",
              "async #requestModelTurn(input) {" + publicDispatch
            );
            body = body.replace(
              "tool.parseInput(rawInput)",
              "globalThis.__auditSync('input:'+toolName,()=>tool.parseInput(rawInput))"
            );
            body = body.replace(
              "tool.parseOutput(value)",
              "globalThis.__auditSync('output:'+toolName,()=>tool.parseOutput(value))"
            );
          }
          if (file === "agent-types.ts") {
            if (!body.includes("function defineTool(definition) {")) throw Error("Missing defineTool anchor");
            body = body.replace(
              "function defineTool(definition) {",
              "function defineTool(definition) { (globalThis.__auditToolSchemas ??= new Map()).set(definition.name,definition.input);"
            );
            body +=
              '\nglobalThis.__auditDescribeSchemas=()=>Object.fromEntries([...globalThis.__auditToolSchemas].map(([name,schema])=>{try{return [name,schema.toJSONSchema({unrepresentable:"any"})]}catch(error){return [name,{error:String(error)}]}}));';
          }
          await route.fulfill({ response, body });
        } catch (error) {
          errors.push({ hook: file, error: String(error) });
          await route.abort().catch(() => {});
        }
      });
    }
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push({ page: String(error) }));
    const cdp = await context.newCDPSession(page);
    await page.goto(demo, { waitUntil: "domcontentloaded", timeout: 120000 });
    await page.waitForFunction(() => window.__diag?.ready && window.__auditAgent, null, { timeout: 180000 });
    await page.waitForTimeout(10000);
    await page.evaluate(await fs.readFile(path.join(__dirname, "engine.js"), "utf8"));
    await page.evaluate(() => {
      __checks.deep = false;
      window.__auditPauses = [];
      for (const key of ["pause", "resume"]) {
        const original = __diag.engine[key];
        __diag.engine[key] = function (...args) {
          __auditPauses.push({ key, t: performance.now(), phase: __checksPhase });
          return original.apply(this, args);
        };
      }
    });
    const inventory = await page.evaluate(() => ({
      tools: __auditConfiguration.definition.toolNames.map((name) => ({
        name,
        effect: __auditConfiguration.tools.find((t) => t.name === name)?.effect
      })),
      publicTools: __auditAgent.auditPublicInventory(),
      components: __auditConfiguration.definition.editorComponents,
      modules: __auditConfiguration.definition.scriptApi.modules,
      schemas: __auditDescribeSchemas(),
      scene: __diag.tools.options.nativeEditor.editor.project.projectPackage.project.scene,
      runtimeRoot: __diag.engine.sceneManager.activeScene.rootEntities[0].instanceId,
      animals: __diag.animals.runtime.population.actors.length
    }));
    await fs.writeFile(path.join(out, "inventory.json"), JSON.stringify(inventory, null, 2));
    await page.evaluate(() => {
      __checks.record = true;
      __checksPhase = "idle-baseline";
    });
    await page.waitForTimeout(5000);
    await fs.writeFile(
      path.join(out, "idle-baseline.json"),
      JSON.stringify(
        await page.evaluate(() => {
          __checks.record = false;
          return {
            engine: __engineTimes.filter((x) => x.phase === "idle-baseline"),
            long: __checks.long.filter((x) => x.phase === "idle-baseline")
          };
        }),
        null,
        2
      )
    );
    console.log(
      "INVENTORY",
      inventory.tools.length,
      inventory.components.map((x) => ({ type: x.type, methods: Object.keys(x.methods) }))
    );
    const jobs = process.env.AUDIT_CASES
      ? JSON.parse(await fs.readFile(process.env.AUDIT_CASES, "utf8"))
      : [
          {
            id: "smoke-time-get",
            tool: "time.get",
            source:
              'const result=await tools.time.get(); if(!Number.isFinite(result.timeHours))throw Error("Missing time");return result;'
          }
        ];
    const results = [];
    for (const job of jobs) {
      job.source = (job.source ?? "").replaceAll("__RUNTIME_ROOT__", String(inventory.runtimeRoot));
      if (job.waitUntil) {
        const started = Date.now(),
          polls = [];
        while (true) {
          const result = await page.evaluate(async (job) => {
            __checks.record = false;
            __checksPhase = "fixture-wait:" + job.id;
            return await __auditAgent.auditExecute(job.waitUntil, "audit:wait:" + job.id);
          }, job);
          polls.push({ elapsedMs: Date.now() - started, result });
          await fs.writeFile(path.join(out, job.id + "-fixture-wait.json"), JSON.stringify(polls, null, 2));
          if (result.ok && result.output?.ready === true) break;
          if (!result.ok || Date.now() - started > (job.waitTimeoutMs ?? 180000))
            throw Error("Fixture not ready for " + job.id + ": " + JSON.stringify(result));
          console.log("FIXTURE_WAIT", job.id, Date.now() - started);
          await page.waitForTimeout(10000);
        }
      }
      const beforeErrors = errors.length;
      if (job.profile) {
        await cdp.send("Profiler.enable");
        await cdp.send("Profiler.start");
      }
      const data = await page.evaluate(async (job) => {
        __checks.record = false;
        __checksPhase = job.id;
        __checks.totals = {};
        __checks.spans = [];
        __checks.long = [];
        __checks.frames = [];
        __auditStages = [];
        __auditTrace = undefined;
        const precedingFrame = window.__lastEngineFrame;
        __checks.record = true;
        const start = performance.now();
        const result = job.publicPlan
          ? await __auditAgent.auditPublic(job.publicPlan, "audit:" + job.id)
          : await __auditAgent.auditExecute(job.source, "audit:" + job.id);
        const end = performance.now();
        await new Promise((r) => setTimeout(r, 1500));
        __checks.record = false;
        return {
          job,
          result,
          start,
          end,
          wallMs: end - start,
          stages: __auditStages,
          trace: __auditTrace,
          engine: [
            ...(precedingFrame ? [{ ...precedingFrame, boundary: true }] : []),
            ...__engineTimes.filter((x) => x.phase === job.id)
          ],
          frames: __checks.frames,
          long: __checks.long,
          spans: __checks.spans,
          totals: Object.values(__checks.totals),
          workers: __workerLifecycle.filter((x) => x.phase === job.id),
          checker: __checksWorkers.filter((x) => x.phase === job.id),
          checkerWorker: __checksWorkerResults.filter((x) => x.phase === job.id),
          publications: (globalThis.__auditPublications ?? []).filter((x) => x.phase === job.id),
          sourceWrites: __sourceWrites.filter((x) => x.phase === job.id),
          pauses: __auditPauses.filter((x) => x.phase === job.id),
          gpu: __gpuTimes.filter((x) => x.phase === job.id),
          gl: __glBlocking.filter((x) => x.phase === job.id),
          loaf: __loaf.filter((x) => x.phase === job.id),
          dataset: { ...document.querySelector("#world-canvas").dataset }
        };
      }, job);
      data.pageErrors = errors.slice(beforeErrors);
      if (job.profile) {
        const { profile } = await cdp.send("Profiler.stop");
        await fs.writeFile(path.join(out, job.id + ".cpuprofile"), JSON.stringify(profile));
        await cdp.send("Profiler.disable");
      }
      const primary = data.trace?.toolCalls?.filter((x) => x.tool === job.tool) ?? [];
      data.primaryExecuted =
        primary.length > 0 && primary.every((x) => x.result.ok && !x.result.receipt?.runtimeErrors?.length);
      if (job.verify && data.result.ok)
        data.verification = await page.evaluate(async (job) => {
          __checks.record = false;
          __checksPhase = "verify:" + job.id;
          return await __auditAgent.auditExecute(job.verify, "audit:verify:" + job.id);
        }, job);
      data.passed =
        data.result.ok &&
        !data.result.receipt?.runtimeErrors?.length &&
        data.primaryExecuted &&
        !data.pageErrors.length &&
        (!job.verify || (data.verification?.ok === true && !data.verification.receipt?.runtimeErrors?.length));
      results.push({
        id: job.id,
        tool: job.tool,
        ok: data.result.ok,
        passed: data.passed,
        wallMs: data.wallMs,
        error: data.result.error
      });
      await fs.writeFile(path.join(out, job.id + ".json"), JSON.stringify(data, null, 2));
      console.log(
        "CASE",
        job.id,
        JSON.stringify({
          ok: data.result.ok,
          receipt: data.result.receipt,
          error: data.result.error,
          wallMs: data.wallMs,
          maxLongMs: Math.max(0, ...data.long.map((x) => x.ms))
        })
      );
    }
    await fs.writeFile(path.join(out, "results.json"), JSON.stringify(results, null, 2));
    await page.screenshot({ path: path.join(out, "scene.png") });
    console.log("DONE");
  } finally {
    await fs.writeFile(path.join(out, "errors.json"), JSON.stringify(errors, null, 2));
    await fs.writeFile(path.join(out, "hooks.json"), JSON.stringify(hooks, null, 2));
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
