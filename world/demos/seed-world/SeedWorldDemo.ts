import { SeedWorldVisualQuery } from "@galacean/engine-world-planning/world/SeedWorldVisualQuery";
import type { ProjectFileProvider } from "@galacean/engine-project/project-files/virtual-project-files";
import retrievalCatalog from "@galacean/engine-retrieval/retrieval/catalog.json";
import { createFarmingComponentExtension } from "@galacean/engine-runtime-editor/farming/FarmingComponentEditor";
import { mountProjectSaveControl } from "@galacean/engine-runtime-editor/project/project-save-control";
import { RuntimeProjectSession } from "@galacean/engine-runtime-editor/project/runtime-project-session";
import { createRetrievalIntegration } from "@galacean/engine-runtime-editor/retrieval-agent/index";
import { RuntimeNativeEditor } from "@galacean/engine-runtime-editor/runtime-editor-agent/runtime-native-editor";
import { installRuntimeProjectScripts } from "@galacean/engine-runtime-editor/runtime-editor/scripts/runtime-engine-scripts";
import { RuntimeMeshPickSource } from "@galacean/engine-runtime-editor/runtime-inspection/runtime-mesh-picking";
import { RuntimePickPreparation } from "@galacean/engine-runtime-editor/runtime-inspection/runtime-pick-preparation";
import { useProjectPlantResources } from "@galacean/engine-vegetation/asset-assembly/PlantSpeciesResources";
import { WaterBodyComponent } from "@galacean/engine-water/water/native/WaterBodyComponent";
import { createWaterSurfaceSample } from "@galacean/engine-water/water/runtime/index";
import {
  rockGrassExclusions,
  rockGrassWaterTest
} from "@galacean/engine-world-planning/integrations/terrain/rock-formation/GrassExclusions";
import { rockGrassPlacements } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/Placement";
import {
  canPublishRockFormationEdit,
  prepareRockFormationPublication,
  prepareRockMaterialPublication
} from "@galacean/engine-world-planning/integrations/terrain/rock-formation/Publication";
import { preparePlanningSurfaceSolidsSwap } from "@galacean/engine-world-planning/spatial/runtime/PlanningSurfaceSolids";
import {
  masonryPlacementAnchors,
  masonryRockTerrainSource,
  masonryTerrainSource
} from "@galacean/engine-world-planning/masonry/MasonryPlacement";
import { sameMasonryPlan } from "@galacean/engine-world-planning/masonry/MasonryPlanningOwnership";
import {
  NativeBuildingHost,
  type NativeBuildingWorld
} from "@galacean/engine-world-planning/masonry/NativeBuildingHost";
import type { mountNativeBuildingPanel } from "@galacean/engine-world-planning/masonry/NativeBuildingPanel";
import type { MobileSeedTickHost } from "./src/MobileFrameCapture.ts";
import { installSeedWorldGrassDrawOrder } from "./src/SeedWorldGrassDrawOrder";
import type { IslandPlan } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel";
import { worldTemplate } from "@galacean/engine-world-planning/spatial/WorldTemplateCatalog";
import { readAnimalPopulationConfig } from "@galacean/engine-world-planning/spatial/AnimalPopulationComponent";
import { planningFarmInitializationRequest } from "@galacean/engine-world-planning/spatial/farming/PlanningFarmInitialization";
import { planningWaterQueryProjection } from "@galacean/engine-world-planning/spatial/hydrology/PlanningWaterEdits";
import type { PlanningDocument } from "@galacean/engine-world-planning/spatial/PlanningDocument";
import {
  readGrassAppearance,
  readGrassGroundFusion,
  readSurfacePalette
} from "@galacean/engine-world-planning/spatial/PlanningGrassAppearance";
import {
  readSubjectView,
  resolveSubjectView,
  subjectViewLandscape
} from "@galacean/engine-world-planning/spatial/PlanningSubjectView";
import { applyPlanningWeather } from "@galacean/engine-world-planning/spatial/PlanningWeather";
import { readPlantMaterialParameters } from "@galacean/engine-world-planning/spatial/PlantMaterialParameters";
import { planningVegetationColors } from "@galacean/engine-world-planning/spatial/PlanningResources";
import { VegetationColors } from "@galacean/engine-world-planning/spatial/VegetationColors";
import { createSeedWorldWaterAgentKnowledge } from "./agent-adapter/SeedWorldKnowledge";
import { WATER_QUERY_CONTRACTS } from "@galacean/engine-world-planning/spatial/runtime/WaterQueryContract";
import { createNativeWaterAgentPackage } from "@galacean/engine-world-planning/spatial/runtime/NativeWaterAgent";
import type { mountNativeWaterPanel } from "@galacean/engine-world-planning/spatial/runtime/NativeWaterPanel";
import { NativeWaterHost } from "@galacean/engine-world-planning/spatial/runtime/NativeWaterHost";
import { PlanningLightingProfileRuntime } from "@galacean/engine-world-planning/spatial/runtime/PlanningLightingProfileRuntime";
import { planningNaturalGroundPopulation } from "@galacean/engine-world-planning/spatial/runtime/PlanningNaturalVegetation";
import {
  PlanningNaturalVegetationRuntime,
  planningNaturalGrassDensity
} from "@galacean/engine-world-planning/spatial/runtime/PlanningNaturalVegetationRuntime";
import { planningPresentedSolids } from "@galacean/engine-world-planning/spatial/runtime/PlanningPresentedSolids";
import {
  planningSurfacePublicationGate,
  preparePlanningWaterImpact
} from "@galacean/engine-world-planning/spatial/runtime/PlanningWaterPublication";
import { visitPlanningWorldPickBatches } from "@galacean/engine-world-planning/spatial/runtime/PlanningWorldPicking";
import { SeedWorldPicker } from "@galacean/engine-world-planning/world/SeedWorldPicker";
import { SeedWorldViewSnapshots } from "@galacean/engine-world-planning/world/SeedWorldViewSnapshot";
import { buildingInitializationInputs } from "./masonry/BuildingInitializationInputs.ts";
import { buildingScenePreparation, initializeBuildingScene } from "./masonry/BuildingSceneInitialization.ts";
import { BUILTIN_BUILDING_ASSETS } from "@galacean/engine-building/building/resources/BuiltinBuildingAssets";
import { masonryAppearance, type MasonryTintRole } from "@galacean/engine-building/building/runtime/MasonryAppearance";
import { getMasonryLodTuning, setMasonryLodTuning } from "@galacean/engine-building/building/runtime/MasonryLodPolicy";
import {
  getRockLodCrossFadeEnabled,
  setRockLodCrossFadeEnabled
} from "@galacean/engine-world-planning/integrations/terrain/rock-formation/RockLodView";
import type { SeedWorldPickVisitor } from "@galacean/engine-project/rendering/SeedWorldPickBatch";
import { bindWorldClickInput } from "./src/SeedWorldClickInput.ts";
import { waitForSnapshotWarmup } from "./src/SeedWorldSnapshotWarmup.ts";
import type { WorldSelection } from "./storage/SharedWorldStorage";
import { seedWorldStorageHost } from "./storage/SeedWorldStorageHost";
import { openSeedWorldProject } from "./SeedWorldProject.ts";
import {
  loadSeedWorldBuildingBinaryBundle,
  loadSeedWorldCommonBinaryBundle,
  loadSeedWorldTemplateBinaryBundles,
  releaseSeedWorldCommonBinaryBundle
} from "./src/SeedWorldCommonBinaryBundle.ts";
import { loadSeedWorldProjectTextBundle, parsePreloadedJson } from "./src/SeedWorldProjectTextBundle.ts";
import { runSeedWorldStartupShaderWarmup } from "./src/SeedWorldStartupShaderWarmup.ts";
import { createSeedWorldProjectClose } from "./SeedWorldProjectClose.ts";
import { SEED_WORLD_EDITOR_PATH, seedWorldProjectFormats } from "./SeedWorldProjectFormats.ts";
import { PlanningFarmingHost } from "./src/planning/spatial/farming/PlanningFarmingHost.ts";
import { PlanningFarmingRuntime } from "./src/planning/spatial/farming/PlanningFarmingRuntime.ts";
import {
  planningFarmingProjectStatePath,
  preparePlanningFarmingScene
} from "./src/planning/spatial/farming/PlanningFarmingScene.ts";
import { effectivePlanningWaterId } from "./src/planning/spatial/PlanningWaterSource.ts";
import { PlanningAnimalProjectAuthoring } from "./src/planning/spatial/runtime/PlanningAnimalAuthoring.ts";
import { PlanningAnimalFood } from "./src/planning/spatial/runtime/PlanningAnimalFood.ts";
import { PlanningAnimalHost } from "./src/planning/spatial/runtime/PlanningAnimalHost.ts";
import "./src/planning/spatial/runtime/PlanningAuthoringComponents.ts";
import {
  acquireCameraDepthTexturePrePass,
  type CameraDepthTexturePrePassLease
} from "@galacean/engine-project/rendering/CameraDepthTexturePrePass";
import { PlanningEntityAuthoring } from "./src/planning/spatial/runtime/PlanningAuthoringComponents.ts";
import {
  planningVegetationReferences,
  validatePlanningSource
} from "./src/planning/spatial/runtime/PlanningProjectSource.ts";
import { PlanningProjectStorage } from "./src/planning/spatial/runtime/PlanningProjectStorage.ts";
import { selectPlanningSpawnView, type PlanningSpawnView } from "./src/planning/spatial/runtime/PlanningSpawnView.ts";
import { PROCEDURAL_SKY_SOLAR_POSITION } from "@galacean/engine-environment/lighting/ProceduralSkyLightingProfile";
import { WORLD_TEMPLATE_ART } from "@galacean/engine-world-planning/spatial/WorldTemplateArtDirection";
import { preparePlanningWaterSource } from "./src/planning/spatial/runtime/PlanningWaterInitialization.ts";
import type { SeedWorldLassoPanel } from "./src/SeedWorldLassoPanel.ts";

import {
  AssetType,
  Camera,
  DepthTextureMode,
  DirectLight,
  FogMode,
  PostProcess,
  ShadowType,
  Matrix,
  Quaternion,
  Ray,
  Renderer,
  Scene,
  Script,
  ShaderMacroCollection,
  ShaderPass,
  Vector2,
  Vector3,
  WebGLEngine,
  registerVolumetricCloudShader,
  registerWindGpuFieldShaders,
  type Component,
  type Entity
} from "@galacean/engine";
import {
  SEED_WORLD_DEFAULT_FOG_VALUES,
  SEED_WORLD_DEFAULT_SHADOW_STRENGTH
} from "@galacean/engine-environment/terrain/lighting/SeedWorldLightingPreset";
import { PhysXPhysics, PhysXRuntimeMode } from "@galacean/engine-physics-physx";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import {
  TERRAIN_SCREEN_SPACE_REFLECTION_CONFIGURATION,
  applyScreenSpaceReflectionConfiguration
} from "@galacean/engine-terrain/terrain/debug/TerrainScreenSpaceReflectionPanel";
import { registerTerrainProjectResources } from "@galacean/engine-terrain/terrain/loader/TerrainSceneLoader";
import { WorldBubbleLoadingScene } from "@galacean/engine-terrain/terrain/loading/WorldBubbleLoadingScene";
import { TerrainNavigationRuntime } from "@galacean/engine-terrain/terrain/project/TerrainNavigationRuntime";
import { TerrainPostProcessRuntime } from "@galacean/engine-terrain/terrain/project/TerrainPostProcessRuntime";
import { TerrainWindRuntime } from "@galacean/engine-terrain/terrain/project/TerrainWindRuntime";
import { OrbitControl } from "@galacean/engine-toolkit-controls/dist/es/OrbitControl.js";
import { SEED_WORLD_PRODUCTION_ASSET_CATALOG } from "@galacean/engine-vegetation/asset-assembly/SeedWorldProductionAssetCatalog";
import type {
  TerrainOilPaintDebugControl,
  TerrainVistaDebugControl
} from "@galacean/engine-world-planning/integrations/terrain/debug/TerrainRuntimeDebugInspector";
import { sampleTerrainSurfacePuddleMask } from "@galacean/engine-world-planning/integrations/terrain/environment/TerrainRainImpactSurface";
import {
  TerrainWindGpuExposureProvider,
  registerTerrainWindGpuExposureShader
} from "@galacean/engine-world-planning/integrations/terrain/environment/TerrainWindGpuExposureProvider";
import { WorldEnvironmentRuntime } from "@galacean/engine-world-planning/integrations/terrain/environment/WorldEnvironmentRuntime";
import { INTEGRATED_WORLD_DAYLIGHT_REFERENCE_TIME_HOURS } from "@galacean/engine-world-planning/integrations/terrain/lighting/IntegratedWorldLightingPreset";
import { createIntegratedWorldLightingRuntime } from "@galacean/engine-world-planning/integrations/terrain/lighting/IntegratedWorldPresentation";
import { TERRAIN_DEFAULT_CAMERA_CONFIGURATION } from "@galacean/engine-world-planning/integrations/terrain/lighting/TerrainLightingRuntime";
import { RockFormationClient } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/Client";
import { RockNavigation } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/Navigation";
import { readRockFormationSettings } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/Settings";
import { PLANNING_REFERENCE } from "@galacean/engine-world-planning/planning-data/PlanningReference";
import {
  sampleSeedWorldHeight,
  seedWorldOriginX,
  seedWorldOriginZ
} from "@galacean/engine-world-planning/runtime/SeedWorldFields";
import { SeedWorldPanoramaVistaRuntime } from "@galacean/engine-world-planning/runtime/SeedWorldPanoramaVistaRuntime";
import {
  SEED_WORLD_ROAD_COLOR_DEFAULT,
  SEED_WORLD_SURFACE_LOD_CROSS_FADE_DURATION_SECONDS,
  SeedWorldTerrainRuntime
} from "@galacean/engine-world-planning/runtime/SeedWorldTerrainRuntime";
import {
  adoptPlanningAlphamap,
  planningAlphamap
} from "@galacean/engine-world-planning/semantic-study/PlanningAlphamap";
import {
  adoptPlanningHeightmap,
  planningHeightmap
} from "@galacean/engine-world-planning/semantic-study/PlanningHeightmap";
import {
  adoptPlanningOcean,
  preparedPlanningOcean
} from "@galacean/engine-world-planning/semantic-study/PlanningOceanSource";
import { PlanningRasterClient } from "@galacean/engine-world-planning/semantic-study/PlanningRasterClient";
import type { PlanningSessionOptions } from "@galacean/engine-world-planning/spatial/PlanningSession";
import {
  PlanningPlayerState,
  planningPlayerCameraPose,
  restorePlanningPlayerBookmark,
  type PlanningPlayerCameraPose
} from "@galacean/engine-world-planning/spatial/runtime/PlanningPlayerState";
import { preparePlanningPopulationResources } from "@galacean/engine-world-planning/spatial/runtime/PlanningPopulationRuntime";
import { PlanningSeedScenePublication } from "@galacean/engine-world-planning/spatial/runtime/PlanningSeedScenePublication";
import { createPlanningSeedSolids } from "@galacean/engine-world-planning/spatial/runtime/PlanningSeedSolids";
import {
  preparePlanningSeedWorldData,
  stripPlanningTerrainNormalSamples,
  type PlanningSeedWorldData
} from "@galacean/engine-world-planning/spatial/runtime/PlanningSeedWorldData";
import { applyPlanningTreeVariations } from "@galacean/engine-world-planning/spatial/runtime/PlanningTreeVariations";
import type { PreparedPlanningWater } from "@galacean/engine-world-planning/spatial/runtime/PlanningWaterRuntime";
import { PlanningWaterRuntime } from "@galacean/engine-world-planning/spatial/runtime/PlanningWaterRuntime";
import { PLANNING_RUNTIME_OPTIONS } from "@galacean/engine-world-planning/spatial/runtime/RuntimeOptions";
import { WorldTemplateRuntime } from "@galacean/engine-world-planning/spatial/runtime/WorldTemplateRuntime";
import {
  resolveWorldTemplateScene,
  resolveWorldTemplateSpawn,
  resolveWorldTemplateView
} from "@galacean/engine-world-planning/spatial/WorldTemplateView";
import { SeedWorldAudioRuntime } from "@galacean/engine-world-planning/world/SeedWorldAudioRuntime";
import { SeedWorldSceneEntityEffectHost } from "@galacean/engine-world-planning/world/SeedWorldSceneEntityEffectHost";
import {
  resolveSeedWorldCameraAnglesInto,
  resolveSeedWorldCameraForward,
  type SeedWorldCameraBookmark
} from "@galacean/engine-world-planning/world/SeedWorldCameraBookmark";
import {
  createSeedWorldShaderVariantSnapshotter,
  warmupSeedWorldRendererVariants,
  warmupSeedWorldShaderVariants,
  type SeedWorldShaderVariantEntry
} from "@galacean/engine-world-planning/world/SeedWorldShaderWarmup";
import { registerSeedWorldVoiceHudStartupShaders } from "./assistant/SeedWorldVoiceHudShaders.ts";
import { planningPageUrl } from "./src/planning/spatial/PlanningPageUrl.ts";
import type { PlanningSeedDebugSidebar } from "./src/planning/spatial/runtime/PlanningSeedDebugSidebar.ts";
import type { PlanningSeedObbDebug } from "./src/planning/spatial/runtime/PlanningSeedObbDebug.ts";
import type { PlanningSeedRuntimeDebug } from "./src/planning/spatial/runtime/PlanningSeedRuntimeDebug.ts";
import { PlanningSeedWorldSession } from "./src/planning/spatial/runtime/PlanningSeedWorldSession.ts";
import { preparePlanningTerrainPresentation } from "./src/planning/spatial/runtime/PlanningTerrainPresentation.ts";
import {
  createPlanningWorldSource,
  type PlanningWorldHandoff
} from "./src/planning/spatial/runtime/PlanningWorldSource.ts";
import { PlanningWorkerClient } from "./src/planning/semantic-study/PlanningWorkerClient.ts";
import { seedWorldBootTrace } from "./src/SeedWorldBootTrace.ts";

/** Explicit opt-in host interface for acceptance & benchmark harnesses (registered via globalThis.__seedWorldOnDiagnosticHost). */
export interface SeedWorldDiagnosticHost {
  readonly engine: WebGLEngine;
  readonly tools: PlanningSeedWorldSession | undefined;
  readonly ready: boolean;
  readonly animals: PlanningAnimalHost | undefined;
  readonly current: PlanningSeedScenePublication["current"];
}

type SeedWorldDiagnosticGlobal = typeof globalThis & {
  __seedWorldOnDiagnosticHost?: (host: SeedWorldDiagnosticHost | undefined) => void;
};

function waterAgentKnowledge() {
  return createSeedWorldWaterAgentKnowledge(
    WATER_QUERY_CONTRACTS.map((item) => item.name),
    { includeDigRiver: true }
  );
}

/** Avoid capturing the 500-line preparation scope Context in long-lived rock/wind callbacks. */
function bindGrassAppearanceRegistrar(world: SeedWorldTerrainRuntime) {
  return (material: Parameters<SeedWorldTerrainRuntime["registerGrassAppearanceMaterial"]>[0]) =>
    world.registerGrassAppearanceMaterial(material);
}

function createTerrainWindExposure(
  engine: WebGLEngine,
  first: SeedWorldTerrainRuntime,
  readWorld: () => SeedWorldTerrainRuntime | undefined,
  readRevision: () => number
) {
  return new TerrainWindGpuExposureProvider(
    engine,
    () => (readWorld() ?? first).clipmap.heightSamplingSource,
    readRevision
  );
}

/** Original Seed scene/HUD/gameplay host. The spatial planner supplies data, never its preview camera. */
export async function mountSeedWorldDemo(
  handoff?: PlanningWorldHandoff,
  options: {
    showAssistant?: boolean;
    persistPlayerState?: boolean;
    assetSources?: readonly ProjectFileProvider[];
    retrievalManifestUrl?: string;
    storageSelection?: WorldSelection;
  } = {}
): Promise<void> {
  let showAssistant = options.showAssistant !== false;
  const pageUrl = planningPageUrl().url;
  // Explicit diagnostic comparison only; never persists or changes shared defaults.
  const shaderWarmupBenchmark =
    pageUrl.searchParams.get("agentTrace") === "1" && pageUrl.searchParams.get("shaderWarmupBenchmark") === "1";
  const precompileShaders = PLANNING_RUNTIME_OPTIONS.precompileShaders || shaderWarmupBenchmark;
  const shell = document.createElement("main");
  shell.className = "seed-world";
  shell.innerHTML = `<section class="world-view"><canvas id="world-canvas" aria-label="Seed World 3D"></canvas><div id="world-loading" class="world-loading" data-state="fallback" role="status"><output class="world-loading-percent">0%</output><button class="world-loading-retry" hidden>重试</button></div></section>`;
  document.body.append(shell);
  const canvas = shell.querySelector<HTMLCanvasElement>("canvas")!;
  const loading = shell.querySelector<HTMLElement>("#world-loading")!;
  const percent = loading.querySelector("output")!;
  const retry = loading.querySelector<HTMLButtonElement>("button")!;
  retry.onclick = () => location.reload();
  canvas.dataset.runtime = "SeedWorld.scene";
  canvas.dataset.status = "loading";
  canvas.dataset.shaderPrecompile = String(precompileShaders);
  canvas.dataset.shaderWarmupBenchmark = String(shaderWarmupBenchmark);
  let engine: WebGLEngine | undefined;
  let orb: WorldBubbleLoadingScene | undefined;
  let scene: Scene | undefined;
  let plantColors = new VegetationColors([]);
  const planningWorker = new PlanningWorkerClient();
  let bootEmptyBuildingGeneratorId: string | undefined;
  let source: Awaited<ReturnType<typeof createPlanningWorldSource>> | undefined;
  let sourceTask: ReturnType<typeof createPlanningWorldSource> | undefined;
  let publication: PlanningSeedScenePublication | undefined;
  let sandstorm: Entity | undefined;
  let oilPaintPostEntity: Entity | undefined;
  let oilPaintPostEffect: import("./src/oil-paint/OilPaintPostEffect").OilPaintPostEffect | undefined;
  let oilPaintPostPass: import("./src/oil-paint/OilPaintPostPass").OilPaintPostPass | undefined;
  let oilPaintMacroEnabled = false;
  let oilPaintMacroDesired = false;
  let oilPaintMacroRequestId = 0;
  let mojaveLayout: Entity | undefined;
  const readWorld = () => publication?.current?.world;
  const readRevision = () => publication?.current?.revision ?? 0;
  const readPublished = () => {
    const current = publication?.current;
    return current
      ? {
          plan: current.data.plan,
          fields: current.heightTransition?.fields ?? current.data.fields,
          world: current.world,
          vegetation: current.vegetation,
          templateVegetation: current.template?.vegetationAssets,
          surface: current.data.surfaceIntent,
          publicationRevision: current.revision,
          sourcePlan: planningWaterQueryProjection(current.plan, current.solids.plan),
          ...(import.meta.env.DEV ? { publicationDiagnostics: publication!.getDiagnostics() } : {})
        }
      : undefined;
  };
  let water: PlanningWaterRuntime | undefined;
  let lighting: ReturnType<typeof createIntegratedWorldLightingRuntime> | undefined;
  let lightingProfile: PlanningLightingProfileRuntime | undefined;
  let environment: WorldEnvironmentRuntime | undefined;
  let vista: SeedWorldPanoramaVistaRuntime | undefined;
  let tools: PlanningSeedWorldSession | undefined;
  let animals: PlanningAnimalHost | undefined;
  let detachCompanionStoneObstacles: (() => void) | undefined;
  let detachAnimalLightning: (() => void) | undefined;
  let farmingHost: PlanningFarmingHost | undefined;
  let visualQuery: SeedWorldVisualQuery | undefined;
  let unregisterFarmingActivation: (() => void) | undefined;

  let audio: SeedWorldAudioRuntime | undefined;
  let playerState: PlanningPlayerState | undefined;
  let obbDebug: PlanningSeedObbDebug | undefined;
  let runtimeDebug: PlanningSeedRuntimeDebug | undefined;
  let debugSidebar: PlanningSeedDebugSidebar | undefined;
  let perfPanel: import("./src/SeedWorldPerfPanel.ts").SeedWorldPerfPanel | undefined;
  let autoBenchHandle: import("./src/SeedWorldAutoBench.ts").SeedWorldAutoBenchHandle | undefined;
  let dprOverride: number | null = null;
  let exposure: TerrainWindGpuExposureProvider | undefined;
  let detachWindExposure: (() => void) | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let nativeBuildingHost: NativeBuildingHost | undefined;
  let sceneEntityEffectHost: SeedWorldSceneEntityEffectHost | undefined;
  let nativeBuildingPanel: ReturnType<typeof mountNativeBuildingPanel> | undefined;
  let nativeWaterHost: NativeWaterHost | undefined;
  let nativeWaterPanel: ReturnType<typeof mountNativeWaterPanel> | undefined;
  let runtimeProject: RuntimeProjectSession | undefined;
  let unmountProjectSave: (() => void) | undefined;
  let nativeEditor: RuntimeNativeEditor | undefined;
  const retrievalManifestUrl = options.retrievalManifestUrl ?? retrievalCatalog.manifestUrl;
  const retrieval = retrievalManifestUrl ? createRetrievalIntegration(retrievalManifestUrl) : undefined;
  let worldPicker: SeedWorldPicker | undefined;
  let viewSnapshots: SeedWorldViewSnapshots | undefined;
  let lassoPanel: SeedWorldLassoPanel | undefined;
  let lassoFrozen = false;
  let assistantInputEnabled = true;
  let unbindWorldClick: (() => void) | undefined;
  const editorLifetime = new AbortController();
  canvas.addEventListener("contextmenu", (event) => event.preventDefault(), { signal: editorLifetime.signal });
  let pickPreparation: RuntimePickPreparation | undefined;
  let shaderAudit: import("./src/SeedWorldShaderAudit").SeedWorldShaderAuditHandle | undefined;
  let perfTour: import("./src/SeedWorldPerfTour").SeedWorldPerfTourHandle | undefined;
  let perfTourRunning = false;
  let perfTourTimer: number | undefined;
  let disposed = false;
  let ready = false;
  // Debug evidence only: Long Tasks measures main-thread tasks >=50ms, not
  // total interaction latency or GPU frame time. Retain a bounded recent window.
  let buildingLongTasks: PerformanceObserver | undefined;
  if (pageUrl.searchParams.get("agentTrace") === "1") {
    const entries: { startMs: number; durationMs: number }[] = [];
    const supported =
      typeof PerformanceObserver !== "undefined" && PerformanceObserver.supportedEntryTypes.includes("longtask");
    const report = () => {
      canvas.dataset.buildingLongTasks = JSON.stringify({
        supported,
        timeOrigin: performance.timeOrigin,
        retainedLimit: 128,
        entries
      });
    };
    report();
    if (supported) {
      buildingLongTasks = new PerformanceObserver((list) => {
        for (const entry of list.getEntries())
          entries.push({
            startMs: entry.startTime,
            durationMs: entry.duration
          });
        if (entries.length > 128) entries.splice(0, entries.length - 128);
        report();
      });
      buildingLongTasks.observe({ type: "longtask" });
    }
  }
  const raster = new PlanningRasterClient();
  const rockFormations = new RockFormationClient(() => engine!);
  let rockNavigation: RockNavigation | undefined;
  const bootTraceParam = pageUrl.searchParams.get("bootTrace") === "1";
  const perfTourParam = pageUrl.searchParams.get("perfTour") === "1";
  const perfTourSecRaw = Number(pageUrl.searchParams.get("perfTourSec"));
  const perfTourDurationSec = Number.isFinite(perfTourSecRaw) && perfTourSecRaw >= 8 ? perfTourSecRaw : 20;
  const traceBootSpans = pageUrl.searchParams.get("agentTrace") === "1" || bootTraceParam;
  seedWorldBootTrace.configure({
    url: pageUrl.href,
    verbose: traceBootSpans || pageUrl.searchParams.get("debug") === "1",
    autoOpenOverlay: bootTraceParam
  });
  seedWorldBootTrace.attachCanvas(canvas);
  seedWorldBootTrace.mountOverlay(shell);
  const bootPhases: { phase: string; startMs: number }[] = [];
  const traceBootPhase = (phase: string, progressValue?: number) => {
    seedWorldBootTrace.phase(phase, progressValue);
    if (!traceBootSpans) return;
    bootPhases.push({ phase, startMs: performance.now() });
    if (bootPhases.length > 64) bootPhases.shift();
    canvas.dataset.bootPhaseTimeline = JSON.stringify({
      timeOrigin: performance.timeOrigin,
      entries: bootPhases
    });
  };
  // Debug evidence only: spans may overlap (parallel work) or nest, so they are
  // not additive. Also emitted as User Timing measures for the DevTools timeline.
  const bootSpans: { name: string; startMs: number; endMs: number }[] = [];
  const syncBootSpansDataset = () => {
    if (!traceBootSpans) return;
    canvas.dataset.bootSpans = JSON.stringify({
      timeOrigin: performance.timeOrigin,
      entries: bootSpans
    });
  };
  const recordBootSpan = (name: string, startMs: number) => {
    const endMs = performance.now();
    bootSpans.push({ name, startMs, endMs });
    seedWorldBootTrace.recordSpan(name, startMs, endMs);
    if (traceBootSpans) {
      performance.measure(`seed-boot:${name}`, { start: startMs, end: endMs });
      syncBootSpansDataset();
    }
  };
  const timed = <T>(name: string, work: () => T): T => {
    const startMs = performance.now();
    const record = () => {
      const endMs = performance.now();
      bootSpans.push({ name, startMs, endMs });
      syncBootSpansDataset();
    };
    const result = seedWorldBootTrace.span(name, work);
    if (result instanceof Promise) return result.finally(record) as T;
    record();
    return result;
  };
  // Decouple visual loading animation & percentage from coarse real milestones (4%, 55%, etc.)
  // so the loading orb and counter glide smoothly without ever looking frozen during heavy boot steps.
  const LOADING_VISUAL_CEILING = 0.98;
  const LOADING_TIME_CONSTANT_SEC = 4.6;
  const LOADING_MAX_SLEW_PER_SEC = 0.24;
  let realLoadingProgress = 0;
  let visualLoadingProgress = 0;
  let displayedLoadingPercent = 0;
  let smoothLoadingRaf: number | undefined;
  let smoothLoadingActive = true;
  const loadingStartedMs = performance.now();
  let lastSmoothFrameMs = loadingStartedMs;

  const renderDisplayedPercent = (value: number) => {
    if (disposed || loading.dataset.state === "error") return;
    const clamped = Math.max(0, Math.min(1, value));
    const nextPercent = Math.max(displayedLoadingPercent, Math.round(clamped * 100));
    displayedLoadingPercent = nextPercent;
    percent.value = `${nextPercent}%`;
  };

  const stopSmoothLoading = () => {
    smoothLoadingActive = false;
    if (smoothLoadingRaf !== undefined) {
      cancelAnimationFrame(smoothLoadingRaf);
      smoothLoadingRaf = undefined;
    }
  };

  const tickSmoothLoading = (now: number) => {
    smoothLoadingRaf = undefined;
    if (!smoothLoadingActive || disposed || loading.dataset.state === "error") return;
    const dt = Math.max(0, Math.min((now - lastSmoothFrameMs) / 1000, 0.1));
    lastSmoothFrameMs = now;
    const elapsedSec = Math.max(0, (now - loadingStartedMs) / 1000);
    // Smooth asymptotic curve gliding continuously toward 98% regardless of real checkpoint pauses.
    const timeCurve = LOADING_VISUAL_CEILING * (1 - Math.exp(-elapsedSec / LOADING_TIME_CONSTANT_SEC));
    const targetVisual = Math.min(LOADING_VISUAL_CEILING, Math.max(timeCurve, realLoadingProgress * 0.95));
    if (targetVisual > visualLoadingProgress) {
      const easedStep = (targetVisual - visualLoadingProgress) * (1 - Math.exp(-3.4 * dt));
      const cappedStep = Math.min(easedStep, LOADING_MAX_SLEW_PER_SEC * dt);
      visualLoadingProgress = Math.min(LOADING_VISUAL_CEILING, visualLoadingProgress + Math.max(cappedStep, 0));
    }
    orb?.setProgress(visualLoadingProgress);
    renderDisplayedPercent(visualLoadingProgress);
    smoothLoadingRaf = requestAnimationFrame(tickSmoothLoading);
  };
  smoothLoadingRaf = requestAnimationFrame(tickSmoothLoading);

  const progress = (value: number, stage: string) => {
    traceBootPhase(stage, value);
    realLoadingProgress = Math.max(realLoadingProgress, Math.max(0, Math.min(1, value)));
    loading.setAttribute("aria-label", stage);
    canvas.dataset.bootPhase = stage;
    if (value >= 1) {
      stopSmoothLoading();
      // When the orb is present, let orb.reveal() smoothly sweep the counter up to 100%.
      if (!orb) renderDisplayedPercent(1);
    }
  };
  let disconnectEditorAssets: (() => void) | undefined;
  let restoreLodCrossFade: (() => void) | undefined;
  let restoreGrassDrawOrder: (() => void) | undefined;
  // Consumers must release overlays and subscriptions while their world still exists.
  // Advance only after success, so a release retry cannot destroy an earlier owner twice.
  const runtimeReleaseSteps: readonly [string, () => unknown][] = [
    [
      "编辑入口",
      () => {
        disposed = true;
        ready = false;
        stopSmoothLoading();
        (globalThis as SeedWorldDiagnosticGlobal).__seedWorldOnDiagnosticHost?.(undefined);
        seedWorldBootTrace.dispose(true);
        editorLifetime.abort();
        unmountProjectSave?.();
        unmountProjectSave = undefined;
        pickPreparation?.dispose();
        shaderAudit?.dispose();
        runtimeDebug?.destroy();
        unregisterFarmingActivation?.();
        nativeWaterHost?.dispose();
        restoreGrassDrawOrder?.();
        restoreGrassDrawOrder = undefined;
        restoreLodCrossFade?.();
        restoreLodCrossFade = undefined;
      }
    ],
    ["农场宿主", () => farmingHost?.dispose()],
    ["Visual query", () => visualQuery?.dispose()],
    ["建筑宿主", () => nativeBuildingHost?.dispose()],
    [
      "场景交互",
      () => {
        lassoPanel?.dispose();
        viewSnapshots?.dispose();
        unbindWorldClick?.();
        worldPicker?.dispose();
        detachWindExposure?.();
        detachAnimalLightning?.();
      }
    ],
    ["动物", () => {
      detachCompanionStoneObstacles?.();
      detachCompanionStoneObstacles = undefined;
      animals?.dispose();
    }],
    ["玩家状态", () => playerState?.dispose()],
    [
      "编辑器",
      () => {
        lightingProfile?.dispose();
        debugSidebar?.destroy();
        if (perfTourTimer !== undefined) {
          window.clearTimeout(perfTourTimer);
          perfTourTimer = undefined;
        }
        perfTour?.dispose();
        perfTour = undefined;
        autoBenchHandle?.dispose();
        autoBenchHandle = undefined;
        perfPanel?.dispose();
        disconnectEditorAssets?.();
        tools?.dispose();
        nativeWaterPanel?.destroy();
        nativeBuildingPanel?.destroy();
        sceneEntityEffectHost?.dispose();
        nativeEditor?.dispose();
        retrieval?.dispose();
      }
    ],
    ["调试对象", () => obbDebug?.destroy()],
    ["音频", () => audio?.destroy()],
    [
      "作者会话",
      async () => {
        if (source) source.dispose();
        else
          await sourceTask?.then(
            (value) => value.dispose(),
            () => {}
          );
        planningWorker.dispose();
        resizeObserver?.disconnect();
      }
    ],
    ["已发布场景", () => publication?.destroy()],
    [
      "地形任务",
      () => {
        raster.dispose();
        rockFormations.dispose();
        rockNavigation?.dispose();
        buildingLongTasks?.disconnect();
      }
    ],
    ["水运行", () => water?.destroy()],
    ["远景环山", () => vista?.destroy()],
    ["沙雾", () => sandstorm?.destroy()],
    ["油画后处理效果", () => {
      oilPaintPostEntity?.destroy();
    }],
    ["油画后处理 Pass", () => oilPaintPostPass?.destroy()],
    ["Mojave 景观", () => mojaveLayout?.destroy()],
    ["环境", () => environment?.destroy()],
    ["光照", () => lighting?.destroy()],
    ["加载界面", () => orb?.destroy()],
    ["Scene", () => scene?.destroy()],
    ["Engine", () => engine?.destroy()]
  ];
  let runtimeReleaseIndex = 0;
  const disposeRuntime = async () => {
    while (runtimeReleaseIndex < runtimeReleaseSteps.length) {
      const [name, release] = runtimeReleaseSteps[runtimeReleaseIndex];
      try {
        await release();
      } catch (error) {
        throw new Error(`释放${name}失败`, { cause: error });
      }
      runtimeReleaseIndex++;
    }
  };
  const dispose = createSeedWorldProjectClose(
    async () => {
      tools?.dispose();
      await runtimeDebug?.stopEmbeddedPanels();
      await nativeWaterPanel?.stop();
      editorLifetime.abort();
      nativeEditor?.editor.dispose();
      // Runtime errors are diagnostics. Accepted authoring must still be saved.
      await nativeWaterHost?.flush().catch(() => {});
      ready = false;
      engine?.pause();
      await farmingHost?.runtime?.stop();
      await playerState?.dispose();
    },
    async () => {
      await runtimeProject?.save();
    },
    async () => {
      await disposeRuntime();
      releaseSeedWorldCommonBinaryBundle();
      runtimeProject?.dispose();
    }
  );
  const closeFailure = (error: unknown) => {
    console.error("Seed World close failed", error);
    canvas.dataset.closeError = JSON.stringify(error, (_key, value) =>
      value instanceof Error
        ? {
            name: value.name,
            message: value.message,
            stack: value.stack,
            cause: value.cause,
            ...(value instanceof AggregateError ? { errors: value.errors } : {})
          }
        : value
    );
    stopSmoothLoading();
    loading.hidden = false;
    loading.dataset.state = "error";
    const reason = (error: unknown): string =>
      error instanceof AggregateError
        ? error.errors.map(reason).join("；")
        : error instanceof Error
          ? error.message + (error.cause ? "：" + reason(error.cause) : "")
          : String(error);
    // The loader orb may already be retired when a later release fails.
    canvas.dataset.bootPhase = "工程关闭失败：" + reason(error);
    loading.setAttribute("aria-label", canvas.dataset.bootPhase);
    percent.value = canvas.dataset.bootPhase;
    retry.hidden = false;
    retry.textContent = "重试关闭";
    retry.style.pointerEvents = "auto";
    retry.onclick = () => {
      void dispose()
        .then(() => location.reload())
        .catch(closeFailure);
    };
  };
  window.addEventListener(
    "pagehide",
    () => {
      void dispose().catch((error) => console.error("Seed World close failed", error));
    },
    { once: true }
  );
  try {
    // Overlap Planning Worker boot and startup asset bundle fetches with WebGLEngine + Loading Orb initialization.
    planningWorker.prewarm();
    const hardwareCores = typeof navigator !== "undefined" ? (navigator.hardwareConcurrency ?? 8) : 8;
    const isTouchBootDevice =
      typeof window !== "undefined" &&
      ("ontouchstart" in window || (typeof navigator !== "undefined" && (navigator.maxTouchPoints ?? 0) > 0));
    const isConstrainedMobileBoot = hardwareCores <= 4 || isTouchBootDevice;
    const projectUrl = new URL(SEED_WORLD_PRODUCTION_ASSET_CATALOG.projectUrl, location.href).href;
    let prefetchedBinaryAssets: Map<string, Uint8Array> | undefined;
    let prefetchedBinaryReleased = false;
    const syncPrefetchedBinaryAssets = () => {
      if (disposed || !engine || prefetchedBinaryReleased) return;
      (
        engine.resourceManager as {
          setPrefetchedBinaryAssets?: (assets: ReadonlyMap<string, Uint8Array> | undefined) => void;
        }
      ).setPrefetchedBinaryAssets?.(prefetchedBinaryAssets);
    };
    const addPrefetchedBinaryAssets = (assets: ReadonlyMap<string, Uint8Array> | undefined) => {
      if (!assets || assets.size === 0 || disposed || prefetchedBinaryReleased) return;
      prefetchedBinaryAssets ??= new Map<string, Uint8Array>();
      for (const [key, bytes] of assets) {
        prefetchedBinaryAssets.set(key, bytes);
      }
      syncPrefetchedBinaryAssets();
    };
    const releasePrefetchedBinaryAssets = () => {
      if (prefetchedBinaryReleased) return;
      prefetchedBinaryReleased = true;
      prefetchedBinaryAssets?.clear();
      prefetchedBinaryAssets = undefined;
      engine?.resourceManager?.setPrefetchedBinaryAssets?.(undefined);
      releaseSeedWorldCommonBinaryBundle();
    };
    let prefetchedTextAssetsTask: Promise<ReadonlyMap<string, string> | undefined> | undefined = timed(
      "loadProjectTextBundle (parallel)",
      () => loadSeedWorldProjectTextBundle()
    );
    void prefetchedTextAssetsTask.catch(() => {});
    let commonBinaryBundleTask: Promise<ReadonlyMap<string, Uint8Array> | undefined> | undefined = timed(
      "loadCommonBinaryBundle (parallel)",
      () =>
        loadSeedWorldCommonBinaryBundle().then((assets) => {
          addPrefetchedBinaryAssets(assets);
          return assets;
        })
    );
    void commonBinaryBundleTask.catch(() => {});
    const requestedTemplateId = pageUrl.searchParams.get("template") ?? "original";
    const eagerBuildingBundle = requestedTemplateId !== "titan-wasteland" && requestedTemplateId !== "low-poly";
    let buildingBinaryBundleTask: Promise<ReadonlyMap<string, Uint8Array> | undefined> | undefined = eagerBuildingBundle
      ? timed("loadBuildingBinaryBundle (parallel)", () =>
          loadSeedWorldBuildingBinaryBundle().then((assets) => {
            addPrefetchedBinaryAssets(assets);
            return assets;
          })
        )
      : undefined;
    void buildingBinaryBundleTask?.catch(() => {});
    const templateBinaryBundleTask = timed(`loadTemplateBinaryBundles (${requestedTemplateId})`, () =>
      loadSeedWorldTemplateBinaryBundles(requestedTemplateId, (shard) => {
        addPrefetchedBinaryAssets(shard);
      })
    );
    void templateBinaryBundleTask.catch(() => {});

    if (pageUrl.searchParams.get("shaderAudit") === "1" || bootTraceParam || perfTourParam) {
      const { installSeedWorldShaderAudit } = await import("./src/SeedWorldShaderAudit");
      shaderAudit = installSeedWorldShaderAudit();
      seedWorldBootTrace.setShaderAuditProvider(() => shaderAudit?.snapshot());
    }
    engine = await timed("WebGLEngine.create", () =>
      WebGLEngine.create({
        canvas,
        physics: new PhysXPhysics(
          PhysXRuntimeMode.Auto,
          import.meta.env.DEV
            ? {
                wasmModeUrl: new URL("../../../packages/physics-physx/libs/physx.release.js", import.meta.url).href,
                wasmSIMDModeUrl: new URL("../../../packages/physics-physx/libs/physx.release.simd.js", import.meta.url)
                  .href
              }
            : undefined
        ),
        shaderCompiler: new ShaderCompiler()
      })
    );
    let parallelCompileSupported = false;
    {
      const rhi = (engine as unknown as { _hardwareRenderer?: { gl?: WebGL2RenderingContext } })._hardwareRenderer;
      const gl = rhi?.gl;
      if (gl) {
        const dbg = gl.getExtension("WEBGL_debug_renderer_info");
        const vendor = dbg
          ? String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL) ?? "")
          : String(gl.getParameter(gl.VENDOR) ?? "");
        const renderer = dbg
          ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) ?? "")
          : String(gl.getParameter(gl.RENDERER) ?? "");
        parallelCompileSupported = Boolean(gl.getExtension("KHR_parallel_shader_compile"));
        seedWorldBootTrace.setMeta({
          device: {
            webglVersion: "WebGL2",
            gpuVendor: vendor || "unknown",
            gpuRenderer: renderer || "unknown",
            parallelShaderCompile: parallelCompileSupported
          }
        });
        seedWorldBootTrace.event(
          "info",
          "webgl",
          `WebGL2 ${renderer || "unknown"}`,
          `texUnits=${gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS)} vsTex=${gl.getParameter(gl.MAX_VERTEX_TEXTURE_IMAGE_UNITS)} combTex=${gl.getParameter(gl.MAX_COMBINED_TEXTURE_IMAGE_UNITS)} vsUni=${gl.getParameter(gl.MAX_VERTEX_UNIFORM_VECTORS)} fsUni=${gl.getParameter(gl.MAX_FRAGMENT_UNIFORM_VECTORS)} vary=${gl.getParameter(gl.MAX_VARYING_VECTORS)} attr=${gl.getParameter(gl.MAX_VERTEX_ATTRIBS)} parallel=${parallelCompileSupported}`
        );
      }
    }
    (globalThis as SeedWorldDiagnosticGlobal).__seedWorldOnDiagnosticHost?.({
      engine: engine!,
      get tools() {
        return tools;
      },
      get ready() {
        return ready;
      },
      get animals() {
        return animals;
      },
      get current() {
        return publication?.current;
      }
    });
    const isTouchMobilePick =
      typeof window !== "undefined" &&
      ("ontouchstart" in window || (typeof navigator !== "undefined" && (navigator.maxTouchPoints ?? 0) > 0));
    pickPreparation = timed(
      "new RuntimePickPreparation",
      () =>
        new RuntimePickPreparation(engine!, {
          deferStart: true,
          backgroundConcurrency: parallelCompileSupported ? (isTouchMobilePick ? 4 : 12) : isTouchMobilePick ? 1 : 2,
          backgroundCooldownMs: isTouchMobilePick ? 16 : 0,
          flushConcurrency: parallelCompileSupported ? 28 : 4
        })
    );
    pickPreparation.ignoreShaderPrefixes([
      "IntegratedWorld/",
      "Building/BrickPackKernel",
      "TinyGlade/RoofGravity",
      "World/VolumetricClouds",
      "SeedWorld/LiquidGlass",
      "SeedWorld/VoiceOrb",
      "SeedWorld/WorkingText",
      "SeedWorld/PhotoCopy",
      "SeedWorld/SnapshotSurfacePack",
      "SeedWorld/InteractionDepthPack",
      "SeedWorld/PanoramaFarHorizon",
      "SeedWorld/HologramRainbow",
      "SeedWorld/ForwardGrassTF",
      "SeedWorld/MarkupViewport",
      "SeedWorld/MarkupStrokeField",
      "OilPaint/",
      "PostProcess/OilPaint"
    ]);
    pickPreparation.ignoreSourceMacros([
      "RENDERER_GENERATION_REVEAL",
      "TERRAIN_PROJECT_ENTRANCE_WAVE",
      "RENDERER_MASONRY_ENTRANCE",
      "GLOBAL_PROXY_ENTRANCE",
      "RENDERER_MASONRY_DITHER",
      "GLOBAL_PROXY_DITHER",
      "MASONRY_SURFACE_DITHER"
    ]);
    const resize = () => {
      if (!canvas.clientWidth || !canvas.clientHeight) return;
      const nativeDpr = window.devicePixelRatio || 1;
      const dpr = Math.min(nativeDpr, dprOverride ?? 2);
      engine!.canvas.setResolution(
        Math.max(1, Math.round(canvas.clientWidth * dpr)),
        Math.max(1, Math.round(canvas.clientHeight * dpr))
      );
      orb?.resize();
    };
    timed("engine.initAndRun", () => {
      engine!.sceneManager.activeScene!?.destroy();
      resizeObserver = new ResizeObserver(resize);
      resizeObserver.observe(canvas);
      resize();
      engine!.run();
    });
    traceBootPhase("loadingScene");
    // Start the Loading Orb without blocking project registration or planning-worker kickoff
    // on its 2 warmup rAF frames; join orbTask before attachWorldUnderlay().
    const orbTask = timed("WorldBubbleLoadingScene.createInEngine", () =>
      WorldBubbleLoadingScene.createInEngine(engine!, {
        waitForWarmupFrames: false,
        onVisualProgress: (visual) => renderDisplayedPercent(visual)
      }).then((created) => {
        if (disposed) {
          created.destroy();
          return undefined;
        }
        orb = created;
        if (loading.dataset.state !== "error") loading.dataset.state = "loading";
        if (visualLoadingProgress > 0) created.synchronizeProgress(visualLoadingProgress);
        return created;
      })
    );
    void orbTask.catch(() => {});
    loading.dataset.state = "loading";
    progress(0.04, "准备 Seed 场景");
    syncPrefetchedBinaryAssets();
    const prefetchedTextAssets = await timed("await project text bundle", () => prefetchedTextAssetsTask!);
    prefetchedTextAssetsTask = undefined;
    (
      engine!.resourceManager as {
        setPrefetchedTextAssets?: (assets: ReadonlyMap<string, string> | undefined) => void;
      }
    ).setPrefetchedTextAssets?.(prefetchedTextAssets);
    const preloadedProjectText = prefetchedTextAssets?.get(projectUrl);
    const preloadedProject =
      parsePreloadedJson<Parameters<typeof registerTerrainProjectResources>[2]>(preloadedProjectText);
    const initialProject = await timed("registerTerrainProjectResources", () =>
      registerTerrainProjectResources(engine!, projectUrl, preloadedProject)
    );
    if (initialProject.textureDownloadPaths) {
      const urls = new Map(
        Object.entries(initialProject.textureDownloadPaths).map(([source, target]) => [
          new URL(source, projectUrl).href,
          new URL(target, projectUrl).href
        ] as const)
      );
      (
        engine!.resourceManager as { setDownloadUrls?: (urls: ReadonlyMap<string, string>) => void }
      ).setDownloadUrls?.(urls);
    }
    runtimeProject = await timed("openSeedWorldProject", () =>
      openSeedWorldProject(pageUrl, initialProject, prefetchedTextAssets, options.storageSelection)
    );
    if (disposed) {
      runtimeProject.dispose();
      throw new Error("Seed page disposed during project restoration");
    }
    const sharedStorage = await seedWorldStorageHost();
    showAssistant = showAssistant && runtimeProject.canSave;
    const planningStorage = new PlanningProjectStorage(runtimeProject, seedWorldProjectFormats);
    sourceTask = timed("createPlanningWorldSource (parallel)", () =>
      createPlanningWorldSource(pageUrl.search, handoff, planningStorage, planningWorker)
    );
    void sourceTask.catch(() => {});
    let voiceHudShadersRegistered = false;
    const ensureVoiceHudStartupShaders = () => {
      if (voiceHudShadersRegistered) return;
      voiceHudShadersRegistered = true;
      registerSeedWorldVoiceHudStartupShaders();
    };
    const eagerVoiceHudShaders = pageUrl.searchParams.get("agentTrace") === "1";
    // Overlap startup shaders and farming scene setup while WorldPlanning.worker.ts
    // and planningSource.storage.initialize run without competing for CDN bandwidth.
    const startupShadersTask = (async () => {
      const startupShadersAt = performance.now();
      registerWindGpuFieldShaders();
      registerTerrainWindGpuExposureShader();
      registerVolumetricCloudShader();
      if (eagerVoiceHudShaders) ensureVoiceHudStartupShaders();
      // Preload AOT Water .shaderc files from the common SWB1 bundle before registering startup
      // profiles so resolveWaterShaderModule hits Shader.find() instead of JIT Shader.create().
      await commonBinaryBundleTask;
      syncPrefetchedBinaryAssets();
      const waterAotShaderPaths = initialProject.files
        .filter((file) => file.type === "Shader" && file.virtualPath.startsWith("Shader/Water/"))
        .map((file) => file.virtualPath);
      if (waterAotShaderPaths.length > 0 && !disposed) {
        await Promise.allSettled(
          waterAotShaderPaths.map((url) => engine!.resourceManager.load({ type: AssetType.Shader, url }))
        );
      }
      if (disposed) return;
      const { registerSeedWorldWaterStartupShaders } = await import(
        "@galacean/engine-water/world/SeedWorldWaterStartupShaders"
      );
      registerSeedWorldWaterStartupShaders();
      recordBootSpan("register startup shaders", startupShadersAt);
    })();
    void startupShadersTask.catch(() => {});
    useProjectPlantResources(engine!, planningVegetationReferences(runtimeProject!.projectPackage));
    await timed("preparePlanningFarmingScene", () =>
      preparePlanningFarmingScene(runtimeProject!, { baseUrl: location.href })
    );
    // Pre-spawn idle raster worker while planning worker runs so module fetch/parse is off the critical path.
    raster.prewarm();
    if (requestedTemplateId === "oil-paint") {
      void import("@galacean/engine-world-planning/spatial/oil-paint/OilPaintTextures")
        .then(({ prewarmOilPaintBrushTexture }) => {
          if (!disposed) prewarmOilPaintBrushTexture();
        })
        .catch(() => {});
    }
    source = await timed("await planning source", () => sourceTask!);
    await timed("await common binary bundle", () => commonBinaryBundleTask);
    commonBinaryBundleTask = undefined;
    // Launch CPU-heavy rasterization, rock formation prep, and zero-SWB1 project setup immediately
    // without blocking on template SWB1 shard downloads so cold Wi-Fi boots never idle the CPU.
    let prewarmedRasterPlan: IslandPlan | undefined = source.takeInitialPlan();
    if (requestedTemplateId !== "oil-paint" && prewarmedRasterPlan?.parameters.worldTemplate?.id === "oil-paint") {
      void import("@galacean/engine-world-planning/spatial/oil-paint/OilPaintTextures")
        .then(({ prewarmOilPaintBrushTexture }) => {
          if (!disposed) prewarmOilPaintBrushTexture();
        })
        .catch(() => {});
    }
    const hasPlannedBuildings = (prewarmedRasterPlan?.buildings?.length ?? 0) > 0;
    let prewarmedRasterTask: ReturnType<PlanningRasterClient["run"]> | undefined;
    let prewarmedRocksTask: ReturnType<RockFormationClient["prepare"]> | undefined;
    if (prewarmedRasterPlan) {
      prewarmedRasterTask = timed("raster.run", () => raster.run(prewarmedRasterPlan!, true, true));
      prewarmedRocksTask = timed("rockFormations.prepare", () =>
        rockFormations.prepare(prewarmedRasterPlan!, editorLifetime.signal)
      );
      void prewarmedRasterTask.catch(() => {});
      void prewarmedRocksTask.catch(() => {});
    }
    // Chain template-SWB1-consuming population resource preload onto templateBinaryBundleTask so it
    // starts immediately once template shards arrive (overlapping with raster/project setup on fast
    // connections while never firing duplicate HTTP fetches on slow cold Wi-Fi).
    const prewarmedPopulationResources = templateBinaryBundleTask.then(() => {
      if (disposed) throw new DOMException("Seed page disposed during startup", "AbortError");
      return preparePlanningPopulationResources(engine!);
    });
    void prewarmedPopulationResources.catch(() => {});
    if (hasPlannedBuildings && !buildingBinaryBundleTask) {
      buildingBinaryBundleTask = timed("loadBuildingBinaryBundle", () =>
        loadSeedWorldBuildingBinaryBundle().then((assets) => {
          addPrefetchedBinaryAssets(assets);
          return assets;
        })
      );
      void buildingBinaryBundleTask.catch(() => {});
    }
    await timed("planningStorage.migrateToSource", () =>
      planningStorage.migrateToSource(source!.session.document, source!.replaceSavedTemplate)
    );
    await timed("installRuntimeProjectScripts", () =>
      installRuntimeProjectScripts(runtimeProject!, editorLifetime.signal)
    );
    if (disposed) {
      runtimeProject.dispose();
      throw new Error("Seed page disposed during script preparation");
    }
    const resources = await timed("runtimeProject.resources", () => runtimeProject!.resources());
    if (disposed) {
      runtimeProject.dispose();
      throw new Error("Seed page disposed during resource preparation");
    }
    timed("registerVirtualResources + plant resources", () => {
      engine!.resourceManager.registerVirtualResources(resources);
      useProjectPlantResources(engine!, planningVegetationReferences(runtimeProject!.projectPackage));
    });
    // On warm starts where building-kit.prefab is already compiled in project contents, start loading it
    // immediately while raster.run and scene/environment setup continue in parallel (only if plan has buildings).
    if (
      hasPlannedBuildings &&
      !disposed &&
      runtimeProject.projectPackage.contents[BUILTIN_BUILDING_ASSETS] !== undefined
    ) {
      void engine!.resourceManager.load({ type: AssetType.Prefab, url: BUILTIN_BUILDING_ASSETS }).catch(() => {});
    }
    // Start the checkpoint alongside scene preparation. A restored world can be entered
    // while its next save is pending or needs a retry through the save control.
    const startupSaveTask =
      runtimeProject.isPersistent && runtimeProject.canSave
        ? timed("runtimeProject.save (startup)", () => runtimeProject!.save())
        : undefined;
    void startupSaveTask?.catch((error) => {
      if (!sharedStorage && !disposed) console.warn("[SeedWorld] Initial local project save failed:", error);
    });
    await startupShadersTask;
    if (hasPlannedBuildings && buildingBinaryBundleTask) {
      await timed("await building binary bundle", () => buildingBinaryBundleTask!);
    }
    // Gate template-SWB1 consumers (scene load, population resources, building leaf preload) after
    // raster.run, rockFormations.prepare, and project setup are already in flight or complete.
    await timed("await template binary bundles", () => templateBinaryBundleTask);
    if (disposed) {
      runtimeProject.dispose();
      throw new Error("Seed page disposed during template bundle load");
    }
    if (hasPlannedBuildings && !disposed && runtimeProject) {
      const leafTypes = new Set(["Mesh", "KTX2", "Texture", "Shader"]);
      const buildingLeafFiles = runtimeProject.projectPackage.project.files.filter(
        (file) =>
          file.virtualPath.startsWith("Building/") &&
          leafTypes.has(file.type) &&
          !file.dependencies?.length &&
          runtimeProject!.projectPackage.contents[file.virtualPath] === undefined
      );
      if (buildingLeafFiles.length > 0) {
        engine!.resourceManager.registerVirtualResources(buildingLeafFiles);
        const startBuildingLeafPreload = () => {
          if (disposed) return;
          let cursor = 0;
          // On constrained mobile devices (<= 4 cores / touch), pace KTX2 transcoding at concurrency=1
          // after raster.run completes so WASM workers do not starve big cores or trigger thermal throttling.
          const concurrency = Math.min(isConstrainedMobileBoot ? 1 : 3, buildingLeafFiles.length);
          for (let w = 0; w < concurrency; w++) {
            void (async () => {
              while (!disposed && cursor < buildingLeafFiles.length) {
                const file = buildingLeafFiles[cursor++];
                try {
                  await engine!.resourceManager.load({ url: file.virtualPath });
                } catch {
                  // Best-effort preload; authoritative loaders surface any real asset failure.
                }
              }
            })();
          }
        };
        if (isConstrainedMobileBoot && prewarmedRasterTask) {
          void prewarmedRasterTask.finally(startBuildingLeafPreload);
        } else {
          startBuildingLeafPreload();
        }
      }
      // On warm starts where building-kit.prefab is already compiled in project contents, start loading it
      // immediately while raster.run and scene/environment setup continue in parallel (only if plan has buildings).
      if (runtimeProject.projectPackage.contents[BUILTIN_BUILDING_ASSETS] !== undefined) {
        void engine!.resourceManager.load({ type: AssetType.Prefab, url: BUILTIN_BUILDING_ASSETS }).catch(() => {});
      }
    }
    traceBootPhase("sceneAndPopulationResources");
    const sourceResources = timed(
      "preparePlanningPopulationResources",
      () => prewarmedPopulationResources ?? preparePlanningPopulationResources(engine!)
    );
    const sceneTask = timed("loadSeedWorldScene", () =>
      engine!.resourceManager.load<Scene>({
        type: AssetType.Scene,
        url: runtimeProject!.projectPackage.project.scene
      })
    );
    // Join every acquisition even on failure; no late scene acquisition escapes cleanup.
    const startup = await Promise.allSettled([sceneTask, sourceResources]);
    if (startup[0].status === "fulfilled") scene = startup[0].value;
    for (const result of startup) if (result.status === "rejected") throw result.reason;
    let { library, profiles } = await sourceResources;
    if (disposed) throw new Error("Seed page disposed during startup");
    if (runtimeProject.canSave) {
      unmountProjectSave = mountProjectSaveControl(runtimeProject, scene!, canvas, {
        showIndicator: Boolean(sharedStorage) || !runtimeProject.isPersistent
      });
    }
    const desert =
      source.session.recipe().parameters.worldTemplate?.id === "titan-wasteland"
        ? await import("./src/DesertPresentation")
        : undefined;
    nativeEditor = new RuntimeNativeEditor(runtimeProject, scene!, seedWorldProjectFormats, [
      ...(options.assetSources ?? []),
      ...(retrieval ? [retrieval.source] : [])
    ]);
    source.session.setFarmingStatePathReader(() => planningFarmingProjectStatePath(runtimeProject!));
    const camera = requiredComponent(scene!.rootEntities, Camera, "Camera");
    restoreGrassDrawOrder = installSeedWorldGrassDrawOrder(camera, readWorld);
    // Keep the main world camera disabled while the opaque Loading Orb owns the viewport;
    // startup IBL/cloud warmup advances offscreen without rendering the full 3D world behind the orb.
    camera.enabled = false;
    // Disable Bayer LOD cross-fade dither in Seed World runtime to avoid compiling duplicate
    // RENDERER_MASONRY_DITHER / GLOBAL_PROXY_DITHER / RENDERER_LOD_DITHER variants on mobile.
    const previousMasonryLodCrossFade = getMasonryLodTuning().lodCrossFade;
    const previousRockLodCrossFade = getRockLodCrossFadeEnabled();
    setMasonryLodTuning({ lodCrossFade: false });
    setRockLodCrossFadeEnabled(false);
    restoreLodCrossFade = () => {
      setMasonryLodTuning({ lodCrossFade: previousMasonryLodCrossFade });
      setRockLodCrossFadeEnabled(previousRockLodCrossFade);
    };
    nativeBuildingHost = new NativeBuildingHost(runtimeProject, nativeEditor.editor, scene!, camera);
    nativeBuildingHost.system.onWallLightmapInventoryChange = (inventory) => {
      canvas.dataset.wallLightmaps = JSON.stringify(inventory);
    };
    sceneEntityEffectHost = new SeedWorldSceneEntityEffectHost(runtimeProject, nativeEditor.editor, scene!);
    if (pageUrl.searchParams.get("agentTrace") === "1") {
      const probe = camera.entity.addComponent(SeedCameraSubmissionProbe);
      const entries: CameraSubmissionWindow[] = [];
      const slowEntries: CameraSubmissionWindow[] = [];
      const compileEntries: (CameraSubmissionWindow & {
        publicationRevision?: string;
      })[] = [];
      probe.attach(camera);
      probe.report = (window) => {
        const { startMs, endMs } = window;
        if (window.shaderVariants?.length && compileEntries.length < 32) {
          compileEntries.push({
            ...window,
            publicationRevision: canvas.dataset.buildingPublicationRevision
          });
          canvas.dataset.buildingShaderCompileWindows = JSON.stringify({
            timeOrigin: performance.timeOrigin,
            entries: compileEntries
          });
        }
        if (endMs - startMs < 40) return;
        entries.push(window);
        if (endMs - startMs >= 50 && slowEntries.length < 32) slowEntries.push(window);
        if (entries.length > 32) entries.splice(0, entries.length - 32);
        canvas.dataset.buildingCameraSubmission = JSON.stringify({
          timeOrigin: performance.timeOrigin,
          entries,
          slowEntries
        });
      };
    }
    const sun = requiredComponent(scene!.rootEntities, DirectLight, "DirectLight");
    const navigation = requiredComponent(scene!.rootEntities, TerrainNavigationRuntime, "TerrainNavigationRuntime");
    const post = requiredComponent(scene!.rootEntities, TerrainPostProcessRuntime, "TerrainPostProcessRuntime");
    const resetPostProcess = post.captureDebugReset();
    const wind = requiredComponent(scene!.rootEntities, TerrainWindRuntime, "TerrainWindRuntime");
    detachWindExposure = () => wind.setGpuExposureProvider(null);
    navigation.enabled = false;
    navigation.setInputEnabled(false);
    navigation.movementSpeed = 4;
    navigation.verticalMovementEnabled = false;
    navigation.setVerticalOffset(0);
    navigation.setEyeHeight(PLANNING_REFERENCE.actor.heightM);
    navigation.setInputMode("joystick");
    navigation.orientationTouchAreas = true;
    camera.fieldOfView = PLANNING_RUNTIME_OPTIONS.verticalFieldOfView;
    camera.farClipPlane = TERRAIN_DEFAULT_CAMERA_CONFIGURATION.farClipPlane;
    camera.enableHDR = TERRAIN_DEFAULT_CAMERA_CONFIGURATION.enableHDR;
    applyScreenSpaceReflectionConfiguration(camera, TERRAIN_SCREEN_SPACE_REFLECTION_CONFIGURATION);
    const orbit = camera.entity.addComponent(OrbitControl);
    orbit.enabled = false;
    orbit.enableDamping = false;
    orbit.enableKeys = false;
    let restoreMasonryView: (() => void) | undefined;
    const returnFromMasonry = () => {
      const restore = restoreMasonryView;
      restoreMasonryView = undefined;
      restore?.();
    };

    const OIL_PAINT_DEFAULTS = {
      painterlyStrength: 0.88,
      brushRadius: 5.0,
      impasto: 1.4,
      brushScale: 0.72
    } as const;
    const ensureOilPaintPassMounted = async () => {
      if (oilPaintPostEntity && oilPaintPostEffect && oilPaintPostPass) return;
      const [{ OilPaintPostEffect }, { OilPaintPostPass }] = await Promise.all([
        import("./src/oil-paint/OilPaintPostEffect"),
        import("./src/oil-paint/OilPaintPostPass")
      ]);
      if (disposed) return;
      if (!oilPaintPostEntity) {
        oilPaintPostEntity = root.createChild("OilPaintPostProcess");
        const postProcess = oilPaintPostEntity.addComponent(PostProcess);
        postProcess.isGlobal = true;
        oilPaintPostEffect = postProcess.addEffect(OilPaintPostEffect);
      }
      if (!oilPaintPostPass) {
        oilPaintPostPass = new OilPaintPostPass(engine!);
        oilPaintPostPass.isActive = false;
        engine!.addPostProcessPass(oilPaintPostPass);
      }
    };
    const setOilPaintPassActive = async (active: boolean) => {
      if (active) {
        await ensureOilPaintPassMounted();
        if (disposed || !oilPaintPostPass) return;
        oilPaintPostPass.isActive = true;
      } else {
        if (oilPaintPostPass) oilPaintPostPass.isActive = false;
      }
    };
    const setOilPaintMacroEnabled = async (enabled: boolean) => {
      const activeScene = scene;
      if (!activeScene) return;
      oilPaintMacroDesired = enabled;
      const requestId = ++oilPaintMacroRequestId;
      if (enabled) {
        const { getOilPaintBrushTexture } = await import(
          "@galacean/engine-world-planning/spatial/oil-paint/OilPaintTextures"
        );
        if (disposed || !oilPaintMacroDesired || requestId !== oilPaintMacroRequestId || scene !== activeScene) {
          return;
        }
        const brush = await getOilPaintBrushTexture(engine!);
        if (!brush || disposed || !oilPaintMacroDesired || requestId !== oilPaintMacroRequestId || scene !== activeScene) {
          return;
        }
        oilPaintMacroEnabled = true;
        activeScene.shaderData.enableMacro("SCENE_OIL_PAINT_STYLE");
        activeScene.shaderData.setTexture("scene_OilPaintBrushTexture", brush);
        activeScene.shaderData.setFloat("scene_OilPaintImpasto", oilPaintPostEffect?.impasto.value ?? OIL_PAINT_DEFAULTS.impasto);
        activeScene.shaderData.setFloat("scene_OilPaintBrushScale", oilPaintPostEffect?.brushScale.value ?? OIL_PAINT_DEFAULTS.brushScale);
      } else if (oilPaintMacroEnabled) {
        activeScene.shaderData.disableMacro("SCENE_OIL_PAINT_STYLE");
        oilPaintMacroEnabled = false;
      }
      canvas.dataset.oilPaint = oilPaintMacroEnabled ? "active" : "off";
    };
    const oilPaintDebugControl: TerrainOilPaintDebugControl = {
      getSnapshot: () => ({
        passActive: oilPaintPostPass?.isActive ?? false,
        shaderMacro: oilPaintMacroEnabled,
        painterlyStrength: oilPaintPostEffect?.painterlyStrength.value ?? OIL_PAINT_DEFAULTS.painterlyStrength,
        brushRadius: oilPaintPostEffect?.brushRadius.value ?? OIL_PAINT_DEFAULTS.brushRadius,
        impasto: oilPaintPostEffect?.impasto.value ?? OIL_PAINT_DEFAULTS.impasto,
        brushScale: oilPaintPostEffect?.brushScale.value ?? OIL_PAINT_DEFAULTS.brushScale
      }),
      setPassActive: (active) => setOilPaintPassActive(active),
      setShaderMacro: (enabled) => setOilPaintMacroEnabled(enabled),
      setParam: (key, value) => {
        if (oilPaintPostEffect) {
          oilPaintPostEffect[key].value = value;
        }
        if (key === "impasto") scene?.shaderData.setFloat("scene_OilPaintImpasto", value);
        if (key === "brushScale") scene?.shaderData.setFloat("scene_OilPaintBrushScale", value);
      },
      reset: () => {
        if (oilPaintPostEffect) {
          oilPaintPostEffect.painterlyStrength.value = OIL_PAINT_DEFAULTS.painterlyStrength;
          oilPaintPostEffect.brushRadius.value = OIL_PAINT_DEFAULTS.brushRadius;
          oilPaintPostEffect.impasto.value = OIL_PAINT_DEFAULTS.impasto;
          oilPaintPostEffect.brushScale.value = OIL_PAINT_DEFAULTS.brushScale;
        }
        scene?.shaderData.setFloat("scene_OilPaintImpasto", OIL_PAINT_DEFAULTS.impasto);
        scene?.shaderData.setFloat("scene_OilPaintBrushScale", OIL_PAINT_DEFAULTS.brushScale);
      }
    };

    const startupTemplateId = source.session.recipe().parameters.worldTemplate?.id ?? "";
    const startupTemplate = worldTemplate(startupTemplateId);
    const startupArt = WORLD_TEMPLATE_ART[startupTemplateId];
    seedWorldBootTrace.setMeta({
      templateId: startupTemplateId || "original",
      ...(startupTemplate?.family ? { templateFamily: startupTemplate.family } : {}),
      features: {
        hasPlannedBuildings,
        showAssistant,
        precompileShaders
      }
    });
    const solarPosition = startupArt?.solarPosition
      ? { ...PROCEDURAL_SKY_SOLAR_POSITION, ...startupArt.solarPosition }
      : desert?.DESERT_SOLAR_POSITION;
    // WebGL2 sampler2DShadow already performs hardware 2x2 bilinear PCF in 1 tap (ShadowType.Hard)
    // instead of 9-18 taps (SoftHigh) or 4-8 taps + slope-gradient math (SoftLow).
    sun.shadowType = ShadowType.Hard;
    lighting = createIntegratedWorldLightingRuntime(sun.entity, scene!, sun, post, solarPosition);
    lighting.setTuning({
      playing: false,
      timeHours: INTEGRATED_WORLD_DAYLIGHT_REFERENCE_TIME_HOURS
    });
    lighting.applyVisualTuning({
      fogMode: FogMode.ExponentialSquared,
      ...SEED_WORLD_DEFAULT_FOG_VALUES,
      shadowStrength: SEED_WORLD_DEFAULT_SHADOW_STRENGTH
    });
    lightingProfile = new PlanningLightingProfileRuntime(engine, lighting);
    await timed("applyPresentation", () =>
      applyPresentation(source!.session, lightingProfile!, post, resetPostProcess)
    );
    const resolvedOrb = await orbTask;
    if (disposed || !resolvedOrb) throw new Error("Seed page disposed during loading scene setup");
    orb = resolvedOrb;
    orb.attachWorldUnderlay(scene!);
    const root = scene!.createRootEntity("Seed World Runtime");
    rockNavigation = new RockNavigation(root, navigation, (x, z) =>
      publication?.current?.navigation.sampleHeightInterpolated(x, z)
    );
    const readWaterBody = (id: string) => {
      for (const identity of nativeEditor!.editor.projection.queryComponents({
        type: "WaterBodyComponent"
      })) {
        const body = nativeEditor!.editor.projection.component(identity.id);
        if (body instanceof WaterBodyComponent) {
          const authoring = body._readAuthoring();
          if (!authoring) continue;
          const planningId = body.entity.getComponent(PlanningEntityAuthoring)?.planningId;
          if (
            planningId &&
            effectivePlanningWaterId(identity.scene, identity.id, planningId, authoring.shape.kind) === id
          )
            return body;
        }
      }
    };
    water = new PlanningWaterRuntime({
      engine,
      root,
      camera,
      readBody: readWaterBody,
      pickId: (id) => {
        const body = readWaterBody(id);
        return body && nativeEditor!.projection.identityOf(body)?.id;
      }
    });
    nativeWaterHost = new NativeWaterHost(runtimeProject, nativeEditor.editor, water.system, {
      hostTerrain: true,
      consumeHostInputs: async () => {
        if (source?.session.result && publication?.current) await water!.synchronize(publication.current.plan);
      },
      physicalPublication: () => {
        if (publication?.current) farmingHost?.runtime?.refreshWater(publication.current);
      }
    });
    const readTerrainFields = () => {
      const current = publication?.current;
      return current?.heightTransition?.fields ?? current?.data.fields;
    };
    const sampleHeight = (x: number, z: number) => {
      const fields = readTerrainFields();
      return fields && sampleSeedWorldHeight(fields, x, z);
    };
    const getPuddleHydrology = () => readWorld()?.clipmap.puddleHydrology;
    environment = await WorldEnvironmentRuntime.create(
      scene!,
      camera,
      {
        sampleHeightInterpolated: sampleHeight,
        sampleRainImpact: (x, z, climate, contact) => {
          const fields = readTerrainFields();
          const hydrology = getPuddleHydrology();
          if (!fields || !hydrology || !environment) return false;
          const { puddleStorageBias, coverageMultiplier } = environment.getSurfaceWaterTuning();
          // Match the rendered terrain's storage, including the template's initial puddles.
          const puddleMask = Math.min(
            1,
            coverageMultiplier *
              sampleTerrainSurfacePuddleMask(
                x,
                z,
                { puddleStorage: climate.puddleStorage + puddleStorageBias },
                hydrology
              )
          );
          if (puddleMask <= 0) return false;
          const height = sampleSeedWorldHeight(fields, x, z);
          if (height === undefined) return false;
          const spacing = fields.sizeMetres / (fields.heightResolution - 1);
          const originX = seedWorldOriginX(fields);
          const originZ = seedWorldOriginZ(fields);
          const left = Math.max(originX, x - spacing);
          const right = Math.min(originX + fields.sizeMetres, x + spacing);
          const back = Math.max(originZ, z - spacing);
          const front = Math.min(originZ + fields.sizeMetres, z + spacing);
          const slopeX =
            (sampleSeedWorldHeight(fields, right, z)! - sampleSeedWorldHeight(fields, left, z)!) / (right - left);
          const slopeZ =
            (sampleSeedWorldHeight(fields, x, front)! - sampleSeedWorldHeight(fields, x, back)!) / (front - back);
          const inverseLength = 1 / Math.hypot(slopeX, 1, slopeZ);
          contact.height = height;
          contact.normal[0] = -slopeX * inverseLength;
          contact.normal[1] = inverseLength;
          contact.normal[2] = -slopeZ * inverseLength;
          contact.puddleMask = puddleMask;
          return true;
        },
        getPuddleHydrology
      },
      lighting,
      wind,
      undefined,
      { surfaceWaterSsrRequiresRain: true, lazyPrecipitation: true }
    );
    let appliedBuildingPaletteTemplate: string | undefined;
    const applyTemplateBuildingPalette = (templateId: string) => {
      if (!engine || appliedBuildingPaletteTemplate === templateId) return;
      appliedBuildingPaletteTemplate = templateId;
      const appearance = masonryAppearance(engine);
      appearance.reset();
      const palette = WORLD_TEMPLATE_ART[templateId]?.buildingPalette;
      if (palette) {
        for (const [role, hex] of Object.entries(palette)) {
          if (hex) appearance.setColor(role as MasonryTintRole, hex);
        }
      }
    };
    applyTemplateBuildingPalette(startupTemplateId);
    if (startupArt?.season) {
      const prevDuration = environment.getSnapshot().transitionDuration;
      environment.setTransitionDuration(0);
      environment.setSeason(startupArt.season);
      environment.setTransitionDuration(prevDuration);
    }
    const initialWeather = source.session
      .inspect("world")
      .components.find((component) => component.type === "weather")?.values;
    applyPlanningWeather(environment, initialWeather);
    if (startupTemplate?.rockSource !== "shared") desert?.configureDesertClouds(environment);
    // Start progressive volumetric-cloud + IBL baking right away while raster/water/buildings
    // run in workers (camera.enabled is still false so this advances offscreen in 20ms slices
    // during the ~3s raster wait instead of blocking serially at 94%).
    let prewarmedIBLTask: Promise<void> | undefined = lighting.waitForEnvironmentIBLIdle();
    void prewarmedIBLTask.catch(() => {});
    audio = new SeedWorldAudioRuntime(camera, navigation, environment, wind);
    audio.audio.setLoadDeferred(true);
    const driver = root.addComponent(SeedDemoFrame);
    let debugReadoutElapsed = 0;
    let lastObservedCamX = Number.NaN;
    let lastObservedCamY = Number.NaN;
    let lastObservedCamZ = Number.NaN;
    let lastObservedFwdX = Number.NaN;
    let lastObservedFwdY = Number.NaN;
    let lastObservedFwdZ = Number.NaN;
    let lastObservedMode = "";
    let lastObservedOrbitDist = Number.NaN;
    let lastDatasetPublication: unknown;
    const debugDatasetEnabled = pageUrl.searchParams.get("debug") === "1";
    function visitCurrentPickBatches(visitor: SeedWorldPickVisitor): void {
      const current = publication?.current;
      if (current && water) visitPlanningWorldPickBatches(current, water, visitor);
    }
    driver.lateTick = () => {
      const current = publication?.current;
      if (!current) return;
      current.world.setSurfaceWaterSsrEnabled(
        perfPanel?.isPaused("ssr") ? false : environment!.surfaceWaterSsrRequested
      );
      current.solids.bridgesView.updateLod(camera);
    };
    driver.tick = (dt) => {
      const markTick = (globalThis as unknown as MobileSeedTickHost).__mobileSeedTickMark;
      let t0 = markTick ? performance.now() : 0;
      if (!perfPanel?.isPaused("farming")) farmingHost?.runtime?.update(dt);
      if (markTick) {
        markTick("farming", performance.now() - t0);
        t0 = performance.now();
      }
      if (!ready) return;
      readWorld()?.update(dt);
      if (markTick) {
        markTick("world", performance.now() - t0);
        t0 = performance.now();
      }
      if (!perfPanel?.isPaused("vegetation")) publication?.current?.vegetation?.update(dt);
      if (markTick) {
        markTick("vegetation", performance.now() - t0);
        t0 = performance.now();
      }
      obbDebug?.update(dt);
      if (markTick) {
        markTick("obbDebug", performance.now() - t0);
        t0 = performance.now();
      }
      if (!perfPanel?.isPaused("water")) water?.update(dt);
      if (markTick) {
        markTick("water", performance.now() - t0);
        t0 = performance.now();
      }
      if (!perfPanel?.isPaused("vista")) vista?.update();
      if (markTick) {
        markTick("vista", performance.now() - t0);
        t0 = performance.now();
      }
      if (!perfPanel?.isPaused("animals")) animals?.advance?.(dt);
      if (markTick) {
        markTick("animals", performance.now() - t0);
        t0 = performance.now();
      }
      // WorldEnvironmentRuntime owns the wind local-field centre and resamples it every frame
      audio?.update(dt, ready, tools?.listening ?? false);
      if (markTick) {
        markTick("audio", performance.now() - t0);
        t0 = performance.now();
      }
      if (!restoreMasonryView && playerState) {
        const camPos = camera.entity.transform.worldPosition;
        const camFwd = camera.entity.transform.worldForward;
        const camMode = debugSidebar?.cameraMode ?? "roam";
        const orbitDist =
          camMode === "orbit"
            ? Math.hypot(camPos.x - orbit.target.x, camPos.y - orbit.target.y, camPos.z - orbit.target.z)
            : Number.NaN;
        if (
          Math.abs(camPos.x - lastObservedCamX) >= 5e-4 ||
          Math.abs(camPos.y - lastObservedCamY) >= 5e-4 ||
          Math.abs(camPos.z - lastObservedCamZ) >= 5e-4 ||
          Math.abs(camFwd.x - lastObservedFwdX) >= 1e-5 ||
          Math.abs(camFwd.y - lastObservedFwdY) >= 1e-5 ||
          Math.abs(camFwd.z - lastObservedFwdZ) >= 1e-5 ||
          camMode !== lastObservedMode ||
          (camMode === "orbit" && Math.abs(orbitDist - lastObservedOrbitDist) >= 5e-4) ||
          Number.isNaN(lastObservedCamX)
        ) {
          lastObservedCamX = camPos.x;
          lastObservedCamY = camPos.y;
          lastObservedCamZ = camPos.z;
          lastObservedFwdX = camFwd.x;
          lastObservedFwdY = camFwd.y;
          lastObservedFwdZ = camFwd.z;
          lastObservedMode = camMode;
          lastObservedOrbitDist = orbitDist;
          playerState.observe();
        }
      }
      if (markTick) markTick("playerState", performance.now() - t0);
      if ((debugReadoutElapsed += dt) >= 0.1) {
        const tDbg = markTick ? performance.now() : 0;
        debugSidebar?.update();
        runtimeDebug?.updateLod();
        runtimeDebug?.refresh();
        debugReadoutElapsed = 0;
        const current = publication?.current;
        if (debugDatasetEnabled || current !== lastDatasetPublication) {
          lastDatasetPublication = current;
          if (current?.vegetation) canvas.dataset.vegetation = JSON.stringify(current.vegetation.getDiagnostics());
          if (current) canvas.dataset.grassHeight = JSON.stringify(current.world.population.grassHeightRangeMetres);
          if (current?.masonry) canvas.dataset.plannedMasonry = JSON.stringify(current.masonry.metrics);
        }
        if (current?.template && debugDatasetEnabled) {
          const position = camera.entity.transform.worldPosition;
          const forward = camera.entity.transform.worldForward;
          canvas.dataset.templateCamera = JSON.stringify({
            eye: [position.x, position.y, position.z],
            forward: [forward.x, forward.y, forward.z],
            ground: sampleHeight(position.x, position.z),
            eyeHeight: navigation.eyeHeight,
            groundClearance: navigation.groundClearance
          });
        }
        if (markTick) markTick("debugReadout", performance.now() - tDbg);
      }
    };
    let appliedSubjectViewKey: string | undefined;
    const applySubjectView = () => {
      const values = readSubjectView(source!.session.document),
        key = JSON.stringify(values);
      if (key === appliedSubjectViewKey) return;
      const pose = resolveSubjectView(
        values,
        source!.session.result!.plan,
        camera.aspectRatio,
        sampleHeight,
        navigation.eyeHeight
      );
      if (pose) {
        // Subject presentation owns camera height; terrain contact must retain its authored clearance.
        navigation.verticalMovementEnabled = true;
        camera.fieldOfView = pose.fovDegrees;
        camera.entity.transform.setWorldPosition(...pose.eye);
        navigation.setVerticalOffset(
          Math.max(0, pose.eye[1] - (sampleHeight(pose.eye[0], pose.eye[2]) ?? 0) - navigation.eyeHeight)
        );
        camera.entity.transform.lookAt(new Vector3(...pose.target));
        orbit.target.set(...pose.target);
        navigation.synchronizeView();
        debugSidebar?.restoreCameraMode("roam");
      } else {
        navigation.verticalMovementEnabled = false;
        navigation.setVerticalOffset(0);
        camera.fieldOfView = PLANNING_RUNTIME_OPTIONS.verticalFieldOfView;
      }
      canvas.dataset.subjectView = JSON.stringify(pose ?? { subjectId: "" });
      appliedSubjectViewKey = key;
      playerState?.observe();
    };
    const playerCameraPosition: [number, number, number] = [0, 0, 0];
    const playerCameraBookmark: {
      position: [number, number, number];
      yawDegrees: number;
      pitchDegrees: number;
      mode: SeedWorldCameraBookmark["mode"];
      orbitDistanceMetres?: number;
    } = {
      position: playerCameraPosition,
      yawDegrees: 0,
      pitchDegrees: 0,
      mode: "roam",
      orbitDistanceMetres: undefined
    };
    if (options.persistPlayerState !== false)
      playerState = new PlanningPlayerState(
        () => window.localStorage,
        () => {
          const p = camera.entity.transform.worldPosition;
          const mode = debugSidebar?.cameraMode ?? "roam";
          playerCameraPosition[0] = p.x;
          playerCameraPosition[1] = p.y;
          playerCameraPosition[2] = p.z;
          resolveSeedWorldCameraAnglesInto(camera.entity.transform.worldForward, playerCameraBookmark);
          playerCameraBookmark.mode = mode;
          playerCameraBookmark.orbitDistanceMetres =
            mode === "orbit" ? Math.hypot(p.x - orbit.target.x, p.y - orbit.target.y, p.z - orbit.target.z) : undefined;
          return playerCameraBookmark;
        },
        (bookmark) => {
          const [x, y, z] = bookmark.position;
          const direction = resolveSeedWorldCameraForward(bookmark.yawDegrees, bookmark.pitchDegrees);
          camera.entity.transform.setWorldPosition(x, y, z);
          camera.entity.transform.lookAt(new Vector3(x + direction[0], y + direction[1], z + direction[2]));
          if (bookmark.mode === "orbit") {
            const distance = bookmark.orbitDistanceMetres!;
            orbit.target.set(x + direction[0] * distance, y + direction[1] * distance, z + direction[2] * distance);
          }
          navigation.synchronizeView();
          debugSidebar?.restoreCameraMode(bookmark.mode);
        },
        (error) => console.warn("[seed-world-planner] player state persistence failed", error)
      );
    type SpawnView = PlanningSpawnView | (Pick<PlanningSpawnView, "eye" | "target"> & { framing: "authored" });
    const spawnViews = new WeakMap<IslandPlan, { key: string; view: SpawnView }>();
    const spawnView = (
      plan: IslandPlan,
      data: PlanningSeedWorldData,
      groundPopulation?: PlanningSeedWorldData["population"]
    ): SpawnView => {
      const maxTerrainHeight = data.fields.heightDecode
        ? data.fields.heightDecode.offset + data.fields.heightDecode.scale
        : undefined;
      const options = {
        aspect: camera.aspectRatio,
        verticalFovDegrees: PLANNING_RUNTIME_OPTIONS.verticalFieldOfView,
        eyeHeight: navigation.eyeHeight,
        farClip: camera.farClipPlane,
        desertComposition: plan.parameters.worldTemplate?.id === "titan-wasteland",
        maxTerrainHeight
      };
      const key = JSON.stringify(options);
      const cached = spawnViews.get(plan);
      if (cached?.key === key) return cached.view;
      const view = selectPlanningSpawnView(
        plan,
        (x, z) => sampleSeedWorldHeight(data.fields, x, z),
        groundPopulation ??
          planningNaturalGroundPopulation(data.population, planningNaturalGrassDensity(library), plan),
        options
      );
      spawnViews.set(plan, { key, view });
      return view;
    };
    publication = new PlanningSeedScenePublication({
      water,
      navigation,
      audio,
      camera,
      orbit,
      canvas,
      samplePlayerSupport: (x, z) => rockNavigation?.sampleContactHeight(x, z)
    });
    const animalPlayerPosition = new Vector3();
    animals = new PlanningAnimalHost(root, () => camera.entity.transform.worldPosition, undefined, {
      authoring: new PlanningAnimalProjectAuthoring(runtimeProject!),
      player: () => {
        if (!navigation.enabled || navigation.verticalMovementEnabled) return undefined;
        const eye = camera.entity.transform.worldPosition;
        return animalPlayerPosition.set(eye.x, eye.y - navigation.eyeHeight, eye.z);
      },
      food: new PlanningAnimalFood(() => farmingHost?.runtime?.api),
      fireflies: {
        camera,
        activity: () => (environment?.summerWeight ?? 0) * (lighting?.system.state.nightFactor ?? 0)
      }
    });
    if (pageUrl.searchParams.get("agentTrace") !== "1") {
      animals.setStartupDeferOffscreenCamera(camera);
    }
    if (readAnimalPopulationConfig(source.session.document).enabled) {
      animals.preloadModule();
    }
    // GUI and Agent weather changes feed the same real lightning source as rendering/audio.
    detachAnimalLightning = environment.subscribeLightningStrikes((strike) => {
      animals?.notify({
        id: `lightning:${strike.id}`,
        type: "thunder",
        source: [strike.position.x, strike.position.z]
      });
    });
    const isFarmingPlanned = () => source!.session.document.entities.world.components.farming?.values.enabled !== false;
    visualQuery = new SeedWorldVisualQuery(
      camera,
      () => publication?.current,
      () => `${publication?.current?.revision}:${publication?.current?.masonry?.presentationRevision}`,
      (visitor) => {
        const current = publication?.current;
        if (current) visitPlanningWorldPickBatches(current, water!, visitor);
      }
    );
    farmingHost = new PlanningFarmingHost({
      projection: nativeEditor.projection,
      isPlannedEnabled: isFarmingPlanned,
      create: (system, statePath) =>
        new PlanningFarmingRuntime({
          canvas,
          visualQuery,
          isInputEnabled: () => ready && !disposed && !tools?.listening && !runtimeDebug?.farmingPicking,
          deferOffscreenProps: pageUrl.searchParams.get("agentTrace") !== "1",
          system,
          statePath: statePath!,
          camera,
          project: runtimeProject!,
          water: water!,
          readCurrent: () => publication?.current,
          readEnvironment: () => {
            if (!environment || !lighting) return undefined;
            const weather = environment.weatherSystem.state;
            return {
              season: environment.season,
              dayFactor: lighting.dayFactor,
              cloudCoverage: weather.cloud.cloudCoverage,
              rainRate: weather.precipitation.rainRate,
              snowRate: weather.precipitation.snowRate
            };
          },
          readInitializationRequest: () => {
            const parameters = source?.session.recipe().parameters;
            return source && parameters
              ? planningFarmInitializationRequest(
                  source.session.document,
                  parameters.seed,
                  statePath,
                  parameters.farming?.saveMode ?? "auto"
                )
              : undefined;
          }
        }),
      publish: (runtime) => {
        if (publication?.current) runtime.publish(publication.current, source?.session.document.revision);
      }
    });
    const farmingSwitch = farmingHost.switch;
    let boundFarmingEnabled: boolean | undefined;
    const bindFarming = async () => {
      const enabled = isFarmingPlanned();
      await farmingSwitch.refresh();
      boundFarmingEnabled = enabled;
    };
    // Invalid farm assets leave the editor available; Apply reports the consumer failure.
    await bindFarming().catch((error) => console.warn("[seed-world-planner] farming activation failed", error));
    unregisterFarmingActivation = runtimeProject.registerRuntimeActivation({
      before: async () => {},
      after: bindFarming,
      diagnostics: () => (farmingSwitch.diagnostic ? [farmingSwitch.diagnostic] : [])
    });

    const isLocalPresentationOrPlantMaterialEdit = (
      document: Parameters<NonNullable<PlanningSessionOptions["preparePublication"]>>[0],
      result: Parameters<NonNullable<PlanningSessionOptions["preparePublication"]>>[1],
      context: Parameters<NonNullable<PlanningSessionOptions["preparePublication"]>>[2]
    ): boolean => {
      const current = publication?.current;
      if (
        context.forceFull ||
        !current ||
        !context.worldUnchanged ||
        (result.execution !== "runtime" && result.execution !== "presentation")
      )
        return false;
      if (!sameMasonryPlan(current.plan, result.plan)) return false;
      const rockSupportChanged =
        JSON.stringify([result.plan.rocks, result.plan.landscapes?.filter((x) => x.kind === "rock")]) !==
        JSON.stringify([current.plan.rocks, current.plan.landscapes?.filter((x) => x.kind === "rock")]);
      if (rockSupportChanged) return false;
      if (JSON.stringify(readSubjectView(document)) !== JSON.stringify(readSubjectView(context.previousDocument)))
        return false;
      if (
        JSON.stringify(readRockFormationSettings(document)) !==
        JSON.stringify(readRockFormationSettings(context.previousDocument))
      )
        return false;
      const plantMaterialChanged =
        JSON.stringify(readPlantMaterialParameters(document)) !==
        JSON.stringify(readPlantMaterialParameters(context.previousDocument));
      return !plantMaterialChanged || Boolean(current.vegetation);
    };

    const preparePublicationContent: NonNullable<PlanningSessionOptions["preparePublication"]> = async (
      document,
      result,
      context
    ) => {
      context.signal?.throwIfAborted();
      if (context.forceFull) ({ library, profiles } = await preparePlanningPopulationResources(engine!));
      if (context.waterUpdate) {
        const started = performance.now();
        const staged = await publication!.prepareWater(
          result.plan,
          context.waterUpdate,
          context.signal,
          document.revision
        );
        return {
          discard: () => staged.discard(),
          commit: () => {
            staged.commit();
          },
          afterCommit: async () => {
            farmingHost?.runtime?.refreshWater(publication!.current!, context.waterUpdate!);
            const accepted = publication!.current!;
            animals!.synchronize(
              accepted.plan,
              readAnimalPopulationConfig(source!.session.document),
              accepted.navigation,
              {
                preservePopulation: true,
                surface: accepted.data.surfaceIntent,
                change: accepted.animalChange
              }
            );
            canvas.dataset.waterEdit = JSON.stringify({
              ...context.waterUpdate,
              publicationMs: performance.now() - started
            });
            await runtimeDebug?.synchronize();
            if (ready && !context.projectTransaction) await source!.save();
          }
        };
      }
      const waterFallback = planningSurfacePublicationGate(
        publication!.current,
        context.previousDocument,
        document,
        result,
        context.forceFull,
        context.terrainTransitionDurationSeconds,
        true
      );
      if (!context.contentOnly && !context.worldUnchanged && !waterFallback) {
        const started = performance.now();
        let timings: Record<string, number> | undefined;
        canvas.dataset.waterImpact = JSON.stringify({
          mode: "local-native",
          phase: "preparing"
        });
        const staged = await publication!.prepareWaterImpact(
          result.plan,
          async (previous, signal, revision) => {
            const frame = await preparePlanningWaterImpact(
              previous,
              result,
              raster,
              signal,
              planningNaturalGrassDensity(library),
              revision,
              {
                submerged: rockGrassWaterTest(water!),
                terrainTransitionDurationSeconds: context.terrainTransitionDurationSeconds,
                onTerrainTweenFrame: (fields) => farmingHost?.runtime?.refreshLiveTerrain(fields),
                onTerrainTweenComplete: () => {
                  const accepted = publication?.current;
                  if (accepted && accepted.revision === revision) {
                    farmingHost?.runtime?.refreshTerrain(accepted, source?.session.document.revision);
                  }
                },
                prepareSolids: async () => {
                  const formations = await rockFormations.prepare(result.plan, signal, previous.solids.formations);
                  signal.throwIfAborted();
                  const stage = previous.world.root.createChild("Prepared surface solids");
                  stage.isActive = false;
                  let solids: Awaited<ReturnType<typeof createPlanningSeedSolids>> | undefined;
                  try {
                    solids = await createPlanningSeedSolids(engine!, stage, result.plan, {
                      camera,
                      terrainOcclusion: previous.world.terrainOcclusion,
                      signal,
                      previous: previous.solids,
                      formations,
                      sourcePlan: result.plan,
                      rockColorBlend: readRockFormationSettings(document).colorBlend,
                      registerGrassAppearance: (material) => previous.world.registerGrassAppearanceMaterial(material)
                    });
                    await warmupSeedWorldRendererVariants(
                      engine!,
                      scene!,
                      camera,
                      [solids.root, solids.bridgesView.root],
                      {
                        enabled: precompileShaders,
                        strict: true,
                        signal
                      }
                    );
                    signal.throwIfAborted();
                    return { solids, update: preparePlanningSurfaceSolidsSwap(previous.solids, solids, stage) };
                  } catch (error) {
                    solids?.rollbackCommit();
                    solids?.dispose();
                    stage.destroy();
                    throw error;
                  }
                }
              }
            );
            timings = frame.timings;
            return frame;
          },
          context.signal,
          document.revision
        );
        return {
          discard: () => staged.discard(),
          commit: () => {
            staged.commit();
          },
          afterCommit: async () => {
            const accepted = publication!.current!;
            if (!accepted.world.getLiveTerrainFields?.()) {
              farmingHost?.runtime?.refreshTerrain(accepted, source?.session.document.revision);
            }
            animals!.synchronize(
              accepted.plan,
              readAnimalPopulationConfig(source!.session.document),
              accepted.navigation,
              {
                preservePopulation: true,
                change: accepted.animalChange,
                surface: accepted.data.surfaceIntent
              }
            );
            canvas.dataset.waterImpact = JSON.stringify({
              publicationMs: performance.now() - started,
              mode: "local-native",
              phase: "published",
              timings
            });
            await obbDebug?.synchronize(accepted.plan);
            await runtimeDebug?.synchronize();
            if (ready && !context.projectTransaction) await source!.save();
          }
        };
      }
      if (!context.contentOnly && !context.worldUnchanged && waterFallback)
        canvas.dataset.waterImpact = JSON.stringify({
          mode: "full-native",
          phase: "preparing",
          fallback: waterFallback
        });
      const plannedGeometryUnchanged = !publication!.current || sameMasonryPlan(publication!.current.plan, result.plan);
      const roadState = (p: typeof result.plan) =>
        JSON.stringify([p.routes, p.roadGraph, p.roadNetwork, p.bridges, p.roadApproaches]);
      const roadGeometryUnchanged =
        !publication!.current || roadState(publication!.current.plan) === roadState(result.plan);
      const rockSupportChanged =
        publication!.current &&
        JSON.stringify([result.plan.rocks, result.plan.landscapes?.filter((x) => x.kind === "rock")]) !==
          JSON.stringify([
            publication!.current.plan.rocks,
            publication!.current.plan.landscapes?.filter((x) => x.kind === "rock")
          ]);
      if (
        !context.forceFull &&
        roadGeometryUnchanged &&
        !rockSupportChanged &&
        canPublishRockFormationEdit(publication!.current, context.previousDocument, document, result.plan)
      ) {
        const started = performance.now(),
          settings = readRockFormationSettings(document);
        const staged = await publication!.prepareRocks(
          result.plan,
          async (signal) => prepareRockMaterialPublication(publication!.current!, settings, signal),
          context.signal
        );
        return {
          discard: () => staged.discard(),
          commit: () => {
            staged.commit();
            canvas.dataset.rockEdit = JSON.stringify({
              kind: "material",
              generated: 0,
              uploaded: 0,
              buildingSupportsUpdated: 0,
              publicationMs: performance.now() - started
            });
          },
          afterCommit: () => publishContentEdit(context.projectTransaction)
        };
      }
      // Mixed content edits still need the full transaction when building supports
      // change. Rock-only edits below stage their dependent supports locally.
      if (
        context.contentOnly &&
        plannedGeometryUnchanged &&
        roadGeometryUnchanged &&
        publication!.current?.vegetation &&
        !(rockSupportChanged && result.plan.buildings.length)
      ) {
        const started = performance.now(),
          plan = result.plan;
        let metrics: Record<string, number> = {};
        const staged = await publication!.prepareContent(
          plan,
          async (signal) => {
            const current = publication!.current!;
            const vegetation = await current.vegetation!.prepareTrees(plan, signal);
            const rockState = (p: typeof plan) =>
              JSON.stringify([p.rocks, p.landscapes?.filter((element) => element.kind === "rock")]);
            let solids: ReturnType<typeof current.solids.prepareRocks> | undefined;
            let grass: ReturnType<typeof current.world.population.prepareRockGrass> | undefined;
            let groundTemplate: (() => void) | undefined;
            try {
              if (rockState(plan) !== rockState(current.plan)) {
                const meshes = await rockFormations.prepare(plan, signal);
                signal.throwIfAborted();
                const fields = current.heightTransition?.fields ?? current.data.fields;
                const presented = planningPresentedSolids(plan, fields, current.data.fields);
                solids = current.solids.prepareRocks(
                  plan,
                  presented,
                  meshes,
                  readRockFormationSettings(document).colorBlend
                );
                groundTemplate = current.template?.prepareRockGrounding(
                  presented,
                  (x, z) => sampleSeedWorldHeight(fields, x, z),
                  meshes
                );
                grass = current.world.population.prepareRockGrass(
                  rockGrassPlacements(presented, meshes),
                  rockGrassExclusions(plan, current.data.fields, rockGrassWaterTest(water!))
                );
              }
              signal.throwIfAborted();
              metrics = {
                ...vegetation.metrics,
                prepareMs: performance.now() - started
              };
              return {
                commit() {
                  const commitStarted = performance.now();
                  solids?.commit();
                  vegetation.commit();
                  grass?.commit();
                  groundTemplate?.();
                  current.solids.setRockColorBlend(readRockFormationSettings(document).colorBlend);
                  current.vegetation!.setRockColorBlend(readRockFormationSettings(document).colorBlend);
                  current.world.population.setRockGrassGround(readRockFormationSettings(document));
                  metrics.commitMs = performance.now() - commitStarted;
                },
                discard() {
                  solids?.discard();
                  vegetation.discard();
                  grass?.discard();
                }
              };
            } catch (error) {
              solids?.discard();
              vegetation.discard();
              grass?.discard();
              throw error;
            }
          },
          context.signal
        );
        metrics.readyMs = performance.now() - started;
        return {
          discard: () => staged.discard(),
          commit: () => {
            staged.commit();
            canvas.dataset.contentEdit = JSON.stringify({
              kind: context.contentOnly,
              ...metrics,
              publicationMs: performance.now() - started
            });
          },
          afterCommit: () => publishContentEdit(context.projectTransaction)
        };
      }
      farmingHost?.runtime?.inspectCandidate(result.plan, document.revision);
      if (isLocalPresentationOrPlantMaterialEdit(document, result, context)) {
        // Unchanged geometry retains its owners. Plant material color edits apply in-place
        // with a rainbow update shimmer instead of triggering a full-world rebuild.
        const plantMaterialChanged =
          JSON.stringify(readPlantMaterialParameters(document)) !==
          JSON.stringify(readPlantMaterialParameters(context.previousDocument));
        const stagedMaterial = plantMaterialChanged
          ? publication!.current!.vegetation!.prepareMaterialParameters(readPlantMaterialParameters(document))
          : undefined;
        return {
          discard() {
            stagedMaterial?.discard();
          },
          commit() {
            stagedMaterial?.commit();
          },
          afterCommit: () => publish(false, context.projectTransaction)
        };
      }
      if (
        !context.forceFull &&
        roadGeometryUnchanged &&
        canPublishRockFormationEdit(publication!.current, context.previousDocument, document, result.plan)
      ) {
        const started = performance.now(),
          plan = result.plan;
        let metrics: Record<string, number> = {};
        let summary = "";
        const staged = await publication!.prepareRocks(
          plan,
          async (signal) => {
            const current = publication!.current!,
              settings = readRockFormationSettings(document);
            const meshes = await rockFormations.prepare(plan, signal, current.solids.formations);
            const preparationMetrics = { ...rockFormations.preparationMetrics };
            signal.throwIfAborted();
            const frame = await prepareRockFormationPublication(
              current,
              plan,
              meshes,
              settings,
              document.revision,
              signal
            );
            metrics = { ...preparationMetrics, ...frame.metrics };
            summary = JSON.stringify({
              formations: meshes.length,
              triangles: meshes.reduce((sum, f) => sum + f.mesh.indices.length / 3, 0),
              bodies: meshes.reduce((sum, f) => sum + f.stats.bodies, 0),
              vertices: meshes.reduce((sum, f) => sum + f.stats.vertices, 0)
            });
            return frame;
          },
          context.signal
        );
        return {
          discard: () => staged.discard(),
          commit: () => {
            staged.commit();
            canvas.dataset.rockFormations = summary;
            canvas.dataset.rockEdit = JSON.stringify({
              ...metrics,
              publicationMs: performance.now() - started
            });
          },
          afterCommit: () => publishContentEdit(context.projectTransaction)
        };
      }
      const plan = result.plan;
      const initial = !publication!.current;
      context.signal?.throwIfAborted();
      let staged: Awaited<ReturnType<PlanningSeedScenePublication["prepare"]>> | undefined = await publication!.prepare(
        plan,
        async (signal) => {
          progress(0.25, "准备规划贴图");
          // Both workers consume the immutable plan. Join before creating GPU/scene
          // owners; publication aborts outstanding rock work if either task fails.
          // Note: PlanningSession.initialize() shallow-clones result.plan, so match initial startup by flag + seed.
          const prewarmedSource =
            initial &&
            prewarmedRasterPlan !== undefined &&
            prewarmedRasterTask !== undefined &&
            prewarmedRocksTask !== undefined &&
            prewarmedRasterPlan.parameters.seed === plan.parameters.seed &&
            prewarmedRasterPlan.parameters.worldTemplate?.id === plan.parameters.worldTemplate?.id
              ? prewarmedRasterPlan
              : undefined;
          const rasterPromise = prewarmedSource
            ? prewarmedRasterTask!
            : timed("raster.run", () => raster.run(plan, true, true));
          const rocksPromise = prewarmedSource
            ? prewarmedRocksTask!
            : timed("rockFormations.prepare", () => rockFormations.prepare(plan, signal));
          prewarmedRasterPlan = undefined;
          prewarmedRasterTask = undefined;
          prewarmedRocksTask = undefined;
          let heightTransition: ReturnType<SeedWorldTerrainRuntime["prepareHeightTransition"]> | undefined;
          let candidate: SeedWorldTerrainRuntime | undefined;
          let candidateMasonry: NativeBuildingWorld | undefined;
          let candidateVegetation: PlanningNaturalVegetationRuntime | undefined;
          let candidateTemplate: WorldTemplateRuntime | undefined;
          let candidateSolids: Awaited<ReturnType<typeof createPlanningSeedSolids>> | undefined;
          let candidateWater: PreparedPlanningWater | undefined;
          let candidateExposure: TerrainWindGpuExposureProvider | undefined;
          let preparedPlayer: ReturnType<PlanningPlayerState["prepare"]> | undefined;
          // Start building scene initialization + native compilation as soon as encoded height
          // (pushed early from PlanningRaster.worker) and rocks resolve, overlapping with raster.run
          // on multi-core desktops. On constrained mobile devices (<= 4 cores / touch), wait until
          // raster.run finishes so BuildingWorkers do not oversubscribe 2 P-cores and stretch raster.run.
          const earlyBuildingsAbort = new AbortController();
          const onEarlyBuildingsAbort = () => earlyBuildingsAbort.abort(signal.reason);
          if (signal.aborted) earlyBuildingsAbort.abort(signal.reason);
          else signal.addEventListener("abort", onEarlyBuildingsAbort, { once: true });
          const earlyHeightPromise =
            !isConstrainedMobileBoot &&
            Number.isFinite(plan.parameters.width) &&
            plan.parameters.width > 0 &&
            plan.parameters.width === plan.parameters.depth
              ? raster.waitForHeight(prewarmedSource ?? plan)
              : undefined;
          const buildingCompiler = nativeBuildingHost!.system.cpuCompiler;
          let earlyBuildingsWork: Promise<void> | undefined;
          let earlyBuildingsTask: Promise<void> | undefined;
          if (earlyHeightPromise) {
            const earlySignal = earlyBuildingsAbort.signal;
            earlyBuildingsTask = Promise.all([earlyHeightPromise, rocksPromise]).then(
              ([earlyHeight, earlyFormationMeshes]) => {
                if (!earlyHeight) return;
                earlySignal.throwIfAborted();
                earlyBuildingsWork = (async () => {
                  const earlyBuildingTerrain = masonryRockTerrainSource(
                    {
                      revision: document.revision,
                      grid: {
                        samples: earlyHeight.encoded.slice(),
                        resolution: earlyHeight.resolution,
                        origin: [0, 0],
                        size: plan.parameters.width,
                        decode: { offset: earlyHeight.decodeOffset, scale: earlyHeight.decodeScale }
                      }
                    },
                    earlyFormationMeshes,
                    document.revision
                  );
                  if (!ready && !context.projectTransaction)
                    bootEmptyBuildingGeneratorId = await timed("initializeBuildingScene", () =>
                      initializeBuildingScene(
                        runtimeProject!,
                        nativeEditor!.editor,
                        plan,
                        earlyBuildingTerrain,
                        earlySignal,
                        buildingCompiler
                      )
                    );
                  candidateMasonry = await timed("nativeBuildingHost.prepare", () =>
                    nativeBuildingHost!.prepare({
                      terrain: earlyBuildingTerrain,
                      signal: earlySignal
                    })
                  );
                })();
                return earlyBuildingsWork;
              }
            );
            void earlyBuildingsTask.catch(() => {});
          }
          try {
            const [, formationMeshes] = await Promise.all([rasterPromise, rocksPromise]);
            // Superseded raster calls resolve undefined; only the request revision decides acceptance.
            signal.throwIfAborted();
            // Isolate nativeData/compiledData in a nested block so transient terrainNormalSamples
            // cannot be promoted into the outer preparation function's shared V8 Context.
            let terrainNormalSamples: Uint8Array | undefined;
            let candidateData: PlanningSeedWorldData;
            {
              const nativeData = raster.takeNativeData(prewarmedSource ?? plan);
              if (!nativeData) throw new Error("Native terrain data was not prepared for this publication");
              if (prewarmedSource && prewarmedSource !== plan) {
                adoptPlanningHeightmap(plan, planningHeightmap(prewarmedSource));
                adoptPlanningAlphamap(plan, planningAlphamap(prewarmedSource));
                if (plan.parameters.landMode !== "continuous") {
                  adoptPlanningOcean(plan, preparedPlanningOcean(prewarmedSource));
                }
              }
              const compiledData = timed("preparePlanningSeedWorldData", () =>
                preparePlanningSeedWorldData(
                  plan,
                  {
                    height: planningHeightmap(plan),
                    alpha: planningAlphamap(plan)
                  },
                  nativeData
                )
              );
              terrainNormalSamples = compiledData.terrainNormalSamples;
              candidateData = stripPlanningTerrainNormalSamples(compiledData);
            }
            signal.throwIfAborted();
            const cameraPreparationAt = performance.now();
            const playerWorld = {
              seed: plan.parameters.seed,
              width: plan.parameters.width,
              depth: plan.parameters.depth,
              groundClearance: navigation.groundClearance,
              allowOrbit: pageUrl.searchParams.get("debug") === "1",
              sampleHeight: (x: number, z: number) => sampleSeedWorldHeight(candidateData.fields, x, z)
            };
            preparedPlayer = playerState?.prepare(playerWorld, {
              restoreCamera: !initial
            });
            let groundPopulation: PlanningSeedWorldData["population"] | undefined = planningNaturalGroundPopulation(
              candidateData.population,
              planningNaturalGrassDensity(library),
              plan
            );
            let cameraPose: PlanningPlayerCameraPose | undefined;
            const authoredSpawn = initial
              ? restorePlanningPlayerBookmark(resolveWorldTemplateSpawn(plan), playerWorld)
              : undefined;
            if (
              initial &&
              !plan.worldTemplateSite?.spawnView &&
              !authoredSpawn &&
              !preparedPlayer?.bookmark &&
              !readSubjectView(document).subjectId
            ) {
              const view = spawnView(plan, candidateData, groundPopulation);
              const position = new Vector3(view.eye.x, view.eye.y, view.eye.z);
              const target = new Vector3(view.target.x, view.target.y, view.target.z);
              const matrix = new Matrix();
              Matrix.lookAt(position, target, new Vector3(0, 1, 0), matrix);
              matrix.invert();
              const rotation = new Quaternion();
              matrix.getRotation(rotation);
              cameraPose = { position, rotation };
            }
            const bookmark = preparedPlayer?.bookmark ?? authoredSpawn;
            if (bookmark) cameraPose = planningPlayerCameraPose(bookmark);
            const presentationPose = resolveSubjectView(
              readSubjectView(document),
              plan,
              camera.aspectRatio,
              (x, z) => sampleSeedWorldHeight(candidateData.fields, x, z),
              navigation.eyeHeight
            );
            if (presentationPose) {
              const position = new Vector3(...presentationPose.eye),
                target = new Vector3(...presentationPose.target);
              const matrix = new Matrix();
              Matrix.lookAt(position, target, new Vector3(0, 1, 0), matrix);
              matrix.invert();
              const rotation = new Quaternion();
              matrix.getRotation(rotation);
              cameraPose = { position, rotation, orbitTarget: target };
            }
            recordBootSpan("player state + ground population + spawn/template view", cameraPreparationAt);
            progress(0.55, "创建 Seed 地形与植被");
            const runtimeFields = { ...candidateData.fields };
            // Run terrain+solids+vegetation+template, buildings, and water preparation in parallel.
            const terrainAndContentTask = (async () => {
              let spanAt = performance.now();
              candidate = await SeedWorldTerrainRuntime.create(
                engine!,
                root,
                camera,
                library,
                profiles,
                candidateData.plan,
                runtimeFields,
                [],
                groundPopulation!,
                candidateData.surfaceIntent,
                candidateData.terrainSettings,
                terrainNormalSamples!,
                SEED_WORLD_SURFACE_LOD_CROSS_FADE_DURATION_SECONDS,
                undefined,
                signal,
                desert
                  ? desert.desertSurfaceOptions(plan, result.recipe.parameters.terrainSurface, result.recipe.edits)
                  : result.recipe.parameters.terrainSurface
              );
              groundPopulation = undefined;
              terrainNormalSamples = undefined;
              recordBootSpan("SeedWorldTerrainRuntime.create", spanAt);
              signal.throwIfAborted();
              candidate.setSurfaceWaterSsrEnabled(environment!.surfaceWaterSsrRequested);
              const { reliefNearAmplitudeM = 0, reliefAmplitudeM = 0, reliefFarAmplitudeM = 0 } = plan.parameters;
              if (Math.max(reliefNearAmplitudeM, reliefAmplitudeM, reliefFarAmplitudeM) > 0)
                candidate.clipmap.setShadowsEnabled(true);
              spanAt = performance.now();
              heightTransition = preparePlanningTerrainPresentation(
                candidate,
                publication!.current?.heightTransition?.fields ?? publication!.current?.data.fields,
                candidateData.fields,
                runtimeFields,
                plan.buildings.length || plan.fences?.length || plan.courtyards?.length
                  ? undefined
                  : context.terrainTransitionDurationSeconds,
                {
                  prepare: async (fields, signal) => {
                    signal.throwIfAborted();
                    const presented = planningPresentedSolids(
                      candidateSolids!.sourcePlan,
                      fields,
                      candidateData.fields
                    );
                    const solidFrame = await candidateSolids!.prepare(presented);
                    const grassFrame = candidate!.population.prepareRockGrass(
                      rockGrassPlacements(presented, candidateSolids!.formations),
                      rockGrassExclusions(candidateSolids!.sourcePlan, fields, rockGrassWaterTest(water!))
                    );
                    try {
                      const groundTemplate = candidateTemplate?.prepareRockGrounding(
                        presented,
                        (x, z) => sampleSeedWorldHeight(fields, x, z),
                        candidateSolids!.formations
                      );
                      const vegetationFrame = candidateVegetation!.prepareGrounding(fields, signal, {
                        plan: presented,
                        formations: candidateSolids!.formations
                      });
                      return {
                        commit: () => {
                          solidFrame.commit();
                          vegetationFrame.commit();
                          grassFrame.commit();
                          groundTemplate?.();
                        },
                        discard: () => {
                          solidFrame.discard();
                          vegetationFrame.discard();
                          grassFrame.discard();
                        }
                      };
                    } catch (error) {
                      solidFrame.discard();
                      grassFrame.discard();
                      throw error;
                    }
                  },
                  onError: (error) => {
                    canvas.dataset.terrainPresentationError = String(error);
                    console.error("[seed-world-planner] terrain/building presentation stopped", error);
                  }
                }
              );
              recordBootSpan("preparePlanningTerrainPresentation", spanAt);
              spanAt = performance.now();
              applyPlanningTreeVariations(candidate.population, plan.authoredResources ?? []);
              recordBootSpan("applyPlanningTreeVariations", spanAt);
              signal.throwIfAborted();
              const presentedFields = heightTransition?.fields ?? candidateData.fields;
              const presented = planningPresentedSolids(plan, presentedFields, candidateData.fields);
              const templateGround = (x: number, z: number) => sampleSeedWorldHeight(candidateData.fields, x, z);
              const templateScene = resolveWorldTemplateScene(plan, templateGround, formationMeshes);
              const templateView =
                templateScene &&
                resolveWorldTemplateView(
                  templateScene,
                  camera.aspectRatio,
                  camera.fieldOfView,
                  navigation.eyeHeight,
                  templateGround
                );
              const seedChanged =
                context.previousDocument.entities.world.components.world?.values.seed !== plan.parameters.seed;
              if (
                !presentationPose &&
                templateView &&
                (((initial || seedChanged) && !bookmark) ||
                  context.previousDocument.entities.world.components.worldTemplate?.values.id !==
                    plan.parameters.worldTemplate?.id)
              ) {
                const position = new Vector3(...templateView.pose.eye),
                  target = new Vector3(...templateView.pose.target);
                const matrix = new Matrix();
                Matrix.lookAt(position, target, new Vector3(0, 1, 0), matrix);
                matrix.invert();
                const rotation = new Quaternion();
                matrix.getRotation(rotation);
                cameraPose = { position, rotation, orbitTarget: target };
              }
              // During initial boot the main camera is disabled behind the opaque loading orb;
              // apply the finalized spawn cameraPose now so PlanningNaturalVegetationRuntime can
              // drain spawn-area cells in parallel with solids, template, buildings, and water.
              if (initial && !ready && cameraPose) {
                camera.entity.transform.setWorldPosition(
                  cameraPose.position.x,
                  cameraPose.position.y,
                  cameraPose.position.z
                );
                camera.entity.transform.worldRotationQuaternion = cameraPose.rotation;
              }
              // Solids, natural vegetation, and world template do not depend on each other; run concurrently.
              const [solidsRes, vegRes, templateRes] = await Promise.all([
                timed("createPlanningSeedSolids", () =>
                  createPlanningSeedSolids(engine!, candidate!.root, presented, {
                    camera,
                    terrainOcclusion: candidate!.terrainOcclusion,
                    signal,
                    previous: publication!.current?.solids,
                    formations: formationMeshes,
                    sourcePlan: plan,
                    rockColorBlend: readRockFormationSettings(document).colorBlend,
                    registerGrassAppearance: bindGrassAppearanceRegistrar(candidate!)
                  })
                ).then((val) => (candidateSolids = val)),
                timed("PlanningNaturalVegetationRuntime.create", () =>
                  PlanningNaturalVegetationRuntime.create(
                    candidate!.root,
                    candidate!.population.trees,
                    candidate!.population.details,
                    camera,
                    library,
                    plan,
                    planningHeightmap(plan),
                    candidateData.fields,
                    candidateData.population,
                    {
                      settings: readRockFormationSettings(document),
                      signal,
                      formations: formationMeshes,
                      supportPlan: presented
                    },
                    readPlantMaterialParameters(document),
                    candidate,
                    presentationPose
                      ? subjectViewLandscape(
                          presentationPose,
                          plan,
                          (x, z) => sampleSeedWorldHeight(candidateData.fields, x, z),
                          camera.aspectRatio
                        )
                      : templateView?.landscape,
                    presentedFields,
                    // On initial boot with cameraPose applied above, drain spawn-area cells in parallel
                    // with solids, template, buildings, and water instead of serially during warmup.
                    { deferInitialDrain: initial && precompileShaders && !(initial && !ready && cameraPose) }
                  )
                ).then((val) => (candidateVegetation = val)),
                timed("WorldTemplateRuntime.create", () =>
                  WorldTemplateRuntime.create(
                    candidate!.root,
                    presented,
                    templateGround,
                    templateScene,
                    signal,
                    formationMeshes,
                    camera
                  )
                ).then((val) => (candidateTemplate = val))
              ]);
              void solidsRes;
              void vegRes;
              void templateRes;
              canvas.dataset.rockFormations = JSON.stringify({
                formations: formationMeshes.length,
                triangles: formationMeshes.reduce((sum, f) => sum + f.mesh.indices.length / 3, 0),
                bodies: formationMeshes.reduce((sum, f) => sum + f.stats.bodies, 0),
                vertices: formationMeshes.reduce((sum, f) => sum + f.stats.vertices, 0)
              });
              signal.throwIfAborted();
              spanAt = performance.now();
              await candidate.population.applyAuthoringPopulationLayout(
                planningNaturalGroundPopulation(
                  candidateData.population,
                  planningNaturalGrassDensity(library),
                  plan,
                  candidateVegetation!.plantAssets
                ),
                {
                  minimumX: 0,
                  minimumZ: 0,
                  maximumX: plan.parameters.width,
                  maximumZ: plan.parameters.depth
                }
              );
              recordBootSpan("applyAuthoringPopulationLayout", spanAt);
              spanAt = performance.now();
              candidate.setSurfaceColorTuning({
                roadColor: readSurfacePalette(document, SEED_WORLD_ROAD_COLOR_DEFAULT, "road"),
                groundColor: readSurfacePalette(document, candidate.defaultGroundColor),
                groundFusion: readGrassGroundFusion(document),
                grass: readGrassAppearance(document)
              });
              recordBootSpan("setSurfaceColorTuning", spanAt);
              if (heightTransition)
                candidateTemplate?.prepareRockGrounding(
                  presented,
                  (x, z) => sampleSeedWorldHeight(presentedFields, x, z),
                  formationMeshes
                )?.();
              return { presented };
            })();

            const runFallbackBuildings = async () => {
              const fallbackTerrain = masonryTerrainSource(
                { data: candidateData, revision: document.revision },
                formationMeshes
              );
              // Startup has no outer project transaction. Later initialization is
              // contributed during editor preparation, never from runtime publication.
              if (!ready && !context.projectTransaction)
                bootEmptyBuildingGeneratorId = await timed("initializeBuildingScene", () =>
                  initializeBuildingScene(
                    runtimeProject!,
                    nativeEditor!.editor,
                    plan,
                    fallbackTerrain,
                    signal,
                    buildingCompiler
                  )
                );
              candidateMasonry = await timed("nativeBuildingHost.prepare", () =>
                nativeBuildingHost!.prepare({
                  terrain: fallbackTerrain,
                  signal
                })
              );
            };
            const buildingsTask = earlyBuildingsTask
              ? earlyBuildingsTask.then(async () => {
                  if (!earlyBuildingsWork) await runFallbackBuildings();
                })
              : runFallbackBuildings();

            const waterTask = (async () => {
              canvas.dataset.waterPreparation = "preparing";
              candidateWater = await timed("water.prepare", () => water!.prepare(plan, signal));
              canvas.dataset.waterPreparation = "ready";
            })();

            const parallelResults = await Promise.allSettled([terrainAndContentTask, buildingsTask, waterTask]);
            for (const item of parallelResults) {
              if (item.status === "rejected") throw item.reason;
            }
            const { presented } = (parallelResults[0] as PromiseFulfilledResult<{ presented: IslandPlan }>).value;
            if (!ready) progress(0.7, "准备原生建筑与水体");
            let spanAt = performance.now();
            candidate!.population.setRockGrassGround(readRockFormationSettings(document));
            candidate!.population
              .prepareRockGrass(
                rockGrassPlacements(presented, formationMeshes),
                rockGrassExclusions(plan, candidateData.fields, rockGrassWaterTest(water!))
              )
              .commit();
            recordBootSpan("rock grass prepare + commit", spanAt);
            spanAt = performance.now();
            if (precompileShaders && ready) candidate!.warmupPopulationDetails();
            recordBootSpan("warmupPopulationDetails", spanAt);
            const warmupRoots = [candidate!.root, ...candidateWater!.shaderWarmupRoots];
            const includeInactiveRoots: Entity[] = [
              ...(candidateVegetation?.shaderWarmupRoots ?? []),
              ...candidateWater!.shaderWarmupRoots,
              ...(candidate?.population ? [candidate.population.trees, candidate.population.details] : []),
              ...(candidateTemplate?.root ? [candidateTemplate.root] : [])
            ];
            let masonryWarmup:
              | Awaited<ReturnType<NonNullable<typeof candidateMasonry>["prepareShaderWarmup"]>>
              | undefined = undefined;
            let vegetationWarmup:
              | ReturnType<NonNullable<typeof candidateVegetation>["prepareShaderWarmup"]>
              | undefined = undefined;
            let rockGrassWarmup:
              | ReturnType<NonNullable<typeof candidate>["population"]["prepareRockGrassShaderWarmup"]>
              | undefined = undefined;
            let shaderWarmup;
            try {
              if (precompileShaders && ready) {
                masonryWarmup = await candidateMasonry?.prepareShaderWarmup(signal);
                vegetationWarmup = candidateVegetation?.prepareShaderWarmup();
                rockGrassWarmup = candidate?.population.prepareRockGrassShaderWarmup();
              }
              const additionalRenderers = [...(masonryWarmup?.renderers ?? []), ...(rockGrassWarmup?.renderers ?? [])];
              shaderWarmup = await warmupSeedWorldRendererVariants(engine!, scene!, camera, warmupRoots, {
                // Startup publishes additional owners below; collect their final state together before reveal.
                enabled: precompileShaders && ready,
                includeInactiveRoots,
                additionalRenderers: additionalRenderers.length ? additionalRenderers : undefined,
                additionalInstancedRenderers: vegetationWarmup?.renderers,
                additionalRendererMaterials: masonryWarmup?.extraMaterials,
                includeGpuInstancing: true,
                onlySharedMeshGpuInstancing: true,
                includeLodDither: false,
                includeMasonryDither: false,
                includeOpaqueScreenSpaceReflection: Boolean(environment?.surfaceWaterSsrRequested),
                strict: true,
                activatedLightRoots: warmupRoots,
                retiredLightRoots: readWorld() ? [readWorld()!.root] : [],
                postProcessState: post.getShaderWarmupState(),
                additionalBackgroundMaterials: [
                  ...environment!.shaderWarmupBackgroundMaterials,
                  ...(sceneEntityEffectHost ? sceneEntityEffectHost.warmupMaterials : [])
                ],
                onVariants:
                  pageUrl.searchParams.get("agentTrace") === "1"
                    ? (variants) => {
                        canvas.dataset.buildingShaderWarmupVariants = JSON.stringify(variants);
                      }
                    : undefined
              });
            } finally {
              rockGrassWarmup?.dispose();
              vegetationWarmup?.dispose();
              masonryWarmup?.dispose();
            }
            if (pageUrl.searchParams.get("agentTrace") === "1")
              canvas.dataset.buildingShaderWarmup = JSON.stringify(shaderWarmup);
            signal.throwIfAborted();
            if (!exposure) {
              candidateExposure = createTerrainWindExposure(engine!, candidate!, readWorld, readRevision);
            }
            return {
              authoringRevision: document.revision,
              masonry: candidateMasonry,
              assertCurrent: candidateMasonry!.assertCurrent.bind(candidateMasonry!),
              vegetation: candidateVegetation,
              template: candidateTemplate,
              preparedWater: candidateWater,
              data: candidateData,
              heightTransition,
              world: candidate!,
              solids: candidateSolids!,
              cameraPose,
              windExposure: candidateExposure,
              playerState: preparedPlayer
            };
          } catch (error) {
            earlyBuildingsAbort.abort(error);
            await earlyBuildingsWork?.catch(() => {});
            await candidateWater?.rollback();
            heightTransition?.dispose();
            await candidateMasonry?.destroy();
            candidateVegetation?.dispose();
            candidateTemplate?.dispose();
            preparedPlayer?.rollback();
            candidateExposure?.destroy();
            try {
              candidateSolids?.dispose();
            } finally {
              await candidate?.destroy();
            }
            throw error;
          } finally {
            signal.removeEventListener("abort", onEarlyBuildingsAbort);
          }
        },
        context.signal
      );
      return {
        discard: async () => {
          try {
            await staged?.discard();
          } finally {
            staged = undefined;
          }
        },
        commit: () => {
          if (!staged) throw Error("Seed scene preparation already consumed");
          staged.commit();
          // Live terrain/wind readers share this preparation scope. Retain rollback
          // only until acceptance, so the scope cannot keep a retired Water Host.
          staged = undefined;
        },
        afterCommit: async () => {
          await publish(true, context.projectTransaction);
          canvas.dataset.waterImpact = JSON.stringify({
            mode: "full-native",
            phase: "published",
            fallback: waterFallback
          });
        }
      };
    };
    let preparationPauseCount = 0,
      resumeAfterPreparation = false;
    const preparePublication: NonNullable<PlanningSessionOptions["preparePublication"]> = async (...args) => {
      // A verified content, surface, or in-place plant-material/presentation edit cannot
      // replace the live world. Never pause rendering or stage a replacement world for it.
      if (
        args[2].contentOnly ||
        args[2].waterUpdate ||
        isLocalPresentationOrPlantMaterialEdit(args[0], args[1], args[2]) ||
        !planningSurfacePublicationGate(
          publication!.current,
          args[2].previousDocument,
          args[0],
          args[1],
          args[2].forceFull,
          args[2].terrainTransitionDurationSeconds,
          true
        )
      )
        return preparePublicationContent(...args);
      // Freeze the visible starting ground, including in-flight building work,
      // before either editing its buildings or preparing a replacement scene.
      const resume = await publication!.current?.heightTransition?.pause();
      // A full replacement can starve while rendering between upload slices.
      // Local rock/support frames retain the live world and must keep rendering.
      const pausedForPreparation =
        ready &&
        (args[2].forceFull ||
          !canPublishRockFormationEdit(publication!.current, args[2].previousDocument, args[0], args[1].plan));
      if (pausedForPreparation && preparationPauseCount++ === 0) {
        resumeAfterPreparation = !engine!.isPaused;
        engine!.pause();
      }
      let resumed = false;
      const resumePresentation = () => {
        if (resumed) return;
        resumed = true;
        resume?.();
        if (pausedForPreparation && --preparationPauseCount === 0 && resumeAfterPreparation && !disposed)
          engine!.resume();
      };
      try {
        args[2].signal?.throwIfAborted();
        const prepared = await preparePublicationContent(...args);
        return {
          ...prepared,
          commit: () => {
            try {
              return prepared.commit();
            } finally {
              resumePresentation();
            }
          },
          discard: async () => {
            try {
              await prepared.discard();
            } finally {
              resumePresentation();
            }
          }
        };
      } catch (error) {
        resumePresentation();
        throw error;
      }
    };
    const publicationPhases: {
      phase: string;
      startMs: number;
      endMs: number;
    }[] = [];
    const recordPublicationPhase = (phase: string, startMs: number) => {
      if (pageUrl.searchParams.get("agentTrace") !== "1") return;
      publicationPhases.push({ phase, startMs, endMs: performance.now() });
      if (publicationPhases.length > 32) publicationPhases.shift();
      canvas.dataset.buildingAfterPublication = JSON.stringify({
        timeOrigin: performance.timeOrigin,
        phases: publicationPhases
      });
    };
    const synchronizeMojaveLayout = async (accepted: NonNullable<PlanningSeedScenePublication["current"]>) => {
      const isCurrent = () => publication!.current === accepted && !disposed;
      let next: Entity | undefined;
      const templateId = accepted.plan.parameters.worldTemplate?.id;
      if (templateId === "titan-wasteland" && worldTemplate(templateId)?.rockSource !== "shared") {
        try {
          const { createSeedWorldMojavePreview } = await import("./src/SeedWorldMojavePreview");
          if (!isCurrent()) return;
          next = await createSeedWorldMojavePreview(
            root,
            accepted.plan,
            isCurrent,
            camera,
            accepted.world.clipmap.material
          );
          if (isCurrent()) {
            const { mountDesertVegetation } = await import("./src/DesertVegetation");
            if (isCurrent()) {
              next ??= root.createChild("Mojave desert layout");
              mountDesertVegetation(next, accepted.plan, accepted.data, spawnView(accepted.plan, accepted.data));
            }
          }
        } catch (error) {
          next?.destroy();
          if (isCurrent()) console.warn("[seed-world] desert landscape setup failed", error);
          return;
        }
      }
      if (!isCurrent()) {
        next?.destroy();
        return;
      }
      mojaveLayout?.destroy();
      mojaveLayout = next;
      delete canvas.dataset.desertOasis;
      if (next) canvas.dataset.mojavePreview = String(next.children.length);
      else delete canvas.dataset.mojavePreview;
    };
    const publishContentEdit = async (projectTransaction = false) => {
      const accepted = publication!.current!;
      await synchronizeMojaveLayout(accepted);
      if (publication!.current !== accepted || disposed) return;
      animals!.synchronize(accepted.plan, readAnimalPopulationConfig(source!.session.document), accepted.navigation, {
        preservePopulation: true,
        change: accepted.animalChange,
        surface: accepted.data.surfaceIntent
      });
      await obbDebug?.synchronize(accepted.plan);
      if (publication!.current !== accepted || disposed) return;
      await runtimeDebug?.synchronize();
      if (publication!.current !== accepted || disposed) return;
      if (ready && !projectTransaction) await source!.save();
    };
    const publish = async (restorePlayerState: boolean, projectTransaction = false) => {
      const accepted = publication!.current!;
      const plan = accepted.plan;
      water?.setTerrainOcclusionProvider({
        isOccluded: (candidateId, bounds) => accepted.world.terrainOcclusion.isWaterBoundsOccluded(candidateId, bounds),
        get revision() {
          return accepted.world.terrainOcclusion.visibilityRevision;
        }
      });
      water?.update(0);
      const templateId = plan.parameters.worldTemplate?.id ?? "";
      const templateArt = WORLD_TEMPLATE_ART[templateId];
      const hasTemplateWater = !!templateArt?.water?.length;
      if (isFarmingPlanned() !== boundFarmingEnabled) {
        await bindFarming().catch((error) => console.warn("[seed-world-planner] farming activation failed", error));
        if (publication!.current !== accepted || disposed) return;
      }
      farmingHost?.runtime?.publish(accepted, source!.session.document.revision);
      accepted.template?.activate(canvas);
      if (!accepted.template) delete canvas.dataset.worldTemplate;
      if (worldTemplate(templateId)?.family === "desert" && !hasTemplateWater) {
        try {
          const { createSeedSandstorm, loadSeedSandstormAtlas, placeSeedSandstorm } = await import(
            "./src/SeedWorldSandstorm"
          );
          if (publication!.current !== accepted || disposed) return;
          const { x, z } = plan.spawn;
          const atlas = sandstorm ? undefined : await loadSeedSandstormAtlas(engine!);
          if (publication!.current !== accepted || disposed) return;
          const fields = accepted.heightTransition?.fields ?? accepted.data.fields;
          if (sandstorm) placeSeedSandstorm(sandstorm, x, z, fields);
          else sandstorm = createSeedSandstorm(root, atlas!, x, z, fields);
        } catch (error) {
          if (!disposed) console.warn("[seed-world] sandstorm setup failed", error);
        }
      } else if (sandstorm) {
        sandstorm.destroy();
        sandstorm = undefined;
      }
      canvas.dataset.sandstorm = sandstorm ? "active" : "off";
      applyTemplateBuildingPalette(templateId);
      if (templateId === "oil-paint") {
        try {
          await setOilPaintPassActive(true);
          if (publication!.current !== accepted || disposed) return;
          await setOilPaintMacroEnabled(true);
        } catch (error) {
          if (!disposed) console.warn("[seed-world] oil-paint style setup failed", error);
        }
      } else {
        await setOilPaintPassActive(false);
        await setOilPaintMacroEnabled(false);
      }
      canvas.dataset.oilPaint = oilPaintMacroEnabled ? "active" : "off";
      if (publication!.current !== accepted || disposed) return;
      detachCompanionStoneObstacles?.();
      detachCompanionStoneObstacles = undefined;
      animals!.clearDynamicObstacles();
      if (accepted.vegetation) {
        detachCompanionStoneObstacles = accepted.vegetation.onCompanionStoneObstaclesChange((cellKey, obstacles) => {
          animals?.setDynamicObstacles(`companion-stone:${cellKey}`, obstacles);
        });
      }
      animals!.synchronize(plan, readAnimalPopulationConfig(source!.session.document), accepted.navigation, {
        surface: accepted.data.surfaceIntent
      });
      if (!ready) {
        // Kick off spawn-visible animal GLB downloads immediately in parallel with IBL idle,
        // session setup, and detail warmup instead of waiting serially for preparePresentation.
        void animals!.preparePresentation().catch(() => {});
      }
      if (publication!.current !== accepted || disposed) return;
      canvas.dataset.buildingPublicationRevision = String(accepted.revision);
      canvas.dataset.buildingPreparation = JSON.stringify(accepted.masonry?.metrics ?? null);
      const framing = spawnViews.get(plan)?.view;
      if (framing) canvas.dataset.spawnView = JSON.stringify(framing);
      else delete canvas.dataset.spawnView;
      // Acceptance is complete. Debug/persistence failures have their own diagnostics.
      try {
        if (publication!.current !== accepted || disposed) return;
        if (accepted.windExposure) {
          exposure = accepted.windExposure;
          wind.setGpuRenderCamera(camera);
          wind.setGpuExposureProvider(exposure);
          wind.attachSceneBridge(camera.entity.transform.worldPosition);
        }
        // Local building edits retain the live camera mode, not the startup bookmark.
        if (restorePlayerState && accepted.playerBookmark && debugSidebar)
          debugSidebar.restoreCameraMode(accepted.playerBookmark.mode);
        await obbDebug?.synchronize(plan);
        if (publication!.current !== accepted || disposed) return;
        await runtimeDebug?.synchronize();
        if (publication!.current !== accepted || disposed) return;
        debugSidebar?.synchronize(plan);
        if (ready) {
          await applyPresentation(source!.session, lightingProfile!, post, resetPostProcess);
          applyPlanningWeather(
            environment!,
            source!.session.inspect("world").components.find((c) => c.type === "weather")?.values
          );
          accepted.world.setSurfaceColorTuning({
            roadColor: readSurfacePalette(source!.session.document, SEED_WORLD_ROAD_COLOR_DEFAULT, "road"),
            groundColor: readSurfacePalette(source!.session.document, accepted.world.defaultGroundColor),
            groundFusion: readGrassGroundFusion(source!.session.document),
            grass: readGrassAppearance(source!.session.document)
          });
        }
        if (desert && worldTemplate(templateId)?.rockSource !== "shared") desert.applyDesertSky(lighting!);
        if (desert) post.setBloomTint(1, 1, 1);
        if (templateArt?.sandRippleFadeM !== undefined) {
          const normals = accepted.world.getSandNormalTuning();
          if (normals)
            accepted.world.setSandNormalTuning({ ...normals, rippleFadeDistanceMetres: templateArt.sandRippleFadeM });
        } else {
          desert?.applyDesertTerrain(accepted.world, false);
        }
        await synchronizeMojaveLayout(accepted);
        if (publication!.current !== accepted || disposed) return;
        const surfaceTuning = accepted.world.getSurfaceColorTuning();
        canvas.dataset.grassAppearance = JSON.stringify(surfaceTuning.grass);
        canvas.dataset.grassGroundFusion = String(surfaceTuning.groundFusion);
        const actualLight = lighting!.getSnapshot();
        const actualTuning = lighting!.getVisualTuning();
        canvas.dataset.presentation = JSON.stringify({
          revision: source!.session.document.revision,
          lighting: {
            timeHours: actualLight.timeHours,
            directLightColor: actualLight.directLightColor,
            sunIntensity: actualLight.sunIntensity,
            ambientIntensity: actualTuning.ambientIntensity,
            iblIntensity: actualTuning.iblIntensity,
            skyExposure: actualTuning.skyExposure,
            skyTintRGB: [actualTuning.skyTintR, actualTuning.skyTintG, actualTuning.skyTintB],
            fogDensity: actualTuning.fogDensity,
            customSkyTintStrength: actualTuning.customSkyTintStrength,
            zenithRGB: [actualTuning.customSkyZenithR, actualTuning.customSkyZenithG, actualTuning.customSkyZenithB],
            horizonRGB: [actualTuning.customSkyHorizonR, actualTuning.customSkyHorizonG, actualTuning.customSkyHorizonB]
          },
          postProcess: post.getDebugSnapshot()
        });
        if (ready) applySubjectView();
        if (ready && !projectTransaction) await source!.save();

        if (publication!.current !== accepted || disposed) return;
      } catch (error) {
        console.warn("[seed-world-planner] published scene follow-up failed", error);
      }
    };
    // Keep camera.enabled = false during world build and IBL/cloud warmup; it turns on right before orb.reveal().
    progress(0.2, "准备原 Seed 环境光照");
    const readVistaPalette = (document: PlanningDocument, world: SeedWorldTerrainRuntime) => ({
      groundColor: readSurfacePalette(document, world.defaultGroundColor),
      rockTint: readRockFormationSettings(document).colorBlend.color
    });
    await source.initialize(async (document, result, context) => {
      const prepared = await preparePublication(document, result, context);
      const records = planningVegetationColors(document);
      const changed = JSON.stringify(records) !== JSON.stringify(plantColors.records);
      const colors = changed ? new VegetationColors(records) : plantColors;
      return {
        ...prepared,
        commit() {
          prepared.commit();
          plantColors = colors;
          publication?.current?.vegetation?.setLocalColors(colors);
          publication?.current?.template?.setLocalColors(colors);
        },
        afterCommit: () => {
          const accepted = publication?.current;
          if (!disposed && vista && accepted && source?.session.document.revision === document.revision) {
            vista.setPalette(readVistaPalette(document, accepted.world));
            vista.setTerrainBounds(accepted.data.fields);
          }
          return prepared.afterCommit?.();
        }
      };
    });
    const vistaScene = { engine, parent: root, camera, environment };
    let vistaHeightPercent = SeedWorldPanoramaVistaRuntime.defaultHeightPercent;
    let vistaNormalWidth = SeedWorldPanoramaVistaRuntime.defaultNormalWidth;
    const vistaControls: TerrainVistaDebugControl = {
      heightRange: SeedWorldPanoramaVistaRuntime.heightRange,
      get visible() {
        return vista?.visible ?? false;
      },
      set visible(enabled) {
        // Use the most recent published terrain when enabling the panorama for the first time.
        if (enabled && !vista) {
          const accepted = publication!.current!;
          const next = new SeedWorldPanoramaVistaRuntime({
            ...vistaScene,
            plan: accepted.data.plan,
            fields: accepted.data.fields,
            palette: readVistaPalette(source!.session.document, accepted.world)
          });
          try {
            next.heightPercent = vistaHeightPercent;
            next.setNormalWidth(vistaNormalWidth);
          } catch (error) {
            next.destroy();
            throw error;
          }
          vista = next;
        }
        if (vista) vista.visible = enabled;
      },
      get heightPercent() {
        return vista?.heightPercent ?? vistaHeightPercent;
      },
      set heightPercent(value) {
        if (vista) vista.heightPercent = value;
        vistaHeightPercent = value;
      },
      get normalWidth() {
        return vistaNormalWidth;
      },
      set normalWidth(width) {
        vista?.setNormalWidth(width);
        vistaNormalWidth = width;
      }
    };
    vistaControls.visible = publication!.current!.plan.parameters.worldTemplate?.id === "titan-wasteland";
    const initialBuildingDocument = source.session.export();
    nativeEditor.editor.registerPreparation(
      preparePlanningWaterSource(() => runtimeProject!.projectPackage),
      {
        name: "planning-water",
        dependencies: {
          scene: {
            componentTypes: ["WaterBodyComponent", "PlanningProjectAuthoring", "PlanningEntityAuthoring"],
            hierarchy: true
          },
          namespace: true,
          documents: "all",
          ignoreAssetDescriptions: true
        }
      }
    );
    nativeEditor.editor.registerPreparation(validatePlanningSource, {
      name: "planning-validation",
      dependencies: {
        scene: { componentTypes: ["WaterBodyComponent"], componentTypePrefixes: ["Planning"], hierarchy: true },
        namespace: true,
        documents: "all",
        ignoreAssetDescriptions: true
      }
    });
    nativeEditor.editor.registerPreparation(
      buildingScenePreparation(
        runtimeProject.projectPackage.project.scene,
        (edit, signal) =>
          buildingInitializationInputs(
            edit,
            signal,
            {
              document: source!.session.document,
              result: source!.session.result!
            },
            rockFormations,
            initialBuildingDocument
          ),
        undefined,
        {
          bootEmptyInitializedGeneratorId: () => bootEmptyBuildingGeneratorId,
          compiler: nativeBuildingHost!.system.cpuCompiler
        }
      ),
      {
        name: "building-initialization",
        dependencies: {
          scene: { componentTypes: ["BuildingGeneratorComponent"], hierarchy: true },
          assets: "all",
          namespace: true,
          documents: "all",
          ignoreAssetDescriptions: true
        }
      }
    );
    progress(0.94, "准备世界画面");
    desert?.applyDesertShadows(lighting);
    scene!.ambientOcclusion.enabled = false;
    if (desert) {
      scene!.shadowFadeBorder = 0.2;
      sun.shadowBias = 0.5;
      sun.shadowNormalBias = 0.5;
      scene!.ambientOcclusion.intensity = 0.5;
      scene!.ambientOcclusion.radius = 0.5;
    } else {
      // Raise shadowBias/shadowNormalBias from the 0.25 scene baseline closer to the engine default
      // to eliminate grazing-angle self-shadowing on plastered masonry walls in Cascade 1 while
      // keeping the default cascade distribution (Cascade 0 tree-shadow triangle budget intact).
      sun.shadowBias = 0.5;
      sun.shadowNormalBias = 0.9;
    }
    await timed("waitForEnvironmentIBLIdle", async () => {
      if (prewarmedIBLTask) {
        await prewarmedIBLTask;
        prewarmedIBLTask = undefined;
      }
      await lighting!.waitForEnvironmentIBLIdle();
    });
    const hudCreationAt = performance.now();

    tools = new PlanningSeedWorldSession({
      nativeEditor,
      editorExtensions: [
        createNativeWaterAgentPackage(
          {
            editor: nativeEditor,
            project: runtimeProject,
            system: () => water?.system,
            hostTerrain: true,
            oceanDatum: 0
          },
          waterAgentKnowledge()
        ),
        createFarmingComponentExtension(nativeEditor.projection),
        ...(retrieval ? [retrieval.extension] : [])
      ],
      animals,
      planning: source!.session,
      engine,
      root,
      camera,
      navigation,
      orbit,
      lighting,
      environment,
      water,
      readPublished,
      setWorldInputEnabled: (enabled) => {
        assistantInputEnabled = enabled;
        enabled = enabled && !lassoFrozen;
        if (restoreMasonryView) {
          orbit.enabled = ready && enabled;
          navigation.enabled = false;
          navigation.setInputEnabled(false);
        } else if (debugSidebar) debugSidebar.setInputEnabled(ready && enabled);
        else {
          navigation.enabled = ready && enabled;
          navigation.setInputEnabled(ready && enabled);
        }
      },
      isActive: () => ready && !disposed,

      initiallyOpen: true,
      traceEnabled: pageUrl.searchParams.get("agentTrace") === "1"
    });
    recordPublicationPhase("hudCreation", hudCreationAt);
    // Dense visible details belong to the world presentation, including photo captures.
    timed("warmupPopulationDetails (startup)", () => publication!.current?.world.warmupPopulationDetails());

    shaderAudit?.setPhase("startup-warmup");
    let {
      report: startupWarmupReport,
      deferredShaderVariants,
      collectDeferredVariants,
      ssrVerifyReceiverDepth
    } = await runSeedWorldStartupShaderWarmup({
      precompileShaders,
      engine: engine!,
      scene: scene!,
      camera,
      pageUrl,
      canvas,
      showAssistant,
      isDisposed: () => disposed,
      lifetimeSignal: editorLifetime.signal,
      progress,
      timed,
      deferSecondaryCollection: true,
      includeMasonryDither: false,
      // Spawn-visible masonry LOD0/GlobalProxy renderers are already active in scene.rootEntities
      // (with entrance macros); offscreen LOD0/LOD1, steady-state entrance-OFF partners, SupportSurface,
      // GlobalProxyShadowOnly, and synthetic rock grass warm up in post-ready secondary collection at priority -1.
      precompileCoreMasonry: false,
      getDynamicPresentationRevision: () => {
        const masonry = publication?.current?.masonry;
        return masonry ? `${masonry.presentationRevision}:${masonry.metrics.profileUnits}` : undefined;
      },
      prepareFarmingPresentation: () => farmingHost?.runtime?.preparePresentation(),
      prepareAnimalPresentation: () => animals?.preparePresentation(),
      prepareAnimalShaderWarmup: (signal) => animals?.prepareShaderWarmup(signal),
      prepareVegetationPresentation: () => publication!.current?.vegetation?.preparePresentation(),
      prepareMasonryPresentation: () =>
        publication?.current?.masonry ? nativeBuildingHost?.synchronize().catch(() => {}) : undefined,
      preparePrimaryVegetationShaderWarmup: () => publication!.current?.vegetation?.preparePrimaryShaderWarmup(),
      prepareVegetationShaderWarmup: () => publication!.current?.vegetation?.prepareShaderWarmup(),
      prepareRockGrassShaderWarmup: () => publication!.current?.world.population.prepareRockGrassShaderWarmup(),
      prepareMasonryShaderWarmup: (signal) => publication!.current?.masonry?.prepareShaderWarmup(signal),
      prepareAssistantPresentation: () => {
        ensureVoiceHudStartupShaders();
        return tools?.preparePresentation();
      },
      getIncludeInactiveRoots: () => [
        ...(publication!.current?.vegetation?.shaderWarmupRoots ?? []),
        ...(water?.shaderWarmupRoots ?? []),
        ...(publication!.current?.world?.population
          ? [publication!.current.world.population.trees, publication!.current.world.population.details]
          : []),
        ...(publication!.current?.solids?.bridgesView?.root ? [publication!.current.solids.bridgesView.root] : []),
        ...(publication!.current?.template?.root ? [publication!.current.template.root] : []),
        ...(farmingHost?.runtime?.worldPresentation?.root ? [farmingHost.runtime.worldPresentation.root] : []),
        ...(farmingHost?.runtime?.activeArea?.entity ? [farmingHost.runtime.activeArea.entity] : []),
        ...(farmingHost?.runtime?.activeArea?.storagePresenter?.root
          ? [farmingHost.runtime.activeArea.storagePresenter.root]
          : []),
        ...(farmingHost?.runtime?.activeArea?.sowingPresenter?.root
          ? [farmingHost.runtime.activeArea.sowingPresenter.root]
          : [])
      ],
      hasOpaqueScreenSpaceReflection: () => Boolean(environment?.surfaceWaterSsrRequested),
      getPostProcessWarmupState: () => post.getShaderWarmupState(),
      additionalBackgroundMaterials: environment!.shaderWarmupBackgroundMaterials,
      deferredBackgroundMaterials: sceneEntityEffectHost ? sceneEntityEffectHost.warmupMaterials : undefined,
      onWarmupPhaseChange: (active) => orb?.setWarmupThrottled(active),
      onWarmupEvent: (message, detail) => seedWorldBootTrace.event("info", "shader-warmup", message, detail)
    });
    if (disposed || editorLifetime.signal.aborted) return;
    shaderAudit?.setParallelCompile(Boolean(startupWarmupReport?.parallelCompileSupported));
    const startupAttempted = Math.max(
      0,
      (startupWarmupReport?.requested ?? 0) - (startupWarmupReport?.deferred?.length ?? 0)
    );
    shaderAudit?.recordWarmupRequested(startupAttempted, deferredShaderVariants.length);
    seedWorldBootTrace.setMeta({
      features: {
        hasSSR: Boolean(environment?.surfaceWaterSsrRequested),
        hasMasonry: Boolean(publication?.current?.masonry),
        hasVegetation: Boolean(publication?.current?.vegetation),
        hasAnimals: Boolean(animals),
        hasFarming: Boolean(farmingHost?.runtime)
      },
      ...(startupWarmupReport
        ? {
            startupWarmup: {
              requested: startupWarmupReport.requested,
              compiled: startupWarmupReport.compiled,
              deferred: deferredShaderVariants.length,
              elapsedMs: Math.round(startupWarmupReport.elapsedMilliseconds),
              longestVariantMs: Math.round(startupWarmupReport.longestVariantMilliseconds),
              parallelCompile: Boolean(startupWarmupReport.parallelCompileSupported)
            }
          }
        : {})
    });
    shaderAudit?.setPhase("reveal");
    farmingHost?.runtime?.worldPresentation?.setBackgroundShaderWorkPaused(true);

    if (sharedStorage && startupSaveTask && !runtimeProject.restoredFromStorage) {
      await timed("await initial checkpoint", () => startupSaveTask);
      if (disposed || editorLifetime.signal.aborted) return;
    }
    camera.enabled = true;
    progress(1, "Seed World 已就绪");
    try {
      await timed("orb.reveal", () =>
        orb!.reveal(() => {
          publication?.current?.masonry?.startEntrance();
          readWorld()?.update(0);
        })
      );
    } finally {
      farmingHost?.runtime?.worldPresentation?.setBackgroundShaderWorkPaused(false);
    }
    if (disposed || editorLifetime.signal.aborted) return;
    orb?.destroy();
    orb = undefined;
    // Release SWB1 prefetch buffers right after orb.reveal so iOS WebKit immediately reclaims
    // template ArrayBuffers before post-ready audio and background warmup allocate memory.
    releasePrefetchedBinaryAssets();
    ready = true;
    audio?.audio.setLoadDeferred(false);
    shaderAudit?.setPhase("post-ready");
    disconnectEditorAssets = timed("tools.connectProject", () => tools!.application.connectProject(runtimeProject!));
    const savedEditor = runtimeProject.projectPackage.contents[SEED_WORLD_EDITOR_PATH];
    if (typeof savedEditor === "string")
      await timed("restoreEditorDocument", () =>
        tools!.application.restoreEditorDocument(JSON.parse(savedEditor), editorLifetime.signal, {
          restoreCamera: false
        })
      );
    if (disposed) throw new Error("Seed page disposed during editor restoration");
    if (debugSidebar) debugSidebar.setInputEnabled(true);
    else {
      navigation.enabled = true;
      navigation.setInputEnabled(true);
    }
    navigation.setGroundCollision(true);
    timed("applySubjectView", () => applySubjectView());
    worldPicker ??= timed("SeedWorldPicker", () => new SeedWorldPicker(camera));
    const inspection = nativeEditor!.inspection;
    tools!.application.runtimeInspection = inspection;
    const snapshotPicks = new RuntimeMeshPickSource(camera, inspection, visitCurrentPickBatches);
    // Settles when the background warm-up of the capture path has ended, with or without an error.
    let snapshotWarmup: Promise<void> | undefined;
    viewSnapshots = new SeedWorldViewSnapshots(
      async (signal, budget) => {
        // Join shared preparation before choosing the frame. The picker captures color, IDs and
        // depth in one camera callback, before a resize or simulation tick can separate them.
        const endUrgent = pickPreparation!.beginUrgent();
        try {
          await waitForSnapshotWarmup(snapshotWarmup, signal);
          await pickPreparation!.flush(signal);
          return await worldPicker!.capture(
            (visitor) => snapshotPicks.visit(visitor),
            (batch) => inspection.target(batch.renderer),
            signal,
            budget,
            () => pickPreparation!.ready
          );
        } finally {
          endUrgent();
        }
      },
      () => {
        const state = tools!.application.getViewState();
        return `${state.activeRevision}:${state.authoringStateHash}`;
      }
    );
    tools!.application.viewSnapshots = viewSnapshots;
    unbindWorldClick = bindWorldClickInput(canvas, navigation, function interactWithAnimal(x, y) {
      if (!ready || disposed || lassoFrozen || runtimeDebug?.farmingPicking) return;
      const ray = new Ray();
      camera.screenPointToRay(new Vector2(x, y), ray);
      animals?.shoo(
        ray,
        (distance) => rockNavigation?.raycastWorld(ray, distance) ?? root.scene!.physics.raycast(ray, distance)
      );
    });
    if (showAssistant)
      timed("tools.show", () => {
        ensureVoiceHudStartupShaders();
        tools!.show();
      });
    const startPerfTour = async () => {
      if (disposed || !engine) return;
      if (!perfTour) {
        const { createSeedWorldPerfTour } = await import("./src/SeedWorldPerfTour.ts");
        if (disposed) return;
        if (!perfTour) {
          let savedNavEnabled = false;
          let savedOrbitEnabled = false;
          const recipeParams = source?.session.recipe().parameters;
          perfTour = createSeedWorldPerfTour({
            engine,
            camera,
            canvas,
            templateId: recipeParams?.worldTemplate?.id || "original",
            seed: String(recipeParams?.seed ?? pageUrl.searchParams.get("seed") ?? ""),
            durationSec: perfTourDurationSec,
            eyeHeight: navigation.eyeHeight,
            sampleHeight,
            readPlan: () => publication?.current?.plan,
            readCumulativeCounters: perfPanel ? (out) => perfPanel!.readCumulativeCounters(out) : undefined,
            readShaderAudit: () => shaderAudit?.snapshot(),
            setControlsSuspended: (suspended) => {
              if (suspended) {
                savedNavEnabled = navigation.enabled;
                savedOrbitEnabled = orbit.enabled;
                navigation.enabled = false;
                navigation.setInputEnabled(false);
                orbit.enabled = false;
              } else {
                navigation.enabled = savedNavEnabled;
                navigation.setInputEnabled(savedNavEnabled);
                if (savedNavEnabled) navigation.synchronizeView();
                orbit.enabled = savedOrbitEnabled;
              }
            },
            onRunningChange: (running) => {
              perfTourRunning = running;
            }
          });
        }
      }
      perfTour.start();
    };
    const rawAutoBenchParam = pageUrl.searchParams.get("autoBench");
    const autoBenchRequested =
      rawAutoBenchParam !== null &&
      !["", "0", "false", "off"].includes(rawAutoBenchParam.trim().toLowerCase());
    const rawAutoAblateParam = pageUrl.searchParams.get("autoAblate");
    const autoAblateRequested =
      rawAutoAblateParam !== null &&
      !["", "0", "false", "off"].includes(rawAutoAblateParam.trim().toLowerCase());
    if (
      ((pageUrl.searchParams.get("debug") === "1" && pageUrl.searchParams.get("panel") === "1") ||
        autoBenchRequested ||
        autoAblateRequested) &&
      !disposed
    ) {
      const { SeedWorldPerfPanel } = await import("./src/SeedWorldPerfPanel.ts");
      if (!disposed) {
        perfPanel = new SeedWorldPerfPanel({
          engine: engine!,
          scene: scene!,
          canvas,
          root,
          camera,
          sun,
          post,
          wind,
          environment: environment!,
          water,
          readPublished: () => publication?.current,
          setVistaVisible: (visible) => {
            vistaControls.visible = visible;
          },
          getVistaVisible: () => vistaControls.visible,
          setHudVisible: (visible) => {
            if (visible && showAssistant) tools?.show();
            else tools?.hide();
          },
          setBuildingVisible: (visible) => {
            if (nativeBuildingHost) nativeBuildingHost.system.visible = visible;
          },
          setDprOverride: (dpr) => {
            dprOverride = dpr;
            resize();
          },
          onStartPerfTour: () => {
            void startPerfTour();
          },
          suppressAutoBoot: autoBenchRequested || autoAblateRequested
        });
      }
    }
    loading.hidden = true;
    canvas.dataset.status = "ready";
    document.body.dataset.worldReady = "true";
    seedWorldBootTrace.finish();
    // Release startup offscreen-load deferrals now that first-screen reveal and boot trace have completed.
    animals?.setStartupDeferOffscreenCamera(undefined);
    farmingHost?.runtime?.setDeferOffscreenProps(false);
    // Ensure SWB1 prefetch buffers and promise references are released (idempotent if already freed after orb.reveal).
    commonBinaryBundleTask = undefined;
    buildingBinaryBundleTask = undefined;
    prefetchedTextAssetsTask = undefined;
    releasePrefetchedBinaryAssets();
    // Mount optional debug panels asynchronously after ready so `?debug=1` never stalls boot or orb.reveal.
    if (pageUrl.searchParams.get("debug") === "1" && !disposed) {
      void (async () => {
        try {
          const [
            { PlanningSeedObbDebug },
            { PlanningSeedRuntimeDebug },
            { PlanningSeedDebugSidebar },
            { SeedWorldLodDebugPanel },
            { mountNativeWaterPanel },
            { mountNativeBuildingPanel }
          ] = await Promise.all([
            import("./src/planning/spatial/runtime/PlanningSeedObbDebug.ts"),
            import("./src/planning/spatial/runtime/PlanningSeedRuntimeDebug.ts"),
            import("./src/planning/spatial/runtime/PlanningSeedDebugSidebar.ts"),
            import("./src/SeedWorldLodDebugPanel.ts"),
            import("@galacean/engine-world-planning/spatial/runtime/NativeWaterPanel"),
            import("@galacean/engine-world-planning/masonry/NativeBuildingPanel")
          ]);
          if (disposed || editorLifetime.signal.aborted) return;
          const activePlan = publication?.current?.plan ?? source?.session.result?.plan;
          obbDebug = new PlanningSeedObbDebug({
            engine: engine!,
            root,
            camera,
            getWorld: readWorld,
            setWaterVisible: (visible) => water!.setVisible(visible, visible),
            onRepresentationChanged: (enabled) => {
              if (ready) {
                if (enabled) tools?.hide();
                else if (showAssistant) tools?.show();
              }
            }
          });
          if (activePlan) await obbDebug.synchronize(activePlan);
          if (disposed || editorLifetime.signal.aborted) return;
          runtimeDebug = await PlanningSeedRuntimeDebug.create({
            mountLodControls: ({ grassHost, buildingHost }) =>
              new SeedWorldLodDebugPanel({
                grassHost,
                buildingHost,
                engine: engine!,
                camera,
                readPopulation: () => readWorld()?.population,
                readMasonryMetrics: () => publication?.current?.masonry?.metrics
              }),
            extraControls:
              desert && startupTemplate?.rockSource !== "shared"
                ? async (gui) => {
                    const { mountMojaveLodControls } = await import("./src/SeedWorldMojavePreview");
                    mountMojaveLodControls(gui, () => mojaveLayout);
                  }
                : undefined,
            trees: {
              project: runtimeProject!,
              editor: nativeEditor!,
              application: tools!.application,
              planning: source!.session,
              readVegetation: () => readPublished()?.vegetation
            },
            engine: engine!,
            root,
            camera,
            navigation,
            orbit,
            lighting: lighting!,
            post,
            environment: environment!,
            water,
            audio: audio!.audio,
            vista: vistaControls,
            oilPaint: oilPaintDebugControl,
            setGrassGroundFusion: (enabled) =>
              tools!.dispatchParameters([
                {
                  op: "set",
                  entity: "world",
                  component: "grassAppearance",
                  values: { groundFusion: enabled }
                }
              ]),
            readSolidsRoot: () => publication?.current?.solids.root,
            readPublished,
            rocks: {
              planning: source!.session,
              apply: (commands) => tools!.dispatchParameters(commands),
              grass: {
                preview: (enabled) => publication?.current?.solids.setRockGrassCoveragePreview(enabled),
                diagnostics: () => {
                  const grass = readWorld()?.population.generatedRockGrassDiagnostics;
                  if (!grass) return "Waiting / 等待生成";
                  const { formations, ...summary } = grass;
                  canvas.dataset.rockGrass = JSON.stringify(summary);
                  return (
                    grass.error ??
                    `${formations.reduce((n, f) => n + f.accepted, 0)} clumps / 草簇 · ` +
                      `${grass.pendingPatches} pending patches / 待生成分块 · ${grass.lastEdit.changed} changed / 已更新 · ` +
                      `${grass.lastEdit.retained} retained / 已保留 · CPU peak / CPU 峰值 ${grass.maxSliceMs.toFixed(1)} ms`
                  );
                }
              }
            },
            farming: {
              canvas,
              camera,
              navigation,
              get runtime() {
                return farmingHost?.runtime;
              },
              readEnabled: () => farmingSwitch.enabled,
              readSwitchError: () => farmingSwitch.error,
              setEnabled: (enabled) => farmingSwitch.setEnabled(enabled),
              readCurrent: () => publication?.current,
              isInputEnabled: () => ready && !disposed && !tools?.listening,
              beforeTravel: () => {
                debugSidebar?.resumeNavigation();
              }
            },
            animals: {
              planning: source!.session,
              apply: (commands) => tools!.dispatchParameters(commands),
              inspect: (evidence) => animals!.inspect(evidence),
              command: (id, skillId) => animals!.commandFromPanel(id, skillId),
              focus: (id) => {
                const position = animals!.position(id);
                const eye = animals!.observationPosition(id, navigation.groundClearance);
                if (!position || !eye) return;
                debugSidebar?.resumeNavigation();
                camera.entity.transform.setWorldPosition(eye.x, eye.y, eye.z);
                camera.entity.transform.lookAt(new Vector3(position.x, position.y + 0.8, position.z));
                navigation.synchronizeView();
              },
              returnToSpawn: () => {
                const current = publication!.current!;
                const planned = current.plan.worldTemplateSite?.spawnView;
                const view = planned
                  ? {
                      eye: {
                        x: planned.eye[0],
                        y: planned.eye[1],
                        z: planned.eye[2]
                      },
                      target: {
                        x: planned.target[0],
                        y: planned.target[1],
                        z: planned.target[2]
                      }
                    }
                  : spawnView(current.plan, current.data);
                debugSidebar?.resumeNavigation();
                navigation.setVerticalOffset(0);
                camera.fieldOfView = PLANNING_RUNTIME_OPTIONS.verticalFieldOfView;
                camera.entity.transform.setWorldPosition(view.eye.x, view.eye.y, view.eye.z);
                camera.entity.transform.lookAt(new Vector3(view.target.x, view.target.y, view.target.z));
                navigation.synchronizeView();
                debugSidebar?.restoreCameraMode("roam");
                canvas.dataset.spawnView = JSON.stringify(view);
                playerState?.observe();
              }
            }
          }).catch((error) => {
            canvas.dataset.runtimeDebugError = String(error);
            console.warn("[seed-world-planner] runtime debug panels unavailable", error);
            return undefined;
          });
          if (disposed || editorLifetime.signal.aborted) {
            runtimeDebug?.destroy();
            runtimeDebug = undefined;
            return;
          }
          debugSidebar = new PlanningSeedDebugSidebar({
            host: shell,
            camera,
            navigation,
            orbit,
            sampleHeight,
            beforeCameraMove: () => {
              returnFromMasonry();
            },
            returnToPlanning: () => {
              void source!
                .save()
                .then(() => dispose())
                .then(() => {
                  const url = new URL(location.href);
                  url.searchParams.delete("view");
                  location.assign(url.href);
                })
                .catch((error) => {
                  if (disposed) closeFailure(error);
                  else progress(1, "工程保存失败：" + String(error));
                });
            }
          });
          const latestPlan = publication?.current?.plan ?? activePlan;
          if (latestPlan) debugSidebar.synchronize(latestPlan);
          const bookmark = publication?.current?.playerBookmark;
          if (bookmark && !perfTourRunning && !autoBenchRequested && !autoAblateRequested && !restoreMasonryView) {
            debugSidebar.restoreCameraMode(bookmark.mode);
          }
          if (obbDebug) debugSidebar.mountObbControl(obbDebug.button);
          if (!autoBenchRequested && !autoAblateRequested && !perfTourRunning && !restoreMasonryView) {
            debugSidebar.setInputEnabled(ready && assistantInputEnabled && !lassoFrozen);
          }
          const captureMasonryView = () => {
            if (!restoreMasonryView) {
              const position = camera.entity.transform.worldPosition.clone(),
                rotation = camera.entity.transform.worldRotationQuaternion.clone();
              const orthographic = camera.isOrthographic,
                size = camera.orthographicSize;
              restoreMasonryView = () => {
                orbit.enabled = false;
                camera.isOrthographic = orthographic;
                camera.orthographicSize = size;
                camera.entity.transform.worldPosition = position;
                camera.entity.transform.worldRotationQuaternion = rotation;
                debugSidebar?.restoreCameraMode("roam");
                navigation.enabled = ready && !disposed;
                navigation.setInputEnabled(ready && !disposed);
                navigation.setGroundCollision(true);
                navigation.synchronizeView();
              };
            }
          };
          const buildingWaterSample = createWaterSurfaceSample();
          const focusBuilding = (position: Vector3, forward?: Vector3) => {
            captureMasonryView();
            navigation.enabled = false;
            navigation.setInputEnabled(false);
            navigation.setGroundCollision(false);
            camera.isOrthographic = false;
            if (forward) {
              camera.entity.transform.setWorldPosition(
                position.x + forward.x * 8,
                position.y + 3,
                position.z + forward.z * 8
              );
              orbit.target.copyFrom(position);
            } else {
              camera.entity.transform.setWorldPosition(
                position.x + 12,
                Math.max(position.y, sampleHeight(position.x, position.z) ?? 0) + 9,
                position.z + 15
              );
              orbit.target.set(
                position.x,
                Math.max(position.y, sampleHeight(position.x, position.z) ?? 0) + 3,
                position.z
              );
            }
            camera.entity.transform.lookAt(orbit.target);
            debugSidebar?.restoreCameraMode("orbit");
            orbit.enabled = true;
          };
          const buildingPlacement = {
            anchors: () => {
              const current = publication?.current;
              if (!current) throw Error("Seed 地形尚未发布");
              return masonryPlacementAnchors(current, camera.entity.transform.worldPosition);
            },
            land: {
              sampleHeight: (x: number, z: number) => {
                const current = publication?.current;
                if (!current) throw Error("Seed 地形尚未发布");
                return sampleSeedWorldHeight(current.data.fields, x, z);
              },
              isWater: (x: number, z: number) => {
                return !!water?.sampleSurface(x, z, buildingWaterSample) && buildingWaterSample.waterDepth > 0;
              }
            },
            appearanceEngine: engine
          };
          if (runtimeDebug) {
            runtimeDebug.attachNativeComponentPanels({
              mountWater: (container) => mountNativeWaterPanel(runtimeProject!, nativeEditor!, { container }),
              mountBuilding: (container) =>
                mountNativeBuildingPanel(runtimeProject!, nativeEditor!, focusBuilding, returnFromMasonry, {
                  ...buildingPlacement,
                  container
                })
            });
          } else {
            nativeWaterPanel = mountNativeWaterPanel(runtimeProject!, nativeEditor!);
            nativeBuildingPanel = mountNativeBuildingPanel(
              runtimeProject!,
              nativeEditor!,
              focusBuilding,
              returnFromMasonry,
              buildingPlacement
            );
          }
        } catch (error) {
          if (!disposed) {
            console.warn("[seed-world-planner] deferred debug panels failed", error);
          }
        }
      })();
    }
    // The world is already visible and navigable. Keep post-ready GPU compilation non-blocking:
    // 1. Mount the screenshot/lasso entry immediately without eagerly compiling pick/photo/orthographic
    //    overlay shaders (which are prepared on first camera/lasso/AI capture demand unless `agentTrace=1`).
    // 2. Keep `pickPreparation` paused during exploration `bgWarmupDone` so offscreen exploration warmup
    //    never doubles variant count with `RENDERER_WORLD_PICK` clones.
    // 3. Pace `bgWarmupDone` with low concurrency, inter-frame cooldowns, GPU backpressure backoff, and
    //    pointer/touch interaction deferral so mobile frame times stay responsive.
    const photoPreparationStarted = performance.now();
    canvas.dataset.photoPreparation = "loading";
    const preparingPicker = worldPicker,
      preparingPicks = pickPreparation,
      preparingViews = viewSnapshots;
    const preparingTools = tools;
    const eagerCapturePathWarmup = pageUrl.searchParams.get("agentTrace") === "1";
    const capturePathWarmup = eagerCapturePathWarmup
      ? (async () => {
          if (disposed || editorLifetime.signal.aborted) return;
          await timed("pickPreparation.flush #1", () => preparingPicks.flush(editorLifetime.signal));
          await timed("worldPicker.prepareSnapshot", () =>
            preparingPicker.prepareSnapshot(
              (visitor) => snapshotPicks.visit(visitor),
              editorLifetime.signal,
              preparingViews.budget
            )
          );
          canvas.dataset.snapshotWarmupMs = String(performance.now() - photoPreparationStarted);
        })()
      : Promise.resolve();
    // A failed warm-up does not block captures: a capture runs the same path and reports its own error.
    snapshotWarmup = capturePathWarmup.then(
      () => {},
      () => {}
    );
    const bgWarmupDone: Promise<void> =
      (deferredShaderVariants.length > 0 || collectDeferredVariants) && !disposed
        ? new Promise<void>((resolve) => {
            const initialVariantsToWarm = deferredShaderVariants;
            const deferredCollector = collectDeferredVariants;
            deferredShaderVariants = [];
            collectDeferredVariants = undefined;
            const parallelBgWarmup = Boolean(startupWarmupReport?.parallelCompileSupported);
            const isTouchMobile =
              typeof window !== "undefined" &&
              ("ontouchstart" in window || (typeof navigator !== "undefined" && (navigator.maxTouchPoints ?? 0) > 0));
            let idleWarmupTimer: number | undefined;
            let lastInteractionAt = 0;
            const activePointers = new Set<number>();
            let activeTouches = 0;
            const noteInteraction = () => {
              lastInteractionAt = performance.now();
            };
            const onPointerDown = (event: PointerEvent) => {
              activePointers.add(event.pointerId);
              noteInteraction();
            };
            const onPointerMove = (event: PointerEvent) => {
              if (event.buttons !== 0 || activePointers.has(event.pointerId)) noteInteraction();
            };
            const onPointerUp = (event: PointerEvent) => {
              activePointers.delete(event.pointerId);
              noteInteraction();
            };
            const onTouchChange = (event: TouchEvent) => {
              activeTouches = event.touches.length;
              noteInteraction();
            };
            const resetActiveInputs = () => {
              activePointers.clear();
              activeTouches = 0;
            };
            const onVisibilityChange = () => {
              if (document.hidden) resetActiveInputs();
            };
            const listenerOptions: AddEventListenerOptions = { capture: true, passive: true };
            window.addEventListener("pointerdown", onPointerDown, listenerOptions);
            window.addEventListener("pointermove", onPointerMove, listenerOptions);
            window.addEventListener("pointerup", onPointerUp, listenerOptions);
            window.addEventListener("pointercancel", onPointerUp, listenerOptions);
            window.addEventListener("touchstart", onTouchChange, listenerOptions);
            window.addEventListener("touchmove", onTouchChange, listenerOptions);
            window.addEventListener("touchend", onTouchChange, listenerOptions);
            window.addEventListener("touchcancel", onTouchChange, listenerOptions);
            window.addEventListener("wheel", noteInteraction, listenerOptions);
            window.addEventListener("keydown", noteInteraction, listenerOptions);
            window.addEventListener("blur", resetActiveInputs);
            document.addEventListener("visibilitychange", onVisibilityChange);
            const detachInteraction = () => {
              window.removeEventListener("pointerdown", onPointerDown, true);
              window.removeEventListener("pointermove", onPointerMove, true);
              window.removeEventListener("pointerup", onPointerUp, true);
              window.removeEventListener("pointercancel", onPointerUp, true);
              window.removeEventListener("touchstart", onTouchChange, true);
              window.removeEventListener("touchmove", onTouchChange, true);
              window.removeEventListener("touchend", onTouchChange, true);
              window.removeEventListener("touchcancel", onTouchChange, true);
              window.removeEventListener("wheel", noteInteraction, true);
              window.removeEventListener("keydown", noteInteraction, true);
              window.removeEventListener("blur", resetActiveInputs);
              document.removeEventListener("visibilitychange", onVisibilityChange);
              resetActiveInputs();
            };
            const isBgWarmupPaused = () =>
              perfTourRunning ||
              lassoFrozen ||
              activePointers.size > 0 ||
              activeTouches > 0 ||
              (lastInteractionAt > 0 && performance.now() - lastInteractionAt < 1500);
            const onAbort = () => {
              if (idleWarmupTimer !== undefined) window.clearTimeout(idleWarmupTimer);
              detachInteraction();
              resolve();
            };
            editorLifetime.signal.addEventListener("abort", onAbort, { once: true });
            void snapshotWarmup!.then(() => {
              if (disposed || editorLifetime.signal.aborted) {
                editorLifetime.signal.removeEventListener("abort", onAbort);
                detachInteraction();
                resolve();
                return;
              }
              const startBgWarmup = () => {
                idleWarmupTimer = undefined;
                if (disposed || editorLifetime.signal.aborted) {
                  editorLifetime.signal.removeEventListener("abort", onAbort);
                  detachInteraction();
                  resolve();
                  return;
                }
                if (isBgWarmupPaused()) {
                  idleWarmupTimer = window.setTimeout(startBgWarmup, 500);
                  return;
                }
                void (async () => {
                  const collected = deferredCollector ? await deferredCollector() : [];
                  const variantsToWarm = [...initialVariantsToWarm, ...collected];
                  if (disposed || editorLifetime.signal.aborted || variantsToWarm.length === 0) return;
                  shaderAudit?.recordWarmupRequested(startupAttempted, variantsToWarm.length);
                  const bgReport = await warmupSeedWorldShaderVariants(engine!, variantsToWarm, {
                    strict: false,
                    signal: editorLifetime.signal,
                    preserveOrder: true,
                    frameBudgetMilliseconds: isTouchMobile ? 6 : 8,
                    maximumPendingPrograms: parallelBgWarmup ? (isTouchMobile ? 4 : 12) : isTouchMobile ? 1 : 2,
                    cooldownFrames: isTouchMobile ? 1 : 0,
                    maxFrameIntervalMs: isTouchMobile ? 65 : 80,
                    backoffMilliseconds: isTouchMobile ? 250 : 120,
                    isPaused: isBgWarmupPaused,
                    ssrVerifyReceiverDepth
                  });
                  if (!disposed) {
                    seedWorldBootTrace.setMeta({
                      bgWarmup: {
                        requested: bgReport.requested,
                        compiled: bgReport.compiled,
                        elapsedMs: Math.round(bgReport.elapsedMilliseconds),
                        longestVariantMs: Math.round(bgReport.longestVariantMilliseconds),
                        completedAtMs: Math.round(performance.now())
                      }
                    });
                    seedWorldBootTrace.event(
                      "info",
                      "shader-warmup-bg",
                      `compiled ${bgReport.compiled}/${bgReport.requested} deferred variants in ${Math.round(bgReport.elapsedMilliseconds)}ms`,
                      `longest=${Math.round(bgReport.longestVariantMilliseconds)}ms parallelCompile=${parallelBgWarmup}`
                    );
                  }
                })()
                  .catch(() => {})
                  .finally(() => {
                    editorLifetime.signal.removeEventListener("abort", onAbort);
                    detachInteraction();
                    resolve();
                  });
              };
              idleWarmupTimer = window.setTimeout(startBgWarmup, isTouchMobile ? 1200 : 400);
            });
          })
        : Promise.resolve();
    if (perfTourParam && !disposed) {
      const waitBg = pageUrl.searchParams.get("perfTourWaitBg") === "1";
      const scheduleTour = () => {
        if (disposed) return;
        perfTourTimer = window.setTimeout(() => {
          perfTourTimer = undefined;
          if (!disposed) void startPerfTour();
        }, 600);
      };
      if (waitBg) void bgWarmupDone.then(scheduleTour);
      else scheduleTour();
    }
    if ((autoBenchRequested || autoAblateRequested) && perfPanel && !disposed) {
      const benchPerfPanel = perfPanel;
      void import("./src/SeedWorldAutoBench.ts").then(
        ({ parseAutoAblateFlag, parseAutoBenchSeconds, startSeedWorldAutoBench }) => {
          if (disposed || editorLifetime.signal.aborted) return;
          const durationSec = parseAutoBenchSeconds(pageUrl.searchParams) ?? 20;
          const autoAblate = parseAutoAblateFlag(pageUrl.searchParams);
          const benchWaterSample = createWaterSurfaceSample();
          autoBenchHandle = startSeedWorldAutoBench({
            durationSec,
            camera,
            navigation,
            bgWarmupDone,
            readPlan: () => source?.session.result?.plan,
            sampleHeight,
            isWater: (x, z) => Boolean(water?.sampleSurface(x, z, benchWaterSample) && benchWaterSample.waterDepth > 0),
            runCapture: (trigger, durationMs, runOptions) =>
              benchPerfPanel.runTimedCapture(trigger, durationMs, runOptions),
            ablate: {
              autoStart: autoAblate,
              canvas,
              setModule: (key, on) => benchPerfPanel.setModuleEnabled(key, on),
              getModule: (key) => benchPerfPanel.isModuleEnabled(key),
              setSubGroup: (group, on) => benchPerfPanel.setSubGroupVisible(group, on),
              getSubGroup: (group) => benchPerfPanel.isSubGroupVisible(group),
              setDpr: (dpr) => benchPerfPanel.setDpr(dpr),
              getDpr: () => benchPerfPanel.getDpr(),
              readCounters: (out) => benchPerfPanel.readCumulativeCounters(out)
            },
            signal: editorLifetime.signal
          });
        }
      );
    }
    if (bootTraceParam) {
      void seedWorldBootTrace.reportToDiag("ready");
      const postReadyDelay = new Promise<void>((resolve) => {
        const timer = window.setTimeout(resolve, 3500);
        editorLifetime.signal.addEventListener(
          "abort",
          () => {
            window.clearTimeout(timer);
            resolve();
          },
          { once: true }
        );
      });
      void Promise.all([bgWarmupDone, postReadyDelay]).then(() => {
        if (!disposed && !editorLifetime.signal.aborted) {
          void seedWorldBootTrace.reportToDiag("post-ready");
        }
      });
    }
    void (async () => {
      const [, { SeedWorldLassoPanel }] = await Promise.all([
        capturePathWarmup,
        import("./src/SeedWorldLassoPanel.ts")
      ]);
      if (disposed) return;
      const preparingLasso = (lassoPanel = new SeedWorldLassoPanel(
        preparingViews,
        (frozen) => {
          lassoFrozen = frozen;
          const enabled = ready && !disposed && assistantInputEnabled && !frozen;
          if (restoreMasonryView) {
            orbit.enabled = enabled;
            navigation.enabled = false;
            navigation.setInputEnabled(false);
          } else if (debugSidebar) debugSidebar.setInputEnabled(enabled);
          else {
            navigation.enabled = enabled;
            navigation.setInputEnabled(enabled);
          }
        },
        { engine: engine!, canvas, worldCamera: camera }
      ));
      if (eagerCapturePathWarmup) {
        await timed("lassoPanel.prepare", () => preparingLasso.prepare());
        await timed("farmingInteraction.prepare", () => farmingHost?.runtime?.prepareInteraction());
        await timed("pickPreparation.flush #2", () => preparingPicks.flush(editorLifetime.signal));
      } else {
        // Preload lightweight markup UI + capture blit shaders shortly after world ready (without waiting
        // behind 70+ offscreen exploration shaders), then drain deferred pick shaders once bgWarmupDone settles.
        const earlyPrewarmTimer = window.setTimeout(() => {
          if (disposed || editorLifetime.signal.aborted) return;
          if (autoBenchRequested || autoAblateRequested || perfTourParam) return;
          void Promise.all([
            preparingLasso.prewarm(),
            preparingPicker.prewarmShaders(editorLifetime.signal).catch(() => undefined)
          ]);
        }, 200);
        editorLifetime.signal.addEventListener("abort", () => window.clearTimeout(earlyPrewarmTimer), { once: true });
        void bgWarmupDone.then(async () => {
          if (disposed || editorLifetime.signal.aborted) return;
          if (autoBenchRequested || autoAblateRequested || perfTourParam) {
            await preparingLasso.prewarm();
            return;
          }
          preparingPicks.resume();
        });
      }
      if (disposed) return;
      if (showAssistant)
        preparingTools.assistant!.mountScreenshotButton(preparingLasso.button, canvas, (x, top, visible) =>
          preparingLasso.setAttachmentAnchor(x, top, visible)
        );
      canvas.dataset.photoPreparationMs = String(performance.now() - photoPreparationStarted);
      canvas.dataset.photoPreparation = "ready";
    })().catch((error) => {
      if (disposed) return;
      canvas.dataset.photoPreparation = "error";
      canvas.dataset.photoPreparationError = String(error);
      console.warn("[seed-world-planner] photo preparation failed", error);
    });
  } catch (error) {
    seedWorldBootTrace.fail(error);
    if (bootTraceParam) {
      void seedWorldBootTrace.reportToDiag("error");
    }
    stopSmoothLoading();
    canvas.dataset.status = "error";
    canvas.dataset.error = String(error);
    loading.dataset.state = "error";
    percent.value = "世界加载失败";
    loading.setAttribute("aria-label", String(error));
    retry.hidden = false;
    retry.style.pointerEvents = "auto";
    await dispose().catch(closeFailure);
    throw error;
  }
}

function requiredComponent<T extends Component>(
  roots: readonly Entity[],
  type: new (entity: Entity) => T,
  name: string
): T {
  for (const root of roots) {
    const found: T[] = [];
    root.getComponentsIncludeChildren(type, found);
    const component = found[0];
    if (component) return component;
  }
  throw new Error(`Seed scene missing ${name}`);
}
class SeedDemoFrame extends Script {
  tick: (dt: number) => void = () => {};
  lateTick: () => void = () => {};
  override onLateUpdate(): void {
    this.lateTick();
  }
  override onUpdate(dt: number): void {
    this.tick(dt);
  }
}

/** Saved planner presentation components use the same real lighting/post-process owners. */
async function applyPresentation(
  session: import("@galacean/engine-world-planning/spatial/PlanningSession").PlanningSession,
  lightingProfile: PlanningLightingProfileRuntime,
  post: TerrainPostProcessRuntime,
  resetPostProcess: () => void,
  components = session.inspect("world").components
): Promise<void> {
  resetPostProcess();
  const light = components.find((component) => component.type === "lighting")?.values;
  if (light) {
    if (!(await lightingProfile.apply(light))) return;
  }
  const settings = components.find((component) => component.type === "postProcess");
  if (settings) {
    const { values: p, sources } = settings;
    post.setProfileEnabled(Boolean(p.enabled));
    post.setColorAdjustmentsEnabled(p.colorAdjustments !== false);
    post.setTonemappingEnabled(Boolean(p.tonemapping));
    if (sources.postExposure?.length) post.setPostExposure(Number(p.postExposure));
    if (sources.temperature?.length) post.setTemperature(Number(p.temperature));
    if (sources.contrast?.length) post.setContrast(Number(p.contrast));
    if (sources.saturation?.length) post.setSaturation(Number(p.saturation));
    post.setBloomEnabled(Boolean(p.bloom));
    if (sources.bloomThreshold?.length) post.setBloomThreshold(Number(p.bloomThreshold));
    if (sources.bloomIntensity?.length) post.setBloomIntensity(Number(p.bloomIntensity));
    if (sources.bloomScatter?.length) post.setBloomScatter(Number(p.bloomScatter));
    const templateId = session.document.entities.world.components.worldTemplate?.values.id;
    const templateVolumetricDefault =
      typeof templateId === "string"
        ? Boolean(WORLD_TEMPLATE_ART[templateId]?.postProcess?.volumetricLight)
        : false;
    post.setVolumetricLightEnabled(
      sources.volumetricLight?.length ? Boolean(p.volumetricLight) : templateVolumetricDefault
    );
  }
}

interface CameraSubmissionWindow {
  startMs: number;
  endMs: number;
  renderStartMs?: number;
  renderEndMs?: number;
  stages?: Record<string, { calls: number; ms: number }>;
  shaderVariants?: SeedWorldShaderVariantEntry[];
}

/** Debug-only callback and public camera.render windows; neither is a GPU timer. */
class SeedCameraSubmissionProbe extends Script {
  report?: (window: CameraSubmissionWindow) => void;
  private window?: CameraSubmissionWindow;
  private camera?: Camera;
  private originalRender?: Camera["render"];
  private measuredRender?: Camera["render"];
  private restoreStages: (() => void)[] = [];
  private snapshotVariant = createSeedWorldShaderVariantSnapshotter();

  attach(camera: Camera): void {
    this.camera = camera;
    const original = (this.originalRender = camera.render);
    const probe = this;
    this.measuredRender = function (...args: Parameters<Camera["render"]>): void {
      const window = probe.window;
      if (window) window.renderStartMs = performance.now();
      try {
        original.apply(this, args);
      } finally {
        if (window) window.renderEndMs = performance.now();
      }
    };
    camera.render = this.measuredRender;
    // Runtime method names are verified against this engine checkout. Missing
    // methods simply omit the diagnostic; they never change rendering behavior.
    const pipeline = (camera as unknown as Record<string, unknown>)._renderPipeline as
      | Record<string, unknown>
      | undefined;
    if (!pipeline) return;
    this.measureStage(ShaderPass.prototype, "_getShaderProgram", "shaderProgram");
    this.measureStage(ShaderPass.prototype, "_compileShaderProgram", "shaderCompile");
    this.measureStage(ShaderPass.prototype, "_compileShaderSource", "shaderSource");
    const hardware = (camera.engine as unknown as Record<string, unknown>)._hardwareRenderer as
      | Record<string, unknown>
      | undefined;
    const gl = hardware?.gl;
    for (const method of [
      "compileShader",
      "linkProgram",
      "getShaderParameter",
      "getProgramParameter",
      "getActiveUniform",
      "getUniformLocation",
      "getActiveAttrib"
    ]) {
      this.measureStage(gl, method, `gl.${method}`);
    }
    this.measureStage(pipeline, "_prepareRender", "prepare");
    this.measureStage(pipeline, "_drawRenderPass", "draw");
    this.measureStage(pipeline._cullingResults, "sortBatch", "sortBatch");
    this.measureStage(pipeline._cascadedShadowCasterPass, "onRender", "shadow");
    this.measureStage(
      (camera.engine as unknown as Record<string, unknown>)._batcherManager,
      "uploadBuffer",
      "batchUpload"
    );
  }

  private measureStage(target: unknown, method: string, stage: string): void {
    if (!target || typeof target !== "object") return;
    const owner = target as Record<string, unknown>;
    const original = owner[method];
    if (typeof original !== "function") return;
    const probe = this;
    const measured = function (this: unknown, ...args: unknown[]): unknown {
      const window = probe.window;
      if (!window) return original.apply(this, args);
      const start = performance.now();
      try {
        return original.apply(this, args);
      } finally {
        const stages = (window.stages ??= {});
        const entry = (stages[stage] ??= { calls: 0, ms: 0 });
        entry.calls++;
        entry.ms += performance.now() - start;
        if (stage === "shaderCompile") {
          try {
            const variant = probe.snapshotVariant(this as ShaderPass, args[1] as ShaderMacroCollection);
            if (variant) {
              const variants = (window.shaderVariants ??= []);
              if (variants.length < 64) variants.push(variant);
            }
          } catch {
            /* Diagnostics cannot alter rendering success or errors. */
          }
        }
      }
    };
    owner[method] = measured;
    this.restoreStages.push(() => {
      if (owner[method] === measured) owner[method] = original;
    });
  }

  onBeginRender(): void {
    this.window = { startMs: performance.now(), endMs: 0 };
  }

  onEndRender(): void {
    const window = this.window;
    this.window = undefined;
    if (window) {
      window.endMs = performance.now();
      this.report?.(window);
    }
  }

  onDestroy(): void {
    for (const restore of this.restoreStages.splice(0)) restore();
    const camera = this.camera;
    if (camera && camera.render === this.measuredRender && this.originalRender) {
      camera.render = this.originalRender;
    }
    this.camera = undefined;
    this.originalRender = this.measuredRender = undefined;
    this.window = undefined;
  }
}
