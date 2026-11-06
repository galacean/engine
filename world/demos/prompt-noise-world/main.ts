import * as dat from "dat.gui";
import { OrbitControl } from "@galacean/engine-toolkit-controls";
import {
  Camera,
  type Component,
  DirectLight,
  type Entity,
  Layer,
  ScreenSpaceReflectionQuality,
  Script,
  TonemappingMode,
  type VolumetricCloudQuality,
  Vector3,
  WeatherPresets,
  WebGLEngine,
  WebGLMode
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { TerrainClipmap } from "@galacean/engine-terrain/terrain/clipmap/TerrainClipmap";
import { WorldEnvironmentRuntime } from "@galacean/engine-world-planning/integrations/terrain/environment/WorldEnvironmentRuntime";
import type { TerrainRainImpactSurfaceProvider } from "@galacean/engine-world-planning/integrations/terrain/environment/TerrainRainImpactSurface";
import { TerrainLightingRuntime } from "@galacean/engine-world-planning/integrations/terrain/lighting/TerrainLightingRuntime";
import { loadTerrainScene } from "@galacean/engine-terrain/terrain/loader/TerrainSceneLoader";
import { TerrainNavigationRuntime } from "@galacean/engine-terrain/terrain/project/TerrainNavigationRuntime";
import { TerrainPostProcessRuntime } from "@galacean/engine-terrain/terrain/project/TerrainPostProcessRuntime";
import { TerrainPerformancePanel } from "@galacean/engine-world-planning/integrations/terrain/performance/TerrainPerformancePanel";
import { TerrainProjectClipmapRuntime } from "@galacean/engine-terrain/terrain/project/TerrainProjectClipmapRuntime";
import { TerrainProjectDetailRuntime } from "@galacean/engine-terrain/terrain/project/TerrainProjectDetailRuntime";
import { TerrainProjectPlacedPrefabRuntime } from "@galacean/engine-terrain/terrain/project/TerrainProjectPlacedPrefabRuntime";
import { TerrainProjectTreeRuntime } from "@galacean/engine-terrain/terrain/project/TerrainProjectTreeRuntime";
import { TerrainProjectWorldRuntime } from "@galacean/engine-terrain/terrain/project/TerrainProjectRuntime";
import { TerrainWindRuntime } from "@galacean/engine-terrain/terrain/project/TerrainWindRuntime";
import { TerrainWaterRuntime } from "@galacean/engine-world-planning/integrations/terrain/project/TerrainWaterRuntime";
import { WaterSceneRuntimeHost } from "@galacean/engine-water/water/runtime/index";
import {
  PromptNoiseGenerationWorkerClient,
  type PromptNoiseWorkerMetrics
} from "./src/PromptNoiseGenerationWorkerClient.ts";
import { PromptNoiseDecorationRuntime } from "./src/PromptNoiseDecorationRuntime.ts";
import { PromptNoiseFreeRoamMode } from "./src/PromptNoiseFreeRoamMode.ts";
import {
  PromptNoiseTerrainAuthoring,
  type PromptNoiseAuthoringSnapshotV1,
  type PromptNoiseTargetModeV1
} from "./src/PromptNoiseTerrainAuthoring.ts";
import { PromptNoiseTerrainBinding, type PromptNoiseTerrainFeature } from "./src/PromptNoiseTerrainBinding.ts";
import { PROMPT_NOISE_RIVER_MAX_HALF_WIDTH, PromptNoiseRiverWaterRuntime } from "./src/PromptNoiseRiverWaterRuntime.ts";
import { PromptNoiseWorldRevisionCoordinator } from "./src/PromptNoiseWorldRevisionCoordinator.ts";
import {
  DEFAULT_PROMPT_NOISE_WORLD_RECIPE,
  createPromptNoiseWorldRecipeV3Compatibility,
  migratePromptNoiseWorldCodeV2,
  PromptNoiseTerrainProgram,
  type PromptNoiseOperatorTemplateId,
  type PromptNoiseRiverControlPointV1,
  type PromptNoiseRiverCurveMode,
  type PromptNoiseTerrainOperatorKind,
  type PromptNoiseTerrainBaseV1
} from "@galacean/engine-world-planning/generation/noise/PromptNoiseTerrainProgram";
import "@galacean/engine-world-planning/runtime/script-registry";

const MESH_SIZE = 48;
const MESH_LODS = 7;
const TEXTURE_SOURCE_BYTES = 12_437_816;
const PROMPT_NOISE_RIVER_ENVIRONMENT_PROVIDER_ID = "prompt-noise-river-scene-environment";
const PROMPT_NOISE_RIVER_SSR_CAMERA_SETTINGS = Object.freeze({
  quality: ScreenSpaceReflectionQuality.Medium,
  maxRayDistance: 64,
  thickness: 0.55,
  maxRoughness: 0.7,
  edgeFade: 0.08
});
const DEBUG_VIEWS = Object.freeze({
  最终画面: 0,
  高度: 1,
  坡度: 2,
  "Auto Shader": 3,
  "Macro Variation": 4,
  "Clipmap LOD": 5,
  材质法线: 6,
  阴影衰减: 7,
  "公式 Mask · 选中高亮": 8
});
const TOOL_OPTIONS = Object.freeze({ 曲线河谷: "river", 拍平: "flatten", Smooth: "smooth" });
const TARGET_OPTIONS = Object.freeze({ 镜头中心: "camera", 鼠标位置: "mouse" });
const STRESS_OPTIONS = Object.freeze({ 关闭: 0, "1": 1, "4": 4, "8": 8, "16": 16, "32": 32, "64": 64, "128": 128 });
const SKY_LIGHTING_OPTIONS = Object.freeze({ 晴朗: "clear", 阴天: "overcast", 风暴光照: "storm", 浓雾: "fog" });
const CLOUD_OPTIONS = Object.freeze({ 无云: "clear", 疏云: "scattered", 阴云: "overcast", 密云: "dense" });
const PRECIPITATION_OPTIONS = Object.freeze({ 无降水: "none", 下雨: "rain", 暴雨: "heavyRain", 下雪: "snow" });
const WIND_OPTIONS = Object.freeze({ 无风: "off", 静风: "calm", 和风: "breeze", 强风: "windy", 烈风: "gale" });
const LIGHTNING_OPTIONS = Object.freeze({ 无雷电: "none", 雷暴: "thunderstorm" });
const CAMERA_INTERACTION_HINT =
  "镜头模式：左键 Orbit · Enter 提交　鼠标模式：左键提交 · Alt+左键 Orbit · 右键平移 · 滚轮缩放";
const FREE_ROAM_INTERACTION_HINT = "自由漫游 · 下方 40% 拖动移动 · 上方 60% 拖动视角";
const FREE_ROAM_EDITING_BLOCKED_HINT = "自由漫游中无法编辑算子 · 退出自由漫游后再开启";
const FREE_ROAM_NOTICE_DURATION_MS = 2400;
const WEATHER_TEMPLATES = Object.freeze({
  晴朗: Object.freeze({
    timeHours: 11,
    skyLighting: "clear",
    cloud: "scattered",
    precipitation: "none",
    wind: "breeze",
    lightning: "none"
  }),
  降雨: Object.freeze({
    timeHours: 11,
    skyLighting: "overcast",
    cloud: "overcast",
    precipitation: "rain",
    wind: "windy",
    lightning: "none"
  }),
  降雪: Object.freeze({
    timeHours: 11,
    skyLighting: "overcast",
    cloud: "overcast",
    precipitation: "snow",
    wind: "breeze",
    lightning: "none"
  }),
  暴风雪: Object.freeze({
    timeHours: 11,
    skyLighting: "storm",
    cloud: "dense",
    precipitation: "snow",
    wind: "gale",
    lightning: "none"
  }),
  雷暴: Object.freeze({
    timeHours: 15,
    skyLighting: "storm",
    cloud: "dense",
    precipitation: "heavyRain",
    wind: "gale",
    lightning: "thunderstorm"
  })
});

interface PureNoiseSnapshot {
  readonly ready: boolean;
  readonly dpr: 1;
  readonly renderer: "Geometry Clipmap + analytic FBM + operator texels";
  readonly activeClipmapSegments: number;
  readonly clipmapGeometry: TerrainClipmap["geometry"];
  readonly activeRegionCount: 0;
  readonly heightmapBytes: 0;
  readonly alphamapBytes: 0;
  readonly waterBytes: number;
  readonly generatedInstanceBytes: number;
  readonly terrainLayerCount: 2;
  readonly textureSourceBytes: number;
  readonly logicalOrigin: readonly [x: number, z: number];
  readonly localPosition: readonly [x: number, y: number, z: number];
  readonly frameMilliseconds: number;
  readonly authoring: PromptNoiseAuthoringSnapshotV1;
  readonly lighting: ReturnType<TerrainLightingRuntime["getSnapshot"]>;
  readonly shadowCascade: ReturnType<TerrainLightingRuntime["getShadowCascadeTuning"]>;
  readonly postProcess: ReturnType<TerrainPostProcessRuntime["getDebugSnapshot"]>;
  readonly environment: ReturnType<WorldEnvironmentRuntime["getSnapshot"]>;
  readonly riverWater: ReturnType<PromptNoiseRiverWaterRuntime["getSnapshot"]>;
  readonly waterHost: ReturnType<PromptNoiseRiverWaterRuntime["getHostDiagnostics"]>;
  readonly worldRevision: ReturnType<PromptNoiseWorldRevisionCoordinator["getSnapshot"]>;
  readonly decoration: ReturnType<PromptNoiseDecorationRuntime["getSnapshot"]>;
  readonly freeRoam: {
    readonly active: boolean;
    readonly movementSpeed: number;
    readonly orbitEnabled: boolean;
    readonly viewForward: readonly [x: number, y: number, z: number];
  };
}

interface PureNoiseTeardownSnapshot {
  readonly enginePaused: true;
  readonly authoring: PromptNoiseAuthoringSnapshotV1;
  readonly terrain: ReturnType<PromptNoiseTerrainBinding["getTerrainProgram"]>;
  readonly worker: PromptNoiseWorkerMetrics;
  readonly decoration: ReturnType<PromptNoiseDecorationRuntime["getSnapshot"]>;
  readonly waterHost: ReturnType<PromptNoiseRiverWaterRuntime["getHostDiagnostics"]>;
}

interface PureNoiseDemoApi {
  getSnapshot(): PureNoiseSnapshot;
  setOverview(enabled: boolean): void;
  setFeatureEnabled(feature: PromptNoiseTerrainFeature, enabled: boolean): void;
  setDebugView(debugView: number): void;
  /** Applies the authored directional-shadow switch to light, caster, and receiver state. */
  setShadowsEnabled(enabled: boolean): void;
  /** Freezes the shared Grasslands day/night system at one hour. */
  setTimeHours(timeHours: number): void;
  /** Enables or disables operator drafting and projected outlines. */
  setEditingEnabled(enabled: boolean): void;
  /** Enables or disables flying close-inspection controls. */
  setFreeRoamActive(active: boolean): void;
  /** Changes the base flying speed in metres per second. */
  setFreeRoamSpeed(speed: number): void;
  setTool(tool: PromptNoiseTerrainOperatorKind, templateId: PromptNoiseOperatorTemplateId): void;
  setTargetMode(targetMode: PromptNoiseTargetModeV1): void;
  setParameter(parameter: keyof PromptNoiseTerrainAuthoring["controls"], value: number): void;
  applyDraft(): Promise<void>;
  editOperator(operatorId: number): void;
  deleteOperator(operatorId: number): Promise<void>;
  moveOperator(operatorId: number, direction: -1 | 1): Promise<void>;
  listRiverControlPoints(operatorId: number): readonly PromptNoiseRiverControlPointV1[];
  selectRiverControlPoint(operatorId: number, pointId: number): void;
  previewRiverControlPoint(
    operatorId: number,
    pointId: number,
    patch: Partial<Omit<PromptNoiseRiverControlPointV1, "id">>
  ): void;
  commitRiverControlPointEdit(): Promise<void>;
  insertRiverControlPoint(operatorId: number, afterPointId: number): Promise<void>;
  deleteRiverControlPoint(operatorId: number, pointId: number): Promise<void>;
  setRiverCurveMode(operatorId: number, curveMode: PromptNoiseRiverCurveMode, commit: boolean): Promise<void> | void;
  listRiverNetworks(): ReturnType<PromptNoiseTerrainAuthoring["listRiverNetworks"]>;
  connectRiverConfluence(
    incomingOperatorIds: readonly [number, number],
    outgoingOperatorId: number,
    mergeRadius: number
  ): Promise<void>;
  disconnectRiverNetwork(operatorId: number): Promise<void>;
  undo(): Promise<void>;
  redo(): Promise<void>;
  loadWorldId(worldId: number): Promise<void>;
  importWorld(bytes: Uint8Array): Promise<void>;
  getWorldBytes(): Uint8Array;
  loadWorldCodeV2(worldCode: string): Promise<void>;
  /** Deterministic desktop acceptance hook that still exercises runtime Floating Origin. */
  setCameraLogicalPosition(x: number, z: number): void;
  /** Frames the first active River from a stable elevated three-quarter view. */
  setRiverInspectionView(): boolean;
  /** Frames the C2-D bridge, river-bank rocks, vegetation exclusion, and wet Terrain layer. */
  setRiverCompositionView(): boolean;
  /** Clears cold-start samples before a bounded steady-state acceptance window. */
  resetPerformanceMetrics(): void;
  /** Stops the demo and returns zero-baseline ownership diagnostics for C2-E. */
  destroyForAcceptance(): Promise<PureNoiseTeardownSnapshot>;
}

declare global {
  interface Window {
    promptNoiseWorldDemo?: PureNoiseDemoApi;
    promptNoiseWorldDemoError?: string;
    promptNoiseWorldDemoTeardown?: PureNoiseTeardownSnapshot;
  }
}

class PureNoiseWorldDriver extends Script {
  camera!: Camera;
  orbit!: OrbitControl;
  binding!: PromptNoiseTerrainBinding;
  clipmap!: TerrainClipmap;
  lighting!: TerrainLightingRuntime;
  postProcess!: TerrainPostProcessRuntime;
  environment!: WorldEnvironmentRuntime;
  riverWater!: PromptNoiseRiverWaterRuntime;
  decoration!: PromptNoiseDecorationRuntime;
  freeRoam!: PromptNoiseFreeRoamMode;
  worldCoordinator!: PromptNoiseWorldRevisionCoordinator;
  authoring!: PromptNoiseTerrainAuthoring;
  logicalOrigin: [number, number] = [0, 0];
  frameMilliseconds = 0;
  onSnapshot: ((snapshot: PureNoiseSnapshot) => void) | null = null;

  private _metricsElapsed = Number.POSITIVE_INFINITY;

  override onUpdate(deltaTime: number): void {
    const actualFrameMilliseconds = this.engine.time.actualDeltaTime * 1000;
    this.frameMilliseconds += (actualFrameMilliseconds - this.frameMilliseconds) * 0.08;
    this._applyFloatingOrigin();
    const position = this.camera.entity.transform.position;
    this.binding.setViewPosition(position.x, position.y, position.z);
    this.authoring.update(actualFrameMilliseconds);
    this._metricsElapsed += deltaTime;
    if (this._metricsElapsed >= 0.2) {
      this._metricsElapsed = 0;
      const current = this.snapshot();
      renderMetrics(current);
      this.onSnapshot?.(current);
    }
  }

  /**
   * Applies a repeatable authoring or close-view camera pose.
   * @param enabled Whether to use the overhead authoring pose.
   */
  setOverview(enabled: boolean): void {
    const focusX = enabled ? 0 : 200;
    const focusZ = enabled ? 0 : 200;
    const focusHeight = enabled ? 90 : this.authoring.getProgram().sampleHeight(focusX, focusZ) + 12;
    const target = new Vector3(focusX, focusHeight, focusZ);
    this.camera.entity.transform.setPosition(
      enabled ? 0 : focusX + 48,
      enabled ? 1800 : focusHeight + 34,
      enabled ? 1400 : focusZ + 78
    );
    this.camera.fieldOfView = enabled ? 55 : 50;
    this.orbit.target.copyFrom(target);
    this.camera.entity.transform.lookAt(target);
    const position = this.camera.entity.transform.position;
    this.binding.setViewPosition(position.x, position.y, position.z);
    this.clipmap.snap(this.camera.entity.transform.worldPosition);
    this.authoring?.invalidateDraft();
  }

  /** Frames the current C2-D scene-consumer focus from a stable close three-quarter view. */
  setRiverCompositionView(): boolean {
    const bridge = this.decoration.getSnapshot().bridgePosition;
    if (!bridge) return false;
    const localX = bridge[0] - this.logicalOrigin[0];
    const localZ = bridge[2] - this.logicalOrigin[1];
    const target = new Vector3(localX, bridge[1] - 0.35, localZ);
    this.camera.entity.transform.setPosition(localX + 26, bridge[1] + 19, localZ + 34);
    this.camera.fieldOfView = 48;
    this.orbit.target.copyFrom(target);
    this.camera.entity.transform.lookAt(target);
    this.clipmap.snap(this.camera.entity.transform.worldPosition);
    this.authoring.invalidateDraft();
    return true;
  }

  /** @returns Current runtime and authoring measurements. */
  snapshot(): PureNoiseSnapshot {
    const position = this.camera.entity.transform.position;
    const forward = this.camera.entity.transform.worldForward;
    return Object.freeze({
      ready: true,
      dpr: 1,
      renderer: "Geometry Clipmap + analytic FBM + operator texels",
      activeClipmapSegments: this.clipmap.segmentCount,
      clipmapGeometry: this.clipmap.geometry,
      activeRegionCount: 0,
      heightmapBytes: 0,
      alphamapBytes: 0,
      waterBytes: this.riverWater.getSnapshot().waterBytes,
      generatedInstanceBytes: this.decoration.getSnapshot().generatedInstanceBytes,
      terrainLayerCount: 2,
      textureSourceBytes: TEXTURE_SOURCE_BYTES,
      logicalOrigin: Object.freeze([...this.logicalOrigin] as [number, number]),
      localPosition: Object.freeze([position.x, position.y, position.z] as [number, number, number]),
      frameMilliseconds: this.frameMilliseconds,
      authoring: this.authoring.snapshot(),
      lighting: this.lighting.getSnapshot(),
      shadowCascade: this.lighting.getShadowCascadeTuning(),
      postProcess: this.postProcess.getDebugSnapshot(),
      environment: this.environment.getSnapshot(),
      riverWater: this.riverWater.getSnapshot(),
      waterHost: this.riverWater.getHostDiagnostics(),
      worldRevision: this.worldCoordinator.getSnapshot(),
      decoration: this.decoration.getSnapshot(),
      freeRoam: Object.freeze({
        active: this.freeRoam.active,
        movementSpeed: this.freeRoam.movementSpeed,
        orbitEnabled: this.orbit.enabled,
        viewForward: Object.freeze([forward.x, forward.y, forward.z] as [number, number, number])
      })
    });
  }

  private _applyFloatingOrigin(): void {
    const position = this.camera.entity.transform.position;
    if (Math.max(Math.abs(position.x), Math.abs(position.z)) < 2048) return;
    const shiftX = Math.round(position.x / 1024) * 1024;
    const shiftZ = Math.round(position.z / 1024) * 1024;
    this.logicalOrigin[0] += shiftX;
    this.logicalOrigin[1] += shiftZ;
    position.x -= shiftX;
    position.z -= shiftZ;
    this.camera.entity.transform.position = position;
    this.orbit.target.x -= shiftX;
    this.orbit.target.z -= shiftZ;
    this.binding.setLogicalOrigin(this.logicalOrigin[0], this.logicalOrigin[1]);
    this.riverWater.setLogicalOrigin(this.logicalOrigin);
    this.decoration.setLogicalOrigin(this.logicalOrigin);
    this.authoring.invalidateDraft();
  }
}

void boot().catch((error: unknown) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  window.promptNoiseWorldDemoError = message;
  document.getElementById("loading-status")!.textContent = message;
  console.error("[prompt-noise-world] startup failed", error);
});

async function boot(): Promise<void> {
  setLoading("创建 WebGL2 / DPR 1…");
  const engine = await WebGLEngine.create({
    canvas: "canvas",
    shaderCompiler: new ShaderCompiler(),
    graphicDeviceOptions: { webGLMode: WebGLMode.WebGL2 }
  });
  const canvas = document.getElementById("canvas") as HTMLCanvasElement;
  const syncDprOneResolution = (): void => {
    if (canvas.clientWidth > 0 && canvas.clientHeight > 0) {
      engine.canvas.setResolution(canvas.clientWidth, canvas.clientHeight);
    }
  };
  const canvasResizeObserver = new ResizeObserver(syncDprOneResolution);
  canvasResizeObserver.observe(canvas);
  syncDprOneResolution();
  const performancePanel = new TerrainPerformancePanel(engine);

  setLoading("加载 Grasslands 场景、天空、Fog 与后处理…");
  await loadTerrainScene(engine, {
    projectUrl: new URL("../../../packages/terrain/src/data/grasslands/project.json", import.meta.url),
    scenePath: "Scene/World.scene",
    onProgress: (loaded, total, phase) => {
      const percent = total > 0 ? Math.round((loaded / total) * 100) : 0;
      setLoading(`${phase === "project" ? "Grasslands Project" : "Grasslands Scene"} ${percent}%`);
    }
  });
  const scene = engine.sceneManager.activeScene!;
  const roots = scene.rootEntities;
  const camera = findRequiredComponent(roots, Camera, "Camera");
  const directLight = findRequiredComponent(roots, DirectLight, "DirectLight");
  const postProcess = findRequiredComponent(roots, TerrainPostProcessRuntime, "TerrainPostProcessRuntime");
  const navigation = findRequiredComponent(roots, TerrainNavigationRuntime, "TerrainNavigationRuntime");
  const wind = findRequiredComponent(roots, TerrainWindRuntime, "TerrainWindRuntime");
  deactivateGrasslandsWorldContent(roots);
  navigation.setInputEnabled(false);
  navigation.enabled = false;

  const orbit = camera.entity.addComponent(OrbitControl);
  orbit.enableDamping = false;
  orbit.enableKeys = false;
  orbit.minDistance = 10;
  orbit.maxDistance = 5000;
  orbit.minPolarAngle = Math.PI * 0.08;
  orbit.maxPolarAngle = Math.PI * 0.48;
  orbit.zoomSpeed *= 0.25;

  const lighting = new TerrainLightingRuntime(directLight.entity, scene, directLight, postProcess);
  lighting.setTuning({ playing: false, timeHours: 11 });
  lighting.setVisibility({ fog: false });
  const requestedRiverVisual = new URLSearchParams(window.location.search).get("riverVisual");
  const terrainProgram = new PromptNoiseTerrainProgram(
    requestedRiverVisual === "low"
      ? createPromptNoiseWorldRecipeV3Compatibility(DEFAULT_PROMPT_NOISE_WORLD_RECIPE, 1)
      : requestedRiverVisual === "stage-c1"
        ? createPromptNoiseWorldRecipeV3Compatibility(DEFAULT_PROMPT_NOISE_WORLD_RECIPE, 2)
        : requestedRiverVisual === "c2a"
          ? createPromptNoiseWorldRecipeV3Compatibility(DEFAULT_PROMPT_NOISE_WORLD_RECIPE, 3)
          : DEFAULT_PROMPT_NOISE_WORLD_RECIPE
  );
  const perPointRiverProfileEnabled = terrainProgram.recipe.templateRegistryVersion >= 3;
  let terrainAuthoring: PromptNoiseTerrainAuthoring | null = null;
  const ground: TerrainRainImpactSurfaceProvider = {
    sampleHeightInterpolated: (worldX, worldZ) =>
      (terrainAuthoring?.getProgram() ?? terrainProgram).sampleHeight(worldX, worldZ),
    sampleRainImpact: () => false
  };
  setLoading("启动最新 Grasslands 天空、天气与体积云…");
  const environment = await WorldEnvironmentRuntime.create(scene, camera, ground, lighting, wind);
  const root = scene.createRootEntity("Prompt Noise Terrain");
  setLoading("加载 Rock / Grass packed textures…");
  const binding = await PromptNoiseTerrainBinding.create(engine);
  const clipmap = new TerrainClipmap(
    engine,
    root.createChild("Analytic Geometry Clipmap"),
    camera,
    { vertexSpacing: 1, minHeight: -180, maxHeight: 520 },
    binding,
    MESH_SIZE,
    MESH_LODS
  );
  const waterHost = new WaterSceneRuntimeHost({
    engine,
    scene,
    camera,
    root,
    waterLayer: Layer.Layer30,
    cacheEntryLimit: 24,
    cacheBudgetBytes: 96 * 1024 * 1024,
    reflection: {
      cullingMask: camera.cullingMask,
      waterLayerMask: Layer.Layer30,
      screenSpaceReflection: PROMPT_NOISE_RIVER_SSR_CAMERA_SETTINGS
    }
  });
  waterHost.createEnvironmentReflectionProvider({
    id: PROMPT_NOISE_RIVER_ENVIRONMENT_PROVIDER_ID,
    source: {
      ambientLight: scene.ambientLight,
      rotationDegrees: 0,
      exposure: 1,
      hdr: true
    }
  });
  const riverWater = new PromptNoiseRiverWaterRuntime(waterHost, engine);
  const generationWorker = new PromptNoiseGenerationWorkerClient();
  setLoading("加载 Prompt 植被、岩石与桥梁原型…");
  const decoration = await PromptNoiseDecorationRuntime.create(
    engine,
    root.createChild("Prompt Scene Consumers"),
    generationWorker,
    waterHost.world
  );
  const worldCoordinator = new PromptNoiseWorldRevisionCoordinator(binding, riverWater, generationWorker, decoration);
  clipmap.setWireframe(false);
  performancePanel.setSceneMetricsProvider(() => {
    const water = riverWater.getSnapshot();
    const sceneObjects = decoration.getSnapshot();
    return {
      clipmapSegments: clipmap.segmentCount,
      clipmapTriangles: clipmap.geometry.fullTopologyTriangles,
      activeRegions: 0,
      detailInstances: sceneObjects.detailCount,
      detailBatches: sceneObjects.detailCount > 0 ? 4 : 0,
      visibleDetailInstances: sceneObjects.detailCount,
      culledDetailInstances: 0,
      detailDraws: sceneObjects.detailCount,
      treeInstances: sceneObjects.treeCount,
      treeLodGroups: sceneObjects.treeCount > 0 ? 1 : 0,
      prefabInstances: sceneObjects.prefabCount,
      prefabLodGroups: sceneObjects.prefabCount > 0 ? 1 : 0,
      waterVisible: water.active,
      waterChunks: water.chunkCount,
      msaaSamples: camera.msaaSamples,
      postProcessEnabled: postProcess.profileEnabled,
      shadowCascadeCount: scene.shadowCascades
    };
  });

  const driver = camera.entity.addComponent(PureNoiseWorldDriver);
  driver.camera = camera;
  driver.orbit = orbit;
  driver.binding = binding;
  driver.clipmap = clipmap;
  driver.lighting = lighting;
  driver.postProcess = postProcess;
  driver.environment = environment;
  driver.riverWater = riverWater;
  driver.decoration = decoration;
  driver.worldCoordinator = worldCoordinator;

  let gui: dat.GUI | null = null;
  let freeRoam: PromptNoiseFreeRoamMode;
  let refreshOperatorChoices = (): void => undefined;
  let syncRiverInspector = (): void => undefined;
  const authoring = new PromptNoiseTerrainAuthoring({
    canvas,
    camera,
    orbit,
    binding,
    program: terrainProgram,
    getLogicalOrigin: () => driver.logicalOrigin,
    overlay: document.getElementById("operator-overlay") as unknown as SVGSVGElement,
    onChange: (snapshot) => {
      refreshOperatorChoices();
      syncRiverInspector();
      syncPersistentDisplay(snapshot);
    },
    onCommittedProgramChange: (program) => worldCoordinator.stageAndCommit(program)
  });
  terrainAuthoring = authoring;
  driver.authoring = authoring;
  driver.setOverview(true);

  const authoredLighting = lighting.getSnapshot();
  const base = authoring.getProgram().recipe.base;
  const guiState = createGuiState(base, authoredLighting, postProcess.getDebugSnapshot().enabled, authoring, driver);
  const syncPersistentDisplay = (snapshot: PromptNoiseAuthoringSnapshotV1): void => {
    guiState.worldSeedId = String(snapshot.worldId);
    guiState.sha256 = snapshot.sha256;
    guiState.status = snapshot.status;
    guiState.worldIdInput = snapshot.worldId;
  };
  syncPersistentDisplay(authoring.snapshot());

  gui = new dat.GUI({ name: "Prompt Noise Operator Lab" });
  const terrainFolder = gui.addFolder("无限 Noise 地形");
  terrainFolder
    .add(guiState, "overview")
    .name("俯瞰 / 近景")
    .onChange((enabled: boolean) => driver.setOverview(enabled));
  terrainFolder
    .add(guiState, "wireframe")
    .name("Clipmap 网格")
    .onChange((enabled: boolean) => clipmap.setWireframe(enabled));
  terrainFolder
    .add(guiState, "debugView", Object.keys(DEBUG_VIEWS))
    .name("调试视图")
    .onChange((name: keyof typeof DEBUG_VIEWS) => binding.setDebugView(DEBUG_VIEWS[name]));
  terrainFolder.open();

  const baseFolder = gui.addFolder("Terrain3D FBM 原公式");
  const commitBase = (): void => {
    void authoring.setBase({
      rootSeed: Math.round(guiState.rootSeed) >>> 0,
      worldNoiseScale: guiState.worldNoiseScale,
      worldNoiseHeight: guiState.worldNoiseHeight,
      worldNoiseOffset: [guiState.noiseOffsetX, guiState.noiseOffsetY, guiState.noiseOffsetZ],
      ridgeStrength: guiState.ridgeStrength,
      ridgeFrequency: guiState.ridgeFrequency,
      ridgeSharpness: guiState.ridgeSharpness
    });
  };
  baseFolder.add(guiState, "rootSeed", 0, 0xffff_ffff, 1).name("根 Seed").onFinishChange(commitBase);
  baseFolder.add(guiState, "worldNoiseScale", 2, 20, 0.01).name("FBM 尺度").onFinishChange(commitBase);
  baseFolder.add(guiState, "worldNoiseHeight", 4, 70, 0.1).name("FBM 高度").onFinishChange(commitBase);
  baseFolder.add(guiState, "noiseOffsetX", -20, 20, 0.01).name("Noise X").onFinishChange(commitBase);
  baseFolder.add(guiState, "noiseOffsetY", -5, 5, 0.01).name("Noise 高度").onFinishChange(commitBase);
  baseFolder.add(guiState, "noiseOffsetZ", -20, 20, 0.01).name("Noise Z").onFinishChange(commitBase);
  baseFolder.add(guiState, "ridgeStrength", 0, 180, 1).name("实验山脊叠加").onFinishChange(commitBase);
  baseFolder.add(guiState, "ridgeFrequency", 0.0006, 0.004, 0.0001).name("实验山脊频率").onFinishChange(commitBase);
  baseFolder.add(guiState, "ridgeSharpness", 1, 24, 1).name("实验山脊宽窄").onFinishChange(commitBase);
  baseFolder.open();

  const placementFolder = gui.addFolder("算子草稿");
  let syncParameterVisibility = (): void => undefined;
  let notifyFreeRoamEditingBlocked = (): void => undefined;
  const setEditingEnabledFromUi = (enabled: boolean): void => {
    if (freeRoam?.active && enabled) {
      guiState.editingEnabled = false;
      syncParameterVisibility();
      gui?.updateDisplay();
      notifyFreeRoamEditingBlocked();
      return;
    }
    guiState.editingEnabled = enabled;
    authoring.setEditingEnabled(enabled);
    syncParameterVisibility();
    gui?.updateDisplay();
  };
  placementFolder.add(guiState, "editingEnabled").name("算子编辑").onChange(setEditingEnabledFromUi);
  const toolController = placementFolder.add(guiState, "tool", TOOL_OPTIONS).name("工具");
  let templateController = placementFolder.add(guiState, "templateId", templateOptions("river")).name("模板");
  placementFolder
    .add(guiState, "targetMode", TARGET_OPTIONS)
    .name("目标来源")
    .onChange((mode: PromptNoiseTargetModeV1) => authoring.setTargetMode(mode));
  placementFolder.add(guiState, "applyDraft").name("应用算子 · Enter");
  placementFolder.add(guiState, "cancelEdit").name("取消编辑");
  placementFolder
    .add(guiState, "stressOperatorCount", STRESS_OPTIONS)
    .name("压力预览")
    .onChange((count: number) => {
      authoring.setStressOperatorCount(Number(count));
    });
  const onTemplateChange = (templateId: PromptNoiseOperatorTemplateId): void => {
    authoring.setTool(guiState.tool, templateId);
    syncAuthoringControls(guiState, authoring);
    gui?.updateDisplay();
  };
  toolController.onChange((tool: PromptNoiseTerrainOperatorKind) => {
    const templateId = defaultTemplate(tool);
    guiState.templateId = templateId;
    templateController = templateController.options(templateOptions(tool)).name("模板").onChange(onTemplateChange);
    authoring.setTool(tool, templateId);
    syncAuthoringControls(guiState, authoring);
    syncParameterVisibility();
    gui?.updateDisplay();
  });
  templateController.onChange(onTemplateChange);
  placementFolder.open();

  const parametersFolder = gui.addFolder("当前模板参数");
  const parameterControllers = {
    length: addDraftParameter(parametersFolder, guiState, authoring, "length", "长度", 120, 2400, 10),
    bend: addDraftParameter(parametersFolder, guiState, authoring, "bend", "弯曲", -900, 900, 5),
    halfWidth: addDraftParameter(
      parametersFolder,
      guiState,
      authoring,
      "halfWidth",
      "水面 / 河床半宽",
      4,
      PROMPT_NOISE_RIVER_MAX_HALF_WIDTH,
      1
    ),
    bankWidth: addDraftParameter(parametersFolder, guiState, authoring, "bankWidth", "河岸过渡", 8, 480, 2),
    cutDepth: addDraftParameter(parametersFolder, guiState, authoring, "cutDepth", "下切深度", 0, 160, 1),
    minimumDrop: addDraftParameter(parametersFolder, guiState, authoring, "minimumDrop", "最小落差", 0, 180, 1),
    bankHeight: addDraftParameter(parametersFolder, guiState, authoring, "bankHeight", "岸高", 0, 220, 1),
    sourceWidth: addDraftParameter(parametersFolder, guiState, authoring, "sourceWidth", "源头 · 全宽", 1, 50, 0.1),
    sourceDepth: addDraftParameter(parametersFolder, guiState, authoring, "sourceDepth", "源头 · 深度", 0, 10, 0.05),
    sourceFlowSpeed: addDraftParameter(
      parametersFolder,
      guiState,
      authoring,
      "sourceFlowSpeed",
      "源头 · 流速",
      0,
      10,
      0.05
    ),
    sourceBankFeather: addDraftParameter(
      parametersFolder,
      guiState,
      authoring,
      "sourceBankFeather",
      "源头 · 岸带",
      0,
      10,
      0.05
    ),
    middleWidth: addDraftParameter(parametersFolder, guiState, authoring, "middleWidth", "中段 · 全宽", 1, 50, 0.1),
    middleDepth: addDraftParameter(parametersFolder, guiState, authoring, "middleDepth", "中段 · 深度", 0, 10, 0.05),
    middleFlowSpeed: addDraftParameter(
      parametersFolder,
      guiState,
      authoring,
      "middleFlowSpeed",
      "中段 · 流速",
      0,
      10,
      0.05
    ),
    middleBankFeather: addDraftParameter(
      parametersFolder,
      guiState,
      authoring,
      "middleBankFeather",
      "中段 · 岸带",
      0,
      10,
      0.05
    ),
    mouthWidth: addDraftParameter(parametersFolder, guiState, authoring, "mouthWidth", "河口 · 全宽", 1, 50, 0.1),
    mouthDepth: addDraftParameter(parametersFolder, guiState, authoring, "mouthDepth", "河口 · 深度", 0, 10, 0.05),
    mouthFlowSpeed: addDraftParameter(
      parametersFolder,
      guiState,
      authoring,
      "mouthFlowSpeed",
      "河口 · 流速",
      0,
      10,
      0.05
    ),
    mouthBankFeather: addDraftParameter(
      parametersFolder,
      guiState,
      authoring,
      "mouthBankFeather",
      "河口 · 岸带",
      0,
      10,
      0.05
    ),
    radius: addDraftParameter(parametersFolder, guiState, authoring, "radius", "作用半径", 20, 900, 5),
    falloff: addDraftParameter(parametersFolder, guiState, authoring, "falloff", "边缘过渡", 1, 440, 2),
    heightOffset: addDraftParameter(parametersFolder, guiState, authoring, "heightOffset", "高度偏移", -180, 180, 1),
    sampleRadius: addDraftParameter(parametersFolder, guiState, authoring, "sampleRadius", "Smooth 采样", 1, 160, 1),
    strength: addDraftParameter(parametersFolder, guiState, authoring, "strength", "强度", 0, 1, 0.01)
  } satisfies Record<PromptNoisePlacementParameterName, dat.GUIController>;
  syncParameterVisibility = () => {
    const visible = new Set(PARAMETER_NAMES_BY_TOOL[guiState.tool]);
    if (guiState.tool === "river") {
      if (perPointRiverProfileEnabled) visible.delete("halfWidth");
      else for (const name of RIVER_PROFILE_PARAMETER_NAMES) visible.delete(name);
    }
    for (const [name, controller] of Object.entries(parameterControllers)) {
      const row = controller.domElement.parentElement;
      if (row)
        row.style.display =
          guiState.editingEnabled && visible.has(name as PromptNoisePlacementParameterName) ? "" : "none";
    }
  };
  syncParameterVisibility();

  const hint = document.getElementById("hint")!;
  const hintText = document.getElementById("hint-text")!;
  const freeRoamToggle = document.getElementById("free-roam-toggle") as HTMLButtonElement;
  const roamSpeedControl = document.getElementById("roam-speed-control")!;
  const roamSpeed = document.getElementById("roam-speed") as HTMLInputElement;
  const roamSpeedValue = document.getElementById("roam-speed-value")!;
  let hintResetTimer: number | null = null;
  const clearHintNotice = (): void => {
    if (hintResetTimer !== null) {
      window.clearTimeout(hintResetTimer);
      hintResetTimer = null;
    }
    hint.removeAttribute("data-notice");
  };
  const syncFreeRoamHint = (active: boolean): void => {
    clearHintNotice();
    hintText.textContent = active ? FREE_ROAM_INTERACTION_HINT : CAMERA_INTERACTION_HINT;
    freeRoamToggle.textContent = active ? "退出漫游" : "开始漫游";
    freeRoamToggle.setAttribute("aria-pressed", String(active));
    roamSpeedControl.hidden = !active;
  };
  notifyFreeRoamEditingBlocked = () => {
    if (!freeRoam.active) return;
    clearHintNotice();
    hint.dataset.notice = "warning";
    hintText.textContent = FREE_ROAM_EDITING_BLOCKED_HINT;
    hintResetTimer = window.setTimeout(() => {
      hintResetTimer = null;
      hint.removeAttribute("data-notice");
      if (freeRoam.active) hintText.textContent = FREE_ROAM_INTERACTION_HINT;
    }, FREE_ROAM_NOTICE_DURATION_MS);
  };
  freeRoam = new PromptNoiseFreeRoamMode({
    cameraEntity: camera.entity,
    orbit,
    setEditingEnabled: (enabled) => {
      if (freeRoam.active && enabled) return;
      guiState.editingEnabled = enabled;
      authoring.setEditingEnabled(enabled);
      syncParameterVisibility();
      gui?.updateDisplay();
    },
    onModeChange: syncFreeRoamHint
  });
  driver.freeRoam = freeRoam;
  const syncFreeRoamSpeed = (): void => {
    roamSpeed.value = String(freeRoam.movementSpeed);
    roamSpeedValue.textContent = `${freeRoam.movementSpeed} m/s`;
  };
  const onFreeRoamToggle = (event: KeyboardEvent): void => {
    if (event.code !== "KeyF" || event.repeat || isEditableElement(event.target)) return;
    event.preventDefault();
    freeRoam.toggle(authoring.controls.editingEnabled);
  };
  const onFreeRoamButtonClick = (): void => {
    freeRoam.toggle(authoring.controls.editingEnabled);
  };
  const onFreeRoamSpeedChange = (): void => {
    freeRoam.movementSpeed = Number(roamSpeed.value);
    syncFreeRoamSpeed();
  };
  window.addEventListener("keydown", onFreeRoamToggle);
  freeRoamToggle.addEventListener("click", onFreeRoamButtonClick);
  roamSpeed.addEventListener("input", onFreeRoamSpeedChange);
  syncFreeRoamSpeed();
  syncFreeRoamHint(false);
  parametersFolder.close();

  const operatorFolder = gui.addFolder("已提交算子");
  guiState.editSelected = () => {
    authoring.editOperator(Number(guiState.selectedOperator));
    syncAuthoringControls(guiState, authoring);
    syncParameterVisibility();
    templateController = templateController
      .options(templateOptions(guiState.tool))
      .name("模板")
      .onChange(onTemplateChange);
    gui?.updateDisplay();
  };
  let operatorController = operatorFolder
    .add(guiState, "selectedOperator", operatorOptions(authoring))
    .name("选择算子");
  const onOperatorSelection = (value: string): void => authoring.selectOperator(Number(value));
  operatorController.onChange(onOperatorSelection);
  operatorFolder.add(guiState, "editSelected").name("编辑");
  operatorFolder.add(guiState, "deleteSelected").name("删除");
  operatorFolder.add(guiState, "moveEarlier").name("上移");
  operatorFolder.add(guiState, "moveLater").name("下移");
  operatorFolder.add(guiState, "undo").name("撤销");
  operatorFolder.add(guiState, "redo").name("重做");
  operatorFolder.open();
  let operatorChoiceSignature = authoring
    .listOperators()
    .map((entry) => entry.id)
    .join(":");
  refreshOperatorChoices = () => {
    const signature = authoring
      .listOperators()
      .map((entry) => entry.id)
      .join(":");
    if (signature === operatorChoiceSignature) return;
    operatorChoiceSignature = signature;
    operatorController = operatorController
      .options(operatorOptions(authoring))
      .name("选择算子")
      .onChange(onOperatorSelection);
    if (!authoring.listOperators().some((entry) => String(entry.id) === guiState.selectedOperator)) {
      guiState.selectedOperator = "0";
    }
  };

  const riverInspectorFolder = gui.addFolder("River Point Inspector");
  const riverCurveController = riverInspectorFolder
    .add(guiState, "riverCurveMode", {
      线性: "linear",
      "Catmull-Rom": "catmull-rom",
      Bezier: "bezier"
    })
    .name("曲线模式")
    .onChange((mode: PromptNoiseRiverCurveMode) => {
      const operatorId = Number(guiState.selectedOperator);
      if (operatorId > 0) authoring.setRiverCurveMode(operatorId, mode, false);
    })
    .onFinishChange((mode: PromptNoiseRiverCurveMode) => {
      const operatorId = Number(guiState.selectedOperator);
      if (operatorId > 0) void authoring.setRiverCurveMode(operatorId, mode, true);
    });
  let riverPointController = riverInspectorFolder.add(guiState, "selectedRiverPoint", { 无: "0" }).name("控制点");
  const onRiverPointSelection = (value: string): void => {
    const operatorId = Number(guiState.selectedOperator);
    const pointId = Number(value);
    if (operatorId > 0 && pointId > 0) authoring.selectRiverControlPoint(operatorId, pointId);
  };
  riverPointController.onChange(onRiverPointSelection);
  const previewRiverInspector = (property: keyof PromptNoiseRiverControlPointV1): void => {
    const operatorId = Number(guiState.selectedOperator);
    const pointId = Number(guiState.selectedRiverPoint);
    if (operatorId <= 0 || pointId <= 0) return;
    if (property === "position") {
      authoring.previewRiverControlPoint(operatorId, pointId, {
        position: { x: guiState.riverPointX, z: guiState.riverPointZ }
      });
      return;
    }
    const values = {
      bedHeight: guiState.riverPointBedHeight,
      width: guiState.riverPointWidth,
      depth: guiState.riverPointDepth,
      flowSpeed: guiState.riverPointFlowSpeed,
      bankFeather: guiState.riverPointBankFeather
    };
    if (property in values) {
      authoring.previewRiverControlPoint(operatorId, pointId, {
        [property]: values[property as keyof typeof values]
      });
    }
  };
  const addRiverPointNumber = (
    property:
      | "riverPointX"
      | "riverPointZ"
      | "riverPointBedHeight"
      | "riverPointWidth"
      | "riverPointDepth"
      | "riverPointFlowSpeed"
      | "riverPointBankFeather",
    label: string,
    minimum: number,
    maximum: number,
    step: number,
    pointProperty: "position" | "bedHeight" | "width" | "depth" | "flowSpeed" | "bankFeather"
  ): void => {
    riverInspectorFolder
      .add(guiState, property, minimum, maximum, step)
      .name(label)
      .listen()
      .onChange(() => previewRiverInspector(pointProperty))
      .onFinishChange(() => void authoring.commitRiverControlPointEdit());
  };
  addRiverPointNumber("riverPointX", "位置 X", -100000, 100000, 0.1, "position");
  addRiverPointNumber("riverPointZ", "位置 Z", -100000, 100000, 0.1, "position");
  addRiverPointNumber("riverPointBedHeight", "河床高度", -1000, 3000, 0.05, "bedHeight");
  addRiverPointNumber("riverPointWidth", "全宽", 1, 50, 0.05, "width");
  addRiverPointNumber("riverPointDepth", "深度", 0, 10, 0.05, "depth");
  addRiverPointNumber("riverPointFlowSpeed", "流速", 0, 10, 0.05, "flowSpeed");
  addRiverPointNumber("riverPointBankFeather", "岸带", 0, 10, 0.05, "bankFeather");
  riverInspectorFolder.add(guiState, "insertRiverPoint").name("在当前点后插入");
  riverInspectorFolder.add(guiState, "deleteRiverPoint").name("删除当前内部点");
  const riverNetworkFolder = gui.addFolder("River Network Inspector");
  let riverReachChoiceSignature = "";
  let incomingAController = riverNetworkFolder
    .add(guiState, "riverIncomingA", riverReachOptions(authoring))
    .name("上游 Reach A");
  let incomingBController = riverNetworkFolder
    .add(guiState, "riverIncomingB", riverReachOptions(authoring))
    .name("上游 Reach B");
  let outgoingController = riverNetworkFolder
    .add(guiState, "riverOutgoing", riverReachOptions(authoring))
    .name("下游 Reach");
  riverNetworkFolder.add(guiState, "riverMergeRadius", 1, 25, 0.1).name("汇流半径 m");
  riverNetworkFolder.add(guiState, "connectRiverConfluence").name("原子连接 Y 汇流");
  riverNetworkFolder.add(guiState, "disconnectRiverNetwork").name("断开选中河网");
  riverNetworkFolder.add(guiState, "inspectRiverComposition").name("H5 河岸构图视角");
  riverNetworkFolder.add(guiState, "riverNetworkSummary").name("拓扑").listen();
  riverNetworkFolder.open();
  let riverPointSignature = "";
  syncRiverInspector = () => {
    const snapshot = authoring.snapshot();
    const reachChoiceSignature = authoring
      .listOperators()
      .filter((operator) => authoring.listRiverControlPoints(operator.id).length > 0)
      .map((operator) => operator.id)
      .join(":");
    if (reachChoiceSignature !== riverReachChoiceSignature) {
      riverReachChoiceSignature = reachChoiceSignature;
      const options = riverReachOptions(authoring);
      incomingAController = incomingAController.options(options).name("上游 Reach A");
      incomingBController = incomingBController.options(options).name("上游 Reach B");
      outgoingController = outgoingController.options(options).name("下游 Reach");
    }
    guiState.riverNetworkSummary = `${snapshot.riverNetworkCount} networks · ${snapshot.riverReachCount} reaches · ${snapshot.riverJunctionCount} junctions`;
    const committedOperatorIds = new Set(authoring.listOperators().map((operator) => operator.id));
    const guiOperatorId = Number(guiState.selectedOperator);
    const operatorId = committedOperatorIds.has(snapshot.selectedOperatorId)
      ? snapshot.selectedOperatorId
      : committedOperatorIds.has(guiOperatorId)
        ? guiOperatorId
        : 0;
    if (operatorId > 0) guiState.selectedOperator = String(operatorId);
    const points = operatorId > 0 ? authoring.listRiverControlPoints(operatorId) : [];
    const signature = `${operatorId}:${points.map((point) => point.id).join(":")}`;
    if (signature !== riverPointSignature) {
      riverPointSignature = signature;
      const options: Record<string, string> = points.length ? {} : { 无: "0" };
      for (const [index, point] of points.entries()) options[`${index + 1}. Point #${point.id}`] = String(point.id);
      riverPointController = riverPointController.options(options).name("控制点").onChange(onRiverPointSelection);
    }
    const guiPointId = Number(guiState.selectedRiverPoint);
    const selectedPointId =
      snapshot.selectedOperatorId === operatorId && points.some((point) => point.id === snapshot.selectedRiverPointId)
        ? snapshot.selectedRiverPointId
        : points.some((point) => point.id === guiPointId)
          ? guiPointId
          : (points[0]?.id ?? 0);
    guiState.selectedRiverPoint = String(selectedPointId);
    const point = points.find((entry) => entry.id === selectedPointId);
    if (point) {
      if (snapshot.selectedOperatorId === operatorId) {
        guiState.riverCurveMode = snapshot.riverCurveMode ?? "bezier";
      }
      guiState.riverPointX = point.position.x;
      guiState.riverPointZ = point.position.z;
      guiState.riverPointBedHeight = point.bedHeight;
      guiState.riverPointWidth = point.width;
      guiState.riverPointDepth = point.depth;
      guiState.riverPointFlowSpeed = point.flowSpeed;
      guiState.riverPointBankFeather = point.bankFeather;
    }
    operatorController.updateDisplay();
    riverCurveController.updateDisplay();
    riverPointController.updateDisplay();
  };
  syncRiverInspector();
  riverInspectorFolder.open();

  const persistenceFolder = gui.addFolder("World Seed ID / PNW4");
  persistenceFolder.add(guiState, "worldSeedId").name("World Seed ID").listen();
  persistenceFolder.add(guiState, "sha256").name("完整 SHA-256").listen();
  persistenceFolder.add(guiState, "worldIdInput", 0, 0xffff_ffff, 1).name("本地 ID");
  persistenceFolder.add(guiState, "loadWorldId").name("按 ID 还原");
  persistenceFolder.add(guiState, "exportWorld").name("导出 .pnw4 / .pnw3");
  persistenceFolder.add(guiState, "importWorld").name("导入 .pnw4 / .pnw3");
  persistenceFolder.add(guiState, "pnw2Code").name("旧 PNW2 世界码");
  persistenceFolder.add(guiState, "loadPnw2").name("迁移 PNW2 → V3");
  persistenceFolder.add(guiState, "status").name("结果").listen();
  persistenceFolder.open();

  const materialFolder = gui.addFolder("原始材质能力");
  for (const feature of ["projection", "dualScaling", "autoShader", "macroVariation", "detiling"] as const) {
    materialFolder
      .add(guiState, feature)
      .name(feature)
      .onChange((enabled: boolean) => binding.setFeatureEnabled(feature, enabled));
  }
  materialFolder.open();

  const lightingFolder = gui.addFolder("Lighting Diagnostics / 光照诊断");
  const shadowCascadeState = lighting.getShadowCascadeTuning();
  lightingFolder
    .add(guiState, "directLight")
    .name("Direct Light")
    .onChange((enabled: boolean) => lighting.setVisibility({ direct: enabled }));
  lightingFolder
    .add(guiState, "shadows")
    .name("Shadows")
    .onChange((enabled: boolean) => {
      lighting.setVisibility({ shadows: enabled });
      clipmap.setShadowsEnabled(enabled);
    });
  lightingFolder
    .add(guiState, "environment")
    .name("Sky + IBL")
    .onChange((enabled: boolean) => lighting.setVisibility({ environment: enabled }));
  lightingFolder
    .add(guiState, "fog")
    .name("Fog")
    .onChange((enabled: boolean) => lighting.setVisibility({ fog: enabled }));
  lightingFolder
    .add(shadowCascadeState, "distance", 10, 500, 1)
    .name("Shadow distance / 阴影距离")
    .onChange((distance: number) => lighting.setShadowCascadeTuning({ distance }));
  lightingFolder
    .add(shadowCascadeState, "distribution", 1, 4, 0.05)
    .name("Cascade distribution / 级联分布")
    .onChange((distribution: number) => lighting.setShadowCascadeTuning({ distribution }));
  const iblState = { realtimeIbl: authoredLighting.iblBakingEnabled };
  lightingFolder
    .add(iblState, "realtimeIbl")
    .name("Realtime IBL bake / 实时 IBL")
    .onChange((enabled: boolean) => lighting.setIBLBakingEnabled(enabled));
  lightingFolder.open();

  const environmentFolder = gui.addFolder("Environment Composition / 环境组合");
  const environmentState = {
    template: "晴朗" as keyof typeof WEATHER_TEMPLATES,
    playing: guiState.playing,
    timeHours: guiState.timeHours,
    timeScale: guiState.timeScale,
    skyLighting: "clear" as keyof typeof WeatherPresets.skyLighting,
    cloud: "scattered" as keyof typeof WeatherPresets.cloud,
    cloudQuality: environment.getSnapshot().clouds.quality,
    precipitation: "none" as keyof typeof WeatherPresets.precipitation,
    wind: "breeze" as keyof typeof WeatherPresets.wind,
    lightning: "none" as keyof typeof WeatherPresets.lightning,
    transitionDuration: environment.getSnapshot().transitionDuration,
    resetSurface: () => environment.resetSurfaceClimate()
  };
  const applyEnvironmentTemplate = (templateName: keyof typeof WEATHER_TEMPLATES): void => {
    const template = WEATHER_TEMPLATES[templateName];
    Object.assign(environmentState, template, { playing: false });
    guiState.playing = false;
    guiState.timeHours = template.timeHours;
    lighting.setTuning({ playing: false, timeHours: template.timeHours });
    environment.setWeatherState({
      skyLighting: WeatherPresets.skyLighting[template.skyLighting],
      cloud: WeatherPresets.cloud[template.cloud],
      precipitation: WeatherPresets.precipitation[template.precipitation],
      wind: WeatherPresets.wind[template.wind],
      lightning: WeatherPresets.lightning[template.lightning]
    });
    environmentFolder.updateDisplay();
  };
  environmentFolder
    .add(environmentState, "template", Object.keys(WEATHER_TEMPLATES))
    .name("Quick fill / 快捷填充")
    .onChange(applyEnvironmentTemplate);
  environmentFolder
    .add(environmentState, "playing")
    .name("Auto day/night / 自动昼夜")
    .onChange((playing: boolean) => {
      guiState.playing = playing;
      lighting.setTuning({ playing });
    });
  environmentFolder
    .add(environmentState, "timeHours", 0, 24, 0.05)
    .name("Time / 时刻")
    .listen()
    .onChange((timeHours: number) => {
      environmentState.playing = false;
      guiState.playing = false;
      guiState.timeHours = timeHours;
      lighting.setTuning({ playing: false, timeHours });
      environmentFolder.updateDisplay();
    });
  environmentFolder
    .add(environmentState, "timeScale", 0, 7200, 1)
    .name("Time scale / 时间倍率")
    .onChange((timeScale: number) => {
      guiState.timeScale = timeScale;
      lighting.setTuning({ timeScale });
    });
  environmentFolder
    .add(environmentState, "skyLighting", SKY_LIGHTING_OPTIONS)
    .name("Sky lighting / 天空光照")
    .onChange((preset: keyof typeof WeatherPresets.skyLighting) =>
      environment.setSkyLighting(WeatherPresets.skyLighting[preset])
    );
  environmentFolder
    .add(environmentState, "cloud", CLOUD_OPTIONS)
    .name("Cloud / 云层")
    .onChange((preset: keyof typeof WeatherPresets.cloud) => environment.setCloud(WeatherPresets.cloud[preset]));
  environmentFolder
    .add(environmentState, "cloudQuality", { 性能: "economy", 均衡: "balanced", 高质量: "high" })
    .name("Cloud quality / 云质量")
    .onChange((quality: VolumetricCloudQuality) => environment.setCloudQuality(quality));
  environmentFolder
    .add(environmentState, "precipitation", PRECIPITATION_OPTIONS)
    .name("Precipitation / 降水")
    .onChange((preset: keyof typeof WeatherPresets.precipitation) =>
      environment.setPrecipitation(WeatherPresets.precipitation[preset])
    );
  environmentFolder
    .add(environmentState, "wind", WIND_OPTIONS)
    .name("Wind / 风力")
    .onChange((preset: keyof typeof WeatherPresets.wind) => environment.setWind(WeatherPresets.wind[preset]));
  environmentFolder
    .add(environmentState, "lightning", LIGHTNING_OPTIONS)
    .name("Lightning / 雷电")
    .onChange((preset: keyof typeof WeatherPresets.lightning) =>
      environment.setLightning(WeatherPresets.lightning[preset])
    );
  environmentFolder
    .add(environmentState, "transitionDuration", 0, 20, 0.1)
    .name("Transition / 过渡秒数")
    .onChange((duration: number) => environment.setTransitionDuration(duration));
  environmentFolder.add(environmentState, "resetSurface").name("Reset surface / 重置地表");

  const postProcessFolder = gui.addFolder("Post-process / 后处理");
  const postProcessState = postProcess.getDebugSnapshot();
  postProcessFolder
    .add(postProcessState, "enabled")
    .name("Post process / 后处理")
    .onChange((enabled: boolean) => {
      guiState.postProcess = enabled;
      postProcess.setProfileEnabled(enabled);
    });
  postProcessFolder
    .add(postProcessState, "tonemapping")
    .name("Tonemapping / 色调映射")
    .onChange((enabled: boolean) => postProcess.setTonemappingEnabled(enabled));
  postProcessFolder
    .add(postProcessState, "tonemappingMode", { 中性: TonemappingMode.Neutral, 电影ACES: TonemappingMode.ACES })
    .name("Tonemapping mode / 色调映射模式")
    .onChange((mode: number) => postProcess.setTonemappingMode(Number(mode) as TonemappingMode));
  postProcessFolder
    .add(postProcessState.bloom, "enabled")
    .name("Bloom / 泛光")
    .onChange((enabled: boolean) => postProcess.setBloomEnabled(enabled));
  postProcessFolder
    .add(postProcessState.bloom, "threshold", 0, 5, 0.01)
    .name("Bloom threshold / 泛光阈值")
    .onChange((threshold: number) => postProcess.setBloomThreshold(threshold));
  postProcessFolder
    .add(postProcessState.bloom, "intensity", 0, 5, 0.01)
    .name("Bloom intensity / 泛光强度")
    .onChange((intensity: number) => postProcess.setBloomIntensity(intensity));
  postProcessFolder
    .add(postProcessState.bloom, "scatter", 0, 1, 0.01)
    .name("Bloom scatter / 泛光扩散")
    .onChange((scatter: number) => postProcess.setBloomScatter(scatter));
  let teardownPromise: Promise<PureNoiseTeardownSnapshot> | undefined;
  const importInput = document.getElementById("world-import") as HTMLInputElement;
  const onImportWorld = (): void => {
    const file = importInput.files?.[0];
    if (!file) return;
    void file
      .arrayBuffer()
      .then((buffer) => (teardownPromise ? undefined : authoring.importWorld(new Uint8Array(buffer))));
    importInput.value = "";
  };
  importInput.addEventListener("change", onImportWorld);

  driver.onSnapshot = (snapshot) => {
    guiState.playing = snapshot.lighting.playing;
    guiState.timeHours = snapshot.lighting.timeHours;
    environmentState.playing = snapshot.lighting.playing;
    environmentState.timeHours = snapshot.lighting.timeHours;
  };

  const destroyPromptNoiseWorld = (): Promise<PureNoiseTeardownSnapshot> => {
    if (teardownPromise) return teardownPromise;
    teardownPromise = (async () => {
      document.body.dataset.ready = "false";
      engine.pause();
      canvasResizeObserver.disconnect();
      performancePanel.destroy();
      freeRoam.destroy();
      clearHintNotice();
      gui?.destroy();
      importInput.removeEventListener("change", onImportWorld);
      window.removeEventListener("keydown", onFreeRoamToggle);
      freeRoamToggle.removeEventListener("click", onFreeRoamButtonClick);
      roamSpeed.removeEventListener("input", onFreeRoamSpeedChange);
      driver.enabled = false;
      authoring.destroy();
      worldCoordinator.destroy();
      decoration.destroy();
      generationWorker.destroy();
      await riverWater.destroy();
      await waterHost.destroy();
      clipmap.destroy();
      binding.destroy();
      environment.destroy();
      lighting.destroy();
      const receipt = Object.freeze({
        enginePaused: true as const,
        authoring: authoring.snapshot(),
        terrain: binding.getTerrainProgram(),
        worker: generationWorker.metrics,
        decoration: decoration.getSnapshot(),
        waterHost: waterHost.getDiagnostics()
      });
      window.promptNoiseWorldDemoTeardown = receipt;
      window.promptNoiseWorldDemo = undefined;
      return receipt;
    })();
    return teardownPromise;
  };

  window.promptNoiseWorldDemo = {
    getSnapshot: () => driver.snapshot(),
    setOverview: (enabled) => {
      guiState.overview = enabled;
      driver.setOverview(enabled);
      gui?.updateDisplay();
    },
    setFeatureEnabled: (feature, enabled) => {
      guiState[feature] = enabled;
      binding.setFeatureEnabled(feature, enabled);
      gui?.updateDisplay();
    },
    setDebugView: (debugView) => {
      binding.setDebugView(debugView);
      const name = Object.entries(DEBUG_VIEWS).find(([, value]) => value === debugView)?.[0];
      if (name) guiState.debugView = name;
      gui?.updateDisplay();
    },
    setShadowsEnabled: (enabled) => {
      guiState.shadows = enabled;
      lighting.setVisibility({ shadows: enabled });
      clipmap.setShadowsEnabled(enabled);
      gui?.updateDisplay();
    },
    setTimeHours: (timeHours) => {
      guiState.playing = false;
      guiState.timeHours = timeHours;
      lighting.setTuning({ playing: false, timeHours });
      gui?.updateDisplay();
    },
    setEditingEnabled: (enabled) => {
      setEditingEnabledFromUi(enabled);
    },
    setFreeRoamActive: (active) => freeRoam.setActive(active, authoring.controls.editingEnabled),
    setFreeRoamSpeed: (speed) => {
      freeRoam.movementSpeed = speed;
      syncFreeRoamSpeed();
    },
    setTool: (tool, templateId) => authoring.setTool(tool, templateId),
    setTargetMode: (targetMode) => authoring.setTargetMode(targetMode),
    setParameter: (parameter, value) => {
      if (typeof authoring.controls[parameter] !== "number") throw new TypeError(`${String(parameter)} is not numeric`);
      if (parameter === "stressOperatorCount") {
        authoring.setStressOperatorCount(value);
        return;
      }
      (authoring.controls as Record<string, unknown>)[parameter] = value;
      authoring.invalidateDraft();
    },
    applyDraft: () => authoring.applyDraft(),
    editOperator: (operatorId) => authoring.editOperator(operatorId),
    deleteOperator: (operatorId) => authoring.deleteOperator(operatorId),
    moveOperator: (operatorId, direction) => authoring.moveOperator(operatorId, direction),
    listRiverControlPoints: (operatorId) => authoring.listRiverControlPoints(operatorId),
    selectRiverControlPoint: (operatorId, pointId) => authoring.selectRiverControlPoint(operatorId, pointId),
    previewRiverControlPoint: (operatorId, pointId, patch) =>
      authoring.previewRiverControlPoint(operatorId, pointId, patch),
    commitRiverControlPointEdit: () => authoring.commitRiverControlPointEdit(),
    insertRiverControlPoint: (operatorId, afterPointId) => authoring.insertRiverControlPoint(operatorId, afterPointId),
    deleteRiverControlPoint: (operatorId, pointId) => authoring.deleteRiverControlPoint(operatorId, pointId),
    setRiverCurveMode: (operatorId, curveMode, commit) => authoring.setRiverCurveMode(operatorId, curveMode, commit),
    listRiverNetworks: () => authoring.listRiverNetworks(),
    connectRiverConfluence: (incomingOperatorIds, outgoingOperatorId, mergeRadius) =>
      authoring.connectRiverConfluence(incomingOperatorIds, outgoingOperatorId, mergeRadius),
    disconnectRiverNetwork: (operatorId) => authoring.disconnectRiverNetwork(operatorId),
    undo: () => authoring.undo(),
    redo: () => authoring.redo(),
    loadWorldId: (worldId) => authoring.loadWorldId(worldId),
    importWorld: (bytes) => authoring.importWorld(bytes),
    getWorldBytes: () => authoring.getWorldBytes(),
    setCameraLogicalPosition: (x, z) => {
      if (!Number.isFinite(x) || !Number.isFinite(z)) {
        throw new RangeError("Prompt Noise logical camera position must be finite.");
      }
      const position = camera.entity.transform.position;
      const nextLocalX = x - driver.logicalOrigin[0];
      const nextLocalZ = z - driver.logicalOrigin[1];
      const deltaX = nextLocalX - position.x;
      const deltaZ = nextLocalZ - position.z;
      position.x = nextLocalX;
      position.z = nextLocalZ;
      camera.entity.transform.position = position;
      orbit.target.x += deltaX;
      orbit.target.z += deltaZ;
    },
    setRiverInspectionView: () => {
      const bounds = riverWater.getHostDiagnostics().bodies.find(({ kind }) => kind === "river")?.logicalBounds;
      if (!bounds) return false;
      const centerX = (bounds.minX + bounds.maxX) * 0.5;
      const centerZ = (bounds.minZ + bounds.maxZ) * 0.5;
      const targetHeight = authoring.getProgram().sampleHeight(centerX, centerZ) + 2.5;
      const target = new Vector3(centerX, targetHeight, centerZ);
      const xExtent = bounds.maxX - bounds.minX;
      const zExtent = bounds.maxZ - bounds.minZ;
      const alongZ = zExtent >= xExtent;
      camera.entity.transform.setPosition(
        centerX + (alongZ ? 105 : 145),
        targetHeight + 78,
        centerZ + (alongZ ? 145 : 105)
      );
      camera.fieldOfView = 50;
      orbit.target.copyFrom(target);
      camera.entity.transform.lookAt(target);
      clipmap.snap(camera.entity.transform.worldPosition);
      authoring.invalidateDraft();
      return true;
    },
    setRiverCompositionView: () => driver.setRiverCompositionView(),
    resetPerformanceMetrics: () => authoring.resetPerformanceMetrics(),
    destroyForAcceptance: () => destroyPromptNoiseWorld(),
    loadWorldCodeV2: (worldCode) =>
      authoring.replaceProgram(migratePromptNoiseWorldCodeV2(worldCode), "PNW2 已迁移为 V3")
  };

  window.addEventListener(
    "beforeunload",
    () => {
      void destroyPromptNoiseWorld();
    },
    { once: true }
  );

  engine.run();
  await authoring.waitUntilReady();
  setLoading("等待 Grasslands 实时天空与 IBL…");
  await lighting.waitForFirstIBLBake();
  document.body.dataset.ready = "true";
  renderMetrics(driver.snapshot());
  console.info("[prompt-noise-world] READY", driver.snapshot());
}

interface GuiState extends PromptNoiseTerrainBaseV1 {
  overview: boolean;
  editingEnabled: boolean;
  wireframe: boolean;
  debugView: string;
  noiseOffsetX: number;
  noiseOffsetY: number;
  noiseOffsetZ: number;
  tool: PromptNoiseTerrainOperatorKind;
  templateId: PromptNoiseOperatorTemplateId;
  targetMode: PromptNoiseTargetModeV1;
  stressOperatorCount: number;
  length: number;
  bend: number;
  halfWidth: number;
  bankWidth: number;
  cutDepth: number;
  minimumDrop: number;
  bankHeight: number;
  sourceWidth: number;
  sourceDepth: number;
  sourceFlowSpeed: number;
  sourceBankFeather: number;
  middleWidth: number;
  middleDepth: number;
  middleFlowSpeed: number;
  middleBankFeather: number;
  mouthWidth: number;
  mouthDepth: number;
  mouthFlowSpeed: number;
  mouthBankFeather: number;
  radius: number;
  falloff: number;
  heightOffset: number;
  sampleRadius: number;
  strength: number;
  selectedOperator: string;
  selectedRiverPoint: string;
  riverCurveMode: PromptNoiseRiverCurveMode;
  riverPointX: number;
  riverPointZ: number;
  riverPointBedHeight: number;
  riverPointWidth: number;
  riverPointDepth: number;
  riverPointFlowSpeed: number;
  riverPointBankFeather: number;
  riverIncomingA: string;
  riverIncomingB: string;
  riverOutgoing: string;
  riverMergeRadius: number;
  riverNetworkSummary: string;
  worldSeedId: string;
  sha256: string;
  worldIdInput: number;
  status: string;
  pnw2Code: string;
  projection: boolean;
  dualScaling: boolean;
  autoShader: boolean;
  macroVariation: boolean;
  detiling: boolean;
  directLight: boolean;
  shadows: boolean;
  environment: boolean;
  fog: boolean;
  playing: boolean;
  timeHours: number;
  timeScale: number;
  postProcess: boolean;
  applyDraft(): void;
  cancelEdit(): void;
  editSelected(): void;
  deleteSelected(): void;
  moveEarlier(): void;
  moveLater(): void;
  insertRiverPoint(): void;
  deleteRiverPoint(): void;
  connectRiverConfluence(): void;
  disconnectRiverNetwork(): void;
  inspectRiverComposition(): void;
  undo(): void;
  redo(): void;
  loadWorldId(): void;
  exportWorld(): void;
  importWorld(): void;
  loadPnw2(): void;
}

function createGuiState(
  base: PromptNoiseTerrainBaseV1,
  lighting: ReturnType<TerrainLightingRuntime["getSnapshot"]>,
  postProcess: boolean,
  authoring: PromptNoiseTerrainAuthoring,
  driver: PureNoiseWorldDriver
): GuiState {
  const state = {
    ...base,
    overview: true,
    wireframe: false,
    debugView: "最终画面",
    noiseOffsetX: base.worldNoiseOffset[0],
    noiseOffsetY: base.worldNoiseOffset[1],
    noiseOffsetZ: base.worldNoiseOffset[2],
    ...authoring.controls,
    selectedOperator: "0",
    selectedRiverPoint: "0",
    riverCurveMode: "bezier",
    riverPointX: 0,
    riverPointZ: 0,
    riverPointBedHeight: 0,
    riverPointWidth: 1,
    riverPointDepth: 0,
    riverPointFlowSpeed: 0,
    riverPointBankFeather: 0,
    riverIncomingA: "0",
    riverIncomingB: "0",
    riverOutgoing: "0",
    riverMergeRadius: 8,
    riverNetworkSummary: "0 networks · 0 reaches · 0 junctions",
    worldSeedId: "pending",
    sha256: "pending",
    status: "初始化…",
    pnw2Code: "",
    projection: true,
    dualScaling: true,
    autoShader: true,
    macroVariation: true,
    detiling: true,
    directLight: lighting.direct,
    shadows: lighting.shadows,
    environment: lighting.environment,
    fog: lighting.fog,
    playing: lighting.playing,
    timeHours: lighting.timeHours,
    timeScale: lighting.timeScale,
    postProcess,
    applyDraft: () => void authoring.applyDraft(),
    cancelEdit: () => authoring.cancelEdit(),
    editSelected: () => {
      authoring.editOperator(Number(state.selectedOperator));
      syncAuthoringControls(state, authoring);
    },
    deleteSelected: () => void authoring.deleteOperator(Number(state.selectedOperator)),
    moveEarlier: () => void authoring.moveOperator(Number(state.selectedOperator), -1),
    moveLater: () => void authoring.moveOperator(Number(state.selectedOperator), 1),
    insertRiverPoint: () =>
      void authoring.insertRiverControlPoint(Number(state.selectedOperator), Number(state.selectedRiverPoint)),
    deleteRiverPoint: () =>
      void authoring.deleteRiverControlPoint(Number(state.selectedOperator), Number(state.selectedRiverPoint)),
    connectRiverConfluence: () =>
      void authoring.connectRiverConfluence(
        [Number(state.riverIncomingA), Number(state.riverIncomingB)],
        Number(state.riverOutgoing),
        state.riverMergeRadius
      ),
    disconnectRiverNetwork: () => void authoring.disconnectRiverNetwork(Number(state.selectedOperator)),
    inspectRiverComposition: () => void driver.setRiverCompositionView(),
    undo: () => void authoring.undo(),
    redo: () => void authoring.redo(),
    loadWorldId: () => void authoring.loadWorldId(state.worldIdInput),
    exportWorld: () => authoring.exportWorld(),
    importWorld: () => document.getElementById("world-import")!.click(),
    loadPnw2: () => void authoring.replaceProgram(migratePromptNoiseWorldCodeV2(state.pnw2Code), "PNW2 已迁移为 V3")
  } as GuiState;
  return state;
}

function syncAuthoringControls(state: GuiState, authoring: PromptNoiseTerrainAuthoring): void {
  Object.assign(state, authoring.controls);
}

type PromptNoisePlacementParameterName = keyof Pick<
  GuiState,
  | "length"
  | "bend"
  | "halfWidth"
  | "bankWidth"
  | "cutDepth"
  | "minimumDrop"
  | "bankHeight"
  | "sourceWidth"
  | "sourceDepth"
  | "sourceFlowSpeed"
  | "sourceBankFeather"
  | "middleWidth"
  | "middleDepth"
  | "middleFlowSpeed"
  | "middleBankFeather"
  | "mouthWidth"
  | "mouthDepth"
  | "mouthFlowSpeed"
  | "mouthBankFeather"
  | "radius"
  | "falloff"
  | "heightOffset"
  | "sampleRadius"
  | "strength"
>;

const PARAMETER_NAMES_BY_TOOL: Readonly<
  Record<PromptNoiseTerrainOperatorKind, ReadonlySet<PromptNoisePlacementParameterName>>
> = Object.freeze({
  river: new Set<PromptNoisePlacementParameterName>([
    "length",
    "bend",
    "halfWidth",
    "bankWidth",
    "cutDepth",
    "minimumDrop",
    "bankHeight",
    "sourceWidth",
    "sourceDepth",
    "sourceFlowSpeed",
    "sourceBankFeather",
    "middleWidth",
    "middleDepth",
    "middleFlowSpeed",
    "middleBankFeather",
    "mouthWidth",
    "mouthDepth",
    "mouthFlowSpeed",
    "mouthBankFeather",
    "strength"
  ]),
  flatten: new Set<PromptNoisePlacementParameterName>(["radius", "falloff", "heightOffset", "strength"]),
  smooth: new Set<PromptNoisePlacementParameterName>(["radius", "falloff", "sampleRadius", "strength"])
});

const RIVER_PROFILE_PARAMETER_NAMES = Object.freeze([
  "sourceWidth",
  "sourceDepth",
  "sourceFlowSpeed",
  "sourceBankFeather",
  "middleWidth",
  "middleDepth",
  "middleFlowSpeed",
  "middleBankFeather",
  "mouthWidth",
  "mouthDepth",
  "mouthFlowSpeed",
  "mouthBankFeather"
] as const satisfies readonly PromptNoisePlacementParameterName[]);

function addDraftParameter(
  folder: dat.GUI,
  state: GuiState,
  authoring: PromptNoiseTerrainAuthoring,
  property: PromptNoisePlacementParameterName,
  label: string,
  minimum: number,
  maximum: number,
  step: number
): dat.GUIController {
  const update = (value: number): void => {
    if (!Number.isFinite(value)) return;
    state[property] = value;
    authoring.controls[property] = value;
    authoring.invalidateDraft();
  };
  const controller = folder
    .add(state, property, minimum, maximum, step)
    .name(label)
    .onChange(update)
    .onFinishChange(update);
  const input = controller.domElement.querySelector<HTMLInputElement>("input");
  input?.addEventListener("input", () => update(Number(input.value)));
  return controller;
}

function templateOptions(tool: PromptNoiseTerrainOperatorKind): Record<string, PromptNoiseOperatorTemplateId> {
  if (tool === "river") return { 浅溪: "river-shallow", 宽河谷: "river-wide", 峡谷: "river-canyon" };
  if (tool === "flatten") return { 营地: "flatten-camp", 小型台地: "flatten-plateau", 大型平原: "flatten-plain" };
  return { 轻度柔化: "smooth-light", 强去峰: "smooth-strong", 大范围柔化: "smooth-large" };
}

function defaultTemplate(tool: PromptNoiseTerrainOperatorKind): PromptNoiseOperatorTemplateId {
  return tool === "river" ? "river-shallow" : tool === "flatten" ? "flatten-plateau" : "smooth-strong";
}

function isEditableElement(target: EventTarget | null): boolean {
  return (
    (target instanceof HTMLInputElement && target.type !== "range" && target.type !== "checkbox") ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

function operatorOptions(authoring: PromptNoiseTerrainAuthoring): Record<string, string> {
  const options: Record<string, string> = { 未选择: "0" };
  for (const entry of authoring.listOperators()) options[entry.label] = String(entry.id);
  return options;
}

function riverReachOptions(authoring: PromptNoiseTerrainAuthoring): Record<string, string> {
  const options: Record<string, string> = { 未选择: "0" };
  for (const entry of authoring.listOperators()) {
    if (authoring.listRiverControlPoints(entry.id).length > 0) options[`Reach #${entry.id}`] = String(entry.id);
  }
  return options;
}

type ComponentConstructor<T extends Component> = new (entity: Entity) => T;

function findRequiredComponent<T extends Component>(
  roots: readonly Entity[],
  componentType: ComponentConstructor<T>,
  label: string
): T {
  for (const root of roots) {
    const components: T[] = [];
    root.getComponentsIncludeChildren(componentType, components);
    if (components.length > 0) return components[0];
  }
  throw new Error(`Grasslands Scene is missing ${label}`);
}

function deactivateGrasslandsWorldContent(roots: readonly Entity[]): void {
  const components: Component[] = [
    findRequiredComponent(roots, TerrainProjectWorldRuntime, "TerrainProjectWorldRuntime"),
    findRequiredComponent(roots, TerrainProjectClipmapRuntime, "TerrainProjectClipmapRuntime"),
    findRequiredComponent(roots, TerrainProjectDetailRuntime, "TerrainProjectDetailRuntime"),
    findRequiredComponent(roots, TerrainProjectTreeRuntime, "TerrainProjectTreeRuntime"),
    findRequiredComponent(roots, TerrainProjectPlacedPrefabRuntime, "TerrainProjectPlacedPrefabRuntime"),
    findRequiredComponent(roots, TerrainWaterRuntime, "TerrainWaterRuntime")
  ];
  for (const component of components) component.entity.isActive = false;
}

function renderMetrics(snapshot: PureNoiseSnapshot): void {
  const authoring = snapshot.authoring;
  const waterDrawCount = snapshot.waterHost.bodies.reduce(
    (sum, body) => sum + body.activation.runtimeMetrics.drawCount,
    0
  );
  document.getElementById("metrics")!.innerHTML =
    `<strong class="good">READY · OPERATOR LAB · DPR ${snapshot.dpr}</strong><pre>${[
      `renderer  ${snapshot.renderer}`,
      `clipmap   ${snapshot.activeClipmapSegments} segments · ${MESH_LODS} LODs`,
      `geometry  ${snapshot.clipmapGeometry.fullTopologyTriangles.toLocaleString()} tris · ${snapshot.clipmapGeometry.fullTopologyVertices.toLocaleString()} verts`,
      `network   heightmap 0 B · alphamap 0 B · regions 0`,
      `layers    Rock + Grass · ${formatBytes(snapshot.textureSourceBytes)} reused`,
      `operators ${authoring.committedOperatorCount} committed · ${authoring.activeOperatorCount} active`,
      `table     ${formatBytes(authoring.operatorTableBytes)} file · ${formatBytes(authoring.activeOperatorBytes)} GPU records`,
      `field     ${authoring.totalRiverControlPointCount} points · ${authoring.riverReachCount} reaches · ${authoring.riverFieldSegmentCount} segments · ${authoring.riverFieldCellCount} cells`,
      `field GPU ${formatBytes(authoring.riverFieldBytes)} · occupancy ${authoring.riverFieldMaximumCellSegmentCount}/8 · uploads ${authoring.riverFieldUploadCount}`,
      `draft     ${authoring.draftTool ?? "no hit"} · stress ${authoring.stressOperatorCount || "off"}`,
      `delta     ${authoring.heightDeltaRange.map((value) => value.toFixed(2)).join(" … ")} m · slope ${authoring.maximumSlope.toFixed(2)}`,
      `pick      ${authoring.pickMilliseconds[0].toFixed(2)} / ${authoring.pickMilliseconds[1].toFixed(2)} ms p50/p95`,
      `frame     ${authoring.frameMilliseconds[0].toFixed(2)} / ${authoring.frameMilliseconds[1].toFixed(2)} ms p50/p95`,
      `world ID  ${authoring.worldId} · ${authoring.sha256.slice(0, 16)}…`,
      `origin    ${snapshot.logicalOrigin.map((value) => value.toFixed(0)).join(", ")}`,
      `lighting  ${snapshot.lighting.timeHours.toFixed(1)}h · fog ${snapshot.lighting.fog ? "on" : "off"} · shadow ${snapshot.lighting.shadows ? "on" : "off"} ${snapshot.shadowCascade.distance.toFixed(0)}m`,
      `post      ${snapshot.postProcess.enabled ? "on" : "off"} · tone ${snapshot.postProcess.tonemapping ? "on" : "off"} · bloom ${snapshot.postProcess.bloom.enabled ? "on" : "off"}`,
      `weather   snow ${snapshot.environment.surface.snowCover.toFixed(2)} · rain ${snapshot.environment.weather.precipitation.rainRate.toFixed(2)}`,
      `water     ${snapshot.riverWater.riverCount} rivers · ${snapshot.riverWater.active ? "active" : snapshot.riverWater.compiling ? "compiling" : "off"} · compile ${snapshot.riverWater.compileCount} · upload ${snapshot.riverWater.chunkCount} · draw ${waterDrawCount} · ${formatBytes(snapshot.riverWater.waterBytes)}${snapshot.riverWater.widthLimitedRiverCount > 0 ? ` · width-limited ${snapshot.riverWater.widthLimitedRiverCount}` : ""}`,
      `scene     ${snapshot.decoration.vegetationCount} vegetation · ${snapshot.decoration.riverBankRockCount} bank rocks · ${snapshot.decoration.bridgeCount} bridge · query ${snapshot.decoration.waterQueryHitCount}/${snapshot.decoration.waterQuerySampleCount}`,
      `status    ${authoring.status}`
    ].join("\n")}</pre>`;
}

function setLoading(message: string): void {
  document.getElementById("loading-status")!.textContent = message;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MiB`;
}
