import "./src/installInsecureContextCryptoFallback.ts";
import { seedWorldStorageHost } from "./storage/SeedWorldStorageHost";
import { SharedWorldStorage, type WorldSelection } from "./storage/SharedWorldStorage";
import type { PlanningWorldHandoff } from "./src/planning/spatial/runtime/PlanningWorldSource.ts";
import { planningStartupSeed } from "./src/planning/spatial/PlanningStartupSeed.ts";
import { resolveAppTemplate } from "./src/planning/spatial/FlashAppTemplateBinding.ts";
import {
  appendPreservedDiagParams,
  capturePreservedDiagParams,
  planningPageUrl
} from "./src/planning/spatial/PlanningPageUrl.ts";
import { seedWorldBootTrace } from "./src/SeedWorldBootTrace.ts";

/** The planning preview and native Seed page have independent renderer lifetimes. */
async function enterSeedWorld(handoff?: PlanningWorldHandoff, selection?: WorldSelection): Promise<void> {
  document.getElementById("planning-app")?.remove();
  document.body.classList.remove("island-plan-page", "base-map-page");
  document.body.dataset.mode = "world";
  const pageUrl = planningPageUrl().url;
  document.body.dataset.pageMode = pageUrl.searchParams.get("debug") === "1" ? "debug" : "runtime";
  if (!document.title?.trim()) document.title = "Seed World";
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
  await mountSeedWorldDemo(handoff, { storageSelection: selection });
}

async function start(): Promise<void> {
  const page = planningPageUrl();
  const storage = await seedWorldStorageHost();
  const appTemplate = resolveAppTemplate();
  const selection: WorldSelection | undefined = storage && await SharedWorldStorage
    .select(storage.db, storage.appVersion, appTemplate)
    .catch((error) => {
      console.warn("读取世界存档失败，将初始化入口模板", error);
      return { olderApp: false, restoreFailed: true };
    });
  const saved = selection?.raw === undefined ? undefined : selection;
  const readOnly = storage?.readOnly || saved?.olderApp;
  const seed = saved?.identity?.seed ?? planningStartupSeed(page.url.searchParams);
  let updateUrl = page.url.searchParams.get("seed") !== String(seed);
  if (readOnly && !selection?.restoreFailed && (!saved || (saved.olderApp && !saved.identity))) {
    const message = document.createElement("p");
    message.style.color = "white";
    message.textContent = saved?.olderApp ? "世界已更新，请从最新版本打开。" : "作者尚未保存这个世界。";
    document.body.append(message);
    return;
  }
  if (readOnly) {
    page.url.searchParams.delete("debug");
    updateUrl = true;
  }
  if (updateUrl) {
    page.url.searchParams.set("seed", String(seed));
    if (page.canReplaceHistory) history.replaceState(null, "", page.url);
    else {
      const source = document.querySelector<HTMLMetaElement>('meta[name="flash-app-html-url"]');
      if (source) source.content = page.url.href;
    }
  }
  if (planningPageUrl().url.searchParams.get("debug") !== "1" || planningPageUrl().url.searchParams.get("view") === "3d") {
    await enterSeedWorld(undefined, selection);
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
    storageSelection: selection,
    onGenerate3D: async (handoff) => {
      const plan = handoff.result.plan;
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
        appendPreservedDiagParams(url.searchParams, preserved);
        if (page.canReplaceHistory) history.replaceState(null, "", url);
        else {
          const source = document.querySelector<HTMLMetaElement>('meta[name="flash-app-html-url"]');
          if (source) source.content = url.href;
        }
        await enterSeedWorld(handoff, handoff.temporaryStorage ? { olderApp: false, restoreFailed: true } : undefined);
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
