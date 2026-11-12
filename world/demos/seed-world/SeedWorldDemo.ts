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
import { readRockGenerationProfile } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/GenerationProfile";
import {
  rockGrassExclusions,
  rockGrassWaterTest
} from "@galacean/engine-world-planning/integrations/terrain/rock-formation/GrassExclusions";
import { rockFormationPlacements } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/Placement";
import {
  canPublishRockFormationEdit,
  prepareRockFormationPublication,
  prepareRockMaterialPublication
} from "@galacean/engine-world-planning/integrations/terrain/rock-formation/Publication";
import {
  masonryPlacementAnchors,
  masonryTerrainSource
} from "@galacean/engine-world-planning/masonry/MasonryPlacement";
import { sameMasonryPlan } from "@galacean/engine-world-planning/masonry/MasonryPlanningOwnership";
import {
  NativeBuildingHost,
  type NativeBuildingWorld
} from "@galacean/engine-world-planning/masonry/NativeBuildingHost";
import { mountNativeBuildingPanel } from "@galacean/engine-world-planning/masonry/NativeBuildingPanel";
import type { IslandPlan } from "@galacean/engine-world-planning/semantic-study/IslandPlanModel";
import { worldTemplate } from "@galacean/engine-world-planning/spatial/WorldTemplateCatalog";
import { readAnimalPopulationConfig } from "@galacean/engine-world-planning/spatial/AnimalPopulationComponent";
import { planningFarmInitializationRequest } from "@galacean/engine-world-planning/spatial/farming/PlanningFarmInitialization";
import { planningWaterQueryProjection } from "@galacean/engine-world-planning/spatial/hydrology/PlanningWaterEdits";
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
import { createNativeWaterAgentPackage } from "@galacean/engine-world-planning/spatial/runtime/NativeWaterAgent";
import { NativeWaterEditor } from "@galacean/engine-world-planning/spatial/runtime/NativeWaterEditor";
import { NativeWaterHost } from "@galacean/engine-world-planning/spatial/runtime/NativeWaterHost";
import { PlanningLightingProfileRuntime } from "@galacean/engine-world-planning/spatial/runtime/PlanningLightingProfileRuntime";
import { planningNaturalGroundPopulation } from "@galacean/engine-world-planning/spatial/runtime/PlanningNaturalVegetation";
import {
  PlanningNaturalVegetationRuntime,
  planningNaturalGrassDensity
} from "@galacean/engine-world-planning/spatial/runtime/PlanningNaturalVegetationRuntime";
import { planningPresentedSolids } from "@galacean/engine-world-planning/spatial/runtime/PlanningPresentedSolids";
import {
  planningWaterPublicationGate,
  preparePlanningWaterImpact
} from "@galacean/engine-world-planning/spatial/runtime/PlanningWaterPublication";
import { visitPlanningWorldPickBatches } from "@galacean/engine-world-planning/spatial/runtime/PlanningWorldPicking";
import { SeedWorldPicker } from "@galacean/engine-world-planning/world/SeedWorldPicker";
import { SeedWorldViewSnapshots } from "@galacean/engine-world-planning/world/SeedWorldViewSnapshot";
import { buildingInitializationInputs } from "./masonry/BuildingInitializationInputs.ts";
import { buildingScenePreparation, initializeBuildingScene } from "./masonry/BuildingSceneInitialization.ts";
import type { SeedWorldPickVisitor } from "@galacean/engine-modify/rendering/SeedWorldPickBatch";
import { bindWorldClickInput } from "./src/SeedWorldClickInput.ts";
import { waitForSnapshotWarmup } from "./src/SeedWorldSnapshotWarmup.ts";
import { openSeedWorldProject } from "./SeedWorldProject.ts";
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
import { PlanningEntityAuthoring } from "./src/planning/spatial/runtime/PlanningAuthoringComponents.ts";
import {
  planningVegetationReferences,
  validatePlanningSource
} from "./src/planning/spatial/runtime/PlanningProjectSource.ts";
import { PlanningProjectStorage } from "./src/planning/spatial/runtime/PlanningProjectStorage.ts";
import { selectPlanningSpawnView, type PlanningSpawnView } from "./src/planning/spatial/runtime/PlanningSpawnView.ts";
import { preparePlanningWaterSource } from "./src/planning/spatial/runtime/PlanningWaterInitialization.ts";
import { SeedWorldInstantCamera } from "./src/SeedWorldInstantCamera.ts";
import { SeedWorldLassoPanel } from "./src/SeedWorldLassoPanel.ts";

import {
  AssetType,
  Camera,
  DirectLight,
  FogMode,
  ShadowType,
  Matrix,
  Quaternion,
  Ray,
  Scene,
  Script,
  ShaderMacroCollection,
  ShaderPass,
  Vector2,
  Vector3,
  WebGLEngine,
  WebGLMode,
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
  applyAutomaticScreenSpaceReflectionConfiguration
} from "@galacean/engine-terrain/terrain/debug/TerrainScreenSpaceReflectionPanel";
import { registerTerrainProjectResources } from "@galacean/engine-terrain/terrain/loader/TerrainSceneLoader";
import { WorldBubbleLoadingScene } from "@galacean/engine-terrain/terrain/loading/WorldBubbleLoadingScene";
import { TerrainNavigationRuntime } from "@galacean/engine-terrain/terrain/project/TerrainNavigationRuntime";
import { TerrainPostProcessRuntime } from "@galacean/engine-terrain/terrain/project/TerrainPostProcessRuntime";
import { TerrainWindRuntime } from "@galacean/engine-terrain/terrain/project/TerrainWindRuntime";
import { OrbitControl } from "@galacean/engine-toolkit-controls/dist/es/OrbitControl.js";
import { SEED_WORLD_PRODUCTION_ASSET_CATALOG } from "@galacean/engine-vegetation/asset-assembly/SeedWorldProductionAssetCatalog";
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
import { prepareRockTextures } from "@galacean/engine-world-planning/integrations/terrain/rock-formation/RockMaterial";
import {
  readRockFormationSettings,
  rockGeometrySettings
} from "@galacean/engine-world-planning/integrations/terrain/rock-formation/Settings";
import { PLANNING_REFERENCE } from "@galacean/engine-world-planning/planning-data/PlanningReference";
import { sampleSeedWorldHeight } from "@galacean/engine-world-planning/runtime/SeedWorldFields";
import {
  SEED_WORLD_ROAD_COLOR_DEFAULT,
  SEED_WORLD_SURFACE_LOD_CROSS_FADE_DURATION_SECONDS,
  SeedWorldTerrainRuntime
} from "@galacean/engine-world-planning/runtime/SeedWorldTerrainRuntime";
import { planningAlphamap } from "@galacean/engine-world-planning/semantic-study/PlanningAlphamap";
import { planningHeightmap } from "@galacean/engine-world-planning/semantic-study/PlanningHeightmap";
import { PlanningRasterClient } from "@galacean/engine-world-planning/semantic-study/PlanningRasterClient";
import type { PlanningSessionOptions } from "@galacean/engine-world-planning/spatial/PlanningSession";
import {
  PlanningPlayerState,
  planningPlayerCameraPose,
  restorePlanningPlayerBookmark,
  type PlanningPlayerCameraPose
} from "@galacean/engine-world-planning/spatial/runtime/PlanningPlayerState";
import { worldTemplateStreetPuddles } from "@galacean/engine-world-planning/spatial/WorldTemplateStreet";
import { preparePlanningPopulationResources } from "@galacean/engine-world-planning/spatial/runtime/PlanningPopulationRuntime";
import { PlanningSeedScenePublication } from "@galacean/engine-world-planning/spatial/runtime/PlanningSeedScenePublication";
import { createPlanningSeedSolids } from "@galacean/engine-world-planning/spatial/runtime/PlanningSeedSolids";
import {
  preparePlanningSeedWorldData,
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
  resolveWorldTemplateStreetView,
  resolveWorldTemplateView
} from "@galacean/engine-world-planning/spatial/WorldTemplateView";
import { SeedWorldAudioRuntime } from "@galacean/engine-world-planning/world/SeedWorldAudioRuntime";
import {
  resolveSeedWorldCameraAngles,
  resolveSeedWorldCameraForward
} from "@galacean/engine-world-planning/world/SeedWorldCameraBookmark";
import {
  createSeedWorldShaderVariantSnapshotter,
  warmupSeedWorldRendererVariants,
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

/** Original Seed scene/HUD/gameplay host. The spatial planner supplies data, never its preview camera. */
export async function mountSeedWorldDemo(
  handoff?: PlanningWorldHandoff,
  options: {
    showAssistant?: boolean;
    persistPlayerState?: boolean;
    assetSources?: readonly ProjectFileProvider[];
    retrievalManifestUrl?: string;
  } = {}
): Promise<void> {
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
  let source: Awaited<ReturnType<typeof createPlanningWorldSource>> | undefined;
  let sourceTask: ReturnType<typeof createPlanningWorldSource> | undefined;
  let publication: PlanningSeedScenePublication | undefined;
  let sandstorm: Entity | undefined;
  let mojaveLayout: Entity | undefined;
  const readWorld = () => publication?.current?.world;
  const readPublished = () => {
    const current = publication?.current;
    return current
      ? {
          plan: current.data.plan,
          fields: current.heightTransition?.fields ?? current.data.fields,
          world: current.world,
          vegetation: current.vegetation,
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
  let tools: PlanningSeedWorldSession | undefined;
  let animals: PlanningAnimalHost | undefined;
  let detachAnimalLightning: (() => void) | undefined;
  let farmingHost: PlanningFarmingHost | undefined;
  let unregisterFarmingActivation: (() => void) | undefined;

  let audio: SeedWorldAudioRuntime | undefined;
  let playerState: PlanningPlayerState | undefined;
  let obbDebug: PlanningSeedObbDebug | undefined;
  let runtimeDebug: PlanningSeedRuntimeDebug | undefined;
  let debugSidebar: PlanningSeedDebugSidebar | undefined;
  let exposure: TerrainWindGpuExposureProvider | undefined;
  let detachWindExposure: (() => void) | undefined;
  let resizeObserver: ResizeObserver | undefined;
  let nativeBuildingHost: NativeBuildingHost | undefined;
  let nativeBuildingPanel: ReturnType<typeof mountNativeBuildingPanel> | undefined;
  let nativeWaterHost: NativeWaterHost | undefined;
  let nativeWaterEditor: NativeWaterEditor | undefined;
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
  let pickPreparation: RuntimePickPreparation | undefined;
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
  const rockFormations = new RockFormationClient(pageUrl.searchParams.get("rockUnion") === "1");
  let rockNavigation: RockNavigation | undefined;
  const bootPhases: { phase: string; startMs: number }[] = [];
  const traceBootPhase = (phase: string) => {
    if (pageUrl.searchParams.get("agentTrace") !== "1") return;
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
  const traceBootSpans = pageUrl.searchParams.get("agentTrace") === "1";
  const recordBootSpan = (name: string, startMs: number) => {
    if (!traceBootSpans) return;
    const endMs = performance.now();
    bootSpans.push({ name, startMs, endMs });
    performance.measure(`seed-boot:${name}`, { start: startMs, end: endMs });
    canvas.dataset.bootSpans = JSON.stringify({
      timeOrigin: performance.timeOrigin,
      entries: bootSpans
    });
  };
  const timed = <T>(name: string, work: () => T): T => {
    if (!traceBootSpans) return work();
    const startMs = performance.now();
    const end = () => recordBootSpan(name, startMs);
    let result: T;
    try {
      result = work();
    } catch (error) {
      end();
      throw error;
    }
    if (result instanceof Promise) return result.finally(end) as T;
    end();
    return result;
  };
  const progress = (value: number, stage: string) => {
    traceBootPhase(stage);
    percent.value = `${Math.round(value * 100)}%`;
    loading.setAttribute("aria-label", stage);
    canvas.dataset.bootPhase = stage;
    orb?.setProgress(value);
  };
  let disconnectEditorAssets: (() => void) | undefined;
  // Consumers must release overlays and subscriptions while their world still exists.
  // Advance only after success, so a release retry cannot destroy an earlier owner twice.
  const runtimeReleaseSteps: readonly [string, () => unknown][] = [
    [
      "编辑入口",
      () => {
        disposed = true;
        ready = false;
        editorLifetime.abort();
        unmountProjectSave?.();
        unmountProjectSave = undefined;
        pickPreparation?.dispose();
        runtimeDebug?.destroy();
        unregisterFarmingActivation?.();
        nativeWaterHost?.dispose();
      }
    ],
    ["农场宿主", () => farmingHost?.dispose()],
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
    ["动物", () => animals?.dispose()],
    ["玩家状态", () => playerState?.dispose()],
    [
      "编辑器",
      () => {
        lightingProfile?.dispose();
        debugSidebar?.destroy();
        disconnectEditorAssets?.();
        tools?.dispose();
        nativeBuildingPanel?.destroy();
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
    ["沙雾", () => sandstorm?.destroy()],
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
      await nativeWaterEditor?.stop();
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
    engine = await WebGLEngine.create({
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
      shaderCompiler: new ShaderCompiler(),
      graphicDeviceOptions: { webGLMode: WebGLMode.WebGL2 }
    });
    pickPreparation = new RuntimePickPreparation(engine);
    engine.sceneManager.activeScene!?.destroy();
    const resize = () => {
      if (!canvas.clientWidth || !canvas.clientHeight) return;
      // Keep the view's aspect ratio and small-screen pixel density, but bound
      // HDR, bloom and reflection render targets on large Retina displays.
      const dpr = Math.min(
        window.devicePixelRatio || 1,
        Math.sqrt(PLANNING_RUNTIME_OPTIONS.maxRenderPixels / (canvas.clientWidth * canvas.clientHeight))
      );
      engine!.canvas.setResolution(
        Math.max(1, Math.floor(canvas.clientWidth * dpr)),
        Math.max(1, Math.floor(canvas.clientHeight * dpr))
      );
      orb?.resize();
    };
    resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(canvas);
    resize();
    engine.run();
    traceBootPhase("loadingScene");
    orb = await WorldBubbleLoadingScene.createInEngine(engine);
    loading.dataset.state = "loading";
    progress(0.04, "准备 Seed 场景");
    const projectUrl = new URL(SEED_WORLD_PRODUCTION_ASSET_CATALOG.projectUrl, location.href).href;
    const initialProject = await timed("registerTerrainProjectResources", () =>
      registerTerrainProjectResources(engine!, projectUrl)
    );
    runtimeProject = await timed("openSeedWorldProject", () => openSeedWorldProject(pageUrl, initialProject));
    if (disposed) {
      runtimeProject.dispose();
      throw new Error("Seed page disposed during project restoration");
    }
    const planningStorage = new PlanningProjectStorage(runtimeProject, seedWorldProjectFormats);
    sourceTask = timed("createPlanningWorldSource (parallel)", () =>
      createPlanningWorldSource(pageUrl.search, handoff, planningStorage)
    );
    void sourceTask.catch(() => {});
    await timed("preparePlanningFarmingScene", () =>
      preparePlanningFarmingScene(runtimeProject!, { baseUrl: location.href })
    );
    source = await timed("await planning source", () => sourceTask!);
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
    await timed("runtimeProject.save (startup)", () => runtimeProject!.save());
    const startupShadersAt = performance.now();
    // Startup registers Water's shared near profiles before scene loading; explicit material shaderRefs
    // resolve independent authored Shaders even when their names match a startup profile.
    // Loading the entire manifest again would re-create shaders already used by the planning preview.
    registerWindGpuFieldShaders();
    registerTerrainWindGpuExposureShader();
    registerVolumetricCloudShader();
    registerSeedWorldVoiceHudStartupShaders();
    const { registerSeedWorldWaterStartupShaders } = await import(
      "@galacean/engine-water/world/SeedWorldWaterStartupShaders"
    );
    registerSeedWorldWaterStartupShaders();
    recordBootSpan("register startup shaders", startupShadersAt);
    const { preloadTerrainPrecipitationShaders } = await import(
      "@galacean/engine-world-planning/integrations/terrain/environment/TerrainPrecipitationVfx"
    );
    await timed("preloadTerrainPrecipitationShaders", () => preloadTerrainPrecipitationShaders(engine!));
    traceBootPhase("sceneAndPopulationResources");
    const sourceResources = preparePlanningPopulationResources(engine);
    const sceneTask = engine.resourceManager.load<Scene>({
      type: AssetType.Scene,
      url: runtimeProject.projectPackage.project.scene
    });
    // Join every acquisition even on failure; no late scene acquisition escapes cleanup.
    const startup = await Promise.allSettled([sceneTask, sourceResources]);
    if (startup[0].status === "fulfilled") scene = startup[0].value;
    for (const result of startup) if (result.status === "rejected") throw result.reason;
    let { library, profiles } = await sourceResources;
    if (disposed) throw new Error("Seed page disposed during startup");
    unmountProjectSave = mountProjectSaveControl(runtimeProject, scene!, canvas);
    source = await sourceTask!;
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
    nativeBuildingHost = new NativeBuildingHost(runtimeProject, nativeEditor.editor, scene!, camera);
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
    applyAutomaticScreenSpaceReflectionConfiguration(camera, TERRAIN_SCREEN_SPACE_REFLECTION_CONFIGURATION);
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

    if (desert) sun.shadowType = ShadowType.SoftHigh;
    lighting = createIntegratedWorldLightingRuntime(sun.entity, scene!, sun, post, desert?.DESERT_SOLAR_POSITION);
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
    await applyPresentation(source!.session, lightingProfile, post);
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
        if (body instanceof WaterBodyComponent && body.authoring) {
          const planningId = body.entity.getComponent(PlanningEntityAuthoring)?.planningId;
          if (
            planningId &&
            effectivePlanningWaterId(identity.scene, identity.id, planningId, body.authoring.shape.kind) === id
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
    const sampleHeight = (x: number, z: number) => {
      const current = publication?.current;
      return current && sampleSeedWorldHeight(current.heightTransition?.fields ?? current.data.fields, x, z);
    };
    environment = await WorldEnvironmentRuntime.create(
      scene!,
      camera,
      {
        sampleHeightInterpolated: sampleHeight,
        sampleRainImpact: () => false,
        getPuddleHydrology: () => readWorld()?.clipmap.puddleHydrology
      },
      lighting,
      wind
    );
    const initialWeather = source.session
      .inspect("world")
      .components.find((component) => component.type === "weather")?.values;
    applyPlanningWeather(environment, initialWeather);
    desert?.configureDesertClouds(environment);
    audio = new SeedWorldAudioRuntime(camera, navigation, environment, wind);
    const windCenter = new Vector3();
    const driver = root.addComponent(SeedDemoFrame);
    let debugReadoutElapsed = 0;
    function visitCurrentPickBatches(visitor: SeedWorldPickVisitor): void {
      const current = publication?.current;
      if (current && water) visitPlanningWorldPickBatches(current, water, visitor);
    }
    driver.lateTick = () => {
      publication?.current?.solids.bridgesView.updateLod(camera);
    };
    driver.tick = (dt) => {
      farmingHost?.runtime?.update(dt);
      if (!ready) return;
      readWorld()?.update(dt);
      publication?.current?.vegetation?.update(dt);
      obbDebug?.update(dt);
      water?.update(dt);
      animals?.advance?.(dt);
      const position = camera.entity.transform.worldPosition;
      windCenter.set(position.x, sampleHeight(position.x, position.z) ?? position.y, position.z);
      wind.setLocalFieldCenter(windCenter);
      audio?.update(dt, ready, tools?.listening ?? false);
      if (!restoreMasonryView) playerState?.observe();
      if ((debugReadoutElapsed += dt) >= 0.1) {
        debugSidebar?.update();
        runtimeDebug?.refresh();
        debugReadoutElapsed = 0;
        const current = publication?.current;
        if (current?.vegetation) canvas.dataset.vegetation = JSON.stringify(current.vegetation.getDiagnostics());
        canvas.dataset.rockGeneration = JSON.stringify(rockFormations.generationMetrics);
        canvas.dataset.rockUnion = JSON.stringify(rockFormations.publicationMetrics);
        if (current?.template && pageUrl.searchParams.get("debug") === "1") {
          const forward = camera.entity.transform.worldForward;
          canvas.dataset.templateCamera = JSON.stringify({
            eye: [position.x, position.y, position.z],
            forward: [forward.x, forward.y, forward.z],
            ground: sampleHeight(position.x, position.z),
            eyeHeight: navigation.eyeHeight,
            groundClearance: navigation.groundClearance
          });
        }
        if (current) canvas.dataset.grassHeight = JSON.stringify(current.world.population.grassHeightRangeMetres);

        if (publication?.current?.masonry)
          canvas.dataset.plannedMasonry = JSON.stringify(publication.current.masonry.metrics);
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
    if (options.persistPlayerState !== false)
      playerState = new PlanningPlayerState(
        () => window.localStorage,
        () => {
          const p = camera.entity.transform.worldPosition;
          const mode = debugSidebar?.cameraMode ?? "roam";
          return {
            position: [p.x, p.y, p.z],
            ...resolveSeedWorldCameraAngles(camera.entity.transform.worldForward),
            mode,
            ...(mode === "orbit"
              ? {
                  orbitDistanceMetres: Math.hypot(p.x - orbit.target.x, p.y - orbit.target.y, p.z - orbit.target.z)
                }
              : {})
          };
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
    const spawnViews = new WeakMap<IslandPlan, { key: string; view: PlanningSpawnView }>();
    const spawnView = (
      plan: IslandPlan,
      data: PlanningSeedWorldData,
      groundPopulation?: PlanningSeedWorldData["population"]
    ) => {
      const options = {
        aspect: camera.aspectRatio,
        verticalFovDegrees: PLANNING_RUNTIME_OPTIONS.verticalFieldOfView,
        eyeHeight: navigation.eyeHeight,
        farClip: camera.farClipPlane
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
    // GUI and Agent weather changes feed the same real lightning source as rendering/audio.
    detachAnimalLightning = environment.subscribeLightningStrikes((strike) => {
      animals?.notify({
        id: `lightning:${strike.id}`,
        type: "thunder",
        source: [strike.position.x, strike.position.z]
      });
    });
    const isFarmingPlanned = () => source!.session.document.entities.world.components.farming?.values.enabled !== false;
    farmingHost = new PlanningFarmingHost({
      projection: nativeEditor.projection,
      isPlannedEnabled: isFarmingPlanned,
      create: (system, statePath) =>
        new PlanningFarmingRuntime({
          canvas,
          isInputEnabled: () => ready && !disposed && !tools?.listening && !runtimeDebug?.farmingPicking,
          raycastWorld: (ray, distance) =>
            rockNavigation?.raycastWorld(ray, distance) ?? root.scene!.physics.raycast(ray, distance),
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
            canvas.dataset.waterEdit = JSON.stringify({
              ...context.waterUpdate,
              publicationMs: performance.now() - started
            });
            await runtimeDebug?.synchronize();
            if (ready && !context.projectTransaction) await source!.save();
          }
        };
      }
      const waterFallback = planningWaterPublicationGate(
        publication!.current,
        context.previousDocument,
        document,
        result,
        context.forceFull
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
              revision
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
            farmingHost?.runtime?.refreshTerrain(accepted);
            animals!.synchronize(
              accepted.plan,
              readAnimalPopulationConfig(source!.session.document),
              accepted.navigation,
              {
                preservePopulation: true,
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
        JSON.stringify([
          result.plan.rocks,
          result.plan.landscapes?.filter((x) => x.kind === "rock"),
          rockGeometrySettings(readRockFormationSettings(document))
        ]) !==
          JSON.stringify([
            publication!.current.plan.rocks,
            publication!.current.plan.landscapes?.filter((x) => x.kind === "rock"),
            rockGeometrySettings(readRockFormationSettings(context.previousDocument))
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
              textureScale: settings.textureScale,
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
                const meshes = await rockFormations.prepare(plan, readRockFormationSettings(document), signal);
                await prepareRockTextures(engine!, signal);
                signal.throwIfAborted();
                const fields = current.heightTransition?.fields ?? current.data.fields;
                const presented = planningPresentedSolids(plan, fields, current.data.fields);
                solids = current.solids.prepareRocks(
                  plan,
                  presented,
                  meshes,
                  readRockFormationSettings(document).textureScale,
                  readRockFormationSettings(document).colorBlend
                );
                groundTemplate = current.template?.prepareRockGrounding(
                  presented,
                  (x, z) => sampleSeedWorldHeight(fields, x, z),
                  meshes
                );
                grass = current.world.population.prepareRockGrass(
                  rockFormationPlacements(presented, meshes),
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
                  const textureScale = readRockFormationSettings(document).textureScale;
                  current.solids.setRockTextureScale(textureScale);
                  current.vegetation!.setRockTextureScale(textureScale);
                  current.solids.setRockColorBlend(readRockFormationSettings(document).colorBlend);
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
      const fusionChanged = readGrassGroundFusion(document) !== readGrassGroundFusion(context.previousDocument);
      if (
        (result.execution === "runtime" || (result.execution === "presentation" && fusionChanged)) &&
        context.worldUnchanged &&
        !rockSupportChanged &&
        plannedGeometryUnchanged &&
        publication!.current &&
        JSON.stringify(readPlantMaterialParameters(document)) ===
          JSON.stringify(readPlantMaterialParameters(context.previousDocument)) &&
        JSON.stringify(readSubjectView(document)) === JSON.stringify(readSubjectView(context.previousDocument)) &&
        JSON.stringify(readRockFormationSettings(document)) ===
          JSON.stringify(readRockFormationSettings(context.previousDocument)) &&
        JSON.stringify(readRockGenerationProfile(document)) ===
          JSON.stringify(readRockGenerationProfile(context.previousDocument))
      ) {
        // Reuse publication follow-up so mixed animal/lighting/grass edits all reach their consumers.
        return {
          discard() {},
          commit() {},
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
            const meshes = await rockFormations.prepare(plan, settings, signal, current.solids.formations);
            const preparationMetrics = { ...rockFormations.preparationMetrics };
            await prepareRockTextures(engine!, signal);
            signal.throwIfAborted();
            const frame = await prepareRockFormationPublication(
              current,
              plan,
              meshes,
              rockFormations,
              settings,
              document.revision,
              signal,
              readRockGenerationProfile(document)
            );
            metrics = { ...preparationMetrics, ...frame.metrics };
            summary = JSON.stringify({
              formations: meshes.length,
              triangles: meshes.reduce((sum, f) => sum + f.mesh.indices.length / 3, 0),
              bodies: meshes.reduce((sum, f) => sum + f.stats.bodies, 0),
              vertices: meshes.reduce((sum, f) => sum + f.stats.vertices, 0),
              targetTriangles: settings.targetTriangles,
              overBudgetBodies: meshes.reduce((sum, f) => sum + (f.stats.overBudgetBodies ?? 0), 0)
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
            canvas.dataset.rockGeneration = JSON.stringify(rockFormations.generationMetrics);
            canvas.dataset.rockUnion = JSON.stringify(rockFormations.publicationMetrics);
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
          const [, formationMeshes] = await Promise.all([
            timed("raster.run", () => raster.run(plan, true, true)),
            timed("rockFormations.prepare", () =>
              rockFormations.prepare(plan, readRockFormationSettings(document), signal)
            )
          ]);
          // Superseded raster calls resolve undefined; only the request revision decides acceptance.
          signal.throwIfAborted();
          const nativeData = raster.takeNativeData(plan);
          if (!nativeData) throw new Error("Native terrain data was not prepared for this publication");
          const candidateData = timed("preparePlanningSeedWorldData", () =>
            preparePlanningSeedWorldData(
              plan,
              {
                height: planningHeightmap(plan),
                alpha: planningAlphamap(plan)
              },
              nativeData
            )
          );
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
          const preparedPlayer = playerState?.prepare(playerWorld, {
            restoreCamera: !initial
          });
          const groundPopulation = planningNaturalGroundPopulation(
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
            const view =
              resolveWorldTemplateStreetView(
                plan,
                (x, z) => sampleSeedWorldHeight(candidateData.fields, x, z),
                navigation.eyeHeight
              ) ?? spawnView(plan, candidateData, groundPopulation);
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
          let heightTransition: ReturnType<SeedWorldTerrainRuntime["prepareHeightTransition"]> | undefined;
          let candidate: SeedWorldTerrainRuntime | undefined;
          let candidateMasonry: NativeBuildingWorld | undefined;
          let candidateVegetation: PlanningNaturalVegetationRuntime | undefined;
          let candidateTemplate: WorldTemplateRuntime | undefined;
          let candidateSolids: Awaited<ReturnType<typeof createPlanningSeedSolids>> | undefined;
          let candidateWater: PreparedPlanningWater | undefined;
          let candidateExposure: TerrainWindGpuExposureProvider | undefined;
          try {
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
              groundPopulation,
              candidateData.surfaceIntent,
              candidateData.terrainSettings,
              candidateData.terrainNormalSamples,
              SEED_WORLD_SURFACE_LOD_CROSS_FADE_DURATION_SECONDS,
              undefined,
              signal,
              desert
                ? desert.desertSurfaceOptions(plan, result.recipe.parameters.terrainSurface, result.recipe.edits)
                : result.recipe.parameters.terrainSurface,
              worldTemplateStreetPuddles(plan)
            );
            recordBootSpan("SeedWorldTerrainRuntime.create", spanAt);
            signal.throwIfAborted();
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
                  const presented = planningPresentedSolids(candidateSolids!.sourcePlan, fields, candidateData.fields);
                  const solidFrame = await candidateSolids!.prepare(presented);
                  const grassFrame = candidate!.population.prepareRockGrass(
                    rockFormationPlacements(presented, candidateSolids!.formations),
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
            spanAt = performance.now();
            if (formationMeshes.length) await prepareRockTextures(engine!, signal);
            recordBootSpan("prepareRockTextures", spanAt);
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
            if (
              !presentationPose &&
              templateView &&
              ((initial && !bookmark) ||
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
            spanAt = performance.now();
            candidateSolids = await createPlanningSeedSolids(engine!, candidate.root, presented, {
              signal,
              previous: publication!.current?.solids,
              formations: formationMeshes,
              sourcePlan: plan,
              rockTextureScale: readRockFormationSettings(document).textureScale,
              rockColorBlend: readRockFormationSettings(document).colorBlend,
              registerGrassAppearance: (material) => candidate!.registerGrassAppearanceMaterial(material)
            });
            recordBootSpan("createPlanningSeedSolids", spanAt);
            canvas.dataset.rockFormations = JSON.stringify({
              formations: formationMeshes.length,
              triangles: formationMeshes.reduce((sum, f) => sum + f.mesh.indices.length / 3, 0),
              bodies: formationMeshes.reduce((sum, f) => sum + f.stats.bodies, 0),
              vertices: formationMeshes.reduce((sum, f) => sum + f.stats.vertices, 0),
              targetTriangles: readRockFormationSettings(document).targetTriangles,
              overBudgetBodies: formationMeshes.reduce((sum, f) => sum + (f.stats.overBudgetBodies ?? 0), 0)
            });
            spanAt = performance.now();
            candidateVegetation = await PlanningNaturalVegetationRuntime.create(
              candidate.root,
              candidate.population.trees,
              candidate.population.details,
              camera,
              library,
              plan,
              planningHeightmap(plan),
              candidateData.fields,
              candidateData.population,
              {
                client: rockFormations,
                settings: readRockFormationSettings(document),
                signal,
                generationProfile: readRockGenerationProfile(document),
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
              presentedFields
            );
            recordBootSpan("PlanningNaturalVegetationRuntime.create", spanAt);
            signal.throwIfAborted();
            canvas.dataset.rockGeneration = JSON.stringify(rockFormations.generationMetrics);
            canvas.dataset.rockUnion = JSON.stringify(rockFormations.publicationMetrics);
            spanAt = performance.now();
            await candidate.population.applyAuthoringPopulationLayout(
              planningNaturalGroundPopulation(
                candidateData.population,
                planningNaturalGrassDensity(library),
                plan,
                candidateVegetation.plantAssets
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
            spanAt = performance.now();
            candidateTemplate = await WorldTemplateRuntime.create(
              candidate.root,
              plan,
              templateGround,
              templateScene,
              signal,
              camera.entity
            );
            recordBootSpan("WorldTemplateRuntime.create", spanAt);
            if (heightTransition)
              candidateTemplate?.prepareRockGrounding(
                presented,
                (x, z) => sampleSeedWorldHeight(presentedFields, x, z),
                formationMeshes
              )?.();
            if (!ready) progress(0.6, `生成真实建筑（${plan.buildings.length} 栋）`);
            progress(0.68, "生成全部房屋与围合构件");
            const buildingTerrain = masonryTerrainSource(
              { data: candidateData, revision: document.revision },
              formationMeshes
            );
            // Startup has no outer project transaction. Later initialization is
            // contributed during editor preparation, never from runtime publication.
            if (!ready && !context.projectTransaction)
              await initializeBuildingScene(runtimeProject!, nativeEditor!.editor, plan, buildingTerrain, signal);
            if (!ready) progress(0.7, "准备原生建筑与水体");
            spanAt = performance.now();
            candidateMasonry = await nativeBuildingHost!.prepare({
              terrain: buildingTerrain,
              signal
            });
            recordBootSpan("nativeBuildingHost.prepare", spanAt);
            canvas.dataset.waterPreparation = "preparing";
            spanAt = performance.now();
            candidateWater = await water!.prepare(plan, signal);
            recordBootSpan("water.prepare", spanAt);
            canvas.dataset.waterPreparation = "ready";
            spanAt = performance.now();
            candidate.population.setRockGrassGround(readRockFormationSettings(document));
            candidate.population
              .prepareRockGrass(
                rockFormationPlacements(presented, formationMeshes),
                rockGrassExclusions(plan, candidateData.fields, rockGrassWaterTest(water!))
              )
              .commit();
            recordBootSpan("rock grass prepare + commit", spanAt);
            spanAt = performance.now();
            if (precompileShaders) candidate.warmupPopulationDetails();
            recordBootSpan("warmupPopulationDetails", spanAt);
            const warmupRoots = [candidate.root, ...candidateWater.shaderWarmupRoots];
            if (!ready) progress(0.78, "预编译场景渲染变体");
            const shaderWarmup = await warmupSeedWorldRendererVariants(engine!, scene!, camera, warmupRoots, {
              enabled: precompileShaders,
              includeGpuInstancing: true,
              strict: true,
              activatedLightRoots: warmupRoots,
              retiredLightRoots: readWorld() ? [readWorld()!.root] : [],
              postProcessState: post.getShaderWarmupState(),
              additionalBackgroundMaterials: environment!.shaderWarmupBackgroundMaterials,
              onVariants:
                pageUrl.searchParams.get("agentTrace") === "1"
                  ? (variants) => {
                      canvas.dataset.buildingShaderWarmupVariants = JSON.stringify(variants);
                    }
                  : undefined
            });
            if (pageUrl.searchParams.get("agentTrace") === "1")
              canvas.dataset.buildingShaderWarmup = JSON.stringify(shaderWarmup);
            signal.throwIfAborted();
            if (!exposure) {
              const first = candidate;
              candidateExposure = new TerrainWindGpuExposureProvider(
                engine!,
                () => (readWorld() ?? first).clipmap.heightSamplingSource,
                () => publication?.current?.revision ?? 0
              );
            }
            return {
              authoringRevision: document.revision,
              masonry: candidateMasonry,
              assertCurrent: () => candidateMasonry!.assertCurrent(),
              vegetation: candidateVegetation,
              template: candidateTemplate,
              preparedWater: candidateWater,
              data: candidateData,
              heightTransition,
              world: candidate,
              solids: candidateSolids,
              cameraPose,
              windExposure: candidateExposure,
              playerState: preparedPlayer
            };
          } catch (error) {
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
      // A verified content projection cannot change terrain or its transition.
      // Do not pause rendering or stage a replacement world for a reveal/instance edit.
      if (
        args[2].contentOnly ||
        args[2].waterUpdate ||
        !planningWaterPublicationGate(
          publication!.current,
          args[2].previousDocument,
          args[0],
          args[1],
          args[2].forceFull
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
      if (accepted.plan.parameters.worldTemplate?.id === "titan-wasteland") {
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
        } catch (error) {
          if (isCurrent()) console.warn("[seed-world] Mojave landscape setup failed", error);
          return;
        }
      }
      if (!isCurrent()) {
        next?.destroy();
        return;
      }
      mojaveLayout?.destroy();
      mojaveLayout = next;
      canvas.dataset.mojavePreview = String(next?.children.length ?? 0);
    };
    const publishContentEdit = async (projectTransaction = false) => {
      const accepted = publication!.current!;
      await synchronizeMojaveLayout(accepted);
      if (publication!.current !== accepted || disposed) return;
      animals!.synchronize(accepted.plan, readAnimalPopulationConfig(source!.session.document), accepted.navigation, {
        preservePopulation: true,
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
      if (isFarmingPlanned() !== boundFarmingEnabled) {
        await bindFarming().catch((error) => console.warn("[seed-world-planner] farming activation failed", error));
        if (publication!.current !== accepted || disposed) return;
      }
      farmingHost?.runtime?.publish(accepted, source!.session.document.revision);
      accepted.template?.activate(canvas);
      if (!accepted.template) delete canvas.dataset.worldTemplate;
      if (worldTemplate(plan.parameters.worldTemplate?.id)?.family === "desert") {
        try {
          const { createSeedSandstorm, loadSeedSandstormAtlas, placeSeedSandstorm } = await import(
            "./src/SeedWorldSandstorm"
          );
          if (publication!.current !== accepted || disposed) return;
          const { x, z } = plan.spawn;
          const ground = sampleSeedWorldHeight(accepted.data.fields, x, z);
          if (ground === undefined) throw new Error("Sandstorm spawn terrain is unavailable");
          if (sandstorm) {
            placeSeedSandstorm(sandstorm, x, ground, z);
          } else {
            const atlas = await loadSeedSandstormAtlas(engine!);
            if (publication!.current !== accepted || disposed) return;
            if (sandstorm) placeSeedSandstorm(sandstorm, x, ground, z);
            else sandstorm = createSeedSandstorm(root, atlas, x, ground, z);
          }
        } catch (error) {
          if (!disposed) console.warn("[seed-world] sandstorm setup failed", error);
        }
      } else if (sandstorm) {
        sandstorm.destroy();
        sandstorm = undefined;
      }
      canvas.dataset.sandstorm = sandstorm ? "active" : "off";
      if (publication!.current !== accepted || disposed) return;
      animals!.synchronize(plan, readAnimalPopulationConfig(source!.session.document), accepted.navigation, {
        surface: accepted.data.surfaceIntent
      });
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
        await applyPresentation(source!.session, lightingProfile!, post);
        desert?.applyDesertSky(lighting!);
        if (desert) post.setBloomTint(1, 1, 1);
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
        desert?.applyDesertTerrain(accepted.world);
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
    camera.enabled = true;
    progress(0.2, "准备原 Seed 环境光照");
    await source.initialize(preparePublication);
    const initialBuildingDocument = source.session.export();
    nativeEditor.editor.registerPreparation(preparePlanningWaterSource(() => runtimeProject!.projectPackage));
    nativeEditor.editor.registerPreparation(validatePlanningSource);
    nativeEditor.editor.registerPreparation(
      buildingScenePreparation(runtimeProject.projectPackage.project.scene, (edit, signal) =>
        buildingInitializationInputs(
          edit,
          signal,
          {
            document: source!.session.document,
            result: source!.session.result!
          },
          rockFormations,
          initialBuildingDocument
        )
      )
    );
    progress(0.94, "准备世界画面");
    desert?.applyDesertShadows(lighting);
    if (desert) {
      scene!.shadowFadeBorder = 0.2;
      sun.shadowBias = 1;
      sun.shadowNormalBias = 1;
      scene!.ambientOcclusion.enabled = false;
      scene!.ambientOcclusion.intensity = 0.5;
      scene!.ambientOcclusion.radius = 0.5;
    }
    await lighting.waitForEnvironmentIBLIdle();
    if (pageUrl.searchParams.get("debug") === "1") {
      const { PlanningSeedObbDebug } = await import("./src/planning/spatial/runtime/PlanningSeedObbDebug.ts");
      obbDebug = new PlanningSeedObbDebug({
        engine,
        root,
        camera,
        getWorld: readWorld,
        setWaterVisible: (visible) => water!.setVisible(visible, visible),
        onRepresentationChanged: (enabled) => {
          if (ready) {
            if (enabled) tools?.hide();
            else tools?.show();
          }
        }
      });
      await obbDebug.synchronize(source!.session.result!.plan);
    }
    const hudCreationAt = performance.now();

    tools = new PlanningSeedWorldSession({
      nativeEditor,
      editorExtensions: [
        createNativeWaterAgentPackage(),
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
      querySubjectCapsules: (capsules) => {
        const scene = publication?.current,
          runtime = scene?.masonry;
        if (!runtime) return undefined;
        const hits = capsules.map(({ start, end, radius }) => runtime.intersectCapsule(start, end, radius));
        if (hits.some((hit) => hit === undefined)) return undefined;
        return {
          publicationRevision: scene!.authoringRevision,
          hits: hits as Exclude<(typeof hits)[number], undefined>[]
        };
      },
      querySubjectSegments: (segments) => {
        const scene = publication?.current,
          runtime = scene?.masonry;
        if (!runtime) return undefined;
        const hits = segments.map(({ start, end }) => runtime.intersectSegment(start, end));
        if (hits.some((hit) => hit === undefined)) return undefined;
        return {
          publicationRevision: scene!.authoringRevision,
          hits: hits as Exclude<(typeof hits)[number], undefined>[]
        };
      },
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
      traceEnabled: pageUrl.searchParams.get("agentTrace") !== "0"
    });
    recordPublicationPhase("hudCreation", hudCreationAt);
    if (pageUrl.searchParams.get("debug") === "1") {
      const [{ PlanningSeedRuntimeDebug }, { PlanningSeedDebugSidebar }] = await Promise.all([
        import("./src/planning/spatial/runtime/PlanningSeedRuntimeDebug.ts"),
        import("./src/planning/spatial/runtime/PlanningSeedDebugSidebar.ts")
      ]);
      runtimeDebug = await PlanningSeedRuntimeDebug.create({
        extraControls: desert
          ? async (gui) => {
              const { mountMojaveLodControls } = await import("./src/SeedWorldMojavePreview");
              mountMojaveLodControls(gui, () => mojaveLayout);
            }
          : undefined,
        trees: {
          project: runtimeProject,
          editor: nativeEditor,
          application: tools.application,
          planning: source!.session,
          readVegetation: () => readPublished()?.vegetation
        },
        engine,
        root,
        camera,
        navigation,
        orbit,
        lighting,
        post,
        environment,
        water,
        audio: audio.audio,
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
        // Debug panels are optional post-publication consumers; their failure cannot reject the accepted world.
        canvas.dataset.runtimeDebugError = String(error);
        console.warn("[seed-world-planner] runtime debug panels unavailable", error);
        return undefined;
      });
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
      debugSidebar.synchronize(source!.session.result!.plan);
      const bookmark = publication.current?.playerBookmark;
      if (bookmark) debugSidebar.restoreCameraMode(bookmark.mode);
      if (obbDebug) debugSidebar.mountObbControl(obbDebug.button);
    }
    // Dense visible details belong to the world presentation, including photo captures.
    publication.current?.world.warmupPopulationDetails();

    progress(1, "Seed World 已就绪");
    await timed("orb.reveal", () =>
      orb!.reveal(() => {
        publication?.current?.masonry?.startEntrance();
        readWorld()?.update(0);
      })
    );
    orb.suspend();
    ready = true;
    disconnectEditorAssets = tools.application.connectProject(runtimeProject);
    nativeWaterEditor = new NativeWaterEditor(runtimeProject, nativeEditor.editor);
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
    if (pageUrl.searchParams.get("debug") === "1") {
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
      nativeBuildingPanel = mountNativeBuildingPanel(
        runtimeProject,
        nativeEditor,
        (position, forward) => {
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
        },
        returnFromMasonry,
        {
          anchors: () => {
            const current = publication?.current;
            if (!current) throw Error("Seed 地形尚未发布");
            return masonryPlacementAnchors(current, camera.entity.transform.worldPosition);
          },
          land: {
            sampleHeight: (x, z) => {
              const current = publication?.current;
              if (!current) throw Error("Seed 地形尚未发布");
              return sampleSeedWorldHeight(current.data.fields, x, z);
            },
            isWater: (x, z) => {
              return !!water?.sampleSurface(x, z, buildingWaterSample) && buildingWaterSample.waterDepth > 0;
            }
          },
          appearanceEngine: engine
        }
      );
    }
    applySubjectView();
    worldPicker ??= new SeedWorldPicker(camera);
    const inspection = nativeEditor!.inspection;
    tools!.application.runtimeInspection = inspection;
    const snapshotPicks = new RuntimeMeshPickSource(camera, inspection, visitCurrentPickBatches);
    // Settles when the background warm-up of the capture path has ended, with or without an error.
    let snapshotWarmup: Promise<void> | undefined;
    viewSnapshots = new SeedWorldViewSnapshots(
      async (signal, budget) => {
        // The warm-up and a view capture use the same single frame-capture request.
        await waitForSnapshotWarmup(snapshotWarmup, signal);
        await pickPreparation!.flush(signal);
        return worldPicker!.capture(
          (visitor) => snapshotPicks.visit(visitor),
          (batch) => inspection.target(batch.renderer),
          signal,
          budget,
          () => pickPreparation!.ready
        );
      },
      () => {
        const state = tools!.application.getViewState();
        return `${state.activeRevision}:${state.authoringStateHash}`;
      }
    );
    tools!.application.viewSnapshots = viewSnapshots;
    {
      lassoPanel = new SeedWorldLassoPanel(
        viewSnapshots,
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
        new SeedWorldInstantCamera(engine, canvas, camera, viewSnapshots.budget)
      );
    }
    unbindWorldClick = bindWorldClickInput(canvas, navigation, function interactWithAnimal(x, y) {
      if (!ready || disposed || lassoFrozen || runtimeDebug?.farmingPicking) return;
      const ray = new Ray();
      camera.screenPointToRay(new Vector2(x, y), ray);
      animals?.shoo(
        ray,
        (distance) => rockNavigation?.raycastWorld(ray, distance) ?? root.scene!.physics.raycast(ray, distance)
      );
    });
    if (options.showAssistant !== false) tools.show();
    loading.hidden = true;
    canvas.dataset.status = "ready";
    document.body.dataset.worldReady = "true";
    // The world is already visible and navigable. Two independent preparations start now:
    // 1. The capture path of the world camera. The assistant's snapshot and the user's photo both use it,
    //    so it runs first and a view capture waits for it.
    // 2. The instant-camera presentation (models, photo workspace). Only the user's photo needs it,
    //    so it only gates the screenshot entry, which is mounted when it has finished.
    const photoPreparationStarted = performance.now();
    canvas.dataset.photoPreparation = "loading";
    const preparingLasso = lassoPanel,
      preparingPicker = worldPicker,
      preparingPicks = pickPreparation,
      preparingViews = viewSnapshots;
    const preparingTools = tools;
    const capturePathWarmup = (async () => {
      await timed("pickPreparation.flush #1", () => preparingPicks.flush(editorLifetime.signal));
      await timed("worldPicker.prepareSnapshot", () =>
        preparingPicker.prepareSnapshot(
          (visitor) => snapshotPicks.visit(visitor),
          editorLifetime.signal,
          preparingViews.budget
        )
      );
      canvas.dataset.snapshotWarmupMs = String(performance.now() - photoPreparationStarted);
    })();
    // A failed warm-up does not block captures: a capture runs the same path and reports its own error.
    snapshotWarmup = capturePathWarmup.then(
      () => {},
      () => {}
    );
    void (async () => {
      await capturePathWarmup;
      await timed("lassoPanel.prepare", () => preparingLasso.prepare());
      await timed("pickPreparation.flush #2", () => preparingPicks.flush(editorLifetime.signal));
      if (disposed) return;
      if (options.showAssistant !== false)
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
  components = session.inspect("world").components
): Promise<void> {
  const light = components.find((component) => component.type === "lighting")?.values;
  if (light) {
    if (!(await lightingProfile.apply(light))) return;
  }
  const p = components.find((component) => component.type === "postProcess")?.values;
  if (p) {
    post.setProfileEnabled(Boolean(p.enabled));
    post.setTonemappingEnabled(Boolean(p.tonemapping));
    post.setPostExposure(Number(p.postExposure));
    post.setTemperature(Number(p.temperature));
    post.setContrast(Number(p.contrast));
    post.setSaturation(Number(p.saturation));
    post.setBloomEnabled(Boolean(p.bloom));
    post.setBloomThreshold(Number(p.bloomThreshold));
    post.setBloomIntensity(Number(p.bloomIntensity));
    post.setBloomScatter(Number(p.bloomScatter));
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
