import { Camera, WebGLEngine, type Entity } from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { registerNativeWater } from "@galacean/engine-water/water/native/index";
import type { IslandPlan } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel";
import { planningHeightmap } from "@galacean/engine-world-planning/semantic-study/PlanningHeightmap";
import { PlanningTerrainView } from "@galacean/engine-world-planning/semantic-study/PlanningTerrainView";
import { isGlobalRoadId } from "@galacean/engine-world-planning/spatial/layout/RoadIdentity";
import { planningRegistry } from "@galacean/engine-world-planning/spatial/PlanningComponents";
import type { PlanningSession } from "@galacean/engine-world-planning/spatial/PlanningSession";
import {
  PlanningWaterRuntime,
  type PreparedPlanningWater
} from "@galacean/engine-world-planning/spatial/runtime/PlanningWaterRuntime";
import { spatialRecordEditor } from "@galacean/engine-world-planning/spatial/SpatialRecordEditor";
import { WaterPreviewCamera } from "./WaterPreviewCamera.ts";
import { WaterPreviewCrossings } from "./WaterPreviewCrossings.ts";
import { WaterPreviewEnvironment, type WaterPreviewLightingMode } from "./WaterPreviewEnvironment.ts";
import { WaterPreviewWorkerClient } from "./WaterPreviewWorkerClient.ts";

const element = <T extends HTMLElement>(id: string) => document.getElementById(id)! as T;
const seed = element<HTMLInputElement>("seed"),
  bodySelect = element<HTMLSelectElement>("body");
const status = element("status"),
  terrainToggle = element<HTMLInputElement>("terrain"),
  waterToggle = element<HTMLInputElement>("water"),
  roadToggle = element<HTMLInputElement>("roads"),
  crossingToggle = element<HTMLInputElement>("crossings");
const parameters = new URLSearchParams(location.search);
seed.value = parameters.get("seed") ?? "1";

let session: PlanningSession | undefined, currentPlan: IslandPlan | undefined;
let terrain: PlanningTerrainView | undefined, terrainRoot: Entity | undefined;
let water: PlanningWaterRuntime | undefined, engine: WebGLEngine | undefined;
let camera: Camera;
let cameraControl: WaterPreviewCamera | undefined;
const compiler = new WaterPreviewWorkerClient();
const loading = element("loading"),
  loadingStage = element("loading-stage");
const loadingProgress = element<HTMLProgressElement>("loading-progress");
const loadingStarted = performance.now();
const loadingStages: Array<{ stage: number; text: string; elapsedMs: number }> = [];
const progress = async (stage: number, text: string) => {
  if (disposed) return;
  loadingStages.push({ stage, text, elapsedMs: performance.now() - loadingStarted });
  document.body.dataset.loadingStages = JSON.stringify(loadingStages);
  loadingProgress.value = stage;
  loadingStage.textContent = `${stage + 1}/6 · ${text}`;
  document.body.dataset.loadingStage = text;
  message(text);
  // A task boundary lets the browser paint the actual stage before CPU preparation.
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  lifetime.signal.throwIfAborted();
};
compiler.onProgress = (text) => {
  loadingProgress.value = 1;
  loadingStage.textContent = `2/6 · ${text}`;
  document.body.dataset.loadingStage = text;
  message(text);
};
let publicationRevision = 0;
let publicationAbort: AbortController | undefined;
const publications = new Set<Promise<void>>();
let environment: WaterPreviewEnvironment | undefined;
let crossings: WaterPreviewCrossings | undefined;
let lastPreparation: { bridgesReused: boolean } | undefined;
let busy = false,
  disposed = false,
  activeWork: Promise<void> = Promise.resolve();
const lifetime = new AbortController();
const message = (text: string, error = false) => {
  status.textContent = text;
  status.dataset.error = String(error);
};
const enabled = () => {
  for (const id of ["regenerate", "seed", "undo", "redo", "parameters", "records", "body", "roads", "water"])
    for (const control of [element(id), ...element(id).querySelectorAll("button,input,select")])
      if (
        control instanceof HTMLButtonElement ||
        control instanceof HTMLInputElement ||
        control instanceof HTMLSelectElement
      )
        control.disabled = busy;
  element<HTMLButtonElement>("undo").disabled = busy || !session?.canUndo;
  element<HTMLButtonElement>("redo").disabled = busy || !session?.canRedo;
};
function run(task: () => Promise<unknown>) {
  if (busy || disposed) return;
  busy = true;
  enabled();
  message("正在准备地形与水体，当前场景仍可查看…");
  activeWork = (async () => {
    try {
      await task();
      if (!disposed) {
        loading.hidden = true;
        renderEditor();
        message(
          `已发布 · ${currentPlan?.waters.length ?? 0} 个水体 · ${currentPlan?.routes.filter((r) => isGlobalRoadId(r.id)).length ?? 0} 条全局道路 · ${currentPlan?.bridges.length ?? 0} 处跨河连接`
        );
      }
    } catch (error) {
      if (!disposed) {
        loadingStage.textContent = `准备失败：${String(error)}`;
        loadingProgress.removeAttribute("value");
        message(String(error), true);
        console.error(error);
      }
    } finally {
      busy = false;
      if (!disposed) enabled();
    }
  })();
}

/** Hidden Terrain candidate + native batch, the same prepare/accept boundary used by SeedWorld. */
function publish(plan: IslandPlan, signal: AbortSignal, accept: () => void): Promise<void> {
  publicationAbort?.abort();
  const controller = (publicationAbort = new AbortController());
  const revision = ++publicationRevision;
  const combined = AbortSignal.any([signal, lifetime.signal, controller.signal]);
  const task = publishCandidate(plan, combined, () => {
    combined.throwIfAborted();
    if (revision !== publicationRevision) throw new Error("预览发布请求已过期");
    accept();
  });
  publications.add(task);
  void task.finally(() => publications.delete(task)).catch(() => {});
  return task;
}
async function publishCandidate(plan: IslandPlan, combined: AbortSignal, accept: () => void) {
  combined.throwIfAborted();
  const root = engine!.sceneManager.activeScene!.createRootEntity("Water preview terrain candidate");
  root.isActive = false;
  let view: PlanningTerrainView | undefined,
    prepared: PreparedPlanningWater | undefined,
    nextCrossings: WaterPreviewCrossings | undefined,
    committed = false;
  let renderingPaused = false;
  try {
    await progress(2, "准备天空光照与环境反射…");
    await environment!.waitForReady(combined);
    combined.throwIfAborted();
    // Until the first joint publication, spend no frames rendering an empty sky.
    if (!currentPlan) {
      engine!.pause();
      renderingPaused = true;
    }
    await progress(3, "准备地形、道路与桥面…");
    view = await PlanningTerrainView.create(engine!, root, camera, terrain);
    combined.throwIfAborted();
    await view.setProduction(true, plan.parameters.seed);
    combined.throwIfAborted();
    view.setPlan(plan, { route: roadToggle.checked });
    nextCrossings = crossings?.matches(plan)
      ? crossings
      : await WaterPreviewCrossings.create(engine!, root, plan, combined);
    if (nextCrossings !== crossings) nextCrossings.setVisible(crossingToggle.checked);
    view.setVisible(terrainToggle.checked);
    combined.throwIfAborted();
    await progress(4, "准备水体资源与渲染数据…");
    prepared = await water!.prepare(
      plan,
      combined,
      { ocean: waterToggle.checked, rivers: waterToggle.checked },
      async (completed, total) => {
        await progress(4, `准备水体资源 ${completed}/${total}，随后编译与上传…`);
      }
    );
    await progress(5, "全部数据已准备，正在共同发布…");
    combined.throwIfAborted();
    const publication = prepared.commit();
    accept();
    const previous = terrain,
      previousRoot = terrainRoot,
      previousCrossings = crossings;
    terrain = view;
    terrainRoot = root;
    nextCrossings.reparent(root);
    lastPreparation = { bridgesReused: nextCrossings === previousCrossings };
    crossings = nextCrossings;
    crossings.setVisible(crossingToggle.checked);
    currentPlan = plan;
    committed = true;
    if (previousRoot) previousRoot.isActive = false;
    view.setVisible(terrainToggle.checked);
    root.isActive = true;
    try {
      if (previousCrossings !== nextCrossings) previousCrossings?.dispose();
      previous?.dispose();
    } finally {
      previousRoot?.destroy();
    }
    void publication.retiredCleanup.catch((error) => console.warn("Water preview retirement", error));
    loadingProgress.value = 6;
    document.body.dataset.firstPublishedMs ??= String(performance.now() - loadingStarted);
    document.body.dataset.ready = "true";
    document.body.dataset.revision = String(water!.system.revision);
  } catch (error) {
    if (committed) {
      console.warn("Water preview accepted publication cleanup", error);
      return;
    }
    if (!committed) {
      await prepared?.rollback();
      if (nextCrossings !== crossings) nextCrossings?.dispose();
      view?.dispose();
      root.destroy();
    }
    throw error;
  } finally {
    if (renderingPaused && !disposed) engine!.resume();
  }
}

function focus(id?: string) {
  if (!currentPlan) return;
  // Frame the published drop endpoints from downstream; whole-river bounds can hide a curtain behind its bank.
  const drops = water?.system.bodies.find((body) => body.waterId === id)?.configuration?.asset.riverDrops;
  if (drops?.length) {
    const first = drops[0],
      last = drops[drops.length - 1];
    const x = (first.upper[0] + last.lower[0]) / 2;
    const z = (first.upper[2] + last.lower[2]) / 2;
    const y = (first.upper[1] + last.lower[1]) / 2;
    const extent = Math.hypot(last.lower[0] - first.upper[0], last.lower[2] - first.upper[2]);
    const height = first.upper[1] - last.lower[1];
    const distance = Math.max(7, extent * 1.6, height * 2, first.width * 2);
    const across = first.across;
    cameraControl!.focusView(
      [x, y, z],
      [
        x + across[1] * distance - across[0] * first.width * 0.55,
        first.upper[1] + Math.max(0.8, extent * 0.6),
        z - across[0] * distance - across[1] * first.width * 0.55
      ]
    );
    return;
  }
  const body = currentPlan.waters.find((w) => w.id === id);
  const bridge = currentPlan.bridges.find((b) => b.id === id),
    route = currentPlan.routes.find((r) => r.id === id);
  const points =
    body?.outline ??
    (bridge ? [bridge.a, bridge.b] : route?.points) ??
    [currentPlan.land, ...currentPlan.islands].flat();
  if (!points.length) return;
  const xs = points.map((p) => p.x),
    zs = points.map((p) => p.z);
  const x = (Math.min(...xs) + Math.max(...xs)) / 2,
    z = (Math.min(...zs) + Math.max(...zs)) / 2;
  const span = Math.max(12, Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs));
  const y = planningHeightmap(currentPlan).sample({ x, z });
  cameraControl!.focus(x, y, z, span);
}

async function edit(values: Record<string, unknown>) {
  const id = bodySelect.value,
    body = currentPlan!.waters.find((w) => w.id === id);
  const receipt = await session!.dispatchParameters([
    {
      op: "set",
      entity: id,
      component: body ? (body.kind === "lake" ? "lakes" : "rivers") : "suspensionBridge",
      values
    }
  ]);
  if (receipt.status !== "accepted") throw new Error(receipt.message ?? receipt.status);
}
function numeric(label: string, value: number, field: string) {
  const row = document.createElement("label"),
    input = document.createElement("input");
  row.textContent = label;
  input.type = "number";
  input.step = "0.1";
  input.value = Number.isFinite(value) ? String(value) : "";
  input.setAttribute("aria-label", label);
  input.onchange = () =>
    run(async () => {
      if (input.value.trim() || currentPlan!.waters.some((w) => w.id === bodySelect.value))
        return edit({ [field]: Number(input.value) });
      const receipt = await session!.dispatchParameters([
        { op: "reset", entity: bodySelect.value, component: "suspensionBridge", fields: [field] }
      ]);
      if (receipt.status !== "accepted") throw new Error(receipt.message ?? receipt.status);
    });
  row.append(input);
  return row;
}
function renderEditor() {
  const previous = bodySelect.value;
  const group = (label: string, options: HTMLOptionElement[]) => {
    const g = document.createElement("optgroup");
    g.label = label;
    g.append(...options);
    return g;
  };
  bodySelect.replaceChildren(
    group(
      "独立空间元素 · 河流与湖泊",
      currentPlan!.waters.map((w) => new Option(session!.document.entities[w.id]?.name ?? w.label, w.id))
    ),
    group("独立空间元素 · 跨河连接", [
      new Option("木吊桥默认设置", "world"),
      ...currentPlan!.bridges.map((b, i) => new Option(`跨河连接 ${i + 1} · ${b.label}`, b.id))
    ]),
    group(
      "全局道路",
      currentPlan!.routes
        .filter((r) => isGlobalRoadId(r.id))
        .map((r, i) => new Option(`道路 ${i + 1} · ${r.label}`, r.id))
    )
  );
  if ([...bodySelect.options].some((o) => o.value === previous)) bodySelect.value = previous;
  element("world-info").textContent =
    `${currentPlan!.parameters.width} × ${currentPlan!.parameters.depth} 米 · Seed ${currentPlan!.parameters.seed} · ${currentPlan!.islands.length} 个离岸岛`;
  const body = currentPlan!.waters.find((w) => w.id === bodySelect.value);
  element("parameters").replaceChildren();
  element("records").replaceChildren();
  element("points").hidden = !body;
  if (!body) {
    const bridge = currentPlan!.bridges.find((b) => b.id === bodySelect.value);
    const route = currentPlan!.routes.find((r) => r.id === (bridge?.routeId ?? bodySelect.value));
    const p = document.createElement("p");
    p.textContent = bridge
      ? `桥宽 ${bridge.width.toFixed(2)} 米；桥面 ${bridge.deckY?.toFixed(2)} 米。位置与高度由 Planner 路网发布。`
      : `道路宽 ${route?.width.toFixed(2)} 米。当前预览保留 Planner 全局道路及跨河所需内部通道。`;
    element("parameters").append(p);
    if (bridge?.suspension || bodySelect.value === "world") {
      const id = bridge?.id ?? "world";
      const values = session!.inspect(id).components.find((c) => c.type === "suspensionBridge")!.values;
      if (id === "world") p.textContent = "新旧跨河连接共用默认配置；单桥显式设置优先。留空恢复自动适配。";
      for (const field of planningRegistry
        .get("suspensionBridge")
        .fields.filter((f) => id !== "world" || !f.kinds || f.kinds.includes("world")))
        element("parameters").append(numeric(field.label + "（米）", Number(values[field.key]), field.key));
      const reset = document.createElement("button");
      reset.textContent = "恢复自动适配";
      reset.onclick = () =>
        run(async () => {
          const receipt = await session!.dispatchParameters([
            { op: "reset", entity: id, component: "suspensionBridge" }
          ]);
          if (receipt.status !== "accepted") throw new Error(receipt.message ?? receipt.status);
        });
      element("parameters").append(reset);
    }
    element("facts").textContent = JSON.stringify(
      { version: water!.system.revision, selected: bodySelect.value, bridge, route },
      null,
      2
    );
    enabled();
    return;
  }
  const component = body.kind === "lake" ? "lakes" : "rivers";
  const values = session!.inspect(body.id).components.find((c) => c.type === component)!.values;
  const holder = element("parameters");
  if (body.kind === "lake") {
    holder.append(
      numeric("水位偏移（米）", Number(values.levelOffsetM ?? 0), "levelOffsetM"),
      numeric("湖盆深度（米）", Number(values.depthM), "depthM"),
      numeric("岸坡宽度（米）", Number(values.bankWidthM), "bankWidthM")
    );
  } else {
    const points = values.points as Record<string, unknown>[];
    for (const [key, label] of [
      ["width", "河宽（米）"],
      ["depth", "主槽深度（米）"]
    ]) {
      const row = document.createElement("label"),
        input = document.createElement("input");
      row.textContent = label;
      input.type = "number";
      input.step = "0.1";
      input.value = String(points[0][key]);
      input.setAttribute("aria-label", label);
      input.onchange = () => run(() => edit({ points: points.map((p) => ({ ...p, [key]: Number(input.value) })) }));
      row.append(input);
      holder.append(row);
    }
    holder.append(numeric("基础岸坡宽度（米）", Number(values.bankWidthM), "bankWidthM"));
  }
  const fieldKey = body.kind === "lake" ? "shoreline" : "points";
  const field = planningRegistry.get(component).fields.find((f) => f.key === fieldKey)!;
  const records = spatialRecordEditor(field, async (value) => {
    if (busy) return;
    run(() => edit({ [fieldKey]: value }));
    await activeWork;
  });
  records.update(values[fieldKey]);
  element("records").append(records.element);
  const point =
    body.kind === "lake"
      ? { x: body.lake!.center.x + body.lake!.radiusM / 2, z: body.lake!.center.z }
      : body.course!.points[0];
  const sample = water!.system.sample(point.x, point.z, body.id);
  element("facts").textContent = JSON.stringify(
    {
      version: water!.system.revision,
      world: {
        widthM: currentPlan!.parameters.width,
        depthM: currentPlan!.parameters.depth,
        seed: currentPlan!.parameters.seed,
        islands: currentPlan!.islands.length,
        raster: currentPlan!.raster
      },
      globalRoads: currentPlan!.routes.filter((r) => isGlobalRoadId(r.id)).length,
      riverCrossings: currentPlan!.bridges.length,
      body: body.id,
      sampleAt: point,
      sample,
      environment: environment?.snapshot
    },
    null,
    2
  );
  enabled();
}

try {
  engine = await WebGLEngine.create({ canvas: "canvas", shaderCompiler: new ShaderCompiler() });
  const resize = () => engine!.canvas.setResolution(window.innerWidth, window.innerHeight);
  resize();
  window.addEventListener("resize", resize, { signal: lifetime.signal });
  registerNativeWater();
  const scene = engine.sceneManager.activeScene!,
    root = scene.createRootEntity("Water preview");
  camera = root.createChild("Camera").addComponent(Camera);
  camera.farClipPlane = 4000;
  camera.nearClipPlane = 0.1;
  camera.entity.transform.setPosition(170, 65, 190);
  cameraControl = new WaterPreviewCamera(camera);
  const cameraButton = element<HTMLButtonElement>("camera-mode"),
    hint = element("camera-hint");
  cameraButton.onclick = () => {
    cameraControl!.setMode(cameraControl!.mode === "orbit" ? "free" : "orbit");
    const free = cameraControl!.mode === "free";
    cameraButton.textContent = free ? "切换到环绕操作" : "切换到 WASDQE";
    cameraButton.setAttribute("aria-pressed", String(free));
    hint.textContent = free
      ? "点击画面 · WASD 前后左右 · Q/E 下降/上升 · 拖动转向"
      : "拖动旋转 · 滚轮缩放 · 右键拖动平移";
  };
  environment = root.createChild("Preview environment").addComponent(WaterPreviewEnvironment);
  environment.initialize(camera);
  const lightingSelect = element<HTMLSelectElement>("lighting");
  const lightingStatus = element("lighting-status");
  lightingSelect.onchange = async () => {
    lightingSelect.disabled = true;
    lightingStatus.textContent = "正在准备光照与环境反射…";
    try {
      await environment!.setMode(lightingSelect.value as WaterPreviewLightingMode);
      if (disposed) return;
      water!.system.environment.setSource(environment!.reflectionSource);
      lightingStatus.textContent =
        lightingSelect.value === "farmlands"
          ? "Scene_Demo 天空、主光、环境光与线性输出；未复现动态云影。"
          : "原预览光照与颜色输出。";
    } catch (error) {
      if (disposed) return;
      lightingSelect.value = environment!.snapshot.mode;
      lightingStatus.textContent = `光照切换失败：${String(error)}`;
    } finally {
      if (!disposed) lightingSelect.disabled = false;
    }
  };
  water = new PlanningWaterRuntime({ engine, root, camera, environmentReflection: environment.reflectionSource });
  lightingSelect.disabled = false;
  engine.run();
  const regenerate = async () => {
    loading.hidden = false;
    await progress(1, "后台生成全部水体、道路与地形…");
    const started = performance.now();
    const requestedSeed = Number(seed.value);
    const next = await compiler.createSession(requestedSeed);
    await publish(next.result!.plan, lifetime.signal, () => {
      session = next;
    });
    next.setPublicationHandler((_document, result, signal, accept) => {
      if (session !== next) return Promise.reject(new Error("此预览会话已被重新生成替换"));
      return publish(result.plan, signal, accept);
    });
    document.body.dataset.generationMs = String(compiler.elapsedMs);
    document.body.dataset.readyMs = String(performance.now() - started);
    const url = new URL(location.href);
    url.searchParams.set("seed", String(requestedSeed));
    url.searchParams.delete("case");
    history.replaceState(null, "", url);
    focus();
  };
  element("regenerate").onclick = () => run(regenerate);
  element("overview").onclick = () => focus();
  element("focus").onclick = () => focus(bodySelect.value);
  bodySelect.onchange = () => {
    renderEditor();
    focus(bodySelect.value);
  };
  const historyEdit = async (direction: "undo" | "redo") => {
    const receipt = await session![direction]();
    if (receipt && receipt.status !== "accepted") throw new Error(receipt.message ?? receipt.status);
  };
  element("undo").onclick = () => run(() => historyEdit("undo"));
  element("redo").onclick = () => run(() => historyEdit("redo"));
  terrainToggle.onchange = () => terrain?.setVisible(terrainToggle.checked);
  waterToggle.onchange = () => water!.setVisible(waterToggle.checked, waterToggle.checked);
  roadToggle.onchange = () =>
    run(async () => {
      terrain?.setPlan(currentPlan!, { route: roadToggle.checked });
    });
  crossingToggle.onchange = () => crossings?.setVisible(crossingToggle.checked);
  Object.assign(window, {
    waterPreview: {
      get rasterTransfer() {
        return compiler.transferStats && { ...compiler.transferStats };
      },
      get terrainPreparation() {
        return lastPreparation && { ...lastPreparation };
      },
      get session() {
        return session;
      },
      get plan() {
        return currentPlan;
      },
      get system() {
        return water!.system;
      },
      get environment() {
        return environment?.snapshot;
      },
      get camera() {
        const p = camera.entity.transform.worldPosition,
          f = camera.entity.transform.worldForward;
        return { mode: cameraControl!.mode, position: [p.x, p.y, p.z], forward: [f.x, f.y, f.z] };
      },
      sampleWater: (x: number, z: number, id?: string) => water!.system.sample(x, z, id),
      sampleDrops: (x: number, y: number, z: number, id?: string) => water!.system.sampleDrops(x, y, z, id)
    }
  });
  window.addEventListener(
    "pagehide",
    () => {
      disposed = true;
      lifetime.abort();
      compiler.dispose();
      cameraControl!.destroy();
      void activeWork
        .finally(async () => {
          await Promise.allSettled([...publications]);
          await water?.destroy();
          environment?.dispose();
          environment?.entity.destroy();
          crossings?.dispose();
          terrain?.dispose();
          terrainRoot?.destroy();
          engine?.destroy();
        })
        .catch((error) => console.warn("Water preview cleanup", error));
    },
    { once: true }
  );
  run(async () => {
    await regenerate();
  });
} catch (error) {
  loadingStage.textContent = `初始化失败：${String(error)}`;
  message(String(error), true);
  console.error(error);
  compiler.dispose();
  cameraControl?.destroy();
  await water?.destroy();
  environment?.dispose();
  environment?.entity.destroy();
  crossings?.dispose();
  terrain?.dispose();
  terrainRoot?.destroy();
  engine?.destroy();
}
