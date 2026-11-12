import { buildPlanningScene, ancestors, type PlanningScene, type SceneEntity } from "@galacean/engine-world-planning/spatial/PlanningScene";
import type { IslandPlan } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel";
import { poiContentLabel } from "@galacean/engine-world-planning/semantic-study/PoiContents";
import { MOJAVE_ROCK_GROUP, MOJAVE_STONE } from "@galacean/engine-world-planning/spatial/layout/MojaveDesertLayout";
export interface LayerNode {
  id: string;
  label: string;
  focusId?: string;
  layers?: string[];
  children?: LayerNode[];
  initial?: boolean;
  /** View helpers are controls, not selectable spatial entities. */
  presentation?: boolean;
}
const labels = new WeakMap<IslandPlan, Map<string, string>>();
/** Human-readable instance labels shared by breadcrumbs and hierarchy leaves. */
export function elementLabel(plan: IslandPlan, id: string): string {
  let index = labels.get(plan);
  if (!index) {
    index = new Map();
    for (const p of [
      ...plan.mountains,
      ...plan.regions,
      ...(plan.flowerRegions ?? []),
      ...plan.waters,
      ...plan.routes,
      ...plan.bridges,
      ...(plan.plazas ?? [])
    ])
      index.set(p.id, p.label ?? p.id);
    for (const p of plan.buildings) index.set(p.id, `建筑 ${p.id.split("-building-").at(-1)}`);
    plan.rocks.forEach((p, i) => index!.set(p.id, `${p.assetId === MOJAVE_ROCK_GROUP ? "Mojave 岩石组" : "岩体"} ${i + 1}`));
    for (const p of plan.landscapes ?? [])
      index.set(
        p.id,
        `${p.assetId === MOJAVE_STONE ? "Mojave 景观石" : p.role === "poi" ? "主体高树" : p.kind === "tree" ? "景观树" : "景观石"} · ${p.height.toFixed(1)} m · (${p.center.x.toFixed(0)}, ${p.center.z.toFixed(0)})`
      );
    for (const group of plan.spatialLayout?.groups ?? [])
      group.volumes.forEach((v, i) => index!.set(v.id, `体量 ${i + 1}`));
    labels.set(plan, index);
  }
  return index.get(id) ?? id;
}
const object = (id: string) => `object:${id}`;
/** Published instances and retained authoring remain selectable independently of geometry validity. */
export function planningLayerTree(plan: IslandPlan, scene: PlanningScene = buildPlanningScene(plan)): LayerNode[] {
  const sites = plan.poiDistribution?.sites ?? [];
  const owned = new Map<string, SceneEntity[]>();
  const masks = new Map<string, string[]>();
  const independent: SceneEntity[] = [],
    globalRoads: SceneEntity[] = [];
  for (const entity of scene.entities.values()) {
    const poi = ancestors(scene, entity.id).find((e) => e.components.poi);
    if (poi) {
      const ids = masks.get(poi.id) ?? [];
      ids.push(object(entity.id));
      masks.set(poi.id, ids);
    }
    if (!entity.components.display || !entity.components.geometry || entity.id === poi?.id || entity.kind === "island")
      continue;
    if (poi) {
      const list = owned.get(poi.id) ?? [];
      list.push(entity);
      owned.set(poi.id, list);
    } else if (entity.components.display.globalRoad) globalRoads.push(entity);
    else independent.push(entity);
  }
  const internalMasks = new Map<string, string[]>();
  for (const e of scene.entities.values())
    if (e.parent && e.components.display?.internal) {
      const ids = internalMasks.get(e.parent) ?? [];
      ids.push(object(e.id));
      internalMasks.set(e.parent, ids);
    }
  const nested = new Map<string, SceneEntity[]>();
  for (const e of scene.entities.values()) {
    if (!e.components.display || !e.components.geometry) continue;
    const parent = ancestors(scene, e.id)
      .slice(1)
      .find((p) => p.components.display?.aggregate);
    if (parent) {
      const list = nested.get(parent.id) ?? [];
      list.push(e);
      nested.set(parent.id, list);
    }
  }
  const leaf = (e: SceneEntity): LayerNode => ({
    id: "element:" + e.id,
    label: elementLabel(plan, e.id) === e.id ? e.name : elementLabel(plan, e.id),
    focusId: e.id,
    layers: [object(e.id), ...(internalMasks.get(e.id) ?? [])],
    ...(e.components.display.aggregate ? { children: groupNodes(nested.get(e.id) ?? [], e.id) } : {})
  });
  function groupNodes(items: SceneEntity[], prefix: string): LayerNode[] {
    return items.filter((e) => !e.components.display.internal).map(leaf);
  }

  const topLevel = (items: SceneEntity[]) =>
    items.filter(
      (e) =>
        !ancestors(scene, e.id)
          .slice(1)
          .some((p) => p.components.display?.aggregate)
    );
  return [
    {
      id: "environment",
      label: "世界环境",
      children: [
        {
          id: "land",
          label: "陆域",
          layers: ["land", "island", "surface-grass"],
          children: plan.islands.map((_, i) => ({
            id: `island:${i}`,
            label: `离岛 ${i + 1}`,
            focusId: `offshore-${i}`,
            layers: [`object:offshore-${i}`]
          }))
        },
        ...(plan.parameters.landMode === "continuous" ? [] : [{ id: "ocean", label: "海洋", layers: ["ocean"] }])
      ]
    },
    {
      id: "poi-sites",
      label: "POI",
      layers: ["poi-sites"],
      children: sites
        .map((site) => {
          const members = topLevel(owned.get(site.id) ?? []);
          return {
            id: site.id,
            label: poiContentLabel(plan, site) + (site.active ? "" : " · 未显示"),
            focusId: site.id,
            layers: [...(masks.get(site.id) ?? [object(site.id)]), "territory:" + site.id],
            children: groupNodes(members, site.id)
          };
        })
    },
    {
      id: "roads",
      label: "全局道路",
      layers: ["road-world", "bridge"],
      children: globalRoads.map(leaf)
    },
    {
      id: "world-elements",
      label: "独立空间元素",
      initial: true,
      children: groupNodes(topLevel(independent), "world-elements")
    },
    {
      id: "annotations",
      presentation: true,
      label: "辅助显示",
      children: [
        { id: "terrain-bands", label: "隆起带范围与方向", layers: ["terrain-bands"], initial: false },
        { id: "terrain-height", label: "海拔与等高线", layers: ["height"], initial: false },
        { id: "territories", label: "POI 管理分区", layers: ["territories"], initial: true },
        { id: "farming", label: "农场起始点", layers: ["farming"], initial: true },
        { id: "labels", label: "名称", layers: ["labels"] },
        { id: "outlines", label: "内容轮廓", layers: ["group", "village", "open"], initial: false },
        { id: "boundary", label: "世界边界", layers: ["boundary"] },
        { id: "poi-anchors", label: "POI 锚点", layers: ["poi-anchors"], initial: true },
        { id: "entrance", label: "门口与接入点", layers: ["entrance", "road-access"], initial: false },
        { id: "spawn", label: "出生点", layers: ["spawn"] },
        { id: "components", label: "构造矩形", layers: ["components", "obb"], initial: false }
      ]
    }
  ];
}
/** Parent state masks every descendant without destroying the child's saved preference. */
export function resolveLayerTree(
  nodes: LayerNode[],
  state: Record<string, boolean>,
  parent = true
): Record<string, boolean> {
  const result: Record<string, boolean> = {};
  for (const node of nodes) {
    const enabled = parent && (state[node.id] ?? node.initial ?? true);
    for (const layer of node.layers ?? []) result[layer] = enabled;
    Object.assign(result, resolveLayerTree(node.children ?? [], state, enabled));
  }
  return result;
}
/** Three independent controls: disclosure, selection/focus, and visibility. */
export function mountPlanningLayerTree(
  host: HTMLElement,
  change: () => void,
  focus: (id: string | undefined, node: LayerNode) => void = () => {},
  displayHost?: HTMLElement
) {
  const state: Record<string, boolean> = {},
    opened: Record<string, boolean> = {};
  let structure = "",
    selectedId: string | null = null,
    selectedNodeId: string | undefined;
  const rows = new Map<string, HTMLElement>(),
    disclosures = new Map<string, (open: boolean) => void>();
  let nodes: LayerNode[] = [],
    inputs = new Map<string, HTMLInputElement>();
  function refresh(items = nodes, parent = true) {
    for (const node of items) {
      const input = inputs.get(node.id);
      if (input) {
        input.disabled = !parent;
        input.checked = state[node.id] ?? node.initial ?? true;
        rows.get(node.id)?.classList.toggle("is-disabled", !parent);
      }
      refresh(node.children ?? [], parent && (state[node.id] ?? node.initial ?? true));
    }
  }
  function highlight(nodeId: string | undefined) {
    for (const [id, row] of rows) {
      row.classList.toggle("is-selected", id === nodeId);
      if (id === nodeId) row.setAttribute("aria-current", "true");
      else row.removeAttribute("aria-current");
    }
  }
  function make(node: LayerNode, parent: HTMLElement, depth: number, selectable = !node.presentation) {
    state[node.id] ??= node.initial ?? true;
    const hasChildren = !!node.children?.length;
    const wrap = document.createElement("div");
    wrap.className = hasChildren ? "base-control-group wp-layer-node" : "wp-layer-node";
    wrap.dataset.nodeId = node.id;
    const row = document.createElement("div");
    row.className = "wp-layer-row";
    row.dataset.layerNode = node.id;
    rows.set(node.id, row);
    const disclosure = document.createElement(hasChildren ? "button" : "span");
    disclosure.className = "wp-layer-disclosure";
    const canSelect = selectable && !!node.focusId;
    const text = document.createElement(canSelect ? "button" : "span");
    text.className = canSelect ? "wp-layer-focus" : "wp-layer-caption";
    text.textContent = node.label;
    if (canSelect) {
      (text as HTMLButtonElement).type = "button";
      text.title = "选中并聚焦（F）";
      text.onclick = () => {
        selectedNodeId = node.id;
        focus(node.focusId, node);
        highlight(node.id);
      };
    }
    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "wp-layer-visibility";
    input.setAttribute("aria-label", "显示 " + node.label);
    input.title = "显示 / 隐藏 " + node.label;
    inputs.set(node.id, input);
    input.onchange = () => {
      state[node.id] = input.checked;
      refresh();
      change();
    };
    row.append(disclosure, text, input);
    wrap.append(row);
    parent.append(wrap);
    if (hasChildren) {
      const button = disclosure as HTMLButtonElement;
      button.type = "button";
      const contents = document.createElement("div");
      contents.className = "wp-layer-children";
      wrap.append(contents);
      let built = false;
      const setOpen = (open: boolean) => {
        opened[node.id] = open;
        button.setAttribute("aria-expanded", String(open));
        button.setAttribute("aria-label", (open ? "折叠 " : "展开 ") + node.label);
        button.title = (open ? "折叠 " : "展开 ") + node.label;
        contents.hidden = !open;
        if (open && !built) {
          built = true;
          for (const child of node.children ?? []) make(child, contents, depth + 1, selectable);
        }
      };
      disclosures.set(node.id, setOpen);
      button.onclick = () => {
        setOpen(!opened[node.id]);
        refresh();
        highlight(selectedNodeId);
      };
      setOpen(opened[node.id] ?? depth === 0);
    } else disclosure.setAttribute("aria-hidden", "true");
  }
  /** Map selection reveals its leaf; hierarchy selection preserves the clicked row and disclosure state. */
  function select(id: string | null, reveal = true, nodeId?: string) {
    if (reveal || id !== selectedId) selectedNodeId = undefined;
    selectedId = id;
    if (nodeId !== undefined) selectedNodeId = nodeId;
    const find = (
      matches: (n: LayerNode) => boolean,
      items = nodes,
      parents: LayerNode[] = []
    ): LayerNode[] | undefined => {
      for (const node of items) {
        if (matches(node)) return [...parents, node];
        const found = find(matches, node.children ?? [], [...parents, node]);
        if (found) return found;
      }
    };
    const path =
      (selectedNodeId ? find((n) => n.id === selectedNodeId) : undefined) ??
      (id ? (find((n) => n.id === "element:" + id) ?? find((n) => n.focusId === id || n.id === id)) : undefined);
    selectedNodeId = path?.at(-1)?.id;
    if (reveal && path) for (const node of path.slice(0, -1)) disclosures.get(node.id)?.(true);
    highlight(selectedNodeId);
    if (reveal && selectedNodeId) rows.get(selectedNodeId)?.scrollIntoView({ block: "nearest" });
    refresh();
  }
  return {
    select,
    values: () => resolveLayerTree(nodes, state),
    update(plan: IslandPlan, names: Record<string, string> = {}, scene?: PlanningScene) {
      nodes = planningLayerTree(plan, scene);
      const rename = (items: LayerNode[]) => {
        for (const node of items) {
          if (
            node.focusId &&
            names[node.focusId] &&
            names[node.focusId] !== node.focusId &&
            !(names[node.focusId].trim() === "POI" && plan.poiDistribution?.sites.some(site => site.id === node.focusId))
          )
            node.label = names[node.focusId] +
              (plan.poiDistribution?.sites.some(site => site.id === node.focusId && !site.active) ? " · 未显示" : "");
          rename(node.children ?? []);
        }
      };
      rename(nodes);
      const nextStructure = JSON.stringify(nodes, (key, value) => (key === "layers" ? undefined : value));
      if (nextStructure === structure) return;
      structure = nextStructure;
      host.replaceChildren();
      displayHost?.replaceChildren();
      inputs = new Map();
      rows.clear();
      disclosures.clear();
      for (const node of nodes) make(node, node.presentation && displayHost ? displayHost : host, 0);
      refresh();
      select(selectedId, false);
    }
  };
}
