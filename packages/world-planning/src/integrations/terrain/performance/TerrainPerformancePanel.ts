import type { Engine } from "@galacean/engine";
import type { FarmingWorldPresentation } from "@galacean/engine-farming/farming/presentation/FarmingWorldPresentation";
import {
  TerrainRenderSubmissionMonitor,
  type TerrainRenderSubmissionSnapshot
} from "@galacean/engine-terrain/terrain/performance/TerrainRenderSubmissionMonitor";

const PANEL_ID = "terrain-performance-panel";
const STYLE_ID = "terrain-performance-panel-style";
const BYTES_PER_MEGABYTE = 1024 * 1024;
const FRAME_SAMPLE_COUNT = 120;
const SUBMISSION_SAMPLE_FRAME_COUNT = 12;

type PanelState = "expanded" | "collapsed" | "hidden";

interface WebGLEngineInternals {
  readonly _hardwareRenderer: {
    readonly gl: WebGLRenderingContext | WebGL2RenderingContext;
  };
}

interface WebCanvasInternals {
  readonly _webCanvas: HTMLCanvasElement | OffscreenCanvas;
}

interface PerformanceMemorySource {
  readonly memory?: {
    readonly usedJSHeapSize: number;
  };
}

interface MetricDefinition {
  readonly key: string;
  readonly label: string;
  readonly title: string;
}

const FARM_METRICS: readonly MetricDefinition[] = [
  metric(
    "farmSoil",
    "Farm soil / 耕地",
    "层级启用格数/总格数，启用分块/总分块。4×4 分块数是结构指标，不等同实际 Draw Calls。"
  ),
  metric(
    "farmMature",
    "Mature sharing / 成熟共享",
    "借用成熟共享几何的株数/成熟目标株数及不同共享主网格组数；共享组数不等同实际绘制次数。"
  ),
  metric(
    "farmScheduling",
    "Crop CPU / 作物调度",
    "采样区间内，创建队列与生长调度的累计 CPU 毫秒除以更新帧数，并显示待创建任务数；不包含农场模拟、其他表现或 GPU 时间。"
  )
];
const METRICS: readonly MetricDefinition[] = [
  metric("fps", "FPS / 帧率", "最近一秒动画帧回调的平均每秒帧数。"),
  metric("frameP95", "Frame P95 / 帧耗", "最近 120 帧中 95% 的帧耗不超过该毫秒值。"),
  metric("jsMemory", "JS heap / JS 堆", "浏览器可用时报告已使用的 JavaScript 堆内存。"),
  metric("gpuMemory", "GPU memory / GPU 内存", "引擎追踪的纹理与缓冲总内存。"),
  metric("renderTarget", "Render target / 渲染分辨率", "实际 drawing buffer 分辨率与有效 DPR。"),
  metric("msaa", "MSAA / 多重采样", "相机渲染目标的多重采样数。"),
  metric("postProcess", "Post process / 后处理", "相机是否执行当前 Scene 的后处理配置。"),
  metric(
    "screenSpaceReflection",
    "SSR demand / SSR 按需",
    "SSR 是否由 Water 或 Terrain 水膜实际请求，以及当前接收 Pass 绘制数和资源占用。"
  ),
  metric("drawCalls", "Draw calls / 绘制调用", "平均每帧实际提交到图形接口的绘制调用。"),
  metric("instancedDrawCalls", "Instanced draws / 实例绘制", "平均每帧实例绘制调用数。"),
  metric("submittedInstances", "GPU instances / GPU 实例", "平均每帧实例绘制的实例总数。"),
  metric("submittedTriangles", "Submitted tris / 提交三角形", "平均每帧实例加权后的三角形提交量。"),
  metric("clipmap", "Clipmap / 地形", "当前 Clipmap 常驻网格区块与激活 Region 数。"),
  metric("details", "Details / 细节", "当前常驻 Detail 实例、可见实例与 renderer 批次数。"),
  metric("detailCulling", "Detail culling / 细节剔除", "最近主相机帧剔除的 Detail 实例与提交 draw 数。"),
  metric("trees", "Trees / 树木", "当前树实例与逐实例 LODGroup 数。"),
  metric(
    "treeRendererOcclusion",
    "Occluded renderers / 遮挡实例",
    "视锥相交 Cell 中被地形 Horizon 省略的树木/灌木候选实例，并分别归因到 Parent Cell 与 SubCell。"
  ),
  metric(
    "treeOcclusion",
    "World Horizon / 地形遮挡",
    "World 共享 Horizon 的构建状态，以及 Population Parent Cell 与二级 SubCell 的命中数和判断耗时。"
  ),
  metric("prefabs", "Prefabs / 场景物件", "当前场景物件实例与逐实例 LODGroup 数。"),
  metric(
    "exactSpatial",
    "Exact Cell / 精确实例",
    "精确 Prefab 的空间模式、Cell、候选实例、Terrain Horizon 剔除、LOD 更新和 CPU 耗时。"
  ),
  metric(
    "water",
    "Water / 水体",
    "当前水体可见性、运行时区块数，以及有限水体的整块与实际水面区域 Terrain Horizon 剔除。"
  ),
  ...FARM_METRICS,
  metric("webgl", "WebGL / 图形接口", "当前 WebGL 上下文版本。")
];

export type TerrainFarmingPerformanceMetrics = ReturnType<FarmingWorldPresentation["getPerformanceDiagnostics"]>;

/** Interval counters are scoped to one presenter; replacement and disabled sampling start a new baseline. */
export class TerrainFarmingCpuSampler {
  private previous?: { sourceId: number; frames: number; cpu: number };
  reset(): void {
    this.previous = undefined;
  }
  sample(farm: TerrainFarmingPerformanceMetrics | undefined) {
    if (!farm) {
      this.reset();
      return null;
    }
    const current = {
      sourceId: farm.sourceId,
      frames: farm.crops.schedulingFrames,
      cpu: farm.crops.schedulingMilliseconds
    };
    const previous = this.previous;
    this.previous = current;
    if (
      !previous ||
      current.sourceId !== previous.sourceId ||
      current.frames < previous.frames ||
      current.cpu < previous.cpu
    )
      return null;
    return current.frames > previous.frames ? (current.cpu - previous.cpu) / (current.frames - previous.frames) : 0;
  }
}

/**
 * Scene-specific values appended to the common engine statistics.
 */
export interface TerrainPerformanceSceneMetrics {
  /** Optional farm diagnostics, sampled by debug hosts only while expanded. */
  readonly farming?: TerrainFarmingPerformanceMetrics;
  /** Number of geometry-clipmap segments managed by the terrain runtime. */
  readonly clipmapSegments: number;
  /** Complete active Clipmap topology before view and shadow culling. */
  readonly clipmapTriangles?: number;
  /** Number of Regions currently bound to the Clipmap. */
  readonly activeRegions?: number;
  /** Resident canonical Detail instances. */
  readonly detailInstances?: number;
  /** Current Detail renderer batches. */
  readonly detailBatches?: number;
  /** Detail instances accepted by the latest completed main-camera frame. */
  readonly visibleDetailInstances?: number;
  /** Detail instances rejected by the latest completed main-camera frame. */
  readonly culledDetailInstances?: number;
  /** Instanced Detail draws submitted by the latest completed main-camera frame. */
  readonly detailDraws?: number;
  /** Current canonical tree instances. */
  readonly treeInstances?: number;
  /** Tree instances driven by authored LODGroup metadata. */
  readonly treeLodGroups?: number;
  /** Frustum-visible sparse vegetation Cells tested by the CPU terrain horizon. */
  readonly treeOcclusionTestedCells?: number;
  /** Sparse vegetation Cells omitted after conservative terrain-occlusion confirmation. */
  readonly treeOccludedCells?: number;
  /** Non-empty sparse vegetation SubCells tested after their Parent Cell was retained. */
  readonly treeOcclusionTestedSubCells?: number;
  /** Sparse vegetation SubCells omitted after conservative terrain-occlusion confirmation. */
  readonly treeOccludedSubCells?: number;
  /** Tree and shrub renderer instances belonging to frustum-intersecting candidate Cells. */
  readonly treeOcclusionTestedRenderers?: number;
  /** Candidate renderer instances omitted at either Parent Cell or SubCell level. */
  readonly treeOccludedRenderers?: number;
  /** Candidate renderer instances omitted by complete Parent Cell occlusion. */
  readonly treeParentOccludedRenderers?: number;
  /** Parent-retained candidate renderer instances tested at the SubCell level. */
  readonly treeSubCellTestedRenderers?: number;
  /** Candidate renderer instances additionally omitted by SubCell occlusion. */
  readonly treeSubCellOccludedRenderers?: number;
  /** CPU milliseconds spent evaluating Parent Cell and SubCell visibility in the latest pass. */
  readonly treeOcclusionEvaluationMilliseconds?: number;
  /** CPU milliseconds spent evaluating Parent Cell visibility in the latest pass. */
  readonly treeParentOcclusionEvaluationMilliseconds?: number;
  /** CPU milliseconds spent evaluating SubCell visibility in the latest pass. */
  readonly treeSubCellOcclusionEvaluationMilliseconds?: number;
  /** Peak CPU milliseconds of one slice in the current or latest terrain Horizon build. */
  readonly treeOcclusionMilliseconds?: number;
  /** Sector count belonging to the reported peak Horizon build slice. */
  readonly treeOcclusionPeakBuildSectors?: number;
  /** CPU milliseconds spent by the latest completed Horizon slice. */
  readonly treeOcclusionBuildSliceMilliseconds?: number;
  /** Whether a complete terrain Horizon was atomically published in the latest population frame. */
  readonly treeOcclusionHorizonRebuilt?: boolean;
  /** Stable identity of the World that owns the reported Horizon publication count. */
  readonly treeOcclusionHorizonSourceId?: number;
  /** Per-World publication count used to preserve one-frame rebuild events across panel sampling. */
  readonly treeOcclusionHorizonRebuildCount?: number;
  /** Whether a terrain Horizon is currently being built over multiple frames. */
  readonly treeOcclusionBuildPending?: boolean;
  /** Fraction of the current terrain Horizon build completed in the range [0, 1]. */
  readonly treeOcclusionBuildProgress?: number;
  /** Whether a complete terrain Horizon is available for conservative culling. */
  readonly treeOcclusionHorizonReady?: boolean;
  /** Horizon directions completed by the latest adaptive build slice. */
  readonly treeOcclusionBuildSectors?: number;
  /** Exponential moving average of CPU milliseconds required by one Horizon direction. */
  readonly treeOcclusionEstimatedSectorMilliseconds?: number;
  /** Soft CPU budget used to schedule one adaptive Horizon build slice. */
  readonly treeOcclusionBuildBudgetMilliseconds?: number;
  /** Motion-aware Horizon scheduling mode in the current frame. */
  readonly treeOcclusionBuildMode?:
    | "inactive"
    | "bypassed"
    | "view-building"
    | "view-ready"
    | "full-building"
    | "ready";
  /** Number of nearest directions maintained while the camera is translating. */
  readonly treeOcclusionMovingViewSectors?: number;
  /** Latest camera translation speed derived from frame displacement. */
  readonly treeOcclusionCameraSpeedMetresPerSecond?: number;
  /** Shared World Horizon candidate queries reaching the state cache this frame. */
  readonly worldHorizonQueryCount?: number;
  /** Shared candidate queries resolved without repeating bounds projection. */
  readonly worldHorizonQueryCacheHits?: number;
  /** CPU milliseconds spent on non-cached shared bounds projection. */
  readonly worldHorizonQueryEvaluationMilliseconds?: number;
  /** Current canonical placed-Prefab instances. */
  readonly prefabInstances?: number;
  /** Placed-Prefab instances driven by authored LODGroup metadata. */
  readonly prefabLodGroups?: number;
  /** Active exact-Prefab spatial scheduling implementation. */
  readonly exactSpatialMode?: "linear" | "cell";
  /** Configured exact-Prefab horizontal Cell size in metres. */
  readonly exactCellSizeMetres?: number;
  /** Non-empty exact-Prefab Cells built once for the generated world. */
  readonly exactOccupiedCells?: number;
  /** Exact-Prefab instances selected by the latest spatial query. */
  readonly exactCandidateInstances?: number;
  /** Frustum-visible exact-Prefab Cells tested by the shared Terrain Horizon. */
  readonly exactTerrainOcclusionTestedCells?: number;
  /** Exact-Prefab Cells omitted by the shared Terrain Horizon. */
  readonly exactTerrainOccludedCells?: number;
  /** Exact-Prefab instances belonging to Horizon-tested Cells. */
  readonly exactTerrainOcclusionTestedInstances?: number;
  /** Exact-Prefab instances omitted with their complete owning Cell. */
  readonly exactTerrainOccludedInstances?: number;
  /** Exact-Prefab authored LOD observations executed in the latest frame. */
  readonly exactInstanceUpdates?: number;
  /** Whether the latest exact-Prefab frame reused a settled static-camera result. */
  readonly exactStaticReuse?: boolean;
  /** CPU milliseconds spent by exact-Prefab spatial scheduling in the latest frame. */
  readonly exactSpatialMilliseconds?: number;
  /** Camera render-target multisample count. */
  readonly msaaSamples: number;
  /** Whether the camera currently executes its post-process chain. */
  readonly postProcessEnabled: boolean;
  /** Whether consumer-driven SSR is currently requested. */
  readonly screenSpaceReflectionRequested?: boolean;
  /** Whether the SSR pipeline is effective in the latest completed frame. */
  readonly screenSpaceReflectionEffective?: boolean;
  /** Number of independent active Water or Terrain SSR consumer leases. */
  readonly screenSpaceReflectionConsumerLeaseCount?: number;
  /** Consumer whose request currently controls the Camera-wide SSR settings. */
  readonly screenSpaceReflectionSelectedConsumerLabel?: string | null;
  /** Opaque Terrain SSR receiver draws in the latest completed frame. */
  readonly screenSpaceReflectionOpaqueDraws?: number;
  /** Transparent Water SSR receiver draws in the latest completed frame. */
  readonly screenSpaceReflectionTransparentDraws?: number;
  /** Bytes currently estimated for retained SSR render resources. */
  readonly screenSpaceReflectionEstimatedBytes?: number;
  /** Number of configured directional-light shadow cascades. */
  readonly shadowCascadeCount: number;
}

/**
 * Supplies current terrain and surface statistics without coupling the panel to
 * either validation entry.
 *
 * @returns Current scene metrics, or `null` while scene data is still loading.
 */
export type TerrainPerformanceSceneMetricsProvider = () => TerrainPerformanceSceneMetrics | null;

/** Mode-local sampling window used by automated performance acceptance. */
export interface TerrainPerformanceSamplingSnapshot {
  readonly frameSampleCount: number;
  readonly frameP95Milliseconds: number;
  readonly gpuMemoryBytes: number;
  readonly submissions: TerrainRenderSubmissionSnapshot;
}

function metric(key: string, label: string, title: string): MetricDefinition {
  return { key, label, title };
}

/**
 * Preserves short-lived Horizon publication events across slow panel samples.
 * A changed source starts a fresh count domain, so equal counts from two Worlds
 * cannot hide the first publication of the replacement World.
 */
export class TerrainHorizonPublicationTracker {
  private _sourceId: number | undefined;
  private _lastRebuildCount = 0;

  sample(sourceId: number | undefined, rebuildCount: number | undefined, rebuilt: boolean | undefined): boolean {
    if (sourceId !== undefined && sourceId !== this._sourceId) {
      this._sourceId = sourceId;
      this._lastRebuildCount = 0;
    }

    let published = rebuilt === true;
    if (rebuildCount !== undefined) {
      if (rebuildCount > this._lastRebuildCount) published = true;
      this._lastRebuildCount = rebuildCount;
    }
    return published;
  }
}

/**
 * Displays engine, WebGL, clipmap, and surface statistics in a shared foldable
 * overlay.
 */
export class TerrainPerformancePanel {
  /** Notifies scene owners when detailed diagnostic sampling is shown or hidden. */
  onExpandedChanged?: (expanded: boolean) => void;

  private readonly _engine: Engine;
  private readonly _gl: WebGLRenderingContext | WebGL2RenderingContext;
  private readonly _submissionMonitor: TerrainRenderSubmissionMonitor;
  private readonly _root: HTMLElement;
  private readonly _metrics: HTMLDListElement;
  private readonly _launcher: HTMLButtonElement;
  private readonly _toggle: HTMLButtonElement;
  private readonly _webglVersion: string;
  private readonly _values = new Map<string, HTMLElement>();
  private readonly _frameTimes: number[] = [];
  private _lastSubmissions = emptySubmissionSnapshot();
  private _sceneMetrics: TerrainPerformanceSceneMetricsProvider = () => null;
  private _animationFrame = 0;
  private _lastFrameTime = performance.now();
  private _lastPanelUpdate = performance.now();
  private _frameCount = 0;
  private readonly _horizonPublicationTracker = new TerrainHorizonPublicationTracker();
  private readonly _farmSampler = new TerrainFarmingCpuSampler();
  private _state: PanelState = "expanded";

  /** Whether detailed scene metrics are currently visible. */
  get expanded(): boolean {
    return this._state === "expanded";
  }

  /**
   * Creates the panel and starts sampling.
   *
   * @param engine Engine whose WebGL and graphics-memory statistics are observed.
   */
  constructor(engine: Engine) {
    this._engine = engine;
    ensureStyles();
    this._root = createPanelRoot();
    this._metrics = this._root.querySelector<HTMLDListElement>("[data-role='metrics']")!;
    this._launcher = this._root.querySelector<HTMLButtonElement>("[data-action='show']")!;
    this._toggle = this._root.querySelector<HTMLButtonElement>("[data-action='toggle']")!;
    for (const value of this._root.querySelectorAll<HTMLElement>("[data-metric]")) {
      this._values.set(value.dataset.metric!, value);
    }
    this._toggle.addEventListener("click", this._toggleCollapsed);
    this._root.querySelector<HTMLButtonElement>("[data-action='hide']")!.addEventListener("click", this._hide);
    this._launcher.addEventListener("click", this._show);

    const gl = (engine as unknown as WebGLEngineInternals)._hardwareRenderer.gl;
    this._gl = gl;
    this._webglVersion =
      typeof WebGL2RenderingContext !== "undefined" && gl instanceof WebGL2RenderingContext ? "2.0" : "1.0";
    this._submissionMonitor = new TerrainRenderSubmissionMonitor(gl, SUBMISSION_SAMPLE_FRAME_COUNT);
    this._setState("expanded");
    document.body.appendChild(this._root);
    this._animationFrame = requestAnimationFrame(this._update);
    window.addEventListener("beforeunload", this.destroy, { once: true });
  }

  /**
   * Connects scene-specific clipmap and surface values after their runtimes load.
   *
   * @param provider Function returning the current scene metrics.
   */
  setSceneMetricsProvider(provider: TerrainPerformanceSceneMetricsProvider): void {
    this._sceneMetrics = provider;
  }

  /** Clears cross-mode history after a warm-up and starts a fresh isolated sampling window. */
  resetSamplingWindow(): void {
    this._farmSampler.reset();
    const now = performance.now();
    this._frameTimes.length = 0;
    this._frameCount = 0;
    this._lastFrameTime = now;
    this._lastPanelUpdate = now;
    this._lastSubmissions = emptySubmissionSnapshot();
    this._submissionMonitor.stop();
    if (this._state !== "hidden") this._submissionMonitor.start();
  }

  /** Returns only samples collected since the latest reset. */
  getSamplingSnapshot(): Readonly<TerrainPerformanceSamplingSnapshot> {
    return Object.freeze({
      frameSampleCount: this._frameTimes.length,
      frameP95Milliseconds: percentile95(this._frameTimes),
      gpuMemoryBytes: this._engine.renderingStatistics.totalMemory,
      submissions: this._lastSubmissions
    });
  }

  /**
   * Collapses the metric list while keeping the panel header available.
   * @returns Nothing.
   */
  collapse(): void {
    this._setState("collapsed");
  }

  /**
   * Releases WebGL hooks and removes the overlay.
   */
  destroy = (): void => {
    if (!this._animationFrame) return;
    cancelAnimationFrame(this._animationFrame);
    this._animationFrame = 0;
    this._submissionMonitor.stop();
    this.onExpandedChanged?.(false);
    this.onExpandedChanged = undefined;
    this._root.remove();
    window.removeEventListener("beforeunload", this.destroy);
  };

  private readonly _update = (time: number): void => {
    this._submissionMonitor.endFrame();
    const frameTime = time - this._lastFrameTime;
    this._lastFrameTime = time;
    this._frameCount++;
    if (frameTime > 0 && frameTime < 5000) {
      this._frameTimes.push(frameTime);
      if (this._frameTimes.length > FRAME_SAMPLE_COUNT) this._frameTimes.shift();
    }

    const panelInterval = time - this._lastPanelUpdate;
    if (panelInterval >= 1000) {
      if (this._state !== "hidden") {
        const fps = (this._frameCount * 1000) / panelInterval;
        this._setValue("fps", formatFps(fps), fpsLevel(fps));
        this._setValue("frameP95", `${percentile95(this._frameTimes).toFixed(1)} ms`);
        const memory = (performance as unknown as PerformanceMemorySource).memory;
        this._setValue("jsMemory", memory ? `${Math.round(memory.usedJSHeapSize / BYTES_PER_MEGABYTE)} MB` : "—");
        this._setValue("gpuMemory", `${formatMegabytes(this._engine.renderingStatistics.totalMemory)} MB`);
        this._updateRenderTarget();
        this._setValue("webgl", this._webglVersion);
        const scene = this._sceneMetrics();
        if (scene) {
          this._updateSceneMetrics(scene);
          const submissions = this._submissionMonitor.takeSnapshot(scene.shadowCascadeCount);
          if (submissions.sampledFrames > 0) {
            this._lastSubmissions = submissions;
            this._updateSubmissionMetrics(scene, submissions);
          }
          this._submissionMonitor.start();
        }
      }
      this._lastPanelUpdate = time;
      this._frameCount = 0;
    }
    this._animationFrame = requestAnimationFrame(this._update);
  };

  private readonly _toggleCollapsed = (): void => {
    this._setState(this._state === "collapsed" ? "expanded" : "collapsed");
  };

  private readonly _hide = (): void => {
    this._setState("hidden");
  };

  private readonly _show = (): void => {
    this._setState("expanded");
  };

  private _setState(state: PanelState): void {
    const wasExpanded = this.expanded;
    const wasHidden = this._state === "hidden";
    this._state = state;
    if (state === "hidden") this._submissionMonitor.stop();
    else if (wasHidden) {
      this._submissionMonitor.start();
    }
    this._root.dataset.state = state;
    const expanded = state === "expanded";
    if (!expanded) this._farmSampler.reset();
    this._toggle.setAttribute("aria-expanded", String(expanded));
    this._metrics.hidden = !expanded;
    this._launcher.hidden = state !== "hidden";
    if (expanded !== wasExpanded) {
      this.onExpandedChanged?.(expanded);
    }
  }

  private _setValue(key: string, text: string, level?: "good" | "warn" | "bad"): void {
    const value = this._values.get(key);
    if (!value) return;
    value.textContent = text;
    if (level) value.dataset.level = level;
    else delete value.dataset.level;
  }

  private _updateSceneMetrics(scene: TerrainPerformanceSceneMetrics): void {
    this._updateFarmingMetrics(scene.farming);
    const clipmapTriangles =
      scene.clipmapTriangles === undefined ? "" : ` · ${formatCompactCount(scene.clipmapTriangles)} tris`;
    this._setValue(
      "clipmap",
      `${scene.clipmapSegments.toLocaleString("en-US")} segments${clipmapTriangles} · ${scene.activeRegions ?? "—"} Regions`
    );
    this._setValue(
      "details",
      `${formatCompactCount(scene.visibleDetailInstances ?? 0)} / ${formatCompactCount(scene.detailInstances ?? 0)} · ${scene.detailBatches ?? 0} batches`
    );
    this._setValue(
      "detailCulling",
      `${formatCompactCount(scene.culledDetailInstances ?? 0)} culled · ${scene.detailDraws ?? 0} draws`
    );
    this._setValue("trees", `${formatCompactCount(scene.treeInstances ?? 0)} · ${scene.treeLodGroups ?? 0} LOD groups`);
    const horizonPublishedSinceLastSample = this._horizonPublicationTracker.sample(
      scene.treeOcclusionHorizonSourceId,
      scene.treeOcclusionHorizonRebuildCount,
      scene.treeOcclusionHorizonRebuilt
    );
    const horizonStatus = horizonPublishedSinceLastSample
      ? "published"
      : scene.treeOcclusionBuildMode
        ? scene.treeOcclusionBuildMode === "full-building"
          ? `full building ${Math.round((scene.treeOcclusionBuildProgress ?? 0) * 100)}%`
          : scene.treeOcclusionBuildMode
        : scene.treeOcclusionBuildPending
          ? `building ${Math.round((scene.treeOcclusionBuildProgress ?? 0) * 100)}%`
          : scene.treeOcclusionHorizonReady
            ? "reused"
            : "inactive";
    const testedRenderers = scene.treeOcclusionTestedRenderers ?? 0;
    const occludedRenderers = scene.treeOccludedRenderers ?? 0;
    const rendererOcclusionRate = testedRenderers > 0 ? Math.round((occludedRenderers / testedRenderers) * 100) : 0;
    this._setValue(
      "treeRendererOcclusion",
      `${occludedRenderers.toLocaleString("en-US")} / ${testedRenderers.toLocaleString("en-US")} culled · ${rendererOcclusionRate}% · P ${(scene.treeParentOccludedRenderers ?? 0).toLocaleString("en-US")} + S ${(scene.treeSubCellOccludedRenderers ?? 0).toLocaleString("en-US")}`
    );
    this._setValue(
      "treeOcclusion",
      `${scene.treeOccludedCells ?? 0}/${scene.treeOcclusionTestedCells ?? 0} P · ${scene.treeOccludedSubCells ?? 0}/${scene.treeOcclusionTestedSubCells ?? 0} S · ${(scene.treeOcclusionEvaluationMilliseconds ?? 0).toFixed(2)} ms population (P ${(scene.treeParentOcclusionEvaluationMilliseconds ?? 0).toFixed(2)} + S ${(scene.treeSubCellOcclusionEvaluationMilliseconds ?? 0).toFixed(2)}) · cache ${scene.worldHorizonQueryCacheHits ?? 0}/${scene.worldHorizonQueryCount ?? 0} · ${(scene.worldHorizonQueryEvaluationMilliseconds ?? 0).toFixed(3)} ms shared eval · ${(scene.treeOcclusionMilliseconds ?? 0).toFixed(2)} ms peak/${scene.treeOcclusionPeakBuildSectors ?? 0} sectors · ${(scene.treeOcclusionBuildSliceMilliseconds ?? 0).toFixed(2)} ms slice/${scene.treeOcclusionBuildSectors ?? 0} sectors · ${(scene.treeOcclusionEstimatedSectorMilliseconds ?? 0).toFixed(3)} ms/sector EMA · ${(scene.treeOcclusionBuildBudgetMilliseconds ?? 0).toFixed(2)} ms budget · ${scene.treeOcclusionMovingViewSectors ?? 0} view sectors · ${(scene.treeOcclusionCameraSpeedMetresPerSecond ?? 0).toFixed(1)} m/s · ${horizonStatus}`
    );
    this._setValue(
      "prefabs",
      `${formatCompactCount(scene.prefabInstances ?? 0)} · ${scene.prefabLodGroups ?? 0} LOD groups`
    );
    this._setValue(
      "exactSpatial",
      scene.exactSpatialMode
        ? `${scene.exactSpatialMode.toUpperCase()} ${scene.exactCellSizeMetres ?? "—"}m · ${scene.exactOccupiedCells ?? 0} cells · ${scene.exactCandidateInstances ?? 0}/${scene.prefabInstances ?? 0} candidates · terrain ${scene.exactTerrainOccludedCells ?? 0}/${scene.exactTerrainOcclusionTestedCells ?? 0} cells, ${scene.exactTerrainOccludedInstances ?? 0}/${scene.exactTerrainOcclusionTestedInstances ?? 0} instances · ${scene.exactInstanceUpdates ?? 0} updates · ${(scene.exactSpatialMilliseconds ?? 0).toFixed(3)} ms${scene.exactStaticReuse ? " · reused" : ""}`
        : "—"
    );
    this._setValue("msaa", scene.msaaSamples === 1 ? "None · 1×" : `${scene.msaaSamples}×`);
    this._setValue("postProcess", scene.postProcessEnabled ? "On" : "Off");
    this._setValue(
      "screenSpaceReflection",
      `${scene.screenSpaceReflectionEffective ? "Active" : "Off"} · ${scene.screenSpaceReflectionRequested ? "requested" : "idle"} · ${scene.screenSpaceReflectionConsumerLeaseCount ?? 0} leases${scene.screenSpaceReflectionSelectedConsumerLabel ? ` [${scene.screenSpaceReflectionSelectedConsumerLabel}]` : ""} · O ${scene.screenSpaceReflectionOpaqueDraws ?? 0} + T ${scene.screenSpaceReflectionTransparentDraws ?? 0} draws · ${formatMegabytes(scene.screenSpaceReflectionEstimatedBytes ?? 0)} MB`
    );
  }

  private _updateFarmingMetrics(farm: TerrainFarmingPerformanceMetrics | undefined): void {
    for (const definition of FARM_METRICS) {
      const value = this._values.get(definition.key)!;
      value.hidden = !farm;
      (value.previousElementSibling as HTMLElement).hidden = !farm;
    }
    const cpuMs = this._farmSampler.sample(farm);
    if (!farm) return;
    const { crops, soil } = farm;
    this._setValue(
      "farmSoil",
      `${farm.activePlots}/${farm.plots} 格 · ${soil ? `${soil.activeChunks}/${soil.chunks} 批` : "逐格"}`
    );
    this._setValue("farmMature", `${crops.shared}/${crops.mature} 株 · ${crops.sharedMeshes} 组`);
    this._setValue("farmScheduling", `${cpuMs === null ? "采样中" : `${cpuMs.toFixed(2)} ms/f`} · 待 ${crops.queued}`);
  }

  private _updateSubmissionMetrics(
    scene: TerrainPerformanceSceneMetrics,
    submissions: TerrainRenderSubmissionSnapshot
  ): void {
    this._setValue("drawCalls", submissions.drawCalls.toLocaleString("en-US"));
    this._setValue("instancedDrawCalls", submissions.instancedDrawCalls.toLocaleString("en-US"));
    this._setValue("submittedInstances", submissions.instances.toLocaleString("en-US"));
    this._setValue("submittedTriangles", submissions.triangles.toLocaleString("en-US"));
  }

  private _updateRenderTarget(): void {
    const nativeCanvas = (this._engine.canvas as unknown as WebCanvasInternals)._webCanvas;
    const cssWidth = nativeCanvas instanceof HTMLCanvasElement ? nativeCanvas.getBoundingClientRect().width : 0;
    const renderWidth = this._gl.drawingBufferWidth;
    const renderHeight = this._gl.drawingBufferHeight;
    const effectiveDpr = cssWidth > 0 ? renderWidth / cssWidth : 1;
    this._setValue("renderTarget", `${renderWidth}×${renderHeight} · DPR ${effectiveDpr.toFixed(2)}`);
  }
}

function emptySubmissionSnapshot(): TerrainRenderSubmissionSnapshot {
  return Object.freeze({
    sampledFrames: 0,
    drawCalls: 0,
    instancedDrawCalls: 0,
    instances: 0,
    triangles: 0,
    shadowTileSize: 0,
    shadowCascades: Object.freeze([])
  });
}

function createPanelRoot(): HTMLElement {
  const root = document.createElement("section");
  root.id = PANEL_ID;
  root.className = "terrain-performance";
  root.dataset.state = "expanded";
  root.setAttribute("aria-label", "Terrain performance / 地形性能");

  const shell = document.createElement("div");
  shell.className = "terrain-performance__shell";

  const header = document.createElement("header");
  header.className = "terrain-performance__header";

  const toggle = document.createElement("button");
  toggle.className = "terrain-performance__toggle";
  toggle.type = "button";
  toggle.dataset.action = "toggle";
  toggle.setAttribute("aria-controls", `${PANEL_ID}-metrics`);
  toggle.setAttribute("aria-expanded", "false");
  toggle.innerHTML =
    '<span class="terrain-performance__chevron" aria-hidden="true">▾</span>' + "<span>Performance / 性能</span>";

  const hide = document.createElement("button");
  hide.className = "terrain-performance__hide";
  hide.type = "button";
  hide.dataset.action = "hide";
  hide.setAttribute("aria-label", "Hide performance panel / 隐藏性能面板");
  hide.textContent = "×";

  header.append(toggle, hide);
  shell.appendChild(header);

  const metrics = document.createElement("dl");
  metrics.id = `${PANEL_ID}-metrics`;
  metrics.className = "terrain-performance__metrics";
  metrics.dataset.role = "metrics";
  metrics.hidden = true;
  for (const definition of METRICS) {
    const term = document.createElement("dt");
    term.title = definition.title;
    term.textContent = definition.label;
    const value = document.createElement("dd");
    value.dataset.metric = definition.key;
    value.title = definition.title;
    value.textContent = "—";
    if (FARM_METRICS.some((farm) => farm.key === definition.key)) term.hidden = value.hidden = true;
    metrics.append(term, value);
  }
  shell.appendChild(metrics);

  const launcher = document.createElement("button");
  launcher.className = "terrain-performance__launcher";
  launcher.type = "button";
  launcher.dataset.action = "show";
  launcher.setAttribute("aria-label", "Show performance panel / 显示性能面板");
  launcher.innerHTML = '<span aria-hidden="true"></span> PERF / 性能';

  root.append(shell, launcher);
  return root;
}

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
    .terrain-performance {
      --perf-accent: #76e6ae;
      --perf-muted: #aeb7b5;
      position: fixed;
      left: 14px;
      bottom: 14px;
      z-index: 1000;
      width: min(350px, calc(100vw - 28px));
      color: #f1f5f4;
      font: 12px/1.15 ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      letter-spacing: 0.01em;
    }

    .terrain-performance__shell {
      overflow: hidden;
      border: 1px solid rgba(195, 218, 210, 0.26);
      border-radius: 8px;
      background: rgba(13, 17, 16, 0.64);
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2), inset 0 0 0 1px rgba(255, 255, 255, 0.025);
    }

    .terrain-performance__header {
      display: flex;
      align-items: center;
      min-height: 29px;
      border-bottom: 1px solid rgba(195, 218, 210, 0.14);
    }

    .terrain-performance__toggle,
    .terrain-performance__hide,
    .terrain-performance__launcher {
      border: 0;
      color: inherit;
      background: transparent;
      font: inherit;
      cursor: pointer;
    }

    .terrain-performance__toggle {
      display: flex;
      flex: 1;
      align-items: center;
      gap: 6px;
      min-width: 0;
      padding: 6px 9px;
      text-align: left;
      font-weight: 700;
    }

    .terrain-performance__toggle:hover,
    .terrain-performance__toggle:focus-visible {
      color: var(--perf-accent);
      background: rgba(118, 230, 174, 0.07);
      outline: none;
    }

    .terrain-performance__chevron {
      display: inline-block;
      color: var(--perf-accent);
      transition: transform 160ms ease;
    }

    .terrain-performance__hide {
      align-self: stretch;
      min-width: 30px;
      color: var(--perf-muted);
      font-size: 15px;
    }

    .terrain-performance__hide:hover,
    .terrain-performance__hide:focus-visible {
      color: #fff;
      background: rgba(255, 255, 255, 0.08);
      outline: none;
    }

    .terrain-performance__metrics {
      display: grid;
      grid-template-columns: minmax(138px, 1fr) auto;
      gap: 3px 10px;
      max-height: min(62vh, 450px);
      margin: 0;
      padding: 7px 10px 8px;
      overflow-y: auto;
      scrollbar-width: thin;
    }

    .terrain-performance__metrics[hidden] {
      display: none;
    }

    .terrain-performance__metrics dt,
    .terrain-performance__metrics dd {
      min-width: 0;
      margin: 0;
    }

    .terrain-performance__metrics dt {
      overflow: hidden;
      color: #e7ecea;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .terrain-performance__metrics dd {
      max-width: 170px;
      overflow: hidden;
      color: var(--perf-accent);
      text-align: right;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }

    .terrain-performance__metrics dd[data-level="warn"] {
      color: #ffd479;
    }

    .terrain-performance__metrics dd[data-level="bad"] {
      color: #ff8b8b;
    }

    .terrain-performance[data-state="collapsed"] .terrain-performance__header {
      border-bottom: 0;
    }

    .terrain-performance[data-state="collapsed"] .terrain-performance__chevron {
      transform: rotate(-90deg);
    }

    .terrain-performance[data-state="hidden"] {
      width: auto;
    }

    .terrain-performance[data-state="hidden"] .terrain-performance__shell {
      display: none;
    }

    .terrain-performance__launcher {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 30px;
      padding: 6px 9px;
      border: 1px solid rgba(195, 218, 210, 0.26);
      border-radius: 7px;
      background: rgba(13, 17, 16, 0.64);
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.18);
    }

    .terrain-performance__launcher[hidden] {
      display: none;
    }

    .terrain-performance__launcher span {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--perf-accent);
      box-shadow: 0 0 10px rgba(118, 230, 174, 0.78);
    }

    .terrain-performance__launcher:hover,
    .terrain-performance__launcher:focus-visible {
      color: var(--perf-accent);
      transform: translateY(-1px);
      outline: none;
    }

    @media (max-width: 640px), (max-height: 620px) {
      .terrain-performance {
        left: 10px;
        bottom: 10px;
        width: min(310px, calc(100vw - 20px));
        font-size: 11px;
      }

      .terrain-performance__metrics {
        max-height: 46vh;
      }
    }
  `;
  document.head.appendChild(style);
}

function percentile95(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];
}

function formatMegabytes(bytes: number): string {
  return (bytes / BYTES_PER_MEGABYTE).toFixed(1);
}

function formatCompactCount(count: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1
  }).format(count);
}

function fpsLevel(fps: number): "good" | "warn" | "bad" {
  if (fps >= 55) return "good";
  if (fps >= 30) return "warn";
  return "bad";
}

function formatFps(fps: number): string {
  if (fps >= 10) return String(Math.round(fps));
  return fps.toFixed(fps >= 1 ? 1 : 2);
}
