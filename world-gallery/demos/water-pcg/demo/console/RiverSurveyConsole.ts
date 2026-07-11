import type { WaterPreviewMode } from "../examples/constants";

export enum RiverSurveyStatus {
  Compiling = "compiling",
  Live = "live",
  Warning = "warning"
}

export interface RiverSurveyCompiledSnapshot {
  readonly exampleLabel: string;
  readonly networkId: string;
  readonly nodeCount: number;
  readonly reachCount: number;
  readonly chunkCount: number;
  readonly queryCellCount: number;
  readonly localMapRegionCount: number;
  readonly resourceByteLength: number;
  readonly workerDeserializeMs: number;
}

export interface RiverSurveyRuntimeSnapshot {
  readonly drawCallCount: number;
  readonly bufferMemoryBytes: number;
  readonly submissionMaxSliceMs: number;
}

enum RiverSurveyElementId {
  Root = "survey-console",
  Toggle = "survey-console-toggle",
  Controls = "survey-controls",
  Status = "survey-status",
  Example = "survey-example",
  Network = "survey-network",
  Nodes = "survey-nodes",
  Reaches = "survey-reaches",
  Chunks = "survey-chunks",
  QueryCells = "survey-query-cells",
  LocalMaps = "survey-local-maps",
  Resource = "survey-resource",
  Worker = "survey-worker",
  DrawCalls = "survey-draw-calls",
  BufferMemory = "survey-buffer-memory",
  Submission = "survey-submission"
}

function requireElement<T extends HTMLElement>(id: RiverSurveyElementId, type: new () => T): T {
  const element = document.getElementById(id);
  if (!(element instanceof type)) throw new Error(`River survey console element #${id} is missing.`);
  return element;
}

function formatBytes(byteLength: number): string {
  return byteLength >= 1024 * 1024
    ? `${(byteLength / (1024 * 1024)).toFixed(2)} MiB`
    : `${(byteLength / 1024).toFixed(1)} KiB`;
}

/** Demo-only DOM view. It never owns or mutates compiled river data. */
export class RiverSurveyConsole {
  readonly controlsRoot = requireElement(RiverSurveyElementId.Controls, HTMLDivElement);

  private readonly _root = requireElement(RiverSurveyElementId.Root, HTMLElement);
  private readonly _toggle = requireElement(RiverSurveyElementId.Toggle, HTMLButtonElement);
  private readonly _status = requireElement(RiverSurveyElementId.Status, HTMLSpanElement);
  private readonly _example = requireElement(RiverSurveyElementId.Example, HTMLSpanElement);
  private readonly _network = requireElement(RiverSurveyElementId.Network, HTMLSpanElement);
  private readonly _nodes = requireElement(RiverSurveyElementId.Nodes, HTMLSpanElement);
  private readonly _reaches = requireElement(RiverSurveyElementId.Reaches, HTMLSpanElement);
  private readonly _chunks = requireElement(RiverSurveyElementId.Chunks, HTMLSpanElement);
  private readonly _queryCells = requireElement(RiverSurveyElementId.QueryCells, HTMLSpanElement);
  private readonly _localMaps = requireElement(RiverSurveyElementId.LocalMaps, HTMLSpanElement);
  private readonly _resource = requireElement(RiverSurveyElementId.Resource, HTMLSpanElement);
  private readonly _worker = requireElement(RiverSurveyElementId.Worker, HTMLSpanElement);
  private readonly _drawCalls = requireElement(RiverSurveyElementId.DrawCalls, HTMLSpanElement);
  private readonly _bufferMemory = requireElement(RiverSurveyElementId.BufferMemory, HTMLSpanElement);
  private readonly _submission = requireElement(RiverSurveyElementId.Submission, HTMLSpanElement);

  constructor() {
    this._toggle.addEventListener("click", () => this._setCollapsed(this._root.dataset.collapsed !== "true"));
  }

  mountControls(element: HTMLElement): void {
    this.controlsRoot.replaceChildren(element);
  }

  setMode(mode: WaterPreviewMode): void {
    this._root.dataset.mode = mode;
  }

  setStatus(status: RiverSurveyStatus): void {
    this._root.dataset.status = status;
    this._status.textContent =
      status === RiverSurveyStatus.Live
        ? "RUNTIME LIVE"
        : status === RiverSurveyStatus.Compiling
          ? "COMPILING"
          : "CHECK WARNINGS";
  }

  updateCompiled(snapshot: RiverSurveyCompiledSnapshot): void {
    this._example.textContent = snapshot.exampleLabel;
    this._network.textContent = snapshot.networkId;
    this._nodes.textContent = String(snapshot.nodeCount);
    this._reaches.textContent = String(snapshot.reachCount);
    this._chunks.textContent = String(snapshot.chunkCount);
    this._queryCells.textContent = String(snapshot.queryCellCount);
    this._localMaps.textContent = String(snapshot.localMapRegionCount);
    this._resource.textContent = formatBytes(snapshot.resourceByteLength);
    this._worker.textContent = `${snapshot.workerDeserializeMs.toFixed(2)} ms`;
  }

  updateRuntime(snapshot: RiverSurveyRuntimeSnapshot): void {
    this._drawCalls.textContent = String(snapshot.drawCallCount);
    this._bufferMemory.textContent = formatBytes(snapshot.bufferMemoryBytes);
    this._submission.textContent = `${snapshot.submissionMaxSliceMs.toFixed(2)} ms`;
  }

  private _setCollapsed(collapsed: boolean): void {
    this._root.dataset.collapsed = String(collapsed);
    this._toggle.setAttribute("aria-expanded", String(!collapsed));
    this._toggle.textContent = collapsed ? "OPEN" : "HIDE";
  }
}
