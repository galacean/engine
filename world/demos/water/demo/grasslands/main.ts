import {
  hashStableValue,
  sampleLakeBoundary,
  sampleLakeTerrainHeight,
  validateHeightfieldWaterDescriptor
} from "@galacean/engine-water/water/compiler/index";
import {
  createHeightfieldWaterBodySourceDescriptorV1,
  createHeightfieldWaterRepresentationDataV1,
  sampleWaterTerrainHeight,
  WaterQualityTier
} from "@galacean/engine-water/water/index";
import type { LakeTerrainPreset } from "./landscape/LakeBasinTerrain.ts";
import { createLakeEditRevision, LakeEditSession, type LakeEditRevision } from "./landscape/LakeEditSession.ts";

import type { LakeBoundaryV1 } from "@galacean/engine-water/water/index";
import {
  createHeightfieldWaterBaseQueryResult,
  HeightfieldWaterBackend,
  HeightfieldWaterBaseQueryService,
  HeightfieldWaterCompileWorkerClient,
  type HeightfieldWaterBackendRuntimeContext
} from "@galacean/engine-water/water/runtime/heightfield/index";
import {
  createGrasslandsLakeAuthoringControls,
  withLakeTerrainEditAvailability
} from "./GrasslandsLakeAuthoringControls.ts";
import { GrasslandsLakeShorelineMarkers } from "./GrasslandsLakeShorelineMarkers.ts";

import {
  BloomEffect,
  Color,
  ColorAdjustmentsEffect,
  DayNightProceduralSky,
  DayNightSolarPosition,
  Downsampling,
  Layer,
  PostProcess,
  RealtimeIBLBaker,
  Script,
  ShaderProperty,
  ShadowCascadesMode,
  TonemappingEffect,
  TonemappingMode,
  Vector4,
  WebGLEngine,
  WebGLMode,
  type Entity
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { resizeEngineCanvasByClientSize } from "../resizeEngineCanvas.ts";

import type {
  HeightfieldWaterCompiledData,
  WaterCompiledResourceReadPort
} from "@galacean/engine-water/water/compiler/index";

import type { HeightfieldWaterSurfaceAppearanceFeatureFlags } from "@galacean/engine-water/water/runtime/heightfield/config";
import type { HeightfieldWaterRuntimeController } from "@galacean/engine-water/water/runtime/heightfield/index";
import {
  CameraWaterFeatureBroker,
  WaterBackendRegistry,
  WaterBodyAssetRegistry,
  WaterBodyLoader,
  WaterEnvironmentReflectionProvider,
  WaterReflectionPreRenderSynchronizer,
  WaterReflectionService,
  WaterWorld,
  type WaterBodyActivationHandle
} from "@galacean/engine-water/water/runtime/index";

import type { WaterOpticalProfile, WaterSurfaceAppearanceBindingV2 } from "@galacean/engine-water/water/runtime/index";
import { WaterRuntimeResourceRegistry } from "@galacean/engine-water/water/runtime/resources/index";

import {
  LAKE_SHOWCASE_OPTICAL_PROFILE,
  lakeLookPresetIdForQuality
} from "@galacean/engine-water/water/presets/lake/index";
import {
  LAKE_NORMAL_RESOURCE,
  LakeNormalAssetLoader,
  type LakeNormalAssetSource
} from "@galacean/engine-water/water/resources/lake/index";
import { WaterLandscapeAssets } from "../shared/WaterLandscapeAssets.ts";
import { createShowcaseCameraController, type ShowcaseCameraController } from "../showcase/ShowcaseCameraControl.ts";
import { resolveShowcaseCameraMode, SHOWCASE_CAMERA_MOVEMENT_SPEED } from "../showcase/ShowcaseCameraPolicy.ts";
import { GrasslandsAsyncTeardownBarrier } from "./GrasslandsAsyncTeardownBarrier.ts";
import {
  GRASSLANDS_ENVIRONMENT_REFLECTION_EXPOSURE,
  GRASSLANDS_ENVIRONMENT_REFLECTION_HDR,
  GRASSLANDS_ENVIRONMENT_REFLECTION_ROTATION_DEGREES
} from "./GrasslandsEnvironmentReflectionConfig.ts";
import { createGrasslandsPcgFixture } from "./GrasslandsPcgFixture.ts";
import {
  GRASSLANDS_LAKE_MAX_BASIN_DEPTH,
  GRASSLANDS_STYLIZED_WATER_INSTANCE_ID,
  grasslandsQualityPresetIdForQuality,
  registerGrasslandsStylizedWaterBodyAuthoring
} from "./GrasslandsWaterBodyAuthoring.ts";

import {
  createGrasslandsReferenceLightingReadback,
  GrasslandsLightingController
} from "./GrasslandsLightingController.ts";
import { GRASSLANDS_PCG_PRESET, GRASSLANDS_SHARED_SHOWCASE_CAPTURE_POSES } from "./GrasslandsPcgPreset.ts";

import {
  PROCEDURAL_SKY_REALTIME_IBL_OPTIONS,
  PROCEDURAL_SKY_SOLAR_POSITION
} from "@galacean/engine-environment/lighting/ProceduralSkyLightingProfile";

import type { GrasslandsVector3 } from "./GrasslandsPcgTypes.ts";
import { GrasslandsSceneController } from "./GrasslandsSceneController.ts";

import { resolveGrasslandsSurfaceTimeOverride } from "./GrasslandsSurfaceTimePolicy.ts";
const SCENE_WEATHER_STATE = ShaderProperty.getByName("scene_WeatherState");
const SCENE_WEATHER_TIME = ShaderProperty.getByName("scene_WeatherTime");
const GRASSLANDS_INITIAL_LIGHTING_READBACK = createGrasslandsReferenceLightingReadback();
const GRASSLANDS_TOP_DOWN_CAMERA_POSE = Object.freeze({
  position: Object.freeze([0, 90, 0] as const),
  target: Object.freeze([0, 0, 0] as const),
  worldUp: Object.freeze([0, 0, -1] as const)
});
type GrasslandsCameraPose = keyof typeof GRASSLANDS_SHARED_SHOWCASE_CAPTURE_POSES | "top-down";
const GRASSLANDS_DEVTOOLS_CAMERA_POSES = Object.freeze({
  "Hero view": "hero",
  "Interaction view": "interaction",
  "Detail view": "detail",
  "Top-down view": "top-down"
} satisfies Readonly<Record<string, GrasslandsCameraPose>>);
const DEFAULT_APPEARANCE_FEATURE_FLAGS: Readonly<HeightfieldWaterSurfaceAppearanceFeatureFlags> = Object.freeze({
  externalNormal: true,
  depthTint: true,
  coastalAlpha: true,
  contactFoam: true,
  directSpecular: true
});

function freezeVector3(x: number, y: number, z: number): GrasslandsVector3 {
  return Object.freeze([x, y, z] as const);
}

function isGrasslandsCameraPose(value: string): value is GrasslandsCameraPose {
  return value === "top-down" || Object.hasOwn(GRASSLANDS_SHARED_SHOWCASE_CAPTURE_POSES, value);
}

function vectorsMatch(actual: GrasslandsVector3 | undefined, expected: GrasslandsVector3, epsilon = 1e-6): boolean {
  return actual !== undefined && actual.every((value, axis) => Math.abs(value - expected[axis]) <= epsilon);
}

function qualityOpticsTier(quality: WaterQualityTier): "off" | "medium" | "high" {
  return quality === WaterQualityTier.Low ? "off" : quality === WaterQualityTier.High ? "high" : "medium";
}

function downsamplingLabel(value: Downsampling, enabled: boolean): "off" | "none" | "2x" {
  if (!enabled) return "off";
  return value === Downsampling.None ? "none" : "2x";
}

function readErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function bootstrapGrasslandsShowcase(): Promise<void> {
  const bootstrapSearch = new URLSearchParams(window.location.search);
  const requestedSeed = bootstrapSearch.has("seed") ? Number(bootstrapSearch.get("seed")) : GRASSLANDS_PCG_PRESET.seed;
  const requestedRainRate = Number(bootstrapSearch.get("rainRate") ?? 0);
  const rainRate = Number.isFinite(requestedRainRate) ? Math.min(Math.max(requestedRainRate, 0), 1) : 0;
  const weatherState = new Vector4(rainRate, 0, 0, 0);
  const fixture = createGrasslandsPcgFixture(requestedSeed);
  const initialLakeRevision = createLakeEditRevision(
    fixture.descriptor,
    {
      boundary: fixture.descriptor.lakeBoundary!,
      basin: { referenceLevel: 0, depth: 3.2, shoreWidth: 8 }
    },
    0
  );
  let currentLakeDescriptor = initialLakeRevision.descriptor;
  let lakeEditSession: LakeEditSession | undefined;
  let lakeShorelineMarkers: GrasslandsLakeShorelineMarkers | undefined;
  let engine: WebGLEngine | undefined;
  let root: Entity | undefined;
  let runtimeController: HeightfieldWaterRuntimeController | undefined;
  let waterBodyHandle: WaterBodyActivationHandle | undefined;
  let waterBodyLoader: WaterBodyLoader | undefined;
  let waterBackend: HeightfieldWaterBackend | undefined;
  let waterWorld: WaterWorld | undefined;
  let runtimeResourceRegistry: WaterRuntimeResourceRegistry | undefined;
  let cameraFeatureBroker: CameraWaterFeatureBroker | undefined;
  let reflectionService: WaterReflectionService | undefined;
  let reflectionServiceLease: ReturnType<typeof WaterReflectionService.acquire> | undefined;
  let reflectionSynchronizer: WaterReflectionPreRenderSynchronizer | undefined;
  let environmentReflectionProvider: WaterEnvironmentReflectionProvider | undefined;
  let environmentIBLBaker: RealtimeIBLBaker | undefined;
  let proceduralSky: DayNightProceduralSky | undefined;
  let sceneController: GrasslandsSceneController | undefined;
  let lightingController: GrasslandsLightingController | undefined;
  let environmentAssets: WaterLandscapeAssets | undefined;
  let cameraController: ShowcaseCameraController | undefined;
  let assetLoader: LakeNormalAssetLoader | undefined;
  let compileWorker: HeightfieldWaterCompileWorkerClient | undefined;
  let activeResource: WaterCompiledResourceReadPort<HeightfieldWaterCompiledData> | undefined;
  let appearanceBinding: Readonly<WaterSurfaceAppearanceBindingV2> | undefined;
  let currentQuality = WaterQualityTier.High;
  let appearanceEnabled = true;
  let reflectionEnabled = true;
  let runtimeOperationalReady = false;
  let runtimeError: string | null = null;
  let cameraMode: "free" | "fixed" = "fixed";
  let currentCameraPose: GrasslandsCameraPose = "hero";
  let automation = false;
  let normalSource: LakeNormalAssetSource = "tracked";
  let rebuildRevision = 0;
  let activeLoadAbort: AbortController | undefined;
  let rebuildQueue: Promise<void> = Promise.resolve();
  let lifecycleDisposed = false;
  let runtimeControllerDestroyed = false;
  let compileWorkerDisposed = false;
  let cameraFeatureBrokerDestroyed = false;
  let cameraControllerDestroyed = false;
  let sceneControllerDestroyed = false;
  let environmentAssetsDestroyed = false;
  let rootDestroyed = false;
  let engineDestroyed = false;
  let engineUpdateCount = 0;
  let weatherTime = 0;
  let lifecycleDisposeMode: "manual" | "failure" = "manual";
  let waterTeardownStarted = false;
  let currentAppearanceFeatureFlags: Readonly<HeightfieldWaterSurfaceAppearanceFeatureFlags> =
    DEFAULT_APPEARANCE_FEATURE_FLAGS;
  let refractionEnabled = true;
  let beforeUnloadHandler: (() => void) | undefined;
  let compileAndActivateImpl: (quality: WaterQualityTier) => Promise<void> = async () => {
    throw new Error("Grasslands runtime is not initialized.");
  };
  let cleanupImpl: (mode?: "manual" | "failure") => void;
  let finalizeEngineTeardown: (() => void) | undefined;
  const teardownBarrier = new GrasslandsAsyncTeardownBarrier(() => finalizeEngineTeardown?.());

  const publishWaterResource = (resource: WaterCompiledResourceReadPort<HeightfieldWaterCompiledData>): void => {
    activeResource = resource;
    if (resource.data.lakeBoundary) lakeShorelineMarkers?.update(resource.data.lakeBoundary);
  };

  const synchronizePublishedRuntime = (): HeightfieldWaterRuntimeController | undefined => {
    const nextRuntime = waterBackend?.getRuntimeController(GRASSLANDS_STYLIZED_WATER_INSTANCE_ID);
    const nextResource = waterBodyHandle?.resource as
      | WaterCompiledResourceReadPort<HeightfieldWaterCompiledData>
      | undefined;
    if (!nextRuntime || !nextResource) return runtimeController;
    if (nextRuntime === runtimeController && nextResource === activeResource) return runtimeController;
    runtimeController = nextRuntime;
    appearanceBinding = runtimeController.surfaceAppearanceBinding;
    publishWaterResource(nextResource);
    runtimeController.flushDeferredResources();
    return runtimeController;
  };

  const requireRuntime = (): HeightfieldWaterRuntimeController => {
    const activeRuntime = synchronizePublishedRuntime();
    if (!activeRuntime || lifecycleDisposed) throw new Error("Grasslands runtime is unavailable.");
    return activeRuntime;
  };

  const requireScene = (): GrasslandsSceneController => {
    if (!sceneController || lifecycleDisposed) throw new Error("Grasslands scene is unavailable.");
    return sceneController;
  };

  const applyCameraPose = (state: GrasslandsCameraPose, restoreFreeControl: boolean): void => {
    const scene = requireScene();
    const activeCameraController = cameraController;
    activeCameraController?.setFreeControlActive(false);
    if (state === "top-down") {
      const { position, target, worldUp } = GRASSLANDS_TOP_DOWN_CAMERA_POSE;
      scene.setCameraPose(position, target, worldUp);
    } else {
      const pose = GRASSLANDS_SHARED_SHOWCASE_CAPTURE_POSES[state];
      scene.setCameraPose(pose.position, pose.target);
    }
    activeCameraController?.syncFromTransform();
    activeCameraController?.setFreeControlActive(restoreFreeControl && cameraMode === "free");
    currentCameraPose = state;
  };
  const resetHeroCamera = (): void => applyCameraPose("hero", true);

  const restoreAllContactProbes = (): void => {
    const scene = requireScene();
    for (const rock of fixture.anchorRocks) scene.restoreContactProbe(rock.id);
  };

  const applyOpticalPresentation = (
    controller: HeightfieldWaterRuntimeController,
    quality: WaterQualityTier = currentQuality
  ): void => {
    const opticalProfile: WaterOpticalProfile = Object.freeze({
      ...LAKE_SHOWCASE_OPTICAL_PROFILE,
      reflectionIntensity: reflectionEnabled ? LAKE_SHOWCASE_OPTICAL_PROFILE.reflectionIntensity : 0
    });
    controller.setOpticalProfile(opticalProfile);
    controller.setRefractionEnabled(refractionEnabled && quality !== WaterQualityTier.Low);
    waterBodyHandle?.refreshReflectionBinding();
  };

  const recordCleanupError = (stage: string, error: unknown): void => {
    const details = error instanceof Error ? (error.stack ?? error.message) : String(error);
    runtimeError ??= `Grasslands cleanup ${stage} failed: ${details}`;
  };

  finalizeEngineTeardown = (): void => {
    if (assetLoader) {
      try {
        assetLoader.requestDisposeAfterRuntimeDetach();
      } catch (error) {
        recordCleanupError("asset-loader-dispose", error);
      }
    }
    if (cameraController && !cameraControllerDestroyed) {
      try {
        cameraController.destroy();
        cameraControllerDestroyed = true;
      } catch (error) {
        recordCleanupError("camera-controller-destroy", error);
      }
    }
    if (sceneController && !sceneControllerDestroyed) {
      try {
        lightingController = undefined;
        lakeShorelineMarkers?.destroy();
        lakeShorelineMarkers = undefined;
        sceneController.destroy();
        sceneControllerDestroyed = true;
      } catch (error) {
        recordCleanupError("scene-controller-destroy", error);
      }
    }
    if (environmentAssets && !environmentAssetsDestroyed) {
      try {
        environmentAssets.destroyAfterSceneDetach();
        environmentAssetsDestroyed = true;
      } catch (error) {
        recordCleanupError("environment-assets-destroy", error);
      }
    }
    if (root && !rootDestroyed) {
      try {
        root.destroy();
        rootDestroyed = true;
      } catch (error) {
        recordCleanupError("root-destroy", error);
      }
    }
    if (engine && !engineDestroyed) {
      try {
        engine.destroy();
        engineDestroyed = true;
      } catch (error) {
        recordCleanupError("engine-destroy", error);
      }
      delete document.documentElement.dataset.waterPcgAutomation;
    }
  };

  const destroyWaterRuntimeOwned = async (): Promise<void> => {
    const run = async (stage: string, operation: () => void | Promise<void>): Promise<void> => {
      try {
        await operation();
      } catch (error) {
        recordCleanupError(stage, error);
      }
    };
    activeLoadAbort?.abort();
    activeLoadAbort = undefined;
    await run("lake-edit-session-dispose", async () => {
      await lakeEditSession?.dispose();
    });
    await run("water-body-loader-destroy", async () => {
      await waterBodyLoader?.destroy();
    });
    waterBodyHandle = undefined;
    runtimeControllerDestroyed = true;
    activeResource = undefined;
    await run("runtime-resource-registry-destroy", async () => {
      await runtimeResourceRegistry?.destroy();
    });
    appearanceBinding = undefined;
    await run("water-world-destroy", () => {
      waterWorld?.destroy();
    });
    await run("compile-worker-dispose", () => {
      if (compileWorker && !compileWorkerDisposed) {
        compileWorker.dispose();
        compileWorkerDisposed = true;
      }
    });
    await run("camera-feature-broker-destroy", () => {
      if (cameraFeatureBroker && !cameraFeatureBrokerDestroyed) {
        cameraFeatureBroker.destroy();
        cameraFeatureBrokerDestroyed = true;
      }
    });
    await run("reflection-pre-render-synchronizer-destroy", () => {
      if (reflectionSynchronizer) {
        reflectionSynchronizer.enabled = false;
        reflectionSynchronizer.clear();
        reflectionSynchronizer.destroy();
        reflectionSynchronizer = undefined;
      }
    });
    await run("environment-reflection-provider-destroy", () => {
      environmentReflectionProvider?.destroy();
      environmentReflectionProvider = undefined;
    });
    await run("environment-ibl-destroy", () => {
      environmentIBLBaker?.destroy();
      environmentIBLBaker = undefined;
    });
    await run("procedural-sky-destroy", () => {
      proceduralSky?.destroy();
      proceduralSky = undefined;
    });
    await run("reflection-service-release", () => {
      reflectionServiceLease?.release();
      reflectionServiceLease = undefined;
      reflectionService = undefined;
    });
  };

  cleanupImpl = (mode = "manual"): void => {
    lifecycleDisposeMode = mode;
    const firstTeardownRequest = !lifecycleDisposed;
    if (firstTeardownRequest) {
      rebuildRevision++;
      lifecycleDisposed = true;
      runtimeOperationalReady = false;
      window.removeEventListener("resize", resizeCanvas);
      if (beforeUnloadHandler) window.removeEventListener("beforeunload", beforeUnloadHandler);
      lakeEditSession?.cancel();
      delete (window as Window & { lakeDemo?: unknown }).lakeDemo;
      activeLoadAbort?.abort();
    } else if (mode === "failure") {
    } else if (mode === "manual") {
    }

    if (engine && !engineDestroyed) engine.pause();
    if (!waterTeardownStarted) {
      waterTeardownStarted = true;
      void teardownBarrier.track(destroyWaterRuntimeOwned());
    }
    teardownBarrier.requestFinalize();
  };

  const resizeCanvas = (): void => {
    if (engine) resizeEngineCanvasByClientSize(engine);
  };

  beforeUnloadHandler = () => {
    cleanupImpl();
  };
  window.addEventListener("beforeunload", beforeUnloadHandler, { once: true });

  try {
    const routeIdentity = {
      caseId: document.documentElement.dataset.waterPcgCase,
      runtime: document.documentElement.dataset.waterPcgRuntime,
      preset: document.documentElement.dataset.waterPcgPreset
    };
    if (
      routeIdentity.caseId !== GRASSLANDS_PCG_PRESET.caseId ||
      routeIdentity.runtime !== GRASSLANDS_PCG_PRESET.runtime ||
      routeIdentity.preset !== GRASSLANDS_PCG_PRESET.preset
    ) {
      throw new Error("Grasslands route identity mismatch.");
    }

    const search = bootstrapSearch;
    const resolvedCameraMode = resolveShowcaseCameraMode(search, false);
    cameraMode = resolvedCameraMode === "free" ? "free" : "fixed";
    automation = cameraMode === "fixed";
    document.documentElement.dataset.waterPcgAutomation = String(automation);
    normalSource = search.get("normalSource") === "local" ? "local-override" : "tracked";

    const engineConfiguration = {
      canvas: "canvas",
      shaderCompiler: new ShaderCompiler(),
      graphicDeviceOptions: {
        webGLMode: WebGLMode.WebGL2
      }
    } as unknown as Parameters<typeof WebGLEngine.create>[0];
    const createdEngine = await teardownBarrier.track(
      WebGLEngine.create(engineConfiguration).then((createdEngine) => {
        engine = createdEngine;
        return createdEngine;
      })
    );
    engine = createdEngine;
    if (lifecycleDisposed) {
      cleanupImpl();
      return;
    }
    resizeEngineCanvasByClientSize(engine);
    window.addEventListener("resize", resizeCanvas);

    const scene = engine.sceneManager.activeScene!;
    scene.shaderData.setVector4(SCENE_WEATHER_STATE, weatherState);
    scene.shaderData.setFloat(SCENE_WEATHER_TIME, weatherTime);
    scene.background.solidColor = new Color(0.055, 0.11, 0.105, 1);
    root = scene.createRootEntity("grasslands-water-showcase");
    assetLoader = new LakeNormalAssetLoader(engine, {
      strict: true,
      source: normalSource,
      sourceUrl:
        normalSource === "local-override"
          ? new URL(
              "../../../../../packages/water/src/water/resources/lake/assets/grasslands-water-normal-1024.png",
              import.meta.url
            ).href
          : undefined,
      enableDevelopmentLocalOverride:
        normalSource === "local-override" && search.get("developmentLocalOverride") === "1"
    });
    const loadedEnvironmentAssets = await teardownBarrier.track(
      WaterLandscapeAssets.load(engine).then((loaded) => {
        environmentAssets = loaded;
        return loaded;
      })
    );
    if (lifecycleDisposed) {
      cleanupImpl();
      return;
    }
    sceneController = new GrasslandsSceneController(engine, root, loadedEnvironmentAssets, {
      ...fixture,
      descriptor: currentLakeDescriptor,
      terrain: { ...fixture.terrain, heightfield: initialLakeRevision.terrain }
    });
    lakeShorelineMarkers = new GrasslandsLakeShorelineMarkers(root, {
      ...fixture.terrain,
      heightfield: initialLakeRevision.terrain
    });
    scene.sun = sceneController.directLight;
    scene.shadowDistance = 90;
    scene.shadowCascades = ShadowCascadesMode.TwoCascades;
    proceduralSky = new DayNightProceduralSky(
      scene,
      new DayNightSolarPosition(PROCEDURAL_SKY_SOLAR_POSITION),
      "GrasslandsProceduralSky"
    );
    environmentIBLBaker = new RealtimeIBLBaker(scene, PROCEDURAL_SKY_REALTIME_IBL_OPTIONS);
    lightingController = new GrasslandsLightingController(scene.ambientLight, sceneController, "runtime-sky", () => {
      environmentIBLBaker?.requestBake();
    });
    // The accepted source scene renders this material into HDR before ACES. Keep
    // that scene-owned color pipeline outside the Water asset/closure.
    sceneController.camera.enableHDR = true;
    sceneController.camera.enablePostProcess = true;
    const postProcess = root.createChild("grasslands-visual-parity-post-process").addComponent(PostProcess);
    const tonemapping = postProcess.addEffect(TonemappingEffect)!;
    tonemapping.mode.value = TonemappingMode.ACES;
    const colorAdjustments = postProcess.addEffect(ColorAdjustmentsEffect)!;
    colorAdjustments.postExposure.value = 1;
    colorAdjustments.temperature.value = 10;
    const bloom = postProcess.addEffect(BloomEffect)!;
    bloom.threshold.value = 0.5;
    bloom.intensity.value = 0.35;
    bloom.scatter.value = 0.6;
    cameraController = createShowcaseCameraController(sceneController.cameraEntity, {
      mode: cameraMode,
      movementSpeed: SHOWCASE_CAMERA_MOVEMENT_SPEED.grasslands
    });

    cameraFeatureBroker = new CameraWaterFeatureBroker(sceneController.camera);
    reflectionServiceLease = WaterReflectionService.acquire(engine, root, sceneController.camera);
    reflectionService = reflectionServiceLease.service;
    environmentReflectionProvider = new WaterEnvironmentReflectionProvider({
      service: reflectionService,
      id: "water-pcg-grasslands-scene-environment",
      source: {
        ambientLight: scene.ambientLight,
        rotationDegrees: GRASSLANDS_ENVIRONMENT_REFLECTION_ROTATION_DEGREES,
        exposure: GRASSLANDS_ENVIRONMENT_REFLECTION_EXPOSURE,
        hdr: GRASSLANDS_ENVIRONMENT_REFLECTION_HDR
      }
    });

    const runtimeRoot = root.createChild("grasslands-heightfield-runtime-root");
    runtimeRoot.layer = Layer.Layer30;
    compileWorker = new HeightfieldWaterCompileWorkerClient();
    waterBackend = new HeightfieldWaterBackend({
      compile: (descriptor, context) => {
        if (!compileWorker) {
          throw new Error("Grasslands Heightfield worker is unavailable.");
        }
        return compileWorker.compile(
          descriptor,
          context.signal,
          context.resolvedInstance?.qualityPlan.query ?? "dense"
        );
      }
    });
    const backendRegistry = new WaterBackendRegistry();
    backendRegistry.register(waterBackend);
    const assetRegistry = new WaterBodyAssetRegistry();
    const authoring = registerGrasslandsStylizedWaterBodyAuthoring(assetRegistry, currentLakeDescriptor);
    waterWorld = new WaterWorld();
    runtimeResourceRegistry = new WaterRuntimeResourceRegistry();
    runtimeResourceRegistry.register({
      descriptor: LAKE_NORMAL_RESOURCE,
      async load() {
        if (!assetLoader) {
          throw new Error("Grasslands normal Loader is unavailable.");
        }
        const normalResource = await assetLoader.load();
        if (!normalResource) {
          throw new Error("Grasslands strict normal asset did not produce a texture.");
        }
        const releaseBorrow = assetLoader.acquireRuntimeBorrow();
        return Object.freeze({
          texture: normalResource.texture,
          releaseBorrow
        });
      },
      destroy(resource: unknown): void {
        const normal = resource as {
          releaseBorrow(): void;
        };
        normal.releaseBorrow();
        assetLoader?.disposeAfterRuntimeDetach();
      }
    });
    const activeReflectionService = reflectionService;
    waterBodyLoader = new WaterBodyLoader({
      registry: backendRegistry,
      world: waterWorld,
      cameraFeatures: cameraFeatureBroker,
      assets: assetRegistry,
      resources: runtimeResourceRegistry,
      reflection: {
        service: activeReflectionService,
        cullingMask: Layer.Everything,
        waterLayerMask: Layer.Layer30
      }
    });
    lakeEditSession = new LakeEditSession(initialLakeRevision, async (next: LakeEditRevision, signal) => {
      const handle = waterBodyHandle;
      if (!handle?.prepareInstanceReplacement || !sceneController || !root)
        throw new Error("Lake is not ready for editing.");
      const previousAsset = assetRegistry.getAsset(authoring.instance.assetId)!;
      const previousDescriptor = currentLakeDescriptor;
      const previousMarkers = lakeShorelineMarkers!;
      const source = { ...authoring.source, descriptor: createHeightfieldWaterBodySourceDescriptorV1(next.descriptor) };
      const representationData = createHeightfieldWaterRepresentationDataV1(next.descriptor);
      const validation = validateHeightfieldWaterDescriptor(next.descriptor);
      if (!validation.valid) throw new Error(validation.diagnostics.map((d) => d.message).join("; "));
      const ground = sceneController.prepareLakeTerrain(
        next.terrain,
        next.document.boundary.waterLevel,
        next.document.basin.profile === "calibration"
      );
      let markers: GrasslandsLakeShorelineMarkers | undefined;
      let water: Awaited<ReturnType<NonNullable<typeof handle.prepareInstanceReplacement>>> | undefined;
      let published = false;
      try {
        markers = new GrasslandsLakeShorelineMarkers(root, { ...fixture.terrain, heightfield: next.terrain });
        markers.setVisible(false);
        markers.update(sampleLakeBoundary(next.descriptor.lakeBoundary!));
        assetRegistry.replaceAsset({
          ...previousAsset,
          source,
          sourceHash: hashStableValue(source),
          representationData,
          representationDataHash: hashStableValue(representationData)
        });
        water = await handle.prepareInstanceReplacement(handle.instance, { signal });
      } catch (error) {
        try {
          await water?.rollback();
        } finally {
          ground.rollback();
          markers?.destroy();
          assetRegistry.replaceAsset(previousAsset);
        }
        throw error;
      }
      const preparedWater = water,
        preparedMarkers = markers;
      return {
        commit: () => {
          published = true;
          preparedWater.commit();
          ground.commit();
          previousMarkers.setVisible(false);
          preparedMarkers.setVisible(true);
          lakeShorelineMarkers = preparedMarkers;
          currentLakeDescriptor = next.descriptor;
          synchronizePublishedRuntime();
        },
        finalize: async () => {
          try {
            await preparedWater.finalize();
          } finally {
            ground.finalize();
            previousMarkers.destroy();
          }
        },
        rollback: async () => {
          try {
            if (published) await preparedWater.revert();
            else await preparedWater.rollback();
          } finally {
            ground.rollback();
            preparedMarkers.destroy();
            previousMarkers.setVisible(true);
            lakeShorelineMarkers = previousMarkers;
            currentLakeDescriptor = previousDescriptor;
            assetRegistry.replaceAsset(previousAsset);
            synchronizePublishedRuntime();
          }
        }
      };
    });
    const editor = lakeEditSession;
    const canEditLakeTerrain = () => editor.current.document.terrainPreset !== "existing-basin";
    let landscapeSeed = fixture.seed;
    let landscapeRequest = 0;
    let landscapePending = false;
    let landscapeError: string | null = null;
    const cancelLandscape = () => {
      landscapeRequest++;
      landscapePending = false;
    };
    const landscapeStatus = () => {
      const landscape = sceneController?.landscapeSnapshot;
      return {
        seed: landscapeSeed,
        pending: landscapePending,
        error: landscapeError,
        stale:
          landscape?.terrainHash !== editor.current.terrain.hash ||
          landscape?.waterLevel !== editor.current.document.boundary.waterLevel ||
          landscape?.seed !== landscapeSeed,
        generatedSeed: landscape?.seed,
        sourceHash: landscape?.sourceHash,
        hash: landscape?.hash,
        count: landscape?.placements?.length ?? 0
      };
    };
    const regenerateLandscape = async () => {
      if (editor.status.pending) throw new Error("Wait for the Lake edit to finish before generating scenery.");
      const request = ++landscapeRequest;
      const revision = editor.current;
      const seed = landscapeSeed;
      landscapePending = true;
      landscapeError = null;
      try {
        // Allow cancellation and the pending indicator a frame before bounded CPU generation.
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        if (request !== landscapeRequest || lifecycleDisposed) return;
        if (editor.status.pending || revision !== editor.current)
          throw new Error("Lake changed; generate scenery again.");
        sceneController!.regenerateLandscape(revision.descriptor.lakeBoundary!, seed);
      } catch (error) {
        if (request === landscapeRequest) landscapeError = error instanceof Error ? error.message : String(error);
        throw error;
      } finally {
        if (request === landscapeRequest) landscapePending = false;
      }
    };
    const lakeDemoApi = {
      snapshot: () => ({
        ...editor.status,
        document: structuredClone(editor.current.document),
        waterLevel: editor.current.document.boundary.waterLevel,
        shoreline: editor.current.descriptor.lakeBoundary,
        landscape: landscapeStatus(),
        meshUploadCount: sceneController?.metrics.sceneMeshUploadCount
      }),
      landscape: () => structuredClone(sceneController?.landscapeSnapshot),
      regenerateLandscape,
      cancelLandscape,
      setLandscapeSeed: (seed: number) => {
        if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff)
          throw new RangeError("Landscape seed must be uint32.");
        cancelLandscape();
        landscapeSeed = seed;
      },
      setBoundary: (boundary: LakeBoundaryV1) => editor.update({ ...editor.draft, boundary }),
      setTerrainPreset: (terrainPreset: LakeTerrainPreset) =>
        editor.update({ ...editor.draft, terrainPreset, basin: { ...editor.draft.basin, profile: "natural" } }),
      setWaterLevel: (waterLevel: number) =>
        editor.update({ ...editor.draft, boundary: { ...editor.draft.boundary, waterLevel } }),
      setBasin: (depth: number, shoreWidth: number) =>
        editor.update({ ...editor.draft, basin: { ...editor.draft.basin, depth, shoreWidth } }),
      setFalloffWidth: (falloffWidth: number) =>
        editor.update({ ...editor.draft, basin: { ...editor.draft.basin, falloffWidth } }),
      setCalibration: (enabled: boolean) =>
        editor.update({
          ...editor.draft,
          basin: { ...editor.draft.basin, profile: enabled ? "calibration" : "natural" }
        }),
      undo: () => editor.undo(),
      cancel: () => editor.cancel(),
      reset: () => editor.update(initialLakeRevision.document),
      probe: (x: number, z: number) => {
        if (!activeResource) throw new Error("Lake query is not ready.");
        const water = new HeightfieldWaterBaseQueryService(activeResource.data).sampleBaseSurface(
          x,
          z,
          createHeightfieldWaterBaseQueryResult()
        );
        const bedHeight = sampleLakeTerrainHeight(editor.current.terrain, x, z);
        const base = editor.current.baseTerrain;
        const baseHeight = sampleWaterTerrainHeight(base, x, z);
        return {
          ...water,
          bedHeight,
          baseHeight,
          terrainHash: editor.current.terrain.hash,
          revision: editor.current.revision
        };
      }
    };
    if (import.meta.env.DEV) {
      const { mountWaterDevTools } = await import("@galacean/engine-water/water/devtools/index");
      const { createGrasslandsLightingSceneControls } = await import("./GrasslandsLightingDevTools.ts");
      mountWaterDevTools({
        loader: waterBodyLoader,
        sceneActions: [
          { group: "Lake", label: "Undo lake edit", run: lakeDemoApi.undo },
          { group: "Lake", label: "Cancel lake edit", run: lakeDemoApi.cancel },
          { group: "Lake", label: "Reset lake", run: lakeDemoApi.reset },
          { group: "Lake", label: "Regenerate landscape / 重新生成景观", run: regenerateLandscape },
          { group: "Lake", label: "Cancel generation / 取消生成", run: cancelLandscape }
        ],
        sceneControls: [
          ...createGrasslandsLightingSceneControls(lightingController),
          {
            kind: "enum",
            id: "scene.lake.terrainPreset",
            label: "Terrain input / 地形输入",
            group: "Lake",
            owner: "scene",
            effect: "authoring",
            updateMode: "commit",
            sessionScope: "transient",
            options: {
              "丘陵地形 · 雕刻湖盆": "hills",
              "平坦地形 · 雕刻湖盆": "flat",
              "现有湖盆 · 只读地面": "existing-basin"
            },
            read: () => editor.current.document.terrainPreset ?? "hills",
            write: (value) => lakeDemoApi.setTerrainPreset(value as LakeTerrainPreset)
          },
          {
            kind: "readonly",
            id: "scene.lake.terrainSource",
            label: "Terrain source / 地形来源",
            group: "Lake",
            updateMode: "readonly",
            sessionScope: "transient",
            read: () => `${editor.current.baseTerrain.id} · v${editor.current.baseTerrain.revision}`
          },
          {
            kind: "number",
            id: "scene.lake.landscapeSeed",
            label: "Landscape seed",
            group: "Lake",
            owner: "scene",
            effect: "authoring",
            updateMode: "commit",
            sessionScope: "transient",
            minimum: 0,
            maximum: 0xffffffff,
            step: 1,
            read: () => landscapeSeed,
            write: lakeDemoApi.setLandscapeSeed
          },
          {
            kind: "readonly",
            id: "scene.lake.landscapeStatus",
            label: "Landscape / 景观状态",
            group: "Lake",
            updateMode: "readonly",
            sessionScope: "transient",
            read: () => {
              const status = landscapeStatus();
              return status.pending
                ? "Generating…"
                : (status.error ?? (status.stale ? "待更新 / Regenerate" : `Ready · ${status.count} objects`));
            }
          },
          withLakeTerrainEditAvailability(
            {
              kind: "boolean",
              id: "scene.lake.calibration",
              label: "Optics calibration (0.25 / 1 / 2 m)",
              group: "Lake",
              owner: "scene",
              effect: "authoring",
              updateMode: "commit",
              sessionScope: "transient",
              read: () => editor.current.document.basin.profile === "calibration",
              write: lakeDemoApi.setCalibration
            },
            canEditLakeTerrain
          ),
          ...createGrasslandsLakeAuthoringControls(
            () => ({ ...currentLakeDescriptor, lakeBoundary: editor.draft.boundary }),
            lakeDemoApi.setBoundary,
            canEditLakeTerrain
          ),
          withLakeTerrainEditAvailability(
            {
              kind: "number",
              id: "scene.lake.basinDepth",
              label: "Basin depth (m)",
              group: "Lake",
              owner: "authoring",
              effect: "authoring",
              updateMode: "commit",
              sessionScope: "transient",
              minimum: 0.5,
              maximum: GRASSLANDS_LAKE_MAX_BASIN_DEPTH,
              step: 0.1,
              read: () => editor.current.document.basin.depth,
              write: (depth) => lakeDemoApi.setBasin(depth, editor.draft.basin.shoreWidth)
            },
            canEditLakeTerrain
          ),
          withLakeTerrainEditAvailability(
            {
              kind: "number",
              id: "scene.lake.shoreWidth",
              label: "Shore slope width (m)",
              group: "Lake",
              owner: "authoring",
              effect: "authoring",
              updateMode: "commit",
              sessionScope: "transient",
              minimum: 2,
              maximum: 16,
              step: 0.1,
              read: () => editor.current.document.basin.shoreWidth,
              write: (width) => lakeDemoApi.setBasin(editor.draft.basin.depth, width)
            },
            canEditLakeTerrain
          ),
          withLakeTerrainEditAvailability(
            {
              kind: "number",
              id: "scene.lake.falloff",
              label: "Terrain falloff (m)",
              group: "Lake",
              owner: "authoring",
              effect: "authoring",
              updateMode: "commit",
              sessionScope: "transient",
              minimum: 0.5,
              maximum: 8,
              step: 0.5,
              read: () => editor.current.document.basin.falloffWidth ?? 4,
              write: lakeDemoApi.setFalloffWidth
            },
            canEditLakeTerrain
          ),
          {
            kind: "readonly",
            id: "scene.lake.editStatus",
            label: "Lake edit",
            group: "Lake",
            updateMode: "readonly",
            sessionScope: "transient",
            read: () => (editor.status.pending ? "Applying…" : (editor.status.error ?? "Ready"))
          }
        ],
        camera: {
          poses: GRASSLANDS_DEVTOOLS_CAMERA_POSES,
          readPose: () => currentCameraPose,
          setPose: (pose) => {
            if (!isGrasslandsCameraPose(pose)) {
              throw new RangeError(`Unknown Grasslands camera pose "${pose}".`);
            }
            applyCameraPose(pose, true);
          }
        }
      });
    }
    const surfaceTimeOverride = resolveGrasslandsSurfaceTimeOverride(search);
    const createRuntimeContext = (): HeightfieldWaterBackendRuntimeContext => ({
      engine: createdEngine,
      root: runtimeRoot,
      submission: {
        frameBudgetMs: 4
      },

      surfaceTimeOverride
    });

    compileAndActivateImpl = (quality: WaterQualityTier): Promise<void> => {
      if (lifecycleDisposed) throw new Error("Grasslands runtime is disposed.");
      if (
        quality !== WaterQualityTier.Low &&
        quality !== WaterQualityTier.Medium &&
        quality !== WaterQualityTier.High
      ) {
        throw new RangeError(`Unknown Grasslands quality tier "${String(quality)}".`);
      }
      activeLoadAbort?.abort();
      const loadAbort = new AbortController();
      activeLoadAbort = loadAbort;
      const revision = ++rebuildRevision;
      currentQuality = quality;
      runtimeOperationalReady = false;
      runtimeError = null;
      const operation = rebuildQueue
        .catch(() => {})
        .then(async () => {
          if (revision !== rebuildRevision || lifecycleDisposed || loadAbort.signal.aborted) {
            return;
          }
          try {
            const loader = waterBodyLoader;
            const backend = waterBackend;
            if (!loader || !backend) {
              throw new Error("Grasslands WaterBody product path is unavailable.");
            }
            let handle = waterBodyHandle;
            if (handle) {
              await handle.update(
                {
                  lookPresetId: lakeLookPresetIdForQuality(quality),
                  qualityPlanId: grasslandsQualityPresetIdForQuality(quality)
                },
                {
                  signal: loadAbort.signal,
                  runtimeContext: createRuntimeContext()
                }
              );
            } else {
              handle = await loader.loadInstance(authoring.instance, {
                signal: loadAbort.signal,
                runtimeContext: createRuntimeContext()
              });
              waterBodyHandle = handle;
            }
            if (revision !== rebuildRevision || lifecycleDisposed || loadAbort.signal.aborted) {
              return;
            }
            const runtime = backend.getRuntimeController(GRASSLANDS_STYLIZED_WATER_INSTANCE_ID);
            const resource = handle.resource as WaterCompiledResourceReadPort<HeightfieldWaterCompiledData> | undefined;
            if (!runtime || !resource) {
              throw new Error("Grasslands Heightfield Loader activation did not publish a complete runtime.");
            }
            runtimeController = runtime;
            appearanceBinding = runtimeController.surfaceAppearanceBinding;
            if (!appearanceBinding) {
              throw new Error("Grasslands appearance binding is unavailable after activation.");
            }
            publishWaterResource(resource);
            runtimeController.flushDeferredResources();
            runtimeOperationalReady = true;
          } catch (error) {
            if (revision !== rebuildRevision || lifecycleDisposed || loadAbort.signal.aborted) {
              return;
            }
            runtimeError = readErrorMessage(error);
            runtimeOperationalReady = false;
            throw error;
          } finally {
            if (activeLoadAbort === loadAbort) {
              activeLoadAbort = undefined;
            }
          }
        });
      rebuildQueue = operation;
      return teardownBarrier.track(operation);
    };

    await compileAndActivateImpl(WaterQualityTier.High);
    if (lifecycleDisposed) {
      cleanupImpl();
      return;
    }

    const activeSceneController = sceneController;
    if (!activeSceneController || !reflectionService) {
      throw new Error("Grasslands reflection pre-render synchronization dependencies are unavailable.");
    }
    reflectionSynchronizer = activeSceneController.cameraEntity.addComponent(WaterReflectionPreRenderSynchronizer);
    reflectionSynchronizer.configure({
      sourceCamera: activeSceneController.camera,
      service: reflectionService,
      beforeUpdate: () => environmentReflectionProvider?.refresh(),
      afterUpdate: () => {
        waterBodyHandle?.refreshReflectionBinding();
      },
      onError: (error: unknown) => {
        runtimeError = readErrorMessage(error);
        runtimeOperationalReady = false;
      }
    });

    class GrasslandsShowcaseUpdateScript extends Script {
      onUpdate(deltaTime: number): void {
        try {
          environmentIBLBaker?.update();
          weatherTime += deltaTime;
          scene.shaderData.setFloat(SCENE_WEATHER_TIME, weatherTime);
          engineUpdateCount++;
          synchronizePublishedRuntime();
        } catch (error) {
          runtimeError = readErrorMessage(error);
          runtimeOperationalReady = false;
        }
      }
    }
    root.addComponent(GrasslandsShowcaseUpdateScript);
    engine.run();
  } catch (error) {
    runtimeError = readErrorMessage(error);
    runtimeOperationalReady = false;
    cleanupImpl("failure");
    throw error;
  }
}

void bootstrapGrasslandsShowcase().catch((error: unknown) => {
  console.error(error instanceof Error ? error : new Error("Grasslands Showcase bootstrap failed closed."));
});
