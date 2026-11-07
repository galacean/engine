import { startViewer, sendCommand } from "./Viewer";
import { DEFAULT_ROCK } from "@galacean/engine-terrain/rock-formation/generator/rock-body.js";
import { ROCK_SCENE_PRESETS } from "./presets.js";
const DEFAULT_REDUCTION = { enabled: true, error: 0.008, targetTriangles: 1000 };
const DEFAULT_SURFACE = { strength: 0.35, roughness: 1, detail: true, color: "#b8bcc2" };
const storageKey = "procedural-rock-example-v1";
const root = document.querySelector("#rock-lab"),
  statusLabel = document.querySelector("#status");
const definitions = [
  { key: "obbWidth", label: "OBB 宽度", min: 1, max: 80, step: 0.1, group: "obb", unit: " m" },
  { key: "obbHeight", label: "OBB 高度", min: 1, max: 120, step: 0.1, group: "obb", unit: " m" },
  { key: "obbDepth", label: "OBB 深度", min: 1, max: 80, step: 0.1, group: "obb", unit: " m" },
  { key: "topScale", label: "顶部截面范围", min: 0.08, max: 1, step: 0.01, group: "envelope", unit: "%" },
  { key: "shoulderScale", label: "肩部宽度", min: 0.08, max: 1, step: 0.01, group: "envelope", unit: "%" },
  { key: "shoulderHeight", label: "肩部高度", min: 0.15, max: 0.9, step: 0.01, group: "envelope", unit: "%" },
  { key: "bottomScale", label: "底部截面范围", min: 0, max: 1, step: 0.01, group: "envelope", unit: "%" },
  { key: "topRoughness", label: "顶部起伏", min: 0, max: 1, step: 0.01, group: "roof", unit: "%" },
  { key: "topSlope", label: "顶部倾斜", min: 0, max: 75, step: 1, group: "roof", unit: "°" },
  { key: "topDirection", label: "顶部坡向", min: 0, max: 360, step: 1, group: "roof", unit: "°" },
  { key: "wallCount", label: "组合轮廓数量", min: 4, max: 28, step: 1, group: "wall" },
  { key: "wallOverlap", label: "岩块横向宽度", min: 0, max: 1, step: 0.01, group: "wall", unit: "%" },
  { key: "wallProtrusion", label: "岩块伸出高度", min: 0, max: 1, step: 0.01, group: "wall", unit: "%" },
  { key: "wallLength", label: "岩块纵向长度", min: 0.5, max: 3, step: 0.05, group: "wall", unit: " 倍" },
  { key: "wallTilt", label: "岩块倾斜", min: -35, max: 35, step: 1, group: "wall", unit: "°" },
  { key: "wallStrength", label: "切削强度", min: 0, max: 1, step: 0.01, group: "wall", unit: "%" }
];

let saved = {};
try {
  saved = JSON.parse(localStorage.getItem(storageKey) || "{}") || {};
} catch {}
const rocks = new Map(
  ROCK_SCENE_PRESETS.map((preset) => {
    const stored = Array.isArray(saved.rocks) ? saved.rocks.find((rock) => rock.id === preset.id) : null;
    const parameters = { ...DEFAULT_ROCK, ...preset.parameters };
    for (const def of definitions)
      if (Number.isFinite(stored?.parameters?.[def.key]))
        parameters[def.key] = Math.max(def.min, Math.min(def.max, stored.parameters[def.key]));
    if (Number.isFinite(stored?.parameters?.seed))
      parameters.seed = Math.max(1, Math.min(999999, Math.floor(stored.parameters.seed)));
    if ([32, 48, 72, 96].includes(stored?.parameters?.resolution)) parameters.resolution = stored.parameters.resolution;
    const surface = { ...DEFAULT_SURFACE };
    if (/^#[0-9a-f]{6}$/i.test(stored?.surface?.color || "")) surface.color = stored.surface.color;
    for (const [key, min, max] of [
      ["strength", 0, 2],
      ["roughness", 0.3, 1]
    ])
      if (Number.isFinite(stored?.surface?.[key])) surface[key] = Math.max(min, Math.min(max, stored.surface[key]));
    if (typeof stored?.surface?.detail === "boolean") surface.detail = stored.surface.detail;
    surface.tileSize = Math.max(parameters.obbWidth, parameters.obbHeight, parameters.obbDepth) / 2;
    const reduction = { ...DEFAULT_REDUCTION };
    if (typeof stored?.reduction?.enabled === "boolean") reduction.enabled = stored.reduction.enabled;
    if ([0.001, 0.004, 0.008].includes(stored?.reduction?.error)) reduction.error = stored.reduction.error;
    if ([0, 500, 1000, 1500, 2000].includes(stored?.reduction?.targetTriangles))
      reduction.targetTriangles = stored.reduction.targetTriangles;
    const grass = { enabled: true, density: 4, ...preset.grass };
    if (typeof stored?.grass?.enabled === "boolean") grass.enabled = stored.grass.enabled;
    if (Number.isFinite(stored?.grass?.density)) grass.density = Math.max(0, Math.min(12, stored.grass.density));
    return [
      preset.id,
      {
        preset,
        parameters,
        surface,
        grass,
        reduction,
        mesh: null,
        meshId: 0,
        meshSeed: parameters.seed,
        requestId: 0,
        appliedId: 0,
        error: null,
        grassStats: null
      }
    ];
  })
);
let selectedId = rocks.has(saved.selectedId) ? saved.selectedId : ROCK_SCENE_PRESETS[4].id;
const currentRock = () => rocks.get(selectedId);
const inspection = (window.rockLab = {
  parameters: {},
  stats: null,
  bounds: null,
  composition: null,
  status: "loading",
  error: null,
  requestId: 0,
  appliedId: 0,
  selectedRockId: selectedId,
  scene: [],
  view: "overview",
  wireframe: false,
  surface: { loaded: false, mode: "projected", settings: {}, budget: null }
});
let nativeReady = false,
  surfaceError = null,
  generatedMaterial = "projected",
  serial = 0,
  busy = null;
const pending = new Map(),
  debounces = new Map(),
  grassTimers = new Map();
let workerReady = false,
  initialViewPending = true;
const container = document.querySelector("#generated-view");
function sendNative(command) {
  if (nativeReady) sendCommand(command);
}
function updateDisplay() {
  sendNative({ action: "display", obb: document.querySelector("#show-obb").checked, wireframe: inspection.wireframe });
}
function setView(view) {
  inspection.view = view;
  sendNative({ action: "view", view, rockId: selectedId });
  document
    .querySelectorAll("[data-view]")
    .forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.view === view)));
}
function sendMesh(rock) {
  sendNative({ action: "mesh", rockId: rock.preset.id, mesh: rock.mesh, id: rock.meshId, seed: rock.meshSeed });
}
function remember() {
  try {
    localStorage.setItem(
      storageKey,
      JSON.stringify({
        selectedId,
        rocks: [...rocks.values()].map(({ preset, parameters, surface, grass, reduction }) => ({
          id: preset.id,
          parameters,
          surface,
          grass,
          reduction
        }))
      })
    );
  } catch {}
}
function selectRock(id, notify = true) {
  if (!rocks.has(id)) return;
  selectedId = id;
  syncInputs();
  renderSelection();
  remember();
  if (notify) sendNative({ action: "select", rockId: id });
  // Keep the camera still when selecting in a group; focus is an explicit action.
  updateStatus();
}
function onViewerEvent(data) {
  const rock = rocks.get(data.rockId);
  if (data.event === "error") {
    const message = `Seed 预览失败：${data.error}`;
    if (rock) rock.error = message;
    else surfaceError = message;
  }
  if (data.event === "ready") {
    nativeReady = true;
    surfaceError = null;
    inspection.surface.loaded = true;
    inspection.surface.renderer = data.renderer;
    inspection.surface.grassShader = data.grassShader;
    inspection.surface.sharedGrassColorField = data.sharedGrassColorField;
    container.dataset.renderer = data.renderer;
    container.dataset.grassShader = data.grassShader;
    container.dataset.sharedGrassColorField = String(data.sharedGrassColorField);
    inspection.surface.budget = { rockTextures: 2, width: 1024, height: 1024 };
    document.querySelector("#texture-stats").textContent = "全部岩石共享灰度底图与法线 · 2 张 1024² · 每块独立平铺";
    sendNative({
      action: "scene",
      selectedRockId: selectedId,
      rocks: [...rocks.values()].map(({ preset, parameters, surface, grass }) => ({
        rockId: preset.id,
        position: preset.position,
        dimensions: [parameters.obbWidth, parameters.obbHeight, parameters.obbDepth],
        seed: parameters.seed,
        settings: surface,
        grass
      }))
    });
    for (const entry of rocks.values()) {
      entry.appliedId = 0;
      if (entry.mesh) sendMesh(entry);
    }
    updateSurface(currentRock());
    updateDisplay();
    setView(inspection.view);
  }
  if (data.event === "selected") selectRock(data.rockId, false);
  if (data.event === "applied" && rock && data.requestId === rock.requestId) {
    rock.appliedId = data.requestId;
    rock.error = null;
  }
  if (data.event === "grass" && rock) {
    rock.grassStats = { count: data.grassCount, triangles: data.grassTriangles };
    if (rock === currentRock()) renderGrassStats();
  }
  updateStatus();
}

function updateStatus() {
  const selected = currentRock(),
    entries = [...rocks.values()];
  const complete = entries.filter((rock) => rock.mesh && rock.appliedId === rock.requestId && !rock.error).length;
  const working = busy || pending.size || debounces.size;
  inspection.error = surfaceError || entries.find((rock) => rock.error)?.error || null;
  const ready = nativeReady && !working && !inspection.error && complete === rocks.size;
  inspection.status = inspection.error ? "error" : ready ? "ready" : "loading";
  inspection.selectedRockId = selectedId;
  inspection.requestId = selected.requestId;
  inspection.appliedId = selected.appliedId;
  inspection.parameters = { ...selected.parameters };
  inspection.surface.settings = { ...selected.surface };
  inspection.scene = entries.map((rock) => ({
    id: rock.preset.id,
    name: rock.preset.name,
    parameters: { ...rock.parameters },
    surface: { ...rock.surface },
    requestId: rock.requestId,
    appliedId: rock.appliedId,
    triangles: rock.mesh?.indices.length / 3 || 0,
    position: rock.preset.position
  }));
  for (const el of [root, document.body]) {
    el.dataset.ready = String(ready);
    el.dataset.state = inspection.status;
    el.dataset.selectedRock = selectedId;
  }
  const triangleCount = entries.reduce((sum, rock) => sum + (rock.mesh?.indices.length / 3 || 0), 0);
  document.querySelector("#scene-stats").textContent =
    `场景 ${complete}/${rocks.size} 块已就绪 · 岩石共 ${triangleCount.toLocaleString()} 三角形`;
  const readyMeshes = entries.filter((rock) => rock.mesh && rock.appliedId === rock.requestId && !rock.error);
  const projected = readyMeshes.length
    ? Math.ceil((readyMeshes.reduce((sum, rock) => sum + rock.mesh.stats.triangles, 0) / readyMeshes.length) * 100)
    : 0;
  const budgetLabel = document.querySelector("#scene-budget");
  budgetLabel.textContent = readyMeshes.length
    ? `按当前 ${readyMeshes.length} 块均值推算：100 块约 ${projected.toLocaleString()} / 100,000 三角形（仅岩石）`
    : "正在计算岩石预算…";
  budgetLabel.classList.toggle("limit-note", projected > 100000);
  budgetLabel.dataset.triangles = triangleCount;
  budgetLabel.dataset.projected = projected;
  statusLabel.textContent =
    inspection.error ||
    (ready
      ? "已更新 · 每块参数独立保存"
      : !nativeReady
        ? "正在加载 Seed 场景…"
        : `正在更新岩石 ${complete}/${rocks.size}…`);
  statusLabel.classList.toggle("error", !!inspection.error);
  for (const rock of entries) {
    const button = document.querySelector(`[data-rock-id="${rock.preset.id}"]`);
    button.dataset.revision = rock.requestId;
    button.dataset.applied = rock.appliedId;
    button.dataset.seed = rock.parameters.seed;
    button.dataset.tileSize = rock.surface.tileSize;
  }
  if (initialViewPending && ready) {
    initialViewPending = false;
    setView(inspection.view);
  }
}
const compositionPanel = document.querySelector("#composition-controls"),
  compositionCanvas = document.querySelector("#composition-canvas");
const compositionContext = compositionCanvas.getContext("2d");
let compositionExpanded = false;
function drawComposition() {
  const width = compositionCanvas.clientWidth,
    height = compositionCanvas.clientHeight;
  if (!width || !height) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 2),
    ctx = compositionContext,
    composition = inspection.composition;
  compositionCanvas.width = Math.round(width * ratio);
  compositionCanvas.height = Math.round(height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#b5bcc3";
  ctx.font = "11px sans-serif";
  if (!composition) {
    ctx.fillText("暂无轮廓组合数据", 12, 24);
    return;
  }
  const scale = Math.min((width - 64) / composition.width, (height - 38) / composition.height);
  const plotWidth = composition.width * scale,
    plotHeight = composition.height * scale;
  const left = (width - plotWidth) / 2,
    top = (height - plotHeight) / 2;
  const x = (u) => left + u * scale,
    y = (v) => top + (composition.height / 2 - v) * scale;
  ctx.save();
  ctx.beginPath();
  ctx.rect(left, top, plotWidth, plotHeight);
  ctx.clip();
  ctx.fillStyle = "#171e25";
  ctx.fillRect(left, top, plotWidth, plotHeight);
  const shapes = composition.shapes
    .map((shape, index) => ({ shape, number: index + 1 }))
    .sort((a, b) => a.shape.level - b.shape.level);
  for (const { shape, number } of shapes) {
    const hue = (number * 137.508 + 30) % 360;
    const center = shape.points.reduce(
      (sum, point) => [sum[0] + point[0] / shape.points.length, sum[1] + point[1] / shape.points.length],
      [0, 0]
    );
    for (const offset of [-composition.width, 0, composition.width]) {
      ctx.beginPath();
      shape.points.forEach(([u, v], index) =>
        index ? ctx.lineTo(x(u + offset), y(v)) : ctx.moveTo(x(u + offset), y(v))
      );
      ctx.closePath();
      ctx.fillStyle = `hsla(${hue},55%,58%,.38)`;
      ctx.fill();
      ctx.strokeStyle = `hsl(${hue},65%,70%)`;
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = "#f2f4f5";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = "11px sans-serif";
      ctx.fillText(String(number), x(center[0] + offset), y(center[1]));
    }
  }
  ctx.restore();
  ctx.strokeStyle = "#5f6b76";
  ctx.lineWidth = 1;
  ctx.strokeRect(left, top, plotWidth, plotHeight);
  ctx.fillStyle = "#b5bcc3";
  ctx.font = "10px sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";
  ctx.fillText("100%", left - 4, top + 5);
  ctx.fillText("0%", left - 4, top + plotHeight - 5);
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText("0°", left, top + plotHeight + 4);
  ctx.textAlign = "right";
  ctx.fillText("周向 360°", left + plotWidth, top + plotHeight + 4);
}
new ResizeObserver(drawComposition).observe(compositionCanvas);
compositionPanel.addEventListener("toggle", drawComposition);
document.querySelector("#composition-zoom").addEventListener("click", (event) => {
  compositionExpanded = !compositionExpanded;
  compositionCanvas.style.width = compositionExpanded ? "200%" : "100%";
  compositionCanvas.style.height = compositionExpanded ? "300px" : "150px";
  event.currentTarget.textContent = compositionExpanded ? "还原展开图" : "放大展开图";
  event.currentTarget.setAttribute("aria-pressed", String(compositionExpanded));
  drawComposition();
});
function renderGrassStats() {
  const rock = currentRock(),
    stats = rock.grassStats;
  document.querySelector("#grass-stats").textContent = !rock.grass.enabled
    ? "当前岩石草地已关闭"
    : stats
      ? `${stats.count.toLocaleString()} 丛 · Seed 原生草 · 顶部与岩壁台阶`
      : "正在生成顶部草…";
  inspection.grass = { ...rock.grass, ...stats, shader: "Terrain/Grass" };
}
function renderSelection() {
  const rock = currentRock(),
    { parameters, mesh, preset } = rock;
  document.querySelector("#rock-select").value = selectedId;
  document.querySelector("#selected-name").textContent = `${preset.range} · ${preset.name}`;
  document.querySelector("#selected-description").textContent = preset.description;
  for (const entry of rocks.values()) {
    const button = document.querySelector(`[data-rock-id="${entry.preset.id}"]`);
    button.setAttribute("aria-pressed", String(entry === rock));
    button.querySelector(".rock-dimensions").textContent =
      [entry.parameters.obbWidth, entry.parameters.obbHeight, entry.parameters.obbDepth]
        .map((n) => Number(n.toFixed(1)))
        .join(" × ") + " m";
  }
  const dimensions = [parameters.obbWidth, parameters.obbHeight, parameters.obbDepth]
    .map((n) => n.toFixed(1))
    .join(" × ");
  document.querySelector("#obb-readout").textContent =
    `选中 ${preset.name} · OBB ${dimensions} m。拖动旋转，滚轮缩放；点选不移动视角。`;
  inspection.stats = mesh?.stats || null;
  inspection.bounds = mesh?.bounds || null;
  inspection.envelopeBounds = mesh?.envelopeBounds || null;
  inspection.composition = mesh?.composition || null;
  drawComposition();
  renderGrassStats();
  document.querySelector("#generated-stats").textContent = mesh
    ? `选中 ${preset.name} · ${(mesh.indices.length / 3).toLocaleString()} 三角形 · ${(mesh.stats.bakeMs + mesh.stats.simplifyMs).toFixed(1)} ms · 最大面转角 ${mesh.stats.maxFaceTurn.toFixed(1)}° · 超限边 ${mesh.stats.sharpEdges}`
    : `选中 ${preset.name} · 等待生成…`;
  const meshStats = document.querySelector("#mesh-stats");
  if (mesh) {
    const st = mesh.stats;
    meshStats.textContent = `${st.rawTriangles.toLocaleString()} → ${st.triangles.toLocaleString()} 三角形 · 减少 ${(st.reduction * 100).toFixed(1)}%\n几何缓冲 ${(st.rawBytes / 1024).toFixed(0)} → ${(st.meshBytes / 1024).toFixed(0)} KiB\n生成 ${st.bakeMs.toFixed(1)} ms + 减面 ${st.simplifyMs.toFixed(1)} ms`;
    if (st.targetTriangles && st.simplificationMethod !== "disabled")
      meshStats.textContent += `\n目标 ${st.targetTriangles.toLocaleString()} 面 · ${st.budgetMet ? "已达标" : "超预算，保留形状约束"}`;
    meshStats.dataset.triangles = st.triangles;
    meshStats.dataset.budget = st.targetTriangles || 0;
    meshStats.dataset.budgetMet = String(st.budgetMet);
    const safety =
      st.simplificationMethod === "original-safety-fallback"
        ? "当前形状未找到满足约束的减面结果，保留原始网格。"
        : st.targetTriangles && !st.budgetMet && st.simplificationMethod !== "disabled"
          ? "此形状在当前误差与转折约束下超过预算，未强行削掉轮廓。"
          : !st.targetTriangles && st.acceptedError && st.acceptedError < st.requestedError
            ? "为保留拓扑与转折约束，已自动收紧减面误差。"
            : "";
    document.querySelector("#mesh-safety").textContent = safety;
    document.querySelector("#mesh-safety").hidden = !safety;
  } else meshStats.textContent = "等待网格…";
  const note = document.querySelector("#slope-note"),
    effective = mesh?.stats.effectiveTopSlope;
  note.hidden = !Number.isFinite(effective) || Math.abs(effective - parameters.topSlope) < 0.05;
  note.textContent = note.hidden
    ? ""
    : `实际坡度 ${effective.toFixed(1)}°；当前形状下，请求的 ${parameters.topSlope}° 已限幅。`;
}
const rockList = document.querySelector("#rock-list"),
  rockSelect = document.querySelector("#rock-select");
for (const range of ["近景", "中景", "远景"]) {
  const group = document.createElement("div");
  group.className = "rock-group";
  const label = document.createElement("h3");
  label.textContent = range;
  const buttons = document.createElement("div");
  buttons.className = "rock-options";
  const optgroup = document.createElement("optgroup");
  optgroup.label = range;
  for (const rock of rocks.values())
    if (rock.preset.range === range) {
      const { id, name } = rock.preset,
        button = document.createElement("button");
      button.type = "button";
      button.dataset.rockId = id;
      button.setAttribute("aria-pressed", String(id === selectedId));
      const title = document.createElement("span");
      title.textContent = name;
      const dimensions = document.createElement("span");
      dimensions.className = "rock-dimensions";
      button.append(title, dimensions);
      button.addEventListener("click", () => selectRock(id));
      buttons.append(button);
      const option = document.createElement("option");
      option.value = id;
      option.textContent = `${range} · ${name}`;
      optgroup.append(option);
    }
  group.append(label, buttons);
  rockList.append(group);
  rockSelect.append(optgroup);
}
rockSelect.addEventListener("change", () => selectRock(rockSelect.value));
const worker = new Worker(new URL("./Bake.worker.js", import.meta.url), { type: "module" });
worker.onmessage = ({ data }) => {
  if (data.ready) {
    workerReady = true;
    pump();
    return;
  }
  busy = null;
  const rock = rocks.get(data.rockId);
  // A result belongs to a rock and a revision, never whichever panel is selected now.
  if (rock && data.id === rock.requestId) {
    try {
      if (data.error) throw Error(data.error);
      if (!data.mesh?.positions?.length || !data.mesh?.normals?.length || !data.mesh?.indices?.length)
        throw Error("未收到有效岩石几何");
      rock.mesh = data.mesh;
      rock.meshId = data.id;
      rock.meshSeed = rock.parameters.seed;
      rock.error = null;
      sendMesh(rock);
      if (rock === currentRock()) renderSelection();
    } catch (error) {
      rock.error = `${rock.preset.name} 生成失败：${error.message}`;
    }
  }
  pump();
  updateStatus();
};
worker.onerror = (event) => {
  surfaceError = `几何 Worker 失败：${event.message}`;
  busy = null;
  pending.clear();
  for (const timer of debounces.values()) clearTimeout(timer);
  debounces.clear();
  updateStatus();
};
function pump() {
  if (busy || !pending.size || !workerReady) return;
  const [rockId, request] = pending.entries().next().value;
  pending.delete(rockId);
  busy = request;
  worker.postMessage(request);
  updateStatus();
}
function requestBuild(rock, immediate = false) {
  rock.error = null;
  rock.requestId = ++serial;
  const rockId = rock.preset.id,
    request = { rockId, id: rock.requestId, parameters: { ...rock.parameters }, reduction: { ...rock.reduction } };
  clearTimeout(debounces.get(rockId));
  debounces.delete(rockId);
  pending.delete(rockId);
  if (immediate) {
    pending.set(rockId, request);
    pump();
  } else
    debounces.set(
      rockId,
      setTimeout(() => {
        debounces.delete(rockId);
        pending.set(rockId, request);
        pump();
        updateStatus();
      }, 100)
    );
  updateStatus();
}
function updateSurface(rock) {
  sendNative({ action: "surface", rockId: rock.preset.id, settings: { ...rock.surface }, mode: generatedMaterial });
  if (rock === currentRock()) inspection.surface.settings = { ...rock.surface };
}
function rebuildGrass(rock) {
  clearTimeout(grassTimers.get(rock.preset.id));
  grassTimers.delete(rock.preset.id);
  sendNative({ action: "grass", rockId: rock.preset.id, ...rock.grass, seed: rock.parameters.seed });
}
const inputs = new Map(),
  surfaceInputs = new Map();
function syncInputs() {
  const rock = currentRock(),
    { parameters, surface, grass } = rock;
  for (const d of definitions) {
    const { input, output } = inputs.get(d.key);
    input.value = parameters[d.key];
    output.value =
      d.unit === "%"
        ? `${Math.round(parameters[d.key] * 100)}%`
        : `${parameters[d.key].toFixed(d.step === 1 ? 0 : 2)}${d.unit || ""}`;
  }
  document.querySelector("#mesh-reduction").checked = rock.reduction.enabled;
  document.querySelector("#mesh-error").value = rock.reduction.error;
  document.querySelector("#mesh-error").disabled = !rock.reduction.enabled || rock.reduction.targetTriangles > 0;
  document.querySelector("#mesh-budget").value = rock.reduction.targetTriangles;
  document.querySelector("#mesh-budget").disabled = !rock.reduction.enabled;
  document.querySelector("#mesh-error-label").hidden = rock.reduction.targetTriangles > 0;
  document.querySelector("#seed").value = parameters.seed;
  document.querySelector("#resolution").value = parameters.resolution;
  const longest = Math.max(parameters.obbWidth, parameters.obbHeight, parameters.obbDepth),
    tileSize = longest / 2;
  const changed = surface.tileSize !== tileSize;
  surface.tileSize = tileSize;
  document.querySelector("#auto-tile-size").textContent =
    `${tileSize.toFixed(2)} m（最长边 ${longest.toFixed(2)} m ÷ 2）`;
  if (changed) updateSurface(rock);
  document.querySelector("#surface-color").value = document.querySelector("#surface-color-hex").value = surface.color;
  document.querySelector("#surface-color-hex").setCustomValidity("");
  for (const [key, { input, output }] of surfaceInputs) {
    input.value = surface[key];
    output.value = surface[key].toFixed(2);
  }
  document.querySelector("#detail-normal").checked = surface.detail;
  document.querySelector("#top-grass").checked = grass.enabled;
  document.querySelector("#grass-density").value = grass.density;
  document.querySelector("#grass-density-value").value = `${grass.density} 丛/m²`;
}
for (const d of definitions) {
  const label = document.createElement("label");
  label.className = "parameter";
  label.htmlFor = `parameter-${d.key}`;
  const row = document.createElement("span");
  row.className = "parameter-label";
  const title = document.createElement("span");
  title.textContent = d.label;
  const output = document.createElement("output"),
    input = document.createElement("input");
  Object.assign(input, { type: "range", id: `parameter-${d.key}`, min: d.min, max: d.max, step: d.step });
  input.dataset.parameter = d.key;
  input.addEventListener("input", () => {
    const rock = currentRock();
    rock.parameters[d.key] = Number(input.value);
    syncInputs();
    renderSelection();
    remember();
    requestBuild(rock);
  });
  row.append(title, output);
  label.append(row, input);
  document.querySelector(`#${d.group}-parameters`).append(label);
  inputs.set(d.key, { input, output });
}
document.querySelector("#seed").addEventListener("change", (event) => {
  const rock = currentRock();
  rock.parameters.seed = Math.max(1, Math.min(999999, Math.floor(Number(event.target.value)) || 1));
  syncInputs();
  remember();
  requestBuild(rock, true);
});
document.querySelector("#next-seed").addEventListener("click", () => {
  const rock = currentRock();
  rock.parameters.seed = (rock.parameters.seed % 990000) + 137;
  syncInputs();
  remember();
  requestBuild(rock, true);
});
for (const id of ["mesh-reduction", "mesh-error", "mesh-budget"])
  document.querySelector(`#${id}`).addEventListener("change", () => {
    const rock = currentRock();
    rock.reduction = {
      enabled: document.querySelector("#mesh-reduction").checked,
      error: Number(document.querySelector("#mesh-error").value),
      targetTriangles: Number(document.querySelector("#mesh-budget").value)
    };
    syncInputs();
    remember();
    requestBuild(rock, true);
  });
document.querySelector("#resolution").addEventListener("change", (event) => {
  const rock = currentRock();
  rock.parameters.resolution = Number(event.target.value);
  remember();
  requestBuild(rock, true);
});
document.querySelector("#reset").addEventListener("click", () => {
  const rock = currentRock();
  rock.parameters = { ...DEFAULT_ROCK, ...rock.preset.parameters };
  syncInputs();
  renderSelection();
  remember();
  requestBuild(rock, true);
});
document.querySelector("#show-obb").addEventListener("change", updateDisplay);
document.querySelector("#wireframe").addEventListener("change", (event) => {
  inspection.wireframe = event.target.checked;
  updateDisplay();
});
document.querySelector("#generated-material").addEventListener("change", (event) => {
  generatedMaterial = event.target.value;
  inspection.surface.mode = generatedMaterial;
  updateSurface(currentRock());
});
const colorPicker = document.querySelector("#surface-color"),
  colorHex = document.querySelector("#surface-color-hex");
function setSurfaceColor(value) {
  if (!/^#[0-9a-f]{6}$/i.test(value)) return false;
  const rock = currentRock();
  rock.surface.color = value.toLowerCase();
  colorPicker.value = colorHex.value = rock.surface.color;
  colorHex.setCustomValidity("");
  updateSurface(rock);
  remember();
  return true;
}
document.querySelector("#reset-color").addEventListener("click", () => setSurfaceColor(DEFAULT_SURFACE.color));
colorPicker.addEventListener("input", () => setSurfaceColor(colorPicker.value));
colorHex.addEventListener("input", () => {
  if (!setSurfaceColor(colorHex.value)) colorHex.setCustomValidity("请输入 #RRGGBB 格式的颜色");
});
colorHex.addEventListener("change", () => {
  if (!setSurfaceColor(colorHex.value)) {
    colorHex.value = currentRock().surface.color;
    colorHex.setCustomValidity("");
  }
});
document.querySelector("#top-grass").addEventListener("change", (event) => {
  const rock = currentRock();
  rock.grass.enabled = event.target.checked;
  rebuildGrass(rock);
  renderGrassStats();
  remember();
});
document.querySelector("#grass-density").addEventListener("input", (event) => {
  const rock = currentRock();
  rock.grass.density = Number(event.target.value);
  document.querySelector("#grass-density-value").value = `${rock.grass.density} 丛/m²`;
  clearTimeout(grassTimers.get(rock.preset.id));
  grassTimers.set(
    rock.preset.id,
    setTimeout(() => rebuildGrass(rock), 80)
  );
  remember();
});
for (const d of [
  { key: "strength", label: "细节法线强度", min: 0, max: 2, step: 0.05 },
  { key: "roughness", label: "表面粗糙度", min: 0.3, max: 1, step: 0.01 }
]) {
  const label = document.createElement("label");
  label.className = "parameter";
  label.htmlFor = `surface-${d.key}`;
  const row = document.createElement("span");
  row.className = "parameter-label";
  const title = document.createElement("span");
  title.textContent = d.label;
  const output = document.createElement("output"),
    input = document.createElement("input");
  Object.assign(input, { type: "range", id: `surface-${d.key}`, min: d.min, max: d.max, step: d.step });
  input.addEventListener("input", () => {
    const rock = currentRock();
    rock.surface[d.key] = Number(input.value);
    output.value = rock.surface[d.key].toFixed(2);
    updateSurface(rock);
    remember();
  });
  row.append(title, output);
  label.append(row, input);
  document.querySelector("#surface-parameters").append(label);
  surfaceInputs.set(d.key, { input, output });
}
document.querySelector("#detail-normal").addEventListener("change", (event) => {
  const rock = currentRock();
  rock.surface.detail = event.target.checked;
  updateSurface(rock);
  remember();
});
document.querySelectorAll("[data-view]").forEach((button) =>
  button.addEventListener("click", () => {
    initialViewPending = false;
    setView(button.dataset.view);
  })
);
syncInputs();
renderSelection();
for (const rock of rocks.values()) requestBuild(rock, true);
window.addEventListener("pagehide", () => {
  worker.terminate();
  for (const timer of [...grassTimers.values(), ...debounces.values()]) clearTimeout(timer);
});

void startViewer(onViewerEvent);
