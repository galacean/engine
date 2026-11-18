import type { Camera, Engine } from "@galacean/engine";
import {
  DEFAULT_MASONRY_LOD_TUNING,
  getMasonryLodTuning,
  setMasonryLodTuning
} from "@galacean/engine-building/building/runtime/MasonryLodPolicy";
import {
  GRASS_DETAIL_LOD1_DISTANCE_METRES,
  GRASS_DETAIL_LOD2_DISTANCE_METRES,
  type GrassLodDebugConfig,
  type SeedWorldPopulationRuntime
} from "@galacean/engine-world-planning/runtime/SeedWorldPopulationRuntime";

export interface MasonryMetricsLike {
  readonly buildings: number;
  readonly detailReady: number;
  readonly nearReady: number;
  readonly mediumReady: number;
  readonly cached: number;
  readonly triangles: number;
}

export interface SeedWorldLodDebugPanelOptions {
  readonly host: HTMLElement;
  readonly engine: Engine;
  readonly camera: Camera;
  readonly readPopulation: () => SeedWorldPopulationRuntime | undefined;
  readonly readMasonryMetrics: () => MasonryMetricsLike | undefined;
}

const STYLE_ID = "seed-world-lod-debug-panel-style";

function ensureStyle(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .lod-debug-panel {
      position: fixed;
      top: 88px;
      right: 14px;
      z-index: 950;
      width: min(316px, calc(100vw - 28px));
      color: #edf3f0;
      font: 12px/1.35 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      border: 1px solid rgba(195, 218, 210, 0.25);
      border-radius: 10px;
      background: rgba(13, 18, 17, 0.78);
      backdrop-filter: blur(8px);
      box-shadow: 0 10px 28px rgba(0, 0, 0, 0.32);
      overflow: hidden;
    }
    .lod-debug-panel__header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 7px 10px;
      background: rgba(255, 255, 255, 0.04);
      border-bottom: 1px solid rgba(195, 218, 210, 0.14);
      cursor: pointer;
      user-select: none;
      font-weight: 700;
    }
    .lod-debug-panel__body {
      padding: 8px 10px 10px;
      max-height: calc(100vh - 210px);
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 9px;
    }
    .lod-debug-panel[data-collapsed="true"] .lod-debug-panel__body {
      display: none;
    }
    .lod-debug-legend {
      display: flex;
      gap: 10px;
      align-items: center;
      font-size: 11px;
      color: #c7d4cf;
    }
    .lod-dot {
      display: inline-block;
      width: 9px;
      height: 9px;
      border-radius: 99px;
      margin-right: 4px;
      vertical-align: middle;
    }
    .lod-dot--0 { background: #1fd940; }
    .lod-dot--1 { background: #f2c714; }
    .lod-dot--2 { background: #f2332e; }
    .lod-section {
      border: 1px solid rgba(195, 218, 210, 0.14);
      border-radius: 7px;
      padding: 7px 8px;
      display: flex;
      flex-direction: column;
      gap: 6px;
      background: rgba(255, 255, 255, 0.02);
    }
    .lod-section__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-weight: 700;
      color: #8ee8bc;
    }
    .lod-toggle {
      display: flex;
      align-items: center;
      gap: 5px;
      font-weight: 500;
      color: #eef5f2;
      cursor: pointer;
    }
    .lod-row {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 3px 6px;
      align-items: center;
    }
    .lod-row__label {
      color: #ced9d5;
      font-size: 11px;
    }
    .lod-row__val {
      color: #76e6ae;
      font-size: 11px;
      text-align: right;
    }
    .lod-row input[type="range"] {
      grid-column: 1 / -1;
      width: 100%;
      margin: 0;
      accent-color: #6ce3a9;
      cursor: pointer;
    }
    .lod-stats {
      font-size: 11px;
      color: #b7c6c1;
      line-height: 1.45;
      border-top: 1px dashed rgba(195, 218, 210, 0.14);
      padding-top: 5px;
    }
    .lod-actions {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }
    .lod-btn {
      flex: 1;
      min-width: 80px;
      padding: 5px 8px;
      border-radius: 6px;
      border: 1px solid rgba(195, 218, 210, 0.25);
      background: rgba(118, 230, 174, 0.12);
      color: #e8f5ef;
      font: inherit;
      font-size: 11px;
      cursor: pointer;
    }
    .lod-btn:hover {
      background: rgba(118, 230, 174, 0.24);
    }
    .lod-btn--secondary {
      background: rgba(255, 255, 255, 0.06);
    }
    .lod-select {
      background: rgba(20, 28, 26, 0.9);
      color: #edf3f0;
      border: 1px solid rgba(195, 218, 210, 0.24);
      border-radius: 4px;
      padding: 2px 5px;
      font: inherit;
      font-size: 11px;
    }
  `;
  document.head.appendChild(style);
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

/** Interactive LOD colorization and distance/pixel threshold tuning panel for Grass & Buildings. */
export class SeedWorldLodDebugPanel {
  readonly element: HTMLElement;
  private readonly chevron: HTMLElement;
  private lastPopulation?: SeedWorldPopulationRuntime;
  private grassState: GrassLodDebugConfig = {
    colorizeLod: false,
    lod1DistanceMetres: GRASS_DETAIL_LOD1_DISTANCE_METRES,
    lod2DistanceMetres: GRASS_DETAIL_LOD2_DISTANCE_METRES,
    maximumDistanceMetres: 60,
    minimumDensityFraction: 0.25,
    distanceMode: "edge"
  };

  private readonly grassColorCheck: HTMLInputElement;
  private readonly grassModeSelect: HTMLSelectElement;
  private readonly grassLod1Slider: HTMLInputElement;
  private readonly grassLod1Val: HTMLElement;
  private readonly grassLod2Slider: HTMLInputElement;
  private readonly grassLod2Val: HTMLElement;
  private readonly grassMaxSlider: HTMLInputElement;
  private readonly grassMaxVal: HTMLElement;
  private readonly grassMinDensSlider: HTMLInputElement;
  private readonly grassMinDensVal: HTMLElement;
  private readonly grassStatsEl: HTMLElement;

  private readonly bldgColorCheck: HTMLInputElement;
  private readonly bldgFullSlider: HTMLInputElement;
  private readonly bldgFullVal: HTMLElement;
  private readonly bldgSizeSlider: HTMLInputElement;
  private readonly bldgSizeVal: HTMLElement;
  private readonly bldgUnitSlider: HTMLInputElement;
  private readonly bldgUnitVal: HTMLElement;
  private readonly bldgStatsEl: HTMLElement;
  private readonly copyBtn: HTMLButtonElement;

  constructor(private readonly options: SeedWorldLodDebugPanelOptions) {
    ensureStyle();
    const root = document.createElement("section");
    root.className = "lod-debug-panel";
    root.dataset.collapsed = "false";
    root.setAttribute("aria-label", "LOD 距离与着色调试");

    root.innerHTML = `
      <header class="lod-debug-panel__header" data-action="toggle">
        <span>LOD 距离与着色调试</span>
        <span data-role="chevron">▾</span>
      </header>
      <div class="lod-debug-panel__body">
        <div class="lod-debug-legend">
          <span><i class="lod-dot lod-dot--0"></i>LOD 0</span>
          <span><i class="lod-dot lod-dot--1"></i>LOD 1</span>
          <span><i class="lod-dot lod-dot--2"></i>LOD 2</span>
        </div>

        <div class="lod-section">
          <div class="lod-section__head">
            <span>草地 Grass</span>
            <label class="lod-toggle"><input type="checkbox" data-ctrl="grass-color">按 LOD 着色</label>
          </div>
          <div class="lod-row">
            <span class="lod-row__label">测距基准 (16m Patch)</span>
            <select class="lod-select" data-ctrl="grass-mode">
              <option value="edge">最近边 (默认)</option>
              <option value="center">分块中心</option>
            </select>
          </div>
          <div class="lod-row">
            <span class="lod-row__label">LOD0 → LOD1 距离</span>
            <span class="lod-row__val" data-val="grass-lod1">${GRASS_DETAIL_LOD1_DISTANCE_METRES} m</span>
            <input type="range" min="0" max="60" step="1" value="${GRASS_DETAIL_LOD1_DISTANCE_METRES}" data-ctrl="grass-lod1">
          </div>
          <div class="lod-row">
            <span class="lod-row__label">LOD1 → LOD2 距离</span>
            <span class="lod-row__val" data-val="grass-lod2">${GRASS_DETAIL_LOD2_DISTANCE_METRES} m</span>
            <input type="range" min="0" max="80" step="1" value="${GRASS_DETAIL_LOD2_DISTANCE_METRES}" data-ctrl="grass-lod2">
          </div>
          <div class="lod-row">
            <span class="lod-row__label">最大绘制距离</span>
            <span class="lod-row__val" data-val="grass-max">60 m</span>
            <input type="range" min="15" max="90" step="1" value="60" data-ctrl="grass-max">
          </div>
          <div class="lod-row">
            <span class="lod-row__label">远距最低密度</span>
            <span class="lod-row__val" data-val="grass-dens">25%</span>
            <input type="range" min="0" max="100" step="5" value="25" data-ctrl="grass-dens">
          </div>
          <div class="lod-stats" data-role="grass-stats">加载中...</div>
        </div>

        <div class="lod-section">
          <div class="lod-section__head">
            <span>建筑 Masonry</span>
            <label class="lod-toggle"><input type="checkbox" data-ctrl="bldg-color">按 LOD 着色</label>
          </div>
          <div class="lod-row">
            <span class="lod-row__label">LOD0 → LOD1 (0.3m 砖像素)</span>
            <span class="lod-row__val" data-val="bldg-full">${DEFAULT_MASONRY_LOD_TUNING.enterFullUnitPx} px</span>
            <input type="range" min="6" max="40" step="1" value="${DEFAULT_MASONRY_LOD_TUNING.enterFullUnitPx}" data-ctrl="bldg-full">
          </div>
          <div class="lod-row">
            <span class="lod-row__label">LOD1 → LOD2 (建筑总像素)</span>
            <span class="lod-row__val" data-val="bldg-size">${DEFAULT_MASONRY_LOD_TUNING.enterDetailSizePx} px</span>
            <input type="range" min="16" max="260" step="2" value="${DEFAULT_MASONRY_LOD_TUNING.enterDetailSizePx}" data-ctrl="bldg-size">
          </div>
          <div class="lod-row">
            <span class="lod-row__label">LOD1 → LOD2 (0.3m 砖像素)</span>
            <span class="lod-row__val" data-val="bldg-unit">${DEFAULT_MASONRY_LOD_TUNING.enterDetailUnitPx} px</span>
            <input type="range" min="0.5" max="8.0" step="0.1" value="${DEFAULT_MASONRY_LOD_TUNING.enterDetailUnitPx}" data-ctrl="bldg-unit">
          </div>
          <div class="lod-actions">
            <button type="button" class="lod-btn lod-btn--secondary" data-preset="default">默认 (${DEFAULT_MASONRY_LOD_TUNING.enterDetailSizePx} / ${DEFAULT_MASONRY_LOD_TUNING.enterDetailUnitPx})</button>
            <button type="button" class="lod-btn lod-btn--secondary" data-preset="legacy">原始 (32 / 0.85)</button>
          </div>
          <div class="lod-stats" data-role="bldg-stats">加载中...</div>
        </div>

        <div class="lod-actions">
          <button type="button" class="lod-btn" data-action="copy">复制当前 LOD 参数</button>
          <button type="button" class="lod-btn lod-btn--secondary" data-action="reset">全部重置</button>
        </div>
      </div>
    `;

    this.element = root;
    this.chevron = root.querySelector('[data-role="chevron"]')!;
    this.grassColorCheck = root.querySelector('[data-ctrl="grass-color"]')!;
    this.grassModeSelect = root.querySelector('[data-ctrl="grass-mode"]')!;
    this.grassLod1Slider = root.querySelector('[data-ctrl="grass-lod1"]')!;
    this.grassLod1Val = root.querySelector('[data-val="grass-lod1"]')!;
    this.grassLod2Slider = root.querySelector('[data-ctrl="grass-lod2"]')!;
    this.grassLod2Val = root.querySelector('[data-val="grass-lod2"]')!;
    this.grassMaxSlider = root.querySelector('[data-ctrl="grass-max"]')!;
    this.grassMaxVal = root.querySelector('[data-val="grass-max"]')!;
    this.grassMinDensSlider = root.querySelector('[data-ctrl="grass-dens"]')!;
    this.grassMinDensVal = root.querySelector('[data-val="grass-dens"]')!;
    this.grassStatsEl = root.querySelector('[data-role="grass-stats"]')!;

    this.bldgColorCheck = root.querySelector('[data-ctrl="bldg-color"]')!;
    this.bldgFullSlider = root.querySelector('[data-ctrl="bldg-full"]')!;
    this.bldgFullVal = root.querySelector('[data-val="bldg-full"]')!;
    this.bldgSizeSlider = root.querySelector('[data-ctrl="bldg-size"]')!;
    this.bldgSizeVal = root.querySelector('[data-val="bldg-size"]')!;
    this.bldgUnitSlider = root.querySelector('[data-ctrl="bldg-unit"]')!;
    this.bldgUnitVal = root.querySelector('[data-val="bldg-unit"]')!;
    this.bldgStatsEl = root.querySelector('[data-role="bldg-stats"]')!;
    this.copyBtn = root.querySelector('[data-action="copy"]')!;

    root.querySelector('[data-action="toggle"]')!.addEventListener("click", () => {
      const collapsed = root.dataset.collapsed === "true";
      root.dataset.collapsed = String(!collapsed);
      this.chevron.textContent = collapsed ? "▾" : "▸";
    });

    const applyGrass = () => {
      let lod1 = Number(this.grassLod1Slider.value);
      let lod2 = Number(this.grassLod2Slider.value);
      if (lod2 < lod1) {
        lod2 = lod1;
        this.grassLod2Slider.value = String(lod2);
      }
      this.grassState = {
        colorizeLod: this.grassColorCheck.checked,
        lod1DistanceMetres: lod1,
        lod2DistanceMetres: lod2,
        maximumDistanceMetres: Number(this.grassMaxSlider.value),
        minimumDensityFraction: Number(this.grassMinDensSlider.value) / 100,
        distanceMode: this.grassModeSelect.value === "center" ? "center" : "edge"
      };
      this.options.readPopulation()?.setGrassLodDebugConfig(this.grassState);
      this.renderLabels();
      this.update();
    };

    for (const el of [
      this.grassColorCheck,
      this.grassModeSelect,
      this.grassLod1Slider,
      this.grassLod2Slider,
      this.grassMaxSlider,
      this.grassMinDensSlider
    ]) {
      el.addEventListener("input", applyGrass);
      el.addEventListener("change", applyGrass);
    }

    const applyBuilding = () => {
      const enterFullUnitPx = Number(this.bldgFullSlider.value);
      const enterDetailSizePx = Number(this.bldgSizeSlider.value);
      const enterDetailUnitPx = Number(this.bldgUnitSlider.value);
      setMasonryLodTuning({
        colorizeLod: this.bldgColorCheck.checked,
        enterFullUnitPx,
        leaveFullUnitPx: Number((enterFullUnitPx * 0.8).toFixed(2)),
        enterDetailSizePx,
        leaveDetailSizePx: Number((enterDetailSizePx * 0.75).toFixed(2)),
        enterDetailUnitPx,
        leaveDetailUnitPx: Number((enterDetailUnitPx * 0.75).toFixed(2))
      });
      this.renderLabels();
      this.update();
    };

    for (const el of [this.bldgColorCheck, this.bldgFullSlider, this.bldgSizeSlider, this.bldgUnitSlider]) {
      el.addEventListener("input", applyBuilding);
      el.addEventListener("change", applyBuilding);
    }

    root.querySelector('[data-preset="default"]')!.addEventListener("click", () => {
      this.bldgFullSlider.value = String(DEFAULT_MASONRY_LOD_TUNING.enterFullUnitPx);
      this.bldgSizeSlider.value = String(DEFAULT_MASONRY_LOD_TUNING.enterDetailSizePx);
      this.bldgUnitSlider.value = String(DEFAULT_MASONRY_LOD_TUNING.enterDetailUnitPx);
      applyBuilding();
    });
    root.querySelector('[data-preset="legacy"]')!.addEventListener("click", () => {
      this.bldgFullSlider.value = "14";
      this.bldgSizeSlider.value = "32";
      this.bldgUnitSlider.value = "0.85";
      applyBuilding();
    });

    root.querySelector('[data-action="reset"]')!.addEventListener("click", () => {
      this.grassColorCheck.checked = false;
      this.grassModeSelect.value = "edge";
      this.grassLod1Slider.value = String(GRASS_DETAIL_LOD1_DISTANCE_METRES);
      this.grassLod2Slider.value = String(GRASS_DETAIL_LOD2_DISTANCE_METRES);
      this.grassMaxSlider.value = "60";
      this.grassMinDensSlider.value = "25";
      applyGrass();

      this.bldgColorCheck.checked = false;
      this.bldgFullSlider.value = String(DEFAULT_MASONRY_LOD_TUNING.enterFullUnitPx);
      this.bldgSizeSlider.value = String(DEFAULT_MASONRY_LOD_TUNING.enterDetailSizePx);
      this.bldgUnitSlider.value = String(DEFAULT_MASONRY_LOD_TUNING.enterDetailUnitPx);
      applyBuilding();
    });

    this.copyBtn.addEventListener("click", () => {
      const m = getMasonryLodTuning();
      const projScale = this.currentProjectionScale();
      const payload = {
        grass: { ...this.grassState },
        building: {
          enterFullUnitPx: m.enterFullUnitPx,
          leaveFullUnitPx: m.leaveFullUnitPx,
          enterDetailSizePx: m.enterDetailSizePx,
          leaveDetailSizePx: m.leaveDetailSizePx,
          enterDetailUnitPx: m.enterDetailUnitPx,
          leaveDetailUnitPx: m.leaveDetailUnitPx,
          approxMetresAtCurrentViewport: {
            lod0To1: Math.round((0.3 * projScale) / m.enterFullUnitPx),
            lod1To2_size12m: Math.round((12 * projScale) / m.enterDetailSizePx),
            lod1To2_unit03m: Math.round((0.3 * projScale) / m.enterDetailUnitPx)
          }
        }
      };
      void navigator.clipboard.writeText(JSON.stringify(payload, null, 2)).then(
        () => {
          this.copyBtn.textContent = "已复制参数";
          setTimeout(() => (this.copyBtn.textContent = "复制当前 LOD 参数"), 1500);
        },
        () => {
          this.copyBtn.textContent = "复制失败";
        }
      );
    });

    this.options.host.append(root);
    this.renderLabels();
  }

  private currentProjectionScale(): number {
    const pixelHeight = this.options.engine.canvas.height * this.options.camera.viewport.w;
    return Math.abs(this.options.camera.projectionMatrix.elements[5]) * pixelHeight * 0.5;
  }

  private renderLabels(): void {
    this.grassLod1Val.textContent = `${this.grassState.lod1DistanceMetres} m`;
    this.grassLod2Val.textContent = `${this.grassState.lod2DistanceMetres} m`;
    this.grassMaxVal.textContent = `${this.grassState.maximumDistanceMetres} m`;
    this.grassMinDensVal.textContent = `${Math.round(this.grassState.minimumDensityFraction * 100)}%`;

    const m = getMasonryLodTuning();
    const scale = this.currentProjectionScale();
    const d0 = Math.round((0.3 * scale) / m.enterFullUnitPx);
    const d1Size = Math.round((12 * scale) / m.enterDetailSizePx);
    const d1Unit = Math.round((0.3 * scale) / m.enterDetailUnitPx);
    this.bldgFullVal.textContent = `${m.enterFullUnitPx}px (≈${d0}m)`;
    this.bldgSizeVal.textContent = `${m.enterDetailSizePx}px (12m≈${d1Size}m)`;
    this.bldgUnitVal.textContent = `${m.enterDetailUnitPx.toFixed(1)}px (≈${d1Unit}m)`;
  }

  update(): void {
    const pop = this.options.readPopulation();
    if (pop && pop !== this.lastPopulation) {
      this.lastPopulation = pop;
      pop.setGrassLodDebugConfig(this.grassState);
    }
    if (pop) {
      const g = pop.getGrassLodDiagnostics();
      const totalTris = g.lod0.triangles + g.lod1.triangles + g.lod2.triangles;
      this.grassStatsEl.innerHTML =
        `<span class="lod-dot lod-dot--0"></span>L0: ${g.lod0.batches}批 / ${formatCompact(g.lod0.instances)} / ${formatCompact(g.lod0.triangles)}面<br>` +
        `<span class="lod-dot lod-dot--1"></span>L1: ${g.lod1.batches}批 / ${formatCompact(g.lod1.instances)} / ${formatCompact(g.lod1.triangles)}面<br>` +
        `<span class="lod-dot lod-dot--2"></span>L2: ${g.lod2.batches}批 / ${formatCompact(g.lod2.instances)} / ${formatCompact(g.lod2.triangles)}面 · 共 ${formatCompact(totalTris)}面`;
    }

    const mm = this.options.readMasonryMetrics();
    if (mm) {
      const lod2Count = Math.max(0, mm.buildings - mm.detailReady);
      this.bldgStatsEl.innerHTML =
        `<span class="lod-dot lod-dot--0"></span>L0: ${mm.nearReady}栋 · ` +
        `<span class="lod-dot lod-dot--1"></span>L1: ${mm.mediumReady}栋 · ` +
        `<span class="lod-dot lod-dot--2"></span>L2: ${lod2Count}栋 · ` +
        `活跃 ${formatCompact(mm.triangles)}面`;
    }
    this.renderLabels();
  }

  dispose(): void {
    this.element.remove();
  }
}
