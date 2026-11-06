import {
  Camera,
  DirectLight,
  ScreenSpaceReflectionActivationMode,
  ScreenSpaceReflectionQuality,
  ScreenSpaceReflectionReceiverMode,
  ScreenSpaceReflectionReceiverPolicy,
  type Component,
  type Entity,
  type ScreenSpaceReflectionTraceSettings,
  type VolumetricCloudQuality,
  type WeatherCloudState,
  type WeatherLightningState,
  type WeatherPrecipitationState,
  type WeatherSkyLightingState,
  type WeatherState,
  type WeatherWindState,
  WebGLEngine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { TerrainRuntimeDebug } from "@galacean/engine-terrain/terrain/debug/TerrainRuntimeDebug";
import type { TerrainDemoCameraPose, TerrainDemoControls } from "@galacean/engine-world-planning/integrations/terrain/debug/TerrainDemoControls";
import { createTerrainRuntimeDebugOwner } from "@galacean/engine-world-planning/integrations/terrain/debug/TerrainRuntimeDebugOwnerFactory";
import {
  applyAutomaticScreenSpaceReflectionConfiguration,
  applyScreenSpaceReflectionConfiguration,
  inspectScreenSpaceReflectionPanelStatus,
  TERRAIN_SCREEN_SPACE_REFLECTION_CONFIGURATION,
  type TerrainScreenSpaceReflectionPanelConfiguration
} from "@galacean/engine-terrain/terrain/debug/TerrainScreenSpaceReflectionPanel";
import { TerrainPerformancePanel } from "@galacean/engine-world-planning/integrations/terrain/performance/TerrainPerformancePanel";
import type { TerrainClipmap } from "@galacean/engine-terrain/terrain/clipmap/TerrainClipmap";
import { TerrainProjectClipmapRuntime } from "@galacean/engine-terrain/terrain/project/TerrainProjectClipmapRuntime";
import { TerrainProjectDetailRuntime } from "@galacean/engine-terrain/terrain/project/TerrainProjectDetailRuntime";
import { TerrainNavigationRuntime } from "@galacean/engine-terrain/terrain/project/TerrainNavigationRuntime";
import { TerrainProjectPlacedPrefabRuntime } from "@galacean/engine-terrain/terrain/project/TerrainProjectPlacedPrefabRuntime";
import { TerrainPostProcessRuntime } from "@galacean/engine-terrain/terrain/project/TerrainPostProcessRuntime";
import { TerrainProjectWorldRuntime } from "@galacean/engine-terrain/terrain/project/TerrainProjectRuntime";
import { TerrainProjectTreeRuntime } from "@galacean/engine-terrain/terrain/project/TerrainProjectTreeRuntime";
import {
  TerrainSsrReflectionTarget,
  type TerrainSsrReflectionTargetSnapshot
} from "@galacean/engine-terrain/terrain/project/TerrainSsrReflectionTarget";
import { isTerrainSsrAcceptanceEnabled } from "@galacean/engine-terrain/terrain/project/TerrainSsrAcceptanceMode";
import {
  TerrainWaterRuntime,
  type TerrainWaterReflectionMode,
  type TerrainWaterScenario
} from "@galacean/engine-world-planning/integrations/terrain/project/TerrainWaterRuntime";
import { TerrainWindRuntime } from "@galacean/engine-terrain/terrain/project/TerrainWindRuntime";
import {
  TERRAIN_DEFAULT_CAMERA_CONFIGURATION,
  TerrainLightingRuntime,
  type TerrainBakeLightingTuning,
  type TerrainLightingClockTuning
} from "@galacean/engine-world-planning/integrations/terrain/lighting/TerrainLightingRuntime";
import { createIntegratedWorldLightingRuntime } from "@galacean/engine-world-planning/integrations/terrain/lighting/IntegratedWorldPresentation";
import { TerrainWindGpuExposureProvider } from "@galacean/engine-world-planning/integrations/terrain/environment/TerrainWindGpuExposureProvider";
import {
  INTEGRATED_WORLD_CAMERA_POSE,
  INTEGRATED_WORLD_RENDER_PIXEL_RATIO
} from "@galacean/engine-world-planning/integrations/terrain/lighting/IntegratedWorldLightingPreset";
import { loadTerrainScene } from "@galacean/engine-terrain/terrain/loader/TerrainSceneLoader";
import {
  WorldEnvironmentRuntime,
  type TerrainSeason,
  type TerrainSurfaceWaterTuning
} from "@galacean/engine-world-planning/integrations/terrain/environment/WorldEnvironmentRuntime";
import { TerrainProjectRainImpactSurface } from "@galacean/engine-world-planning/integrations/terrain/environment/TerrainRainImpactSurface";
import {
  createTerrainProjectProbeVolumeRegionSourceProvider,
  TerrainProbeVolumeAuthoring,
  type TerrainProbeVolumeScenario
} from "@galacean/engine-world-planning/integrations/terrain/lighting/TerrainProbeVolumeAuthoring";
import "@galacean/engine-world-planning/runtime/script-registry";

interface TerrainScreenSpaceReflectionResolvedSettings {
  readonly quality: ScreenSpaceReflectionQuality;
  readonly resolutionScale: number;
  readonly intensity: number;
  readonly maxRayDistance: number;
  readonly rayLengthFade: number;
  readonly maxRaySteps: number;
  readonly hitRefinementSteps: number;
  readonly thickness: number;
  readonly maxRoughness: number;
  readonly edgeFade: number;
}

interface TerrainScreenSpaceReflectionMetrics {
  readonly activationMode: ScreenSpaceReflectionActivationMode;
  readonly receiverPolicy: ScreenSpaceReflectionReceiverPolicy;
  readonly globalEnabled: boolean;
  readonly requested: boolean;
  readonly requestedByManual: boolean;
  readonly requestedByConsumers: boolean;
  readonly effective: boolean;
  readonly supported: boolean;
  readonly activeConsumerLeaseCount: number;
  readonly resolvedSettings: TerrainScreenSpaceReflectionResolvedSettings;
  readonly opaqueResolvedSettings: TerrainScreenSpaceReflectionResolvedSettings;
  readonly transparentResolvedSettings: TerrainScreenSpaceReflectionResolvedSettings;
  readonly width: number;
  readonly height: number;
  readonly surfacePassDrawCount: number;
  readonly opaqueSurfacePassDrawCount: number;
  readonly transparentSurfacePassDrawCount: number;
  readonly tracePassCount: number;
  readonly compositePassCount: number;
  readonly renderTargetCount: number;
  readonly retainedRenderTargetCount: number;
  readonly estimatedBytes: number;
  readonly unsupportedReason: string | null;
  readonly inactiveReason: string | null;
}

interface TerrainScreenSpaceReflectionTarget {
  enabled: boolean;
  activationMode: ScreenSpaceReflectionActivationMode;
  receiverPolicy: ScreenSpaceReflectionReceiverPolicy;
  quality: ScreenSpaceReflectionQuality;
  resolutionScale: number;
  intensity: number;
  maxRayDistance: number;
  thickness: number;
  maxRoughness: number;
  edgeFade: number;
  setReceiverTraceSettingsOverride(
    receiverMode:
      | ScreenSpaceReflectionReceiverMode.OpaqueComposite
      | ScreenSpaceReflectionReceiverMode.TransparentSampleOnly,
    settings?: Readonly<Partial<ScreenSpaceReflectionTraceSettings>>
  ): void;
  readonly metrics: TerrainScreenSpaceReflectionMetrics;
}

interface TerrainScreenSpaceReflectionSnapshot extends TerrainScreenSpaceReflectionMetrics {
  readonly intensity: number;
  readonly receiverEvidence: "surface-pass-draws";
  readonly hitConfidenceEvidence: "phase-b-readback";
}

interface TerrainDemoDiagnosticsSnapshot {
  ready: true;
  terrainOnly: boolean;
  devicePixelRatio: number;
  renderPixelRatio: number;
  drawingBuffer: [number, number];
  navigationSpeed: number;
  regions: ReturnType<TerrainProjectWorldRuntime["getDiagnostics"]>;
  clipmapRegions: number;
  clipmapGeometry: TerrainClipmap["geometry"];
  details: ReturnType<TerrainProjectDetailRuntime["getDiagnostics"]>;
  trees: ReturnType<TerrainProjectTreeRuntime["getDiagnostics"]>;
  placedPrefabs: ReturnType<TerrainProjectPlacedPrefabRuntime["getDiagnostics"]>;
  water: ReturnType<TerrainWaterRuntime["getDiagnostics"]>;
  controls: ReturnType<TerrainDemoControls["getSnapshot"]>;
  readonly waterReflectionMode: TerrainWaterReflectionMode;
  screenSpaceReflection: TerrainScreenSpaceReflectionSnapshot;
  readonly ssrAcceptanceEnabled: boolean;
  ssrReflectionTarget: TerrainSsrReflectionTargetSnapshot | null;
  performance: ReturnType<TerrainPerformancePanel["getSamplingSnapshot"]>;
  lighting: ReturnType<TerrainLightingRuntime["getSnapshot"]>;
  environment: ReturnType<WorldEnvironmentRuntime["getSnapshot"]>;
  probeVolume: {
    layout: TerrainProbeVolumeAuthoring["layout"];
    bake: ReturnType<TerrainProbeVolumeAuthoring["getBakeSnapshot"]>;
  };
}

interface TerrainDemoDiagnostics extends TerrainDemoDiagnosticsSnapshot {
  setCameraPose(pose: TerrainDemoCameraPose): void;
  setElementVisible(group: "terrain" | "details" | "trees" | "prefabs" | "water", visible: boolean): void;
  setGlobalScreenSpaceReflectionEnabled(enabled: boolean): void;
  configureScreenSpaceReflection(configuration: Partial<TerrainScreenSpaceReflectionPanelConfiguration>): void;
  setScreenSpaceReflectionIntensity(intensity: number): void;
  setWaterScreenSpaceReflectionConsumptionEnabled(enabled: boolean): Promise<void>;
  setSsrAcceptancePresentation(enabled: boolean): void;
  setWaterReflectionMode(mode: TerrainWaterReflectionMode): Promise<void>;
  setWaterSurfaceTime(elapsedTime?: number): void;
  setSharedWaterLookReflectionIntensity(intensity?: number): Promise<void>;
  resetPerformanceSampling(): void;
  getDiagnostics(): TerrainDemoDiagnosticsSnapshot;
}

interface TerrainDemoLoadingDiagnostics {
  percent: number;
  phase: string;
  visible: boolean;
  history: Array<{ percent: number; phase: string }>;
}

declare global {
  interface Window {
    terrainDemo?: TerrainDemoDiagnostics;
    terrainDemoError?: string;
    terrainRuntimeDebug?: TerrainRuntimeDebug;
    terrainLightingDebug?: {
      /** Returns the evaluated day/night and visibility state. */
      getLightingSystem(): ReturnType<TerrainLightingRuntime["getSnapshot"]>;
      /** Returns retained per-stage CPU and GPU timings for realtime IBL. */
      getIBLProfile(): ReturnType<TerrainLightingRuntime["getIBLProfile"]>;
      /** Enables or disables new realtime IBL timing samples. */
      setIBLProfilingEnabled(enabled: boolean): void;
      /** Clears retained realtime IBL timing samples. */
      resetIBLProfile(): void;
      /** Enables or pauses realtime SH and GGX bake work. */
      setIBLBakingEnabled(enabled: boolean): void;
      /** Applies partial clock controls to the shared lighting system. */
      setLightingSystem(values: Partial<TerrainLightingClockTuning>): void;
      /** Returns complete-world probe bounds and the diagnostic bake budget. */
      inspectProbeVolumeLayout(): TerrainProbeVolumeAuthoring["layout"];
      /** Returns the current probe bake lifecycle state. */
      getProbeVolumeBake(): ReturnType<TerrainProbeVolumeAuthoring["getBakeSnapshot"]>;
      /** Returns the complete lighting source used by a probe bake. */
      getProbeBakeLighting(): TerrainBakeLightingTuning;
      /** Applies partial probe-bake lighting source controls. */
      setProbeBakeLighting(values: Partial<TerrainBakeLightingTuning>): void;
      /** Bakes and publishes one named in-memory probe-volume scenario. */
      bakeProbeVolume(scenario: TerrainProbeVolumeScenario, lighting: TerrainBakeLightingTuning): Promise<void>;
    };
    terrainEnvironmentDebug?: {
      /** Returns the independent engine weather channels plus project presentation state. */
      getEnvironment(): ReturnType<WorldEnvironmentRuntime["getSnapshot"]>;
      /** Changes sky and environment lighting without changing precipitation. */
      setSkyLighting(state: Readonly<WeatherSkyLightingState>): void;
      /** Changes cloud shape and optical extinction without changing sky lighting. */
      setCloud(state: Readonly<WeatherCloudState>): void;
      /** Changes rain or snow without changing lighting. */
      setPrecipitation(state: Readonly<WeatherPrecipitationState>): void;
      /** Changes vegetation season without changing weather or snow cover. */
      setSeason(season: TerrainSeason): void;
      /** Changes wind forcing independently. */
      setWind(state: Readonly<WeatherWindState>): void;
      /** Freezes or resumes cloud animation at an exact frame for deterministic capture. */
      setCloudFrameTimeOverride(elapsedSeconds?: number, windOffsetWS?: readonly [number, number, number]): void;
      /** Starts one bounded travelling wind packet immediately. */
      triggerWindGust(amplitude?: number): void;
      /** Toggles the retained wind bridge and Shader deformation for performance acceptance. */
      setWindRenderingActive(active: boolean): void;
      /** Changes lightning independently. */
      setLightning(state: Readonly<WeatherLightningState>): void;
      /** Applies an optional compound state through the engine weather system. */
      setWeatherState(state: Readonly<WeatherState>): void;
      /** Changes the shared duration used by subsequent season and weather changes. */
      setTransitionDuration(duration: number): void;
      /** Changes the volumetric cloud raymarch/cache quality. */
      setCloudQuality(quality: VolumetricCloudQuality): void;
      /** Returns the live ground-puddle BRDF, coverage, and reflection-source controls. */
      getSurfaceWaterTuning(): TerrainSurfaceWaterTuning;
      /** Applies partial live ground-puddle controls without changing accumulated hydrology. */
      setSurfaceWaterTuning(tuning: Readonly<Partial<TerrainSurfaceWaterTuning>>): void;
      /** Restores the authored ground-puddle presentation defaults. */
      resetSurfaceWaterTuning(): void;
      /** Clears persistent wetness, puddles, and snow. */
      resetSurfaceClimate(): void;
    };
    terrainDemoLoading: TerrainDemoLoadingDiagnostics;
  }
}

const status = document.getElementById("status") as HTMLDivElement;
const loadingScreen = document.getElementById("loading-screen") as HTMLDivElement;
const loadingBar = document.getElementById("loading-bar") as HTMLSpanElement;
const loadingPercent = document.getElementById("loading-percent") as HTMLOutputElement;
const canvasElement = document.getElementById("canvas") as HTMLCanvasElement;
const loadingDiagnostics: TerrainDemoLoadingDiagnostics = {
  percent: 0,
  phase: "Loading project…",
  visible: true,
  history: []
};
const TERRAIN_ONLY_MODE = new URLSearchParams(window.location.search).get("terrainOnly") === "1";
const TERRAIN_CENTRAL_REGION_ONLY = new URLSearchParams(window.location.search).get("centralRegion") === "1";
const TERRAIN_CENTRAL_REGION_ID = "region-a6063abf98bc";
const TERRAIN_WATER_SCENARIO = resolveTerrainWaterScenario(window.location.search);
const WIND_GPU_RASTER_ENABLED = new URLSearchParams(window.location.search).get("windGpu") !== "0";
const TERRAIN_RENDER_PIXEL_RATIO = TERRAIN_ONLY_MODE ? 1 : INTEGRATED_WORLD_RENDER_PIXEL_RATIO;
window.terrainDemoLoading = loadingDiagnostics;
setStartupProgress(0, loadingDiagnostics.phase);

void boot().catch((error: unknown) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error("[terrain] startup failed", error);
  window.terrainDemoError = message;
  showStartupError(message);
});

async function boot(): Promise<void> {
  const engine = await WebGLEngine.create({ canvas: "canvas", shaderCompiler: new ShaderCompiler() });
  const performancePanel = new TerrainPerformancePanel(engine);
  let waterViewport: TerrainWaterRuntime | null = null;
  const resize = (): void => {
    engine.canvas.setResolution(
      Math.max(1, Math.round(canvasElement.clientWidth * TERRAIN_RENDER_PIXEL_RATIO)),
      Math.max(1, Math.round(canvasElement.clientHeight * TERRAIN_RENDER_PIXEL_RATIO))
    );
    waterViewport?.setViewportSize(engine.canvas.width, engine.canvas.height);
  };
  resize();
  window.addEventListener("resize", resize);

  await loadTerrainScene(engine, {
    projectUrl: new URL("../../../packages/terrain/src/data/grasslands/project.json", import.meta.url),
    scenePath: "Scene/World.scene",
    onProgress: (loaded, total, phase) => {
      const projectPercent = total > 0 ? Math.round((loaded / total) * 60) : 0;
      setStartupProgress(projectPercent, phase === "project" ? "Loading project manifest…" : "Loading World scene…");
    }
  });
  setStartupProgress(60, "Project loaded. Starting Scene runtimes…");

  const scene = engine.sceneManager.activeScene!;
  const world = findComponent(scene.rootEntities, TerrainProjectWorldRuntime);
  const clipmap = findComponent(scene.rootEntities, TerrainProjectClipmapRuntime);
  const details = findComponent(scene.rootEntities, TerrainProjectDetailRuntime);
  const trees = findComponent(scene.rootEntities, TerrainProjectTreeRuntime);
  const placedPrefabs = findComponent(scene.rootEntities, TerrainProjectPlacedPrefabRuntime);
  const navigation = findComponent(scene.rootEntities, TerrainNavigationRuntime);
  const directLight = findComponent(scene.rootEntities, DirectLight);
  const postProcess = findComponent(scene.rootEntities, TerrainPostProcessRuntime);
  const water = findComponent(scene.rootEntities, TerrainWaterRuntime);
  const wind = findComponent(scene.rootEntities, TerrainWindRuntime);
  if (
    !world ||
    !clipmap ||
    !details ||
    !trees ||
    !placedPrefabs ||
    !navigation ||
    !directLight ||
    !postProcess ||
    !water ||
    !wind
  ) {
    throw new Error("The loaded terrain Scene is missing a required runtime component");
  }
  trees.setWindRuntime(wind);
  setStartupProgress(62, "Loading production tree wind assets…");
  await trees.prepareProductionWind();
  waterViewport = water;
  water.setScenario(TERRAIN_WATER_SCENARIO);
  resize();

  const camera = navigation.entity.getComponent(Camera);
  if (!camera) throw new Error("The loaded terrain Scene is missing its navigation camera");
  camera.entity.transform.setPosition(...INTEGRATED_WORLD_CAMERA_POSE.position);
  camera.entity.transform.setRotation(...INTEGRATED_WORLD_CAMERA_POSE.rotation);
  camera.fieldOfView = TERRAIN_DEFAULT_CAMERA_CONFIGURATION.fieldOfView;
  camera.farClipPlane = TERRAIN_DEFAULT_CAMERA_CONFIGURATION.farClipPlane;
  camera.enableHDR = TERRAIN_DEFAULT_CAMERA_CONFIGURATION.enableHDR;
  applyAutomaticScreenSpaceReflectionConfiguration(camera, TERRAIN_SCREEN_SPACE_REFLECTION_CONFIGURATION);
  const lighting = createIntegratedWorldLightingRuntime(directLight.entity, scene, directLight, postProcess);
  const ssrAcceptanceEnabled = isTerrainSsrAcceptanceEnabled(window.location.search);
  const ssrReflectionTarget = ssrAcceptanceEnabled ? new TerrainSsrReflectionTarget(engine, scene) : undefined;

  engine.run();
  let completedRuntimes = 0;
  const trackRuntime = async <T>(label: string, startup: PromiseLike<T>): Promise<T> => {
    const value = await startup;
    completedRuntimes++;
    setStartupProgress(60 + Math.round((completedRuntimes / 6) * 28), `${label} ready…`);
    return value;
  };
  const [clipmapRenderer, _detailStartupDiagnostics, treeDiagnostics, placedPrefabDiagnostics, waterRuntime] =
    await Promise.all([
      trackRuntime("Terrain", clipmap.waitUntilReady()),
      trackRuntime("Surface details", details.waitUntilReady()),
      trackRuntime("Trees", trees.waitUntilReady()),
      trackRuntime("Scene Prefabs", placedPrefabs.waitUntilReady()),
      trackRuntime("Water", water.waitUntilReady()),
      trackRuntime("Environment lighting", lighting.waitForFirstIBLBake())
    ]);
  if (!clipmapRenderer) throw new Error("The loaded terrain Scene did not create a Clipmap renderer");
  if (TERRAIN_CENTRAL_REGION_ONLY) {
    if (!world.getAvailableRegionIds().includes(TERRAIN_CENTRAL_REGION_ID)) {
      throw new Error(`Integrated central-region inspection requires ${TERRAIN_CENTRAL_REGION_ID}`);
    }
    clipmap.setActiveRegions([TERRAIN_CENTRAL_REGION_ID]);
    details.setActiveRegions([TERRAIN_CENTRAL_REGION_ID]);
    trees.setActiveRegions([TERRAIN_CENTRAL_REGION_ID]);
    placedPrefabs.setActiveRegions([TERRAIN_CENTRAL_REGION_ID]);
  }
  water.coupleScenarioTerrain(clipmapRenderer);
  const groundProvider = new TerrainProjectRainImpactSurface(
    () => world.getAssets(),
    () => clipmapRenderer.puddleHydrology,
    () => world.getHeightRevision()
  );
  setStartupProgress(90, "Starting the shared cloud runtime…");
  const environment = await WorldEnvironmentRuntime.create(
    scene,
    camera,
    groundProvider,
    lighting,
    wind,
    water.rainImpactSurfaceProvider
  );
  const gpuWindExposure = WIND_GPU_RASTER_ENABLED
    ? new TerrainWindGpuExposureProvider(
        engine,
        () => clipmapRenderer.heightSamplingSource,
        () => world.getHeightRevision()
      )
    : null;
  wind.setGpuExposureProvider(gpuWindExposure);
  const detailDiagnostics = await waitForDetailCameraFrame(details);
  setStartupProgress(92, "Waiting for the complete camera frame…");
  navigation.setGroundProvider(groundProvider);
  const probeVolume = new TerrainProbeVolumeAuthoring(
    world.entity,
    scene,
    camera,
    createTerrainProjectProbeVolumeRegionSourceProvider(world.getAssets()),
    lighting
  );
  const heightRange = world
    .getAssets()
    .reduce<
      [number, number]
    >((range, asset) => [Math.min(range[0], asset.document.manifest.heightmap.minMetres), Math.max(range[1], asset.document.manifest.heightmap.maxMetres)], [Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]);
  const debugOwner = createTerrainRuntimeDebugOwner();
  const debugSession = await debugOwner.create({
    key: clipmapRenderer,
    engine,
    runtimeDebug: {
      scene,
      clipmap: clipmapRenderer,
      directLight,
      camera,
      postProcessRuntime: postProcess,
      lightingControl: lighting,
      heightRange
    },
    controls: {
      camera,
      navigation,
      terrain: clipmap.entity,
      details: details.entity,
      trees: trees.entity,
      prefabs: placedPrefabs.entity,
      water,
      lodControls: [trees, placedPrefabs],
      distanceCullingControls: [details]
    },
    inspector: {
      postProcess,
      lighting,
      environment,
      probeVolume
    },
    screenSpaceReflection: {
      readStatus: () => inspectScreenSpaceReflectionPanelStatus(camera, water),
      applyConfiguration: (configuration) => applyScreenSpaceReflectionConfiguration(camera, configuration)
    },
    environment
  });
  if (!debugSession) throw new Error("Integrated Terrain Debug creation became stale during startup.");
  const { debug, controls, inspector, screenSpaceReflectionPanel } = debugSession;
  setStartupProgress(96, "Preparing diagnostics and controls…");
  window.terrainRuntimeDebug = debug;
  if (TERRAIN_ONLY_MODE) {
    controls.setElementVisible("details", false);
    controls.setElementVisible("trees", false);
    controls.setElementVisible("prefabs", false);
    controls.setElementVisible("water", false);
    controls.setPose("overview");
  } else if (TERRAIN_WATER_SCENARIO === "lake-river") {
    controls.setPose("river");
  }
  window.terrainLightingDebug = {
    getLightingSystem: () => lighting.getSnapshot(),
    getIBLProfile: () => lighting.getIBLProfile(),
    setIBLProfilingEnabled: (enabled) => lighting.setIBLProfilingEnabled(enabled),
    resetIBLProfile: () => lighting.resetIBLProfile(),
    setIBLBakingEnabled: (enabled) => lighting.setIBLBakingEnabled(enabled),
    setLightingSystem: (values) => lighting.setTuning(values),
    inspectProbeVolumeLayout: () => probeVolume.layout,
    getProbeVolumeBake: () => probeVolume.getBakeSnapshot(),
    getProbeBakeLighting: () => lighting.getBakeLightingTuning(),
    setProbeBakeLighting: (values) => {
      lighting.setTuning({ playing: false });
      lighting.applyBakeLightingTuning(values);
    },
    bakeProbeVolume: (scenario, source) => probeVolume.bake(scenario, source)
  };
  window.terrainEnvironmentDebug = {
    getEnvironment: () => environment.getSnapshot(),
    setSkyLighting: (state) => environment.setSkyLighting(state),
    setCloud: (state) => environment.setCloud(state),
    setPrecipitation: (state) => environment.setPrecipitation(state),
    setSeason: (season) => environment.setSeason(season),
    setWind: (state) => environment.setWind(state),
    setCloudFrameTimeOverride: (elapsedSeconds, windOffsetWS) =>
      environment.setCloudFrameTimeOverride(elapsedSeconds, windOffsetWS),
    triggerWindGust: (amplitude) => environment.triggerWindGust(amplitude),
    setWindRenderingActive: (active) => wind.setRenderingActive(active),
    setLightning: (state) => environment.setLightning(state),
    setWeatherState: (state) => environment.setWeatherState(state),
    setTransitionDuration: (duration) => environment.setTransitionDuration(duration),
    setCloudQuality: (quality) => environment.setCloudQuality(quality),
    getSurfaceWaterTuning: () => environment.getSurfaceWaterTuning(),
    setSurfaceWaterTuning: (tuning) => environment.applySurfaceWaterTuning(tuning),
    resetSurfaceWaterTuning: () => environment.resetSurfaceWaterTuning(),
    resetSurfaceClimate: () => environment.resetSurfaceClimate()
  };
  window.addEventListener(
    "beforeunload",
    () => {
      wind.setGpuExposureProvider(null);
      gpuWindExposure?.destroy();
      debugOwner.destroy();
      probeVolume.dispose();
      environment.destroy();
      lighting.destroy();
      ssrReflectionTarget?.destroy();
      window.terrainLightingDebug = undefined;
      window.terrainEnvironmentDebug = undefined;
    },
    { once: true }
  );
  if (import.meta.env.DEV) {
    const { mountWaterDevTools } = await import("@galacean/engine-water/water/devtools/index");
    mountWaterDevTools({ loader: waterRuntime.loader, folderHost: inspector.waterDevToolsFolderHost });
  }
  performancePanel.setSceneMetricsProvider(() => {
    const detailSnapshot = details.getDiagnostics();
    const treeSnapshot = trees.getDiagnostics();
    const prefabSnapshot = placedPrefabs.getDiagnostics();
    const waterSnapshot = water.getDiagnostics();
    const screenSpaceReflection = camera.screenSpaceReflection.metrics;
    const visibleDetailInstances = TERRAIN_ONLY_MODE
      ? 0
      : detailSnapshot.batches.reduce((sum, batch) => sum + (batch.visibleInstances ?? 0), 0);
    const culledDetailInstances = TERRAIN_ONLY_MODE
      ? 0
      : detailSnapshot.batches.reduce((sum, batch) => sum + (batch.frustumCulledInstances ?? 0), 0);
    const detailDraws = TERRAIN_ONLY_MODE
      ? 0
      : detailSnapshot.batches.reduce((sum, batch) => sum + (batch.submittedDraws ?? 0), 0);
    return {
      clipmapSegments: clipmapRenderer.segmentCount,
      clipmapTriangles: clipmapRenderer.geometry.fullTopologyTriangles,
      activeRegions: clipmapRenderer.activeRegionCount,
      detailInstances: TERRAIN_ONLY_MODE ? 0 : detailSnapshot.instances,
      detailBatches: TERRAIN_ONLY_MODE ? 0 : detailSnapshot.batches.length,
      visibleDetailInstances,
      culledDetailInstances,
      detailDraws,
      treeInstances: TERRAIN_ONLY_MODE ? 0 : treeSnapshot.instances,
      treeLodGroups: TERRAIN_ONLY_MODE ? 0 : treeSnapshot.lodGroups,
      prefabInstances: TERRAIN_ONLY_MODE ? 0 : prefabSnapshot.instances,
      prefabLodGroups: TERRAIN_ONLY_MODE ? 0 : prefabSnapshot.lodGroups,
      waterVisible: TERRAIN_ONLY_MODE ? false : (waterSnapshot?.visible ?? false),
      waterChunks: TERRAIN_ONLY_MODE ? 0 : (waterSnapshot?.chunkCount ?? 0),
      msaaSamples: camera.msaaSamples,
      postProcessEnabled: postProcess.profileEnabled,
      screenSpaceReflectionRequested: screenSpaceReflection.requested,
      screenSpaceReflectionEffective: screenSpaceReflection.effective,
      screenSpaceReflectionConsumerLeaseCount: screenSpaceReflection.activeConsumerLeaseCount,
      screenSpaceReflectionOpaqueDraws: screenSpaceReflection.opaqueSurfacePassDrawCount,
      screenSpaceReflectionTransparentDraws: screenSpaceReflection.transparentSurfacePassDrawCount,
      screenSpaceReflectionEstimatedBytes: screenSpaceReflection.estimatedBytes,
      shadowCascadeCount: scene.shadowCascades
    };
  });

  const diagnostics: TerrainDemoDiagnostics = {
    ready: true,
    terrainOnly: TERRAIN_ONLY_MODE,
    devicePixelRatio: window.devicePixelRatio,
    renderPixelRatio: TERRAIN_RENDER_PIXEL_RATIO,
    drawingBuffer: [engine.canvas.width, engine.canvas.height],
    navigationSpeed: navigation.movementSpeed,
    regions: world.getDiagnostics(),
    clipmapRegions: clipmapRenderer.activeRegionCount,
    clipmapGeometry: clipmapRenderer.geometry,
    details: detailDiagnostics,
    trees: treeDiagnostics,
    placedPrefabs: placedPrefabDiagnostics,
    get water() {
      return water.getDiagnostics();
    },
    get controls() {
      return controls.getSnapshot();
    },
    get waterReflectionMode() {
      return water.reflectionMode;
    },
    get screenSpaceReflection() {
      return inspectScreenSpaceReflection(camera);
    },
    ssrAcceptanceEnabled,
    get ssrReflectionTarget() {
      return ssrReflectionTarget?.inspect() ?? null;
    },
    get performance() {
      return performancePanel.getSamplingSnapshot();
    },
    setCameraPose(pose) {
      controls.setPose(pose);
    },
    setElementVisible(group, visible) {
      controls.setElementVisible(group, visible);
    },
    setGlobalScreenSpaceReflectionEnabled(enabled) {
      if (typeof enabled !== "boolean") {
        throw new TypeError("Terrain global SSR state must be boolean.");
      }
      applyScreenSpaceReflectionConfiguration(camera, { globalEnabled: enabled });
      screenSpaceReflectionPanel.refresh();
    },
    configureScreenSpaceReflection(configuration) {
      applyScreenSpaceReflectionConfiguration(camera, configuration);
      screenSpaceReflectionPanel.refresh();
    },
    setScreenSpaceReflectionIntensity(intensity) {
      if (!Number.isFinite(intensity) || intensity < 0 || intensity > 1) {
        throw new RangeError("Terrain SSR intensity must be finite and within [0, 1].");
      }
      cameraScreenSpaceReflection(camera).intensity = intensity;
      screenSpaceReflectionPanel.refresh();
    },
    async setWaterScreenSpaceReflectionConsumptionEnabled(enabled) {
      if (typeof enabled !== "boolean") {
        throw new TypeError("Terrain Water SSR consumption state must be boolean.");
      }
      await water.setScreenSpaceReflectionCompositeIntensity(enabled ? 1 : 0);
    },
    setSsrAcceptancePresentation(enabled) {
      if (!ssrReflectionTarget) {
        throw new Error("Terrain SSR acceptance target is not enabled for this URL.");
      }
      ssrReflectionTarget.setAcceptancePresentation(enabled);
    },
    async setWaterReflectionMode(mode) {
      await controls.setWaterReflectionMode(mode);
      inspector.synchronizeWaterReflectionMode(mode);
    },
    setWaterSurfaceTime(elapsedTime) {
      water.setSurfaceTimeOverride(elapsedTime);
    },
    setSharedWaterLookReflectionIntensity(intensity) {
      return water.setSharedLookReflectionIntensity(intensity);
    },
    resetPerformanceSampling() {
      performancePanel.resetSamplingWindow();
    },
    getDiagnostics() {
      return {
        ready: true,
        terrainOnly: TERRAIN_ONLY_MODE,
        devicePixelRatio: window.devicePixelRatio,
        renderPixelRatio: TERRAIN_RENDER_PIXEL_RATIO,
        drawingBuffer: [engine.canvas.width, engine.canvas.height],
        navigationSpeed: navigation.movementSpeed,
        regions: world.getDiagnostics(),
        clipmapRegions: clipmapRenderer.activeRegionCount,
        clipmapGeometry: clipmapRenderer.geometry,
        details: details.getDiagnostics(),
        trees: trees.getDiagnostics(),
        placedPrefabs: placedPrefabs.getDiagnostics(),
        water: water.getDiagnostics(),
        controls: controls.getSnapshot(),
        waterReflectionMode: water.reflectionMode,
        screenSpaceReflection: inspectScreenSpaceReflection(camera),
        ssrAcceptanceEnabled,
        ssrReflectionTarget: ssrReflectionTarget?.inspect() ?? null,
        performance: performancePanel.getSamplingSnapshot(),
        lighting: lighting.getSnapshot(),
        environment: environment.getSnapshot(),
        probeVolume: {
          layout: probeVolume.layout,
          bake: probeVolume.getBakeSnapshot()
        }
      };
    },
    get lighting() {
      return lighting.getSnapshot();
    },
    get environment() {
      return environment.getSnapshot();
    },
    probeVolume: {
      layout: probeVolume.layout,
      bake: probeVolume.getBakeSnapshot()
    }
  };
  window.terrainDemo = diagnostics;
  inspector.synchronizeWaterReflectionMode(water.reflectionMode);
  await revealCompleteScene();
}

function cameraScreenSpaceReflection(camera: Camera): TerrainScreenSpaceReflectionTarget {
  const target = (camera as unknown as { readonly screenSpaceReflection?: TerrainScreenSpaceReflectionTarget })
    .screenSpaceReflection;
  if (!target) throw new Error("Terrain camera does not expose the expected screen-space reflection API.");
  return target;
}

function inspectScreenSpaceReflection(camera: Camera): TerrainScreenSpaceReflectionSnapshot {
  const target = cameraScreenSpaceReflection(camera);
  const metrics = target.metrics;
  return Object.freeze({
    activationMode: metrics.activationMode,
    receiverPolicy: metrics.receiverPolicy,
    globalEnabled: metrics.globalEnabled,
    intensity: target.intensity,
    requested: metrics.requested,
    requestedByManual: metrics.requestedByManual,
    requestedByConsumers: metrics.requestedByConsumers,
    effective: metrics.effective,
    supported: metrics.supported,
    activeConsumerLeaseCount: metrics.activeConsumerLeaseCount,
    resolvedSettings: Object.freeze({ ...metrics.resolvedSettings }),
    opaqueResolvedSettings: Object.freeze({ ...metrics.opaqueResolvedSettings }),
    transparentResolvedSettings: Object.freeze({ ...metrics.transparentResolvedSettings }),
    width: metrics.width,
    height: metrics.height,
    surfacePassDrawCount: metrics.surfacePassDrawCount,
    opaqueSurfacePassDrawCount: metrics.opaqueSurfacePassDrawCount,
    transparentSurfacePassDrawCount: metrics.transparentSurfacePassDrawCount,
    tracePassCount: metrics.tracePassCount,
    compositePassCount: metrics.compositePassCount,
    renderTargetCount: metrics.renderTargetCount,
    retainedRenderTargetCount: metrics.retainedRenderTargetCount,
    estimatedBytes: metrics.estimatedBytes,
    unsupportedReason: metrics.unsupportedReason,
    inactiveReason: metrics.inactiveReason,
    receiverEvidence: "surface-pass-draws",
    hitConfidenceEvidence: "phase-b-readback"
  });
}

function resolveTerrainWaterScenario(search: string): TerrainWaterScenario {
  const value = new URLSearchParams(search).get("waterScenario");
  if (value === null || value === "lake") return "lake";
  if (value === "lake-river") return value;
  throw new RangeError(`Unsupported Terrain waterScenario '${value}'. Expected 'lake' or 'lake-river'.`);
}

function setStartupProgress(percent: number, phase: string): void {
  const next = Math.max(loadingDiagnostics.percent, Math.min(100, Math.round(percent)));
  loadingDiagnostics.percent = next;
  loadingDiagnostics.phase = phase;
  loadingDiagnostics.history.push({ percent: next, phase });
  loadingBar.style.width = `${next}%`;
  loadingPercent.value = `${next}%`;
  status.textContent = phase;
}

async function revealCompleteScene(): Promise<void> {
  setStartupProgress(100, "Ready");
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  document.body.dataset.ready = "true";
  canvasElement.setAttribute("aria-hidden", "false");
  loadingDiagnostics.visible = false;
  loadingScreen.remove();
}

function showStartupError(message: string): void {
  loadingScreen.dataset.state = "error";
  loadingDiagnostics.phase = message;
  status.textContent = message;
}

async function waitForDetailCameraFrame(
  details: TerrainProjectDetailRuntime
): Promise<ReturnType<TerrainProjectDetailRuntime["getDiagnostics"]>> {
  for (let frame = 0; frame < 120; frame++) {
    const diagnostics = details.getDiagnostics();
    if (diagnostics.batches.every((batch) => batch.frameIndex !== null)) return diagnostics;
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }
  throw new Error("Terrain Detail batches did not complete a main-camera frame");
}

type ComponentConstructor<T extends Component> = new (entity: Entity) => T;

function findComponent<T extends Component>(
  roots: readonly Entity[],
  componentType: ComponentConstructor<T>
): T | undefined {
  for (const root of roots) {
    const components: T[] = [];
    root.getComponentsIncludeChildren(componentType, components);
    if (components.length) return components[0];
  }
  return undefined;
}
