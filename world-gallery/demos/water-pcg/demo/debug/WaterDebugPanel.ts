/** Terrain-style DOM panel for inspecting Water PCG river compilation stages. */
import type { RiverCompiledData, ReadonlyVector3Tuple } from "../../compiler/river/types";
import {
  RiverDebugChannel,
  RiverDebugSession,
  RiverDebugStage,
  RIVER_DEBUG_STAGE_LABELS,
  RIVER_DEBUG_STAGE_ORDER,
  parseRiverDebugTarget,
  serializeRiverDebugTarget,
  type RiverDebugCard,
  type RiverDebugRuntimeMetrics,
  type RiverDebugSnapshot
} from "./RiverDebugSession";
import { decodeRiverLocalMapThumbnail } from "./RiverDebugThumbnail";

export interface WaterDebugPanelHandles {
  readonly root: HTMLDivElement;
  destroy(): void;
}

interface Point2 {
  readonly x: number;
  readonly y: number;
}

interface DebugLine {
  readonly points: readonly Point2[];
  readonly color: string;
  readonly closed?: boolean;
}

const THUMBNAIL_SIZE = 128;

function button(label: string): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.textContent = label;
  return element;
}

function appendText(parent: HTMLElement, tag: "span" | "strong", text: string, css: string): HTMLElement {
  const element = document.createElement(tag);
  element.textContent = text;
  element.style.cssText = css;
  parent.appendChild(element);
  return element;
}

function segment(a: ReadonlyVector3Tuple, b: ReadonlyVector3Tuple, color: string): DebugLine {
  return {
    points: [
      { x: a[0], y: a[2] },
      { x: b[0], y: b[2] }
    ],
    color
  };
}

function targetMatches(snapshot: RiverDebugSnapshot, kind: "reach" | "junction" | "chunk", id: string): boolean {
  const target = snapshot.selection.target;
  return target.kind === "network" || (target.kind === kind && target.id === id);
}

function collectPathLines(snapshot: RiverDebugSnapshot, card: RiverDebugCard): DebugLine[] {
  const data = snapshot.context.data;
  const lines: DebugLine[] = [];
  if (card.channel === RiverDebugChannel.ControlPoints || card.channel === RiverDebugChannel.AuthoredPath) {
    for (const reach of data.reaches) {
      if (!targetMatches(snapshot, "reach", reach.id)) continue;
      lines.push({
        points: reach.config.path.points.map((point) => ({ x: point.position[0], y: point.position[2] })),
        color: "#ffb84d"
      });
    }
  } else if (card.channel === RiverDebugChannel.CompiledTopology) {
    for (const reach of data.reaches) {
      if (!targetMatches(snapshot, "reach", reach.id)) continue;
      lines.push(segment(data.nodes[reach.fromNodeIndex].position, data.nodes[reach.toNodeIndex].position, "#ffd55c"));
    }
    for (const junction of data.junctions) {
      if (!targetMatches(snapshot, "junction", junction.id)) continue;
      lines.push({
        points: junction.queryBoundary.map((point) => ({ x: point[0], y: point[2] })),
        color: "#ff70d2",
        closed: true
      });
    }
  } else if (card.channel === RiverDebugChannel.Samples || card.channel === RiverDebugChannel.Banks) {
    for (const reach of data.reaches) {
      if (!targetMatches(snapshot, "reach", reach.id)) continue;
      lines.push({
        points: reach.artifact.samples.map((sample) => ({ x: sample.position[0], y: sample.position[2] })),
        color: "#ffe65d"
      });
      if (card.channel === RiverDebugChannel.Banks) {
        const left: Point2[] = [];
        const right: Point2[] = [];
        for (const sample of reach.artifact.samples) {
          const length = Math.hypot(sample.tangent[0], sample.tangent[2]) || 1;
          const nx = -sample.tangent[2] / length;
          const nz = sample.tangent[0] / length;
          const halfWidth = sample.width * 0.5;
          left.push({ x: sample.position[0] + nx * halfWidth, y: sample.position[2] + nz * halfWidth });
          right.push({ x: sample.position[0] - nx * halfWidth, y: sample.position[2] - nz * halfWidth });
        }
        lines.push({ points: left, color: "#6fffc3" }, { points: right, color: "#6fffc3" });
      }
    }
  } else if (card.channel === RiverDebugChannel.Junctions) {
    for (const junction of data.junctions) {
      if (!targetMatches(snapshot, "junction", junction.id)) continue;
      lines.push({
        points: junction.queryBoundary.map((point) => ({ x: point[0], y: point[2] })),
        color: "#ff70d2",
        closed: true
      });
    }
  } else if (card.channel === RiverDebugChannel.RawMesh || card.channel === RiverDebugChannel.Chunks) {
    for (const chunk of data.chunks) {
      const target = snapshot.selection.target;
      const matchesTarget =
        target.kind === "network" ||
        (target.kind === "chunk" && chunk.id === target.id) ||
        (target.kind === "reach" &&
          chunk.sourceKind === "reach" &&
          data.reaches[chunk.sourceIndex]?.id === target.id) ||
        (target.kind === "junction" &&
          chunk.sourceKind === "junction" &&
          data.junctions[chunk.sourceIndex]?.id === target.id);
      if (!matchesTarget) continue;
      const bounds = chunk.surfaceGeometry.bounds;
      const minX = bounds.min[0] + chunk.localOrigin[0];
      const minZ = bounds.min[2] + chunk.localOrigin[2];
      const maxX = bounds.max[0] + chunk.localOrigin[0];
      const maxZ = bounds.max[2] + chunk.localOrigin[2];
      lines.push({
        points: [
          { x: minX, y: minZ },
          { x: maxX, y: minZ },
          { x: maxX, y: maxZ },
          { x: minX, y: maxZ }
        ],
        color: chunk.sourceKind === "junction" ? "#ff70d2" : "#6bc6ff",
        closed: true
      });
    }
  } else if (card.channel === RiverDebugChannel.TerrainCorridor) {
    for (const corridor of data.terrainInteraction.reachCorridors) {
      const reach = data.reaches[corridor.reachIndex];
      if (!reach || !targetMatches(snapshot, "reach", reach.id)) continue;
      const values = corridor.samples.toTypedArray();
      const points: Point2[] = [];
      for (let index = 0; index < corridor.sampleCount; index++) {
        points.push({ x: values[index * corridor.stride], y: values[index * corridor.stride + 1] });
      }
      lines.push({ points, color: "#55d6be" });
    }
    for (const corridor of data.terrainInteraction.junctionCorridors) {
      const junction = data.junctions[corridor.junctionIndex];
      if (!junction || !targetMatches(snapshot, "junction", junction.id)) continue;
      lines.push({
        points: corridor.boundary.map((point) => ({ x: point[0], y: point[2] })),
        color: "#ff70d2",
        closed: true
      });
    }
  } else if (card.channel === RiverDebugChannel.QueryGrid) {
    const grid = data.queryIndex;
    const coordinates = grid.cellCoordinates.toTypedArray();
    for (let index = 0; index < grid.cellCount; index++) {
      const x = coordinates[index * 2] * grid.cellSize;
      const z = coordinates[index * 2 + 1] * grid.cellSize;
      lines.push({
        points: [
          { x, y: z },
          { x: x + grid.cellSize, y: z },
          { x: x + grid.cellSize, y: z + grid.cellSize },
          { x, y: z + grid.cellSize }
        ],
        color: "#ab8cff",
        closed: true
      });
    }
  }
  return lines;
}

function drawLines(canvas: HTMLCanvasElement, lines: readonly DebugLine[]): void {
  const context = canvas.getContext("2d");
  if (!context) return;
  context.fillStyle = "#071217";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const points = lines.flatMap((line) => line.points);
  if (points.length === 0) return;
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxY = Math.max(...points.map((point) => point.y));
  const extent = Math.max(maxX - minX, maxY - minY, 0.001);
  const scale = (canvas.width - 18) / extent;
  const offsetX = (canvas.width - (maxX - minX) * scale) * 0.5;
  const offsetY = (canvas.height - (maxY - minY) * scale) * 0.5;
  context.lineWidth = 1.5;
  for (const line of lines) {
    if (line.points.length < 2) continue;
    context.beginPath();
    for (let index = 0; index < line.points.length; index++) {
      const point = line.points[index];
      const x = offsetX + (point.x - minX) * scale;
      const y = canvas.height - (offsetY + (point.y - minY) * scale);
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    if (line.closed) context.closePath();
    context.strokeStyle = line.color;
    context.stroke();
  }
}

function drawSurfaceSwatch(canvas: HTMLCanvasElement, channel: RiverDebugChannel): void {
  const context = canvas.getContext("2d");
  if (!context) return;
  const gradient = context.createLinearGradient(0, canvas.height, canvas.width, 0);
  const colors: Partial<Record<RiverDebugChannel, readonly [string, string, string]>> = {
    [RiverDebugChannel.FlowCoordinate]: ["#16255c", "#23b7b0", "#e9c46a"],
    [RiverDebugChannel.MacroHeight]: ["#111827", "#8899aa", "#ffffff"],
    [RiverDebugChannel.CrestMask]: ["#03080a", "#48606b", "#ffffff"],
    [RiverDebugChannel.MicroNormal]: ["#5636b8", "#77e0d1", "#f4f0b6"],
    [RiverDebugChannel.ShoreDamping]: ["#061116", "#2b8b8e", "#d8edef"],
    [RiverDebugChannel.Final]: ["#052f3a", "#0f8392", "#d7edef"]
  };
  const palette = colors[channel] ?? ["#071217", "#4c8191", "#d7edef"];
  gradient.addColorStop(0, palette[0]);
  gradient.addColorStop(0.5, palette[1]);
  gradient.addColorStop(1, palette[2]);
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "rgba(255,255,255,.22)";
  for (let y = 18; y < canvas.height; y += 22) {
    context.beginPath();
    for (let x = 0; x <= canvas.width; x += 4) {
      const waveY = y + Math.sin(x * 0.13 + y) * 3;
      if (x === 0) context.moveTo(x, waveY);
      else context.lineTo(x, waveY);
    }
    context.stroke();
  }
}

function drawFlowArrow(
  context: CanvasRenderingContext2D,
  originX: number,
  originY: number,
  flowX: number,
  flowZ: number,
  color: string,
  label: string
): void {
  const length = Math.hypot(flowX, flowZ);
  const scale = length > 1e-6 ? 32 / Math.max(1, length) : 0;
  const endX = originX + flowX * scale;
  const endY = originY - flowZ * scale;
  const angle = Math.atan2(endY - originY, endX - originX);
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = 3;
  context.beginPath();
  context.moveTo(originX, originY);
  context.lineTo(endX, endY);
  context.stroke();
  context.beginPath();
  context.moveTo(endX, endY);
  context.lineTo(endX - Math.cos(angle - 0.55) * 8, endY - Math.sin(angle - 0.55) * 8);
  context.lineTo(endX - Math.cos(angle + 0.55) * 8, endY - Math.sin(angle + 0.55) * 8);
  context.closePath();
  context.fill();
  context.font = "9px ui-monospace, monospace";
  context.fillText(label, 8, originY + 3);
}

function drawQueryFlowPreview(canvas: HTMLCanvasElement, metrics: RiverDebugRuntimeMetrics): void {
  const context = canvas.getContext("2d");
  if (!context) return;
  context.fillStyle = "#071217";
  context.fillRect(0, 0, canvas.width, canvas.height);
  drawFlowArrow(context, 48, 32, metrics.queryBaseFlowX, metrics.queryBaseFlowZ, "#d6b45c", "base");
  drawFlowArrow(context, 48, 64, metrics.queryLocalFlowX, metrics.queryLocalFlowZ, "#ef77c8", "local");
  drawFlowArrow(context, 48, 96, metrics.queryFinalFlowX, metrics.queryFinalFlowZ, "#61e7f0", "final");
  context.fillStyle = "rgba(215,237,239,.7)";
  context.fillText(`blend ${metrics.queryLocalFlowWeight.toFixed(2)}`, 8, 116);
}

function drawCardPreview(canvas: HTMLCanvasElement, snapshot: RiverDebugSnapshot, card: RiverDebugCard): void {
  canvas.width = THUMBNAIL_SIZE;
  canvas.height = THUMBNAIL_SIZE;
  if (card.channel === RiverDebugChannel.QueryFlow) {
    drawQueryFlowPreview(canvas, snapshot.context.metrics);
    return;
  }
  const atlas = snapshot.context.data.terrainInteraction.localMapAtlas;
  if (
    atlas &&
    (card.channel === RiverDebugChannel.LocalFlow ||
      card.channel === RiverDebugChannel.LocalFoam ||
      card.channel === RiverDebugChannel.LocalSignedDistance ||
      card.channel === RiverDebugChannel.AtlasRect)
  ) {
    const context = canvas.getContext("2d");
    if (!context) return;
    const raster = decodeRiverLocalMapThumbnail(atlas, card.channel);
    const source = document.createElement("canvas");
    source.width = raster.width;
    source.height = raster.height;
    source.getContext("2d")?.putImageData(new ImageData(raster.pixels, raster.width, raster.height), 0, 0);
    context.imageSmoothingEnabled = false;
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    return;
  }
  const lines = collectPathLines(snapshot, card);
  if (lines.length > 0) drawLines(canvas, lines);
  else drawSurfaceSwatch(canvas, card.channel);
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MiB`;
}

function metric(label: string, value: string): HTMLDivElement {
  const item = document.createElement("div");
  item.style.cssText = "min-width:0;padding:5px 6px;border-radius:4px;background:rgba(255,255,255,.035)";
  appendText(
    item,
    "span",
    label,
    "display:block;font-size:8px;letter-spacing:.06em;text-transform:uppercase;opacity:.55;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"
  );
  appendText(
    item,
    "strong",
    value,
    "display:block;margin-top:2px;font-size:10px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"
  );
  return item;
}

function buildTargetMetrics(snapshot: RiverDebugSnapshot): readonly [string, string][] {
  const { data } = snapshot.context;
  const target = snapshot.selection.target;
  if (target.kind === "reach") {
    const reach = data.reaches.find((candidate) => candidate.id === target.id);
    return reach
      ? [
          ["target", "Reach"],
          ["length", reach.length.toFixed(1)],
          ["samples", String(reach.artifact.samples.length)],
          ["vertices", String(reach.artifact.surfaceGeometry.positions.length)]
        ]
      : [];
  }
  if (target.kind === "junction") {
    const junction = data.junctions.find((candidate) => candidate.id === target.id);
    return junction
      ? [
          ["target", "Junction"],
          ["radius", junction.mergeRadius.toFixed(1)],
          ["vertices", String(junction.surfaceGeometry.positions.length)],
          ["triangles", String(junction.surfaceGeometry.indices.length / 3)]
        ]
      : [];
  }
  if (target.kind === "chunk") {
    const chunk = data.chunks.find((candidate) => candidate.id === target.id);
    return chunk
      ? [
          ["target", "Chunk"],
          ["source", chunk.sourceKind],
          ["vertices", String(chunk.surfaceGeometry.positions.length)],
          ["triangles", String(chunk.surfaceGeometry.indices.length / 3)]
        ]
      : [];
  }
  return [
    ["target", "Network"],
    ["nodes", String(data.stats.nodeCount)],
    ["reaches", String(data.stats.reachCount)],
    ["chunks", String(data.stats.chunkCount)]
  ];
}

export function mountWaterDebugPanel(host: HTMLElement, session: RiverDebugSession): WaterDebugPanelHandles {
  const root = document.createElement("div");
  root.id = "water-debug-panel";
  root.style.cssText =
    "position:fixed;left:10px;top:56px;width:340px;max-height:calc(100vh - 70px);display:flex;flex-direction:column;z-index:10;overflow:hidden;color:#d7edef;background:rgba(5,18,24,.94);border:1px solid rgba(112,196,207,.2);border-radius:7px;box-shadow:0 8px 28px rgba(0,0,0,.44);backdrop-filter:blur(8px);font:11px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace";
  const header = document.createElement("div");
  header.style.cssText =
    "display:flex;align-items:center;gap:8px;padding:9px 10px;background:#071319;cursor:pointer;user-select:none";
  const heading = document.createElement("div");
  heading.style.cssText = "display:flex;flex:1;min-width:0;flex-direction:column;gap:1px";
  appendText(heading, "strong", "Water PCG Debug", "font-size:12px;letter-spacing:.03em;white-space:nowrap");
  const status = appendText(
    heading,
    "span",
    "",
    "font-size:9px;color:#76d6dc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"
  ) as HTMLSpanElement;
  const exit = button("⊗ Final");
  exit.style.cssText =
    "flex:none;padding:3px 7px;color:#d7edef;background:#17313a;border:1px solid rgba(112,196,207,.24);border-radius:4px;font:10px inherit;cursor:pointer";
  header.append(heading, exit);
  root.appendChild(header);

  const body = document.createElement("div");
  body.style.cssText = "display:flex;min-height:0;flex:1;flex-direction:column;gap:8px;overflow-y:auto;padding:8px";
  root.appendChild(body);
  let collapsed = false;
  header.addEventListener("click", (event) => {
    if (event.target === exit) return;
    collapsed = !collapsed;
    body.style.display = collapsed ? "none" : "flex";
  });
  exit.addEventListener("click", (event) => {
    event.stopPropagation();
    session.selectStage(RiverDebugStage.Final);
  });

  const render = (snapshot: RiverDebugSnapshot): void => {
    root.dataset.stage = snapshot.selection.stage;
    root.dataset.channel = snapshot.selection.channel;
    root.dataset.target = serializeRiverDebugTarget(snapshot.selection.target);
    root.dataset.status = snapshot.status;
    status.textContent = `${snapshot.context.exampleLabel} · ${snapshot.statusMessage}`;
    status.style.color =
      snapshot.status === "error" ? "#ff8a78" : snapshot.status === "compiling" ? "#ffcf70" : "#76d6dc";
    body.innerHTML = "";

    const stages = document.createElement("div");
    stages.setAttribute("aria-label", "River debug stages");
    stages.style.cssText = "display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px";
    for (const stage of RIVER_DEBUG_STAGE_ORDER) {
      const stageButton = button(RIVER_DEBUG_STAGE_LABELS[stage]);
      const active = stage === snapshot.selection.stage;
      stageButton.dataset.stage = stage;
      stageButton.setAttribute("aria-pressed", String(active));
      stageButton.style.cssText = `padding:5px 3px;border-radius:4px;border:1px solid ${active ? "#4fc3ca" : "rgba(255,255,255,.09)"};color:${active ? "#f4ffff" : "#91adb3"};background:${active ? "rgba(79,195,202,.18)" : "rgba(255,255,255,.025)"};font:9px/1.2 inherit;cursor:pointer`;
      stageButton.addEventListener("click", () => session.selectStage(stage));
      stages.appendChild(stageButton);
    }
    body.appendChild(stages);

    const targetRow = document.createElement("div");
    targetRow.style.cssText = "display:grid;grid-template-columns:1fr 90px;gap:6px";
    const target = document.createElement("select");
    target.setAttribute("aria-label", "Debug target");
    target.style.cssText =
      "min-width:0;padding:5px 6px;color:#d7edef;background:#0b1d24;border:1px solid rgba(255,255,255,.1);border-radius:4px;font:10px inherit";
    for (const option of snapshot.targets) {
      const element = document.createElement("option");
      element.value = option.value;
      element.textContent = option.label;
      target.appendChild(element);
    }
    target.value = serializeRiverDebugTarget(snapshot.selection.target);
    target.addEventListener("change", () => session.selectTarget(parseRiverDebugTarget(target.value)));
    const query = document.createElement("input");
    query.type = "range";
    query.min = "0";
    query.max = "1";
    query.step = "0.01";
    query.value = String(snapshot.selection.queryT);
    query.title = `Query T ${snapshot.selection.queryT.toFixed(2)}`;
    query.setAttribute("aria-label", "River query position");
    query.addEventListener("change", () => session.setQueryT(Number(query.value)));
    targetRow.append(target, query);
    body.appendChild(targetRow);

    const targetMetrics = document.createElement("div");
    targetMetrics.style.cssText =
      "display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px;padding-bottom:3px;border-bottom:1px solid rgba(255,255,255,.07)";
    for (const [label, value] of buildTargetMetrics(snapshot)) targetMetrics.appendChild(metric(label, value));
    body.appendChild(targetMetrics);

    const sectionTitle = document.createElement("div");
    sectionTitle.style.cssText =
      "display:flex;align-items:baseline;justify-content:space-between;color:#58c8cf;font-weight:650;font-size:10px;letter-spacing:.04em";
    sectionTitle.textContent = `${RIVER_DEBUG_STAGE_LABELS[snapshot.selection.stage]} · DATA CHANNELS`;
    body.appendChild(sectionTitle);

    for (const card of snapshot.cards) {
      const active = card.channel === snapshot.selection.channel;
      const disabled = Boolean(card.disabledReason);
      const cardElement = document.createElement("button");
      cardElement.type = "button";
      cardElement.disabled = disabled;
      cardElement.dataset.channel = card.channel;
      cardElement.setAttribute("aria-pressed", String(active));
      cardElement.style.cssText = `display:flex;flex-direction:column;gap:4px;width:100%;padding:8px;border-radius:5px;text-align:left;color:#d7edef;background:${active ? "rgba(79,195,202,.12)" : "rgba(255,255,255,.028)"};border:1px solid ${active ? "#4fc3ca" : "rgba(255,255,255,.06)"};font:inherit;cursor:${disabled ? "not-allowed" : "pointer"};opacity:${disabled ? ".48" : "1"}`;
      const top = document.createElement("div");
      top.style.cssText = "display:flex;align-items:baseline;justify-content:space-between;gap:8px;width:100%";
      appendText(top, "strong", card.label, "font-size:11px;font-weight:650");
      appendText(
        top,
        "span",
        card.technicalLabel,
        "max-width:58%;font-size:8px;opacity:.52;white-space:nowrap;overflow:hidden;text-overflow:ellipsis"
      );
      cardElement.appendChild(top);
      appendText(
        cardElement,
        "span",
        card.disabledReason ?? card.description,
        `font-size:9px;color:${card.disabledReason ? "#ffcf70" : "#91adb3"}`
      );
      const preview = document.createElement("canvas");
      preview.style.cssText = `width:${THUMBNAIL_SIZE}px;height:${THUMBNAIL_SIZE}px;align-self:center;border-radius:4px;background:#071217;image-rendering:pixelated`;
      drawCardPreview(preview, snapshot, card);
      cardElement.appendChild(preview);
      if (!disabled) cardElement.addEventListener("click", () => session.selectChannel(card.channel));
      body.appendChild(cardElement);
    }

    const stats = snapshot.context.data.stats;
    const metrics = document.createElement("div");
    metrics.style.cssText =
      "display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:4px;padding-top:3px;border-top:1px solid rgba(255,255,255,.07)";
    metrics.append(
      metric("nodes", String(stats.nodeCount)),
      metric("reaches", String(stats.reachCount)),
      metric("junctions", String(stats.junctionCount)),
      metric("chunks", String(stats.chunkCount)),
      metric("samples", String(stats.sampleCount)),
      metric("vertices", String(stats.vertexCount)),
      metric("query cells", String(stats.queryCellCount)),
      metric("atlas pixels", String(stats.mapPixelCount)),
      metric("resource", formatBytes(snapshot.context.metrics.resourceByteLength)),
      metric("draw calls", String(snapshot.context.metrics.drawCalls)),
      metric("buffer", formatBytes(snapshot.context.metrics.bufferMemory)),
      metric("texture", formatBytes(snapshot.context.metrics.textureMemory)),
      metric("total", formatBytes(snapshot.context.metrics.totalMemory)),
      metric("submit yields", String(snapshot.context.metrics.submissionYieldCount)),
      metric("max slice", `${snapshot.context.metrics.submissionMaxSliceMs.toFixed(2)} ms`),
      metric("worker decode", `${snapshot.context.metrics.workerDeserializeMs.toFixed(2)} ms`)
    );
    body.appendChild(metrics);

    const diagnostics = snapshot.context.data.diagnostics;
    const details = document.createElement("details");
    details.style.cssText = "padding:6px;border-radius:4px;background:rgba(255,255,255,.025)";
    const summary = document.createElement("summary");
    summary.textContent = `Diagnostics · ${diagnostics.length}`;
    summary.style.cssText = "cursor:pointer;color:#ffcf70;font-size:10px";
    details.appendChild(summary);
    const list = document.createElement("div");
    list.style.cssText = "display:flex;flex-direction:column;gap:4px;margin-top:6px";
    if (diagnostics.length === 0) appendText(list, "span", "No compiler diagnostics", "font-size:9px;color:#76d6dc");
    for (const diagnostic of diagnostics.slice(0, 12)) {
      appendText(
        list,
        "span",
        `${diagnostic.severity} · ${diagnostic.code} · ${diagnostic.message}`,
        "font-size:9px;color:#b6cbd0"
      );
    }
    details.appendChild(list);
    body.appendChild(details);
  };

  const unsubscribe = session.subscribe(render);
  host.appendChild(root);
  return {
    root,
    destroy() {
      unsubscribe();
      root.remove();
    }
  };
}
