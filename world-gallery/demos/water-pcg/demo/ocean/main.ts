import { Camera, Color, Script, Vector3, WebGLMode, WebGLEngine } from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { OrbitControl } from "@galacean/engine-toolkit-controls";
import * as dat from "dat.gui";
import { WaterQualityTier } from "../../authoring/wave/enums/WaterQualityTier";
import { WaterWaveModel } from "../../authoring/wave/enums/WaterWaveModel";
import { WaterWaveSchemaVersion } from "../../authoring/wave/enums/WaterWaveSchemaVersion";
import { CameraWaterFeatureBroker } from "../../runtime/optics/CameraWaterFeatureBroker";
import type { WaterReflectionSource } from "../../runtime/optics/WaterReflectionPolicy";
import {
  WaterReflectionService,
  type WaterReflectionServiceMetrics
} from "../../runtime/optics/WaterReflectionService";
import { cloneOceanConfig } from "../examples";
import { OceanPreviewController } from "../examples/ocean-preview/OceanPreviewController";
import { gerstnerFeatureOceanPreview, showcaseOceanPreview } from "../examples/ocean-preview/presets";
import type { OceanPreviewMetrics, OceanPreviewStressResult } from "../examples/ocean-preview/types";
import { isWaterPcgDeveloperMode, resolveWaterPcgCase } from "../navigation";
import { createFeatureSnapshot, type WaterFeatureCaseApi } from "../showcase/WaterFeatureCaseApi";
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
import { OceanShowcaseSceneController, type OceanShowcaseSceneMode } from "./OceanShowcaseSceneController";

interface OceanRuntimeWindow extends Window {
  waterPcgSetSurfaceTime?: (elapsedTime?: number) => void;
  waterPcgGetOceanMetrics?: () => OceanPreviewMetrics;
  waterPcgGetReflectionMetrics?: () => WaterReflectionServiceMetrics;
  waterPcgSetOceanReflectionSource?: (source: WaterReflectionSource) => void;
  waterPcgSetOceanLodDebug?: (enabled: boolean) => void;
  waterPcgSetOceanCameraPosition?: (worldX: number, worldZ: number) => void;
  waterPcgStressOcean?: (iterations?: number) => OceanPreviewStressResult;
}

interface OceanHeroPose {
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
}

const OCEAN_HERO_POSES = Object.freeze({
  hero: Object.freeze({
    position: [22, 10.5, 25] as const,
    target: [-5, 1.2, -15] as const
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
  hero: Object.freeze({ position: [22, 10.5, 25] as const, target: [-5, 1.2, -15] as const, time: 12.5 }),
  interaction: Object.freeze({ position: [12, 5.4, 13] as const, target: [-1.5, 0.4, -8] as const, time: 18 }),
  detail: Object.freeze({ position: [4, 2.7, 12] as const, target: [-2, 0.2, -15] as const, time: 24 })
});

function resolveSceneMode(preset: string): OceanShowcaseSceneMode {
  if (preset === "gerstner-waves") return "gerstner";
  if (preset === "ocean-lod-debug") return "lod-debug";
  return "hero";
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
  const oceanConfig = cloneOceanConfig(sceneMode === "gerstner" ? gerstnerFeatureOceanPreview : showcaseOceanPreview);
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

  const scene = engine.sceneManager.activeScene;
  scene.background.solidColor = new Color(0.035, 0.105, 0.135, 1);
  const root = scene.createRootEntity("ocean-showcase-root");
  const cameraEntity = root.createChild("ocean-showcase-camera");
  const camera = cameraEntity.addComponent(Camera);
  camera.farClipPlane = 600;
  camera.fieldOfView = sceneMode === "lod-debug" ? 58 : 54;
  const orbit = cameraEntity.addComponent(OrbitControl);
  const heroPose = OCEAN_HERO_POSES[sceneMode];
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

  const showcaseScene = new OceanShowcaseSceneController(engine, root, oceanPreview.surfaceProvider, sceneMode);
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
    exampleBar.dataset.activeExample = activeCase.id;
    exampleBar.dataset.oceanWaveModel = metrics.waveModel;
    exampleBar.dataset.oceanQuality = metrics.quality;
    exampleBar.dataset.oceanActiveWaveCount = String(featureEnabled ? metrics.activeWaveCount : 0);
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
    exampleBar.dataset.oceanBoatQueryHit = String(showcase.boatQueryHit);
    exampleBar.dataset.oceanBoatSampleFinite = String(showcase.boatSampleFinite);
    exampleBar.dataset.oceanWakeEnergy = showcase.wakeEnergy.toFixed(4);
    exampleBar.dataset.runtimeError = runtimeError;
  };

  const updateAcceptance = (): void => {
    const ocean = oceanPreview.metrics;
    const reflection = reflectionService.metrics;
    const showcase = showcaseScene.metrics;
    const frame = frameSampler.metrics;
    const reflectionRequired = sceneMode !== "gerstner" && featureEnabled;
    runtimeReady =
      ocean.frameCount > 2 &&
      ocean.quality === WaterQualityTier.High &&
      ocean.activeWaveCount === (featureEnabled ? 12 : 0) &&
      ocean.ringCount === 3 &&
      ocean.patchCount === 37 &&
      ocean.refractionEnabled &&
      (!reflectionRequired ||
        (ocean.reflectionSource === "planar" &&
          ocean.reflectionFilterSampleCount === 5 &&
          reflection.planarCameraCount === 1 &&
          reflection.liveRenderTargetCount === 1)) &&
      (sceneMode === "gerstner" || (showcase.boatQueryHit && showcase.boatSampleFinite));
    const finite = areFiniteShowcaseMetrics([
      frame.fps,
      frame.p95FrameMs,
      ocean.originX,
      ocean.originZ,
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
        failureCount: reflection.planarFailureCount
      }),
      refractionEnabled: ocean.refractionEnabled,
      scene: Object.freeze({
        activeWaveCount: featureEnabled ? ocean.activeWaveCount : 0,
        ringCount: ocean.ringCount,
        patchCount: ocean.patchCount,
        visiblePatchCount: ocean.visiblePatchCount,
        frameCount: ocean.frameCount,
        islandCount: showcase.islandCount,
        cloudCount: showcase.cloudCount,
        reflectionAnchorCount: showcase.reflectionAnchorCount,
        boatVisible: showcase.boatVisible,
        boatQueryHit: showcase.boatQueryHit,
        boatSampleFinite: showcase.boatSampleFinite,
        wakeRibbonCount: showcase.wakeRibbonCount,
        wakeEnergy: showcase.wakeEnergy,
        surfaceTime: surfaceTimeOverride ?? engine.time.elapsedTime,
        cameraMode: showcaseCameraMode ?? "feature"
      })
    });
    window.waterPcgAcceptance = snapshot;
  };

  const featureApi: WaterFeatureCaseApi | undefined =
    activeCase.preset === "gerstner-waves"
      ? {
          caseId: activeCase.id,
          preset: activeCase.preset,
          get ready() {
            return runtimeReady;
          },
          get enabled() {
            return featureEnabled;
          },
          setEnabled(enabled: boolean): void {
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
            writeMetrics();
            updateAcceptance();
          },
          reset(): void {
            surfaceTimeOverride = initialSurfaceTimeOverride;
            oceanPreview.setSurfaceTimeOverride(initialSurfaceTimeOverride);
            featureApi?.setEnabled(true);
          },
          snapshot() {
            const signal = featureEnabled ? oceanPreview.metrics.activeWaveCount : 0;
            return createFeatureSnapshot(
              featureApi ?? {
                caseId: activeCase.id,
                preset: activeCase.preset,
                ready: runtimeReady,
                enabled: featureEnabled
              },
              runtimeError,
              Number.isFinite(signal),
              signal
            );
          }
        }
      : undefined;
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

  let gui: dat.GUI | undefined;
  const guiState = {
    lodDebug: sceneMode === "lod-debug",
    reflection: reflectionSource,
    fixedTime: -1
  };
  gui = new dat.GUI({ name: "Ocean Showcase Diagnostics", width: 290 });
  gui
    .add(guiState, "lodDebug")
    .name("LOD colors")
    .onChange((enabled: boolean) => oceanPreview.setLodDebug(enabled));
  gui
    .add(guiState, "reflection", ["sky", "planar"])
    .name("Reflection")
    .onChange((source: WaterReflectionSource) => runtimeWindow.waterPcgSetOceanReflectionSource?.(source));
  gui
    .add(guiState, "fixedTime", -1, 60, 0.25)
    .name("Surface time")
    .onChange((value: number) => runtimeWindow.waterPcgSetSurfaceTime?.(value < 0 ? undefined : value));

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
        showcaseScene.update(elapsedTime);
        if (featureEnabled) {
          oceanPreview.update(deltaTime, cameraEntity.transform.worldPosition);
          reflectionService.update();
          oceanPreview.refreshReflectionBinding();
        }
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

  window.addEventListener("beforeunload", () => {
    window.removeEventListener("resize", resize);
    window.removeEventListener("keydown", handleCameraKeyDown);
    oceanCanvas?.removeEventListener("pointerdown", pauseAutoTour);
    oceanCanvas?.removeEventListener("wheel", pauseAutoTour);
    showcaseCameraController?.destroy();
    gui?.destroy();
    showcaseScene.destroy();
    oceanPreview.destroy();
    featureBroker.destroy();
    reflectionLease.release();
    delete runtimeWindow.waterPcgSetSurfaceTime;
    delete runtimeWindow.waterPcgGetOceanMetrics;
    delete runtimeWindow.waterPcgGetReflectionMetrics;
    delete runtimeWindow.waterPcgSetOceanReflectionSource;
    delete runtimeWindow.waterPcgSetOceanLodDebug;
    delete runtimeWindow.waterPcgSetOceanCameraPosition;
    delete runtimeWindow.waterPcgStressOcean;
    delete window.waterPcgAcceptance;
    delete window.waterPcgShowcase;
    if (window.waterPcgFeature === featureApi) delete window.waterPcgFeature;
  });
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
