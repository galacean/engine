import "./src/installInsecureContextCryptoFallback.ts";
import { seedWorldStorageHost } from "./storage/SeedWorldStorageHost";
import { SharedWorldStorage } from "./storage/SharedWorldStorage";
import type { PlanningWorldHandoff } from "./src/planning/spatial/runtime/PlanningWorldSource.ts";
import { planningStartupSeed, selectPlanningStartupTemplate } from "./src/planning/spatial/PlanningStartupSeed.ts";
import { worldTemplate } from "@galacean/engine-world-planning/spatial/WorldTemplateCatalog";
import {
  appendPreservedDiagParams,
  capturePreservedDiagParams,
  planningPageUrl
} from "./src/planning/spatial/PlanningPageUrl.ts";
import { seedWorldBootTrace } from "./src/SeedWorldBootTrace.ts";

/** The planning preview and native Seed page have independent renderer lifetimes. */
async function enterSeedWorld(handoff?: PlanningWorldHandoff): Promise<void> {
  document.getElementById("planning-app")?.remove();
  document.body.classList.remove("island-plan-page", "base-map-page");
  document.body.dataset.mode = "world";
  const pageUrl = planningPageUrl().url;
  document.body.dataset.pageMode = pageUrl.searchParams.get("debug") === "1" ? "debug" : "runtime";
  document.title = "Seed World";
  const bootTraceParam = pageUrl.searchParams.get("bootTrace") === "1";
  const trace = pageUrl.searchParams.get("agentTrace") === "1" || bootTraceParam;
  seedWorldBootTrace.configure({
    url: pageUrl.href,
    verbose: trace || pageUrl.searchParams.get("debug") === "1",
    autoOpenOverlay: bootTraceParam
  });
  seedWorldBootTrace.phase("entry.enterSeedWorld", 0);
  const styles = document.createElement("link");
  styles.rel = "stylesheet";
  styles.href = new URL("./styles.css", import.meta.url).href;
  const stylesSpan = seedWorldBootTrace.startSpan("entry.styles");
  const loaded = new Promise<void>((resolve, reject) => {
    styles.onload = () => {
      stylesSpan.end();
      resolve();
    };
    styles.onerror = () => {
      const err = new Error("Seed 样式加载失败");
      stylesSpan.fail(err);
      reject(err);
    };
  });
  document.head.append(styles);
  const entryTiming = { timeOrigin: performance.timeOrigin, moduleImportStartMs: performance.now(), moduleImportEndMs: 0, stylesReadyMs: 0, mountStartMs: 0 };
  const reportEntry = () => { if (trace) document.body.dataset.seedWorldEntryTiming = JSON.stringify(entryTiming); };
  reportEntry();
  const { mountSeedWorldDemo } = await seedWorldBootTrace.span("entry.importSeedWorldDemo", () => import("./SeedWorldDemo.ts"));
  entryTiming.moduleImportEndMs = performance.now();
  reportEntry();
  await loaded;
  entryTiming.stylesReadyMs = performance.now();
  entryTiming.mountStartMs = performance.now();
  reportEntry();
  await mountSeedWorldDemo(handoff);
}

async function start(): Promise<void> {
  const page = planningPageUrl();
  const storage = await seedWorldStorageHost();
  let template = page.url.searchParams.get("template");
  const entryTemplate = template === "original" ? template : worldTemplate(template)?.id;
  const saved = storage && await SharedWorldStorage.inspect(storage.db, entryTemplate);
  const seed = saved?.identity?.seed ?? planningStartupSeed(page.url.searchParams);
  let entrySeed = seed;
  let updateUrl = page.url.searchParams.get("seed") !== String(seed);
  if (storage?.readOnly && !saved) {
    const message = document.createElement("p");
    message.style.color = "white";
    message.textContent = "作者尚未保存这个世界。";
    document.body.append(message);
    return;
  }
  if (saved) {
    const savedTemplate = saved.identity?.template;
    if (!saved.checkpoint && entryTemplate) template = entryTemplate;
    else if (savedTemplate && (savedTemplate === "original" || worldTemplate(savedTemplate))) template = savedTemplate;
    else template = worldTemplate(template)?.id ?? "original";
    page.url.searchParams.set("template", template);
    updateUrl = true;
  }
  if (storage?.readOnly) {
    page.url.searchParams.delete("debug");
    updateUrl = true;
  }
  if (template !== "original" && !worldTemplate(template)) {
    document.body.dataset.mode = "template";
    const host = document.createElement("div");
    document.body.append(host);
    const { mountWorldTemplatePicker } = await import("./src/planning/spatial/WorldTemplatePicker.ts");
    const choice = await new Promise<{ id: string; seed: number }>(resolve => {
      const picker = mountWorldTemplatePicker(host, async (id, seed) => {
        resolve({ id, seed });
        queueMicrotask(() => { picker.dispose(); host.remove(); });
      }, undefined, true);
      picker.update(undefined, seed, false);
      picker.open();
    });
    selectPlanningStartupTemplate(choice.id, choice.seed);
    entrySeed = choice.seed;
    page.url.searchParams.set("template", choice.id || "original");
    updateUrl = true;
  }
  if (updateUrl) {
    page.url.searchParams.set("seed", String(entrySeed));
    if (page.canReplaceHistory) history.replaceState(null, "", page.url);
    else {
      const source = document.querySelector<HTMLMetaElement>('meta[name="flash-app-html-url"]');
      if (source) source.content = page.url.href;
    }
  }
  if (planningPageUrl().url.searchParams.get("debug") !== "1" || planningPageUrl().url.searchParams.get("view") === "3d") {
    await enterSeedWorld();
    return;
  }
  document.body.dataset.mode = "planning";
  const styles = document.createElement("link");
  styles.rel = "stylesheet";
  styles.href = new URL("./src/planning/semantic-study/style.css", import.meta.url).href;
  document.head.append(styles);
  const host = document.createElement("main");
  host.id = "planning-app";
  host.innerHTML = '<p class="planning-loading">正在准备空间布局规划…</p>';
  document.body.append(host);
  const { mountWorldLayout } = await import("./src/planning/semantic-study/WorldLayoutEditor.ts");
  const editor = await mountWorldLayout(host, {
    onGenerate3D: async (plan, session, waterResetRequest) => {
      if (!session.result || session.pending) throw new Error("规划快照尚未就绪");
      const handoff = { document: session.export(), result: session.result, waterResetRequest };
      try {
        await editor.dispose();
        styles.remove();
        const page = planningPageUrl();
        const url = page.url;
        const panel = url.searchParams.get("panel") === "1";
        const preserved = capturePreservedDiagParams(url.searchParams);
        url.search = "";
        url.searchParams.set("seed", String(plan.parameters.seed));
        url.searchParams.set("debug", "1");
        url.searchParams.set("view", "3d");
        if (panel) url.searchParams.set("panel", "1");
        url.searchParams.set("template", plan.parameters.worldTemplate?.id ?? "original");
        appendPreservedDiagParams(url.searchParams, preserved);
        if (page.canReplaceHistory) history.replaceState(null, "", url);
        else {
          const source = document.querySelector<HTMLMetaElement>('meta[name="flash-app-html-url"]');
          if (source) source.content = url.href;
        }
        await enterSeedWorld(handoff);
      } catch (error) { showStartupError(error); }
    }
  });
}

function showStartupError(error: unknown): void {
  console.error("Seed World startup", error);
  if (document.getElementById("world-loading")) return;
  const message = document.createElement("p");
  message.style.color = "white";
  message.textContent = "世界暂未加载完成，请刷新重试。已保存的工程不会被覆盖。";
  document.body.append(message);
}

void start().catch(showStartupError);
