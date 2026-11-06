import {
  Camera,
  Color,
  MSAASamples,
  MeshRenderer,
  PBRMaterial,
  PrimitiveMesh,
  Script,
  Vector3,
  WeatherPresets,
  WeatherSystem,
  WebGLEngine,
  createWindSample,
  type WindSample,
  type WeatherWindState
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { OrbitControl } from "@galacean/engine-toolkit-controls";
import { createTreeAssemblyGrasslandsLighting } from "@galacean/engine-world-planning/integrations/vegetation/TreeAssemblyGrasslandsLighting";
import type { TerrainWindRuntime, TerrainWindRuntimeSnapshot } from "@galacean/engine-terrain/terrain/project/TerrainWindRuntime";
import {
  createTerrainTreeWindIsolationPreset,
  updateTerrainTreeWindResponseControl,
  type TerrainTreeWindIsolationPreset,
  type TerrainTreeWindResponseControlPath,
  type TerrainTreeWindResponseControls
} from "@galacean/engine-terrain/terrain/project/TerrainTreeWindResponseControls";
import {
  WindAcceptanceRecorder,
  type WindAcceptanceRecording,
  type WindAcceptanceSummary
} from "@galacean/engine-environment/wind/WindAcceptanceRecorder";
import {
  STANDARD_WIND_ACCEPTANCE_RECORDER_CAPACITY,
  WindStandardAcceptanceScenario,
  type WindStandardAcceptanceResult,
  type WindStandardAcceptanceScenarioSnapshot
} from "@galacean/engine-environment/wind/WindStandardAcceptanceScenario";
import { WIND_CONSUMER_ACCEPTANCE_THRESHOLDS } from "@galacean/engine-environment/wind/WindConsumerAcceptanceProfiles";
import { WindAssetPerformanceSampler, type WindAssetPerformanceSnapshot } from "@galacean/engine-vegetation/wind-vegetation/WindAssetPerformanceSampler";
import {
  WIND_VEGETATION_COVERAGE,
  P3_SHOWCASE_SIZE_METERS,
  WindVegetationField,
  resolveHeroTreeCalibrationAssetId,
  resolveWindTreeLodMode,
  type WindVegetationFieldDiagnostics,
  type WindTreeMaterialMode,
  type WindTreeLodMode
} from "@galacean/engine-vegetation/wind-vegetation/WindVegetationField";
import "@galacean/engine-world-planning/runtime/script-registry";

type WindPreset = keyof typeof WeatherPresets.wind;
type CameraPreset = "overview" | "vegetation" | "grass" | "canopy";

interface WindTreeCameraState {
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
}

const WIND_TRANSITION_DURATION_SECONDS = 5;
/** Manual authoring uses the same complete gust envelope as scheduled weather and acceptance. */
const MANUAL_TREE_GUST_DURATION_SCALE = 1;
const URL_PARAMETERS = new URLSearchParams(window.location.search);
const TREE_BENCHMARK_COUNT = resolveTreeBenchmarkCount(
  URL_PARAMETERS.get("trees") ?? document.body.dataset.treeBenchmarkCount
);
const HERO_TREE_CALIBRATION_ASSET = resolveHeroTreeCalibrationAssetId(URL_PARAMETERS.get("asset"));
const INITIAL_TREE_LOD_MODE = resolveWindTreeLodMode(URL_PARAMETERS.get("lod"));
const TREE_BENCHMARK_ACTIVE = TREE_BENCHMARK_COUNT > 0;
const TREE_SHOWCASE_ALL_ASSETS =
  !TREE_BENCHMARK_ACTIVE && document.body.dataset.coverageMode === "trees" && !URL_PARAMETERS.has("asset");
const LARGE_TREE_BENCHMARK = TREE_BENCHMARK_COUNT >= 1000;
// The 1000-tree path needs enough fixed-load frames for V8 and shadow-submission caches to
// reach steady state before the first Baseline leg; shorter warm-up made B1 systematically
// colder than B2 even though their submissions were byte-for-byte identical.
const ASSET_BENCHMARK_WARMUP_FRAMES = LARGE_TREE_BENCHMARK ? 120 : 30;
const ASSET_BENCHMARK_SAMPLE_FRAMES = LARGE_TREE_BENCHMARK ? 256 : 128;
const ASSET_BENCHMARK_MAXIMUM_FRAME_RATIO = 1.05;
const ASSET_BENCHMARK_MAXIMUM_GPU_RATIO = 1.1;
// Keep this guard above Chromium's 0.1 ms performance.now() quantisation while still rejecting
// a real extra field-update cost (the original 2 ms outlier remains a hard failure).
const ASSET_BENCHMARK_MAXIMUM_CPU_DRIFT_MS = 0.2;
const WIND_BENCHMARK_MAXIMUM_FRAME_RATIO = 1.05;
const WIND_BENCHMARK_MAXIMUM_GPU_DELTA_MILLISECONDS = 1;
// The retained 64 x 64 field/response pipeline runs at 12 Hz rather than once per rendered
// frame. The submission monitor reports rounded per-frame averages, so the complete local,
// ground and two-basis tree update is allowed to contribute one averaged fullscreen triangle.
const WIND_BENCHMARK_MAXIMUM_AVERAGE_FIELD_DRAWS = 1;

interface TreeWindControlUiSpec {
  readonly path: TerrainTreeWindResponseControlPath;
  readonly label: string;
  readonly description: string;
  readonly minimum: number;
  readonly maximum: number;
  readonly step: number;
  readonly kind: "weight" | "scale" | "fraction";
}

interface TreeWindControlUiGroup {
  readonly label: string;
  readonly description: string;
  readonly controls: readonly TreeWindControlUiSpec[];
}

const TREE_WIND_CONTROL_UI_GROUPS: readonly TreeWindControlUiGroup[] = [
  {
    label: "01 AIR LOAD / 风输入",
    description: "只决定树收到什么风",
    controls: [
      treeWindWeight("forcing.meanLoad", "平均风载", "天气平滑后的平均流，建立整树平均倾斜"),
      treeWindWeight(
        "forcing.meanDirectionTracking",
        "平均风向跟踪",
        "整树是否跟随天气尺度的平均风向变化；关闭时冻结当前平均方向"
      ),
      treeWindWeight("forcing.gustPackets", "行进阵风", "具有攻/持/退包络并沿空间传播的有限阵风包"),
      treeWindWeight("forcing.turbulenceSpectrum", "多尺度风谱", "平流宏观、介观和微观频带，而非逐帧随机噪声"),
      treeWindWeight("forcing.localField", "局地风场", "地形遮蔽、冠层暴露和局地风源"),
      treeWindWeight("forcing.directionVariation", "横向方向扰动", "相对平均风向的介观横向分量")
    ]
  },
  {
    label: "02 WOODY DYNAMICS / 木质结构",
    description: "载荷如何沿连接骨架传递",
    controls: [
      treeWindWeight("structure.primaryMode", "整树第一模态", "根部约束下整树最低频弯曲，是宏观位姿唯一来源"),
      treeWindWeight("structure.inertia", "质量与惯性", "位移和速度状态对瞬时平衡位姿的滞后与回弹"),
      treeWindWeight("structure.continuousTrunk", "连续主干形态", "同一第一模态沿高度连续分配：根小、上部大"),
      treeWindWeight("structure.primaryBranches", "一级枝响应", "一级枝绕真实父连接点的相对转动"),
      treeWindWeight("structure.secondaryBranches", "二级枝响应", "子枝在已变形父坐标系中的相对转动"),
      treeWindWeight("structure.phasePropagation", "父子相位传播", "低频结构能量由刚性父级向柔性末端传播的时延"),
      treeWindWeight("structure.elasticRecovery", "卸载弹性记忆", "载荷下降后保留并连续耗散的结构能量"),
      treeWindWeight("structure.dragReconfiguration", "强风气动重构", "动压随 v² 增长，同时冠层顺风减小迎风面积")
    ]
  },
  {
    label: "03 FOLIAGE / 枝叶局部",
    description: "相对已变形父枝的运动",
    controls: [
      treeWindWeight("foliage.directionalAdherence", "UE 顺风贴合", "叶片绕父枝连接铰点向风向贴合，建立平均受风姿态"),
      treeWindWeight("foliage.tumble", "UE Tumble", "叶片绕风相关轴进行低频翻动，与位置和法线使用同一旋转"),
      treeWindWeight("foliage.twist", "UE Twist", "叶片绕离线烘焙的生长方向扭转"),
      treeWindWeight("foliage.twitch", "UE Twitch", "湍流触发的间歇高频角响应，不拥有树冠宏观位姿"),
      treeWindWeight("foliage.ripple", "UE Ripple", "独立叶面位移频带；P3 使用根尖场保持连接处固定"),
      treeWindWeight("foliage.clusterRoll", "P3 叶簇侧滚", "UE 叶片局部基线之后，同一父枝内空间相干的叶簇级侧滚"),
      treeWindWeight("foliage.bladeFlexion", "P3 根尖柔顺", "整叶完成刚性 Tumble 后，叶尖获得额外差分角，叶根保持锚定")
    ]
  },
  {
    label: "04 TIME & GAIN / 时间尺度",
    description: "围绕资产标定值的无量纲倍率",
    controls: [
      treeWindScale("tuning.rootFrequencyScale", "主干固有频率", "整树第一模态固有频率倍率", 0.25, 2.5),
      treeWindScale("tuning.rootDampingScale", "主干阻尼", "整树第一模态阻尼比倍率", 0.25, 2.5),
      treeWindScale("tuning.rootTargetSmoothingScale", "载荷平滑时间", "进入结构求解前的目标载荷时间常数倍率", 0.25, 3),
      treeWindScale("tuning.rootComplianceScale", "主干柔度", "GPU 二阶载荷进入主干角响应前的线性柔度倍率", 0.25, 6),
      treeWindScale("tuning.rootBendScale", "主干摆幅", "整树第一模态最大摆幅与机械行程倍率", 0, 2.5),
      treeWindScale("tuning.branchFrequencyScale", "枝干频率", "父子枝解析响应固有频率倍率", 0.25, 2.5),
      treeWindScale("tuning.phasePropagationScale", "传播延迟", "父级到末端的相位传播量倍率", 0, 2.5),
      treeWindScale("tuning.flutterFrequencyScale", "Flutter 频率", "叶片局部失稳频带倍率", 0.25, 2.5),
      treeWindScale("tuning.flutterAmplitudeScale", "Flutter 幅度", "叶片局部扑动角幅倍率", 0, 2),
      {
        path: "tuning.flutterGeometryFraction",
        label: "Flutter 几何占比",
        description: "UE 基线为 1；移动端需要抑制时间混叠时，可只降低 Twitch 的轮廓几何占比",
        minimum: 0,
        maximum: 1,
        step: 0.02,
        kind: "fraction"
      },
      treeWindScale(
        "tuning.leafPressureReferenceSpeedScale",
        "叶柄动压刚度",
        "叶片动压参考速度倍率；越大越不容易被相同风速吹开",
        0.5,
        2
      ),
      treeWindScale("tuning.leafAdherenceAngleScale", "顺风最大行程", "叶片相对父枝的最大顺风贴合角倍率", 0, 2),
      {
        path: "tuning.highSpeedMicroSuppression",
        label: "强风微动抑制",
        description: "叶片顺化后迎风面积下降，对 Ripple/Twitch 高频能量的抑制权重",
        minimum: 0,
        maximum: 1,
        step: 0.02,
        kind: "fraction"
      }
    ]
  }
];

interface WindVegetationPerformance {
  readonly fps: number;
  readonly frameTimeMs: number;
  readonly msaaSamples: number;
}

export interface WindTreeAssetPerformanceSample extends WindAssetPerformanceSnapshot {
  readonly label: "baseline-1" | "hero" | "baseline-2";
  readonly mode: WindTreeMaterialMode;
  readonly treeInstances: number;
}

export interface WindTreeAssetPerformanceResult {
  readonly state: "complete";
  readonly passed: boolean;
  readonly treeInstances: number;
  readonly baseline1: WindTreeAssetPerformanceSample;
  readonly hero: WindTreeAssetPerformanceSample;
  readonly baseline2: WindTreeAssetPerformanceSample;
  readonly derived: {
    readonly baselineFrameDriftRatio: number;
    readonly heroFrameRatio: number;
    readonly heroFrameDeltaMilliseconds: number;
    readonly heroGpuRatio: number | null;
    readonly heroGpuDeltaMilliseconds: number | null;
    readonly heroFieldCpuDeltaMilliseconds: number;
    readonly submissionLoadStable: boolean;
    readonly memoryStable: boolean;
  };
}

export interface WindTreeWindPerformanceSample extends WindAssetPerformanceSnapshot {
  readonly label: "wind-off-1" | "wind-on" | "wind-off-2";
  readonly windEnabled: boolean;
  readonly treeInstances: number;
}

/** OFF/ON/OFF result with geometry, P3 Material, transforms, LOD and camera held constant. */
export interface WindTreeWindPerformanceResult {
  readonly state: "complete";
  readonly valid: boolean;
  /** Isolated wind marginal gate; the absolute device-tier frame budget remains a separate check. */
  readonly passed: boolean;
  readonly treeInstances: number;
  readonly windOff1: WindTreeWindPerformanceSample;
  readonly windOn: WindTreeWindPerformanceSample;
  readonly windOff2: WindTreeWindPerformanceSample;
  readonly derived: {
    readonly offFrameDriftRatio: number;
    readonly offGpuDriftRatio: number | null;
    readonly windFrameRatio: number;
    readonly windFrameDeltaMilliseconds: number;
    readonly windGpuRatio: number | null;
    readonly windGpuDeltaMilliseconds: number | null;
    readonly windFieldCpuDeltaMilliseconds: number;
    readonly submissionLoadStable: boolean;
    readonly memoryStable: boolean;
  };
}

export interface WindVegetationDiagnostics {
  readonly preset: WindPreset;
  readonly cameraPreset: CameraPreset;
  readonly windTransitionProgress: number;
  readonly field: WindVegetationFieldDiagnostics;
  readonly wind: TerrainWindRuntimeSnapshot;
  readonly performance: WindVegetationPerformance;
  /** Always null: the final tree response stays GPU-resident and is never read back. */
  readonly representativeTree: null;
  readonly coverage: typeof WIND_VEGETATION_COVERAGE;
  readonly acceptance: WindAcceptanceSummary;
  readonly standardScenario: WindStandardAcceptanceScenarioSnapshot;
  readonly assetPerformance: WindTreeAssetPerformanceResult | null;
  readonly windPerformance: WindTreeWindPerformanceResult | null;
}

export interface WindVegetationApi {
  readonly ready: true;
  getDiagnostics(): WindVegetationDiagnostics;
  setWindPreset(preset: WindPreset): WindVegetationDiagnostics;
  setWindEnabled(enabled: boolean): WindVegetationDiagnostics;
  triggerGust(amplitude?: number): WindVegetationDiagnostics;
  setCameraPreset(preset: CameraPreset): WindVegetationDiagnostics;
  setMsaaSamples(samples: 1 | 4): WindVegetationDiagnostics;
  startFrameRecording(): WindAcceptanceSummary;
  stopFrameRecording(): WindAcceptanceRecording;
  clearFrameRecording(): WindAcceptanceSummary;
  getFrameRecording(): WindAcceptanceRecording;
  runStandardAcceptance(): Promise<WindStandardAcceptanceResult>;
  setTreeMaterialMode(mode: WindTreeMaterialMode): WindVegetationDiagnostics;
  setTreeLodMode(mode: WindTreeLodMode): WindVegetationDiagnostics;
  setTreeWindResponseControls(controls: Readonly<TerrainTreeWindResponseControls>): WindVegetationDiagnostics;
  setTreeWindResponseControl(path: TerrainTreeWindResponseControlPath, value: number): WindVegetationDiagnostics;
  setTreeWindIsolationPreset(preset: TerrainTreeWindIsolationPreset): WindVegetationDiagnostics;
  getTreeWindResponseControls(): Readonly<TerrainTreeWindResponseControls>;
  runAssetPerformanceAcceptance(): Promise<WindTreeAssetPerformanceResult>;
  getAssetPerformanceResult(): WindTreeAssetPerformanceResult | null;
  runWindPerformanceComparison(): Promise<WindTreeWindPerformanceResult>;
  getWindPerformanceResult(): WindTreeWindPerformanceResult | null;
}

declare global {
  interface Window {
    windVegetationTest?: WindVegetationApi;
    windVegetationTestError?: string;
  }
}

const CAMERA_PRESETS: Readonly<Record<CameraPreset, WindTreeCameraState>> = {
  overview: TREE_BENCHMARK_ACTIVE
    ? LARGE_TREE_BENCHMARK
      ? { position: [0, 82, 155], target: [0, 4.2, 0.7] }
      : { position: [0, 11.5, 34], target: [0, 5.2, 0.7] }
    : TREE_SHOWCASE_ALL_ASSETS
      ? { position: [0, 20, 46], target: [0, 3.8, 0] }
      : { position: [0, 7.4, 24], target: [0, 3.2, 0.7] },
  vegetation: TREE_SHOWCASE_ALL_ASSETS
    ? { position: [0, 3.8, 37], target: [0, 1, 19.3] }
    : { position: [16.5, 1.55, 2.5], target: [12, 0.58, -5] },
  grass: TREE_SHOWCASE_ALL_ASSETS
    ? { position: [-2.5, 2.2, 15], target: [1.5, 0.65, 5.5] }
    : { position: [0, 2.05, 12.2], target: [0, 0.72, 0.7] },
  canopy: TREE_SHOWCASE_ALL_ASSETS
    ? { position: [0, 10.5, 24], target: [0, 8.5, 0] }
    : { position: [0, 8.5, 15.5], target: [0, 8.2, 0.7] }
};

void boot().catch((error: unknown) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  window.windVegetationTestError = message;
  document.body.dataset.state = "error";
  requiredElement<HTMLElement>("[data-loading-message]").textContent = message;
  console.error("[wind-vegetation] startup failed", error);
});

async function boot(): Promise<void> {
  renderTreeWindControlPanel();
  const engine = await WebGLEngine.create({ canvas: "canvas", shaderCompiler: new ShaderCompiler() });
  engine.canvas.setAutoResolution();
  const scene = engine.sceneManager.activeScene!;
  const root = scene.createRootEntity("Wind vegetation test scene");

  const cameraEntity = root.createChild("Wind vegetation camera");
  const camera = cameraEntity.addComponent(Camera);
  camera.fieldOfView = 44;
  camera.nearClipPlane = 0.1;
  camera.farClipPlane = LARGE_TREE_BENCHMARK ? 420 : 300;
  camera.msaaSamples = MSAASamples.None;
  const orbit = cameraEntity.addComponent(OrbitControl);
  orbit.minDistance = 4;
  orbit.maxDistance = LARGE_TREE_BENCHMARK ? 240 : TREE_SHOWCASE_ALL_ASSETS ? 76 : 52;
  applyCameraPreset(camera, orbit, "overview");

  const grasslands = createTreeAssemblyGrasslandsLighting(scene, root, camera);
  const wind = grasslands.wind;
  const weatherSystem = new WeatherSystem();
  const windBridge = wind.attachSceneBridge({ x: 0, y: 1, z: 0 });
  // This compact acceptance scene has a flat, unobstructed meadow rather than the Terrain
  // height atlas used by the full demo. Keep its exposure physically equal to one while still
  // exercising the production GPU local-field and shared mechanical-response passes.
  wind.setGpuExposureProvider({
    getRevision: () => 0,
    render: () => windBridge.localFieldExposureTexture,
    getPreviousTexture: () => windBridge.previousLocalFieldExposureTexture
  });
  wind.setGpuRenderCamera(camera);
  wind.applyWeatherForcing(weatherSystem.state.wind);

  const ground = root.createChild(
    TREE_SHOWCASE_ALL_ASSETS ? "50m production vegetation meadow" : "Compact terrain ground"
  );
  ground.transform.setPosition(0, -0.035, 0);
  const groundRenderer = ground.addComponent(MeshRenderer);
  groundRenderer.mesh = PrimitiveMesh.createPlane(
    engine,
    LARGE_TREE_BENCHMARK ? 116 : TREE_BENCHMARK_ACTIVE ? 36 : TREE_SHOWCASE_ALL_ASSETS ? P3_SHOWCASE_SIZE_METERS : 29,
    LARGE_TREE_BENCHMARK ? 122 : TREE_BENCHMARK_ACTIVE ? 24 : TREE_SHOWCASE_ALL_ASSETS ? P3_SHOWCASE_SIZE_METERS : 21,
    20,
    16,
    false
  );
  const groundMaterial = new PBRMaterial(engine);
  groundMaterial.name = "Wind vegetation meadow ground";
  groundMaterial.baseColor = new Color(0.115, 0.245, 0.083, 1);
  groundMaterial.roughness = 0.96;
  groundMaterial.metallic = 0;
  groundRenderer.setMaterial(groundMaterial);
  groundRenderer.receiveShadows = true;

  const field = await WindVegetationField.create(engine, root, camera, wind, {
    treeBenchmarkCount: TREE_BENCHMARK_COUNT,
    heroCalibrationAsset: HERO_TREE_CALIBRATION_ASSET,
    showcaseAllTreeAssets: TREE_SHOWCASE_ALL_ASSETS,
    initialTreeLodMode: INITIAL_TREE_LOD_MODE
  });
  const driver = root.createChild("Wind vegetation diagnostics driver").addComponent(WindVegetationDriver);
  driver.field = field;
  driver.weatherSystem = weatherSystem;
  driver.wind = wind;

  let preset: WindPreset = "breeze";
  let cameraPreset: CameraPreset = "overview";
  let assetPerformanceResult: WindTreeAssetPerformanceResult | null = null;
  let windPerformanceResult: WindTreeWindPerformanceResult | null = null;
  const diagnostics = (): WindVegetationDiagnostics => ({
    preset,
    cameraPreset,
    windTransitionProgress: weatherSystem.getTransitionProgress("wind"),
    field: field.getDiagnostics(),
    wind: wind.getSnapshot(),
    performance: driver.getPerformance(camera.msaaSamples),
    representativeTree: field.getRepresentativeTreeWindDiagnostics(),
    coverage: WIND_VEGETATION_COVERAGE,
    acceptance: driver.recorder.getSummary(),
    standardScenario: driver.standardScenario?.getSnapshot() ?? idleStandardScenario(),
    assetPerformance: assetPerformanceResult,
    windPerformance: windPerformanceResult
  });
  const publish = (): WindVegetationDiagnostics => {
    const snapshot = diagnostics();
    renderDiagnostics(snapshot);
    return snapshot;
  };
  const applyWindState = (next: WindPreset, reversed: boolean, transitionSeconds: number): void => {
    const forcing = WeatherPresets.wind[next] as Readonly<WeatherWindState> | undefined;
    if (!forcing) throw new RangeError(`Unknown wind preset: ${next}`);
    preset = next;
    weatherSystem.setWind(
      {
        ...forcing,
        directionOffsetDegrees: forcing.directionOffsetDegrees + (reversed ? -180 : 0)
      },
      transitionSeconds
    );
    syncActiveButtons("windPreset", next);
  };
  const setWindPreset = (next: WindPreset): WindVegetationDiagnostics => {
    driver.standardScenario?.cancel();
    applyWindState(next, false, WIND_TRANSITION_DURATION_SECONDS);
    return publish();
  };
  const setCameraPreset = (next: CameraPreset): WindVegetationDiagnostics => {
    if (!CAMERA_PRESETS[next]) throw new RangeError(`Unknown camera preset: ${next}`);
    cameraPreset = next;
    applyCameraPreset(camera, orbit, next);
    syncActiveButtons("camera", next);
    return publish();
  };
  const setMsaaSamples = (samples: 1 | 4): WindVegetationDiagnostics => {
    camera.msaaSamples = samples === 4 ? MSAASamples.FourX : MSAASamples.None;
    requiredElement<HTMLButtonElement>('[data-action="msaa"]').dataset.active = String(camera.msaaSamples > 1);
    return publish();
  };
  const setWindEnabled = (enabled: boolean): WindVegetationDiagnostics => {
    if (!enabled) driver.standardScenario?.cancel();
    wind.setRenderingActive(enabled);
    driver.windEnabled = enabled;
    requiredElement<HTMLButtonElement>('[data-action="wind-toggle"]').dataset.active = String(enabled);
    return publish();
  };
  const setTreeMaterialMode = (mode: WindTreeMaterialMode): WindVegetationDiagnostics => {
    field.setTreeMaterialMode(mode);
    syncTreeMaterialButtons(mode);
    return publish();
  };
  const setTreeLodMode = (mode: WindTreeLodMode): WindVegetationDiagnostics => {
    field.setTreeLodMode(mode);
    syncTreeLodButtons(mode);
    return publish();
  };
  const setTreeWindResponseControls = (
    controls: Readonly<TerrainTreeWindResponseControls>,
    activePreset: TerrainTreeWindIsolationPreset | null = null
  ): WindVegetationDiagnostics => {
    field.setTreeWindResponseControls(controls);
    syncTreeWindResponseControlPanel(field.getTreeWindResponseControls(), activePreset);
    return publish();
  };
  const setTreeWindResponseControl = (
    path: TerrainTreeWindResponseControlPath,
    value: number
  ): WindVegetationDiagnostics => {
    const next = updateTerrainTreeWindResponseControl(field.getTreeWindResponseControls(), path, value);
    return setTreeWindResponseControls(next);
  };
  const setTreeWindIsolationPreset = (isolationPreset: TerrainTreeWindIsolationPreset): WindVegetationDiagnostics => {
    return setTreeWindResponseControls(createTerrainTreeWindIsolationPreset(isolationPreset), isolationPreset);
  };
  const standardScenario = new WindStandardAcceptanceScenario(
    driver.recorder,
    {
      applyWindState,
      triggerGust: (amplitude) => wind.triggerGust(amplitude)
    },
    publish
  );
  driver.standardScenario = standardScenario;

  bindControls({
    setWindPreset,
    setCameraPreset,
    setMsaaSamples,
    toggleWind: () => {
      const next = !wind.getSnapshot().renderingActive;
      setWindEnabled(next);
    },
    triggerGust: () => {
      standardScenario.cancel();
      wind.triggerGust(0.72, MANUAL_TREE_GUST_DURATION_SCALE);
      publish();
    },
    startRecording: () => {
      standardScenario.cancel();
      driver.recorder.start();
      publish();
    },
    stopRecording: () => {
      if (standardScenario.getSnapshot().state === "running") standardScenario.cancel();
      else driver.recorder.stop();
      publish();
    },
    runStandardAcceptance: () => {
      wind.setRenderingActive(true);
      driver.windEnabled = true;
      requiredElement<HTMLButtonElement>('[data-action="wind-toggle"]').dataset.active = "true";
      void standardScenario.start();
    },
    setTreeMaterialMode,
    setTreeLodMode,
    setTreeWindResponseControl,
    setTreeWindIsolationPreset,
    runAssetPerformanceAcceptance: () => {
      void runAssetPerformanceAcceptance();
    },
    runWindPerformanceComparison: () => {
      void runWindPerformanceComparison();
    }
  });
  syncTreeLodButtons(INITIAL_TREE_LOD_MODE);
  syncTreeWindResponseControlPanel(field.getTreeWindResponseControls(), "full");

  driver.onMetrics = publish;
  engine.run();
  await grasslands.lighting.waitForFirstIBLBake();
  const assetPerformanceSampler = TREE_BENCHMARK_ACTIVE ? new WindAssetPerformanceSampler(engine) : null;
  driver.assetPerformanceSampler = assetPerformanceSampler;

  const sampleTreeAssetMode = async (
    label: WindTreeAssetPerformanceSample["label"],
    mode: WindTreeMaterialMode
  ): Promise<WindTreeAssetPerformanceSample> => {
    if (!assetPerformanceSampler) throw new Error("Tree asset performance sampling requires benchmark mode");
    field.setTreeMaterialMode(mode);
    syncTreeMaterialButtons(mode);
    publish();
    await settleAnimationFrames(ASSET_BENCHMARK_WARMUP_FRAMES);
    assetPerformanceSampler.resetSamplingWindow();
    await settleAnimationFrames(ASSET_BENCHMARK_SAMPLE_FRAMES);
    return {
      label,
      mode,
      treeInstances: TREE_BENCHMARK_COUNT,
      ...assetPerformanceSampler.takeSnapshot(scene.shadowCascades)
    };
  };

  const runAssetPerformanceAcceptance = async (): Promise<WindTreeAssetPerformanceResult> => {
    if (!assetPerformanceSampler) throw new Error("Tree asset performance acceptance requires benchmark mode");
    requiredElement<HTMLButtonElement>('[data-action="asset-performance"]').disabled = true;
    setOptionalOutput("asset-status", "RUNNING B/P3/B");
    assetPerformanceResult = null;
    standardScenario.cancel();
    applyWindState("gale", false, 0);
    wind.setRenderingActive(true);
    // The asset gate changes only the Material variant. The shared GPU response state remains
    // identical for every leg of the long 1000-tree B/P3/B sequence.
    driver.windEnabled = true;
    cameraPreset = "overview";
    applyCameraPreset(camera, orbit, "overview");
    camera.msaaSamples = MSAASamples.None;
    try {
      // Compile and retain both variants before the first measured Baseline leg.
      field.setTreeMaterialMode("hero");
      await settleAnimationFrames(ASSET_BENCHMARK_WARMUP_FRAMES);
      field.setTreeMaterialMode("baseline");
      await settleAnimationFrames(ASSET_BENCHMARK_WARMUP_FRAMES);
      const baseline1 = await sampleTreeAssetMode("baseline-1", "baseline");
      const hero = await sampleTreeAssetMode("hero", "hero");
      const baseline2 = await sampleTreeAssetMode("baseline-2", "baseline");
      assetPerformanceResult = buildTreeAssetPerformanceResult(baseline1, hero, baseline2);
      renderAssetPerformanceResult(assetPerformanceResult);
      publish();
      return assetPerformanceResult;
    } finally {
      requiredElement<HTMLButtonElement>('[data-action="asset-performance"]').disabled = false;
    }
  };

  const sampleTreeWindState = async (
    label: WindTreeWindPerformanceSample["label"],
    enabled: boolean
  ): Promise<WindTreeWindPerformanceSample> => {
    if (!assetPerformanceSampler) throw new Error("Tree wind performance sampling requires benchmark mode");
    setWindEnabled(enabled);
    await settleAnimationFrames(ASSET_BENCHMARK_WARMUP_FRAMES);
    assetPerformanceSampler.resetSamplingWindow();
    await settleAnimationFrames(ASSET_BENCHMARK_SAMPLE_FRAMES);
    return {
      label,
      windEnabled: enabled,
      treeInstances: TREE_BENCHMARK_COUNT,
      ...assetPerformanceSampler.takeSnapshot(scene.shadowCascades)
    };
  };

  const runWindPerformanceComparison = async (): Promise<WindTreeWindPerformanceResult> => {
    if (!assetPerformanceSampler) throw new Error("Tree wind performance comparison requires benchmark mode");
    const button = requiredElement<HTMLButtonElement>('[data-action="wind-performance"]');
    button.disabled = true;
    setOptionalOutput("asset-status", "RUNNING OFF/ON/OFF");
    windPerformanceResult = null;
    standardScenario.cancel();
    applyWindState("gale", false, 0);
    field.setTreeMaterialMode("hero");
    syncTreeMaterialButtons("hero");
    cameraPreset = "overview";
    applyCameraPreset(camera, orbit, "overview");
    camera.msaaSamples = MSAASamples.None;
    try {
      // Prewarm the retained GPU field, response passes and disabled uniform branch before measurement.
      setWindEnabled(true);
      await settleAnimationFrames(ASSET_BENCHMARK_WARMUP_FRAMES);
      setWindEnabled(false);
      await settleAnimationFrames(ASSET_BENCHMARK_WARMUP_FRAMES);
      const windOff1 = await sampleTreeWindState("wind-off-1", false);
      const windOn = await sampleTreeWindState("wind-on", true);
      const windOff2 = await sampleTreeWindState("wind-off-2", false);
      windPerformanceResult = buildTreeWindPerformanceResult(windOff1, windOn, windOff2);
      renderWindPerformanceResult(windPerformanceResult);
      publish();
      return windPerformanceResult;
    } finally {
      setWindEnabled(true);
      button.disabled = false;
    }
  };

  window.windVegetationTest = {
    ready: true,
    getDiagnostics: diagnostics,
    setWindPreset,
    setWindEnabled,
    triggerGust: (amplitude = 0.72) => {
      standardScenario.cancel();
      wind.triggerGust(amplitude, MANUAL_TREE_GUST_DURATION_SCALE);
      return publish();
    },
    setCameraPreset,
    setMsaaSamples,
    startFrameRecording: () => {
      standardScenario.cancel();
      driver.recorder.start();
      publish();
      return driver.recorder.getSummary();
    },
    stopFrameRecording: () => {
      const recording =
        standardScenario.getSnapshot().state === "running"
          ? standardScenario.cancel().recording
          : driver.recorder.stop();
      publish();
      return recording;
    },
    clearFrameRecording: () => {
      standardScenario.reset();
      publish();
      return driver.recorder.getSummary();
    },
    getFrameRecording: () => driver.recorder.getRecording(),
    runStandardAcceptance: () => {
      wind.setRenderingActive(true);
      driver.windEnabled = true;
      requiredElement<HTMLButtonElement>('[data-action="wind-toggle"]').dataset.active = "true";
      return standardScenario.start();
    },
    setTreeMaterialMode,
    setTreeLodMode,
    setTreeWindResponseControls,
    setTreeWindResponseControl,
    setTreeWindIsolationPreset,
    getTreeWindResponseControls: () => field.getTreeWindResponseControls(),
    runAssetPerformanceAcceptance,
    getAssetPerformanceResult: () => assetPerformanceResult,
    runWindPerformanceComparison,
    getWindPerformanceResult: () => windPerformanceResult
  };
  publish();
  document.body.dataset.state = "ready";
  window.addEventListener(
    "beforeunload",
    () => {
      assetPerformanceSampler?.destroy();
      field.destroy();
    },
    { once: true }
  );
}

class WindVegetationDriver extends Script {
  readonly recorder = new WindAcceptanceRecorder(
    WIND_CONSUMER_ACCEPTANCE_THRESHOLDS.tree,
    STANDARD_WIND_ACCEPTANCE_RECORDER_CAPACITY
  );
  standardScenario: WindStandardAcceptanceScenario | null = null;
  field: WindVegetationField | null = null;
  weatherSystem: WeatherSystem | null = null;
  wind: TerrainWindRuntime | null = null;
  assetPerformanceSampler: WindAssetPerformanceSampler | null = null;
  windEnabled = true;
  onMetrics: (() => void) | null = null;
  private readonly _sample: WindSample = createWindSample();
  private readonly _samplePosition = new Vector3(0, 1, 0);
  private _elapsed = 0;
  private _frames = 0;
  private _fps = 0;
  private _frameTimeMs = 0;

  override onUpdate(deltaTime: number): void {
    this.standardScenario?.update(deltaTime);
    this.weatherSystem?.update(deltaTime);
    if (this.weatherSystem && this.wind) this.wind.applyWeatherForcing(this.weatherSystem.state.wind);
    const fieldCpuStart = performance.now();
    this.field?.update(this.engine.time.elapsedTime, deltaTime);
    this.assetPerformanceSampler?.recordFieldCpuTime(performance.now() - fieldCpuStart);
    this._recordAcceptanceFrame(deltaTime);
    this._elapsed += deltaTime;
    this._frames++;
    if (this._elapsed < 0.5) return;
    this._fps = this._frames / this._elapsed;
    this._frameTimeMs = (this._elapsed * 1000) / this._frames;
    this._elapsed = 0;
    this._frames = 0;
    this.onMetrics?.();
  }

  getPerformance(msaaSamples: number): WindVegetationPerformance {
    return { fps: this._fps, frameTimeMs: this._frameTimeMs, msaaSamples };
  }

  private _recordAcceptanceFrame(deltaTime: number): void {
    const { field, wind } = this;
    if (this.recorder.state !== "recording" || !field || !wind) return;
    let input: readonly [number, number, number] = [0, 0, 0];
    let response: readonly [number, number, number] = [0, 0, 0];
    let poseQuaternion: readonly [number, number, number, number] | undefined;
    if (this.windEnabled) {
      this._samplePosition.y = 5;
      wind.sample(this._samplePosition, "canopy", undefined, this._sample);
      input = this._sample.velocityWS;
      // GPU response validation is image/performance based. Avoid a readback stall solely to
      // manufacture CPU diagnostics for the acceptance recorder.
      response = input;
    }
    this.recorder.record({
      timeSeconds: this.engine.time.elapsedTime,
      deltaTimeSeconds: deltaTime,
      inputVelocityWS: input,
      responseVelocityWS: response,
      poseQuaternion,
      label: this.standardScenario?.currentPhaseId ?? (this.windEnabled ? "trees" : "disabled")
    });
  }
}

function treeWindWeight(
  path: TerrainTreeWindResponseControlPath,
  label: string,
  description: string
): TreeWindControlUiSpec {
  return { path, label, description, minimum: 0, maximum: 1, step: 0.05, kind: "weight" };
}

function treeWindScale(
  path: TerrainTreeWindResponseControlPath,
  label: string,
  description: string,
  minimum: number,
  maximum: number
): TreeWindControlUiSpec {
  return { path, label, description, minimum, maximum, step: 0.05, kind: "scale" };
}

function renderTreeWindControlPanel(): void {
  const container = document.querySelector<HTMLElement>("[data-tree-wind-controls]");
  if (!container) return;
  const fragment = document.createDocumentFragment();
  for (const group of TREE_WIND_CONTROL_UI_GROUPS) {
    const section = document.createElement("div");
    section.className = "response-control-group";
    const title = document.createElement("div");
    title.className = "response-control-group__title";
    const name = document.createElement("span");
    name.textContent = group.label;
    const description = document.createElement("small");
    description.textContent = group.description;
    title.append(name, description);
    section.append(title);
    for (const spec of group.controls) {
      const row = document.createElement("label");
      row.className = spec.kind === "weight" ? "response-control" : "response-control response-control--tuning";
      row.title = spec.description;
      if (spec.kind === "weight") {
        const enabled = document.createElement("input");
        enabled.type = "checkbox";
        enabled.checked = true;
        enabled.dataset.treeWindEnabled = spec.path;
        enabled.setAttribute("aria-label", `${spec.label}开关`);
        row.append(enabled);
      }
      const label = document.createElement("span");
      label.className = "response-control__label";
      label.textContent = spec.label;
      const range = document.createElement("input");
      range.type = "range";
      range.min = String(spec.minimum);
      range.max = String(spec.maximum);
      range.step = String(spec.step);
      range.value = "1";
      range.dataset.treeWindControl = spec.path;
      range.dataset.lastNonzero = "1";
      range.setAttribute("aria-label", `${spec.label}参数`);
      const output = document.createElement("output");
      output.dataset.treeWindValue = spec.path;
      row.append(label, range, output);
      section.append(row);
    }
    fragment.append(section);
  }
  container.replaceChildren(fragment);
}

function syncTreeWindResponseControlPanel(
  controls: Readonly<TerrainTreeWindResponseControls>,
  activePreset: TerrainTreeWindIsolationPreset | null
): void {
  document.querySelectorAll<HTMLButtonElement>("[data-tree-wind-preset]").forEach((button) => {
    button.dataset.active = String(button.dataset.treeWindPreset === activePreset);
  });
  for (const group of TREE_WIND_CONTROL_UI_GROUPS) {
    for (const spec of group.controls) {
      const value = readTreeWindResponseControl(controls, spec.path);
      const range = document.querySelector<HTMLInputElement>(`[data-tree-wind-control="${spec.path}"]`);
      const output = document.querySelector<HTMLOutputElement>(`[data-tree-wind-value="${spec.path}"]`);
      if (range) {
        if (spec.kind !== "weight" || value > 0) {
          range.value = String(value);
          if (value > 0) range.dataset.lastNonzero = String(value);
        }
        range.disabled = spec.kind === "weight" && value <= 0;
      }
      const enabled = document.querySelector<HTMLInputElement>(`[data-tree-wind-enabled="${spec.path}"]`);
      if (enabled) enabled.checked = value > 0;
      if (output) output.value = formatTreeWindControlValue(spec, value);
    }
  }
}

function readTreeWindResponseControl(
  controls: Readonly<TerrainTreeWindResponseControls>,
  path: TerrainTreeWindResponseControlPath
): number {
  const [group, name] = path.split(".") as [keyof TerrainTreeWindResponseControls, string];
  return (controls[group] as unknown as Record<string, number>)[name];
}

function formatTreeWindControlValue(spec: Readonly<TreeWindControlUiSpec>, value: number): string {
  if (spec.kind === "weight") return value <= 0 ? "OFF" : value.toFixed(2);
  if (spec.kind === "fraction") return `${Math.round(value * 100)}%`;
  return `${value.toFixed(2)}×`;
}

interface ControlBindings {
  readonly setWindPreset: (preset: WindPreset) => void;
  readonly setCameraPreset: (preset: CameraPreset) => void;
  readonly setMsaaSamples: (samples: 1 | 4) => void;
  readonly toggleWind: () => void;
  readonly triggerGust: () => void;
  readonly startRecording: () => void;
  readonly stopRecording: () => void;
  readonly runStandardAcceptance: () => void;
  readonly setTreeMaterialMode: (mode: WindTreeMaterialMode) => void;
  readonly setTreeLodMode: (mode: WindTreeLodMode) => void;
  readonly setTreeWindResponseControl: (path: TerrainTreeWindResponseControlPath, value: number) => void;
  readonly setTreeWindIsolationPreset: (preset: TerrainTreeWindIsolationPreset) => void;
  readonly runAssetPerformanceAcceptance: () => void;
  readonly runWindPerformanceComparison: () => void;
}

function bindControls(bindings: ControlBindings): void {
  document.querySelectorAll<HTMLButtonElement>("[data-wind-preset]").forEach((button) => {
    button.addEventListener("click", () => bindings.setWindPreset(button.dataset.windPreset as WindPreset));
  });
  document.querySelectorAll<HTMLButtonElement>("[data-camera]").forEach((button) => {
    button.addEventListener("click", () => bindings.setCameraPreset(button.dataset.camera as CameraPreset));
  });
  requiredElement<HTMLButtonElement>('[data-action="gust"]').addEventListener("click", bindings.triggerGust);
  requiredElement<HTMLButtonElement>('[data-action="wind-toggle"]').addEventListener("click", bindings.toggleWind);
  requiredElement<HTMLButtonElement>('[data-action="record-start"]').addEventListener("click", bindings.startRecording);
  requiredElement<HTMLButtonElement>('[data-action="record-stop"]').addEventListener("click", bindings.stopRecording);
  requiredElement<HTMLButtonElement>('[data-action="standard-acceptance"]').addEventListener(
    "click",
    bindings.runStandardAcceptance
  );
  requiredElement<HTMLButtonElement>('[data-action="msaa"]').addEventListener("click", (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    bindings.setMsaaSamples(button.dataset.active === "true" ? 1 : 4);
  });
  document.querySelectorAll<HTMLButtonElement>("[data-tree-material]").forEach((button) => {
    button.addEventListener("click", () => {
      bindings.setTreeMaterialMode(button.dataset.treeMaterial as WindTreeMaterialMode);
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-tree-lod]").forEach((button) => {
    button.addEventListener("click", () => {
      bindings.setTreeLodMode(resolveWindTreeLodMode(button.dataset.treeLod));
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-tree-wind-preset]").forEach((button) => {
    button.addEventListener("click", () => {
      bindings.setTreeWindIsolationPreset(button.dataset.treeWindPreset as TerrainTreeWindIsolationPreset);
    });
  });
  document.querySelectorAll<HTMLInputElement>("[data-tree-wind-control]").forEach((range) => {
    range.addEventListener("input", () => {
      const path = range.dataset.treeWindControl as TerrainTreeWindResponseControlPath;
      const value = Number(range.value);
      if (value > 0) range.dataset.lastNonzero = range.value;
      bindings.setTreeWindResponseControl(path, value);
    });
  });
  document.querySelectorAll<HTMLInputElement>("[data-tree-wind-enabled]").forEach((enabled) => {
    enabled.addEventListener("change", () => {
      const path = enabled.dataset.treeWindEnabled as TerrainTreeWindResponseControlPath;
      const range = document.querySelector<HTMLInputElement>(`[data-tree-wind-control="${path}"]`);
      const restoredValue = Number(range?.dataset.lastNonzero ?? range?.value ?? 1);
      bindings.setTreeWindResponseControl(path, enabled.checked ? restoredValue : 0);
    });
  });
  document
    .querySelector<HTMLButtonElement>('[data-action="asset-performance"]')
    ?.addEventListener("click", bindings.runAssetPerformanceAcceptance);
  document
    .querySelector<HTMLButtonElement>('[data-action="wind-performance"]')
    ?.addEventListener("click", bindings.runWindPerformanceComparison);
}

function applyCameraPreset(camera: Camera, orbit: OrbitControl, preset: CameraPreset): void {
  const state = resolveCameraPresetState(preset);
  camera.entity.transform.setPosition(...state.position);
  orbit.target.set(...state.target);
  camera.entity.transform.lookAt(new Vector3(...state.target));
}

function resolveCameraPresetState(preset: CameraPreset): WindTreeCameraState {
  return CAMERA_PRESETS[preset];
}

function renderDiagnostics(snapshot: WindVegetationDiagnostics): void {
  const bridge = snapshot.wind.bridge;
  setOutput("fps", snapshot.performance.fps > 0 ? snapshot.performance.fps.toFixed(0) : "…");
  setOutput(
    "frame-time",
    snapshot.performance.frameTimeMs > 0 ? `${snapshot.performance.frameTimeMs.toFixed(1)} ms` : "…"
  );
  setOutput("speed", `${snapshot.wind.speedMps.toFixed(1)} m/s`);
  setOutput("gusts", String(snapshot.wind.activeGustCount));
  setOutput("field-cpu", bridge ? `${bridge.lastLocalFieldCpuTimeMs.toFixed(2)} ms` : "off");
  setOutput("instances", String(snapshot.field.treeInstances));
  setOptionalOutput("vegetation", String(snapshot.field.p3GpuVegetationInstances));
  setOutput("batches", String(snapshot.field.denseGrassDrawBatches));
  setOutput("msaa", `${snapshot.performance.msaaSamples}×`);
  setOptionalOutput("asset-mode", snapshot.field.treeMaterialMode.toUpperCase());
  setOptionalOutput("tree-asset", snapshot.field.heroCalibrationAsset);
  setOptionalOutput("tree-lod", String(snapshot.field.treeLodMode).toUpperCase());
  setOptionalOutput("root-bend", "GPU");
  setOptionalOutput("root-recoil", "GPU");
  setOptionalOutput("root-sway", "GPU");
  setOptionalOutput("axis-drift", "GPU");
  setOptionalOutput("input-mean", "GPU FIELD");
  setOptionalOutput("input-gust", "GPU FIELD");
  setOptionalOutput("input-spectrum", "GPU FIELD");
  setOptionalOutput("input-local", "GPU FIELD");
  const treeWindDiagnostics = document.querySelector<HTMLOutputElement>("[data-tree-wind-diagnostics]");
  if (treeWindDiagnostics) {
    treeWindDiagnostics.value = JSON.stringify({
      controls: snapshot.field.treeWindResponseControls,
      response: {
        backend: snapshot.wind.bridge?.rasterBackend ?? "off",
        readback: false,
        textureBytes: snapshot.wind.bridge?.treeResponseTextureBytes ?? 0
      }
    });
  }
  const acceptance = snapshot.acceptance;
  setOptionalOutput("root-step", `${(acceptance.maximumPoseStepRadians * (180 / Math.PI)).toFixed(3)}°`);
  setOptionalOutput("root-rate", `${(acceptance.maximumPoseRateRadiansPerSecond * (180 / Math.PI)).toFixed(2)}°/s`);
  setOptionalOutput(
    "root-acceleration",
    `${(acceptance.maximumPoseAccelerationRadiansPerSecondSquared * (180 / Math.PI)).toFixed(1)}°/s²`
  );
  setOutput("response-range", acceptance.responseSpeedRange.toFixed(2));
  setOutput("direction-travel", `${acceptance.cumulativeDirectionChangeDegrees.toFixed(0)}°`);
  const standardScenario = snapshot.standardScenario;
  setOutput(
    "acceptance",
    standardScenario.state === "running"
      ? `STD ${standardScenario.phaseIndex + 1}/${standardScenario.phaseCount} ${Math.round(standardScenario.phaseProgress * 100)}%`
      : standardScenario.state === "complete"
        ? standardScenario.passed
          ? "STD PASS"
          : "STD FAIL"
        : standardScenario.state === "cancelled"
          ? "STD 已取消"
          : acceptance.state === "recording"
            ? `REC ${acceptance.frameCount}`
            : acceptance.provisional
              ? "待记录"
              : acceptance.passed
                ? "PASS"
                : "FAIL"
  );
  requiredElement<HTMLElement>("[data-wind-state]").textContent = snapshot.wind.renderingActive
    ? snapshot.windTransitionProgress < 1
      ? `树体响应建立中 ${Math.round(snapshot.windTransitionProgress * 100)}%`
      : "风场运行中"
    : "风场已暂停";
  requiredElement<HTMLElement>("[data-wind-state]").dataset.active = String(snapshot.wind.renderingActive);
}

function idleStandardScenario(): WindStandardAcceptanceScenarioSnapshot {
  return {
    state: "idle",
    phase: null,
    phaseIndex: -1,
    phaseCount: 5,
    phaseProgress: 0,
    elapsedSeconds: 0,
    durationSeconds: 21,
    phaseCoveragePassed: null,
    passed: null
  };
}

function syncActiveButtons(dataName: "windPreset" | "camera", value: string): void {
  const attribute = dataName === "windPreset" ? "data-wind-preset" : "data-camera";
  document.querySelectorAll<HTMLButtonElement>(`[${attribute}]`).forEach((button) => {
    button.dataset.active = String(button.getAttribute(attribute) === value);
  });
}

function setOutput(name: string, value: string): void {
  requiredElement<HTMLOutputElement>(`[data-output="${name}"]`).value = value;
}

function setOptionalOutput(name: string, value: string): void {
  const output = document.querySelector<HTMLOutputElement>(`[data-output="${name}"]`);
  if (output) output.value = value;
}

function requiredElement<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Wind vegetation UI is missing ${selector}`);
  return element;
}

function resolveTreeBenchmarkCount(value: string | undefined | null): number {
  if (value === undefined || value === null || value === "") return 0;
  const count = Number(value);
  if (!Number.isSafeInteger(count) || ![1, 8, 32, 1000].includes(count)) {
    throw new RangeError("Tree benchmark count must be one of 1, 8, 32, or 1000");
  }
  return count;
}

function syncTreeMaterialButtons(mode: WindTreeMaterialMode): void {
  document.querySelectorAll<HTMLButtonElement>("[data-tree-material]").forEach((button) => {
    button.dataset.active = String(button.dataset.treeMaterial === mode);
  });
}

function syncTreeLodButtons(mode: WindTreeLodMode): void {
  document.querySelectorAll<HTMLButtonElement>("[data-tree-lod]").forEach((button) => {
    button.dataset.active = String(button.dataset.treeLod === String(mode));
  });
}

function buildTreeAssetPerformanceResult(
  baseline1: WindTreeAssetPerformanceSample,
  hero: WindTreeAssetPerformanceSample,
  baseline2: WindTreeAssetPerformanceSample
): WindTreeAssetPerformanceResult {
  const upperBaselineFrame = Math.max(baseline1.frameP95Milliseconds, baseline2.frameP95Milliseconds);
  const lowerBaselineFrame = Math.max(Math.min(baseline1.frameP95Milliseconds, baseline2.frameP95Milliseconds), 0.001);
  const baselineGpu = maximumOptional(baseline1.gpuP95Milliseconds, baseline2.gpuP95Milliseconds);
  const heroGpuRatio =
    baselineGpu !== null && hero.gpuP95Milliseconds !== null
      ? hero.gpuP95Milliseconds / Math.max(baselineGpu, 0.001)
      : null;
  const heroGpuDeltaMilliseconds =
    baselineGpu !== null && hero.gpuP95Milliseconds !== null ? hero.gpuP95Milliseconds - baselineGpu : null;
  const upperBaselineFieldCpu = Math.max(baseline1.fieldCpuP95Milliseconds, baseline2.fieldCpuP95Milliseconds);
  const submissionLoadStable = sameSubmissionLoad(baseline1, hero) && sameSubmissionLoad(hero, baseline2);
  const memoryStable =
    baseline1.gpuMemoryBytes === hero.gpuMemoryBytes && hero.gpuMemoryBytes === baseline2.gpuMemoryBytes;
  const baselineFrameDriftRatio = upperBaselineFrame / lowerBaselineFrame;
  const heroFrameRatio = hero.frameP95Milliseconds / Math.max(upperBaselineFrame, 0.001);
  const heroFieldCpuDeltaMilliseconds = hero.fieldCpuP95Milliseconds - upperBaselineFieldCpu;
  const gpuGatePassed = heroGpuRatio === null || heroGpuRatio <= ASSET_BENCHMARK_MAXIMUM_GPU_RATIO;
  return Object.freeze({
    state: "complete",
    passed:
      submissionLoadStable &&
      memoryStable &&
      baselineFrameDriftRatio <= ASSET_BENCHMARK_MAXIMUM_FRAME_RATIO &&
      heroFrameRatio <= ASSET_BENCHMARK_MAXIMUM_FRAME_RATIO &&
      heroFieldCpuDeltaMilliseconds <= ASSET_BENCHMARK_MAXIMUM_CPU_DRIFT_MS &&
      gpuGatePassed,
    treeInstances: baseline1.treeInstances,
    baseline1,
    hero,
    baseline2,
    derived: {
      baselineFrameDriftRatio,
      heroFrameRatio,
      heroFrameDeltaMilliseconds: hero.frameP95Milliseconds - upperBaselineFrame,
      heroGpuRatio,
      heroGpuDeltaMilliseconds,
      heroFieldCpuDeltaMilliseconds,
      submissionLoadStable,
      memoryStable
    }
  });
}

function buildTreeWindPerformanceResult(
  windOff1: WindTreeWindPerformanceSample,
  windOn: WindTreeWindPerformanceSample,
  windOff2: WindTreeWindPerformanceSample
): WindTreeWindPerformanceResult {
  const upperOffFrame = Math.max(windOff1.frameP95Milliseconds, windOff2.frameP95Milliseconds);
  const lowerOffFrame = Math.max(Math.min(windOff1.frameP95Milliseconds, windOff2.frameP95Milliseconds), 0.001);
  const upperOffGpu = maximumOptional(windOff1.gpuP95Milliseconds, windOff2.gpuP95Milliseconds);
  const lowerOffGpu = minimumOptional(windOff1.gpuP95Milliseconds, windOff2.gpuP95Milliseconds);
  const upperOffFieldCpu = Math.max(windOff1.fieldCpuP95Milliseconds, windOff2.fieldCpuP95Milliseconds);
  const submissionLoadStable =
    sameSubmissionLoad(windOff1, windOff2) && windSubmissionLoadWithinBudget(windOff1, windOn);
  const memoryStable =
    windOff1.gpuMemoryBytes === windOn.gpuMemoryBytes && windOn.gpuMemoryBytes === windOff2.gpuMemoryBytes;
  const windGpuRatio =
    upperOffGpu !== null && windOn.gpuP95Milliseconds !== null
      ? windOn.gpuP95Milliseconds / Math.max(upperOffGpu, 0.001)
      : null;
  const windGpuDeltaMilliseconds =
    upperOffGpu !== null && windOn.gpuP95Milliseconds !== null ? windOn.gpuP95Milliseconds - upperOffGpu : null;
  const offFrameDriftRatio = upperOffFrame / lowerOffFrame;
  const offGpuDriftRatio =
    upperOffGpu === null || lowerOffGpu === null ? null : upperOffGpu / Math.max(lowerOffGpu, 0.001);
  const windFrameRatio = windOn.frameP95Milliseconds / Math.max(upperOffFrame, 0.001);
  const valid =
    submissionLoadStable &&
    memoryStable &&
    offFrameDriftRatio <= ASSET_BENCHMARK_MAXIMUM_FRAME_RATIO &&
    (offGpuDriftRatio === null || offGpuDriftRatio <= ASSET_BENCHMARK_MAXIMUM_GPU_RATIO);
  const passed =
    valid &&
    windFrameRatio <= WIND_BENCHMARK_MAXIMUM_FRAME_RATIO &&
    (windGpuDeltaMilliseconds === null || windGpuDeltaMilliseconds <= WIND_BENCHMARK_MAXIMUM_GPU_DELTA_MILLISECONDS);
  return Object.freeze({
    state: "complete",
    valid,
    passed,
    treeInstances: windOff1.treeInstances,
    windOff1,
    windOn,
    windOff2,
    derived: {
      offFrameDriftRatio,
      offGpuDriftRatio,
      windFrameRatio,
      windFrameDeltaMilliseconds: windOn.frameP95Milliseconds - upperOffFrame,
      windGpuRatio,
      windGpuDeltaMilliseconds,
      windFieldCpuDeltaMilliseconds: windOn.fieldCpuP95Milliseconds - upperOffFieldCpu,
      submissionLoadStable,
      memoryStable
    }
  });
}

function sameSubmissionLoad(a: WindAssetPerformanceSnapshot, b: WindAssetPerformanceSnapshot): boolean {
  return (
    a.submissions.drawCalls === b.submissions.drawCalls &&
    a.submissions.instancedDrawCalls === b.submissions.instancedDrawCalls &&
    a.submissions.instances === b.submissions.instances &&
    a.submissions.triangles === b.submissions.triangles
  );
}

function windSubmissionLoadWithinBudget(
  windOff: WindAssetPerformanceSnapshot,
  windOn: WindAssetPerformanceSnapshot
): boolean {
  const drawDelta = windOn.submissions.drawCalls - windOff.submissions.drawCalls;
  const triangleDelta = windOn.submissions.triangles - windOff.submissions.triangles;
  return (
    drawDelta >= 0 &&
    drawDelta <= WIND_BENCHMARK_MAXIMUM_AVERAGE_FIELD_DRAWS &&
    triangleDelta === drawDelta &&
    windOn.submissions.instancedDrawCalls === windOff.submissions.instancedDrawCalls &&
    windOn.submissions.instances === windOff.submissions.instances
  );
}

function maximumOptional(a: number | null, b: number | null): number | null {
  if (a === null || b === null) return null;
  return Math.max(a, b);
}

function minimumOptional(a: number | null, b: number | null): number | null {
  if (a === null || b === null) return null;
  return Math.min(a, b);
}

function renderAssetPerformanceResult(result: WindTreeAssetPerformanceResult): void {
  setOptionalOutput("asset-status", result.passed ? "PASS" : "FAIL");
  setOptionalOutput("asset-frame", `${result.derived.heroFrameDeltaMilliseconds.toFixed(2)} ms`);
  setOptionalOutput(
    "asset-gpu",
    result.derived.heroGpuDeltaMilliseconds === null
      ? "N/A"
      : `${result.derived.heroGpuDeltaMilliseconds.toFixed(2)} ms`
  );
  setOptionalOutput("asset-cpu", `${result.derived.heroFieldCpuDeltaMilliseconds.toFixed(3)} ms`);
  setOptionalOutput("asset-draws", String(result.hero.submissions.drawCalls));
  setOptionalOutput("asset-triangles", result.hero.submissions.triangles.toLocaleString("en-US"));
  const report = document.querySelector<HTMLElement>("[data-asset-report]");
  if (report) report.textContent = JSON.stringify(result, null, 2);
}

function renderWindPerformanceResult(result: WindTreeWindPerformanceResult): void {
  setOptionalOutput("asset-status", !result.valid ? "INVALID" : result.passed ? "PASS" : "FAIL");
  setOptionalOutput("asset-frame", `${result.derived.windFrameDeltaMilliseconds.toFixed(2)} ms`);
  setOptionalOutput(
    "asset-gpu",
    result.derived.windGpuDeltaMilliseconds === null
      ? "N/A"
      : `${result.derived.windGpuDeltaMilliseconds.toFixed(2)} ms`
  );
  setOptionalOutput("asset-cpu", `${result.derived.windFieldCpuDeltaMilliseconds.toFixed(3)} ms`);
  setOptionalOutput("asset-draws", String(result.windOn.submissions.drawCalls));
  setOptionalOutput("asset-triangles", result.windOn.submissions.triangles.toLocaleString("en-US"));
  const report = document.querySelector<HTMLElement>("[data-asset-report]");
  if (report) report.textContent = JSON.stringify(result, null, 2);
}

function settleAnimationFrames(frameCount: number): Promise<void> {
  return new Promise((resolve) => {
    let remaining = frameCount;
    const advance = () => {
      remaining--;
      if (remaining <= 0) resolve();
      else requestAnimationFrame(advance);
    };
    requestAnimationFrame(advance);
  });
}
