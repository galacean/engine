import type { PlanningWorldHandoff } from "./src/planning/spatial/runtime/PlanningWorldSource.ts";
import { selectPlanningStartupTemplate } from "./src/planning/spatial/PlanningStartupTemplate.ts";
import { worldTemplate } from "@galacean/engine-world-planning/spatial/WorldTemplateCatalog";
import { planningPageUrl } from "./src/planning/spatial/PlanningPageUrl.ts";

/** The planning preview and native Seed page have independent renderer lifetimes. */
async function enterSeedWorld(handoff?: PlanningWorldHandoff): Promise<void> {
  document.getElementById("planning-app")?.remove();
  document.body.classList.remove("island-plan-page", "base-map-page");
  document.body.dataset.mode = "world";
  document.body.dataset.pageMode = planningPageUrl().url.searchParams.get("debug") === "1" ? "debug" : "runtime";
  document.title = "Seed World";
  const styles = document.createElement("link");
  styles.rel = "stylesheet";
  styles.href = new URL("./styles.css", import.meta.url).href;
  const loaded = new Promise<void>((resolve, reject) => {
    styles.onload = () => resolve();
    styles.onerror = () => reject(new Error("Seed 样式加载失败"));
  });
  document.head.append(styles);
  const trace = planningPageUrl().url.searchParams.get("agentTrace") === "1";
  const entryTiming = { timeOrigin: performance.timeOrigin, moduleImportStartMs: performance.now(), moduleImportEndMs: 0, stylesReadyMs: 0, mountStartMs: 0 };
  const reportEntry = () => { if (trace) document.body.dataset.seedWorldEntryTiming = JSON.stringify(entryTiming); };
  reportEntry();
  const { mountSeedWorldDemo } = await import("./SeedWorldDemo.ts");
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
  const template = page.url.searchParams.get("template");
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
      const seed = Number(page.url.searchParams.get("seed") ?? "1");
      picker.update(undefined, Number.isSafeInteger(seed) && seed >= 0 && seed <= 0xffffffff ? seed : 1, false);
      picker.open();
    });
    selectPlanningStartupTemplate(choice.id, choice.seed);
    page.url.searchParams.set("seed", String(choice.seed));
    page.url.searchParams.set("template", choice.id || "original");
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
    onGenerate3D: async (plan, session) => {
      if (!session.result || session.pending) throw new Error("规划快照尚未就绪");
      const handoff = { document: session.export(), result: session.result };
      try {
        await editor.dispose();
        styles.remove();
        const page = planningPageUrl();
        const url = page.url;
        url.search = "";
        url.searchParams.set("seed", String(plan.parameters.seed));
        url.searchParams.set("debug", "1");
        url.searchParams.set("view", "3d");
        url.searchParams.set("template", plan.parameters.worldTemplate?.id ?? "original");
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
  message.textContent = "世界暂未加载完成，请刷新重试。已保存的工程不会被覆盖。";
  document.body.append(message);
}

void start().catch(showStartupError);
