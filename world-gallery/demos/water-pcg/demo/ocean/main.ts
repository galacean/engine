import {
  BloomEffect,
  Camera,
  Color,
  PostProcess,
  Script,
  TonemappingEffect,
  TonemappingMode,
  Vector3,
  WebGLMode,
  WebGLEngine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { OrbitControl } from "@galacean/engine-toolkit-controls";
import * as dat from "dat.gui";
import { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";
import { WaterWaveModel } from "../../authoring/wave/enums/WaterWaveModel";
import { WaterWaveSchemaVersion } from "../../authoring/wave/enums/WaterWaveSchemaVersion";
import { WaterFoamDebugView } from "../../runtime/interaction/WaterFoamTypes";
import { CameraWaterFeatureBroker } from "../../runtime/optics/CameraWaterFeatureBroker";
import type { WaterReflectionSource } from "../../runtime/optics/WaterReflectionPolicy";
import {
  WaterReflectionService,
  type WaterReflectionServiceMetrics
} from "../../runtime/optics/WaterReflectionService";
import { cloneOceanConfig } from "../examples";
import { OceanPreviewController } from "../examples/ocean-preview/OceanPreviewController";
import { gerstnerFeatureOceanPreview, showcaseOceanPreview } from "../examples/ocean-preview/presets";
import type {
  OceanPreviewConfig,
  OceanPreviewMetrics,
  OceanPreviewStressResult
} from "../examples/ocean-preview/types";
import { isWaterPcgDeveloperMode, resolveWaterPcgCase } from "../navigation";
import {
  createWaterFeatureCaseApi,
  type WaterFeatureCaseApi
} from "../showcase/WaterFeatureCaseApi";
import {
  areFiniteShowcaseMetrics,
  WaterShowcaseFrameSampler,
  type WaterShowcaseAcceptanceSnapshot
} from "../showcase/WaterShowcaseAcceptance";
import {
  createShowcaseCameraController,
  resolveShowcaseCameraMode,
  SHOWCASE_CAMERA_MOVEMENT_SPEED,
  type ShowcaseCameraController
} from "../showcase/ShowcaseCameraControl";
import {
  OceanShowcaseSceneController,
  type OceanShowcaseSceneMetrics,
  type OceanShowcaseSceneMode
} from "./OceanShowcaseSceneController";
import { OceanDuskEnvironmentController } from "./OceanDuskEnvironmentController";
import { OceanCoastalRockAsset } from "./OceanCoastalRockAsset";
import { OceanPbrTextureLibrary } from "./OceanPbrTextureLibrary";
import {
  OceanSplashVfxController,
  type OceanSplashVfxMetrics
} from "./OceanSplashVfxController";

interface OceanShowcaseLifecycleSnapshot {
  readonly disposed: boolean;
  readonly featureStackEnabled: boolean;
  readonly surfaceTime: number;
  readonly runtime: OceanPreviewMetrics;
  readonly reflection: WaterReflectionServiceMetrics;
  readonly scene: Readonly<OceanShowcaseSceneMetrics>;
  readonly splash?: Readonly<OceanSplashVfxMetrics>;
  readonly engine: {
    readonly bufferMemory: number;
    readonly textureMemory: number;
    readonly totalMemory: number;
  };
}

interface OceanShowcaseLifecycleApi {
  readonly disposed: boolean;
  snapshot(): OceanShowcaseLifecycleSnapshot;
  setFeatureStackEnabled(enabled: boolean): void;
  reset(surfaceTime?: number): void;
  dispose(): OceanShowcaseLifecycleSnapshot;
}

interface OceanRuntimeWindow extends Window {
  waterPcgSetSurfaceTime?: (elapsedTime?: number) => void;
  waterPcgGetOceanMetrics?: () => OceanPreviewMetrics;
  waterPcgGetReflectionMetrics?: () => WaterReflectionServiceMetrics;
  waterPcgSetOceanReflectionSource?: (source: WaterReflectionSource) => void;
  waterPcgSetOceanLodDebug?: (enabled: boolean) => void;
  waterPcgSetOceanCameraPosition?: (worldX: number, worldZ: number) => void;
  waterPcgStressOcean?: (iterations?: number) => OceanPreviewStressResult;
  waterPcgOceanLifecycle?: OceanShowcaseLifecycleApi;
}

interface OceanHeroPose {
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
}

type OceanFocusedFeaturePreset =
  | "ocean-nearshore-waves"
  | "ocean-breakers"
  | "ocean-shore-foam"
  | "ocean-rock-contact"
  | "ocean-micro-surface"
  | "ocean-wetness";

const OCEAN_FOCUSED_FEATURE_PRESETS =
  new Set<OceanFocusedFeaturePreset>([
    "ocean-nearshore-waves",
    "ocean-breakers",
    "ocean-shore-foam",
    "ocean-rock-contact",
    "ocean-micro-surface",
    "ocean-wetness"
  ]);

function isOceanFocusedFeaturePreset(
  preset: string
): preset is OceanFocusedFeaturePreset {
  return OCEAN_FOCUSED_FEATURE_PRESETS.has(
    preset as OceanFocusedFeaturePreset
  );
}

const OCEAN_HERO_POSES = Object.freeze({
  hero: Object.freeze({
    position: [27, 1.52, 14] as const,
    target: [-5, 0.03, -44] as const
  }),
  gerstner: Object.freeze({
    position: [13, 6.5, 18] as const,
    target: [0, 0.3, -8] as const
  }),
  "lod-debug": Object.freeze({
    position: [0, 44, 62] as const,
    target: [0, 0, 0] as const
  })
} satisfies Readonly<Record<OceanShowcaseSceneMode, OceanHeroPose>>);

const OCEAN_CAPTURE_STATES = Object.freeze({
  hero: Object.freeze({
    position: [27, 1.52, 14] as const,
    target: [-5, 0.03, -44] as const,
    time: 12.5
  }),
  interaction: Object.freeze({
    position: [34, 1.32, 14] as const,
    target: [27, 0.04, -5] as const,
    time: 18
  }),
  detail: Object.freeze({
    position: [24, 1.08, 12] as const,
    target: [16, 0.03, -10] as const,
    time: 24
  })
});

function resolveSceneMode(preset: string): OceanShowcaseSceneMode {
  if (preset === "gerstner-waves") return "gerstner";
  if (preset === "ocean-lod-debug") return "lod-debug";
  return "hero";
}

function resolveOceanPose(
  preset: string,
  sceneMode: OceanShowcaseSceneMode
): OceanHeroPose {
  if (
    preset === "ocean-nearshore-waves" ||
    preset === "ocean-breakers" ||
    preset === "ocean-rock-contact"
  ) {
    return OCEAN_CAPTURE_STATES.interaction;
  }
  if (
    preset === "ocean-shore-foam" ||
    preset === "ocean-micro-surface" ||
    preset === "ocean-wetness"
  ) {
    return OCEAN_CAPTURE_STATES.detail;
  }
  return OCEAN_HERO_POSES[sceneMode];
}

function createOceanRuntimeConfig(
  preset: string,
  sceneMode: OceanShowcaseSceneMode
): OceanPreviewConfig {
  const config = cloneOceanConfig(
    sceneMode === "gerstner"
      ? gerstnerFeatureOceanPreview
      : showcaseOceanPreview
  );
  if (
    preset === "ocean-nearshore-waves" ||
    preset === "ocean-micro-surface" ||
    preset === "ocean-wetness"
  ) {
    config.foamEnabled = false;
  }
  return config;
}

async function bootstrapOceanShowcase(): Promise<void> {
  const activeCase = resolveWaterPcgCase(window.location);
  const sceneMode = resolveSceneMode(activeCase.preset);
  const search = new URLSearchParams(window.location.search);
  const showcaseCameraMode = activeCase.preset === "hero-ocean" ? resolveShowcaseCameraMode(search, true) : undefined;
  const developerCameraControlsEnabled =
    isWaterPcgDeveloperMode(window.location) ||
    activeCase.group === "developer" ||
    (showcaseCameraMode !== undefined && showcaseCameraMode !== "fixed");
  const oceanConfig = createOceanRuntimeConfig(
    activeCase.preset,
    sceneMode
  );
  const requestedQuality = search.get("quality");
  if (
    sceneMode === "lod-debug" &&
    (requestedQuality === WaterQualityTier.Low ||
      requestedQuality === WaterQualityTier.Medium ||
      requestedQuality === WaterQualityTier.High)
  ) {
    oceanConfig.quality = requestedQuality;
  }
  const runtimeWindow = window as OceanRuntimeWindow;
  const exampleBar = document.getElementById("example-bar");
  if (!(exampleBar instanceof HTMLElement)) throw new Error("Water PCG example bar is missing.");

  const engineConfiguration = {
    canvas: "canvas",
    shaderCompiler: new ShaderCompiler(),
    graphicDeviceOptions: {
      webGLMode: WebGLMode.WebGL2
    }
  } as unknown as Parameters<typeof WebGLEngine.create>[0];
  const engine = await WebGLEngine.create(engineConfiguration);
  engine.canvas.resizeByClientSize();
  const [pbrTextureLibrary, coastalRockAsset] =
    await Promise.all([
      OceanPbrTextureLibrary.create(engine),
      OceanCoastalRockAsset.load(engine)
    ]);

  const scene = engine.sceneManager.activeScene;
  scene.background.solidColor = new Color(0.035, 0.105, 0.135, 1);
  const root = scene.createRootEntity("ocean-showcase-root");
  const duskEnvironment = new OceanDuskEnvironmentController(engine, root);
  const cameraEntity = root.createChild("ocean-showcase-camera");
  const camera = cameraEntity.addComponent(Camera);
  camera.farClipPlane = 600;
  camera.fieldOfView = sceneMode === "lod-debug" ? 58 : 50;
  camera.enableHDR = true;
  camera.enablePostProcess = true;
  const postProcessEntity = root.createChild("ocean-showcase-post-process");
  const postProcess = postProcessEntity.addComponent(PostProcess);
  const bloom = postProcess.addEffect(BloomEffect);
  bloom.threshold.value = 1.12;
  bloom.intensity.value = 0.16;
  bloom.scatter.value = 0.52;
  const tonemapping = postProcess.addEffect(TonemappingEffect);
  tonemapping.mode.value = TonemappingMode.ACES;
  const orbit = cameraEntity.addComponent(OrbitControl);
  const heroPose = resolveOceanPose(activeCase.preset, sceneMode);
  const [targetX, targetY, targetZ] = heroPose.target;
  const [cameraX, cameraY, cameraZ] = heroPose.position;
  orbit.target.set(targetX, targetY, targetZ);
  orbit.enabled = developerCameraControlsEnabled && sceneMode !== "hero";
  cameraEntity.transform.setPosition(cameraX, cameraY, cameraZ);
  cameraEntity.transform.lookAt(new Vector3(targetX, targetY, targetZ));
  let showcaseCameraController: ShowcaseCameraController | undefined;

  const featureBroker = new CameraWaterFeatureBroker(camera);
  const oceanPreview = new OceanPreviewController(engine, root, oceanConfig);
  oceanPreview.setCameraFeatureBroker(featureBroker);
  oceanPreview.setReflectionSource(oceanConfig.reflectionSource ?? "planar");
  oceanPreview.setLodDebug(sceneMode === "lod-debug");
  const splashRequired =
    activeCase.preset === "hero-ocean" ||
    activeCase.preset === "ocean-rock-contact" ||
    sceneMode === "lod-debug";
  const splashVfx =
    splashRequired
      ? new OceanSplashVfxController(engine, root, {
          getEventQueue: () =>
            oceanPreview.interactionEventQueue
        })
      : undefined;

  const showcaseScene = new OceanShowcaseSceneController(
    engine,
    root,
    oceanPreview.surfaceProvider,
    sceneMode,
    oceanPreview.nearshoreFieldResource,
    oceanPreview.nearshoreStateField,
    pbrTextureLibrary,
    coastalRockAsset
  );
  const reflectionLease = WaterReflectionService.acquire(engine, root, camera);
  const reflectionService = reflectionLease.service;
  oceanPreview.setReflectionService(reflectionService);
  oceanPreview.setReflectionVisible(true);

  const frameSampler = new WaterShowcaseFrameSampler();
  const requestedSurfaceTimeParameter = search.get("surfaceTime");
  const requestedSurfaceTime =
    requestedSurfaceTimeParameter === null ? Number.NaN : Number(requestedSurfaceTimeParameter);
  const initialSurfaceTimeOverride = Number.isFinite(requestedSurfaceTime)
    ? Math.max(0, requestedSurfaceTime)
    : undefined;
  let surfaceTimeOverride = initialSurfaceTimeOverride;
  oceanPreview.setSurfaceTimeOverride(surfaceTimeOverride);
  let reflectionSource: WaterReflectionSource = oceanConfig.reflectionSource ?? "planar";
  let runtimeError = "";
  let featureEnabled = true;
  let runtimeReady = false;
  let captureLocked = false;
  let autoTourActive = showcaseCameraMode === "tour";
  let lifecycleFeatureStackEnabled = true;
  let lifecycleDisposed = false;

  const createLifecycleSnapshot = (
    disposed = lifecycleDisposed
  ): OceanShowcaseLifecycleSnapshot =>
    Object.freeze({
      disposed,
      featureStackEnabled: lifecycleFeatureStackEnabled,
      surfaceTime:
        surfaceTimeOverride ?? engine.time.elapsedTime,
      runtime: oceanPreview.metrics,
      reflection: reflectionService.metrics,
      scene: showcaseScene.metrics,
      splash: splashVfx?.metrics,
      engine: Object.freeze({
        bufferMemory: engine.renderingStatistics.bufferMemory,
        textureMemory: engine.renderingStatistics.textureMemory,
        totalMemory: engine.renderingStatistics.totalMemory
      })
    });

  const assertLifecycleAvailable = (): void => {
    if (lifecycleDisposed) {
      throw new Error(
        "Ocean Showcase lifecycle API is unavailable after disposal."
      );
    }
  };

  const setLifecycleFeatureStackEnabled = (
    enabled: boolean
  ): void => {
    assertLifecycleAvailable();
    if (enabled === lifecycleFeatureStackEnabled) return;
    lifecycleFeatureStackEnabled = enabled;
    if (!enabled) {
      oceanPreview.setFoamBreakerSourceEnabled(false);
      oceanPreview.setShoreFoamEnabled(false);
      oceanPreview.setRockContactEnabled(false);
      oceanPreview.resetRockContacts();
      oceanPreview.resetFoam();
      oceanPreview.setFoamEnabled(false);
      oceanPreview.setNearshoreBreakerEnabled(false);
      oceanPreview.setNearshoreWaveEnabled(false);
      oceanPreview.setNearshoreStateEnabled(false);
      showcaseScene.setWetSandEnabled(false);
      showcaseScene.resetWetSand();
      splashVfx?.setEnabled(false);
      splashVfx?.reset();
    } else {
      oceanPreview.setNearshoreStateEnabled(true);
      oceanPreview.setNearshoreWaveEnabled(true);
      oceanPreview.setNearshoreBreakerEnabled(true);
      oceanPreview.setFoamEnabled(true);
      oceanPreview.setFoamBreakerSourceEnabled(true);
      oceanPreview.setShoreFoamEnabled(true);
      oceanPreview.setRockContactEnabled(true);
      oceanPreview.resetNearshoreState();
      oceanPreview.resetRockContacts();
      oceanPreview.resetFoam();
      showcaseScene.setWetSandEnabled(true);
      showcaseScene.resetWetSand();
      splashVfx?.setEnabled(true);
      splashVfx?.reset();
    }
    writeMetrics();
    updateAcceptance();
  };

  const resetLifecycleState = (
    fixedSurfaceTime = OCEAN_CAPTURE_STATES.hero.time
  ): void => {
    assertLifecycleAvailable();
    if (
      !Number.isFinite(fixedSurfaceTime) ||
      fixedSurfaceTime < 0
    ) {
      throw new RangeError(
        "Ocean lifecycle surface time must be finite and non-negative."
      );
    }
    window.waterPcgShowcase?.setCaptureState("hero");
    surfaceTimeOverride = fixedSurfaceTime;
    oceanPreview.resetNearshoreState();
    oceanPreview.resetRockContacts();
    oceanPreview.resetFoam();
    oceanPreview.setSurfaceTimeOverride(fixedSurfaceTime);
    showcaseScene.setWetSandEnabled(
      lifecycleFeatureStackEnabled
    );
    showcaseScene.resetWetSand();
    splashVfx?.setEnabled(lifecycleFeatureStackEnabled);
    splashVfx?.reset();
    showcaseScene.update(fixedSurfaceTime);
    reflectionService.update();
    oceanPreview.refreshReflectionBinding();
    writeMetrics();
    updateAcceptance();
  };

  if (isOceanFocusedFeaturePreset(activeCase.preset)) {
    switch (activeCase.preset) {
      case "ocean-breakers":
        oceanPreview.setFoamBreakerSourceEnabled(true);
        oceanPreview.setShoreFoamEnabled(false);
        oceanPreview.setRockContactEnabled(false);
        oceanPreview.resetFoam();
        break;
      case "ocean-shore-foam":
        oceanPreview.setNearshoreBreakerEnabled(false);
        oceanPreview.setFoamBreakerSourceEnabled(false);
        oceanPreview.setShoreFoamEnabled(true);
        oceanPreview.setRockContactEnabled(false);
        oceanPreview.setFoamDebugView(
          WaterFoamDebugView.History
        );
        oceanPreview.resetFoam();
        break;
      case "ocean-rock-contact":
        oceanPreview.setNearshoreBreakerEnabled(false);
        oceanPreview.setFoamBreakerSourceEnabled(false);
        oceanPreview.setShoreFoamEnabled(false);
        oceanPreview.setRockContactEnabled(true);
        oceanPreview.setFoamDebugView(
          WaterFoamDebugView.History
        );
        oceanPreview.resetFoam();
        break;
      case "ocean-nearshore-waves":
      case "ocean-micro-surface":
      case "ocean-wetness":
        break;
    }
  }
  const pauseAutoTour = (): void => {
    if (!autoTourActive) return;
    autoTourActive = false;
    showcaseCameraController?.setFreeControlActive(true);
  };
  const handleCameraKeyDown = (event: KeyboardEvent): void => {
    if (
      event.code === "KeyW" ||
      event.code === "KeyA" ||
      event.code === "KeyS" ||
      event.code === "KeyD" ||
      event.code.startsWith("Arrow")
    ) {
      pauseAutoTour();
    }
  };
  const oceanCanvas = document.getElementById("canvas");
  oceanCanvas?.addEventListener("pointerdown", pauseAutoTour);
  oceanCanvas?.addEventListener("wheel", pauseAutoTour, { passive: true });
  window.addEventListener("keydown", handleCameraKeyDown);

  if (showcaseCameraMode) {
    showcaseCameraController = createShowcaseCameraController(cameraEntity, {
      mode: showcaseCameraMode,
      movementSpeed: SHOWCASE_CAMERA_MOVEMENT_SPEED.ocean,
      afterCameraUpdate: () => {
        const position = cameraEntity.transform.worldPosition;
        oceanPreview.setCameraPosition(position.x, position.z);
        reflectionService.update();
        oceanPreview.refreshReflectionBinding();
      }
    });
  }

  const resize = (): void => {
    engine.canvas.resizeByClientSize();
    featureBroker.setViewportSize(engine.canvas.width, engine.canvas.height);
    reflectionService.setViewportSize(engine.canvas.width, engine.canvas.height);
  };
  resize();
  window.addEventListener("resize", resize);

  const writeMetrics = (): void => {
    const metrics = oceanPreview.metrics;
    const reflection = reflectionService.metrics;
    const showcase = showcaseScene.metrics;
    const environment = duskEnvironment.metrics;
    const splash = splashVfx?.metrics;
    exampleBar.dataset.activeExample = activeCase.id;
    exampleBar.dataset.oceanWaveModel = metrics.waveModel;
    exampleBar.dataset.oceanQuality = metrics.quality;
    exampleBar.dataset.oceanActiveWaveCount = String(
      metrics.activeWaveCount
    );
    exampleBar.dataset.oceanShaderWaveCount = String(metrics.shaderWaveCount);
    exampleBar.dataset.oceanMeshUploadCount = String(metrics.meshUploadCount);
    exampleBar.dataset.oceanPerFrameMeshUpload = String(metrics.perFrameMeshUpload);
    exampleBar.dataset.oceanRingCount = String(metrics.ringCount);
    exampleBar.dataset.oceanPatchCount = String(metrics.patchCount);
    exampleBar.dataset.oceanVisiblePatchCount = String(metrics.visiblePatchCount);
    exampleBar.dataset.oceanReflectionSource = metrics.reflectionSource;
    exampleBar.dataset.oceanReflectionFilterSampleCount = String(metrics.reflectionFilterSampleCount);
    exampleBar.dataset.oceanRefractionEnabled = String(metrics.refractionEnabled);
    exampleBar.dataset.planarReflectionOwner = reflection.planarOwnerId ?? "none";
    exampleBar.dataset.planarReflectionCameraCount = String(reflection.planarCameraCount);
    exampleBar.dataset.planarReflectionRenderTargetCount = String(reflection.liveRenderTargetCount ?? 0);
    exampleBar.dataset.planarReflectionFailureCount = String(reflection.planarFailureCount);
    exampleBar.dataset.planarReflectionColorFormat = reflection.colorFormat;
    exampleBar.dataset.planarReflectionHdr = String(reflection.planarHDR);
    exampleBar.dataset.planarReflectionFallbackReason = reflection.fallbackReason ?? "";
    exampleBar.dataset.planarReflectionResourceBytes = String(reflection.resourceBytes);
    exampleBar.dataset.oceanSurfaceDetailEnabled = String(metrics.surfaceDetailEnabled);
    exampleBar.dataset.oceanSurfaceDetailLayerCount = String(metrics.surfaceDetailLayerCount);
    exampleBar.dataset.oceanSurfaceDetailTextureCount = String(
      metrics.surfaceDetailTextureCount
    );
    exampleBar.dataset.oceanSurfaceDetailResourceBytes = String(
      metrics.surfaceDetailResourceBytes
    );
    exampleBar.dataset.oceanNearshoreEnabled = String(metrics.nearshoreEnabled);
    exampleBar.dataset.oceanNearshoreSourceHash = metrics.nearshoreSourceHash ?? "";
    exampleBar.dataset.oceanNearshoreWetTexelCount = String(metrics.nearshoreWetTexelCount);
    exampleBar.dataset.oceanNearshoreDryTexelCount = String(metrics.nearshoreDryTexelCount);
    exampleBar.dataset.oceanNearshoreResourceBytes = String(metrics.nearshoreResourceBytes);
    exampleBar.dataset.oceanNearshoreWaveEnabled = String(
      metrics.nearshoreWaveEnabled
    );
    exampleBar.dataset.oceanNearshoreStateEnabled = String(
      metrics.nearshoreStateEnabled
    );
    exampleBar.dataset.oceanNearshoreBreakerEnabled = String(
      metrics.nearshoreBreakerEnabled
    );
    exampleBar.dataset.oceanNearshoreStateUpdateRateHz = String(
      metrics.nearshoreStateUpdateRateHz
    );
    exampleBar.dataset.oceanNearshoreStateUploadCount = String(
      metrics.nearshoreStateUploadCount
    );
    exampleBar.dataset.oceanNearshoreWetnessUploadRateHz = String(
      metrics.nearshoreWetnessUploadRateHz
    );
    exampleBar.dataset.oceanNearshoreWetnessUploadCount = String(
      metrics.nearshoreWetnessUploadCount
    );
    exampleBar.dataset.oceanNearshoreThinFilmTexelCount = String(
      metrics.nearshoreThinFilmTexelCount
    );
    exampleBar.dataset.oceanNearshoreBreakerTexelCount = String(
      metrics.nearshoreBreakerTexelCount
    );
    exampleBar.dataset.oceanNearshoreWetnessTexelCount = String(
      metrics.nearshoreWetnessTexelCount
    );
    exampleBar.dataset.oceanNearshoreDynamicResourceBytes = String(
      metrics.nearshoreDynamicResourceBytes
    );
    exampleBar.dataset.oceanFoamEnabled = String(metrics.foamEnabled);
    exampleBar.dataset.oceanFoamTextureCount = String(
      metrics.foamTextureCount
    );
    exampleBar.dataset.oceanFoamDetailTextureCount = String(
      metrics.foamDetailTextureCount
    );
    exampleBar.dataset.oceanFoamDetailResourceBytes = String(
      metrics.foamDetailResourceBytes
    );
    exampleBar.dataset.oceanFoamUpdateRateHz = String(
      metrics.foamTargetUpdateRateHz
    );
    exampleBar.dataset.oceanFoamHistoryUpdateCount = String(
      metrics.foamHistoryUpdateCount
    );
    exampleBar.dataset.oceanFoamUploadCount = String(
      metrics.foamUploadCount
    );
    exampleBar.dataset.oceanFoamResourceBytes = String(
      metrics.foamResourceBytes
    );
    exampleBar.dataset.oceanFoamBreakerSourceEnabled = String(
      metrics.foamBreakerSourceEnabled
    );
    exampleBar.dataset.oceanFoamShoreSourceEnabled = String(
      metrics.foamShoreSourceEnabled
    );
    exampleBar.dataset.oceanFoamCurrentSurfaceQueryCount = String(
      metrics.foamCurrentSurfaceQueryCount
    );
    exampleBar.dataset.oceanImpactPendingCount = String(
      metrics.foamPendingEventCount
    );
    exampleBar.dataset.oceanRockContactEnabled = String(
      metrics.rockContactEnabled
    );
    exampleBar.dataset.oceanRockContactPeakEnergy =
      metrics.rockContactPeakEnergy.toFixed(4);
    exampleBar.dataset.oceanSplashEmitterCount = String(
      splash?.activeEmitterCount ?? 0
    );
    exampleBar.dataset.oceanSplashEmissionCount = String(
      splash?.emissionCount ?? 0
    );
    exampleBar.dataset.oceanSplashEnabled = String(
      splash?.enabled ?? false
    );
    exampleBar.dataset.oceanSplashHasLiveParticles = String(
      splash?.hasLiveParticles ?? false
    );
    exampleBar.dataset.oceanBathymetryTerrainVisible = String(
      showcase.bathymetryTerrainVisible
    );
    exampleBar.dataset.oceanBathymetryTerrainSourceHash =
      showcase.bathymetryTerrainSourceHash ?? "";
    exampleBar.dataset.oceanWetSandEnabled = String(showcase.wetSandEnabled);
    exampleBar.dataset.oceanWetSandUploadRateHz = String(
      showcase.wetSandUploadRateHz
    );
    exampleBar.dataset.oceanWetSandBaseColorUploadCount = String(
      showcase.wetSandBaseColorUploadCount
    );
    exampleBar.dataset.oceanWetSandRoughnessUploadCount = String(
      showcase.wetSandRoughnessUploadCount
    );
    exampleBar.dataset.oceanWetSandResourceBytes = String(
      showcase.wetSandResourceBytes
    );
    exampleBar.dataset.oceanBoatQueryHit = String(showcase.boatQueryHit);
    exampleBar.dataset.oceanBoatSampleFinite = String(showcase.boatSampleFinite);
    exampleBar.dataset.oceanWakeEnergy = showcase.wakeEnergy.toFixed(4);
    exampleBar.dataset.oceanEnvironmentState = environment.stateId;
    exampleBar.dataset.oceanSceneSunOwned = String(
      environment.sceneSunOwned
    );
    exampleBar.dataset.oceanProceduralSky = String(
      environment.proceduralSkyEnabled
    );
    exampleBar.dataset.oceanFogEnabled = String(environment.fogEnabled);
    exampleBar.dataset.oceanAoEnabled = String(
      environment.ambientOcclusionEnabled
    );
    exampleBar.dataset.oceanPbrMaterialCount = String(
      showcase.pbrMaterialCount
    );
    exampleBar.dataset.oceanPbrTextureCount = String(
      showcase.pbrTextureCount
    );
    exampleBar.dataset.oceanIblTextureBound = String(
      environment.iblTextureBound
    );
    exampleBar.dataset.runtimeError = runtimeError;
  };

  const updateAcceptance = (): void => {
    const ocean = oceanPreview.metrics;
    const reflection = reflectionService.metrics;
    const showcase = showcaseScene.metrics;
    const environment = duskEnvironment.metrics;
    const splash = splashVfx?.metrics;
    const frame = frameSampler.metrics;
    const gerstnerFeature =
      activeCase.preset === "gerstner-waves";
    const completeShowcaseRequired =
      activeCase.preset === "hero-ocean" ||
      sceneMode === "lod-debug";
    const foamInfrastructureRequired =
      completeShowcaseRequired ||
      activeCase.preset === "ocean-breakers" ||
      activeCase.preset === "ocean-shore-foam" ||
      activeCase.preset === "ocean-rock-contact";
    const splashInfrastructureRequired =
      completeShowcaseRequired ||
      activeCase.preset === "ocean-rock-contact";
    const reflectionRequired = sceneMode !== "gerstner";
    const nearshoreRequired = sceneMode !== "gerstner";
    const expectedWaveCount =
      gerstnerFeature && !featureEnabled ? 0 : 12;
    const nearshoreInfrastructureReady =
      !nearshoreRequired ||
      (ocean.nearshoreEnabled &&
        ocean.nearshoreSourceHash !== undefined &&
        ocean.nearshoreWetTexelCount > 0 &&
        ocean.nearshoreDryTexelCount > 0 &&
        ocean.nearshoreResourceBytes > 0 &&
        ocean.nearshoreStateUpdateRateHz <= 30 &&
        ocean.nearshoreWetnessUploadRateHz <
          ocean.nearshoreStateUpdateRateHz &&
        ocean.nearshoreDynamicResourceBytes > 0 &&
        showcase.bathymetryTerrainVisible &&
        showcase.bathymetryTerrainSourceHash ===
          ocean.nearshoreSourceHash &&
        showcase.bathymetryTerrainVertexCount > 0 &&
        showcase.heroRockCount === 3 &&
        showcase.cloudCount === 0 &&
        showcase.photogrammetryRockLoaded &&
        showcase.photogrammetryRockInstanceCount === 3 &&
        showcase.photogrammetryRockPbrMaterialCount > 0 &&
        showcase.photogrammetryRockSourceBytes > 0 &&
        showcase.pbrMaterialCount > 0 &&
        showcase.pbrTextureCount === 12 &&
        showcase.completePbrTextureSetCount === 3 &&
        showcase.nonPbrMaterialCount === 0);
    const foamInfrastructureReady =
      !foamInfrastructureRequired ||
      (ocean.foamEnabled &&
        ocean.analyticWhitecapEnabled &&
        ocean.foamTextureCount === 3 &&
        ocean.foamDetailTextureCount === 1 &&
        ocean.foamDetailResourceBytes > 0 &&
        ocean.foamTargetUpdateRateHz <= 30 &&
        ocean.foamResourceBytes > 0 &&
        ocean.foamCurrentSurfaceQueryCount === 0);
    const splashInfrastructureReady =
      !splashInfrastructureRequired ||
      ((splash?.activeEmitterCount ?? 0) === 1 &&
        (splash?.activeMaterialCount ?? 0) === 1);
    const completeShowcaseReady =
      !completeShowcaseRequired ||
      (ocean.nearshoreWaveEnabled &&
        ocean.surfaceDetailEnabled &&
        ocean.surfaceDetailTextureCount === 1 &&
        ocean.surfaceDetailResourceBytes > 0 &&
        ocean.nearshoreStateEnabled &&
        ocean.nearshoreBreakerEnabled &&
        ocean.foamBreakerSourceEnabled &&
        ocean.foamShoreSourceEnabled &&
        ocean.rockContactEnabled &&
        showcase.wetSandEnabled &&
        showcase.wetSandUploadRateHz <
          ocean.nearshoreStateUpdateRateHz &&
        showcase.wetSandBaseColorUploadCount > 0 &&
        showcase.wetSandRoughnessUploadCount > 0 &&
        showcase.wetSandResourceBytes > 0);
    const duskEnvironmentReady =
      sceneMode === "gerstner" ||
      (environment.directLightCount === 1 &&
        environment.sceneSunOwned &&
        environment.proceduralSkyEnabled &&
        environment.proceduralSunDiskEnabled &&
        environment.ambientSphericalHarmonicsEnabled &&
        environment.iblTextureBound &&
        environment.fogEnabled &&
        environment.ambientOcclusionEnabled &&
        environment.sunGlitterEnabled);
    runtimeReady =
      ocean.frameCount > 2 &&
      ocean.quality === WaterQualityTier.High &&
      ocean.activeWaveCount === expectedWaveCount &&
      ocean.ringCount === 3 &&
      ocean.patchCount === 37 &&
      ocean.refractionEnabled &&
      (!reflectionRequired ||
        (ocean.reflectionSource === "planar" &&
          ocean.reflectionFilterSampleCount === 5 &&
          reflection.planarCameraCount === 1 &&
          reflection.liveRenderTargetCount === 1)) &&
      nearshoreInfrastructureReady &&
      foamInfrastructureReady &&
      splashInfrastructureReady &&
      completeShowcaseReady &&
      duskEnvironmentReady &&
      (sceneMode === "gerstner" || (showcase.boatQueryHit && showcase.boatSampleFinite));
    const finite = areFiniteShowcaseMetrics([
      frame.fps,
      frame.p95FrameMs,
      ocean.originX,
      ocean.originZ,
      ocean.nearshoreResourceBytes,
      ocean.nearshoreDynamicResourceBytes,
      ocean.surfaceDetailResourceBytes,
      ocean.foamResourceBytes,
      ocean.foamDetailResourceBytes,
      ocean.foamHistoryPeak,
      ocean.foamHistoryEnergy,
      ocean.foamHistoryCentroidX,
      ocean.foamHistoryCentroidZ,
      showcase.bathymetryTerrainVertexCount,
      showcase.wetSandResourceBytes,
      showcase.pbrTextureResourceBytes,
      showcase.photogrammetryRockSourceBytes,
      environment.resourceBytes,
      showcase.boatX,
      showcase.boatY,
      showcase.boatZ,
      showcase.wakeEnergy,
      engine.renderingStatistics.bufferMemory,
      engine.renderingStatistics.textureMemory,
      engine.renderingStatistics.totalMemory
    ]);
    const snapshot: WaterShowcaseAcceptanceSnapshot = Object.freeze({
      ready: runtimeReady,
      caseId: activeCase.id,
      runtime: "ocean",
      preset: activeCase.preset,
      runtimeError: runtimeError || null,
      finite,
      qualityTier: "high",
      opticsTier: "high",
      frame,
      resources: Object.freeze({
        bufferMemory: engine.renderingStatistics.bufferMemory,
        textureMemory: engine.renderingStatistics.textureMemory,
        totalMemory: engine.renderingStatistics.totalMemory,
        liveRenderTargets: reflection.liveRenderTargetCount ?? 0,
        liveReflectionCameras: reflection.planarCameraCount,
        meshUploadCount: ocean.meshUploadCount,
        perFrameMeshUpload: ocean.perFrameMeshUpload
      }),
      reflection: Object.freeze({
        requestedSource: reflectionSource,
        effectiveSource: ocean.reflectionSource,
        ownerCount: reflection.planarOwnerId ? 1 : 0,
        cameraCount: reflection.planarCameraCount,
        renderTargetCount: reflection.liveRenderTargetCount ?? 0,
        filterSampleCount: ocean.reflectionFilterSampleCount,
        failureCount: reflection.planarFailureCount,
        colorFormat: reflection.colorFormat,
        planarHDR: reflection.planarHDR,
        fallbackReason: reflection.fallbackReason ?? null,
        resourceBytes: reflection.resourceBytes
      }),
      refractionEnabled: ocean.refractionEnabled,
      scene: Object.freeze({
        activeWaveCount: ocean.activeWaveCount,
        ringCount: ocean.ringCount,
        patchCount: ocean.patchCount,
        visiblePatchCount: ocean.visiblePatchCount,
        frameCount: ocean.frameCount,
        islandCount: showcase.islandCount,
        cloudCount: showcase.cloudCount,
        reflectionAnchorCount: showcase.reflectionAnchorCount,
        heroRockCount: showcase.heroRockCount,
        photogrammetryRockLoaded:
          showcase.photogrammetryRockLoaded,
        photogrammetryRockInstanceCount:
          showcase.photogrammetryRockInstanceCount,
        photogrammetryRockPbrMaterialCount:
          showcase.photogrammetryRockPbrMaterialCount,
        photogrammetryRockSourceBytes:
          showcase.photogrammetryRockSourceBytes,
        distantFixtureCount: showcase.distantFixtureCount,
        pbrMaterialCount: showcase.pbrMaterialCount,
        nonPbrMaterialCount: showcase.nonPbrMaterialCount,
        boatVisible: showcase.boatVisible,
        boatQueryHit: showcase.boatQueryHit,
        boatSampleFinite: showcase.boatSampleFinite,
        wakeRibbonCount: showcase.wakeRibbonCount,
        wakeEnergy: showcase.wakeEnergy,
        microNormalEnabled: ocean.surfaceDetailEnabled,
        microNormalLayerCount: ocean.surfaceDetailLayerCount,
        microNormalTextureCount:
          ocean.surfaceDetailTextureCount,
        microNormalResourceBytes:
          ocean.surfaceDetailResourceBytes,
        environmentState: environment.stateId,
        sceneSunCount: environment.directLightCount,
        sceneSunOwned: environment.sceneSunOwned,
        proceduralSkyEnabled: environment.proceduralSkyEnabled,
        proceduralSunDiskEnabled:
          environment.proceduralSunDiskEnabled,
        ambientSphericalHarmonicsEnabled:
          environment.ambientSphericalHarmonicsEnabled,
        iblIntensity: environment.iblIntensity,
        iblTextureBound: environment.iblTextureBound,
        fogEnabled: environment.fogEnabled,
        fogDensity: environment.fogDensity,
        ambientOcclusionEnabled:
          environment.ambientOcclusionEnabled,
        sunDirectionX: environment.sunDirectionX,
        sunDirectionY: environment.sunDirectionY,
        sunDirectionZ: environment.sunDirectionZ,
        sunGlitterEnabled: environment.sunGlitterEnabled,
        environmentResourceCount: environment.resourceCount,
        hdrEnabled: camera.enableHDR,
        acesEnabled: camera.enablePostProcess && tonemapping.mode.value === TonemappingMode.ACES,
        bloomEnabled: camera.enablePostProcess && bloom.intensity.value > 0,
        planarHDR: reflection.planarHDR,
        planarColorFormat: reflection.colorFormat,
        planarResourceBytes: reflection.resourceBytes,
        bathymetryEnabled: ocean.nearshoreEnabled,
        nearshoreWaveEnabled: ocean.nearshoreWaveEnabled,
        nearshoreStateEnabled: ocean.nearshoreStateEnabled,
        nearshoreBreakerEnabled:
          ocean.nearshoreBreakerEnabled,
        breakerTexelCount: ocean.nearshoreBreakerTexelCount,
        breakerPeak: ocean.nearshoreBreakerPeak,
        thinFilmTexelCount:
          ocean.nearshoreThinFilmTexelCount,
        wetnessTexelCount:
          ocean.nearshoreWetnessTexelCount,
        wetnessPeak: ocean.nearshoreWetnessPeak,
        nearshoreSourceHash: ocean.nearshoreSourceHash ?? null,
        nearshoreWetTexelCount: ocean.nearshoreWetTexelCount,
        nearshoreDryTexelCount: ocean.nearshoreDryTexelCount,
        nearshoreResourceBytes: ocean.nearshoreResourceBytes,
        foamEnabled: ocean.foamEnabled,
        analyticWhitecapEnabled: ocean.analyticWhitecapEnabled,
        foamTextureCount: ocean.foamTextureCount,
        foamDetailTextureCount:
          ocean.foamDetailTextureCount,
        foamDetailResourceBytes:
          ocean.foamDetailResourceBytes,
        foamTargetUpdateRateHz: ocean.foamTargetUpdateRateHz,
        foamHistoryUpdateCount: ocean.foamHistoryUpdateCount,
        foamUploadCount: ocean.foamUploadCount,
        foamSourcePixelCount: ocean.foamSourcePixelCount,
        foamHistoryPixelCount: ocean.foamHistoryPixelCount,
        foamHistoryPeak: ocean.foamHistoryPeak,
        foamHistoryEnergy: ocean.foamHistoryEnergy,
        foamHistoryCentroidX: ocean.foamHistoryCentroidX,
        foamHistoryCentroidZ: ocean.foamHistoryCentroidZ,
        foamBreakerSourcePixelCount:
          ocean.foamBreakerSourcePixelCount,
        foamShoreSourcePixelCount:
          ocean.foamShoreSourcePixelCount,
        foamBreakerSourceEnabled:
          ocean.foamBreakerSourceEnabled,
        foamShoreSourceEnabled:
          ocean.foamShoreSourceEnabled,
        foamObstacleInjectionCount:
          ocean.foamObstacleInjectionCount,
        foamImpactInjectionCount:
          ocean.foamImpactInjectionCount,
        foamEventCapacity: ocean.foamEventCapacity,
        foamPendingEventCount: ocean.foamPendingEventCount,
        foamContactSamplingBudget:
          ocean.foamContactSamplingBudget,
        foamCurrentSurfaceQueryCount:
          ocean.foamCurrentSurfaceQueryCount,
        foamResourceBytes: ocean.foamResourceBytes,
        rockContactEnabled: ocean.rockContactEnabled,
        rockContactActiveCount:
          ocean.rockContactActiveCount,
        rockContactPeakEnergy:
          ocean.rockContactPeakEnergy,
        rockContactImpactAcceptedCount:
          ocean.rockContactImpactAcceptedCount,
        splashEmitterCount: splash?.activeEmitterCount ?? 0,
        splashMaterialCount: splash?.activeMaterialCount ?? 0,
        splashEnabled: splash?.enabled ?? false,
        splashHasLiveParticles:
          splash?.hasLiveParticles ?? false,
        splashEmissionCount: splash?.emissionCount ?? 0,
        splashParticleCount:
          splash?.emittedParticleCount ?? 0,
        bathymetryTerrainVisible: showcase.bathymetryTerrainVisible,
        bathymetryTerrainSourceHash:
          showcase.bathymetryTerrainSourceHash ?? null,
        bathymetryTerrainVertexCount: showcase.bathymetryTerrainVertexCount,
        wetSandEnabled: showcase.wetSandEnabled,
        wetSandTextureCount: showcase.wetSandTextureCount,
        wetSandResourceBytes: showcase.wetSandResourceBytes,
        pbrTextureCount: showcase.pbrTextureCount,
        pbrTextureResourceBytes:
          showcase.pbrTextureResourceBytes,
        completePbrTextureSetCount:
          showcase.completePbrTextureSetCount,
        environmentResourceBytes:
          environment.resourceBytes,
        oceanFeatureResourceBudgetBytes:
          ocean.surfaceDetailResourceBytes +
          ocean.nearshoreResourceBytes +
          ocean.nearshoreDynamicResourceBytes +
          ocean.foamResourceBytes +
          showcase.wetSandResourceBytes +
          showcase.pbrTextureResourceBytes +
          showcase.photogrammetryRockSourceBytes +
          environment.resourceBytes +
          reflection.resourceBytes,
        surfaceTime: surfaceTimeOverride ?? engine.time.elapsedTime,
        cameraMode: showcaseCameraMode ?? "feature"
      })
    });
    window.waterPcgAcceptance = snapshot;
  };

  const refreshFeatureState = (): void => {
    writeMetrics();
    updateAcceptance();
  };
  const resetFocusedFeatureFacts = (): void => {
    surfaceTimeOverride = initialSurfaceTimeOverride;
    oceanPreview.resetNearshoreState();
    oceanPreview.setSurfaceTimeOverride(initialSurfaceTimeOverride);
    showcaseScene.resetWetSand();
  };
  const setFocusedFeatureEnabled = (
    preset: OceanFocusedFeaturePreset,
    enabled: boolean
  ): void => {
    featureEnabled = enabled;
    switch (preset) {
      case "ocean-nearshore-waves":
        oceanPreview.setNearshoreWaveEnabled(enabled);
        break;
      case "ocean-breakers":
        oceanPreview.setNearshoreBreakerEnabled(enabled);
        oceanPreview.setFoamBreakerSourceEnabled(enabled);
        oceanPreview.resetFoam();
        break;
      case "ocean-shore-foam":
        oceanPreview.setShoreFoamEnabled(enabled);
        oceanPreview.resetFoam();
        break;
      case "ocean-rock-contact":
        oceanPreview.setRockContactEnabled(enabled);
        oceanPreview.resetRockContacts();
        oceanPreview.resetFoam();
        splashVfx?.setEnabled(enabled);
        splashVfx?.reset();
        break;
      case "ocean-micro-surface":
        oceanPreview.setConfig({
          ...oceanConfig,
          surfaceDetail: enabled
            ? oceanConfig.surfaceDetail
            : undefined
        });
        break;
      case "ocean-wetness":
        showcaseScene.setWetSandEnabled(enabled);
        break;
    }
    refreshFeatureState();
  };
  const getFocusedFeatureSignal = (
    preset: OceanFocusedFeaturePreset
  ): number => {
    const metrics = oceanPreview.metrics;
    switch (preset) {
      case "ocean-nearshore-waves":
        return metrics.nearshoreWaveEnabled
          ? metrics.nearshoreWetTexelCount
          : 0;
      case "ocean-breakers":
        return metrics.nearshoreBreakerEnabled &&
          metrics.foamBreakerSourceEnabled
          ? metrics.nearshoreBreakerPeak +
              metrics.foamBreakerSourcePixelCount
          : 0;
      case "ocean-shore-foam":
        return metrics.foamShoreSourceEnabled
          ? metrics.foamShoreSourcePixelCount
          : 0;
      case "ocean-rock-contact":
        return metrics.rockContactEnabled &&
          metrics.rockContactActiveCount > 0 &&
          metrics.foamHistoryPixelCount > 0 &&
          metrics.rockContactImpactAcceptedCount > 0 &&
          (splashVfx?.metrics.emissionCount ?? 0) > 0
          ? Math.max(
              metrics.rockContactPeakEnergy,
              metrics.foamHistoryPixelCount,
              metrics.rockContactImpactAcceptedCount,
              splashVfx?.metrics.emissionCount ?? 0
            )
          : 0;
      case "ocean-micro-surface":
        return metrics.surfaceDetailEnabled
          ? metrics.surfaceDetailLayerCount
          : 0;
      case "ocean-wetness": {
        const showcase = showcaseScene.metrics;
        return showcase.wetSandEnabled
          ? Math.max(
              metrics.nearshoreWetnessPeak,
              metrics.nearshoreWetnessTexelCount
            )
          : 0;
      }
    }
  };

  let featureApi: WaterFeatureCaseApi | undefined;
  if (activeCase.preset === "gerstner-waves") {
    featureApi = createWaterFeatureCaseApi({
      caseId: activeCase.id,
      preset: activeCase.preset,
      getReady: () => runtimeReady,
      getRuntimeError: () => runtimeError,
      setEnabled(enabled): void {
        featureEnabled = enabled;
        oceanPreview.setConfig(
          enabled
            ? oceanConfig
            : {
                ...oceanConfig,
                waveAsset: {
                  schemaVersion: WaterWaveSchemaVersion.V1,
                  model: WaterWaveModel.None
                }
              }
        );
        oceanPreview.setReflectionVisible(true);
        refreshFeatureState();
      },
      reset(): void {
        surfaceTimeOverride = initialSurfaceTimeOverride;
        oceanPreview.setSurfaceTimeOverride(
          initialSurfaceTimeOverride
        );
        featureEnabled = true;
        oceanPreview.setConfig(oceanConfig);
        oceanPreview.setReflectionVisible(true);
        refreshFeatureState();
      },
      getSignal: () => oceanPreview.metrics.activeWaveCount
    });
  } else if (isOceanFocusedFeaturePreset(activeCase.preset)) {
    const focusedPreset = activeCase.preset;
    featureApi = createWaterFeatureCaseApi({
      caseId: activeCase.id,
      preset: focusedPreset,
      getReady: () => runtimeReady,
      getRuntimeError: () => runtimeError,
      setEnabled: (enabled) =>
        setFocusedFeatureEnabled(focusedPreset, enabled),
      reset(): void {
        resetFocusedFeatureFacts();
        setFocusedFeatureEnabled(focusedPreset, true);
      },
      getSignal: () => getFocusedFeatureSignal(focusedPreset)
    });
  }
  if (featureApi) window.waterPcgFeature = featureApi;

  runtimeWindow.waterPcgSetSurfaceTime = (elapsedTime?: number): void => {
    surfaceTimeOverride = elapsedTime === undefined ? undefined : Math.max(0, elapsedTime);
    oceanPreview.setSurfaceTimeOverride(surfaceTimeOverride);
    showcaseScene.update(surfaceTimeOverride ?? engine.time.elapsedTime);
    writeMetrics();
    updateAcceptance();
  };
  runtimeWindow.waterPcgGetOceanMetrics = (): OceanPreviewMetrics => oceanPreview.metrics;
  runtimeWindow.waterPcgGetReflectionMetrics = (): WaterReflectionServiceMetrics => reflectionService.metrics;
  runtimeWindow.waterPcgSetOceanReflectionSource = (source: WaterReflectionSource): void => {
    reflectionSource = source;
    oceanPreview.setReflectionSource(source);
    reflectionService.update();
    oceanPreview.refreshReflectionBinding();
    writeMetrics();
    updateAcceptance();
  };
  runtimeWindow.waterPcgSetOceanLodDebug = (enabled: boolean): void => oceanPreview.setLodDebug(enabled);
  runtimeWindow.waterPcgSetOceanCameraPosition = (worldX: number, worldZ: number): void => {
    if (!Number.isFinite(worldX) || !Number.isFinite(worldZ)) {
      throw new Error("Ocean camera XZ position must be finite.");
    }
    const position = cameraEntity.transform.worldPosition;
    cameraEntity.transform.setPosition(worldX, position.y, worldZ);
    cameraEntity.transform.lookAt(orbit.target);
    showcaseCameraController?.syncFromTransform();
    oceanPreview.setCameraPosition(worldX, worldZ);
  };
  runtimeWindow.waterPcgStressOcean = (iterations?: number): OceanPreviewStressResult =>
    oceanPreview.stressReconfigure(iterations);

  if (activeCase.preset === "hero-ocean") {
    let currentState = "hero";
    const applyCaptureState = (state: keyof typeof OCEAN_CAPTURE_STATES): void => {
      const capture = OCEAN_CAPTURE_STATES[state];
      const [positionX, positionY, positionZ] = capture.position;
      const [lookX, lookY, lookZ] = capture.target;
      currentState = state;
      captureLocked = true;
      autoTourActive = false;
      showcaseCameraController?.setFreeControlActive(false);
      surfaceTimeOverride = capture.time;
      oceanPreview.setSurfaceTimeOverride(capture.time);
      oceanPreview.resetNearshoreState();
      oceanPreview.resetRockContacts();
      oceanPreview.resetFoam();
      showcaseScene.resetWetSand();
      splashVfx?.reset();
      showcaseScene.update(capture.time);
      orbit.target.set(lookX, lookY, lookZ);
      cameraEntity.transform.setPosition(positionX, positionY, positionZ);
      cameraEntity.transform.lookAt(new Vector3(lookX, lookY, lookZ));
      showcaseCameraController?.syncFromTransform();
    };
    window.waterPcgShowcase = {
      states: Object.freeze(Object.keys(OCEAN_CAPTURE_STATES)),
      get currentState() {
        return currentState;
      },
      setCaptureState(state: string): void {
        if (!(state in OCEAN_CAPTURE_STATES)) throw new Error(`Unknown Ocean capture state: ${state}.`);
        applyCaptureState(state as keyof typeof OCEAN_CAPTURE_STATES);
      },
      reset(): void {
        showcaseCameraController?.setFreeControlActive(false);
        captureLocked = false;
        autoTourActive = showcaseCameraMode === "tour";
        currentState = "hero";
        surfaceTimeOverride = initialSurfaceTimeOverride;
        oceanPreview.setSurfaceTimeOverride(initialSurfaceTimeOverride);
        orbit.target.set(targetX, targetY, targetZ);
        cameraEntity.transform.setPosition(cameraX, cameraY, cameraZ);
        cameraEntity.transform.lookAt(new Vector3(targetX, targetY, targetZ));
        showcaseCameraController?.syncFromTransform();
        showcaseCameraController?.setFreeControlActive(showcaseCameraMode === "free");
      }
    };
  }

  const guiState = {
    lodDebug: sceneMode === "lod-debug",
    reflection: reflectionSource,
    fixedTime: -1
  };
  const gui = new dat.GUI({ name: "Ocean Showcase Diagnostics", width: 290 });
  gui
    .add(guiState, "lodDebug")
    .name("LOD colors")
    .onChange((enabled: boolean) =>
      oceanPreview.setLodDebug(enabled)
    );
  gui
    .add(guiState, "reflection", ["sky", "planar"])
    .name("Reflection")
    .onChange((source: WaterReflectionSource) =>
      runtimeWindow.waterPcgSetOceanReflectionSource?.(
        source
      )
    );
  gui
    .add(guiState, "fixedTime", -1, 60, 0.25)
    .name("Surface time")
    .onChange((value: number) =>
      runtimeWindow.waterPcgSetSurfaceTime?.(
        value < 0 ? undefined : value
      )
    );

  class OceanShowcaseUpdateScript extends Script {
    onUpdate(deltaTime: number): void {
      try {
        frameSampler.record(deltaTime);
        const elapsedTime = surfaceTimeOverride ?? engine.time.elapsedTime;
        if (sceneMode === "hero" && autoTourActive && !captureLocked) {
          const tourPhase = elapsedTime * 0.035;
          cameraEntity.transform.setPosition(
            cameraX + Math.sin(tourPhase) * 2.4,
            cameraY + Math.sin(tourPhase * 0.6) * 0.35,
            cameraZ + Math.cos(tourPhase) * 1.8
          );
          cameraEntity.transform.lookAt(new Vector3(targetX, targetY, targetZ));
        }
        oceanPreview.update(
          deltaTime,
          cameraEntity.transform.worldPosition
        );
        splashVfx?.update();
        showcaseScene.update(elapsedTime, deltaTime);
        reflectionService.update();
        oceanPreview.refreshReflectionBinding();
        writeMetrics();
        updateAcceptance();
      } catch (error) {
        runtimeError = error instanceof Error ? error.message : "Ocean showcase update failed.";
        writeMetrics();
        updateAcceptance();
      }
    }
  }
  root.addComponent(OceanShowcaseUpdateScript);
  writeMetrics();
  updateAcceptance();

  let disposedSnapshot: OceanShowcaseLifecycleSnapshot | undefined;
  const cleanup = (): OceanShowcaseLifecycleSnapshot => {
    if (disposedSnapshot) return disposedSnapshot;
    lifecycleDisposed = true;
    engine.pause();
    window.removeEventListener("resize", resize);
    window.removeEventListener("keydown", handleCameraKeyDown);
    oceanCanvas?.removeEventListener("pointerdown", pauseAutoTour);
    oceanCanvas?.removeEventListener("wheel", pauseAutoTour);
    showcaseCameraController?.destroy();
    gui?.destroy();
    showcaseScene.destroy();
    coastalRockAsset.destroy();
    pbrTextureLibrary.destroy();
    splashVfx?.destroy();
    oceanPreview.destroy();
    duskEnvironment.destroy();
    featureBroker.destroy();
    reflectionLease.release();
    root.destroy();
    disposedSnapshot = createLifecycleSnapshot(true);
    delete runtimeWindow.waterPcgSetSurfaceTime;
    delete runtimeWindow.waterPcgGetOceanMetrics;
    delete runtimeWindow.waterPcgGetReflectionMetrics;
    delete runtimeWindow.waterPcgSetOceanReflectionSource;
    delete runtimeWindow.waterPcgSetOceanLodDebug;
    delete runtimeWindow.waterPcgSetOceanCameraPosition;
    delete runtimeWindow.waterPcgStressOcean;
    delete runtimeWindow.waterPcgOceanLifecycle;
    delete window.waterPcgAcceptance;
    delete window.waterPcgShowcase;
    if (window.waterPcgFeature === featureApi) delete window.waterPcgFeature;
    return disposedSnapshot;
  };
  if (activeCase.preset === "hero-ocean") {
    runtimeWindow.waterPcgOceanLifecycle = {
      get disposed() {
        return lifecycleDisposed;
      },
      snapshot: () => createLifecycleSnapshot(),
      setFeatureStackEnabled: setLifecycleFeatureStackEnabled,
      reset: resetLifecycleState,
      dispose: cleanup
    };
  }
  window.addEventListener(
    "beforeunload",
    () => {
      cleanup();
    },
    { once: true }
  );
  engine.run();
}

void bootstrapOceanShowcase().catch((error: unknown) => {
  const runtimeError = error instanceof Error ? error : new Error("Ocean showcase bootstrap failed.");
  console.error(runtimeError);
  const fallback: WaterShowcaseAcceptanceSnapshot = Object.freeze({
    ready: false,
    caseId: resolveWaterPcgCase(window.location).id,
    runtime: "ocean",
    preset: resolveWaterPcgCase(window.location).preset,
    runtimeError: runtimeError.message,
    finite: false,
    qualityTier: "high",
    opticsTier: "high",
    frame: Object.freeze({ sampleCount: 0, fps: 0, p95FrameMs: 0, finite: false }),
    resources: Object.freeze({
      bufferMemory: 0,
      textureMemory: 0,
      totalMemory: 0,
      liveRenderTargets: 0,
      liveReflectionCameras: 0,
      meshUploadCount: 0,
      perFrameMeshUpload: false
    }),
    reflection: Object.freeze({
      requestedSource: "planar",
      effectiveSource: "sky",
      ownerCount: 0,
      cameraCount: 0,
      renderTargetCount: 0,
      filterSampleCount: 1,
      failureCount: 0
    }),
    refractionEnabled: false,
    scene: Object.freeze({})
  });
  window.waterPcgAcceptance = fallback;
});
