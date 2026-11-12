import { PlanningFarmingControls, type PlanningFarmingControlsOptions } from "../farming/PlanningFarmingControls.ts";
import { PlanningFarmingPanel } from "../farming/PlanningFarmingPanel.ts";
import { PlanningAnimalPanel, type PlanningAnimalPanelOptions } from "./PlanningAnimalPanel.ts";
import { RockFormationPanel } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/Panel";
import type { PlanningParameterCommand, PlanningSession } from "@galacean/engine-world-planning/spatial/PlanningSession";
import type { Camera, Engine, Entity } from "@galacean/engine";
import type { OrbitControl } from "@galacean/engine-toolkit-controls";
import type { EnvironmentAudioRuntime } from "@galacean/engine-terrain/terrain/audio/EnvironmentAudioRuntime";
import { createTerrainRuntimeDebugOwner } from "@galacean/engine-world-planning/integrations/terrain/debug/TerrainRuntimeDebugOwnerFactory";
import {
  applyScreenSpaceReflectionConfiguration,
  inspectScreenSpaceReflectionPanelStatus
} from "@galacean/engine-terrain/terrain/debug/TerrainScreenSpaceReflectionPanel";
import type { WorldEnvironmentRuntime } from "@galacean/engine-world-planning/integrations/terrain/environment/WorldEnvironmentRuntime";
import type { TerrainLightingRuntime } from "@galacean/engine-world-planning/integrations/terrain/lighting/TerrainLightingRuntime";
import {
  TerrainProbeVolumeAuthoring,
  createTerrainProbeVolumeRegionSourceProvider
} from "@galacean/engine-world-planning/integrations/terrain/lighting/TerrainProbeVolumeAuthoring";
import {
  TerrainPerformancePanel,
  type TerrainPerformanceSceneMetrics
} from "@galacean/engine-world-planning/integrations/terrain/performance/TerrainPerformancePanel";
import type { TerrainNavigationRuntime } from "@galacean/engine-terrain/terrain/project/TerrainNavigationRuntime";
import type { TerrainPostProcessRuntime } from "@galacean/engine-terrain/terrain/project/TerrainPostProcessRuntime";
import { mountWaterDevTools } from "@galacean/engine-water/water/devtools/index";
import { decodeSeedWorldHeight, seedWorldOriginX, seedWorldOriginZ } from "@galacean/engine-world-planning/runtime/SeedWorldFields";
import { SEED_WORLD_SURFACE_PALETTE_PRESETS } from "@galacean/engine-vegetation/world/SeedWorldGrassColorField";
import type { PlanningSeedWorldPublished } from "./PlanningSeedWorldSession.ts";
import type { PlanningWaterRuntime } from "@galacean/engine-world-planning/spatial/runtime/PlanningWaterRuntime";
import { PlanningTreeAuthoring, type PlanningTreeAuthoringOptions } from "./PlanningTreeAuthoring";
import { PlanningTreePanel, type PlanningTreePanelState } from "./PlanningTreePanel";

export interface PlanningSeedRuntimeDebugOptions {
  readonly trees?: PlanningTreeAuthoringOptions;
  readonly farming?: PlanningFarmingControlsOptions;
  readonly animals?: Omit<PlanningAnimalPanelOptions, "host">;
  readonly rocks?: {
    readonly planning: PlanningSession;
    apply(commands: PlanningParameterCommand[]): Promise<unknown>;
    grass?: { preview(enabled: boolean): void; diagnostics(): string };
  };
  readonly engine: Engine;
  readonly root: Entity;
  readonly camera: Camera;
  readonly navigation: TerrainNavigationRuntime;
  readonly orbit: OrbitControl;
  readonly lighting: TerrainLightingRuntime;
  readonly post: TerrainPostProcessRuntime;
  readonly environment: WorldEnvironmentRuntime;
  readonly audio?: EnvironmentAudioRuntime;
  readonly water: PlanningWaterRuntime;
  readonly setGrassGroundFusion?: (enabled: boolean) => Promise<unknown>;
  readonly readSolidsRoot: () => Entity | undefined;
  readonly readPublished: () => PlanningSeedWorldPublished | undefined;
}

/** Original Seed debug panels, bound to the planner's published native World rather than another generator. */
export class PlanningSeedRuntimeDebug {
  private readonly owner = createTerrainRuntimeDebugOwner();
  private readonly performance: TerrainPerformancePanel;
  private readonly extensions: { destroy(): void }[] = [];
  private probe?: TerrainProbeVolumeAuthoring;
  private probeRoot?: Entity;
  private world?: PlanningSeedWorldPublished["world"];
  private pending?: Promise<void>;
  private refreshGroundFusion?: () => void;
  private disposed = false;
  private animals?: PlanningAnimalPanel;
  private rocks?: RockFormationPanel;
  private readonly farming?: PlanningFarmingControls;
  private farmingPanel?: PlanningFarmingPanel;
  private readonly treeAuthoring?: PlanningTreeAuthoring;
  private treePanel?: PlanningTreePanel;
  private readonly treePanelState: PlanningTreePanelState = {};
  private understoryPanel?: PlanningTreePanel;
  private readonly understoryPanelState: PlanningTreePanelState = {};

  private constructor(private readonly options: PlanningSeedRuntimeDebugOptions) {
    if (options.trees) this.treeAuthoring = new PlanningTreeAuthoring(options.trees);
    if (options.farming) this.farming = new PlanningFarmingControls(options.farming);
    this.performance = new TerrainPerformancePanel(options.engine);
    this.performance.collapse();
    this.performance.setSceneMetricsProvider(() => this.sceneMetrics());
    this.performance.onExpandedChanged = (expanded) => {
      const world = options.readPublished()?.world;
      if (world) world.terrainOcclusion.profilingEnabled = expanded;
    };
  }

  /** This module is loaded only by the debug entry; production never constructs its panels. */
  static async create(options: PlanningSeedRuntimeDebugOptions): Promise<PlanningSeedRuntimeDebug> {
    const debug = new PlanningSeedRuntimeDebug(options);
    try {
      await debug.synchronize();
      return debug;
    } catch (error) {
      debug.destroy();
      throw error;
    }
  }

  /** Rebinds after a successful publication. Performance sampling always reads the current World directly. */
  async synchronize(): Promise<void> {
    if (this.disposed) return;
    if (this.pending) {
      await this.pending;
      return this.synchronize();
    }
    const published = this.options.readPublished();
    if (!published) return;
    if (published.world === this.world) {
      // Rock-only edits publish a new plan without replacing the native World.
      if (this.options.rocks && published.sourcePlan)
        this.rocks?.synchronize(published.sourcePlan, this.options.rocks.planning.document);
      return;
    }
    const task = this.bind(published).catch((error) => {
      this.releaseSession();
      throw error;
    });
    this.pending = task;
    try {
      await task;
    } finally {
      if (this.pending === task) this.pending = undefined;
    }
  }

  /** Host input arbitration: farm selection and object picking must not consume the same gesture. */
  get farmingPicking(): boolean {
    return this.farming?.state.picking ?? false;
  }

  /** Refresh page-owned debug readouts from the host simulation cadence. */
  refresh(): void {
    this.refreshGroundFusion?.();
    this.treePanel?.refresh();
    this.understoryPanel?.refresh();
    this.rocks?.refreshGrass();
    this.animals?.refresh();
    if (this.farmingPanel) this.farmingPanel.refresh();
    else void this.farming?.refresh();
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.releaseSession();
    this.farming?.destroy();
    this.preserveCamera(() => this.owner.destroy());
    this.performance.destroy();
  }

  private async bind(published: PlanningSeedWorldPublished): Promise<void> {
    this.releaseSession();
    const { world, fields } = published,
      options = this.options;
    let minimum = 65535,
      maximum = 0;
    for (const value of fields.heightSamples) {
      minimum = Math.min(minimum, value);
      maximum = Math.max(maximum, value);
    }
    const minHeight = decodeSeedWorldHeight(fields, minimum),
      maxHeight = decodeSeedWorldHeight(fields, maximum);
    this.probeRoot = options.root.createChild("planning-native-debug-probes");
    this.probe = new TerrainProbeVolumeAuthoring(
      this.probeRoot,
      options.root.scene!,
      options.camera,
      createTerrainProbeVolumeRegionSourceProvider([
        {
          id: "planning-published-terrain",
          worldPosition: [seedWorldOriginX(fields), 0, seedWorldOriginZ(fields)],
          worldSize: [fields.sizeMetres, Math.max(1, maxHeight - minHeight), fields.sizeMetres],
          minimumHeight: minHeight,
          maximumHeight: maxHeight
        }
      ]),
      options.lighting
    );
    const authoredGrassHeight = world.population.grassHeightRangeMetres;
    const authoredGrassDensity = world.population.grassDensityPerSquareMetre;
    const solidsRoot = options.readSolidsRoot();
    // Shared controls initialize navigation. Restore the host's pose and input immediately,
    // including elevated free flight, so mounting diagnostics cannot move the player.
    const creation = this.preserveCamera(() =>
      this.owner.create({
        key: world,
        controls: {
          camera: options.camera,
          navigation: options.navigation,
          orbitControl: options.orbit,
          terrain: world.terrain,
          details: world.population.details,
          trees: world.population.trees,
          ...(solidsRoot ? { prefabs: solidsRoot } : {}),
          lodControls: [world],
          capabilities: { prefabs: { category: "rocks", label: "Planning solids / 规划实体" } }
        },
        inspector: {
          audio: options.audio,
          postProcess: options.post,
          lighting: options.lighting,
          environment: options.environment,
          probeVolume: this.probe!,
          hiddenCameraControls: ["pose", "movementSpeed", "groundCollision", "groundClearance"],
          detailVisibility: {
            isVisible: (category) => world.population.isDetailCategoryVisible(category) &&
              (category === "grass" || (published.vegetation?.understoryVisible ?? true)),
            setVisible: (category, visible) => {
              world.population.setDetailCategoryVisible(category, visible);
              if (category === "flower") published.vegetation?.setUnderstoryVisible(visible);
            }
          },
          surfacePalette: {
            presets: SEED_WORLD_SURFACE_PALETTE_PRESETS,
            getTuning: () => world.getSurfaceColorTuning(),
            setTuning: (tuning) => world.setSurfaceColorTuning(tuning),
            resetTuning: () => world.resetSurfaceColorTuning()
          },
          grassDensity: {
            perSquareMetre: {
              getValue: () => world.population.grassDensityPerSquareMetre,
              setValue: (density) => world.population.setGrassDensityPerSquareMetre(density, true),
              resetValue: () => world.population.setGrassDensityPerSquareMetre(authoredGrassDensity, true)
            },
            distanceLod: {
              getEnabled: () => world.population.grassDensityLodEnabled,
              setEnabled: (enabled) => {
                world.population.setGrassDensityLodEnabled(enabled);
                this.performance.resetSamplingWindow();
              }
            },
            getMultiplier: () => world.population.grassDensityMultiplier,
            setMultiplier: (multiplier) => world.population.setGrassDensityMultiplier(multiplier, true),
            resetMultiplier: () => world.population.setGrassDensityMultiplier(1, true),
            getHeightRangeMetres: () => world.population.grassHeightRangeMetres,
            setHeightRangeMetres: (minimum, maximum) => world.population.setGrassHeightRangeMetres(minimum, maximum),
            resetHeightRange: () =>
              world.population.setGrassHeightRangeMetres(authoredGrassHeight.minimum, authoredGrassHeight.maximum)
          },
          exactInstanceSpatial: {
            getMode: () => world.exactInstanceCells.mode,
            setMode: (mode) => world.setExactInstanceSpatialMode(mode),
            getCellSizeMetres: () => world.exactInstanceCells.cellSizeMetres,
            setCellSizeMetres: (size) => world.setExactInstanceCellSizeMetres(size)
          }
        },
        screenSpaceReflection: {
          // Planning Water exposes per-body looks, not the old aggregate reflection switch.
          // Camera SSR owns the real consumer metrics; absent legacy water readouts stay absent.
          readStatus: () => inspectScreenSpaceReflectionPanelStatus(options.camera),
          applyConfiguration: (configuration) => applyScreenSpaceReflectionConfiguration(options.camera, configuration)
        },
        environment: options.environment
      })
    );
    const session = await creation;
    if (!session || this.disposed) return;
    this.world = world;
    if (options.rocks && published.sourcePlan) {
      this.rocks = new RockFormationPanel(session.inspector.rockFolderHost, options.rocks.apply, options.rocks.grass);
      this.extensions.push(this.rocks);
      this.rocks.synchronize(published.sourcePlan, options.rocks.planning.document);
    }
    if (options.animals) {
      this.animals = new PlanningAnimalPanel({ ...options.animals, host: session.inspector.gameplayFolderHost });
      this.extensions.push(this.animals);
    }
    if (this.farming) {
      this.farmingPanel = new PlanningFarmingPanel(session.inspector.gameplayFolderHost, this.farming);
      this.extensions.push(this.farmingPanel);
    }
    world.terrainOcclusion.profilingEnabled = this.performance.expanded;
    const authoredSandNormals = world.getSandNormalTuning();
    if (authoredSandNormals) {
      const host = session.inspector.terrainFolderHost;
      const folder = host.folder("沙漠法线", true);
      const tuning = { ...authoredSandNormals };
      const apply = () => world.setSandNormalTuning(tuning);
      const controllers = [
        folder.add(tuning, "rippleStrength", 0, 2, 0.01).name("沙纹强度"),
        folder.add(tuning, "rippleTileMetres", 1, 36, 0.1).name("沙纹平铺尺寸（m）"),
        folder.add(tuning, "rippleFadeDistanceMetres", 5, 150, 1).name("沙纹渐隐距离（m）"),
        folder.add(tuning, "microStrength", 0, 2, 0.01).name("微法线强度"),
        folder.add(tuning, "microTileMetres", 0.25, 6, 0.05).name("微法线平铺尺寸（m）"),
        folder.add(tuning, "microFadeDistanceMetres", 2, 40, 1).name("微法线渐隐距离（m）")
      ];
      for (const controller of controllers) controller.onChange(apply);
      host.addAction(folder, "恢复沙漠法线默认值", () => {
        Object.assign(tuning, authoredSandNormals);
        apply();
        for (const controller of controllers) controller.updateDisplay();
      });
      host.refreshLayout();
    }
    const surfaceHost = session.inspector.grassFolderHost;
    const surfaceFolder = surfaceHost.folder("Surface Normals / 地表法线", true);
    const setGrassGroundFusion = options.setGrassGroundFusion;
    if (setGrassGroundFusion) {
      const fusion = { enabled: world.grassGroundFusion };
      const controller = surfaceFolder.add(fusion, "enabled").name("草地与地面融合");
      let pending = false;
      const refresh = () => {
        if (!pending && fusion.enabled !== world.grassGroundFusion) controller.setValue(world.grassGroundFusion);
      };
      this.refreshGroundFusion = refresh;
      controller.onChange(async (value: boolean) => {
        if (pending || value === world.grassGroundFusion) return;
        pending = true;
        try { await setGrassGroundFusion(value); }
        catch (error) { console.warn("[seed-world] grass ground fusion", error); }
        finally { pending = false; if (this.refreshGroundFusion === refresh) refresh(); }
      });
    }
    const surface = { ...world.getSurfaceReliefTuning() };
    const applySurface = (): void => {
      world.setSurfaceReliefTuning(surface);
      refreshGpu();
    };
    surfaceFolder.add(surface, "enabled").name("Cluster normals / 团簇法线").onChange(applySurface);
    surfaceFolder.add(surface, "roadEnabled").name("Road + soil relief / 道路泥土虚拟法线").onChange(applySurface);
    surfaceFolder.add(surface, "maskCoverageStart").name("覆盖起点（0=原生）").onFinishChange(applySurface);
    surfaceFolder.add(surface, "maskSoftnessMetres").name("遮罩柔和范围（m）").onFinishChange(applySurface);
    surfaceHost.addReadout(surfaceFolder, "缓存参数")("CPU 预计算；输入后回车更新，两项为 0 = 原生覆盖，无降采样");
    const gpuReadout = surfaceHost.addReadout(surfaceFolder, "遮罩 + 法线 GPU");
    const refreshGpu = (): void => gpuReadout(
      `共用色块 256² R8 · 独立高度纹理 0 B；原生尺寸遮罩与梯度 RGB8 + 重复法线 256² RGB8 = ${(world.surfaceFieldGpuBytes / 1024 ** 2).toFixed(3)} MiB`
    );
    refreshGpu();
    surfaceHost.addReadout(surfaceFolder, "Coverage / 土草覆盖")("原生栅格 alphamap · 无额外覆盖贴图");
    surfaceHost.refreshLayout();
    if (this.treeAuthoring) {
      this.treePanel = new PlanningTreePanel(session.inspector.treeFolderHost, this.treeAuthoring, this.treePanelState);
      this.extensions.push(this.treePanel);
      this.understoryPanel = new PlanningTreePanel(surfaceHost, this.treeAuthoring, this.understoryPanelState, {
        layers: ["shrubs", "herbs", "cover", "flowers", "litter"],
        title: "Plant appearance / 花草、灌木与菌类外观",
        speciesLabel: "植被物种",
        materialLabel: "植被材质部位",
        colorLabel: "植被基础色"
      });
      this.extensions.push(this.understoryPanel);
      if (this.treePanelState.categoryOpen) session.inspector.treeFolderHost.gui.open();
      if (this.understoryPanelState.categoryOpen) surfaceHost.gui.open();
    }
    if (import.meta.env.DEV)
      this.extensions.push(
        mountWaterDevTools({
          loader: options.water.loader,
          runtime: options.water.system,
          folderHost: session.inspector.waterDevToolsFolderHost
        })
      );
    if (this.treePanelState.categoryOpen || this.understoryPanelState.categoryOpen) session.inspector.gui.open();
    else session.inspector.gui.close();
  }

  private releaseSession(): void {
    this.refreshGroundFusion = undefined;
    if (this.world) this.world.terrainOcclusion.profilingEnabled = false;
    for (const extension of this.extensions.splice(0)) extension.destroy();
    this.treePanel = undefined;
    this.understoryPanel = undefined;
    this.animals = undefined;
    this.rocks = undefined;
    this.farmingPanel = undefined;
    this.preserveCamera(() => this.owner.dispose());
    this.probe?.dispose();
    this.probe = undefined;
    this.probeRoot?.destroy();
    this.probeRoot = undefined;
    this.world = undefined;
  }

  private preserveCamera<T>(operation: () => T): T {
    const { camera, navigation, orbit } = this.options;
    const transform = camera.entity.transform;
    const position = transform.position.clone(),
      rotation = transform.rotationQuaternion.clone();
    const input = navigation.inputEnabled,
      collision = navigation.groundCollision,
      offset = navigation.verticalOffset;
    const orbitEnabled = orbit.enabled,
      minDistance = orbit.minDistance,
      maxDistance = orbit.maxDistance;
    try {
      return operation();
    } finally {
      navigation.groundCollision = collision;
      navigation.setVerticalOffset(offset);
      transform.position.copyFrom(position);
      transform.rotationQuaternion.copyFrom(rotation);
      navigation.synchronizeView();
      navigation.setInputEnabled(input);
      orbit.minDistance = minDistance;
      orbit.maxDistance = maxDistance;
      orbit.enabled = orbitEnabled;
    }
  }

  private sceneMetrics(): TerrainPerformanceSceneMetrics | null {
    const published = this.options.readPublished();
    if (!published || this.disposed) return null;
    const { world } = published,
      { camera, post, water, root } = this.options;
    const accepted = world.population.residentAcceptedCounts;
    const compacted = world.population.detailCompactedCounts;
    const submitted = world.population.submittedCounts;
    const exact = world.getExactInstanceSpatialSnapshot();
    const horizon = world.getTerrainOcclusionDiagnostics();
    const ssr = camera.screenSpaceReflection.metrics;
    const waterDiagnostics = water.getDiagnostics();
    const detailInstances = compacted.grass + compacted.flower;
    const visibleDetailInstances = submitted.grass + submitted.flower;
    const farm = this.performance.expanded ? this.options.farming?.runtime : undefined;
    const farming = farm?.activeArea ? farm.worldPresentation?.getPerformanceDiagnostics() : undefined;
    return {
      farming,
      clipmapSegments: world.clipmap.segmentCount,
      clipmapTriangles: world.clipmap.geometry.fullTopologyTriangles,
      activeRegions: world.clipmap.activeRegionCount,
      detailInstances,
      visibleDetailInstances,
      culledDetailInstances: Math.max(0, detailInstances - visibleDetailInstances),
      detailBatches: world.population.detailBatchCount,
      detailDraws: world.population.detailSubmittedBatchCount,
      treeInstances: accepted.tree + accepted.shrub,
      treeLodGroups: [...world.population.treeSubmittedLodCounts, ...world.population.shrubSubmittedLodCounts].reduce(
        (sum, count) => sum + count,
        0
      ),
      treeOcclusionTestedCells: horizon.testedCellCount,
      treeOccludedCells: horizon.occludedCellCount,
      treeOcclusionTestedSubCells: horizon.testedSubCellCount,
      treeOccludedSubCells: horizon.occludedSubCellCount,
      treeOcclusionTestedRenderers: horizon.testedRendererCount,
      treeOccludedRenderers: horizon.occludedRendererCount,
      treeParentOccludedRenderers: horizon.parentOccludedRendererCount,
      treeSubCellTestedRenderers: horizon.subCellTestedRendererCount,
      treeSubCellOccludedRenderers: horizon.subCellOccludedRendererCount,
      treeOcclusionEvaluationMilliseconds: horizon.visibilityEvaluationMilliseconds,
      treeParentOcclusionEvaluationMilliseconds: horizon.parentEvaluationMilliseconds,
      treeSubCellOcclusionEvaluationMilliseconds: horizon.subCellEvaluationMilliseconds,
      treeOcclusionMilliseconds: horizon.horizonPeakBuildMilliseconds,
      treeOcclusionPeakBuildSectors: horizon.horizonPeakBuildSectorCount,
      treeOcclusionBuildSliceMilliseconds: horizon.horizonLatestBuildMilliseconds,
      treeOcclusionHorizonRebuilt: horizon.horizonRebuilt,
      treeOcclusionHorizonRebuildCount: horizon.horizonRebuildCount,
      treeOcclusionBuildPending: horizon.horizonBuildPending,
      treeOcclusionBuildProgress: horizon.horizonBuildProgress,
      treeOcclusionHorizonReady: horizon.horizonReady,
      treeOcclusionBuildSectors: horizon.horizonLatestBuildSectorCount,
      treeOcclusionEstimatedSectorMilliseconds: horizon.horizonEstimatedSectorMilliseconds,
      treeOcclusionBuildBudgetMilliseconds: horizon.horizonBuildBudgetMilliseconds,
      treeOcclusionBuildMode: horizon.horizonBuildMode,
      treeOcclusionMovingViewSectors: horizon.horizonMovingViewSectorCount,
      treeOcclusionCameraSpeedMetresPerSecond: horizon.cameraTranslationMetresPerSecond,
      worldHorizonQueryCount: horizon.queryCount,
      worldHorizonQueryCacheHits: horizon.queryCacheHitCount,
      worldHorizonQueryEvaluationMilliseconds: horizon.queryEvaluationMilliseconds,
      prefabInstances:
        (world.stones?.placementCount ?? 0) +
        (world.smallRocks?.placementCount ?? 0) +
        world.mushrooms.placementCount +
        world.lotus.placementCount,
      prefabLodGroups:
        (world.stones?.placementCount ?? 0) +
        (world.smallRocks?.placementCount ?? 0) +
        world.mushrooms.placementCount +
        world.lotus.placementCount,
      exactSpatialMode: exact.mode,
      exactCellSizeMetres: exact.cellSizeMetres,
      exactOccupiedCells: exact.occupiedCellCount,
      exactCandidateInstances: exact.candidateInstanceCount,
      exactTerrainOcclusionTestedCells: exact.terrainOcclusionTestedCellCount,
      exactTerrainOccludedCells: exact.terrainOccludedCellCount,
      exactTerrainOcclusionTestedInstances: exact.terrainOcclusionTestedInstanceCount,
      exactTerrainOccludedInstances: exact.terrainOccludedInstanceCount,
      exactInstanceUpdates: exact.instanceUpdateCount,
      exactStaticReuse: exact.reusedStaticCamera,
      exactSpatialMilliseconds: exact.updateMilliseconds,
      waterVisible: waterDiagnostics.visible,
      waterChunks: waterDiagnostics.chunkCount,
      msaaSamples: camera.msaaSamples,
      postProcessEnabled: post.profileEnabled,
      screenSpaceReflectionRequested: ssr.requested,
      screenSpaceReflectionEffective: ssr.effective,
      screenSpaceReflectionConsumerLeaseCount: ssr.activeConsumerLeaseCount,
      screenSpaceReflectionSelectedConsumerLabel: ssr.selectedConsumerLabel,
      screenSpaceReflectionOpaqueDraws: ssr.opaqueSurfacePassDrawCount,
      screenSpaceReflectionTransparentDraws: ssr.transparentSurfacePassDrawCount,
      screenSpaceReflectionEstimatedBytes: ssr.estimatedBytes,
      shadowCascadeCount: root.scene!.shadowCascades
    };
  }
}
