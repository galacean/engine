import type { Camera, Engine } from "@galacean/engine";
import {
  DEFAULT_MASONRY_LOD_TUNING,
  getMasonryLodTuning,
  setMasonryLodTuning
} from "@galacean/engine-building/building/runtime/MasonryLodPolicy";
import type { DebugInspectorPanelHost } from "@galacean/engine-terrain/terrain/debug/DebugInspector";
import {
  GRASS_DETAIL_LOD1_DISTANCE_METRES,
  GRASS_DETAIL_LOD2_DISTANCE_METRES,
  GRASS_DETAIL_MAXIMUM_DISTANCE_METRES,
  GRASS_DETAIL_MINIMUM_DENSITY_FRACTION,
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

export interface SeedWorldLodDebugOptions {
  readonly grassHost: DebugInspectorPanelHost;
  readonly buildingHost: DebugInspectorPanelHost;
  readonly engine: Engine;
  readonly camera: Camera;
  readonly readPopulation: () => SeedWorldPopulationRuntime | undefined;
  readonly readMasonryMetrics: () => MasonryMetricsLike | undefined;
}

function formatCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(Math.round(n));
}

/**
 * Mounts non-duplicate Grass LOD & Masonry Building LOD controls directly into
 * the unified dat.gui inspector (`Grass & Vegetation` and `Buildings` categories).
 */
export class SeedWorldLodDebugPanel {
  private lastPopulation?: SeedWorldPopulationRuntime;
  private grassState: GrassLodDebugConfig = {
    colorizeLod: false,
    lod1DistanceMetres: GRASS_DETAIL_LOD1_DISTANCE_METRES,
    lod2DistanceMetres: GRASS_DETAIL_LOD2_DISTANCE_METRES,
    maximumDistanceMetres: GRASS_DETAIL_MAXIMUM_DISTANCE_METRES,
    minimumDensityFraction: GRASS_DETAIL_MINIMUM_DENSITY_FRACTION,
    distanceMode: "edge"
  };

  private readonly grassModel = {
    colorizeLod: false,
    distanceMode: "edge",
    lod1DistanceMetres: GRASS_DETAIL_LOD1_DISTANCE_METRES,
    lod2DistanceMetres: GRASS_DETAIL_LOD2_DISTANCE_METRES,
    maximumDistanceMetres: GRASS_DETAIL_MAXIMUM_DISTANCE_METRES,
    minimumDensityPercent: Math.round(GRASS_DETAIL_MINIMUM_DENSITY_FRACTION * 100)
  };

  private readonly buildingModel = {
    colorizeLod: false,
    enterFullUnitPx: DEFAULT_MASONRY_LOD_TUNING.enterFullUnitPx,
    enterDetailSizePx: DEFAULT_MASONRY_LOD_TUNING.enterDetailSizePx,
    enterDetailUnitPx: DEFAULT_MASONRY_LOD_TUNING.enterDetailUnitPx
  };

  private readonly setGrassStats: (value: string) => void;
  private readonly setBuildingStats: (value: string) => void;
  private readonly setBuildingDistanceHint: (value: string) => void;

  constructor(private readonly options: SeedWorldLodDebugOptions) {
    const { grassHost, buildingHost } = options;

    // 1. Grass LOD subfolder inside "Grass & Vegetation / 草地与植被"
    const grassFolder = grassHost.folder("Grass LOD / 草地 LOD 调试", false);
    const applyGrass = () => {
      if (this.grassModel.lod2DistanceMetres < this.grassModel.lod1DistanceMetres) {
        this.grassModel.lod2DistanceMetres = this.grassModel.lod1DistanceMetres;
        grassFolder.updateDisplay();
      }
      this.grassState = {
        colorizeLod: this.grassModel.colorizeLod,
        lod1DistanceMetres: this.grassModel.lod1DistanceMetres,
        lod2DistanceMetres: this.grassModel.lod2DistanceMetres,
        maximumDistanceMetres: this.grassModel.maximumDistanceMetres,
        minimumDensityFraction: this.grassModel.minimumDensityPercent / 100,
        distanceMode: this.grassModel.distanceMode === "center" ? "center" : "edge"
      };
      this.options.readPopulation()?.setGrassLodDebugConfig(this.grassState);
      this.update();
    };

    grassFolder.add(this.grassModel, "colorizeLod").name("Colorize LOD / 按 LOD 着色").onChange(applyGrass);
    grassFolder
      .add(this.grassModel, "distanceMode", { "最近边 (默认)": "edge", 分块中心: "center" })
      .name("Distance mode / 测距基准")
      .onChange(applyGrass);
    grassFolder
      .add(this.grassModel, "lod1DistanceMetres", 0, 60, 1)
      .name("LOD0 → LOD1 (m)")
      .onChange(applyGrass);
    grassFolder
      .add(this.grassModel, "lod2DistanceMetres", 0, 80, 1)
      .name("LOD1 → LOD2 (m)")
      .onChange(applyGrass);
    grassFolder
      .add(this.grassModel, "maximumDistanceMetres", 15, 90, 1)
      .name("Max distance / 最大绘制 (m)")
      .onChange(applyGrass);
    grassFolder
      .add(this.grassModel, "minimumDensityPercent", 0, 100, 5)
      .name("Min density / 远距密度 (%)")
      .onChange(applyGrass);
    this.setGrassStats = grassHost.addReadout(grassFolder, "Grass LOD 统计 (绿L0/黄L1/红L2)");
    grassHost.addAction(grassFolder, "重置草地 LOD", () => {
      this.grassModel.colorizeLod = false;
      this.grassModel.distanceMode = "edge";
      this.grassModel.lod1DistanceMetres = GRASS_DETAIL_LOD1_DISTANCE_METRES;
      this.grassModel.lod2DistanceMetres = GRASS_DETAIL_LOD2_DISTANCE_METRES;
      this.grassModel.maximumDistanceMetres = GRASS_DETAIL_MAXIMUM_DISTANCE_METRES;
      this.grassModel.minimumDensityPercent = Math.round(GRASS_DETAIL_MINIMUM_DENSITY_FRACTION * 100);
      grassFolder.updateDisplay();
      applyGrass();
    });
    grassHost.refreshLayout();

    // 2. Building LOD subfolder inside "Buildings / 建筑"
    const bldgFolder = buildingHost.folder("Building LOD / 建筑 LOD 调试", false);
    const applyBuilding = () => {
      const { enterFullUnitPx, enterDetailSizePx, enterDetailUnitPx, colorizeLod } = this.buildingModel;
      setMasonryLodTuning({
        colorizeLod,
        enterFullUnitPx,
        leaveFullUnitPx: Number((enterFullUnitPx * 0.8).toFixed(2)),
        enterDetailSizePx,
        leaveDetailSizePx: Number((enterDetailSizePx * 0.75).toFixed(2)),
        enterDetailUnitPx,
        leaveDetailUnitPx: Number((enterDetailUnitPx * 0.75).toFixed(2))
      });
      this.update();
    };

    bldgFolder.add(this.buildingModel, "colorizeLod").name("Colorize LOD / 按 LOD 着色").onChange(applyBuilding);
    bldgFolder
      .add(this.buildingModel, "enterFullUnitPx", 6, 40, 1)
      .name("LOD0 → LOD1 (0.3m 砖px)")
      .onChange(applyBuilding);
    bldgFolder
      .add(this.buildingModel, "enterDetailSizePx", 16, 480, 2)
      .name("LOD1 → LOD2 (总px)")
      .onChange(applyBuilding);
    bldgFolder
      .add(this.buildingModel, "enterDetailUnitPx", 0.5, 12.0, 0.1)
      .name("LOD1 → LOD2 (0.3m 砖px)")
      .onChange(applyBuilding);
    this.setBuildingDistanceHint = buildingHost.addReadout(bldgFolder, "等效距离估算");
    this.setBuildingStats = buildingHost.addReadout(bldgFolder, "建筑 LOD 统计");
    buildingHost.addAction(
      bldgFolder,
      `默认预设 (${DEFAULT_MASONRY_LOD_TUNING.enterDetailSizePx} / ${DEFAULT_MASONRY_LOD_TUNING.enterDetailUnitPx})`,
      () => {
        this.buildingModel.enterFullUnitPx = DEFAULT_MASONRY_LOD_TUNING.enterFullUnitPx;
        this.buildingModel.enterDetailSizePx = DEFAULT_MASONRY_LOD_TUNING.enterDetailSizePx;
        this.buildingModel.enterDetailUnitPx = DEFAULT_MASONRY_LOD_TUNING.enterDetailUnitPx;
        bldgFolder.updateDisplay();
        applyBuilding();
      }
    );
    buildingHost.addAction(bldgFolder, "原始预设 (32 / 0.85)", () => {
      this.buildingModel.enterFullUnitPx = 14;
      this.buildingModel.enterDetailSizePx = 32;
      this.buildingModel.enterDetailUnitPx = 0.85;
      bldgFolder.updateDisplay();
      applyBuilding();
    });
    const copyBtn = buildingHost.addAction(bldgFolder, "复制当前 LOD 参数", () => {
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
          copyBtn.textContent = "已复制参数";
          setTimeout(() => (copyBtn.textContent = "复制当前 LOD 参数"), 1500);
        },
        () => {
          copyBtn.textContent = "复制失败";
        }
      );
    });
    buildingHost.addAction(bldgFolder, "重置建筑 LOD", () => {
      this.buildingModel.colorizeLod = false;
      this.buildingModel.enterFullUnitPx = DEFAULT_MASONRY_LOD_TUNING.enterFullUnitPx;
      this.buildingModel.enterDetailSizePx = DEFAULT_MASONRY_LOD_TUNING.enterDetailSizePx;
      this.buildingModel.enterDetailUnitPx = DEFAULT_MASONRY_LOD_TUNING.enterDetailUnitPx;
      bldgFolder.updateDisplay();
      applyBuilding();
    });
    buildingHost.refreshLayout();
  }

  private currentProjectionScale(): number {
    const pixelHeight = this.options.engine.canvas.height * this.options.camera.viewport.w;
    return Math.abs(this.options.camera.projectionMatrix.elements[5]) * pixelHeight * 0.5;
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
      this.setGrassStats(
        `L0: ${g.lod0.batches}批 / ${formatCompact(g.lod0.instances)} / ${formatCompact(g.lod0.triangles)}面\n` +
          `L1: ${g.lod1.batches}批 / ${formatCompact(g.lod1.instances)} / ${formatCompact(g.lod1.triangles)}面\n` +
          `L2: ${g.lod2.batches}批 / ${formatCompact(g.lod2.instances)} / ${formatCompact(g.lod2.triangles)}面 · 共 ${formatCompact(totalTris)}面`
      );
    }

    const m = getMasonryLodTuning();
    const scale = this.currentProjectionScale();
    const d0 = Math.round((0.3 * scale) / m.enterFullUnitPx);
    const d1Size = Math.round((12 * scale) / m.enterDetailSizePx);
    const d1Unit = Math.round((0.3 * scale) / m.enterDetailUnitPx);
    this.setBuildingDistanceHint(`L0→L1 ≈${d0}m · L1→L2(12m) ≈${d1Size}m · L1→L2(砖) ≈${d1Unit}m`);

    const mm = this.options.readMasonryMetrics();
    if (mm) {
      const lod2Count = Math.max(0, mm.buildings - mm.detailReady);
      this.setBuildingStats(
        `L0: ${mm.nearReady}栋 · L1: ${mm.mediumReady}栋 · L2: ${lod2Count}栋 · 活跃 ${formatCompact(mm.triangles)}面`
      );
    }
  }

  dispose(): void {
    // Folders belong to the dat.gui inspector lifecycle and are destroyed with it.
  }
}
