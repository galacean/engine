import {
  compileSeedWorldGeologyHeightfield,
  compileSeedWorldGeologyLayout,
  sampleSeedWorldGeologyHeight,
  type SeedWorldGeologyHeightfield,
  type SeedWorldGeologyHill,
  type SeedWorldGeologyLayout,
  type SeedWorldGeologyPoint
} from "@galacean/engine-world-planning/runtime/SeedWorldGeologyLayout";
import {
  decodeSeedWorldCompositeSeed,
  deriveSeedWorldGeologyParameters,
  encodeSeedWorldCompositeSeedUrl,
  SEED_WORLD_GEOLOGY_PARAMETER_DEFINITIONS,
  type SeedWorldCompositeSeed,
  type SeedWorldGeologyHillEdit,
  type SeedWorldGeologyParameterKey,
  type SeedWorldGeologyParameters
} from "@galacean/engine-terrain/world/SeedWorldGeologySeedCodec";
import type {
  SeedWorldGeologyDebugWorkerRequest,
  SeedWorldGeologyDebugWorkerResponse
} from "./SeedWorldGeologyDebugWorker.ts";

/** Mount options for the debug-only geology acceptance surface. */
export interface SeedWorldGeologyDebugPanelOptions {
  /** Empty host that will own the complete acceptance UI. */
  readonly host: HTMLElement;
  /** URL whose composite Seed components initialize and follow the controls. */
  readonly url: URL;
  /** Whether control changes replace the current browser URL. */
  readonly synchronizeUrl?: boolean;
  /** Receives each deterministic layout after the panel has rendered it. */
  readonly onLayoutChange?: (layout: SeedWorldGeologyLayout, seed: SeedWorldCompositeSeed) => void;
}

/** Debug-only interactive acceptance UI shared by the standalone lab and Seed Demo vector tab. */
export class SeedWorldGeologyDebugPanel {
  private readonly _host: HTMLElement;
  private readonly _options: SeedWorldGeologyDebugPanelOptions;
  private readonly _abortController = new AbortController();
  private readonly _resizeObserver: ResizeObserver;
  private readonly _worker = new Worker(new URL("./SeedWorldGeologyDebugWorker.ts", import.meta.url), {
    type: "module"
  });
  private _seed: SeedWorldCompositeSeed;
  private _layout: SeedWorldGeologyLayout;
  private _field: SeedWorldGeologyHeightfield;
  private _selectedHillOrdinal = 0;
  private _activeView: "relief" | "topdown" = "relief";
  private _compileRequestId = 0;
  private _compileQueued = false;
  private _pendingCompile: Promise<void> | undefined;
  private _pendingCompileMode: "interactive" | "complete" | undefined;
  private _resolvePendingCompile: (() => void) | undefined;
  private _completeCompileTimer: ReturnType<typeof setTimeout> | undefined;
  private _lastCompileMilliseconds = 0;

  /**
   * Creates one self-contained debug surface; production startup must load this class dynamically.
   * @param options Host, URL, synchronization policy, and optional layout callback.
   */
  constructor(options: SeedWorldGeologyDebugPanelOptions) {
    this._options = options;
    this._host = options.host;
    this._seed = decodeSeedWorldCompositeSeed(options.url.searchParams, 240_827);
    this._layout = compileSeedWorldGeologyLayout({
      geologySeed: this._seed.geology,
      parameters: this._seed.geologyParameters,
      hillEdits: this._seed.geologyHillEdits
    });
    this._field = compileSeedWorldGeologyHeightfield(this._layout, 33);
    this._host.classList.add("geology-debug-host");
    this._host.innerHTML = createPanelMarkup();
    this._worker.addEventListener("message", (event: MessageEvent<SeedWorldGeologyDebugWorkerResponse>) =>
      this.receiveWorkerResult(event.data)
    );
    this.bindControls();
    this.writeGlobalControls();
    this.writeHillControls();
    this._resizeObserver = new ResizeObserver(() => this.draw());
    this._resizeObserver.observe(this.requiredElement(".geology-map-stage"));
    this.render();
  }

  /** Current immutable layout visible in both vector tabs. */
  get layout(): SeedWorldGeologyLayout {
    return this._layout;
  }

  /** Current composite Seed including explicit parameter and per-hill edits. */
  get seed(): SeedWorldCompositeSeed {
    return this._seed;
  }

  /**
   * Replaces the GEOLOGY code and restores its deterministic parameter mapping.
   * @param value Unsigned geology code selected by the global debug toolbar.
   */
  setGeologySeed(value: number): void {
    const geology = clampUint32(value);
    this._seed = Object.freeze({
      geology,
      geologyParameters: deriveSeedWorldGeologyParameters(geology),
      geologyHillEdits: Object.freeze([]),
      hydrology: this._seed.hydrology
    });
    this._selectedHillOrdinal = 0;
    this.writeGlobalControls();
    this.scheduleCompile(0);
  }

  /**
   * Replaces only the HYDROLOGY code without rebuilding the geology layout.
   * @param value Unsigned hydrology code selected by the global debug toolbar.
   */
  setHydrologySeed(value: number): void {
    this._seed = Object.freeze({ ...this._seed, hydrology: clampUint32(value) });
    this.writeGlobalControls();
    this.render();
  }

  /**
   * Waits for the newest continuously compiled control state before 3D reads the shared layout.
   * @returns Promise resolved after the newest Worker result has been published.
   */
  async flushPendingCompile(): Promise<void> {
    let hasCurrentComplete = false;
    while (this._pendingCompile || this._compileQueued) {
      this.cancelScheduledCompleteCompile();
      if (!this._pendingCompile) this.requestWorkerCompile();
      const pendingMode = this._pendingCompileMode;
      await this._pendingCompile;
      hasCurrentComplete = pendingMode === "complete" && !this._compileQueued;
    }
    if (hasCurrentComplete) return;
    this.cancelScheduledCompleteCompile();
    this.requestWorkerCompile("complete");
    await this._pendingCompile;
  }

  /** Releases observers, scheduled work, listeners, and owned DOM. */
  dispose(): void {
    this.cancelScheduledCompleteCompile();
    this._resolvePendingCompile?.();
    this._worker.terminate();
    this._resizeObserver.disconnect();
    this._abortController.abort();
    this._host.replaceChildren();
    this._host.classList.remove("geology-debug-host");
  }

  private bindControls(): void {
    const signal = this._abortController.signal;
    this.requiredElement<HTMLInputElement>("[data-geology-seed]").addEventListener(
      "change",
      (event) => {
        this.setGeologySeed(Number((event.currentTarget as HTMLInputElement).value));
      },
      { signal }
    );
    for (const button of this._host.querySelectorAll<HTMLButtonElement>("[data-seed-step]")) {
      button.addEventListener(
        "click",
        () => {
          const step = Number(button.dataset.seedStep);
          this.setGeologySeed((this._seed.geology + step) >>> 0);
        },
        { signal }
      );
    }
    this.requiredElement<HTMLButtonElement>("[data-random-seed]").addEventListener(
      "click",
      () => {
        const values = new Uint32Array(1);
        crypto.getRandomValues(values);
        this.setGeologySeed(values[0]!);
      },
      { signal }
    );
    this.requiredElement<HTMLInputElement>("[data-hydrology-seed]").addEventListener(
      "change",
      (event) => {
        this.setHydrologySeed(Number((event.currentTarget as HTMLInputElement).value));
      },
      { signal }
    );
    for (const input of this._host.querySelectorAll<HTMLInputElement>("[data-geology-parameter]")) {
      input.addEventListener(
        "input",
        () => {
          const key = input.dataset.geologyParameter as SeedWorldGeologyParameterKey;
          this._seed = Object.freeze({
            ...this._seed,
            geologyParameters: Object.freeze({ ...this._seed.geologyParameters, [key]: Number(input.value) })
          });
          this.writeParameterValue(key);
          this.scheduleCompile();
        },
        { signal }
      );
    }
    for (const input of this._host.querySelectorAll<HTMLInputElement>("[data-hill-parameter]")) {
      input.addEventListener(
        "input",
        () => {
          const key = input.dataset.hillParameter as Exclude<keyof SeedWorldGeologyHillEdit, "hillId">;
          const edits = new Map(this._seed.geologyHillEdits.map((edit) => [edit.hillId, { ...edit }] as const));
          edits.set(this._selectedHillOrdinal, {
            ...(edits.get(this._selectedHillOrdinal) ?? { hillId: this._selectedHillOrdinal }),
            [key]: Number(input.value)
          });
          this._seed = Object.freeze({
            ...this._seed,
            geologyHillEdits: Object.freeze([...edits.values()].sort((left, right) => left.hillId - right.hillId))
          });
          const output = this.requiredElement<HTMLOutputElement>(`[data-hill-value="${key}"]`);
          output.value = `${formatNumber(Number(input.value))}${output.dataset.suffix ?? ""}`;
          this.scheduleCompile();
        },
        { signal }
      );
    }
    for (const button of this._host.querySelectorAll<HTMLButtonElement>("[data-control-tab]")) {
      button.addEventListener("click", () => this.activateControlTab(button.dataset.controlTab!), { signal });
    }
    for (const button of this._host.querySelectorAll<HTMLButtonElement>("[data-view-tab]")) {
      button.addEventListener(
        "click",
        () => {
          this._activeView = button.dataset.viewTab as "relief" | "topdown";
          for (const candidate of this._host.querySelectorAll<HTMLElement>("[data-view-tab]")) {
            const active = candidate === button;
            candidate.dataset.active = String(active);
            candidate.setAttribute("aria-selected", String(active));
          }
          this.draw();
        },
        { signal }
      );
    }
    for (const canvas of this._host.querySelectorAll<HTMLCanvasElement>("canvas")) {
      canvas.addEventListener(
        "pointerdown",
        (event) => {
          const rect = canvas.getBoundingClientRect();
          const canvasPoint = Object.freeze({
            x: ((event.clientX - rect.left) / rect.width) * canvas.width,
            y: ((event.clientY - rect.top) / rect.height) * canvas.height
          });
          const selected =
            this._activeView === "topdown"
              ? selectTopdownHill(this._layout.hills, canvasPoint, canvas)
              : selectReliefHill(this._layout, canvasPoint, canvas);
          if (!selected) return;
          this._selectedHillOrdinal = selected.ordinal;
          this.writeHillControls();
          this.activateControlTab("hill");
          this.draw();
        },
        { signal }
      );
    }
  }

  private scheduleCompile(_delayMilliseconds = 0): void {
    this.cancelScheduledCompleteCompile();
    if (this._pendingCompile) {
      this._compileQueued = true;
      return;
    }
    this.requestWorkerCompile("interactive");
  }

  private requestWorkerCompile(mode: "interactive" | "complete" = "interactive"): void {
    this._compileQueued = false;
    const requestId = ++this._compileRequestId;
    const request = {
      requestId,
      mode,
      geologySeed: this._seed.geology,
      parameters: this._seed.geologyParameters,
      hillEdits: this._seed.geologyHillEdits
    } satisfies SeedWorldGeologyDebugWorkerRequest;
    this._pendingCompile = new Promise((resolve) => {
      this._resolvePendingCompile = resolve;
    });
    this._pendingCompileMode = mode;
    this._worker.postMessage(request);
  }

  private receiveWorkerResult(result: SeedWorldGeologyDebugWorkerResponse): void {
    if (result.requestId !== this._compileRequestId) return;
    const hasNewerControlState = this._compileQueued;
    if (result.mode === "interactive") {
      this._layout = Object.freeze({
        ...result.layout,
        roads: this._layout.roads,
        roadNodes: this._layout.roadNodes,
        suitableRegions: this._layout.suitableRegions
      });
      this._field = result.field;
      this._lastCompileMilliseconds = result.compileMilliseconds;
      this._selectedHillOrdinal = Math.min(this._selectedHillOrdinal, this._layout.hills.length - 1);
      this.renderSummary();
      this.renderDiagnostics();
      this.draw();
    } else if (!hasNewerControlState) {
      this._layout = result.layout;
      this._field = result.field;
      this._lastCompileMilliseconds = result.compileMilliseconds;
      this._selectedHillOrdinal = Math.min(this._selectedHillOrdinal, this._layout.hills.length - 1);
      this.writeHillControls();
      this.render();
    }
    this._resolvePendingCompile?.();
    this._resolvePendingCompile = undefined;
    this._pendingCompile = undefined;
    this._pendingCompileMode = undefined;
    if (hasNewerControlState) this.requestWorkerCompile("interactive");
    else if (result.mode === "interactive") this.scheduleCompleteCompile();
  }

  private scheduleCompleteCompile(): void {
    this.cancelScheduledCompleteCompile();
    this._completeCompileTimer = setTimeout(() => {
      this._completeCompileTimer = undefined;
      if (!this._pendingCompile && !this._compileQueued) this.requestWorkerCompile("complete");
    }, 120);
  }

  private cancelScheduledCompleteCompile(): void {
    if (this._completeCompileTimer === undefined) return;
    clearTimeout(this._completeCompileTimer);
    this._completeCompileTimer = undefined;
  }

  private render(): void {
    this.synchronizeUrl();
    this.renderSummary();
    this.renderDiagnostics();
    this.draw();
    this._options.onLayoutChange?.(this._layout, this._seed);
  }

  private synchronizeUrl(): void {
    const encoded = encodeSeedWorldCompositeSeedUrl(this._options.url, this._seed);
    const parameterCode = encoded.searchParams.get("gp");
    this.requiredElement<HTMLElement>("[data-seed-code]").textContent = parameterCode
      ? `g=${encoded.searchParams.get("g")} · gp=${parameterCode} · h=${encoded.searchParams.get("h")}`
      : `g=${encoded.searchParams.get("g")} · SEED 映射 · h=${encoded.searchParams.get("h")}`;
    this.requiredElement<HTMLElement>("[data-seed-resolved]").textContent =
      `GEOLOGY ${this._seed.geology} · 峡谷向 ${Math.round(this._seed.geologyParameters.canyonAzimuth)}° / 曲折 ${Math.round(this._seed.geologyParameters.canyonMeander)}% · 朝向关联 ${Math.round(this._seed.geologyParameters.orientationCoherence)}%`;
    if (this._options.synchronizeUrl !== false && typeof history !== "undefined")
      history.replaceState(null, "", encoded);
  }

  private renderSummary(): void {
    const trunks = this._layout.canyons.filter((canyon) => canyon.kind === "trunk").length;
    const tributaries = this._layout.canyons.length - trunks;
    const leftBanks = this._layout.hills.filter((hill) => hill.canyonBank?.side === "left").length;
    const rightBanks = this._layout.hills.filter((hill) => hill.canyonBank?.side === "right").length;
    const branches = this._layout.roads.filter((road) => road.kind === "branch").length;
    const maximumRoadSlope = Math.max(0, ...this._layout.roads.map((road) => road.maximumSlopeDegrees));
    this.requiredElement<HTMLElement>("[data-layout-summary]").textContent =
      `${this._layout.hills.length} 凸包 · 岸丘 左${leftBanks}/右${rightBanks} · ${trunks}主干 + ${tributaries}支谷 · 道路 1主 + ${branches}支 · 路坡 ${maximumRoadSlope.toFixed(1)}° · 场 ${this._lastCompileMilliseconds.toFixed(1)}ms`;
    this.requiredElement<HTMLElement>("[data-layout-timing]").textContent =
      `绝对高程 ${Math.round(this._field.minimumHeightMetres)}–${Math.round(this._field.maximumHeightMetres)}m · 解析最大坡度 ${this._field.maximumSlopeDegrees.toFixed(1)}°`;
  }

  private renderDiagnostics(): void {
    const trunkBanksComplete = this._layout.canyons
      .filter((canyon) => canyon.kind === "trunk")
      .every((canyon) => canyon.leftBankHillIds.length > 0 && canyon.rightBankHillIds.length > 0);
    const roadSlopePass = this._layout.roads.every((road) => road.maximumSlopeDegrees <= 24.01);
    const graphPass = this._layout.adjacency.length >= this._layout.hills.length - 1;
    const gates = [
      ["邻接图连通", graphPass, `${this._layout.hills.length} nodes / ${this._layout.adjacency.length} edges`],
      ["峡谷左右岸", trunkBanksComplete, trunkBanksComplete ? "complete" : "missing bank"],
      [
        "支谷真实切割",
        this._layout.canyons.some((canyon) => canyon.kind === "tributary"),
        `${this._layout.canyons.filter((canyon) => canyon.kind === "tributary").length}`
      ],
      ["道路贯穿", this._layout.roads[0]?.reachesBoundary === true, `${this._layout.roads.length} routes`],
      [
        "道路坡度",
        roadSlopePass,
        `${Math.max(0, ...this._layout.roads.map((road) => road.maximumSlopeDegrees)).toFixed(1)}° / 24°`
      ],
      ["无岩石职责", this._layout.hills.every((hill) => !("rockAsset" in hill)), "terrain only"]
    ] as const;
    this.requiredElement<HTMLElement>("[data-gate-list]").innerHTML = gates
      .map(
        ([label, pass, state]) =>
          `<div class="geology-gate" data-pass="${pass}"><i></i><span>${label}</span><code>${state}</code></div>`
      )
      .join("");
  }

  private writeGlobalControls(): void {
    this.requiredElement<HTMLInputElement>("[data-geology-seed]").value = String(this._seed.geology);
    this.requiredElement<HTMLInputElement>("[data-hydrology-seed]").value = String(this._seed.hydrology);
    for (const definition of SEED_WORLD_GEOLOGY_PARAMETER_DEFINITIONS) {
      const input = this.requiredElement<HTMLInputElement>(`[data-geology-parameter="${definition.key}"]`);
      input.value = String(this._seed.geologyParameters[definition.key]);
      this.writeParameterValue(definition.key);
    }
  }

  private writeParameterValue(key: SeedWorldGeologyParameterKey): void {
    const output = this.requiredElement<HTMLOutputElement>(`[data-geology-value="${key}"]`);
    const definition = SEED_WORLD_GEOLOGY_PARAMETER_DEFINITIONS.find((candidate) => candidate.key === key)!;
    const suffix = output.dataset.suffix ?? "";
    const resolved = `${formatNumber(this._seed.geologyParameters[key])}${suffix}`;
    output.value =
      definition.seedVariation === undefined && definition.seedAngleVariation === undefined
        ? resolved
        : `${formatNumber(definition.defaultValue)}${suffix} → ${resolved}`;
  }

  private writeHillControls(): void {
    const hill = this._layout.hills[this._selectedHillOrdinal];
    if (!hill) return;
    const edit = this._seed.geologyHillEdits.find((candidate) => candidate.hillId === this._selectedHillOrdinal);
    const values = {
      baseLift: hill.pedestalLiftMetres,
      influenceMajor: hill.influenceRadiusMetres.major,
      peakRelief: hill.peakReliefMetres,
      bodyMajor: hill.bodyRadiusMetres.major,
      angleDegrees: wrapHalfTurnDegrees(radiansToDegrees(hill.rotationRadians))
    };
    for (const [key, value] of Object.entries(values)) {
      this.requiredElement<HTMLInputElement>(`[data-hill-parameter="${key}"]`).value = String(value);
      const output = this.requiredElement<HTMLOutputElement>(`[data-hill-value="${key}"]`);
      const requested = edit?.[key as Exclude<keyof SeedWorldGeologyHillEdit, "hillId">];
      const suffix = output.dataset.suffix ?? "";
      output.value =
        requested !== undefined && !hillEditMatchesResolvedValue(key, requested, value)
          ? `${formatNumber(requested)} → ${formatNumber(value)}${suffix}`
          : `${formatNumber(value)}${suffix}`;
    }
    this.requiredElement<HTMLElement>("[data-hill-constraint]").textContent = describeHillConstraints(edit, values);
    const bank = hill.canyonBank
      ? `${hill.canyonBank.canyonId} ${hill.canyonBank.side === "left" ? "左岸" : "右岸"}`
      : "最近低地山肩";
    this.requiredElement<HTMLElement>("[data-selected-hill]").textContent =
      `${hill.id} · ${bank} · 岩石目标山肩 ${radiansToDegrees(hill.usableShoulder.preferredExteriorBearingRadians).toFixed(0)}°`;
    this.requiredElement<HTMLElement>("[data-layout-selection]").textContent =
      `${hill.id} · ${bank} · 岩石目标山肩 ${radiansToDegrees(hill.usableShoulder.preferredExteriorBearingRadians).toFixed(0)}°`;
  }

  private activateControlTab(name: string): void {
    for (const tab of this._host.querySelectorAll<HTMLElement>("[data-control-tab]")) {
      const active = tab.dataset.controlTab === name;
      tab.dataset.active = String(active);
      tab.setAttribute("aria-selected", String(active));
    }
    for (const panel of this._host.querySelectorAll<HTMLElement>("[data-control-panel]")) {
      panel.hidden = panel.dataset.controlPanel !== name;
    }
  }

  private draw(): void {
    const canvas = this.requiredElement<HTMLCanvasElement>(
      this._activeView === "relief" ? "[data-relief-canvas]" : "[data-topdown-canvas]"
    );
    for (const candidate of this._host.querySelectorAll<HTMLCanvasElement>("canvas")) {
      candidate.hidden = candidate !== canvas;
    }
    resizeCanvas(canvas);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Seed World geology debug panel requires Canvas 2D");
    context.clearRect(0, 0, canvas.width, canvas.height);
    if (this._activeView === "relief")
      drawRelief(context, canvas, this._layout, this._field, this._selectedHillOrdinal);
    else drawTopdown(context, canvas, this._layout, this._field, this._selectedHillOrdinal);
  }

  private requiredElement<ElementType extends Element = HTMLElement>(selector: string): ElementType {
    const element = this._host.querySelector<ElementType>(selector);
    if (!element) throw new Error(`Seed World geology debug UI is missing ${selector}`);
    return element;
  }
}

/**
 * Mounts the debug-only geology acceptance surface into an existing host.
 * @param options Host, URL, synchronization policy, and optional layout callback.
 * @returns Disposable panel instance.
 */
export function mountSeedWorldGeologyDebugPanel(
  options: SeedWorldGeologyDebugPanelOptions
): SeedWorldGeologyDebugPanel {
  return new SeedWorldGeologyDebugPanel(options);
}

function createPanelMarkup(): string {
  const parameter = (key: SeedWorldGeologyParameterKey, label: string, suffix = "") => {
    const definition = SEED_WORLD_GEOLOGY_PARAMETER_DEFINITIONS.find((candidate) => candidate.key === key)!;
    return `<label class="geology-control"><span>${label}<output data-geology-value="${key}" data-suffix="${suffix}"></output></span><input data-geology-parameter="${key}" type="range" min="${definition.minimum}" max="${definition.maximum}" step="${definition.step}"></label>`;
  };
  return `<section class="geology-debug-panel">
    <header class="geology-debug-header"><h2>大世界地形布局验收器</h2></header>
    <div class="geology-debug-grid">
      <aside class="geology-controls">
        <h3>调节参数</h3>
        <nav class="geology-tabs" role="tablist" aria-label="参数分组"><button role="tab" aria-selected="true" data-control-tab="world" data-active="true">世界</button><button role="tab" aria-selected="false" data-control-tab="structure">结构</button><button role="tab" aria-selected="false" data-control-tab="hill">单丘</button><button role="tab" aria-selected="false" data-control-tab="diagnostics">诊断</button></nav>
        <section data-control-panel="world">
          <label class="geology-seed"><span>GEOLOGY Seed</span><input data-geology-seed type="number" min="0" max="4294967295" step="1"></label>
          <div class="geology-seed-actions"><button data-seed-step="-1">−</button><button data-seed-step="1">+</button><button data-random-seed>随机</button></div>
          <label class="geology-seed geology-hydrology"><span>HYDROLOGY · 仅降雨与水量</span><input data-hydrology-seed type="number" min="0" max="4294967295" step="1"></label>
          <p class="geology-seed-resolved" data-seed-resolved></p>
          ${parameter("hillCount", "凸包数量")}${parameter("clusterStrength", "聚簇强度", "%")}${parameter("scaleContrast", "大小反差", "%")}${parameter("heightContrast", "高度反差", "%")}${parameter("heightScale", "整体地势高度", "%")}${parameter("edgeOccupancy", "边缘山地覆盖", "%")}${parameter("coastTransition", "海岸过渡", "m")}
        </section>
        <section data-control-panel="structure" hidden>
          ${parameter("beltCount", "隆起带数量")}${parameter("beltAzimuth", "隆起带主方向", "°")}${parameter("beltLift", "隆起带抬升", "m")}${parameter("canyonCount", "峡谷主干")}${parameter("canyonAzimuth", "峡谷系统方向", "°")}${parameter("canyonMeander", "峡谷曲折层次", "%")}${parameter("canyonWidth", "峡谷主干宽度", "m")}${parameter("tributaryDensity", "支谷生成倾向", "%")}${parameter("orientationCoherence", "凸包朝向关联", "%")}
          <p class="geology-note">道路无密度参数，依据最终地势自动形成贯穿主路和跨区分支。</p>
        </section>
        <section data-control-panel="hill" hidden>
          <p class="geology-selected" data-selected-hill></p>
          ${hillControl("baseLift", "Pedestal 抬升", 0, 220, 5, "m")}${hillControl("influenceMajor", "整体影响范围", 300, 1800, 20, "m")}${hillControl("peakRelief", "Relief 峰高", 30, 280, 5, "m")}${hillControl("bodyMajor", "峰体尺度", 100, 900, 10, "m")}${hillControl("angleDegrees", "山丘长轴朝向", 0, 175, 5, "°")}
          <p class="geology-hill-constraint" data-hill-constraint></p>
        </section>
        <section data-control-panel="diagnostics" hidden><div class="geology-gates" data-gate-list></div></section>
      </aside>
      <main class="geology-map-panel">
        <div class="geology-map-toolbar"><nav class="geology-tabs" role="tablist" aria-label="预览视图"><button role="tab" aria-selected="true" data-view-tab="relief" data-active="true">45° 地势</button><button role="tab" aria-selected="false" data-view-tab="topdown">俯视布局</button></nav><p data-layout-summary></p></div>
        <p class="geology-field-formula">地形：海岸基底 + 受坡度约束的隆起/丘体 − 曲线峡谷 · 最终高程不做全图投影 · 道路：低地 + 低坡 + 避峰综合寻路</p>
        <div class="geology-map-stage"><canvas data-relief-canvas></canvas><canvas data-topdown-canvas hidden></canvas></div>
        <footer><div class="geology-legend"><span><i class="hill"></i>凸包</span><span><i class="belt"></i>隆起带；粉色箭头 = 带向</span><span><i class="canyon"></i>主干 / 支谷</span><span><i class="road"></i>道路主线 / 跨区支路</span><span class="geology-height-key"><i class="sea"></i>≤0m 海面 <i class="plain"></i>0–90m 平原 <i class="hillland"></i>90–270m 丘陵 <i class="highland"></i>≥270m 高地</span></div><div><code data-layout-selection></code><br><code data-layout-timing></code></div></footer>
      </main>
    </div>
    <div class="geology-seed-code"><span>COMPOSITE SEED</span><code data-seed-code></code></div>
  </section>`;
}

function hillControl(
  key: string,
  label: string,
  minimum: number,
  maximum: number,
  step: number,
  suffix: string
): string {
  return `<label class="geology-control"><span>${label}<output data-hill-value="${key}" data-suffix="${suffix}"></output></span><input data-hill-parameter="${key}" type="range" min="${minimum}" max="${maximum}" step="${step}"></label>`;
}

function hillEditMatchesResolvedValue(key: string, requested: number, resolved: number): boolean {
  if (key === "angleDegrees") return Math.abs(wrapHalfTurnDegrees(requested) - resolved) < 0.1;
  return Math.abs(requested - resolved) < 0.5;
}

function describeHillConstraints(
  edit: SeedWorldGeologyHillEdit | undefined,
  resolved: Readonly<Record<Exclude<keyof SeedWorldGeologyHillEdit, "hillId">, number>>
): string {
  if (!edit) return "拖动后的请求值会通过坡度、峡谷与海岸安全约束；命中时这里显示请求值 → 实际值。";
  const reasons: string[] = [];
  if (edit.peakRelief !== undefined && edit.peakRelief > resolved.peakRelief + 0.5)
    reasons.push("峰高受 24° 最大坡度限制");
  if (edit.baseLift !== undefined && edit.baseLift > resolved.baseLift + 0.5)
    reasons.push("Pedestal 受 9° 最大坡度限制");
  if (edit.bodyMajor !== undefined && edit.bodyMajor < resolved.bodyMajor - 0.5)
    reasons.push("峰体为容纳 24° 坡面自动加宽");
  if (edit.bodyMajor !== undefined && edit.bodyMajor > resolved.bodyMajor + 0.5)
    reasons.push("峰体受峡谷或海岸安全域限制");
  if (edit.influenceMajor !== undefined && edit.influenceMajor < resolved.influenceMajor - 0.5)
    reasons.push("影响范围不能小于峰体");
  if (edit.influenceMajor !== undefined && edit.influenceMajor > resolved.influenceMajor + 0.5)
    reasons.push("影响范围受海岸安全域限制");
  return reasons.length > 0 ? `约束后回写：${reasons.join("；")}。` : "当前请求值未触发自动约束。";
}

function drawTopdown(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  layout: SeedWorldGeologyLayout,
  field: SeedWorldGeologyHeightfield,
  selectedHillOrdinal: number
): void {
  drawHeightRaster(context, canvas, field);
  drawTopdownGrid(context, canvas);
  drawTopdownCoastline(context, canvas, field);
  const viewport = mapViewport(canvas.width, canvas.height);
  const scale = viewport.size / layout.worldSizeMetres;
  context.save();
  context.lineCap = "round";
  context.lineJoin = "round";
  for (const belt of layout.upliftBelts) {
    strokeCurve(context, belt.points, canvas, "rgba(240, 143, 192, .22)", belt.widthMetres * scale);
    strokeCurve(context, belt.points, canvas, "rgba(240, 143, 192, .76)", 12 * scale, [28 * scale, 24 * scale]);
    const arrowStart = worldToScreen(catmullPoint(belt.points, 0.5), canvas.width, canvas.height);
    const arrowEnd = worldToScreen(catmullPoint(belt.points, 0.64), canvas.width, canvas.height);
    drawArrow(context, arrowStart, arrowEnd, "rgba(240, 143, 192, .88)", 13 * scale, 34 * scale);
  }
  for (const canyon of layout.canyons) {
    context.globalAlpha = canyon.kind === "tributary" ? 0.72 : 1;
    strokeCurve(context, canyon.points, canvas, "rgba(131, 195, 255, .25)", canyon.widthMetres * scale);
    strokeCurve(context, canyon.points, canvas, "rgba(131, 195, 255, .88)", 16 * scale, [48 * scale, 28 * scale]);
    const label = worldToScreen(canyon.points[Math.floor(canyon.points.length * 0.48)]!, canvas.width, canvas.height);
    drawTopdownLabel(
      context,
      canyon.kind === "trunk"
        ? canyon.id.replace("canyon-", "C")
        : canyon.id.replace("canyon-", "C").replace("-tributary-", "."),
      label.x,
      label.y - 44 * scale,
      "rgba(245, 245, 245, .72)",
      scale,
      true
    );
    context.globalAlpha = 1;
  }
  for (const road of layout.roads) {
    strokeCurve(context, road.points, canvas, "rgb(246, 162, 99)", (road.kind === "main" ? 24 : 16) * scale);
  }
  for (const node of layout.roadNodes) {
    const point = worldToScreen(node.position, canvas.width, canvas.height);
    context.fillStyle = "#f59a56";
    context.strokeStyle = "#181818";
    context.lineWidth = 8 * scale;
    context.beginPath();
    context.arc(point.x, point.y, (node.kind === "branch-junction" ? 20 : 28) * scale, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    drawTopdownLabel(
      context,
      node.kind === "entry" ? "入口" : node.kind === "exit" ? "出口" : "支路口",
      point.x + 34 * scale,
      point.y - 24 * scale,
      "rgba(245, 245, 245, .72)",
      scale
    );
  }
  context.strokeStyle = "rgba(255, 255, 255, .067)";
  context.lineWidth = 7 * scale;
  for (const adjacency of layout.adjacency) {
    const hillA = layout.hills.find((hill) => hill.id === adjacency.hillAId);
    const hillB = layout.hills.find((hill) => hill.id === adjacency.hillBId);
    if (!hillA || !hillB) continue;
    const start = worldToScreen(hillA.center, canvas.width, canvas.height);
    const end = worldToScreen(hillB.center, canvas.width, canvas.height);
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.stroke();
  }
  for (const hill of layout.hills) drawHill(context, canvas, hill, hill.ordinal === selectedHillOrdinal);
  context.restore();
}

function drawRelief(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  layout: SeedWorldGeologyLayout,
  field: SeedWorldGeologyHeightfield,
  selectedHillOrdinal: number
): void {
  context.fillStyle = "#34434a";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const cells: Array<{
    readonly averageHeight: number;
    readonly depth: number;
    readonly points: readonly Readonly<{ x: number; y: number }>[];
    readonly shade: number;
  }> = [];
  for (let z = 0; z < field.resolution - 1; z++) {
    for (let x = 0; x < field.resolution - 1; x++) {
      const indices = [
        z * field.resolution + x,
        z * field.resolution + x + 1,
        (z + 1) * field.resolution + x + 1,
        (z + 1) * field.resolution + x
      ];
      const points = indices.map((index) => {
        const world = fieldIndexPoint(index, field);
        return projectRelief(world, field.heights[index]!, canvas);
      });
      const averageHeight = indices.reduce((sum, index) => sum + field.heights[index]!, 0) / indices.length;
      const riseX = field.heights[indices[1]!]! - field.heights[indices[0]!]!;
      const riseZ = field.heights[indices[3]!]! - field.heights[indices[0]!]!;
      cells.push({
        averageHeight,
        depth: points.reduce((sum, point) => sum + point.y, 0) / points.length,
        points,
        shade: Math.min(3, Math.max(0, Math.round(1.8 + (riseX - riseZ) / 70)))
      });
    }
  }
  cells.sort((left, right) => left.depth - right.depth);
  for (const cell of cells) {
    context.fillStyle = terrainReliefColor(cell.averageHeight, cell.shade);
    context.beginPath();
    cell.points.forEach((point, index) =>
      index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y)
    );
    context.closePath();
    context.fill();
  }
  drawReliefGrid(context, canvas, field);
  layout.upliftBelts.forEach((belt, index) => {
    const viewScale = Math.min(canvas.width / 1_200, canvas.height / 760);
    strokeReliefCurve(
      context,
      belt.points,
      canvas,
      layout,
      "rgba(240, 143, 192, .24)",
      Math.min(86, Math.max(34, belt.widthMetres * 0.08)) * viewScale
    );
    strokeReliefCurve(context, belt.points, canvas, layout, "#f08fc0", 3 * viewScale);
    const startWorld = catmullPoint(belt.points, 0.5);
    const endWorld = catmullPoint(belt.points, 0.64);
    const startHeight = sampleSeedWorldGeologyHeight(layout, startWorld.x, startWorld.z).heightMetres + 11;
    const endHeight = sampleSeedWorldGeologyHeight(layout, endWorld.x, endWorld.z).heightMetres + 11;
    drawArrow(
      context,
      projectRelief(startWorld, startHeight, canvas),
      projectRelief(endWorld, endHeight, canvas),
      "#f08fc0",
      3 * viewScale,
      9 * viewScale
    );
    const labelWorld = catmullPoint(belt.points, 0.12);
    const labelPoint = projectRelief(
      labelWorld,
      sampleSeedWorldGeologyHeight(layout, labelWorld.x, labelWorld.z).heightMetres + 12,
      canvas
    );
    drawLabel(
      context,
      `B${index + 1} ${Math.round(radiansToDegrees(belt.directionRadians))}° +${Math.round(belt.liftMetres)}m`,
      labelPoint.x,
      labelPoint.y - 9 * viewScale,
      "#f5f5f5"
    );
  });
  layout.canyons.forEach((canyon, index) => {
    fillReliefCanyonBand(context, canvas, layout, canyon.points, canyon.widthMetres, canyon.kind === "tributary");
    strokeReliefCurve(
      context,
      canyon.points,
      canvas,
      layout,
      canyon.kind === "trunk" ? "rgba(131, 195, 255, .9)" : "rgba(131, 195, 255, .68)",
      canyon.kind === "trunk" ? 3 : 2,
      [12, 8]
    );
    const labelWorld = catmullPoint(canyon.points, canyon.kind === "trunk" ? 0.18 : 0.28);
    const labelPoint = projectRelief(
      labelWorld,
      sampleSeedWorldGeologyHeight(layout, labelWorld.x, labelWorld.z).heightMetres + 10,
      canvas
    );
    drawLabel(
      context,
      `${canyon.kind === "trunk" ? `C${index + 1}` : canyon.id.replace("canyon-", "C").replace("-tributary-", ".")} ↓${Math.round(canyon.depthMetres)}m`,
      labelPoint.x,
      labelPoint.y - 8,
      canyon.kind === "trunk" ? "#f5f5f5" : "rgba(245, 245, 245, .7)"
    );
  });
  for (const road of layout.roads) {
    strokeReliefCurve(
      context,
      road.points,
      canvas,
      layout,
      road.kind === "main" ? "#f59a56" : "rgba(245, 154, 86, .86)",
      road.kind === "main" ? 4 : 2.5
    );
  }
  for (const node of layout.roadNodes) {
    const height = sampleSeedWorldGeologyHeight(layout, node.position.x, node.position.z).heightMetres + 13;
    const point = projectRelief(node.position, height, canvas);
    context.fillStyle = "#f59a56";
    context.strokeStyle = "#181818";
    context.lineWidth = 2;
    context.beginPath();
    context.arc(point.x, point.y, 5, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    drawLabel(
      context,
      node.kind === "entry" ? "入口" : node.kind === "exit" ? "出口" : "支路口",
      point.x + 9,
      point.y - 7,
      "rgba(245, 245, 245, .72)"
    );
  }
  for (const hill of layout.hills) {
    const height = sampleSeedWorldGeologyHeight(layout, hill.center.x, hill.center.z).heightMetres + 6;
    const point = projectRelief(hill.center, height, canvas);
    context.fillStyle = hill.ordinal === selectedHillOrdinal ? "#f5f5f5" : "rgba(245, 245, 245, .74)";
    context.strokeStyle = "#181818";
    context.lineWidth = 1.5;
    context.beginPath();
    context.arc(point.x, point.y, hill.ordinal === selectedHillOrdinal ? 5 : 2.5, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  }
  const selected = layout.hills[selectedHillOrdinal];
  if (selected) {
    const sample = sampleSeedWorldGeologyHeight(layout, selected.center.x, selected.center.z);
    strokeReliefEllipse(context, canvas, layout, selected, selected.influenceRadiusMetres, "#aa91ef", [12, 8]);
    strokeReliefEllipse(context, canvas, layout, selected, selected.bodyRadiusMetres, "#f5f5f5");
    const point = projectRelief(selected.center, sample.heightMetres + 10, canvas);
    drawLabel(
      context,
      `${selected.id} · ${selected.canyonBank ? `${selected.canyonBank.canyonId} ${selected.canyonBank.side === "left" ? "左岸" : "右岸"}` : "最近低地"} · global ${Math.round(sample.heightMetres)}m`,
      point.x + 10,
      point.y - 10,
      "#f5f5f5"
    );
  }
  const textScale = Math.max(0.8, Math.min(1, canvas.width / 1_200));
  context.font = `${12 * textScale}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  context.fillStyle = "rgba(245, 245, 245, .62)";
  context.fillText("绿色平原 = 0–90m 可通行陆地 · 黄绿色 = 丘陵 · 棕色 = 高地 · 蓝色 = 海面", 18, canvas.height - 30);
  context.fillText(
    `绝对高程分带 · ${field.resolution}² · ${Math.round(field.minimumHeightMetres)}–${Math.round(field.maximumHeightMetres)}m · 道路最大坡度 ${Math.max(0, ...layout.roads.map((road) => road.maximumSlopeDegrees)).toFixed(1)}° · 垂直 1.5×`,
    18,
    canvas.height - 12
  );
}

function drawReliefGrid(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  field: SeedWorldGeologyHeightfield
): void {
  context.save();
  context.strokeStyle = "rgba(245, 245, 245, .16)";
  context.lineWidth = 1;
  for (let axis = 0; axis < 2; axis++) {
    for (let fixed = 0; fixed < field.resolution; fixed += 4) {
      context.beginPath();
      for (let moving = 0; moving < field.resolution; moving++) {
        const x = axis === 0 ? moving : fixed;
        const z = axis === 0 ? fixed : moving;
        const index = z * field.resolution + x;
        const point = projectRelief(fieldIndexPoint(index, field), field.heights[index]!, canvas);
        if (moving) context.lineTo(point.x, point.y);
        else context.moveTo(point.x, point.y);
      }
      context.stroke();
    }
  }
  context.restore();
}

function fillReliefCanyonBand(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  layout: SeedWorldGeologyLayout,
  curve: readonly SeedWorldGeologyPoint[],
  widthMetres: number,
  tributary: boolean
): void {
  const left: Readonly<{ x: number; y: number }>[] = [];
  const right: Readonly<{ x: number; y: number }>[] = [];
  for (let index = 0; index <= 30; index++) {
    const parameter = index / 30;
    const point = catmullPoint(curve, parameter);
    const before = catmullPoint(curve, Math.max(0, parameter - 0.01));
    const after = catmullPoint(curve, Math.min(1, parameter + 0.01));
    const deltaX = after.x - before.x;
    const deltaZ = after.z - before.z;
    const length = Math.hypot(deltaX, deltaZ) || 1;
    const normalX = -deltaZ / length;
    const normalZ = deltaX / length;
    for (const [side, target] of [
      [1, left],
      [-1, right]
    ] as const) {
      const edge = freezePoint(
        point.x + normalX * widthMetres * 0.5 * side,
        point.z + normalZ * widthMetres * 0.5 * side
      );
      const height = sampleSeedWorldGeologyHeight(layout, edge.x, edge.z).heightMetres + 3;
      (target as Readonly<{ x: number; y: number }>[]).push(projectRelief(edge, height, canvas));
    }
  }
  context.save();
  context.fillStyle = tributary ? "rgba(51, 156, 255, .13)" : "rgba(51, 156, 255, .22)";
  context.strokeStyle = tributary ? "rgba(131, 195, 255, .46)" : "rgba(131, 195, 255, .78)";
  context.lineWidth = 2;
  context.beginPath();
  [...left, ...right.reverse()].forEach((point, index) =>
    index ? context.lineTo(point.x, point.y) : context.moveTo(point.x, point.y)
  );
  context.closePath();
  context.fill();
  context.stroke();
  context.restore();
}

function strokeReliefEllipse(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  layout: SeedWorldGeologyLayout,
  hill: SeedWorldGeologyHill,
  radii: Readonly<{ major: number; minor: number }>,
  color: string,
  dash: readonly number[] = []
): void {
  context.save();
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.setLineDash([...dash]);
  context.beginPath();
  for (let index = 0; index <= 48; index++) {
    const angle = (index / 48) * Math.PI * 2;
    const localX = Math.cos(angle) * radii.major;
    const localZ = Math.sin(angle) * radii.minor;
    const point = freezePoint(
      hill.center.x + localX * Math.cos(hill.rotationRadians) - localZ * Math.sin(hill.rotationRadians),
      hill.center.z + localX * Math.sin(hill.rotationRadians) + localZ * Math.cos(hill.rotationRadians)
    );
    const height = sampleSeedWorldGeologyHeight(layout, point.x, point.z).heightMetres + 5;
    const screen = projectRelief(point, height, canvas);
    if (index) context.lineTo(screen.x, screen.y);
    else context.moveTo(screen.x, screen.y);
  }
  context.closePath();
  context.stroke();
  context.restore();
}

const heightRasterCache = new WeakMap<SeedWorldGeologyHeightfield, HTMLCanvasElement>();

function drawHeightRaster(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  field: SeedWorldGeologyHeightfield
): void {
  let raster = heightRasterCache.get(field);
  if (!raster) {
    raster = document.createElement("canvas");
    raster.width = field.resolution;
    raster.height = field.resolution;
    const rasterContext = raster.getContext("2d")!;
    const pixels = rasterContext.createImageData(field.resolution, field.resolution);
    for (let index = 0; index < field.heights.length; index++) {
      const color = terrainRgb(field.heights[index]!, field);
      pixels.data[index * 4] = color[0];
      pixels.data[index * 4 + 1] = color[1];
      pixels.data[index * 4 + 2] = color[2];
      pixels.data[index * 4 + 3] = 255;
    }
    rasterContext.putImageData(pixels, 0, 0);
    heightRasterCache.set(field, raster);
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  const viewport = mapViewport(canvas.width, canvas.height);
  context.fillStyle = "#34434a";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(raster, viewport.x, viewport.y, viewport.size, viewport.size);
}

function drawTopdownCoastline(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  field: SeedWorldGeologyHeightfield
): void {
  const viewport = mapViewport(canvas.width, canvas.height);
  const scale = viewport.size / 3_072;
  context.save();
  context.strokeStyle = "rgba(131, 195, 255, .72)";
  context.lineWidth = 10 * scale;
  context.setLineDash([28 * scale, 22 * scale]);
  context.beginPath();
  for (let z = 0; z < field.resolution - 1; z++) {
    for (let x = 0; x < field.resolution - 1; x++) {
      const index = z * field.resolution + x;
      const right = index + 1;
      const bottom = index + field.resolution;
      if (field.heights[index]! > 0 !== field.heights[right]! > 0) {
        const world = freezePoint(-1_536 + (x + 0.5) * field.spacingMetres, -1_536 + z * field.spacingMetres);
        const screen = worldToScreen(world, canvas.width, canvas.height);
        context.moveTo(screen.x, screen.y);
        context.lineTo(
          screen.x,
          screen.y + (field.spacingMetres / 3_072) * mapViewport(canvas.width, canvas.height).size
        );
      }
      if (field.heights[index]! > 0 !== field.heights[bottom]! > 0) {
        const world = freezePoint(-1_536 + x * field.spacingMetres, -1_536 + (z + 0.5) * field.spacingMetres);
        const screen = worldToScreen(world, canvas.width, canvas.height);
        context.moveTo(screen.x, screen.y);
        context.lineTo(
          screen.x + (field.spacingMetres / 3_072) * mapViewport(canvas.width, canvas.height).size,
          screen.y
        );
      }
    }
  }
  context.stroke();
  context.restore();
}

function drawTopdownGrid(context: CanvasRenderingContext2D, canvas: HTMLCanvasElement): void {
  const viewport = mapViewport(canvas.width, canvas.height);
  const scale = viewport.size / 3_072;
  context.save();
  context.strokeStyle = "rgba(255, 255, 255, .034)";
  context.lineWidth = 4 * scale;
  for (let ordinal = 1; ordinal < 6; ordinal++) {
    const offset = (ordinal / 6) * viewport.size;
    context.beginPath();
    context.moveTo(viewport.x + offset, viewport.y);
    context.lineTo(viewport.x + offset, viewport.y + viewport.size);
    context.moveTo(viewport.x, viewport.y + offset);
    context.lineTo(viewport.x + viewport.size, viewport.y + offset);
    context.stroke();
  }
  context.strokeStyle = "rgba(255, 255, 255, .067)";
  context.lineWidth = 8 * scale;
  context.strokeRect(viewport.x, viewport.y, viewport.size, viewport.size);
  context.restore();
}

function drawHill(
  context: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  hill: SeedWorldGeologyHill,
  selected: boolean
): void {
  const point = worldToScreen(hill.center, canvas.width, canvas.height);
  const viewport = mapViewport(canvas.width, canvas.height);
  const scale = viewport.size / 3_072;
  context.save();
  context.translate(point.x, point.y);
  context.rotate(hill.rotationRadians);
  if (selected) {
    context.strokeStyle = "#aa91ef";
    context.lineWidth = 16 * scale;
    context.setLineDash([42 * scale, 28 * scale]);
    context.beginPath();
    context.ellipse(
      0,
      0,
      hill.influenceRadiusMetres.major * scale,
      hill.influenceRadiusMetres.minor * scale,
      0,
      0,
      Math.PI * 2
    );
    context.stroke();
    context.setLineDash([]);
  }
  context.fillStyle = "rgba(116, 213, 139, .051)";
  context.strokeStyle = selected ? "#ffffff" : "rgb(133, 218, 153)";
  context.lineWidth = (selected ? 18 : 10) * scale;
  context.beginPath();
  context.ellipse(0, 0, hill.bodyRadiusMetres.major * scale, hill.bodyRadiusMetres.minor * scale, 0, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.strokeStyle = selected ? "#ffffff" : "rgb(133, 218, 153)";
  context.lineWidth = 6 * scale;
  context.beginPath();
  context.moveTo(-hill.bodyRadiusMetres.major * scale * 0.54, 0);
  context.lineTo(hill.bodyRadiusMetres.major * scale * 0.54, 0);
  context.stroke();
  context.restore();
  drawTopdownLabel(
    context,
    `H${hill.ordinal + 1}${hill.canyonBank ? ` · ${hill.canyonBank.side === "left" ? "L" : "R"}` : ""}`,
    point.x + 22 * scale,
    point.y - hill.bodyRadiusMetres.minor * scale - 26 * scale,
    hill.canyonBank?.side === "left"
      ? "#339cff"
      : hill.canyonBank?.side === "right"
        ? "#fb6a22"
        : "rgba(245, 245, 245, .78)",
    scale,
    true
  );
}

function drawArrow(
  context: CanvasRenderingContext2D,
  start: Readonly<{ x: number; y: number }>,
  end: Readonly<{ x: number; y: number }>,
  color: string,
  width: number,
  headLength: number
): void {
  const angle = Math.atan2(end.y - start.y, end.x - start.x);
  context.save();
  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = width;
  context.lineCap = "round";
  context.beginPath();
  context.moveTo(start.x, start.y);
  context.lineTo(end.x, end.y);
  context.stroke();
  context.beginPath();
  context.moveTo(end.x, end.y);
  context.lineTo(
    end.x - Math.cos(angle - Math.PI / 6) * headLength,
    end.y - Math.sin(angle - Math.PI / 6) * headLength
  );
  context.lineTo(
    end.x - Math.cos(angle + Math.PI / 6) * headLength,
    end.y - Math.sin(angle + Math.PI / 6) * headLength
  );
  context.closePath();
  context.fill();
  context.restore();
}

function strokeCurve(
  context: CanvasRenderingContext2D,
  points: readonly SeedWorldGeologyPoint[],
  canvas: HTMLCanvasElement,
  color: string,
  width: number,
  dash: readonly number[] = []
): void {
  context.save();
  context.strokeStyle = color;
  context.lineWidth = width;
  context.setLineDash([...dash]);
  context.beginPath();
  sampleCurve(points, 64).forEach((point, index) => {
    const screen = worldToScreen(point, canvas.width, canvas.height);
    if (index) context.lineTo(screen.x, screen.y);
    else context.moveTo(screen.x, screen.y);
  });
  context.stroke();
  context.restore();
}

function strokeReliefCurve(
  context: CanvasRenderingContext2D,
  points: readonly SeedWorldGeologyPoint[],
  canvas: HTMLCanvasElement,
  layout: SeedWorldGeologyLayout,
  color: string,
  width: number,
  dash: readonly number[] = []
): void {
  context.save();
  context.strokeStyle = color;
  context.lineWidth = width;
  context.setLineDash([...dash]);
  context.beginPath();
  sampleCurve(points, 64).forEach((point, index) => {
    const height = sampleSeedWorldGeologyHeight(layout, point.x, point.z).heightMetres + 6;
    const screen = projectRelief(point, height, canvas);
    if (index) context.lineTo(screen.x, screen.y);
    else context.moveTo(screen.x, screen.y);
  });
  context.stroke();
  context.restore();
}

function sampleCurve(points: readonly SeedWorldGeologyPoint[], count: number): readonly SeedWorldGeologyPoint[] {
  return Object.freeze(Array.from({ length: count + 1 }, (_, index) => catmullPoint(points, index / count)));
}

function catmullPoint(points: readonly SeedWorldGeologyPoint[], parameter: number): SeedWorldGeologyPoint {
  if (points.length === 2)
    return freezePoint(mix(points[0]!.x, points[1]!.x, parameter), mix(points[0]!.z, points[1]!.z, parameter));
  if (points.length === 3) {
    const inverse = 1 - parameter;
    return freezePoint(
      inverse * inverse * points[0]!.x + 2 * inverse * parameter * points[1]!.x + parameter * parameter * points[2]!.x,
      inverse * inverse * points[0]!.z + 2 * inverse * parameter * points[1]!.z + parameter * parameter * points[2]!.z
    );
  }
  const segments = points.length - 1;
  const scaled = Math.min(segments, Math.max(0, parameter * segments));
  const segment = Math.min(segments - 1, Math.floor(scaled));
  const local = scaled - segment;
  const p0 = points[Math.max(0, segment - 1)]!;
  const p1 = points[segment]!;
  const p2 = points[segment + 1]!;
  const p3 = points[Math.min(points.length - 1, segment + 2)]!;
  const squared = local * local;
  const cubed = squared * local;
  return freezePoint(
    0.5 *
      (2 * p1.x +
        (-p0.x + p2.x) * local +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * squared +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * cubed),
    0.5 *
      (2 * p1.z +
        (-p0.z + p2.z) * local +
        (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * squared +
        (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * cubed)
  );
}

function projectRelief(
  point: SeedWorldGeologyPoint,
  heightMetres: number,
  canvas: HTMLCanvasElement
): Readonly<{ x: number; y: number }> {
  const yaw = -0.61;
  const elevation = 0.61;
  const scale = 0.245 * Math.min(canvas.width / 1_200, canvas.height / 760);
  const rotatedX = point.x * Math.cos(yaw) - point.z * Math.sin(yaw);
  const rotatedZ = point.x * Math.sin(yaw) + point.z * Math.cos(yaw);
  return Object.freeze({
    x: canvas.width * 0.5 + rotatedX * scale,
    y:
      canvas.height * (448 / 760) +
      rotatedZ * Math.sin(elevation) * scale -
      heightMetres * Math.cos(elevation) * scale * 1.5
  });
}

function worldToScreen(
  point: SeedWorldGeologyPoint,
  width: number,
  height: number
): Readonly<{ x: number; y: number }> {
  const viewport = mapViewport(width, height);
  return Object.freeze({
    x: viewport.x + ((point.x + 1_536) / 3_072) * viewport.size,
    y: viewport.y + ((point.z + 1_536) / 3_072) * viewport.size
  });
}

function screenToWorld(x: number, z: number, width: number, height: number): SeedWorldGeologyPoint {
  const viewport = mapViewport(width, height);
  return freezePoint(
    ((x - viewport.x) / viewport.size) * 3_072 - 1_536,
    ((z - viewport.y) / viewport.size) * 3_072 - 1_536
  );
}

function selectTopdownHill(
  hills: readonly SeedWorldGeologyHill[],
  pointer: Readonly<{ x: number; y: number }>,
  canvas: HTMLCanvasElement
): SeedWorldGeologyHill | undefined {
  const world = screenToWorld(pointer.x, pointer.y, canvas.width, canvas.height);
  const candidates = hills
    .map((hill) => {
      const deltaX = world.x - hill.center.x;
      const deltaZ = world.z - hill.center.z;
      const cosine = Math.cos(hill.rotationRadians);
      const sine = Math.sin(hill.rotationRadians);
      const localX = deltaX * cosine + deltaZ * sine;
      const localZ = -deltaX * sine + deltaZ * cosine;
      return {
        hill,
        score: Math.hypot(localX / hill.influenceRadiusMetres.major, localZ / hill.influenceRadiusMetres.minor)
      };
    })
    .sort((left, right) => left.score - right.score);
  const closest = candidates[0];
  return closest && closest.score <= 1 ? closest.hill : undefined;
}

function selectReliefHill(
  layout: SeedWorldGeologyLayout,
  pointer: Readonly<{ x: number; y: number }>,
  canvas: HTMLCanvasElement
): SeedWorldGeologyHill | undefined {
  const candidates = layout.hills
    .map((hill) => ({ hill, score: reliefHillHitScore(layout, hill, pointer, canvas) }))
    .sort((left, right) => left.score - right.score);
  const closest = candidates[0];
  return closest && closest.score <= 1.12 ? closest.hill : undefined;
}

function reliefHillHitScore(
  layout: SeedWorldGeologyLayout,
  hill: SeedWorldGeologyHill,
  pointer: Readonly<{ x: number; y: number }>,
  canvas: HTMLCanvasElement
): number {
  const cosine = Math.cos(hill.rotationRadians);
  const sine = Math.sin(hill.rotationRadians);
  const centerHeight = sampleSeedWorldGeologyHeight(layout, hill.center.x, hill.center.z).heightMetres + 6;
  const center = projectRelief(hill.center, centerHeight, canvas);
  const majorWorld = freezePoint(
    hill.center.x + cosine * hill.bodyRadiusMetres.major,
    hill.center.z + sine * hill.bodyRadiusMetres.major
  );
  const minorWorld = freezePoint(
    hill.center.x - sine * hill.bodyRadiusMetres.minor,
    hill.center.z + cosine * hill.bodyRadiusMetres.minor
  );
  const major = projectRelief(
    majorWorld,
    sampleSeedWorldGeologyHeight(layout, majorWorld.x, majorWorld.z).heightMetres + 6,
    canvas
  );
  const minor = projectRelief(
    minorWorld,
    sampleSeedWorldGeologyHeight(layout, minorWorld.x, minorWorld.z).heightMetres + 6,
    canvas
  );
  const majorX = major.x - center.x;
  const majorY = major.y - center.y;
  const minorX = minor.x - center.x;
  const minorY = minor.y - center.y;
  const determinant = majorX * minorY - majorY * minorX;
  if (Math.abs(determinant) < 0.001) return Number.POSITIVE_INFINITY;
  const pointerX = pointer.x - center.x;
  const pointerY = pointer.y - center.y;
  const majorCoefficient = (pointerX * minorY - pointerY * minorX) / determinant;
  const minorCoefficient = (majorX * pointerY - majorY * pointerX) / determinant;
  return Math.hypot(majorCoefficient, minorCoefficient);
}

function mapViewport(width: number, height: number): Readonly<{ x: number; y: number; size: number }> {
  const size = Math.min(width, height) * 0.94;
  return Object.freeze({ x: (width - size) * 0.5, y: (height - size) * 0.5, size });
}

function fieldIndexPoint(index: number, field: SeedWorldGeologyHeightfield): SeedWorldGeologyPoint {
  return freezePoint(
    -1_536 + (index % field.resolution) * field.spacingMetres,
    -1_536 + Math.floor(index / field.resolution) * field.spacingMetres
  );
}

function terrainReliefColor(heightMetres: number, shade: number): string {
  const [red, green, blue] = terrainRgb(heightMetres);
  const brightness = [1.08, 1.04, 1.01, 0.98][shade] ?? 1;
  return `rgb(${Math.round(red * brightness)} ${Math.round(green * brightness)} ${Math.round(blue * brightness)})`;
}

function terrainRgb(heightMetres: number, _field?: SeedWorldGeologyHeightfield): readonly [number, number, number] {
  if (heightMetres <= 0) return [67, 96, 108];
  if (heightMetres < 90) return [84, 104, 89];
  if (heightMetres < 180) return [91, 111, 92];
  if (heightMetres < 270) return [99, 117, 94];
  if (heightMetres < 360) return [107, 122, 97];
  if (heightMetres < 450) return [114, 126, 102];
  return [126, 133, 116];
}

function drawLabel(context: CanvasRenderingContext2D, text: string, x: number, y: number, color: string): void {
  context.font = "500 11px ui-monospace, SFMono-Regular, Menlo, monospace";
  context.lineWidth = 3;
  context.strokeStyle = "rgba(52, 67, 74, .92)";
  context.strokeText(text, x, y);
  context.fillStyle = color;
  context.fillText(text, x, y);
}

function drawTopdownLabel(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  scale: number,
  prominent = false
): void {
  context.save();
  context.font = `500 ${(prominent ? 54 : 46) * scale}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  context.fillStyle = color;
  context.fillText(text, x, y);
  context.restore();
}

function resizeCanvas(canvas: HTMLCanvasElement): void {
  const rectangle = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.round(rectangle.width));
  const height = Math.max(1, Math.round(rectangle.height));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function pointDistance(left: SeedWorldGeologyPoint, right: SeedWorldGeologyPoint): number {
  return Math.hypot(left.x - right.x, left.z - right.z);
}

function freezePoint(x: number, z: number): SeedWorldGeologyPoint {
  return Object.freeze({ x, z });
}

function mix(left: number, right: number, amount: number): number {
  return left + (right - left) * amount;
}

function radiansToDegrees(value: number): number {
  return (value * 180) / Math.PI;
}

function wrapHalfTurnDegrees(value: number): number {
  return ((value % 180) + 180) % 180;
}

function clampUint32(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(0xffff_ffff, Math.max(0, Math.round(value))) >>> 0;
}
