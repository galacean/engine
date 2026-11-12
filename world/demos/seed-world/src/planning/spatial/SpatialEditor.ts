import { MOJAVE_ROCK_GROUPS } from "@galacean/engine-world-planning/spatial/layout/MojaveDesertLayout";
import { applyPlanningTemplateSurface, initialPlanningTemplate } from "./PlanningStartupTemplate.ts";
import { planningFarmingProjectStatePath } from "./farming/PlanningFarmingScene.ts";
import { PlanningFarmRepository } from "./farming/PlanningFarmRepository.ts";
import { planningFarmId, resetPlanningFarmSaveChoice } from "./farming/PlanningFarmSave.ts";
import { openSeedWorldProject } from "../../../SeedWorldProject.ts";
import { clearSeedWorldPlayerSave } from "../../../SeedWorldPlayerSave.ts";
import { PlanningProjectStorage } from "./runtime/PlanningProjectStorage.ts";
import { seedWorldProjectFormats } from "../../../SeedWorldProjectFormats.ts";
import { createSeedWorldProjectClose } from "../../../SeedWorldProjectClose.ts";
import { planningSourceDocument, retainPlanningWaterSource } from "./runtime/PlanningProjectSource.ts";
import { exportPlanningScene, importPlanningScene } from "./PlanningSceneAsset.ts";
import { createWorldStylePlanningDocument, removeDesertCamelPreset, worldTemplatePaletteValues } from "@galacean/engine-world-planning/spatial/WorldTemplateAuthoring";
import { mountWorldTemplatePicker } from "./WorldTemplatePicker.ts";
import { wayfindingPolicy } from "@galacean/engine-world-planning/spatial/guidance/WayfindingPolicy";
import { wayfindingHighlights } from "./guidance/WayfindingHighlights.ts";
import { planningRegistry } from "@galacean/engine-world-planning/spatial/PlanningComponents";
import { formatSpatialFieldValue } from "./SpatialFieldValue.ts";
import { planningOverview } from "./PlanningOverview.ts";
import { mountDirectorPanel } from "./director/DirectorPanel.ts";
import { IslandPlanView } from "@galacean/engine-world-planning/semantic-study/IslandPlanView";
import { mountPlanningLayerTree, type LayerNode } from "../semantic-study/PlanningLayerTree.ts";
import { PlanningWorkerClient } from "../semantic-study/PlanningWorkerClient.ts";
import { readSemanticParameters, ownerOf, type WorldPlanningHandle, type WorldPlanningOptions } from "../semantic-study/WorldLayoutEditor.ts";
import type { IslandPlan } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel";
import { PlanningSession, type EditReceipt } from "@galacean/engine-world-planning/spatial/PlanningSession";
import { planningSeedURL } from "./PlanningDocumentCodec.ts";
import { planningPageUrl } from "./PlanningPageUrl.ts";
import { resolveSceneSelection } from "@galacean/engine-world-planning/spatial/PlanningScene";
import { exportPlanningRecipe, type PlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningDocument";
import { mountSpatialInspector } from "./SpatialInspector.ts";
import { showPoiSizePreview } from "./PoiSizeEditor.ts";
import type { SpatialCommand } from "@galacean/engine-world-planning/spatial/SpatialDocument";
import "../../../../../../packages/world-planning/src/semantic-study/BaseMap.css";
import "../semantic-study/WorldPlanning.css";
import "./SpatialEditor.css";
/** Editor shell projects one session. It neither generates geometry nor owns parameter definitions. */
export async function mountSpatialEditor(
  host: HTMLElement,
  options: WorldPlanningOptions = {}
): Promise<WorldPlanningHandle> {
  const startupStarted = performance.now();
  document.body.classList.add("island-plan-page", "base-map-page");
  document.title = "空间规划编辑器";
  const root = document.createElement("div");
  root.className = "island-plan-editor base-map-editor world-layout-editor world-planning-editor spatial-editor";
  root.inert = true;
  root.innerHTML = `<aside class="ip-sidebar sp-hierarchy"><header class="ip-brand"><h1>空间规划</h1><p data-ui="poi-summary" aria-live="polite"></p><dl data-ui="summary" class="sp-layout-statistics" aria-label="最终布局统计"></dl><p data-ui="area-statistics" class="sp-selected-statistics"></p><p data-ui="selected-statistics" class="sp-selected-statistics" hidden></p><a data-ui="visual-intent" target="_blank" rel="noopener">场景视觉意图 ↗</a></header><section data-ui="hierarchy"><div data-ui="layers"></div></section></aside><main class="ip-workspace"><header class="ip-topbar"><span data-ui="revision"></span><span data-ui="progress" role="status" hidden></span><nav aria-label="规划视图"><button data-action="open">打开工程</button><input data-ui="file" type="file" accept="application/json,.json,.scene" hidden><button data-action="save">导出工程</button><button data-action="clear" title="恢复当前工程的默认规划参数，保留场景与其他资产">重置规划参数</button><button data-action="fit">全图</button><button data-action="plan" aria-pressed="true">俯视</button><button data-action="oblique" aria-pressed="false">白盒测试</button><button data-action="director" aria-pressed="false" disabled>导演</button><button data-action="generate">生成 3D</button></nav></header><div class="ip-viewport" data-ui="viewport"></div></main><aside class="ip-sidebar sp-inspector"><nav class="sp-tabs"><button data-tab="inspector">Inspector</button><button data-tab="world">全局规划</button><button data-tab="wayfinding">心理地图</button><button data-tab="lighting">光照与后处理</button><button data-tab="display">辅助显示</button><button data-tab="diagnostics">诊断</button></nav><section data-ui="world-save" class="sp-world-save" hidden><button data-action="clear-save" type="button">清空存档</button><p>清除当前 Seed 的视角和离地高度，保留规划、建筑与农场。</p><p data-ui="world-save-status" role="status" hidden></p></section><div data-ui="inspector"></div><section data-ui="display" aria-label="辅助显示" hidden><div data-ui="display-layers"></div></section><section data-ui="diagnostics" hidden><p role="status" data-ui="status" class="sp-status" hidden></p><p data-ui="flower-diagnostics"></p><pre data-ui="checks"></pre></section></aside>`;
  host.replaceChildren(root);
  const ui = <T extends HTMLElement = HTMLElement>(id: string) => root.querySelector<T>(`[data-ui="${id}"]`)!;
  const button = (id: string) => root.querySelector<HTMLButtonElement>(`[data-action="${id}"]`)!;
  button("generate").hidden = !options.onGenerate3D;
  button("generate").disabled = true;
  const pageUrl = planningPageUrl();
  const query = pageUrl.url.searchParams;
  const parameters = readSemanticParameters(`?seed=${query.get("seed") ?? ""}`);
  const project = await openSeedWorldProject(pageUrl.url);
  const storage = new PlanningProjectStorage(project, seedWorldProjectFormats);
  let farmSaveSeed: number | undefined;
  let farmSaveLabel = "使用当前 Seed 的存档";
  let farmSaveRequest = 0;
  async function updateFarmSaveChoice() {
    const seed = session.recipe().parameters.seed;
    const show = () => {
      const choice = root.querySelector<HTMLOptionElement>('select[data-component="farming"][data-field="saveMode"] option[value="auto"]');
      if (choice) choice.textContent = farmSaveLabel;
    };
    if (seed === farmSaveSeed) { show(); return; }
    farmSaveSeed = seed;
    farmSaveLabel = "正在读取当前 Seed 的存档…";
    show();
    const request = ++farmSaveRequest;
    let owner: Awaited<ReturnType<typeof openSeedWorldProject>> | undefined;
    let repository: PlanningFarmRepository | undefined;
    try {
      const url = new URL(pageUrl.url); url.searchParams.set("seed", String(seed));
      owner = planningSourceDocument(project.projectPackage) || seed === parameters.seed ? undefined : await openSeedWorldProject(url);
      const path = planningFarmingProjectStatePath(owner ?? project);
      if (!path) { farmSaveLabel = "未绑定农场存档"; show(); return; }
      repository = new PlanningFarmRepository(owner ?? project, undefined, path);
      const saved = await repository.read(planningFarmId(seed));
      if (request !== farmSaveRequest || disposed) return;
      farmSaveLabel = saved ? `使用已有存档（Seed ${seed}）` : `无存档（Seed ${seed}，按规划生成）`;
    } catch (error) {
      if (request !== farmSaveRequest || disposed) return;
      farmSaveLabel = "存档不可用（进入时检查并降级）";
    } finally { repository?.dispose(); owner?.dispose(); }
    show();
  }
  let storageWarning = "";
  let clearingStorage = false;
  let resettingPlanning = false;
  let saved: PlanningDocument | undefined;
  try {
    saved = await storage.load(parameters.seed);
    if (saved) resetPlanningFarmSaveChoice(saved);
  } catch (error) {
    storageWarning = "本地数据读取失败：" + String(error);
  }
  const client = new PlanningWorkerClient();
  client.onProgress=stage=>{ui("progress").hidden=false;ui("progress").textContent=stage+"…";};
  let initialDocument: PlanningDocument;
  try {
    const template = initialPlanningTemplate(pageUrl.url.search, parameters.seed,
      saved ? exportPlanningRecipe(saved).parameters.worldTemplate?.id ?? "" : undefined);
    initialDocument = template === undefined && saved ? saved : await client.initialize(parameters.seed, undefined, template);
    if (template !== undefined) initialDocument = storage.retainWater(initialDocument);
    removeDesertCamelPreset(initialDocument);
    if (template !== undefined) applyPlanningTemplateSurface(initialDocument);
    if (!storageWarning) await storage.migrateToSource(initialDocument, template !== undefined && !!saved);
  } catch (error) {
    client.dispose();
    project.dispose();
    throw error;
  }
  const session:PlanningSession = new PlanningSession(
    { version: 2, parameters, edits: {} },
    async (document, previous, signal) => {
      const r = exportPlanningRecipe(document);
      return client.run(r.parameters, r.edits, previous, document, signal);
    },
    initialDocument,
    { history: false, farmingStatePath: () => planningFarmingProjectStatePath(project) }
  );
  let tab = "inspector",
    disposed = false,
    generating = false,
    changingProjection = false;
  let api: WorldPlanningHandle | undefined;
  const activeEdits = new Set<Promise<unknown>>();
  const abort = new AbortController();
  const templatePicker = mountWorldTemplatePicker(
    root.querySelector<HTMLElement>(".ip-topbar nav")!,
    async (id, seed) => {
      const document = createWorldStylePlanningDocument(session.document, seed, id, session.recipe().parameters.population);
      applyPlanningTemplateSurface(document);
      const receipt = await edit((draft) => draft.load(retainPlanningWaterSource(document, project.projectPackage)));
      if (receipt?.status !== "accepted") throw new Error(receipt?.message ?? "规划未接受");
      if (storageWarning) throw new Error(storageWarning);
      status(session.document.populationInitialization?.diagnostics.join("；") ?? "");
    },
    async id => {
      const commands = Object.entries(worldTemplatePaletteValues(id)).map(([component, values]) => ({
        op: "set" as const, entity: "world", component, values
      }));
      if (!commands.length) {
        status("此主题沿用原始配色。");
        return;
      }
      const receipt = await edit(draft => draft.dispatchParameters(commands));
      if (receipt?.status !== "accepted") throw new Error(receipt?.message ?? "配色未接受");
      if (storageWarning) throw new Error(storageWarning);
    }
  );
  function updateGenerateControl() {
    const unavailable = disposed || generating || clearingStorage || resettingPlanning || changingProjection || session.pending ||
      root.dataset.pending === "true" || !session.result;
    button("generate").disabled = unavailable;
    button("director").disabled = unavailable;
    button("clear").disabled = unavailable;
    button("clear-save").disabled = unavailable;
    templatePicker.update(session.recipe().parameters.worldTemplate?.id, session.recipe().parameters.seed, unavailable);
  }
  function currentPlan(): IslandPlan {
    if (disposed) throw new Error("空间规划已关闭");
    if (session.pending || root.dataset.pending === "true") throw new Error("布局正在更新，请完成后再生成 3D");
    if (!session.result) throw new Error("布局尚未就绪");
    return structuredClone(session.result.plan);
  }
  const status = (message: string) => {
    ui("status").textContent = message;
    ui("status").hidden = !message;
    const diagnosticTab = root.querySelector<HTMLButtonElement>('[data-tab="diagnostics"]')!;
    diagnosticTab.textContent =
      message.startsWith("修改未能完成") || message.startsWith("加载失败") ||
      message.startsWith("生成 3D 未能完成") || message.includes("本地数据")
        ? "诊断 · !"
        : "诊断";
  };
  root.addEventListener("planning-render-error", (event) => status((event as CustomEvent<string>).detail), {
    signal: abort.signal
  });
  const view = new IslandPlanView(
    ui("viewport"),
    (id) => {
      if (!session.result) return;
      select(
        session.scene?.entities.has(id ?? "")
          ? resolveSceneSelection(session.scene, id)
          : ownerOf(session.result.plan, id)
      );
    }
  );
  const director = mountDirectorPanel(ui("viewport"), button("director"), async () => {
    await changeProjection(true);
    return view.directorView();
  });
  let focusedGroup: LayerNode | undefined;
  const layers = mountPlanningLayerTree(
    ui("layers"),
    syncLayers,
    (id, node) => {
      select(id ?? null, node.id);
      focusedGroup = id ? undefined : node;
      focus();
    },
    ui("display-layers")
  );
  session.setPublicationHandler((_document,result,signal,accept)=>view.publishPlan(result.plan,signal,accept));
  const inspector = mountSpatialInspector(ui("inspector"), session, dispatch, {
    show: preview => showPoiSizePreview(view.svg, preview),
    unavailableReason: () =>
      button("oblique").getAttribute("aria-pressed") === "true" ? "请切换到俯视后调整管理区大小" :
      disposed || generating || clearingStorage || resettingPlanning || changingProjection || session.pending || root.dataset.pending === "true"
        ? "布局正在更新，请稍后调整" : undefined
  });
  const poiPicker = document.createElement("select");
  poiPicker.className = "sp-poi-picker";
  poiPicker.setAttribute("aria-label", "选择 POI 调整管理区");
  ui("poi-summary").after(poiPicker);
  poiPicker.onchange = () => { if (poiPicker.value) select(poiPicker.value); };
  const wayfindingKey = document.createElement("p");
  wayfindingKey.className = "sp-wayfinding-key";
  wayfindingKey.hidden = true;
  wayfindingKey.innerHTML = `<span class="sp-wayfinding-elements">紫色：引导岩群</span><span class="sp-wayfinding-paths">青色：关联道路</span>`;
  ui("inspector").before(wayfindingKey);
  function select(id: string | null, hierarchyNodeId?: string) {
    director.pause();
    focusedGroup = undefined;
    session.select(id);
    poiPicker.value = id ?? "";
    view.setSelection(id);
    layers.select(id, hierarchyNodeId === undefined, hierarchyNodeId);
    updateSelectionStatistics();
    if (tab !== "inspector") setTab("inspector");
    else inspector.update(id);
  }
  function updateSelectionStatistics() {
    const id = session.selectedId;
    const output = ui("selected-statistics");
    const metrics = id ? session.inspect(id).components.flatMap(component =>
      planningRegistry.get(component.type).fields
        .filter(field => field.readonly && component.values[field.key] !== undefined)
        .map(field => `${field.label} ${formatSpatialFieldValue(field, component.values[field.key])}`)
    ) : [];
    output.hidden = !metrics.length;
    output.textContent = metrics.length ? `${session.inspect(id!).name} · ${metrics.join(" · ")}` : "";
  }
  function focus() {
    director.pause();
    if (focusedGroup) {
      const points: { x: number; z: number }[] = [];
      const ids = new Set<string>();
      const collect = (node: LayerNode) => {
        if (node.focusId) ids.add(node.focusId);
        for (const layer of node.layers ?? []) if (layer.startsWith("object:")) ids.add(layer.slice(7));
        for (const child of node.children ?? []) collect(child);
      };
      collect(focusedGroup);
      for (const id of ids) {
        const entity = session.scene?.entities.get(id);
        if (entity?.components.geometry) points.push(...entity.components.geometry.outline);
        else if (entity?.components.position) points.push(entity.components.position);
      }
      if (points.length) view.focusRegion(points);
      else view.fit();
      return;
    }
    const entity = session.scene?.entities.get(session.selectedId ?? "");
    const outline =
      entity?.components.geometry?.outline ?? (entity?.components.position ? [entity.components.position] : undefined);
    if (outline?.length) view.focusRegion(outline);
  }
  function syncLayers() {
    const defaults = Object.fromEntries(
      [...view.svg.querySelectorAll<SVGElement>("[data-plan-layer]")].map((n) => [
        n.dataset.planLayer!,
        n.dataset.planLayer!.startsWith("object:")
      ])
    );
    view.setLayers({
      ...defaults,
      "poi-content": true,
      rock: true,
      building: true,
      landscape: true,
      flowers: true,
      tree: true,
      "landscape-rock": true,
      water: true,
      "surface-water": true,
      route: true,
      "road-local": true,
      "surface-soil": true,
      ports: false,
      ...layers.values()
    });
  }
  function setTab(next: string) {
    if (next !== tab) inspector.cancelPreview();
    tab = next;
    const highlights = wayfindingHighlights(tab === "wayfinding" ? session.result?.plan : undefined);
    view.setContextHighlights(highlights.elements, highlights.paths);
    wayfindingKey.hidden = tab !== "wayfinding";
    wayfindingKey.querySelector(".sp-wayfinding-elements")!.textContent = `紫色：引导岩群（${highlights.elements.length}）`;
    wayfindingKey.querySelector(".sp-wayfinding-paths")!.textContent = `青色：关联道路（${highlights.paths.length}）`;
    for (const b of root.querySelectorAll<HTMLButtonElement>("[data-tab]"))
      b.setAttribute("aria-pressed", String(b.dataset.tab === tab));
    ui("inspector").hidden = tab === "diagnostics" || tab === "display";
    ui("display").hidden = tab !== "display";
    ui("diagnostics").hidden = tab !== "diagnostics";
    ui("world-save").hidden = tab !== "world";
    if (tab === "diagnostics") { updateDiagnostics(); return; }
    if (tab === "display") return;
    inspector.update(
      ["world", "ecology", "roads", "lighting", "wayfinding"].includes(tab) ? "world" : session.selectedId,
      tab === "world" || tab === "ecology" || tab === "roads" || tab === "lighting" || tab === "wayfinding"
        ? tab
        : undefined
    );
    if (tab === "world") void updateFarmSaveChoice();
  }
  for (const b of root.querySelectorAll<HTMLButtonElement>("[data-tab]")) b.onclick = () => setTab(b.dataset.tab!);
  async function persist() {
    if (clearingStorage) return;
    try {
      await storage.save(session.export());
      // The planning page explicitly reports a saved document and may replace its URL.
      await project.flush();
      storageWarning = "";
    } catch (error) {
      storageWarning = "本地数据保存失败，当前修改尚未保存：" + String(error);
    }
    // Keep the old document URL recoverable if its one-time migration could not be saved.
    if (!planningSourceDocument(project.projectPackage) && pageUrl.canReplaceHistory && (!storageWarning || !query.has("document")))
      history.replaceState(history.state, "", planningSeedURL(pageUrl.url.href, session.recipe().parameters.seed));
    status(storageWarning);
  }
  function updateDiagnostics() {
    const r = session.result;
    if (!r) return;
    const flowers = r.plan.flowerRegions ?? [];
    const flowerArea = flowers.reduce((sum, f) => sum + f.areaM2, 0);
    ui("flower-diagnostics").textContent = `花区预览约 ${Math.round(flowerArea)} ㎡ · 按分布场一次采样，不补足面积或株数`;
    ui("checks").textContent = JSON.stringify(
      {
        selection: session.selectedId ? session.inspect(session.selectedId) : undefined,
        lastEdit: session.lastReceipt,
        geometryOverview: planningOverview(r.plan),
        flowerAreas: r.plan.flowerRegions?.map(f => ({ id: f.id, eligibleAreaM2: f.eligibleAreaM2,
          previewAreaM2: f.areaM2, densityPerM2: f.config.densityPerM2 })),
        systems: r.execution,
        changedIds: r.changedIds,
        checks: r.checks.filter((c) => c.status !== "pass"),
        adjustments: r.plan.planning?.adjustments,
        visualGuidance: r.plan.visualGuidance?.map((report) => ({
          sourceId: report.sourceId,
          keypoints: report.keypoints?.length ?? 0,
          generatedGroups: report.memberIds.length,
          requestedRouteCoverage: report.requestedRouteCoverage,
          plannedRouteCoverage: report.plannedRouteCoverage,
          requestedMassDimensions: report.requestedMassDimensions,
          placements: report.placements,
          yieldedLandscapeElements: report.ecologyExclusions?.length ?? 0,
          rejectedCandidates: report.rejectedCandidates,
          rejectionReasons: report.rejectionReasons
        })),
        timings: r.timings
      },
      null,
      2
    );
  }
  function render() {
    if (!session.result) return;
    if(!session.pending)ui("progress").hidden=true;
    const start = performance.now(),
      r = session.result;
    layers.update(
      r.plan,
      Object.fromEntries(Object.values(session.document.entities).map((e) => [e.id, e.name])),
      session.scene
    );
    view.setPresentation(
      session.inspect("world").components.filter((c) => ["lighting", "postProcess"].includes(c.type))
    );
    view.setPlan(r.plan, r.plan.planning?.revision ?? 1, r.execution === "landscape");
    view.setSelection(session.selectedId);
    layers.select(session.selectedId, false);
    syncLayers();
    director.update(r.plan);
    setTab(tab);
    const poiSites = r.plan.poiDistribution?.sites ?? [];
    const placeholder = document.createElement("option");
    placeholder.value = ""; placeholder.textContent = "选择 POI · 调整管理区大小";
    poiPicker.replaceChildren(placeholder);
    for (const site of r.plan.poiDistribution?.sites ?? []) {
      const option = document.createElement("option");
      option.value = site.id;
      option.textContent = (session.scene?.entities.get(site.id)?.name ?? site.id) + (site.active ? "" : " · 未显示");
      poiPicker.append(option);
    }
    poiPicker.value = session.selectedId ?? "";
    ui("poi-summary").textContent =
      `POI ${poiSites.filter(site => site.active).length} · ${poiSites.length} 个可调整位置`;
    const layout = r.plan.spatialLayout;
    const rockGroups = r.plan.rocks.filter(({ assetId }) => MOJAVE_ROCK_GROUPS.includes(assetId ?? "")).length;
    const counts: [string, number][] = [
      ["体量", (layout?.groups.reduce((sum, group) => sum + group.volumes.length, 0) ?? 0) + rockGroups],
      ["道路", r.plan.routes.length],
      ["景观树", r.plan.landscapes?.filter(item => item.kind === "tree").length ?? 0],
      ["景观石", r.plan.landscapes?.filter(item => item.kind === "rock").length ?? 0],
      ["建筑", r.plan.buildings.length],
      ["村庄", layout?.groups.filter(group => layout.elementProfiles?.[group.id] === "habitable" && group.volumes.length > 0).length ?? 0],
      ["河流", r.plan.waters.filter(water => water.kind === "river").length],
      ["湖泊", r.plan.waters.filter(water => water.kind === "lake").length]
    ];
    ui("summary").replaceChildren(...counts.map(([label, count]) => {
      const item = document.createElement("div"), term = document.createElement("dt"), value = document.createElement("dd");
      term.textContent = label;
      value.textContent = String(count);
      item.append(term, value);
      return item;
    }));
    const distribution = session.inspect("world").components.find(component => component.type === "distribution");
    const averageArea = distribution?.values.averageAreaM2;
    ui("area-statistics").textContent = typeof averageArea === "number" ? `平均管理面积 ${Math.round(averageArea).toLocaleString()} ㎡` : "";
    updateSelectionStatistics();
    ui("revision").textContent = `1024 × 1024 m · SEED ${r.recipe.parameters.seed}`;
    root.dataset.revision = String(session.document.revision);

    root.dataset.seed = String(r.recipe.parameters.seed);
    templatePicker.update(r.recipe.parameters.worldTemplate?.id, r.recipe.parameters.seed, session.pending);
    const intentURL = new URL("../scene-visual-intent/index.html", pageUrl.url);
    intentURL.searchParams.set("seed", String(r.recipe.parameters.seed));
    ui<HTMLAnchorElement>("visual-intent").href = intentURL.href;
    root.dataset.execution = r.execution;
    root.dataset.solveTimings = JSON.stringify(r.timings);
    root.dataset.renderMs = String(performance.now() - start);
  }
  function edit(action: (draft: PlanningSession) => Promise<EditReceipt | undefined>, reset = false): Promise<EditReceipt | undefined> {
    const pending = executeEdit(action, reset);
    activeEdits.add(pending);
    return pending.finally(() => { activeEdits.delete(pending); });
  }
  async function executeEdit(action: (draft: PlanningSession) => Promise<EditReceipt | undefined>, reset = false): Promise<EditReceipt | undefined> {
    if (disposed) throw new Error("空间规划已关闭");
    if (generating) throw new Error("3D 正在生成，请完成后再修改布局");
    if (clearingStorage) throw new Error("正在清理本地数据，请稍后再修改布局");
    if (resettingPlanning && !reset) throw new Error("正在重置规划参数，请稍后再修改布局");
    const started = performance.now();
    director.pause();
    root.dataset.pending = "true";
    updateGenerateControl();
    status("更新中…");
    ui("progress").hidden=false;ui("progress").textContent="正在更新布局…";
    const transaction = session.beginProjectEdit();
    const cancel = () => { void transaction.discard(); };
    abort.signal.addEventListener("abort", cancel, { once: true });
    try {
      const receipt = await action(transaction.session);
      if (disposed || receipt?.status === "superseded") return receipt;
      if (receipt?.status === "accepted") {
        await transaction.prepare(abort.signal);
        await storage.save(transaction.session.export(), crypto.randomUUID());
        transaction.commit();
        await view.publishPlan(session.result!.plan, abort.signal, () => {});
      }
      render();
      if (!receipt || receipt.status === "accepted") {
        if (receipt) {
          try { await project.flush(); storageWarning = ""; }
          catch (error) { storageWarning = "作者修改已接受，保存失败，可重试保存：" + String(error); }
          status(storageWarning);
        }
        else status(storageWarning);
      } else status("修改未能完成：" + receipt.message);
      root.dataset.lastUpdateMs = String(performance.now() - started);
      return receipt;
    } finally {
      abort.signal.removeEventListener("abort", cancel);
      await transaction.discard();
      if (!disposed) {
        root.dataset.pending = String(session.pending);
        ui("progress").hidden=!session.pending;
        updateGenerateControl();
        setTab(tab);
      }
    }
  }
  async function dispatch(commands: SpatialCommand[], expectedRevision?: number): Promise<EditReceipt> {
    return (await edit(draft => draft.dispatch(commands, expectedRevision)))!;
  }
  button("fit").onclick = () => {
    director.close();
    view.fit();
  };
  // All preview entry points share readiness and pressed state, including direct director entry.
  async function changeProjection(oblique: boolean) {
    if (disposed || generating || changingProjection) throw new Error("预览正在切换，请稍后重试");
    const controls = [button("plan"), button("oblique")];
    changingProjection = true;
    for (const control of controls) control.disabled = true;
    updateGenerateControl();
    try {
      await view.setProjection(oblique);
      if (disposed) throw new Error("空间规划已关闭");
      button("plan").setAttribute("aria-pressed", String(!oblique));
      button("oblique").setAttribute("aria-pressed", String(oblique));
    } catch (error) {
      if (!disposed) {
        button("plan").setAttribute("aria-pressed", "true");
        button("oblique").setAttribute("aria-pressed", "false");
        status(String(error));
      }
      throw error;
    } finally {
      changingProjection = false;
      if (!disposed) {
        for (const control of controls) control.disabled = false;
        updateGenerateControl();
        setTab(tab);
      }
    }
  }
  for (const name of ["plan", "oblique"] as const) {
    button(name).onclick = async () => {
      if (disposed || generating || changingProjection) return;
      director.close();
      try { await changeProjection(name === "oblique"); }
      catch (error) { if (!disposed) status(String(error)); }
    };
  }


  button("generate").onclick = async () => {
    if (!options.onGenerate3D || button("generate").disabled) return;
    const plan = currentPlan();
    director.close();
    generating = true;
    root.inert = true;
    updateGenerateControl();
    button("generate").textContent = "正在生成…";
    try {
      await project.save();
      await options.onGenerate3D(plan, session);
    } catch (error) {
      if (!disposed) status("生成 3D 未能完成：" + String(error));
    } finally {
      generating = false;
      if (!disposed) {
        root.inert = false;
        button("generate").textContent = "生成 3D";
        updateGenerateControl();
      }
    }
  };
  async function clearSavedData(clear: () => Promise<void>) {
    if (disposed || clearingStorage || button("clear").disabled) return;
    clearingStorage = true;
    root.inert = true;
    updateGenerateControl();
    ui("world-save-status").hidden = true;
    try {
      await clear();
      await project.flush();
    } catch (error) {
      if (disposed) return;
      clearingStorage = false;
      root.inert = false;
      ui("progress").hidden = true;
      const message = "本地数据清除失败：" + String(error);
      status(message);
      ui("world-save-status").textContent = message;
      ui("world-save-status").hidden = false;
      updateGenerateControl();
      return;
    }
    // Prevent pending solves from writing old edits back while this document is being replaced.
    await dispose();
    if (!planningSourceDocument(project.projectPackage) && pageUrl.canReplaceHistory) location.replace(planningSeedURL(pageUrl.url.href, session.recipe().parameters.seed));
    else location.reload();
  }
  button("clear").onclick = async () => {
    if (disposed || button("clear").disabled || resettingPlanning) return;
    const started = performance.now();
    resettingPlanning = true;
    root.inert = true;
    director.close();
    updateGenerateControl();
    try {
      const receipt = await edit(async draft => {
        const { seed, worldTemplate } = draft.recipe().parameters;
        const replacement = await client.initialize(seed, abort.signal, worldTemplate?.id);
        abort.signal.throwIfAborted();
        replacement.layoutOverrides = draft.document.layoutOverrides;
        applyPlanningTemplateSurface(replacement);
        return draft.load(retainPlanningWaterSource(replacement, project.projectPackage), abort.signal);
      }, true);
      if (disposed || receipt?.status !== "accepted") return;
      select(null);
      await changeProjection(false);
      view.fit();
      root.dataset.resetMs = String(performance.now() - started);
    } catch (error) {
      if (!disposed) status("重置规划参数未能完成：" + String(error));
    } finally {
      resettingPlanning = false;
      if (!disposed) {
        root.inert = false;
        ui("progress").hidden = !session.pending;
        updateGenerateControl();
      }
    }
  };
  button("clear-save").onclick = () => clearSavedData(async () => {
    const seed = session.recipe().parameters.seed;
    let owner: Awaited<ReturnType<typeof openSeedWorldProject>> | undefined;
    try {
      if (!planningSourceDocument(project.projectPackage) && seed !== parameters.seed) {
        const url = new URL(pageUrl.url);
        url.searchParams.set("seed", String(seed));
        owner = await openSeedWorldProject(url);
      }
      await clearSeedWorldPlayerSave(owner ?? project, seed, window.localStorage);
      await (owner ?? project).flush();
    } finally { owner?.dispose(); }
  });
  button("open").onclick = () => ui<HTMLInputElement>("file").click();
  ui<HTMLInputElement>("file").onchange = () => {
    const file = ui<HTMLInputElement>("file").files?.[0];
    if (file)
      void file
        .text()
        .then(JSON.parse)
        .then((document) => edit(draft => draft.load(importPlanningScene(document))))
        .catch((e) => status(String(e)));
  };
  button("save").onclick = () => {
    const url = URL.createObjectURL(
        new Blob([JSON.stringify(exportPlanningScene(session.export()), null, 2)], { type: "application/json" })
      ),
      a = document.createElement("a");
    a.href = url;
    a.download = "spatial-world.scene";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  window.addEventListener(
    "keydown",
    (event) => {
      if ((event.target as HTMLElement).matches('input,textarea,select,[contenteditable="true"]')) return;
      if (event.key.toLowerCase() === "f" && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        focus();
      }
    },
    { signal: abort.signal }
  );
  const close = createSeedWorldProjectClose(async () => {
    disposed = true;
    root.inert = true;
    abort.abort();
    templatePicker.dispose();
    inspector.dispose();
    await Promise.allSettled([...activeEdits]);
    director.dispose();
    client.dispose();
    await view.dispose();
  }, () => project.save(), () => {
    project.dispose();
    root.remove();
    document.body.classList.remove("island-plan-page", "base-map-page");
    if (api && window.worldPlanningPage === api) delete window.worldPlanningPage;
  });
  function dispose(): Promise<void> {
    return close().catch(error => { status("工程保存失败，可再次关闭以重试：" + String(error)); throw error; });
  }
  status("加载空间组件…");
  root.dataset.pending = "true";
  root.inert = true;
  try {
    await session.initialize();
  } catch (error) {
    dispose();
    throw error;
  } finally {
    if (!disposed) root.inert = false;
  }
  root.dataset.pending = "false";
  updateGenerateControl();
  render();
  view.fit();
  setTab("inspector");
  root.dataset.startupMs = String(performance.now() - startupStarted);
  if (storageWarning) status(storageWarning);
  else if (saved) await persist();
  else if (pageUrl.canReplaceHistory) history.replaceState(history.state, "", planningSeedURL(pageUrl.url.href, parameters.seed));
  const handle = {
    getPlan: currentPlan,
    getState: () => ({
      requested: session.recipe(),
      result: structuredClone(session.result!),
      selectedId: session.selectedId,
      pending: session.pending,
      inputRevision: session.document.revision
    }),
    dispose
  };
  // Public automation uses the same transaction boundary as the inspector; no browser gesture emulation is needed.
  api = Object.assign(handle, {
    sampleWater: (x:number,z:number,id?:string) => view.sampleWater(x,z,id),
    sampleDrops: (x:number,y:number,z:number,id?:string) => view.sampleDrops(x,y,z,id),
    createWater: async (...args: Parameters<PlanningSession["createWater"]>) => (await edit(draft => draft.createWater(...args)))!,
    removeWater: async (...args: Parameters<PlanningSession["removeWater"]>) => (await edit(draft => draft.removeWater(...args)))!,
    describe: () => session.describe(),
    query: (filter: Parameters<PlanningSession["query"]>[0]) => session.query(filter),
    inspect: (id: string) => session.inspect(id),
    dispatch: async (...args: Parameters<PlanningSession["dispatchParameters"]>) =>
      (await edit(draft => draft.dispatchParameters(...args)))!,
    select: (id: string | null) => select(id),
    export: () => session.export(),
    journal: () => structuredClone(session.journal)
  });
  window.worldPlanningPage = api;
  return api;
}
