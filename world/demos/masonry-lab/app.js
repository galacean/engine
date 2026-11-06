import { ResidentRenderer } from "/resident/offline/CapturedResidentRenderer.js";
import { resolvePlacements, placementKey } from "/resident/runtime/PlacementDocument.js";
let resident = null,
  residentState = null;
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const workspaceId = new URLSearchParams(location.search).get("workspace") || "original";
const workspaceStorageKey = "surface-lab-workspace:" + workspaceId;
let workspaceRestore = null,
  restoreLayers = null,
  workspaceStateConflict = false;
try {
  workspaceRestore = JSON.parse(localStorage.getItem(workspaceStorageKey) || "null");
} catch {}
const clone = (x) => JSON.parse(JSON.stringify(x));
const names = { source: "原材料组合", brick: "砖块", roof_tile: "瓦片", wooden_plank: "木板" };
let draft = null,
  saved = null,
  projectRevision = 0,
  selected = null,
  dirty = false,
  jsonDirty = false,
  untouchedExample = false,
  editVersion = 0;
let scene = null,
  status = null,
  buffers = [],
  displayedRevision = null,
  loadEpoch = 0,
  busy = true,
  posting = false;
let mode = "result",
  unit = "brick",
  mesh = null,
  rotation = [0.32, -0.55],
  dragging = null;
let nativeRequest = null,
  nativeCamera = null,
  activeSession = null,
  projectSessionInvalid = false;
const enabledLayers = new Set(),
  invalidInputs = new Set();
function error(t = "") {
  $("#error").textContent = t;
  $("#error").hidden = !t;
}
function notice(t = "") {
  $("#notice").textContent = t;
  $("#notice").hidden = !t;
}
async function api(path, data) {
  const r = await fetch(
    path,
    data === undefined
      ? { cache: "no-store", headers: { "X-Lab-Workspace": workspaceId } }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Lab-Workspace": workspaceId },
          body: JSON.stringify(data)
        }
  );
  const body = await r.json();
  if (!r.ok) throw new Error(body.error || `请求失败 (${r.status})`);
  return body;
}
const example = () => ({
  version: 2,
  geometries: [
    {
      id: "surface-1",
      geometry: { type: "plane", origin: [-3, 0, 0], u_axis: [1, 0, 0], v_axis: [0, 1, 0], width: 6, height: 3 }
    }
  ],
  bindings: [
    {
      id: "binding-1",
      geometry_id: "surface-1",
      rule: { type: "rows", spacing: "equal", direction: "u" },
      unit_id: "brick",
      footprint: { width: 0.65, height: 0.28, depth: 0.3 },
      seed: 0
    }
  ]
});
function binding() {
  return draft?.bindings.find((x) => x.id === selected);
}
const geometryKey = (d) => (d?.version === 2 ? "geometries" : "surfaces");
const referenceKey = (d) => (d?.version === 2 ? "geometry_id" : "surface_id");
const geometries = (d) => d?.[geometryKey(d)] || [];
const geometryId = (b, d = draft) => b?.[referenceKey(d)];
function surface() {
  return geometries(draft).find((x) => x.id === geometryId(binding()));
}
function upgradeDraft() {
  if (draft.version === 2) return;
  draft.version = 2;
  draft.geometries = draft.surfaces;
  delete draft.surfaces;
  for (const b of draft.bindings) {
    b.geometry_id = b.surface_id;
    delete b.surface_id;
  }
}
const isConnection = (s) => s?.source?.type === "connection";
const isPitched = (b) => b?.rule?.type === "roof_roof_intersection";
let ruleCatalog = null;
api("/api/workspaces")
  .then((c) => {
    $$("#workspace-links a").forEach((a) => {
      a.hidden = !c.workspaces.some((w) => w.id === a.dataset.workspace);
      if (a.dataset.workspace === workspaceId) a.setAttribute("aria-current", "page");
    });
    if (workspaceId !== "original") {
      $("#native-tab").hidden = true;
      $("#show-native").hidden = true;
      $("#workspace-note").textContent =
        "圆屋与方屋自动相接，圆屋顶带 Gothic 天窗。选择圆屋顶或方屋顶，可整体换材或展开局部修改。";
    }
  })
  .catch((e) => error(e.message));
api("/api/rules")
  .then((c) => {
    ruleCatalog = c;
    if (draft) syncControls();
  })
  .catch(() => {});
const isNative = (s) => ["native_wall", "native_roof"].includes(s?.source?.type);
const isBuilding = (s) => ["building_wall", "building_roof"].includes(s?.source?.type);
let selectedBuilding = null,
  selectedDormer = null;
function building() {
  return draft?.construction?.buildings.find((b) => b.id === selectedBuilding);
}
function buildingFor(s) {
  return draft?.construction?.buildings.find((b) => b.id === s?.source?.building_id);
}
function buildingFootprint(h) {
  return h.circle
    ? { center: h.circle.center, size: [2 * h.circle.radius, 2 * h.circle.radius], rotation: 0 }
    : h.rectangle;
}
function bounds(g) {
  if (g.type === "polyline") {
    const spans = [0, 1, 2].map((k) => Math.max(...g.points.map((p) => p[k])) - Math.min(...g.points.map((p) => p[k])));
    return { width: spans[0], height: spans[1], depth: spans[2] };
  }
  if (g.type === "triangulated") {
    const spans = [0, 1, 2].map(
      (k) => Math.max(...g.vertices.map((p) => p[k])) - Math.min(...g.vertices.map((p) => p[k]))
    );
    return { width: spans[0], height: spans[1], depth: spans[2] };
  }
  if (g.type === "plane") return { width: g.width, depth: 3 };
  const xs = g.points.map((p) => p[0]),
    zs = g.points.map((p) => p[2]);
  return { width: Math.max(...xs) - Math.min(...xs), depth: Math.max(...zs) - Math.min(...zs) };
}
function mark() {
  editVersion++;
  untouchedExample = false;
  dirty = true;
  $("#draft-note").textContent = "草稿有修改，生成成功后才会替换画面";
  if (!jsonDirty) $("#project-json").value = JSON.stringify(draft, null, 2);
}
function press(selector, field, value) {
  $$(selector).forEach((b) => {
    const yes = b.dataset[field] === value;
    b.classList.toggle("selected", yes);
    b.setAttribute("aria-pressed", String(yes));
  });
}
function syncControls() {
  const b = binding(),
    s = surface();
  syncBuildings();
  syncContactEditor();
  syncConnectionInventory();
  syncConnectionEdits();
  $("#units button[data-unit=source]").hidden = !isConnection(s);
  $("#binding-select").replaceChildren();
  for (const row of draft?.bindings || []) {
    const o = document.createElement("option");
    o.value = row.id;
    o.textContent = `${row.id} · ${geometryId(row)}`;
    $("#binding-select").append(o);
  }
  $("#binding-select").value = selected || "";
  $$("aside .control-card input,aside .control-card select,aside .control-card .choices button")
    .filter((x) => !x.closest(".building-card"))
    .forEach((x) => (x.disabled = !b));
  $("#connection-rule-name").hidden = !isConnection(s);
  $("#edit-connection").disabled =
    !b ||
    isConnection(s) ||
    !(
      ["native_wall", "building_wall", "native_roof", "building_roof"].includes(s?.source?.type) ||
      ["extruded_path", "profiled_path"].includes(s?.geometry?.type)
    );
  if (b && s && isConnection(s)) {
    $("#surface-type").value = "connection";
    $("#surface-type").disabled = true;
    for (const f of ["width", "height", "depth"]) {
      for (const prefix of ["surface", "footprint"]) {
        const el = $(`#${prefix}-${f}`);
        el.value = "";
        el.disabled = true;
        el.placeholder = "由来源决定";
      }
    }
    $("#surface-hole").disabled = true;
    $("#surface-hole").checked = false;
    $("#surface-hole-label").textContent = "占位和裁切由连接规则生成";
    $("#surface-id").textContent =
      `稳定 ID：${s.id} · 参与方：${(s.source.geometries ?? s.source.bindings).join("、")}`;
    for (const button of $$("#rules button")) button.hidden = true;
    $("#connection-rule-name").textContent =
      (ruleCatalog?.connection_rules?.[b.rule.type]?.label || b.rule.type) + " · 自动生成，保留原排列参数";
    for (const id of ["direction-field", "jitter-field", "phase-field", "length-field", "seed-source-field"])
      $("#" + id).hidden = true;
    $("#spacing").parentElement.hidden = true;
    $("#row-jitter").parentElement.hidden = true;
    $("#seed").disabled = true;
    $("#seed").value = "";
    $("#seed").placeholder = "由来源决定";
    for (const button of $$("#units button")) button.disabled = isPitched(b) && button.dataset.unit !== "source";
    if (isPitched(b)) $("#connection-rule-name").textContent = "坡屋顶交汇 · 沿用双方铺瓦、裁切与深度叠合";
    press("#units button", "unit", b.unit_id);
    unit = b.unit_id === "source" ? "brick" : b.unit_id;
  } else if (b && s) {
    const house = buildingFor(s),
      g = isBuilding(s)
        ? {
            type: s.source.type === "building_wall" ? "profiled_path" : "triangulated",
            height: house.height,
            holes: []
          }
        : s.geometry,
      size = isBuilding(s)
        ? { width: buildingFootprint(house).size[0], depth: buildingFootprint(house).size[1], height: house.height }
        : bounds(g),
      dimension = (v) =>
        ["profiled_path", "triangulated", "polyline"].includes(g.type) || isNative(s) ? Number(v.toFixed(3)) : v;
    $("#surface-type").value = ["profiled_path", "triangulated", "polyline"].includes(g.type)
      ? g.type
      : g.type === "plane"
        ? "plane"
        : g.closed
          ? "polygon"
          : "lpath";
    $("#surface-width").value = dimension(size.width);
    $("#surface-height").value = dimension(["triangulated", "polyline"].includes(g.type) ? size.height : g.height);
    $("#surface-depth").value = dimension(size.depth);
    $("#depth-field").hidden = g.type === "plane";
    $("#surface-width-label").textContent = ["triangulated", "polyline"].includes(g.type) ? "外接尺寸 X" : "水平跨度";
    $("#surface-height-label").textContent = ["triangulated", "polyline"].includes(g.type) ? "外接尺寸 Y" : "高度";
    $("#surface-depth-label").textContent = ["triangulated", "polyline"].includes(g.type) ? "外接尺寸 Z" : "进深";
    $("#surface-hole").checked = Boolean(g.holes?.length);
    const nativeHoles = ["profiled_path", "triangulated", "polyline"].includes(g.type) || isNative(s);
    $("#surface-hole").disabled = nativeHoles;
    $("#surface-hole-label").textContent =
      g.type === "polyline"
        ? "曲线路径与局部区间可在 JSON 中编辑"
        : nativeHoles
          ? "保留原有洞口，详细编辑使用 JSON"
          : "加入一个矩形开口";
    const readOnly = ["profiled_path", "triangulated", "polyline"].includes(g.type) || isNative(s);
    $("#surface-type").disabled = readOnly;
    $("#surface-width").disabled = readOnly || size.width === 0;
    $("#surface-height").disabled = readOnly;
    $("#surface-depth").disabled = readOnly || size.depth === 0;
    $("#surface-id").textContent =
      `稳定 ID：${s.id} · 绑定 ${b.id}${isNative(s) ? " · 原表面归属保留，几何变更需原生重建" : ""}`;
    const r = b.rule;
    for (const button of $$("#rules button"))
      button.hidden = (button.dataset.rule === "repeat") !== (g.type === "polyline");
    press("#rules button", "rule", r.type);
    press("#units button", "unit", b.unit_id);
    $("#direction").value = r.direction || "u";
    $("#spacing").value = r.spacing || "equal";
    $("#jitter").value = r.jitter || 0;
    $("#row-jitter").value = r.row_jitter || 0;
    $("#phase").value = r.phase || 0;
    $("#max-length").value = r.max_length || 3;
    $("#seed").value = b.seed === "source" ? 0 : b.seed;
    $("#seed").disabled = b.seed === "source";
    $("#seed").placeholder = "";
    $("#seed-source-field").hidden = !isBuilding(s);
    $("#seed-source").checked = b.seed === "source";
    $("#spacing").disabled = ["rings", "courses", "overlap_rows"].includes(r.type);
    $("#row-jitter").disabled = ["rings", "courses", "overlap_rows"].includes(r.type);
    $("#direction-field").hidden = ["rings", "courses", "overlap_rows", "repeat"].includes(r.type);
    $("#jitter-field").hidden = ["rings", "courses", "overlap_rows"].includes(r.type);
    $("#spacing").parentElement.hidden = ["courses", "overlap_rows"].includes(r.type);
    $("#row-jitter").parentElement.hidden = ["courses", "overlap_rows", "repeat"].includes(r.type);
    $("#phase-field").hidden = true;
    $("#length-field").hidden = r.type !== "strips";
    for (const f of ["width", "height", "depth"]) {
      $(`#footprint-${f}`).value = b.footprint[f];
      $(`#footprint-${f}`).placeholder = "";
    }
    unit = b.unit_id;
  }
  if (!jsonDirty) $("#project-json").value = JSON.stringify(draft, null, 2);
  $("#import-native").disabled = Boolean(draft?.construction);
  $("#import-roof").disabled = Boolean(draft?.construction);
  $("#draft-note").textContent = dirty ? "草稿有修改，尚未生成" : "已保存的项目草稿";
  $("#remove-binding").disabled = !b;
  setBusy();
}
function basicDocument(d) {
  if (!d || ![1, 2].includes(d.version) || !Array.isArray(d[geometryKey(d)]) || !Array.isArray(d.bindings))
    throw new Error("项目需要 v1 surfaces 或 v2 geometries，以及 bindings");
  for (const b of d.bindings)
    if (b.seed !== "source" && (!Number.isSafeInteger(b.seed) || b.seed < 0))
      throw new Error("网页种子需要精确非负整数；完整 uint64 可通过 API 提交");
  return d;
}
async function readProject() {
  const revisionAtRead = editVersion;
  const p = await api("/api/project");
  if (editVersion !== revisionAtRead) throw new Error("读取期间草稿发生修改，已保留你的修改，请再次读取");
  editVersion++;
  saved = clone(p.document);
  projectRevision = p.document_revision;
  projectSessionInvalid = false;
  workspaceStateConflict = false;
  draft = clone(saved);
  if (!draft.construction && !draft.bindings.length && !geometries(draft).length) {
    draft = example();
    dirty = true;
    untouchedExample = true;
  } else {
    dirty = false;
    untouchedExample = false;
  }
  selected = draft.bindings[0]?.id;
  jsonDirty = false;
  invalidInputs.clear();
  syncControls();
}

function syncBuildings() {
  $("#new-building-scene").disabled = Boolean(draft?.construction);
  const rows = draft?.construction?.buildings || [];
  $("#building-controls").hidden = !rows.length;
  if (!rows.some((b) => b.id === selectedBuilding)) selectedBuilding = rows[0]?.id;
  const select = $("#building-select");
  select.replaceChildren();
  for (const row of rows) {
    const o = document.createElement("option");
    o.value = row.id;
    o.textContent = row.id;
    select.append(o);
  }
  select.value = selectedBuilding || "";
  const h = building();
  if (!h) return;
  const shape = buildingFootprint(h);
  $("#building-width-label").textContent = h.circle ? "直径" : "宽度";
  $("#building-rotation-label").textContent = h.circle ? "圆周起点" : "旋转";
  $("#building-depth").disabled = Boolean(h.circle);
  $("#building-width").setAttribute("aria-label", h.circle ? "房屋直径" : "房屋宽度");
  $("#building-rotation").setAttribute("aria-label", h.circle ? "圆周采样起点角度" : "房屋旋转角度");
  for (const [key, v] of Object.entries({
    x: shape.center[0],
    z: shape.center[1],
    width: shape.size[0],
    depth: shape.size[1],
    height: h.height,
    rotation: ((h.circle ? h.circle.phase : shape.rotation) * 180) / Math.PI,
    "roof-height": h.roof?.height ?? 0.35
  }))
    $(`#building-${key}`).value = Number(v.toFixed(5));
  $("#building-hint").textContent = `稳定房屋 ID：${h.id} · ${rows.length} 栋 · 修改后点击生成`;
  $("#add-building").disabled = rows.length >= 7;
  syncDormers();
}
function dormer() {
  return building()?.dormers?.find((d) => d.id === selectedDormer);
}
function clearDormerInvalid() {
  for (const key of ["u", "v"]) invalidInputs.delete("#dormer-" + key);
}
function syncDormers() {
  const rows = building()?.dormers || [];
  if (!rows.some((d) => d.id === selectedDormer)) selectedDormer = rows[0]?.id;
  const select = $("#dormer-select");
  select.replaceChildren();
  for (const row of rows) {
    const o = document.createElement("option");
    o.value = row.id;
    o.textContent = row.id;
    select.append(o);
  }
  select.value = selectedDormer || "";
  select.disabled = !rows.length;
  $("#dormer-fields").hidden = !rows.length;
  $("#remove-dormer").disabled = !rows.length;
  $("#add-dormer").disabled = rows.length >= 7;
  const d = dormer();
  if (d) {
    $("#dormer-style").value = d.style;
    $("#dormer-rank").value = d.rank || 1;
    $("#dormer-u").value = d.mesh_uv[0];
    $("#dormer-v").value = d.mesh_uv[1];
  }
  $("#dormer-hint").textContent = d
    ? `稳定 ID：${d.id} · 位置使用原屋面归一化 UV；随屋面自动开孔。`
    : "随屋面自动开孔；屋面铺设和换材仍由铺设绑定控制。";
}
$("#dormer-select").onchange = (e) => {
  selectedDormer = e.target.value;
  clearDormerInvalid();
  syncDormers();
};
$("#add-dormer").onclick = () => {
  const h = building();
  h.dormers ??= [];
  let i = 1;
  while (h.dormers.some((d) => d.id === `dormer-${i}`)) i++;
  selectedDormer = `dormer-${i}`;
  h.dormers.push({ id: selectedDormer, style: "gothic", mesh_uv: [0.45, 0.3], rank: 2, seed: 0 });
  clearDormerInvalid();
  mark();
  syncDormers();
};
$("#remove-dormer").onclick = () => {
  const h = building();
  h.dormers = h.dormers.filter((d) => d.id !== selectedDormer);
  clearDormerInvalid();
  mark();
  syncDormers();
};
for (const key of ["style", "rank"])
  $("#dormer-" + key).onchange = (e) => {
    dormer()[key] = key === "rank" ? Number(e.target.value) : e.target.value;
    mark();
  };
for (const [index, key] of ["u", "v"].entries())
  numberInput(
    "#dormer-" + key,
    (v) => v >= 0 && v <= 1,
    (v) => {
      dormer().mesh_uv[index] = v;
    }
  );
function addBuilding(h) {
  draft.construction.identity_order.push(h.id);
  draft.construction.buildings.push(h);
  for (const kind of ["wall", "roof"]) {
    const sid = `${h.id}-${kind}`,
      bid = `${sid}-cover`;
    geometries(draft).push({ id: sid, source: { type: `building_${kind}`, building_id: h.id } });
    draft.bindings.push({
      id: bid,
      [referenceKey(draft)]: sid,
      rule: { type: kind === "wall" ? "courses" : "overlap_rows" },
      unit_id: kind === "wall" ? "brick" : "roof_tile",
      footprint:
        kind === "wall" ? { width: 0.46, height: 0.46, depth: 0.56 } : { width: 0.5, height: 0.4375, depth: 0.1 },
      seed: "source"
    });
  }
  selectedBuilding = h.id;
  selected = `${h.id}-wall-cover`;
  mark();
  syncControls();
}
$("#new-building-scene").onclick = () => {
  draft = {
    version: 2,
    construction: { version: 1, environment: { type: "original_cottage_terrain" }, identity_order: [], buildings: [] },
    geometries: [],
    bindings: [],
    overrides: []
  };
  jsonDirty = false;
  invalidInputs.clear();
  addBuilding({
    id: "house-1",
    rectangle: { center: [0, 0], size: [5.25, 4.5], rotation: 0 },
    height: 3.125,
    material: 0,
    roof: { height: 0.35 }
  });
  notice("新房屋场景已放入草稿；生成后替换画面。");
};
$("#add-building").onclick = () => {
  let i = 1;
  while (draft.construction.buildings.some((b) => b.id === `house-${i}`)) i++;
  const base = buildingFootprint(building());
  addBuilding({
    id: `house-${i}`,
    rectangle: { center: [base.center[0] + 3, base.center[1] + 1.5], size: [4, 3.75], rotation: base.rotation },
    height: 2.5,
    material: 0,
    roof: { height: 0.35 }
  });
};
$("#building-select").onchange = (e) => {
  selectedBuilding = e.target.value;
  clearDormerInvalid();
  syncBuildings();
};
for (const key of ["x", "z", "width", "depth", "height", "rotation", "roof-height"])
  numberInput(
    `#building-${key}`,
    (v) => (key === "roof-height" ? v >= 0 : ["width", "depth", "height"].includes(key) ? v > 0 : true),
    (v) => {
      const h = building(),
        shape = h.circle || h.rectangle;
      if (key === "x" || key === "z") shape.center[key === "x" ? 0 : 1] = v;
      else if (key === "width" || key === "depth") {
        if (h.circle) {
          h.circle.radius = v / 2;
          $("#building-depth").value = v;
        } else h.rectangle.size[key === "width" ? 0 : 1] = v;
      } else if (key === "rotation") shape[h.circle ? "phase" : "rotation"] = (v * Math.PI) / 180;
      else if (key === "height") h.height = v;
      else h.roof = { ...h.roof, height: v };
    }
  );
$("#seed-source").onchange = (e) => {
  binding().seed = e.target.checked ? "source" : 0;
  mark();
  syncControls();
};

$("#binding-select").onchange = (e) => {
  selected = e.target.value;
  invalidInputs.clear();
  syncControls();
};
$("#add-surface").onclick = () => {
  let i = 1;
  while (geometries(draft).some((s) => s.id === `surface-${i}`) || draft.bindings.some((b) => b.id === `binding-${i}`))
    i++;
  const e = example();
  geometries(e)[0].id = `surface-${i}`;
  e.bindings[0].id = `binding-${i}`;
  e.bindings[0][referenceKey(draft)] = `surface-${i}`;
  if (draft.version === 1) delete e.bindings[0].geometry_id;
  geometries(draft).push(geometries(e)[0]);
  draft.bindings.push(e.bindings[0]);
  selected = e.bindings[0].id;
  mark();
  syncControls();
};
$("#add-curve").onclick = () => {
  upgradeDraft();
  let i = 1;
  while (
    geometries(draft).some((g) => g.id === `curve-${i}`) ||
    draft.bindings.some((b) => b.id === `curve-${i}-cover`)
  )
    i++;
  const id = `curve-${i}`;
  geometries(draft).push({
    id,
    geometry: {
      type: "polyline",
      points: [
        [-2, 1, 0],
        [0, 1, 0],
        [2, 1, 1]
      ],
      up: [0, 1, 0]
    }
  });
  draft.bindings.push({
    id: id + "-cover",
    geometry_id: id,
    rule: { type: "repeat", spacing: "equal" },
    unit_id: "brick",
    footprint: { width: 0.5, height: 0.35, depth: 0.2 },
    seed: 0
  });
  selected = id + "-cover";
  mark();
  syncControls();
  notice("曲线已加入草稿。沿曲线排列单元；路径坐标可在 JSON 中编辑。");
};
$("#edit-connection").onclick = () => {
  const parent = binding(),
    g = surface();
  if (!parent || isConnection(g)) return;
  let changed = draft.version !== 2;
  upgradeDraft();
  const kind = ["native_roof", "building_roof"].includes(g.source?.type) ? "roof_boundaries" : "wall_corners";
  let connection = geometries(draft).find(
    (x) =>
      isConnection(x) && x.source.kind === kind && x.source.bindings?.length === 1 && x.source.bindings[0] === parent.id
  );
  if (!connection) {
    changed = true;
    let id = parent.id + "-connections",
      i = 1;
    while (geometries(draft).some((x) => x.id === id)) id = parent.id + "-connections-" + i++;
    connection = { id, source: { type: "connection", kind, bindings: [parent.id] } };
    geometries(draft).push(connection);
  }
  let child = draft.bindings.find((x) => x.geometry_id === connection.id);
  if (!child) {
    changed = true;
    let id = connection.id + "-cover",
      i = 1;
    while (draft.bindings.some((x) => x.id === id)) id = connection.id + "-cover-" + i++;
    child = {
      id,
      geometry_id: connection.id,
      rule: { type: kind === "wall_corners" ? "wall_corner_interlock" : "roof_boundary_assembly" },
      unit_id: "source",
      footprint: "source",
      seed: "source"
    };
    draft.bindings.push(child);
  }
  selected = child.id;
  if (changed) mark();
  syncControls();
  notice("接缝成为独立铺设绑定。可替换材料；局部区域和双墙参与方可在 JSON 中编辑。");
};
// Connection editing selects persistent source geometry; the server remains
// authoritative for supported owners, rules and atomic document validation.
const contactOwner = (g) =>
  g?.source?.building_id !== undefined
    ? JSON.stringify(["building", g.source.building_id])
    : g?.source?.wall_id !== undefined
      ? JSON.stringify(["native", g.source.wall_id])
      : null;
function contactExisting(kind, a, b) {
  const pair = JSON.stringify([contactOwner(a), contactOwner(b)].sort());
  return geometries(draft).find(
    (g) =>
      isConnection(g) &&
      g.source.kind === kind &&
      JSON.stringify(
        (
          g.source.geometries ??
          g.source.bindings?.map((id) => geometryId(draft.bindings.find((b) => b.id === id))) ??
          []
        )
          .map((id) => contactOwner(geometries(draft).find((x) => x.id === id)))
          .sort()
      ) === pair
  );
}
function syncContactEditor() {
  const roofReady = !!draft?.construction || scene?.connection_inventory?.available_kinds?.includes("roof_contacts");
  $("#contact-kind option[value=roof_contacts]").disabled = !roofReady;
  if (!roofReady && $("#contact-kind").value === "roof_contacts") $("#contact-kind").value = "wall_contacts";
  const kind = $("#contact-kind").value,
    types =
      kind === "wall_contacts"
        ? ["native_wall", "building_wall"]
        : ["native_wall", "building_wall", "native_roof", "building_roof"];
  const candidates = geometries(draft).filter((g) => types.includes(g.source?.type));
  const beforeA = $("#contact-a").value,
    beforeB = $("#contact-b").value;
  for (const id of ["contact-a", "contact-b"]) {
    const select = $("#" + id);
    select.replaceChildren();
    for (const g of candidates) {
      const option = document.createElement("option");
      option.value = g.id;
      option.textContent = g.id;
      select.append(option);
    }
  }
  const a =
    candidates.find((g) => g.id === beforeA) || candidates.find((g) => g.id === geometryId(binding())) || candidates[0];
  if (a) $("#contact-a").value = a.id;
  const others = candidates.filter((g) => contactOwner(g) !== contactOwner(a));
  const b = others.find((g) => g.id === beforeB) || others[0];
  for (const option of $("#contact-b").options) option.disabled = !others.some((g) => g.id === option.value);
  $("#contact-b").value = b?.id || "";
  const existing = a && b ? contactExisting(kind, a, b) : null,
    hasBinding = existing && draft.bindings.find((row) => geometryId(row) === existing.id);
  $("#select-contact").disabled = !a || !b;
  $("#contact-unit").disabled = !!hasBinding;
  if (hasBinding) $("#contact-unit").value = hasBinding.unit_id;
  $("#select-contact").textContent = hasBinding ? "选择已有接缝绑定" : "建立接缝绑定";
  $("#contact-hint").textContent =
    !a || !b
      ? "需要两个不同房屋的来源几何。创建房屋场景后可选择。"
      : hasBinding
        ? "复用已有接缝；材料和局部修改保持不变。"
        : "默认保留原材料组合。明确选择材料后才替换整条接缝；零构件时仍保存设置。";
}
for (const id of ["contact-kind", "contact-a", "contact-b"]) $("#" + id).onchange = syncContactEditor;
$("#select-contact").onclick = async () => {
  error("");
  if (jsonDirty) {
    error("请先载入 JSON 草稿，以免丢失尚未载入的文本。");
    return;
  }
  const version = editVersion,
    kind = $("#contact-kind").value,
    a = geometries(draft).find((g) => g.id === $("#contact-a").value),
    b = geometries(draft).find((g) => g.id === $("#contact-b").value);
  if (!a || !b || contactOwner(a) === contactOwner(b)) {
    error("请选择两个不同来源的几何。");
    return;
  }
  const existing = contactExisting(kind, a, b),
    existingBinding = existing && draft.bindings.find((row) => geometryId(row) === existing.id);
  if (existingBinding) {
    selected = existingBinding.id;
    syncControls();
    notice("已选择现有接缝绑定，保留其材料和局部修改。");
    return;
  }
  const proposed = clone(draft);
  if (proposed.version === 1) {
    proposed.version = 2;
    proposed.geometries = proposed.surfaces;
    delete proposed.surfaces;
    for (const row of proposed.bindings) {
      row.geometry_id = row.surface_id;
      delete row.surface_id;
    }
  }
  let gid = existing?.id || `${a.id}-${b.id}-${kind}`,
    i = 1;
  if (!existing) {
    const base = gid;
    while (proposed.geometries.some((g) => g.id === gid)) gid = base + "-" + i++;
    proposed.geometries.push({ id: gid, source: { type: "connection", kind, geometries: [a.id, b.id] } });
  }
  let bid = gid + "-cover";
  i = 1;
  while (proposed.bindings.some((row) => row.id === bid)) bid = gid + "-cover-" + i++;
  proposed.bindings.push({
    id: bid,
    geometry_id: gid,
    rule: { type: kind === "wall_contacts" ? "inter_wall_stitch" : "roof_contact_assembly" },
    unit_id: $("#contact-unit").value,
    footprint: "source",
    seed: "source"
  });
  try {
    const validated = await api("/api/project/validate", { document: proposed });
    if (editVersion !== version || jsonDirty) throw new Error("验证期间草稿发生修改，已保留你的修改，请再次选择");
    draft = validated.document;
    selected = bid;
    mark();
    syncControls();
    notice("接缝已加入草稿。可独立替换材料，生成后更新画面；局部区域可在 JSON 中编辑。");
  } catch (e) {
    error("接缝未加入：" + e.message);
  }
};
$("#remove-binding").onclick = () => {
  const s = surface();
  if (geometries(draft).some((g) => isConnection(g) && g.source.bindings?.includes(selected))) {
    error("此绑定仍被接缝引用，请先移除相关接缝绑定。");
    return;
  }
  draft.bindings = draft.bindings.filter((b) => b.id !== selected);
  if (isConnection(s)) draft[geometryKey(draft)] = geometries(draft).filter((g) => g.id !== s.id);
  if (draft.overrides) draft.overrides = draft.overrides.filter((o) => o.binding_id !== selected);
  selected = draft.bindings[0]?.id;
  mark();
  syncControls();
};
async function importNative(endpoint, label) {
  error("");
  if (jsonDirty) {
    error("请先载入 JSON 草稿再导入表面，以免丢失尚未载入的文本。");
    return;
  }
  const versionAtImport = editVersion;
  try {
    const v = await api(endpoint);
    if (jsonDirty || editVersion !== versionAtImport)
      throw new Error("读取期间草稿发生修改，已保留你的修改，请再次导入");
    if (untouchedExample && JSON.stringify(draft) === JSON.stringify(example()))
      draft = { version: 2, geometries: [], bindings: [] };
    if (draft.version === 2) {
      v.binding.geometry_id = v.binding.surface_id;
      delete v.binding.surface_id;
    }
    for (const [key, row] of [
      [geometryKey(draft), v.surface],
      ["bindings", v.binding]
    ]) {
      const i = draft[key].findIndex((x) => x.id === row.id);
      if (i < 0) draft[key].push(row);
      else draft[key][i] = row;
    }
    selected = v.binding.id;
    mark();
    syncControls();
    notice(`原${label}的轮廓、洞口和归属已导入草稿；点击生成后替换相应铺设。`);
  } catch (e) {
    error(`${label}未导入：${e.message}`);
  }
}
$("#import-native").onclick = () => importNative("/api/native-surface?wall_id=6", "墙面");
$("#import-roof").onclick = () => importNative("/api/native-roof?wall_id=6", "屋面");
$("#surface-type").onchange = (e) => {
  const s = surface(),
    size = bounds(s.geometry),
    w = size.width || 6,
    h = s.geometry.height,
    d = size.depth || 3;
  const base = { id: s.id, height: h };
  s.geometry =
    e.target.value === "plane"
      ? { ...base, type: "plane", origin: [-w / 2, 0, 0], u_axis: [1, 0, 0], v_axis: [0, 1, 0], width: w }
      : {
          ...base,
          type: "extruded_path",
          points: [
            [-w / 2, 0, -d / 2],
            [w / 2, 0, -d / 2],
            [w / 2, 0, d / 2],
            ...(e.target.value === "polygon" ? [[-w / 2, 0, d / 2]] : [])
          ],
          closed: e.target.value === "polygon"
        };
  mark();
  syncControls();
};
function numberInput(id, accept, set) {
  $(id).addEventListener("input", (e) => {
    const v = e.target.valueAsNumber;
    if (!Number.isFinite(v) || !accept(v)) {
      invalidInputs.add(id);
      editVersion++;
      dirty = true;
      updateDraftNote();
      return;
    }
    invalidInputs.delete(id);
    set(v);
    mark();
  });
}
for (const f of ["width", "height", "depth"])
  numberInput(
    `#surface-${f}`,
    (v) => v > 0,
    (v) => {
      const g = surface().geometry;
      if (f === "height" || (f === "width" && g.type === "plane")) {
        g[f] = v;
        return;
      }
      const k = f === "width" ? 0 : 2,
        values = g.points.map((p) => p[k]),
        min = Math.min(...values),
        max = Math.max(...values),
        span = max - min;
      if (span === 0) throw new Error("该方向跨度为零，请通过 JSON 编辑路径");
      const center = (max + min) / 2;
      g.points = g.points.map((p) => p.map((x, i) => (i === k ? center + ((x - center) * v) / span : x)));
    }
  );
$("#surface-hole").onchange = (e) => {
  const s = surface(),
    g = s.geometry;
  if (["profiled_path", "triangulated", "polyline"].includes(g.type) || isNative(s)) return;
  let w = g.width;
  if (g.type === "extruded_path") {
    w = 0;
    for (let i = 1; i < g.points.length; i++) w += Math.hypot(...g.points[i].map((v, k) => v - g.points[i - 1][k]));
    if (g.closed) w += Math.hypot(...g.points[0].map((v, k) => v - g.points.at(-1)[k]));
  }
  g.holes = e.target.checked ? [{ aabb: [w * 0.4, g.height * 0.15, w * 0.6, g.height * 0.7] }] : [];
  mark();
};
$$("#rules button").forEach(
  (x) =>
    (x.onclick = () => {
      const b = binding(),
        old = b.rule,
        t = x.dataset.rule;
      if (["courses", "overlap_rows", "repeat"].includes(t)) {
        b.rule = { type: t };
        mark();
        syncControls();
        return;
      }
      b.rule = {
        type: t,
        spacing: t === "rings" ? "equal" : old.spacing || "equal",
        row_jitter: t === "rings" ? 0 : old.row_jitter || 0
      };
      if (t !== "rings") b.rule.direction = old.direction || "u";
      if (t === "strips") b.rule.max_length = 3;
      mark();
      syncControls();
    })
);
for (const f of ["direction", "spacing"])
  $(`#${f}`).onchange = (e) => {
    binding().rule[f] = e.target.value;
    mark();
  };
for (const f of ["jitter", "row-jitter", "phase", "max-length"])
  numberInput(
    `#${f}`,
    (v) => (f === "phase" ? v >= 0 && v < 1 : f === "max-length" ? v > 0 : v >= 0),
    (v) => {
      binding().rule[f.replaceAll("-", "_")] = v;
    }
  );
numberInput(
  "#seed",
  (v) => Number.isSafeInteger(v) && v >= 0,
  (v) => (binding().seed = v)
);
for (const f of ["width", "height", "depth"])
  numberInput(
    `#footprint-${f}`,
    (v) => v > 0,
    (v) => (binding().footprint[f] = v)
  );
$$("#units button").forEach(
  (x) =>
    (x.onclick = () => {
      binding().unit_id = x.dataset.unit;
      unit = x.dataset.unit;
      mark();
      syncControls();
      if (mode === "unit") loadUnit();
    })
);
$("#project-json").oninput = () => {
  editVersion++;
  jsonDirty = true;
  updateDraftNote();
  $("#json-note").textContent = "JSON 文本尚未载入草稿。先载入，再生成。";
};
$("#load-json").onclick = async () => {
  const version = editVersion;
  try {
    const proposed = basicDocument(JSON.parse($("#project-json").value));
    const validated = await api("/api/project/validate", { document: proposed });
    if (editVersion !== version) throw new Error("验证期间草稿发生修改，已保留修改，请再次载入");
    draft = validated.document;
    selected = draft.bindings.some((b) => b.id === selected) ? selected : draft.bindings[0]?.id;
    jsonDirty = false;
    invalidInputs.clear();
    mark();
    syncControls();
    error("");
    $("#json-note").textContent = "JSON 已通过契约验证并载入草稿；点击生成后保存。";
  } catch (e) {
    error(`JSON 未载入：${e.message}`);
  }
};
$("#refresh-json").onclick = () => {
  jsonDirty = false;
  $("#project-json").value = JSON.stringify(draft, null, 2);
  $("#json-note").textContent = "显示当前控件草稿。";
};
$("#reload-project").onclick = () => readProject().catch((e) => error(e.message));
async function renderLayout() {
  if (posting) return;
  error("");
  if (workspaceId === "round-gothic" && !resident) {
    error("常驻渲染尚未就绪，请先解决页面加载错误。");
    return;
  }
  if (projectSessionInvalid) {
    error("项目版本或服务会话已变更。草稿仍保留，请复制需要保留的 JSON 后，点击“重新读取已保存项目”同步项目版本。");
    return;
  }
  if (jsonDirty) {
    error("请先载入 JSON 草稿，或点击“显示当前草稿”放弃尚未载入的文本。");
    return;
  }
  if (invalidInputs.size) {
    error("请修正控件中的无效数字。");
    return;
  }
  posting = true;
  const publicationEpoch = ++loadEpoch;
  setBusy();
  const updateStarted = performance.now(),
    submittedEditVersion = editVersion,
    submittedSession = activeSession;
  try {
    const snapshot = clone(basicDocument(draft));
    const recompile = resident && placementKey(resident.scene.document) !== placementKey(snapshot);
    if (resident && !recompile) resolvePlacements(resident.scene, snapshot);
    const p = await api("/api/project", { document: snapshot, expected_revision: projectRevision });
    if (activeSession !== submittedSession) throw new Error("提交期间服务会话变更，请重新读取项目");
    saved = clone(p.document);
    projectRevision = p.document_revision;
    const canonical = clone(p.document);
    if (editVersion === submittedEditVersion && !jsonDirty) {
      draft = clone(canonical);
      dirty = false;
      syncControls();
    }
    if (resident) {
      const t = performance.now();
      let candidate = resident,
        prepared = null;
      try {
        if (recompile) {
          notice("正在重新生成几何与铺设；完成前保留当前画面。");
          prepared = await api("/api/resident/compile", {
            document_revision: p.document_revision,
            cache_sha256: residentState.cache_sha256
          });
          candidate = await prepareResident(prepared);
          candidate.setCamera(scene.camera);
        }
        if (activeSession !== submittedSession || publicationEpoch !== loadEpoch)
          throw new Error("提交期间场景或服务会话变更，请重新读取项目");
        const publication = await api("/api/resident/publish", {
          document_revision: p.document_revision,
          cache_sha256: prepared?.cache_sha256 || residentState.cache_sha256
        });
        if (activeSession !== submittedSession || publicationEpoch !== loadEpoch)
          throw new Error("提交期间场景或服务会话变更，请重新读取项目");
        if (prepared) {
          const previousCamera = scene.camera;
          commitResident(candidate);
          scene = { ...prepared.scene, camera: previousCamera, revision: publication.scene_revision };
          resident.metrics.compilation = prepared.compileTimings;
        }
        residentState = publication;
        scene.revision = displayedRevision = publication.scene_revision;
        $("#revision").textContent = `第 ${scene.revision} 版`;
        resident.applyDocument(canonical);
      } catch (e) {
        if (candidate !== resident) candidate.dispose();
        throw e;
      }
      resident.metrics.lastEdit.publishMs = performance.now() - t;
      resident.metrics.lastEdit.inputToSubmitMs = performance.now() - updateStarted;
      const measuredEdit = resident.metrics.lastEdit;
      requestAnimationFrame(() => {
        measuredEdit.nextFrameMs = performance.now() - updateStarted;
      });
      scene.document = clone(canonical);
      scene.request = clone(canonical);
      refreshResidentCells();
      updateLayers();
      switchMode("result");
      drawResult();
      syncConnectionInventory();
      syncConnectionEdits();
      busy = false;
      notice(
        `已保存并更新 · 解析 ${resident.metrics.lastEdit.resolveMs.toFixed(2)} ms · 索引上传 ${resident.metrics.lastEdit.uploadBytes} B`
      );
      return;
    }
    await api("/api/render", {
      kind: "layout",
      document: canonical,
      camera:
        scene?.kind === "layout" &&
        canonical.construction &&
        JSON.stringify(canonical.construction) === JSON.stringify(scene.document?.construction)
          ? Object.fromEntries(
              ["eye", "target", "projection", "halfExtent", "near", "far"]
                .map((k) => [k, scene.camera[k]])
                .filter(([, v]) => v !== undefined)
            )
          : geometries(canonical).some(isNative)
            ? nativeCamera
            : canonical.version === 2 || canonical.construction
              ? { fit: "surfaces", view: "front" }
              : layoutCamera(canonical, "front")
    });
    if (activeSession !== submittedSession) throw new Error("生成提交期间服务会话变更，请重新读取项目");
    busy = true;
    notice("已提交当前项目快照，完成后替换画面。");
  } catch (e) {
    error(`未能生成；当前画面保留。${e.message}`);
  } finally {
    posting = false;
    setBusy();
    syncConnectionInventory();
  }
}
function updateDraftNote() {
  $("#draft-note").textContent = jsonDirty
    ? "JSON 文本尚未载入草稿"
    : dirty
      ? "草稿有修改，尚未生成"
      : posting || busy
        ? "当前项目已提交，正在生成"
        : scene?.kind === "layout" && JSON.stringify(scene.document) === JSON.stringify(draft)
          ? "当前草稿已生成"
          : "项目已保存；尚未生成当前草稿";
}

$("#apply").onclick = renderLayout;
$("#layout-tab").onclick = () => (scene?.kind === "layout" ? switchMode("result") : renderLayout());
async function showNative() {
  if (posting) return;
  if (scene?.kind === "native") {
    switchMode("result");
    return;
  }
  posting = true;
  error("");
  try {
    if (!nativeRequest || !nativeCamera) {
      const s = await api("/api/status");
      if (!s.baseline) throw new Error("原房子的基准相机尚不可用");
      nativeRequest = clone(s.baseline.request);
      nativeCamera = clone(s.baseline.camera);
    }
    const data = { kind: "native", request: nativeRequest, camera: nativeCamera };
    await api("/api/render", data);
    busy = true;
  } catch (e) {
    error(`原房子尚未切换：${e.message}`);
  } finally {
    posting = false;
    setBusy();
    syncConnectionInventory();
  }
}
$("#show-native").onclick = showNative;
$("#native-tab").onclick = showNative;
function setBusy() {
  updateDraftNote();
  $("#loading").hidden = !busy && !!scene;
  $("#loading").classList.toggle("overlay-small", !!scene);
  $("#loading-title").textContent = scene ? "正在生成新版本" : "正在读取初始场景";
  $("#status-chip").textContent = busy ? "● 生成中" : scene ? "● 已发布" : "● 等待结果";
  $("#state-label").textContent = busy ? (scene ? "保留上次结果" : "正在生成") : "已发布";
  $("#apply").disabled = posting || !draft;
  $("#show-native").disabled = posting;
  $$("#view-controls button").forEach((b) => (b.disabled = posting || busy || !scene));
}
function switchMode(m) {
  mode = m;
  $$(".tabs button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.mode === m)));
  for (const x of ["scene", "surface", "unit"]) $(`#${x}-canvas`).hidden = x !== (m === "result" ? "scene" : m);
  $("#unit-selector").hidden = m !== "unit";
  $("#view-controls").hidden = m === "unit";
  $("#view-label").textContent =
    m === "surface"
      ? "已发布几何的边界"
      : m === "unit"
        ? "原始材料单元"
        : scene?.kind === "layout"
          ? "通用铺设结果"
          : "原房子结果";
  $("#view-description").textContent =
    m === "surface"
      ? "曲面定义区域，曲线定义路径，规则安排单元"
      : m === "unit"
        ? "原始顶点与三角形 · 拖动旋转"
        : resident
          ? "原始单元模型 · 常驻 GPU 实例渲染"
          : "原始单元模型 · 本机 GPU 输出";
  $("#stage-caption").textContent =
    m === "surface"
      ? "当前已发布场景的几何示意 · 草稿不会改变此图"
      : m === "unit"
        ? "原始网格线框 · 检视不会修改占位尺寸"
        : "材质诊断视图 · 不含游戏最终光照";
  if (m === "surface") drawSurface();
  if (m === "unit") loadUnit();
}
$$(".tabs button").forEach((b) => (b.onclick = () => switchMode(b.dataset.mode)));
$("#surface-button").onclick = () => switchMode("surface");
$("#unit-button").onclick = () => switchMode("unit");
const cameras = {
  front: { eye: [12, 15, 18], target: [-2, 6, 0] },
  back: { eye: [-18, 15, -18], target: [-2, 6, 0] },
  side: { eye: [20, 12, -14], target: [-2, 6, 0] }
};
const normalized = (v) => {
  const l = Math.hypot(...v);
  return v.map((x) => x / l);
};
function surfacePoints(g) {
  if (g.type === "polyline") return g.points;
  if (g.type === "triangulated") return g.vertices;
  if (g.type === "profiled_path")
    return g.points.flatMap((p, i) => [
      [p[0], g.bottom[i], p[2]],
      [p[0], g.top[i], p[2]]
    ]);
  if (g.type === "plane") {
    const o = g.origin || [0, 0, 0],
      u = normalized(g.u_axis || [1, 0, 0]),
      v = normalized(g.v_axis || [0, 1, 0]);
    return [
      [0, 0],
      [g.width, 0],
      [g.width, g.height],
      [0, g.height]
    ].map(([a, b]) => o.map((x, k) => x + u[k] * a + v[k] * b));
  }
  const axis = normalized(g.extrusion_axis || [0, 1, 0]);
  return g.points.flatMap((p) => [p, p.map((v, k) => v + axis[k] * g.height)]);
}
function layoutCamera(doc, view) {
  const pts = [
    ...geometries(doc)
      .filter((s) => s.geometry)
      .flatMap((s) => surfacePoints(s.geometry)),
    ...(doc.construction?.buildings || []).flatMap((h) => {
      const shape = buildingFootprint(h),
        [w, d] = shape.size,
        [x, z] = shape.center,
        c = Math.cos(shape.rotation),
        s = Math.sin(shape.rotation),
        top = h.height + Math.max(w, d) * Math.abs(h.roof?.height ?? 0.35);
      return [-1, 1].flatMap((a) =>
        [-1, 1].flatMap((b) =>
          [0, top].map((y) => [x + a * w * 0.5 * c - b * d * 0.5 * s, y, z + a * w * 0.5 * s + b * d * 0.5 * c])
        )
      );
    })
  ];
  if (!pts.length) return { eye: [8, 6, 10], target: [0, 1, 0] };
  const min = [0, 1, 2].map((k) => Math.min(...pts.map((p) => p[k]))),
    max = [0, 1, 2].map((k) => Math.max(...pts.map((p) => p[k]))),
    target = min.map((v, k) => (v + max[k]) / 2),
    span = Math.max(2, ...max.map((v, k) => v - min[k]));
  const d = { front: [0.8, 0.55, 1.2], back: [-1, 0.55, -1.2], side: [1.3, 0.5, -0.6] }[view];
  return { eye: target.map((v, k) => v + d[k] * span), target, halfExtent: span * 0.72 };
}
$$("#view-controls button").forEach(
  (b) =>
    (b.onclick = async () => {
      if (busy || posting || !scene) return;
      posting = true;
      error("");
      try {
        if (resident) {
          const c = { ...scene.camera, ...layoutCamera(scene.document, b.dataset.view) };
          scene.camera = { ...c, view_projection: resident.setCamera(c) };
          await api("/api/resident/camera", {
            camera: Object.fromEntries(
              ["eye", "target", "projection", "halfExtent", "near", "far"].map((k) => [k, c[k]])
            )
          });
          drawSurface();
          return;
        }
        await api("/api/camera", {
          camera:
            scene.kind === "layout" &&
            (scene.document.construction ||
              (scene.document.version === 2 && !geometries(scene.document).some(isNative)))
              ? { fit: "surfaces", view: b.dataset.view }
              : scene.kind === "layout" && !geometries(scene.document).some(isNative)
                ? layoutCamera(scene.document, b.dataset.view)
                : cameras[b.dataset.view]
        });
        busy = true;
      } catch (e) {
        error(`视角未更新：${e.message}`);
      } finally {
        posting = false;
        setBusy();
        syncConnectionInventory();
      }
    })
);
const familyLayer = (f) =>
  ({ brick: "brick", wood: "wood", gable: "wood", roof: "roof", plaster: "plaster", foundation: "plaster" })[f] ||
  "detail";
function layerOf(d) {
  return scene.kind === "layout" && d.binding_id ? `binding:${d.binding_id}` : familyLayer(d.family);
}
function updateLayers() {
  const keys = [...new Set(buffers.map(layerOf))],
    old = [...$("#layers").children].map((x) => x.dataset.layer);
  $("#layers").replaceChildren();
  for (const key of keys) {
    if (restoreLayers) {
      if (restoreLayers.includes(key)) enabledLayers.add(key);
      else enabledLayers.delete(key);
    } else if (!old.includes(key) && !(workspaceId === "round-gothic" && key === "plaster")) enabledLayers.add(key);
    const b = document.createElement("button");
    b.dataset.layer = key;
    b.textContent = key.startsWith("binding:")
      ? key.slice(8)
      : { brick: "砖块", wood: "木构", roof: "瓦片", plaster: "表层", detail: "装饰" }[key];
    b.classList.toggle("selected", enabledLayers.has(key));
    b.setAttribute("aria-pressed", String(enabledLayers.has(key)));
    b.onclick = () => {
      enabledLayers.has(key) ? enabledLayers.delete(key) : enabledLayers.add(key);
      b.classList.toggle("selected", enabledLayers.has(key));
      b.setAttribute("aria-pressed", String(enabledLayers.has(key)));
      switchMode("result");
      drawResult();
    };
    $("#layers").append(b);
  }
  restoreLayers = null;
  $("#layer-hint").textContent =
    scene.kind === "layout" ? "按稳定绑定 ID 分层；同一几何可绑定多个铺设。" : "按原生绘制组分层。";
}
$("#show-all").onclick = () => {
  buffers.forEach((d) => enabledLayers.add(layerOf(d)));
  updateLayers();
  switchMode("result");
  drawResult();
};
const channel = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  const v = (i / 255) ** 2;
  channel[i] = Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055));
}
function drawResult() {
  if (!scene) return;
  if (resident) {
    resident.setLayers(enabledLayers);
    window.__surfaceDemo = {
      revision: scene.revision,
      kind: scene.kind,
      draws: resident.draws.filter((d) => d.visible && (d.drawCount ?? d.count) > 0).length,
      enabledLayers: [...enabledLayers],
      mode,
      backend: "resident-webgl2",
      metrics: resident.metrics
    };
    $("#draw-count").textContent = String(window.__surfaceDemo.draws);
    return;
  }
  const cv = $("#scene-canvas"),
    ctx = cv.getContext("2d");
  cv.width = scene.width;
  cv.height = scene.height;
  const n = scene.width * scene.height,
    z = new Float32Array(n),
    color = new Uint32Array(n);
  for (const b of buffers) {
    if (!enabledLayers.has(layerOf(b))) continue;
    for (let i = 0; i < n; i++)
      if (b.depth[i] > z[i]) {
        z[i] = b.depth[i];
        color[i] = b.gbuffer[i * 2 + 1];
      }
  }
  const im = ctx.createImageData(scene.width, scene.height);
  for (let i = 0; i < n; i++)
    if (z[i] > 0) {
      const c = color[i];
      im.data[i * 4] = channel[c & 255];
      im.data[i * 4 + 1] = channel[(c >>> 8) & 255];
      im.data[i * 4 + 2] = channel[(c >>> 16) & 255];
      im.data[i * 4 + 3] = 255;
    }
  ctx.putImageData(im, 0, 0);
  window.__surfaceDemo = {
    revision: scene.revision,
    kind: scene.kind,
    draws: buffers.length,
    visiblePixels: z.reduce((n, v) => n + (v > 0), 0),
    enabledLayers: [...enabledLayers],
    mode
  };
}
function project(p) {
  const m = scene.camera.view_projection,
    v = [...p, 1],
    q = [0, 0, 0, 0];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) q[r] += m[c * 4 + r] * v[c];
  return [(q[0] / q[3] + 1) * 384, (1 - q[1] / q[3]) * 384, q[2] / q[3]];
}
function drawSurface() {
  if (!scene) return;
  const ctx = $("#surface-canvas").getContext("2d");
  ctx.clearRect(0, 0, 768, 768);
  const quads = [];
  for (const s of scene.surfaces || []) {
    if (s.geometry) {
      const g = s.geometry;
      if (g.type === "triangulated") {
        for (const tri of g.triangles) quads.push({ id: s.id, p: tri.map((i) => project(g.vertices[i])) });
      } else if (g.type === "plane") quads.push({ id: s.id, p: surfacePoints(g).map(project) });
      else {
        const pts = g.points,
          axis = normalized(g.extrusion_axis || [0, 1, 0]);
        for (let i = 0; i < pts.length - (g.closed ? 0 : 1); i++) {
          const a = pts[i],
            j = (i + 1) % pts.length,
            b = pts[j];
          quads.push({
            id: s.id,
            p: (g.type === "profiled_path"
              ? [
                  [a[0], g.bottom[i], a[2]],
                  [b[0], g.bottom[j], b[2]],
                  [b[0], g.top[j], b[2]],
                  [a[0], g.top[i], a[2]]
                ]
              : [a, b, b.map((v, k) => v + axis[k] * g.height), a.map((v, k) => v + axis[k] * g.height)]
            ).map(project)
          });
        }
      }
    } else {
      const pts = s.sampled_path;
      for (let i = 0; i < pts.length - 1; i++)
        quads.push({
          id: `墙 ${s.wall_id}`,
          p: [
            pts[i],
            pts[i + 1],
            [pts[i + 1][0], s.top_heights[i + 1], pts[i + 1][2]],
            [pts[i][0], s.top_heights[i], pts[i][2]]
          ].map(project)
        });
    }
  }
  quads.sort((a, b) => a.p.reduce((n, p) => n + p[2], 0) - b.p.reduce((n, p) => n + p[2], 0));
  const labelled = new Set();
  for (const { id, p } of quads) {
    ctx.beginPath();
    p.forEach((v, i) => (i ? ctx.lineTo(v[0], v[1]) : ctx.moveTo(v[0], v[1])));
    ctx.closePath();
    ctx.fillStyle = "rgba(154,175,128,.22)";
    ctx.fill();
    ctx.strokeStyle = "#829c68";
    ctx.lineWidth = 1;
    ctx.stroke();
    if (!labelled.has(id)) {
      labelled.add(id);
      ctx.fillStyle = "#587844";
      ctx.font = "12px sans-serif";
      ctx.fillText(id, p[0][0] + 6, p[0][1] - 8);
    }
  }
  for (const s of scene.surfaces || []) {
    const g = s.geometry;
    if (!g) continue;
    for (let hole of g.holes || []) {
      hole = hole.polygon || hole.aabb || hole;
      const poly =
        typeof hole[0] === "number"
          ? [
              [hole[0], hole[1]],
              [hole[2], hole[1]],
              [hole[2], hole[3]],
              [hole[0], hole[3]]
            ]
          : hole;
      if (g.type === "triangulated") {
        ctx.beginPath();
        for (let i = 0; i < poly.length; i++)
          for (const [a, b] of triangleSegment(g, poly[i], poly[(i + 1) % poly.length])) {
            const pa = project(a),
              pb = project(b);
            ctx.moveTo(pa[0], pa[1]);
            ctx.lineTo(pb[0], pb[1]);
          }
        ctx.strokeStyle = "#b68156";
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
        continue;
      }
      const points = poly
        .map((p) => uvWorld(g, p))
        .filter(Boolean)
        .map(project);
      if (points.length !== poly.length) continue;
      ctx.beginPath();
      points.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      ctx.closePath();
      ctx.strokeStyle = "#b68156";
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
  for (const record of scene.geometries || []) {
    const g = record.geometry;
    if (g?.type !== "polyline") continue;
    const ps = g.points.map(project);
    ctx.beginPath();
    ps.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    if (g.closed) ctx.closePath();
    ctx.strokeStyle = "#557e82";
    ctx.lineWidth = 3;
    ctx.stroke();
    for (const p of ps) {
      ctx.beginPath();
      ctx.arc(p[0], p[1], 4, 0, Math.PI * 2);
      ctx.fillStyle = "#557e82";
      ctx.fill();
    }
    ctx.font = "12px sans-serif";
    ctx.fillText(record.id, ps[0][0] + 6, ps[0][1] - 8);
  }
  const picked = $("#connection-select").value;
  for (const contact of scene.connection_inventory?.connections || []) {
    const segments = contact.topology?.geometry?.segments;
    if (!segments?.length) continue;
    ctx.strokeStyle = contact.id === picked ? "#b85f29" : "#c18d52";
    ctx.lineWidth = contact.id === picked ? 3 : 1.5;
    ctx.beginPath();
    for (const seg of segments) {
      const [a, b] = seg.world.map(project);
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
    }
    ctx.stroke();
  }
}
function uvWorld(g, [u, v]) {
  if (g.type === "triangulated") {
    for (const tri of g.triangles) {
      const w = barycentric(g, tri, [u, v]);
      if (w && w.every((x) => x >= -1e-8)) return affinePoint(g, tri, w);
    }
    return null;
  }
  if (g.type === "plane") {
    const o = g.origin || [0, 0, 0],
      a = normalized(g.u_axis || [1, 0, 0]),
      b = normalized(g.v_axis || [0, 1, 0]);
    return o.map((x, k) => x + a[k] * u + b[k] * v);
  }
  const pts = [...g.points];
  if (g.closed && JSON.stringify(pts[0]) !== JSON.stringify(pts.at(-1))) pts.push(pts[0]);
  let cumulative = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i],
      b = pts[i + 1],
      start = g.u_coordinates?.[i] ?? cumulative,
      L = g.u_coordinates ? g.u_coordinates[i + 1] - start : Math.hypot(...b.map((x, k) => x - a[k]));
    if (u >= start - 1e-8 && u <= start + L + 1e-8) {
      const t = (u - start) / L;
      if (g.type === "profiled_path")
        return [a[0] + (b[0] - a[0]) * t, (g.y_origin || 0) + v, a[2] + (b[2] - a[2]) * t];
      const axis = normalized(g.extrusion_axis || [0, 1, 0]);
      return a.map((x, k) => x + (b[k] - x) * t + axis[k] * v);
    }
    cumulative += L;
  }
  return null;
}

async function loadUnit() {
  if (unit === "source") unit = "brick";
  const selected = unit;
  try {
    const r = await fetch(`/assets/${unit}.json`);
    if (!r.ok) throw new Error("原模型资源读取失败");
    const data = await r.json();
    if (selected !== unit) return;
    mesh = data;
    drawUnit();
  } catch (e) {
    error(e.message);
  }
}
function drawUnit() {
  if (!mesh) return;
  const c = $("#unit-canvas").getContext("2d");
  c.clearRect(0, 0, 768, 768);
  const min = [Infinity, Infinity, Infinity],
    max = [-Infinity, -Infinity, -Infinity];
  for (const p of mesh.positions)
    for (let k = 0; k < 3; k++) {
      min[k] = Math.min(min[k], p[k]);
      max[k] = Math.max(max[k], p[k]);
    }
  const center = min.map((v, k) => (v + max[k]) / 2),
    scale = 315 / Math.max(...max.map((v, k) => v - min[k]));
  const [ax, ay] = rotation,
    projected = mesh.positions.map((p) => {
      let [x, y, z] = p.map((v, k) => v - center[k]);
      const x2 = Math.cos(ay) * x + Math.sin(ay) * z,
        z2 = -Math.sin(ay) * x + Math.cos(ay) * z;
      return [
        384 + x2 * scale,
        365 - (Math.cos(ax) * y - Math.sin(ax) * z2) * scale,
        Math.sin(ax) * y + Math.cos(ax) * z2
      ];
    });
  const tris = [];
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const p = mesh.indices.slice(i, i + 3).map((i) => projected[i]);
    tris.push({ p, z: p.reduce((n, x) => n + x[2], 0) / 3 });
  }
  tris.sort((a, b) => a.z - b.z);
  for (const t of tris) {
    c.beginPath();
    t.p.forEach((p, i) => (i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1])));
    c.closePath();
    c.fillStyle = "#eef1e5";
    c.fill();
    c.strokeStyle = "#91a77c";
    c.lineWidth = 0.65;
    c.stroke();
  }
  c.fillStyle = "#8e9c81";
  c.font = "12px sans-serif";
  c.textAlign = "center";
  c.fillText(`${mesh.positions.length} 个原始顶点 · ${mesh.indices.length / 3} 个三角形`, 384, 604);
  c.textAlign = "start";
}
$$("#unit-selector button").forEach(
  (b) =>
    (b.onclick = () => {
      unit = b.dataset.unit;
      $$("#unit-selector button").forEach((x) => x.classList.toggle("selected", x === b));
      loadUnit();
    })
);
$("#unit-canvas").onpointerdown = (e) => {
  dragging = [e.clientX, e.clientY];
  e.currentTarget.setPointerCapture(e.pointerId);
};
$("#unit-canvas").onpointermove = (e) => {
  if (!dragging) return;
  rotation[1] += (e.clientX - dragging[0]) * 0.009;
  rotation[0] += (e.clientY - dragging[1]) * 0.009;
  dragging = [e.clientX, e.clientY];
  drawUnit();
};
$("#unit-canvas").onpointerup = () => (dragging = null);
async function prepareResident(state) {
  if (resident && residentState?.cache_sha256 === state.cache_sha256) {
    // Preparation must not mutate the published renderer before the final revision fence.
    return resident;
  }
  const canvas = resident ? $("#scene-canvas").cloneNode(false) : $("#scene-canvas"),
    candidate = new ResidentRenderer(canvas);
  try {
    await candidate.load(state.manifest_url);
    candidate.applyDocument(state.document);
    return candidate;
  } catch (e) {
    candidate.dispose();
    throw e;
  }
}
function commitResident(candidate) {
  if (candidate === resident) return;
  const old = resident,
    canvas = $("#scene-canvas");
  if (canvas !== candidate.canvas) canvas.replaceWith(candidate.canvas);
  resident = candidate;
  old?.dispose();
  candidate.canvas.addEventListener("resident-error", (e) => error(e.detail));
}
function refreshResidentCells() {
  for (const row of scene.connection_inventory?.connections || []) {
    if (!row.parent_binding_id) continue;
    const owned = scene.document.bindings.find(
      (b) =>
        scene.document.geometries.find((g) => g.id === b.geometry_id)?.source?.bindings?.[0] ===
          row.parent_binding_id && b.rule.type === "roof_boundary_assembly"
    );
    row.binding_id = owned?.id || null;
    row.geometry_id = owned?.geometry_id || null;
    const ids = new Set(
      resident.scene.groups
        .filter((g) => g.binding_id === row.parent_binding_id && g.role === "connections")
        .flatMap((g) => g.cells.map((c) => c.id))
    );
    const cells = resident.resolvedCells.filter(
      (c) => c.placement_binding_id === row.parent_binding_id && ids.has(c.id)
    );
    row.visible_cell_count = cells.filter((c) => !c.hidden).length;
    row.units = [...new Set(cells.map((c) => c.unit_id))];
  }
  buffers = resident.draws.map((d) => ({ ...d, binding_id: d.activeBindingId || d.binding_id }));
  scene.cells = resident.resolvedCells.filter((c) => !c.hidden);
  scene.counts.unit_count = new Set(scene.cells.map((c) => c.binding_id + ":" + (c.logical_id || c.id))).size;
  scene.counts.fragment_count = scene.cells.length;
  scene.counts.hidden_unit_count = new Set(
    resident.resolvedCells.filter((c) => c.hidden).map((c) => c.binding_id + ":" + (c.logical_id || c.id))
  ).size;
  $("#source-note").textContent =
    `${scene.counts.unit_count} 个铺设单元 · ${scene.counts.fragment_count} 个裁切片段 · ${scene.counts.geometry_count} 个已绑定几何`;
}
$("#scene-canvas").addEventListener("resident-error", (e) => error(e.detail));
async function loadScene(revision) {
  const epoch = ++loadEpoch,
    sessionAtStart = activeSession;
  try {
    const next = await api("/api/scene");
    const nextBuffers =
      workspaceId === "round-gothic"
        ? next.draws
        : await Promise.all(
            next.draws.map(async (d) => {
              const [z, g] = await Promise.all([fetch(d.depth_url), fetch(d.gbuffer_url)]);
              if (!z.ok || !g.ok) throw new Error("绘制资源读取失败");
              const [depth, gbuffer] = await Promise.all([z.arrayBuffer(), g.arrayBuffer()]);
              if (
                depth.byteLength !== next.width * next.height * 4 ||
                gbuffer.byteLength !== next.width * next.height * 8
              )
                throw new Error("绘制资源尺寸不一致");
              const values = new Float32Array(depth);
              if (values.some((v) => !Number.isFinite(v) || v < 0 || v > 1)) throw new Error("深度资源包含无效值");
              return { ...d, depth: values, gbuffer: new Uint32Array(gbuffer) };
            })
          );
    let fresh = await api("/api/status");
    if (
      epoch !== loadEpoch ||
      posting ||
      activeSession !== sessionAtStart ||
      fresh.session_id !== sessionAtStart ||
      fresh.current_revision !== next.revision ||
      (displayedRevision !== null && next.revision <= displayedRevision)
    )
      return;
    if (workspaceId === "round-gothic") {
      const state = await api("/api/resident/state");
      if (state.scene_revision !== next.revision || epoch !== loadEpoch || posting) return;
      const candidate = await prepareResident(state);
      let committed = false;
      try {
        // GPU preparation can outlive a later user publication, server restart or navigation.
        fresh = await api("/api/status");
        if (
          epoch !== loadEpoch ||
          posting ||
          activeSession !== sessionAtStart ||
          fresh.session_id !== sessionAtStart ||
          fresh.current_revision !== state.scene_revision
        )
          return;
        candidate.applyDocument(state.document);
        if (state.camera) next.camera = { ...state.camera, view_projection: candidate.setCamera(state.camera) };
        commitResident(candidate);
        residentState = state;
        next.document = clone(state.document);
        committed = true;
      } finally {
        if (!committed && candidate !== resident) candidate.dispose();
      }
    }

    scene = next;
    buffers = nextBuffers;
    if (resident) refreshResidentCells();
    displayedRevision = next.revision;
    status = fresh;
    busy = fresh.busy;
    if (fresh.baseline) {
      nativeRequest = clone(fresh.baseline.request);
      nativeCamera = clone(fresh.baseline.camera);
    }
    $("#revision").textContent = `第 ${next.revision} 版`;
    $("#draw-count").textContent = String(next.draws.length);
    $("#scene-kind").textContent = next.kind === "layout" ? "通用铺设" : "原房子";
    $("#source-note").textContent =
      next.kind === "layout"
        ? `${next.counts.unit_count ?? "—"} 个铺设单元 · ${next.counts.fragment_count ?? "—"} 个裁切片段 · ${next.counts.geometry_count ?? next.counts.surface_count ?? "—"} 个已绑定几何`
        : "保留原房子的完整原生成结果";
    $("#native-tab").classList.toggle("selected", next.kind === "native");
    $("#layout-tab").classList.toggle("selected", next.kind === "layout");
    const scopeMessages = next.kind === "layout" ? [...new Set((next.scope_notes || []).map((x) => x.message))] : [];
    $("#scope-notes").textContent = scopeMessages.join(" ");
    $("#scope-notes").hidden = scopeMessages.length === 0;
    updateLayers();
    drawResult();
    drawSurface();
    switchMode(mode);
    syncConnectionInventory();
    syncContactEditor();
    syncConnectionEdits();
    setBusy();
    if (!projectSessionInvalid) notice("");
    const latest = fresh.jobs?.find((j) => j.revision === fresh.latest_revision);
    if (latest?.state !== "failed") error("");
  } catch (e) {
    if (epoch === loadEpoch && activeSession === sessionAtStart) error(`场景读取失败，保留已有画面：${e.message}`);
  }
}
async function poll() {
  try {
    status = await api("/api/status");
    if (activeSession !== status.session_id) {
      if (activeSession !== null) {
        projectSessionInvalid = true;
        notice("服务会话已变更；保留本地草稿，请重新读取已保存项目后再提交。");
      }
      activeSession = status.session_id;
      displayedRevision = null;
      loadEpoch++;
    }
    if (status.baseline) {
      nativeRequest = clone(status.baseline.request);
      nativeCamera = clone(status.baseline.camera);
    }
    busy = status.busy;
    setBusy();
    if (
      !posting &&
      status.current_revision !== null &&
      status.current_revision !== undefined &&
      status.current_revision !== displayedRevision
    )
      await loadScene(status.current_revision);
    const latest = status.jobs?.find((j) => j.revision === status.latest_revision);
    if (latest?.state === "failed") error(`这次生成失败，已保留上一份场景。${latest.error || ""}`);
  } catch (e) {
    error(`本地生成服务暂不可用：${e.message}`);
  }
  setTimeout(poll, 900);
}
function rememberWorkspace() {
  if (!draft || workspaceStateConflict) return;
  try {
    localStorage.setItem(
      workspaceStorageKey,
      JSON.stringify({
        session_id: activeSession,
        revision: projectRevision,
        draft,
        dirty,
        jsonDirty,
        json: $("#project-json").value,
        selected,
        selectedBuilding,
        selectedDormer,
        mode,
        layers: scene ? [...enabledLayers] : null,
        invalid: [...invalidInputs],
        values: Object.fromEntries([...invalidInputs].map((id) => [id, $(id)?.value])),
        regionOwner,
        region: ["u0", "v0", "u1", "v1"].map((k) => $("#connection-" + k).value)
      })
    );
  } catch (e) {
    error("无法保留切换状态：" + e.message);
    throw e;
  }
}
for (const a of $$("#workspace-links a"))
  a.onclick = (e) => {
    if (a.dataset.workspace === workspaceId) {
      e.preventDefault();
      return;
    }
    try {
      rememberWorkspace();
    } catch {
      e.preventDefault();
    }
  };
window.addEventListener("pagehide", () => {
  try {
    rememberWorkspace();
  } catch {}
});
function restoreWorkspace() {
  const r = workspaceRestore;
  if (!r || r.session_id !== activeSession) return;
  if (r.revision !== projectRevision) {
    if (!(r.dirty || r.jsonDirty)) return;
    workspaceStateConflict = true;
    projectSessionInvalid = true;
    notice("服务端项目已有新版本；已保留切换前草稿，可复制 JSON，再重新读取已保存项目同步版本。");
  }
  draft = clone(r.draft);
  dirty = r.dirty;
  jsonDirty = r.jsonDirty;
  selected = r.selected;
  selectedBuilding = r.selectedBuilding;
  selectedDormer = r.selectedDormer;
  mode = ["result", "surface", "unit"].includes(r.mode) ? r.mode : "result";
  restoreLayers = r.layers;
  syncControls();
  if (r.jsonDirty) $("#project-json").value = r.json;
  for (const id of r.invalid || []) {
    if ($(id)) {
      $(id).value = r.values[id];
      invalidInputs.add(id);
    }
  }
  if (r.region) {
    regionOwner = r.regionOwner;
    r.region.forEach((v, i) => ($("#connection-" + ["u0", "v0", "u1", "v1"][i]).value = v));
  }
}
async function boot() {
  try {
    activeSession = (await api("/api/status")).session_id;
    await readProject();
    restoreWorkspace();
  } catch (e) {
    error(`项目读取失败：${e.message}`);
  }
  poll();
}

// Presentation only: shared UV segments are clipped to each original triangle,
// then affinely mapped. Layout generation remains entirely on the server.
function barycentric(g, tri, p) {
  const [a, b, c] = tri.map((i) => g.uv[i]),
    x = b[0] - a[0],
    y = b[1] - a[1],
    z = c[0] - a[0],
    w = c[1] - a[1],
    d = x * w - y * z;
  if (Math.abs(d) < 1e-14) return null;
  const u = ((p[0] - a[0]) * w - (p[1] - a[1]) * z) / d,
    v = (x * (p[1] - a[1]) - y * (p[0] - a[0])) / d;
  return [1 - u - v, u, v];
}
function affinePoint(g, tri, w) {
  return [0, 1, 2].map((k) => tri.reduce((sum, index, i) => sum + g.vertices[index][k] * w[i], 0));
}
function triangleSegment(g, a, b) {
  const result = [];
  for (const tri of g.triangles) {
    const wa = barycentric(g, tri, a),
      wb = barycentric(g, tri, b);
    if (!wa || !wb) continue;
    let lo = 0,
      hi = 1;
    for (let i = 0; i < 3; i++) {
      const delta = wb[i] - wa[i];
      if (Math.abs(delta) < 1e-14) {
        if (wa[i] < -1e-9) {
          hi = -1;
          break;
        }
      } else if (delta > 0) lo = Math.max(lo, -wa[i] / delta);
      else hi = Math.min(hi, -wa[i] / delta);
    }
    if (hi - lo > 1e-9) {
      const at = (t) => wa.map((v, i) => v + (wb[i] - v) * t);
      result.push([affinePoint(g, tri, at(lo)), affinePoint(g, tri, at(hi))]);
    }
  }
  return result;
}

function syncConnectionInventory() {
  const list = scene?.connection_inventory?.connections || [],
    select = $("#connection-select"),
    old = select.value;
  select.replaceChildren();
  for (const row of list) {
    const option = document.createElement("option");
    option.value = row.id;
    option.textContent = `${row.title.replace("双坡屋顶交汇", "屋顶交汇")} · ${row.material_ownership === "participating_roof_bindings" ? `${row.support_segment_count || 0} 段支撑交线` : `${row.cell_count} 单元`}`;
    select.append(option);
  }
  if (list.some((r) => r.id === old)) select.value = old;
  const row = list.find((r) => r.id === select.value);
  $("#inspect-connection").disabled = !row || busy || posting;
  const pitched = row?.material_ownership === "participating_roof_bindings";
  const detail = pitched
    ? row.state === "disjoint"
      ? "参与屋顶已分离，连接设置仍保留。"
      : `${row.support_segment_count || 0} 段原支撑面的交线${row.state === "partial" ? "（共面区域尚未解析）" : ""}；沿用双方屋面，不额外生成接缝瓦片。`
    : row?.topology?.contact_status === "unknown"
      ? "当前原检测器没有额外补接单元；不能据此判断没有相交。"
      : row?.cell_count
        ? `${row.visible_cell_count} 个可见单元 · ${row.units.map((u) => names[u] || u).join("、")}`
        : "当前没有补接单元；已有设置会保留。";
  $("#connection-summary").textContent = row
    ? `${ruleCatalog?.connection_rules?.[row.rule.type]?.label || row.rule.type}。${detail} ${pitched ? "材料与局部修改归参与屋面；几何示意中的橙线用于定位交汇。" : row.binding_id ? "已有独立绑定。" : "选择后保留现有外观，可再换材料或修改局部。"}`
    : "当前场景没有可编辑的自动接缝。";
}
$("#connection-select").onchange = () => {
  syncConnectionInventory();
  if (mode === "surface") drawSurface();
};
$("#inspect-connection").onclick = async () => {
  error("");
  if (dirty || jsonDirty) {
    error("请先生成当前草稿，再选择已发布场景中的接缝。草稿已保留。");
    return;
  }
  const version = editVersion;
  try {
    const proposed = await api("/api/connections/prepare", {
      connection_id: $("#connection-select").value,
      scene_revision: scene.revision,
      document_revision: projectRevision
    });
    if (editVersion !== version || jsonDirty) throw new Error("读取期间草稿已变化，请再次选择");
    const changed = JSON.stringify(draft) !== JSON.stringify(proposed.document);
    draft = proposed.document;
    selected = proposed.binding_id;
    if (changed) mark();
    syncControls();
    notice(
      isPitched(binding())
        ? "已选择屋顶交汇。材料与局部修改请编辑参与屋面；连接设置会随重建保留。"
        : "已选择接缝。默认保留原材料组合；可独立换材或添加局部修改，再点击生成。"
    );
  } catch (e) {
    error("接缝未选择：" + e.message);
  }
};
function syncConnectionEdits() {
  const b = binding(),
    g = surface(),
    pitched = isPitched(b),
    active = !!b && !pitched && (isConnection(g) || g?.geometry?.type !== "polyline");
  $("#connection-local-editor").hidden = !active;
  $("#pitched-connection-note").hidden = !pitched;
  const roofs = $("#pitched-participants");
  roofs.replaceChildren();
  if (pitched) {
    const refs =
      g.source.geometries ?? g.source.bindings.map((id) => geometryId(draft.bindings.find((x) => x.id === id)));
    for (const gid of refs) {
      const geom = geometries(draft).find((x) => x.id === gid);
      if (!["native_roof", "building_roof"].includes(geom?.source?.type)) continue;
      const button = document.createElement("button");
      button.className = "text-button";
      button.textContent = "编辑屋面 " + gid;
      button.onclick = () => {
        let parent = draft.bindings.find((x) => geometryId(x) === gid);
        if (!parent) {
          let id = gid + "-cover",
            n = 1;
          while (draft.bindings.some((x) => x.id === id)) id = gid + "-cover-" + n++;
          parent = {
            id,
            geometry_id: gid,
            rule: { type: "overlap_rows" },
            unit_id: "roof_tile",
            footprint: { width: 0.5, height: 0.4375, depth: 0.1 },
            seed: "source"
          };
          draft.bindings.push(parent);
          mark();
        }
        selected = parent.id;
        syncControls();
      };
      roofs.append(button);
    }
  }
  if (!active) return;
  const select = $("#connection-edit-participant"),
    old = select.value;
  select.replaceChildren();
  const refs = isConnection(g)
    ? (g.source.geometries ?? g.source.bindings.map((id) => geometryId(draft.bindings.find((x) => x.id === id))))
    : [g.id];
  $("#local-edit-title").textContent = isConnection(g) ? "接缝局部修改" : "屋面 / 表面局部修改";
  $("#local-edit-hint").textContent = "当前绑定：" + b.id + " · 拖动选区图选择一块区域，可换材或隐藏。";
  for (const gid of refs) {
    const o = document.createElement("option");
    o.value = gid;
    o.textContent = gid;
    select.append(o);
  }
  if (refs.includes(old)) select.value = old;
  const list = $("#connection-edits");
  list.replaceChildren();
  for (const edit of draft.overrides || []) {
    if (edit.binding_id !== b.id) continue;
    const row = document.createElement("p");
    row.className = "hint";
    const text = document.createElement("span");
    text.textContent = `${edit.id} · ${edit.effect.hidden ? "隐藏" : names[edit.effect.unit_id] || "修改"} `;
    const remove = document.createElement("button");
    remove.className = "text-button";
    remove.textContent = "移除";
    remove.onclick = () => {
      draft.overrides = draft.overrides.filter((x) => x.id !== edit.id);
      mark();
      syncControls();
    };
    row.append(text, remove);
    list.append(row);
  }
  syncRegionMap();
}
$("#add-connection-edit").onclick = async () => {
  if (jsonDirty) {
    error("请先载入 JSON 草稿，再添加局部修改。");
    return;
  }
  const b = binding(),
    g = surface();
  if (!b || isPitched(b)) return;
  const values = ["u0", "v0", "u1", "v1"].map((k) => Number($("#connection-" + k).value));
  if (values.some((x) => !Number.isFinite(x)) || values[0] >= values[2] || values[1] >= values[3]) {
    error("区域终点必须大于起点，坐标必须是有限数值。");
    return;
  }
  const [u0, v0, u1, v1] = values,
    effect = $("#connection-edit-effect").value,
    proposed = clone(draft),
    version = editVersion;
  let n = 1,
    id = `${b.id}-edit-${n}`;
  while ((proposed.overrides || []).some((x) => x.id === id)) id = `${b.id}-edit-${++n}`;
  proposed.overrides ??= [];
  proposed.overrides.push({
    id,
    binding_id: b.id,
    region: {
      space: "surface_uv",
      ...(isConnection(g) ? { on_geometry_id: $("#connection-edit-participant").value } : {}),
      polygon: [
        [u0, v0],
        [u1, v0],
        [u1, v1],
        [u0, v1]
      ]
    },
    effect: effect === "hidden" ? { hidden: true } : { unit_id: effect }
  });
  try {
    const result = await api("/api/project/validate", { document: proposed });
    if (editVersion !== version || jsonDirty) throw new Error("验证期间草稿发生修改，请再次添加");
    draft = result.document;
    mark();
    syncControls();
    error("");
    notice("局部修改已加入草稿，重新生成后会按这个参与面的区域保留。");
  } catch (e) {
    error("局部修改未加入：" + e.message);
  }
};

let regionBounds = null,
  regionOwner = null,
  regionDrag = null;
function syncRegionMap() {
  const gid = $("#connection-edit-participant").value,
    g = scene?.geometries?.find((s) => s.id === gid)?.geometry || geometries(draft).find((s) => s.id === gid)?.geometry;
  const cv = $("#region-map");
  if (!g || g.type !== "triangulated") {
    cv.hidden = true;
    regionBounds = null;
    return;
  }
  cv.hidden = false;
  const us = g.uv.map((p) => p[0]),
    vs = g.uv.map((p) => p[1]);
  regionBounds = [Math.min(...us), Math.min(...vs), Math.max(...us), Math.max(...vs)];
  const owner = selected + ":" + gid;
  if (regionOwner !== owner) {
    regionOwner = owner;
    const [u, v, U, V] = regionBounds;
    [u + (U - u) * 0.2, v + (V - v) * 0.2, u + (U - u) * 0.4, v + (V - v) * 0.6].forEach(
      (x, i) => ($("#connection-" + ["u0", "v0", "u1", "v1"][i]).value = x.toFixed(3))
    );
  }
  const ctx = cv.getContext("2d"),
    [u, v, U, V] = regionBounds,
    pt = (p) => [16 + ((p[0] - u) / (U - u)) * 488, 204 - ((p[1] - v) / (V - v)) * 188];
  ctx.clearRect(0, 0, 520, 220);
  ctx.strokeStyle = "#aab99b";
  ctx.lineWidth = 0.6;
  for (const tri of g.triangles) {
    ctx.beginPath();
    tri.forEach((j, i) => {
      const p = pt(g.uv[j]);
      i ? ctx.lineTo(...p) : ctx.moveTo(...p);
    });
    ctx.closePath();
    ctx.stroke();
  }
  for (const e of draft.overrides || []) {
    if (e.binding_id !== selected) continue;
    ctx.beginPath();
    e.region.polygon.forEach((p, i) => (i ? ctx.lineTo(...pt(p)) : ctx.moveTo(...pt(p))));
    ctx.closePath();
    ctx.fillStyle = "rgba(128,144,106,.2)";
    ctx.fill();
  }
  const [a, b, c, d] = ["u0", "v0", "u1", "v1"].map((k) => Number($("#connection-" + k).value));
  if ([a, b, c, d].every(Number.isFinite)) {
    const p = pt([a, b]),
      q = pt([c, d]);
    ctx.fillStyle = "rgba(188,115,56,.25)";
    ctx.strokeStyle = "#b47338";
    ctx.lineWidth = 2;
    ctx.fillRect(p[0], q[1], q[0] - p[0], p[1] - q[1]);
    ctx.strokeRect(p[0], q[1], q[0] - p[0], p[1] - q[1]);
  }
}
for (const k of ["u0", "v0", "u1", "v1"]) $("#connection-" + k).addEventListener("input", syncRegionMap);
$("#connection-edit-participant").addEventListener("change", syncRegionMap);
function regionPoint(e) {
  const r = e.currentTarget.getBoundingClientRect(),
    [u, v, U, V] = regionBounds;
  return [
    u + Math.max(0, Math.min(1, (((e.clientX - r.left) / r.width) * 520) / 488 - 16 / 488)) * (U - u),
    v + Math.max(0, Math.min(1, (204 - ((e.clientY - r.top) / r.height) * 220) / 188)) * (V - v)
  ];
}
$("#region-map").onpointerdown = (e) => {
  if (!regionBounds) return;
  regionDrag = regionPoint(e);
  e.currentTarget.setPointerCapture(e.pointerId);
};
$("#region-map").onpointermove = (e) => {
  if (!regionDrag) return;
  const p = regionPoint(e);
  [
    Math.min(p[0], regionDrag[0]),
    Math.min(p[1], regionDrag[1]),
    Math.max(p[0], regionDrag[0]),
    Math.max(p[1], regionDrag[1])
  ].forEach((x, i) => ($("#connection-" + ["u0", "v0", "u1", "v1"][i]).value = x.toFixed(3)));
  syncRegionMap();
};
$("#region-map").onpointerup = () => (regionDrag = null);
$("#region-map").onpointercancel = () => (regionDrag = null);

boot();

window.addEventListener("pagehide", (event) => {
  // BFCache suspends animation/tasks and resumes the same document on return.
  // Its renderer must remain live; a terminal navigation retires all pending publications.
  if (!event.persisted) {
    loadEpoch++;
    resident?.dispose();
  }
});
setInterval(() => {
  const el = $("#resident-metrics");
  if (el) {
    el.parentElement.hidden = !resident;
    if (resident) el.textContent = JSON.stringify(resident.metrics, null, 2);
  }
}, 500);
