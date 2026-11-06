import { createRiverTerrainModifier, sampleWaterTerrainHeight } from "@galacean/engine-water/water/index";
import { Camera, Ray, Vector2, Vector3 } from "@galacean/engine";
import type * as dat from "dat.gui";
import type { RiverEditSession } from "@galacean/engine-water/water/runtime/river/index";

import type { ShowcaseCameraController } from "../showcase/ShowcaseCameraControl.ts";
import { createRiverGenerationPanel } from "./RiverGenerationPanel.ts";

/** Demo UI only: all edits, import and history operations go through the same session as game code. */
export function createRiverEditorPanel(
  gui: dat.GUI,
  options: {
    session(): RiverEditSession | undefined;
    camera: Camera;
    cameraControl: ShowcaseCameraController;
    canvas: HTMLCanvasElement;
    publish(action: "apply" | "undo" | "redo"): Promise<void>;
  }
) {
  const folder = gui.addFolder("单河段编辑 · 河槽修改");
  const state = { point: 1, x: 0, y: 0, z: 0, width: 8, speed: 1, locked: true, clearance: 1 };
  const elevationShift = { delta: 0.5, includeLocked: false };
  const constraints = document.createElement("output");
  constraints.dataset.riverEditConstraints = "true";
  constraints.style.cssText =
    "display:block;white-space:pre-wrap;overflow-wrap:anywhere;padding:6px;font:12px/1.5 system-ui;color:#d6e7e9";
  const constraintRow = document.createElement("li");
  constraintRow.style.height = "auto";
  constraintRow.append(constraints);
  const channel = { enabled: false, targetBedDepth: 2, bedWidthRatio: 0.6, bankWidth: 2, falloff: "smoothstep" };
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.dataset.riverEditorOverlay = "true";
  svg.style.cssText = "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:3;touch-action:none";
  document.body.append(svg);
  const info = document.createElement("output");
  info.style.cssText = "display:block;white-space:pre-wrap;color:#e3edcc;font:12px/1.5 system-ui;padding:6px";
  const section = document.createElement("canvas");
  section.width = 270;
  section.height = 110;
  section.style.cssText = "display:block;width:100%;height:110px";
  section.setAttribute("aria-label", "选中控制点的实际河床与水面横断面");
  const li = document.createElement("li");
  li.style.cssText = "height:auto";
  li.append(info, section);
  let snapshot: RiverEditSession["snapshot"] | undefined;
  let selectedId: string | undefined;
  let error = "";
  let destroyed = false;
  let drag: { pointerId: number; pointId: string; height: number; cameraActive: boolean } | undefined;
  const projected = new Vector3(),
    world = new Vector3(),
    viewport = new Vector2(),
    ray = new Ray();
  const run = (action: () => void) => {
    try {
      action();
      error = "";
    } catch (e) {
      error = String(e);
    }
    refresh();
  };
  const edit = () =>
    run(() =>
      options.session()!.patchPoint(selectedId!, {
        position: [state.x, state.y, state.z],
        width: state.width,
        flowSpeed: state.speed,
        elevationLocked: state.locked
      })
    );
  const generationPanel = createRiverGenerationPanel(folder, options.session, refresh);
  folder
    .add(state, "point")
    .min(1)
    .step(1)
    .name("控制点序号")
    .onFinishChange(() => {
      selectedId = options.session()?.snapshot.draft.points[Math.round(state.point) - 1]?.id;
      refresh();
    });
  folder.add(state, "locked").name("锁定水面高程").onChange(edit);
  folder.add(state, "x").step(0.01).name("位置 X（米）").onFinishChange(edit);
  folder.add(state, "z").step(0.01).name("位置 Z（米）").onFinishChange(edit);
  const heightControl = folder.add(state, "y").step(0.01).name("水面高程（米）").onFinishChange(edit);
  folder.add(state, "width", 1, 50, 0.1).name("局部全宽（米）").onFinishChange(edit);
  folder.add(state, "speed", 0, 10, 0.1).name("局部流速（米/秒）").onFinishChange(edit);
  folder.add(state, "clearance", 0, 10, 0.1).name("基础地形偏移（米）");
  folder.domElement.querySelector("ul")!.append(constraintRow);
  const shiftFolder = folder.addFolder("整段高程调整");
  shiftFolder.add(elevationShift, "delta", -100, 100, 0.1).name("升降量（米）");
  shiftFolder.add(elevationShift, "includeLocked").name("包含锁定点");
  shiftFolder
    .add(
      { shift: () => run(() => options.session()!.shiftElevation(elevationShift.delta, elevationShift.includeLocked)) },
      "shift"
    )
    .name("整段升降到草稿");
  const modifierFolder = folder.addFolder("河槽修改 · 只挖不填");
  const updateModifier = () =>
    run(() => {
      const session = options.session()!;
      session.setTerrainModifier(
        channel.enabled
          ? {
              ...(session.snapshot.draft.modifier ?? createRiverTerrainModifier(session.riverId)),
              targetBedDepth: channel.targetBedDepth,
              bedWidthRatio: channel.bedWidthRatio,
              bankWidth: channel.bankWidth,
              falloff: channel.falloff as "linear" | "smoothstep"
            }
          : undefined
      );
    });
  modifierFolder.add(channel, "enabled").name("雕刻河槽").onChange(updateModifier);
  modifierFolder.add(channel, "targetBedDepth", 0.1, 10, 0.1).name("目标床深（米）").onFinishChange(updateModifier);
  modifierFolder.add(channel, "bedWidthRatio", 0.1, 1, 0.05).name("平底宽度比例").onFinishChange(updateModifier);
  modifierFolder.add(channel, "bankWidth", 0.1, 10, 0.1).name("岸坡过渡（米）").onFinishChange(updateModifier);
  modifierFolder
    .add(channel, "falloff", { 平滑: "smoothstep", 线性: "linear" })
    .name("岸坡形状")
    .onChange(updateModifier);
  modifierFolder.open();
  const publish = async (action: "apply" | "undo" | "redo") => {
    try {
      const pending = options.publish(action);
      refresh();
      await pending;
      error = "";
    } catch (e) {
      error = e instanceof Error && e.name === "AbortError" ? "已取消过期编辑" : String(e);
    }
    refresh();
  };
  const dialog = document.createElement("dialog");
  dialog.style.cssText =
    "width:min(700px,85vw);background:#173038;color:#eef6e4;border:1px solid #76928d;border-radius:8px;padding:16px";
  const title = document.createElement("h3");
  title.textContent = "River 编辑 JSON · 基础地形 + 河槽意图";
  const editor = document.createElement("textarea");
  editor.setAttribute("aria-label", "River 编辑 JSON");
  editor.style.cssText = "width:100%;height:45vh;box-sizing:border-box";
  const message = document.createElement("output");
  message.style.display = "block";
  const importButton = document.createElement("button");
  importButton.textContent = "导入草稿";
  importButton.onclick = () => {
    try {
      options.session()!.importJSON(editor.value);
      message.textContent = "草稿已导入，点击应用后发布";
      error = "";
      refresh();
    } catch (e) {
      message.textContent = String(e);
    }
  };
  const download = document.createElement("button");
  download.textContent = "下载编辑 JSON";
  download.onclick = () => {
    const url = URL.createObjectURL(new Blob([options.session()!.exportJSON()], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "river-edit-v3.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };
  const close = document.createElement("button");
  close.textContent = "关闭";
  close.onclick = () => dialog.close();
  dialog.append(title, editor, importButton, download, close, message);
  document.body.append(dialog);
  const actions = {
    insert: () =>
      run(() => {
        selectedId = options.session()!.insertAfter(selectedId!);
      }),
    remove: () => run(() => options.session()!.removePoint(selectedId!)),
    snap: () => run(() => options.session()!.snapPointToTerrain(selectedId!, state.clearance)),
    apply: () => void publish("apply"),
    undo: () => void publish("undo"),
    redo: () => void publish("redo"),
    cancel: () => run(() => options.session()!.cancel()),
    json: () => {
      editor.value = options.session()!.exportJSON();
      message.textContent = "V3 保存当前控制点、生成来源、河槽参数和基础地形引用；兼容导入 V1/V2，不会重新生成。";
      dialog.showModal();
    }
  };
  for (const [key, label] of [
    ["insert", "在后方插入控制点"],
    ["remove", "删除选中控制点"],
    ["snap", "吸附到基础地形 + 偏移"],
    ["apply", "应用河流与河槽"],
    ["cancel", "取消河流草稿"],
    ["undo", "撤销已应用编辑"],
    ["redo", "重做编辑"],
    ["json", "编辑 JSON 导入 / 导出"]
  ] as const)
    folder.add(actions, key).name(label);
  folder.domElement.querySelector("ul")!.append(li);
  folder.open();

  function refresh() {
    generationPanel.refresh();
    if (destroyed) return;
    snapshot = options.session()?.snapshot;
    folder.domElement.style.display = snapshot ? "" : "none";
    svg.style.display = snapshot ? "" : "none";
    if (!snapshot) {
      endDrag();
      return;
    }
    const points = snapshot.draft.points;
    const point = points.find((p) => p.id === selectedId) ?? points[0];
    selectedId = point.id;
    Object.assign(state, {
      point: points.indexOf(point) + 1,
      x: point.position[0],
      y: point.position[1],
      z: point.position[2],
      width: point.width,
      speed: point.flowSpeed,
      locked: point.elevationLocked
    });
    // A completed publication may refresh the panel while the user is still typing.
    // Keep that input intact until dat.GUI commits its change on blur.
    folder.__controllers.forEach((controller) => {
      if (!controller.domElement.contains(document.activeElement)) controller.updateDisplay();
    });
    const modifier = snapshot.draft.modifier;
    channel.enabled = !!modifier;
    if (modifier)
      Object.assign(channel, {
        targetBedDepth: modifier.targetBedDepth,
        bedWidthRatio: modifier.bedWidthRatio,
        bankWidth: modifier.bankWidth,
        falloff: modifier.falloff
      });
    modifierFolder.__controllers.forEach((controller) => {
      if (!controller.domElement.contains(document.activeElement)) controller.updateDisplay();
    });
    const selectedIndex = points.indexOf(point);
    const upstream = points[selectedIndex - 1],
      downstream = points[selectedIndex + 1];
    const range = `${downstream ? downstream.position[1].toFixed(3) : "无下游下限"} ～ ${upstream ? upstream.position[1].toFixed(3) : "无上游上限"}`;
    const errors = snapshot.diagnostics.filter((d) => d.severity === "error");
    const warnings = snapshot.diagnostics.filter((d) => d.severity === "warning");
    constraints.replaceChildren();
    const limit = document.createElement("div");
    limit.textContent = `第 ${selectedIndex + 1} 点 · ${point.elevationLocked ? "高程已锁定" : "可编辑高程"}\n${upstream && downstream && downstream.position[1] > upstream.position[1] ? "相邻点高程冲突，暂无可用范围；请先调整上、下游高程。" : `沿下游不升高；高程范围：${range} m`}\n锁定只约束高程，拖动仅改变 X/Z。`;
    constraints.append(limit);
    for (const [label, issues, color] of [
      ["错误 · 应用前需修复", errors, "#ffaaa2"],
      ["警告 · 需检查", warnings, "#ffd36a"]
    ] as const) {
      if (!issues.length) continue;
      const block = document.createElement("div");
      block.style.color = color;
      block.textContent = `${label}（${issues.length}）\n${issues
        .slice(0, 8)
        .map((d) => d.message)
        .join("\n")}${issues.length > 8 ? "\n其余问题请查看画面标记或 editor.snapshot.diagnostics。" : ""}`;
      constraints.append(block);
    }
    if (!errors.length && !warnings.length) {
      const valid = document.createElement("div");
      valid.textContent = "高程与水面几何检查通过；应用时继续检查地形和完整编译结果。";
      constraints.append(valid);
    }
    heightControl.domElement.querySelector("input")!.disabled = point.elevationLocked;
    const bed = sampleWaterTerrainHeight(options.session()!.publishedTerrain, state.x, state.z);
    info.textContent = `${snapshot.pending ? "发布准备中" : snapshot.dirty ? "有未应用草稿" : "已发布"} · 发布序号 ${snapshot.publicationRevision}\n${snapshot.published.riverEnabled ? "水体有效" : "水体已删除"} · 地形 ${snapshot.derivedTerrain.revision}\n黄色：草稿  灰色：已发布\n床高 ${bed?.toFixed(3) ?? "越界"} m · 草稿水深 ${bed === undefined ? "—" : Math.max(0, state.y - bed).toFixed(3)} m\n撤销 ${snapshot.canUndo ? "可用" : "—"} / 重做 ${snapshot.canRedo ? "可用" : "—"}${error ? `\n${error}` : ""}`;
    drawSection();
  }
  function crossDirection(index: number) {
    const points = snapshot!.draft.points,
      a = points[Math.max(0, index - 1)].position,
      b = points[Math.min(points.length - 1, index + 1)].position;
    const length = Math.hypot(b[0] - a[0], b[2] - a[2]) || 1;
    return [-(b[2] - a[2]) / length, (b[0] - a[0]) / length];
  }
  function drawSection() {
    const context = section.getContext("2d")!;
    context.fillStyle = "#18282d";
    context.fillRect(0, 0, 270, 110);
    const direction = crossDirection(state.point - 1),
      span = state.width / 2 + 3;
    const heights = Array.from({ length: 55 }, (_, i) => {
      const offset = ((i / 54) * 2 - 1) * span;
      return sampleWaterTerrainHeight(
        options.session()!.publishedTerrain,
        state.x + direction[0] * offset,
        state.z + direction[1] * offset
      );
    });
    const baseHeights = heights.map((_, i) => {
      const offset = ((i / 54) * 2 - 1) * span;
      return sampleWaterTerrainHeight(
        options.session()!.terrain,
        state.x + direction[0] * offset,
        state.z + direction[1] * offset
      );
    });
    const valid = [...heights, ...baseHeights].filter((h): h is number => h !== undefined),
      min = Math.min(state.y, ...valid) - 0.3,
      max = Math.max(state.y, ...valid) + 0.3;
    const y = (height: number) => 100 - ((height - min) / (max - min)) * 90;
    context.strokeStyle = "#b6a278";
    context.beginPath();
    let connected = false;
    heights.forEach((h, i) => {
      if (h === undefined) {
        connected = false;
        return;
      }
      if (connected) context.lineTo(i * 5, y(h));
      else context.moveTo(i * 5, y(h));
      connected = true;
    });
    context.stroke();
    context.strokeStyle = "#55d8ec";
    context.beginPath();
    context.moveTo(135 - (state.width / 2 / span) * 135, y(state.y));
    context.lineTo(135 + (state.width / 2 / span) * 135, y(state.y));
    context.stroke();
    context.fillStyle = "#dae9dd";
    context.font = "11px sans-serif";
    context.fillText("棕：当前河床 蓝：草稿水面 灰：基础", 8, 13);
    context.strokeStyle = "#809197";
    context.beginPath();
    connected = false;
    baseHeights.forEach((h, i) => {
      if (h === undefined) {
        connected = false;
        return;
      }
      if (connected) context.lineTo(i * 5, y(h));
      else context.moveTo(i * 5, y(h));
      connected = true;
    });
    context.stroke();
  }
  const project = (position: number[]) => {
    world.set(position[0], position[1], position[2]);
    options.camera.worldToViewportPoint(world, projected);
    const rect = options.canvas.getBoundingClientRect();
    return [rect.left + projected.x * rect.width, rect.top + projected.y * rect.height, projected.z];
  };
  let raf = 0;
  function drawOverlay() {
    if (destroyed) return;
    if (snapshot) {
      const line = (positions: number[][], color: string, dash = "") =>
        `<polyline points="${positions
          .map(project)
          .filter((p) => p[2] > 0)
          .map((p) => `${p[0]},${p[1]}`)
          .join(" ")}" fill="none" stroke="${color}" stroke-width="2" stroke-dasharray="${dash}"/>`;
      let markup =
        line(
          snapshot.published.points.map((p) => p.position),
          "#b8c9cc",
          "5 4"
        ) +
        line(
          snapshot.draft.points.map((p) => p.position),
          "#ffd36a"
        );
      const invalidPoints = new Set(
        snapshot.diagnostics.filter((d) => d.severity === "error").flatMap((d) => d.pointIndices)
      );
      for (const issue of snapshot.diagnostics) {
        for (const span of issue.spans ?? [])
          markup += line(
            span.map((p) => [...p]),
            "#ffab52"
          );
      }
      snapshot.draft.points.forEach((p, i) => {
        const center = project(p.position),
          d = crossDirection(i);
        markup += line(
          [-1, 1].map((sign) => [
            p.position[0] + (sign * d[0] * p.width) / 2,
            p.position[1],
            p.position[2] + (sign * d[1] * p.width) / 2
          ]),
          "#e9bd6880"
        );
        if (center[2] > 0)
          markup += `<circle data-point-index="${i}" cx="${center[0]}" cy="${center[1]}" r="${p.id === selectedId ? 9 : 6}" fill="${invalidPoints.has(i) ? "#ef6656" : p.id === selectedId ? "#ff9856" : "#ffdc88"}" stroke="#263d43" style="pointer-events:all;cursor:grab"/><text x="${center[0] + 11}" y="${center[1] - 10}" fill="#fff5d2" font-size="12">${i + 1}</text>`;
      });
      svg.innerHTML = markup;
    }
    raf = requestAnimationFrame(drawOverlay);
  }
  svg.onpointerdown = (event) => {
    const index = (event.target as SVGElement).getAttribute("data-point-index");
    if (index === null || !snapshot) return;
    const point = snapshot.draft.points[Number(index)];
    selectedId = point.id;
    drag = {
      pointerId: event.pointerId,
      pointId: point.id,
      height: point.position[1],
      cameraActive: options.cameraControl.freeControlActive
    };
    options.cameraControl.setFreeControlActive(false);
    svg.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
    refresh();
  };
  svg.onpointermove = (event) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const rect = options.canvas.getBoundingClientRect();
    viewport.set((event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height);
    options.camera.viewportPointToRay(viewport, ray);
    if (Math.abs(ray.direction.y) < 1e-5) return;
    const t = (drag.height - ray.origin.y) / ray.direction.y;
    if (t < 0) return;
    run(() =>
      options.session()!.patchPoint(drag!.pointId, {
        position: [ray.origin.x + ray.direction.x * t, drag!.height, ray.origin.z + ray.direction.z * t]
      })
    );
    event.preventDefault();
    event.stopPropagation();
  };
  function endDrag() {
    if (!drag) return;
    const previous = drag;
    drag = undefined;
    options.cameraControl.setFreeControlActive(previous.cameraActive);
    if (svg.hasPointerCapture(previous.pointerId)) svg.releasePointerCapture(previous.pointerId);
  }
  svg.onpointerup = endDrag;
  svg.onpointercancel = endDrag;
  svg.onlostpointercapture = endDrag;
  window.addEventListener("blur", endDrag);
  refresh();
  drawOverlay();
  return {
    refresh,
    destroy: () => {
      destroyed = true;
      cancelAnimationFrame(raf);
      endDrag();
      window.removeEventListener("blur", endDrag);
      svg.remove();
      dialog.remove();
    }
  };
}
