import {
  attachedBlock,
  SHAPE_INTENT_DEFAULTS,
  type ShapeIntent,
  type ShapeBlock,
  type ShapeEdits
} from "./ComposedShape";
import { IslandPlanView } from "./IslandPlanView";
import { BASE_MAP_DEFAULTS, generateBaseMap } from "./BaseMapGenerator";
import { BASE_MAP_STYLE as C } from "./BaseMapDrawing";
import "./BaseMap.css";

const LAYERS = {
  components: ["拼接矩形", "#9a4b32"],
  boundary: ["2048 米边界", "#244e6b"],
  land: ["陆地", C.land],
  water: ["河湖", C.water],
  slope: ["泥土缓坡", C.soil],
  rock: ["岩体轮廓", C.rock],
  obb: ["岩石 OBB", C.obb],
  group: ["山群范围", C.group],
  building: ["建筑 OBB", C.building],
  village: ["村落范围", C.village],
  island: ["离岸岛域", "#509f9b"],
  height: ["高度标注", "#626c74"],
  labels: ["语义名称", "#244e6b"],
  ocean: ["海洋", C.ocean],
  furniture: ["比例尺", "#195a90"]
} as const;
const format = (n: number) => String(Math.round(n * 100) / 100);

/** Mounts the editable space-only composition and keeps controls alive across geometry rebuilds. */
export function mountBaseMap(host: HTMLElement): void {
  document.body.classList.add("island-plan-page", "base-map-page");
  document.title = "空间底图 · 语义参数 MVP";
  const root = document.createElement("div");
  root.className = "island-plan-editor base-map-editor";
  root.innerHTML = `<aside class="ip-sidebar"><header class="ip-brand"><span>SEMANTIC / BASE MAP</span><h1>空间底图</h1><p>形态与关系 · 通路待规划</p></header><div class="base-domain">2048 × 2048 米<br><small>栅格目标：高度 1025² / 地表 1024²</small></div><div class="base-controls"><h3>整体轮廓</h3><select aria-label="选择形状区域"></select><p>大小联动区域内容；边界自动让位并柔和限制扩张。</p></div><details class="base-components"><summary>高级：矩形组件编辑</summary><select aria-label="选择拼接组件"></select><div class="component-fields"></div><button data-action="add-block">添加相连组件</button><button data-action="remove-block">删除组件</button></details><section class="base-inspector"><strong>点选查看语义数据</strong><p>轮廓、区域与 OBB 来自同一份规划。</p></section><details class="base-layers"><summary>图例与图层</summary><div class="base-layer-list"></div></details><div class="base-actions"><button data-action="restore">恢复参考构图</button><button data-action="export">导出规划 JSON</button></div></aside><main class="ip-workspace"><header class="ip-topbar"><div><strong>二维空间规划</strong><span>区域语义 · 组件拼接</span></div><nav aria-label="规划图缩放"><button data-action="out" aria-label="缩小">−</button><button data-action="fit">全图</button><button data-action="in" aria-label="放大">＋</button></nav></header><div class="ip-viewport"></div><footer class="ip-map-footer"><span>点选对象 · 滚轮缩放 · 空白拖动</span><span class="base-status"></span></footer></main>`;
  host.replaceChildren(root);
  const action = (id: string) => root.querySelector<HTMLButtonElement>(`[data-action="${id}"]`)!;
  const inspector = root.querySelector<HTMLElement>(".base-inspector")!,
    status = root.querySelector<HTMLElement>(".base-status")!;
  let shapeEdits: ShapeEdits = {},
    blockSerial = 0;
  let parameters = { ...BASE_MAP_DEFAULTS },
    plan = generateBaseMap(parameters),
    revision = 0,
    selected: string | null = null,
    timer: ReturnType<typeof setTimeout> | undefined;
  const view = new IslandPlanView(root.querySelector<HTMLElement>(".ip-viewport")!, (id) => {
    selected = id;
    view.setSelection(id);
    if (id && plan.shapeRecipes?.some((g) => g.blocks.some((b) => b.id === id))) {
      blockSelect.value = id;
      syncBlockFields();
      const g = selectedBlock()?.group;
      if (g) {
        shapeSelect.value = g.id;
        syncIntent();
      }
    }
    inspect();
  });
  const layerState = Object.fromEntries(Object.keys(LAYERS).map((k) => [k, k !== "height"]));
  function applyLayers(): void {
    view.setLayers(layerState as Parameters<IslandPlanView["setLayers"]>[0]);
  }
  for (const [key, [label, color]] of Object.entries(LAYERS)) {
    const button = document.createElement("button");
    button.dataset.layer = key;
    button.setAttribute("aria-pressed", String(layerState[key]));
    button.innerHTML = `<i style="border-color:${color};background:${["land", "water", "slope", "rock", "ocean", "building"].includes(key) ? color : "transparent"}"></i>${label}`;
    button.onclick = () => {
      layerState[key] = !layerState[key];
      button.setAttribute("aria-pressed", String(layerState[key]));
      applyLayers();
    };
    root.querySelector(".base-layer-list")!.append(button);
  }
  const shapeSelect = root.querySelector<HTMLSelectElement>('[aria-label="选择形状区域"]')!;
  const semanticControls: { key: keyof ShapeIntent; label: string; min: number; max: number; step: number }[] = [
    { key: "size", label: "整体大小", min: 0.5, max: 1.5, step: 0.01 },
    { key: "stretch", label: "伸展程度", min: 0.6, max: 1.6, step: 0.01 },
    { key: "bend", label: "曲折度", min: -1, max: 1, step: 0.02 },
    { key: "widthVariation", label: "宽窄变化", min: 0, max: 1, step: 0.02 },
    { key: "branches", label: "新增分支", min: 0, max: 3, step: 1 }
  ];
  for (const c of semanticControls) {
    const row = document.createElement("label");
    row.className = "ip-parameter";
    row.innerHTML = `<span>${c.label}<output></output></span><input type="range" aria-label="${c.label}" data-intent="${c.key}" min="${c.min}" max="${c.max}" step="${c.step}">`;
    const input = row.querySelector("input")!;
    input.oninput = () => {
      const e = (shapeEdits[shapeSelect.value] ??= {});
      e.semantic = { ...SHAPE_INTENT_DEFAULTS, ...e.semantic, [c.key]: input.valueAsNumber };
      row.querySelector("output")!.textContent = format(input.valueAsNumber);
      clearTimeout(timer);
      timer = setTimeout(() => rebuild(c.label), 60);
    };
    root.querySelector(".base-controls")!.append(row);
  }
  function syncIntent(): void {
    const current = shapeSelect.value;
    shapeSelect.replaceChildren();
    for (const g of plan.shapeRecipes ?? []) {
      const option = document.createElement("option");
      option.value = g.id;
      option.textContent = g.label;
      shapeSelect.append(option);
    }
    if ([...shapeSelect.options].some((o) => o.value === current)) shapeSelect.value = current;
    const q = shapeEdits[shapeSelect.value]?.semantic ?? SHAPE_INTENT_DEFAULTS;
    for (const c of semanticControls) {
      const input = root.querySelector<HTMLInputElement>(`[data-intent="${c.key}"]`)!;
      input.value = String(q[c.key]);
      const actual = plan.sizeAdjustments?.find((a) => a.id === shapeSelect.value);
      input.parentElement!.querySelector("output")!.textContent =
        c.key === "size" && actual && Math.abs(actual.applied - actual.requested) > 0.005
          ? `${format(q[c.key])} · 实际 ${format(actual.applied)}`
          : format(q[c.key]);
    }
  }
  shapeSelect.onchange = () => {
    if (timer) rebuild("形状参数");
    syncIntent();
    const g = plan.shapeRecipes?.find((g) => g.id === shapeSelect.value);
    if (g) {
      blockSelect.value = g.blocks[0].id;
      syncBlockFields();
      selected = g.id;
      view.setSelection(selected);
      inspect();
    }
  };
  const blockSelect = root.querySelector<HTMLSelectElement>('[aria-label="选择拼接组件"]')!;
  const selectedBlock = () => {
    for (const group of plan.shapeRecipes ?? []) {
      const block = group.blocks.find((b) => b.id === blockSelect.value);
      if (block) return { group, block };
    }
    return undefined;
  };
  function sizeFrame(id: string): { scale: number; x: number; z: number } {
    const frame = { scale: 1, x: 0, z: 0 };
    for (const a of plan.sizeAdjustments ?? [])
      if (a.members.includes(id)) {
        frame.x = frame.x * a.applied + a.offsetX;
        frame.z = frame.z * a.applied + a.offsetZ;
        frame.scale *= a.applied;
      }
    return frame;
  }
  function sourceBlock(block: ShapeBlock, id: string): ShapeBlock {
    const f = sizeFrame(id);
    return {
      ...block,
      x: (block.x - f.x) / f.scale,
      z: (block.z - f.z) / f.scale,
      width: block.width / f.scale,
      length: block.length / f.scale
    };
  }
  function prepareComponentEdit(): ReturnType<typeof selectedBlock> {
    const target = selectedBlock();
    if (!target) return;
    const e = shapeEdits[target.group.id];
    if (
      e?.semantic &&
      Object.entries(SHAPE_INTENT_DEFAULTS).some(([k, v]) => k !== "size" && e.semantic![k as keyof ShapeIntent] !== v)
    ) {
      const frame = sizeFrame(target.group.id),
        source = {
          ...structuredClone(target.group),
          rounding: target.group.rounding / frame.scale,
          blocks: target.group.blocks.map((b) => sourceBlock(b, target.group.id))
        };
      shapeEdits[target.group.id] = { source, semantic: { ...SHAPE_INTENT_DEFAULTS, size: e.semantic.size } };
      syncIntent();
    }
    return target;
  }
  const fields: { key: "width" | "length" | "yaw" | "x" | "z"; label: string; min: number; max: number }[] = [
    { key: "width", label: "组件宽度", min: 1, max: 2048 },
    { key: "length", label: "组件长度", min: 1, max: 2048 },
    { key: "yaw", label: "组件旋转", min: -180, max: 180 },
    { key: "x", label: "组件 X", min: 0, max: 2048 },
    { key: "z", label: "组件 Z", min: 0, max: 2048 }
  ];
  for (const f of fields) {
    const label = document.createElement("label");
    label.className = "ip-parameter";
    label.innerHTML = `<span>${f.label}<output></output></span><input type="range" aria-label="${f.label}" min="${f.min}" max="${f.max}" step="1" data-component-field="${f.key}"><input type="number" aria-label="${f.label}数值" ${f.key === "width" || f.key === "length" ? 'min="0.01"' : ""} step="any" data-component-number="${f.key}">`;
    const input = label.querySelector<HTMLInputElement>('input[type="range"]')!,
      number = label.querySelector<HTMLInputElement>('input[type="number"]')!;
    const update = (value: number) => {
      if (timer) rebuild("当前参数");
      if (!Number.isFinite(value)) return;
      const target = prepareComponentEdit();
      if (!target) return;
      const e = (shapeEdits[target.group.id] ??= {});
      e.patches ??= {};
      const frame = sizeFrame(target.group.id),
        raw =
          f.key === "x"
            ? (value - frame.x) / frame.scale
            : f.key === "z"
              ? (value - frame.z) / frame.scale
              : f.key === "yaw"
                ? value
                : value / frame.scale;
      e.patches[target.block.id] = { ...e.patches[target.block.id], [f.key]: raw };
      label.querySelector("output")!.textContent = format(value);
      clearTimeout(timer);
      timer = setTimeout(() => rebuild(f.label), 60);
    };
    input.oninput = () => {
      number.value = input.value;
      update(input.valueAsNumber);
    };
    number.onchange = () => update(number.valueAsNumber);
    root.querySelector(".component-fields")!.append(label);
  }
  function syncBlockFields(): void {
    const target = selectedBlock();
    if (!target) return;
    for (const f of fields) {
      const input = root.querySelector<HTMLInputElement>(`[data-component-field="${f.key}"]`)!,
        value = target.block[f.key];
      input.min = String(Math.min(f.min, value));
      input.max = String(Math.max(f.max, value));
      input.value = String(value);
      root.querySelector<HTMLInputElement>(`[data-component-number="${f.key}"]`)!.value = format(value);
      input.parentElement!.querySelector("output")!.textContent = format(value);
    }
  }
  function syncBlocks(): void {
    const previous = blockSelect.value;
    blockSelect.replaceChildren();
    for (const g of plan.shapeRecipes ?? [])
      for (const b of g.blocks) {
        const option = document.createElement("option");
        option.value = b.id;
        option.textContent = `${g.label} / ${b.id}`;
        blockSelect.append(option);
      }
    if ([...blockSelect.options].some((o) => o.value === previous)) blockSelect.value = previous;
    syncBlockFields();
  }
  blockSelect.onchange = () => {
    selected = blockSelect.value;
    const g = selectedBlock()?.group;
    if (g) {
      shapeSelect.value = g.id;
      syncIntent();
    }
    layerState.components = true;
    root.querySelector('[data-layer="components"]')!.setAttribute("aria-pressed", "true");
    applyLayers();
    view.setSelection(selected);
    syncBlockFields();
    inspect();
  };
  action("add-block").onclick = () => {
    if (timer) rebuild("当前组件");
    const t = prepareComponentEdit();
    if (!t) return;
    const id = `${t.group.id}-added-${++blockSerial}`,
      added = attachedBlock(t.group, t.block, id, plan.parameters.width);
    if (!added) {
      status.textContent = "所选组件四侧没有可用连接位置；请移动或缩小组件后再添加";
      return;
    }
    const e = (shapeEdits[t.group.id] ??= {});
    (e.added ??= []).push(sourceBlock(added, t.group.id));
    rebuild("添加组件");
    if (plan.shapeRecipes?.some((g) => g.blocks.some((v) => v.id === id))) {
      blockSelect.value = id;
      blockSelect.onchange!(new Event("change"));
      status.textContent = `已添加 ${id} · ${format(added.width)} × ${format(added.length)} 米`;
    }
  };
  action("remove-block").onclick = () => {
    if (timer) rebuild("当前组件");
    const t = prepareComponentEdit();
    if (!t || t.group.blocks.length <= 1) return;
    const e = (shapeEdits[t.group.id] ??= {});
    (e.removed ??= []).push(t.block.id);
    rebuild("删除组件");
  };
  function inspect(): void {
    const rock = plan.rocks.find((r) => r.id === selected),
      group = plan.mountains.find((g) => g.id === selected),
      building = plan.buildings.find((b) => b.id === selected),
      water = plan.waters.find((w) => w.id === selected),
      region = plan.regions.find((r) => r.id === selected);
    const component = selectedBlock();
    const title =
      selected === component?.block.id
        ? `${component.group.label} · 拼接组件`
        : rock
          ? "单岩外包围盒"
          : (group?.label ?? (building ? "村落建筑" : (water?.label ?? region?.label ?? "空间底图")));
    const description =
      selected === component?.block.id
        ? `位置 (${format(component.block.x)}, ${format(component.block.z)}) · ${format(component.block.width)} × ${format(component.block.length)} 米 · ${format(component.block.yaw)}°`
        : rock
          ? `占地 ${Math.round(rock.width)} × ${Math.round(rock.depth)} 米 · 高 ${Math.round(rock.height)} 米 · 朝向 ${Math.round((rock.yaw * 180) / Math.PI)}°`
          : group
            ? `${group.rockIds.length} 个岩体由连续骨架与宽度生成`
            : building
              ? `占地 ${building.width} × ${building.depth} 米 · 高 ${building.height} 米`
              : water
                ? "水域由矩形组件合并、曲线化生成；选择组件可调整局部"
                : region
                  ? "可编辑区域边界与内部体量分开保存"
                  : "参数改变生成几何；出生点、道路与视线尚未规划。";
    inspector.replaceChildren();
    const heading = document.createElement("strong"),
      body = document.createElement("p");
    heading.textContent = title;
    body.textContent = description;
    inspector.append(heading, body);
    root.dataset.selectedId = selected ?? "";
  }
  let lastEdits = "{}",
    lastParameters = { ...parameters };
  function rebuild(label: string): void {
    if (timer) clearTimeout(timer);
    timer = undefined;
    const start = performance.now();
    try {
      const candidate = generateBaseMap(parameters, shapeEdits);
      const all = [candidate.land, ...candidate.islands, ...candidate.waters.map((w) => w.outline)];
      if (all.some((r) => r.some((v) => v.x < 0 || v.z < 0 || v.x > 2048 || v.z > 2048)))
        throw new Error("轮廓超出 2048 米范围");
      plan = candidate;
    } catch (error) {
      shapeEdits = JSON.parse(lastEdits);
      parameters = { ...lastParameters };
      syncBlocks();
      syncIntent();
      status.textContent = `保留上次布局：${error instanceof Error ? error.message : String(error)}`;
      return;
    }
    lastEdits = JSON.stringify(shapeEdits);
    lastParameters = { ...parameters };
    syncBlocks();
    syncIntent();
    revision++;
    view.setPlan(plan, revision);
    applyLayers();
    inspect();
    root.dataset.revision = String(revision);
    for (const [key, value] of Object.entries(parameters)) root.dataset[key] = String(value);
    const limited = plan.sizeAdjustments?.filter((a) => Math.abs(a.applied - a.requested) > 0.005);
    status.textContent = limited?.length
      ? `${label} · 边界联动：${limited.map((a) => `${a.label}实际 ${format(a.applied)} 倍`).join("、")}`
      : `${label} · ${Math.round(performance.now() - start)} ms`;
  }
  action("restore").onclick = () => {
    shapeEdits = {};
    parameters = { ...BASE_MAP_DEFAULTS };
    selected = null;
    view.setSelection(null);
    syncIntent();
    rebuild("参考构图");
    view.fit();
  };
  action("export").onclick = () => {
    if (timer) rebuild("当前规划");
    const blob = new Blob([JSON.stringify({ schema: "base-map/3", parameters, shapeEdits, plan }, null, 2)], {
        type: "application/json"
      }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = "空间底图.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  action("fit").onclick = () => view.fit();
  action("in").onclick = () => view.zoom(1.25);
  action("out").onclick = () => view.zoom(0.8);
  rebuild("参考构图");
}
