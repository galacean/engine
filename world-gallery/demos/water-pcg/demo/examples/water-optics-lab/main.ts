import { Camera, Color, DirectLight, Layer, Script, WebGLMode, WebGLEngine } from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { FreeControl } from "@galacean/engine-toolkit-controls";
import { Stats } from "@galacean/engine-toolkit-stats";
import { getWaterBodyCapabilities } from "../../../runtime/body/WaterBodyCapabilities";
import { WaterBodyRuntimeAdapter } from "../../../runtime/body/WaterBodyRuntime";
import { WaterP0DebugController } from "../../../runtime/body/WaterP0DebugApi";
import { WaterWorld } from "../../../runtime/body/WaterWorld";
import { HeightfieldWaterCompileWorkerClient } from "../../../runtime/heightfield/HeightfieldWaterCompileWorkerClient";
import type { HeightfieldWaterResource } from "../../../runtime/heightfield/HeightfieldWaterResource";
import { HeightfieldWaterRuntimeController } from "../../../runtime/heightfield/HeightfieldWaterRuntimeController";
import { CameraWaterFeatureBroker } from "../../../runtime/optics/CameraWaterFeatureBroker";
import { WebGL2WaterGpuTimer } from "../../../runtime/optics/WaterGpuTimer";
import { WaterReflectionService } from "../../../runtime/optics/WaterReflectionService";
import {
  parseWaterOpticsPreset,
  parseWaterOpticsTier,
  WATER_OPTICS_FREE_CAMERA_MOVEMENT_SPEED,
  WATER_OPTICS_LAB_OPTICAL_PROFILE,
  WATER_OPTICS_LAB_SURFACE_TIME
} from "./constants";
import { DemoReflectionProbe } from "./DemoReflectionProbe";
import { installWaterOpticsBrowserDiagnostics } from "./WaterOpticsBrowserDiagnostics";
import { WaterOpticsLabController } from "./WaterOpticsLabController";
import { createWaterOpticsLabFixture } from "./WaterOpticsLabFixture";
import { WATER_OPTICS_PLANAR_ANCHOR_LAYER } from "./WaterOpticsPlanarAnchorReference";
import { WATER_OPTICS_P1_CONSUMERS, WaterOpticsP1MatrixScene } from "./WaterOpticsP1MatrixScene";
import { WaterOpticsSecondaryPoolRuntime } from "./WaterOpticsSecondaryPoolRuntime";
import {
  WATER_OPTICS_PLANAR_CLIP_SENTINEL_LAYER,
  WATER_OPTICS_TRANSPARENT_SENTINEL_NORMAL_PRIORITY,
  WaterOpticsLabScene
} from "./WaterOpticsLabScene";
import type { WaterOpticsTier } from "./types";

installWaterOpticsBrowserDiagnostics();

class WaterOpticsLabFreeCameraControl extends FreeControl {
  afterCameraUpdate: (() => void) | undefined;

  override onLateUpdate(deltaTime: number): void {
    super.onLateUpdate(deltaTime);
    this.afterCameraUpdate?.();
  }
}

class WaterOpticsLabUpdateScript extends Script {
  callback: (() => void) | undefined;
  gpuTimer: WebGL2WaterGpuTimer | undefined;
  sourceCamera: Camera | undefined;
  private _frameEnvelopeQuery: WebGLQuery | undefined;

  onUpdate(): void {
    if (this._frameEnvelopeQuery) this._endFrameEnvelopeSample();
    this._frameEnvelopeQuery = this.gpuTimer?.beginFrameEnvelopeSample();
    try {
      this.callback?.();
    } catch (error) {
      this._endFrameEnvelopeSample();
      throw error;
    }
  }

  onEndRender(camera: Camera): void {
    if (camera === this.sourceCamera) this._endFrameEnvelopeSample();
  }

  private _endFrameEnvelopeSample(): void {
    const query = this._frameEnvelopeQuery;
    if (!query) return;
    this._frameEnvelopeQuery = undefined;
    this.gpuTimer?.endFrameEnvelopeSample(query);
  }
}

function readFiniteNonNegative(value: string | null, fallback: number): number {
  const parsed = Number(value);
  return value !== null && Number.isFinite(parsed) ? Math.max(0, parsed) : fallback;
}

async function bootstrapWaterOpticsLab(): Promise<void> {
  const statusCandidate = document.getElementById("water-optics-status");
  const metricsCandidate = document.getElementById("water-optics-metrics");
  if (!(statusCandidate instanceof HTMLSpanElement) || !(metricsCandidate instanceof HTMLDListElement)) {
    throw new Error("Water Optics Lab HUD is missing required elements.");
  }

  const search = new URLSearchParams(window.location.search);
  const initialTier = parseWaterOpticsTier(search.get("waterOptics"));
  const initialPreset = parseWaterOpticsPreset(search.get("opticsPreset"));
  const initialSurfaceTime = readFiniteNonNegative(search.get("surfaceTime"), WATER_OPTICS_LAB_SURFACE_TIME);
  const statsEnabled = search.get("stats") === "1";
  const strictQuality = search.get("strictQuality") === "1";
  const screenshotMode = search.get("screenshot") === "1";
  document.documentElement.dataset.waterOpticsScreenshot = String(screenshotMode);

  const engineConfiguration = {
    canvas: "canvas",
    shaderCompiler: new ShaderCompiler(),
    graphicDeviceOptions: { webGLMode: WebGLMode.WebGL2 }
  } as unknown as Parameters<typeof WebGLEngine.create>[0];
  const engine = await WebGLEngine.create(engineConfiguration);
  engine.canvas.resizeByClientSize();
  const renderCanvas = document.getElementById("canvas");
  const gl = renderCanvas instanceof HTMLCanvasElement ? renderCanvas.getContext("webgl2") : null;
  if (!gl)
    throw new Error("Water Optics Lab requires a WebGL2 context for rendering and GPU timing capability checks.");

  const scene = engine.sceneManager.activeScene;
  scene.background.solidColor = new Color(0.018, 0.032, 0.05, 1);
  scene.ambientLight.diffuseSolidColor.set(0.38, 0.43, 0.48, 1);
  scene.ambientLight.diffuseIntensity = 0.62;
  const root = scene.createRootEntity("water-optics-lab-root");

  const cameraEntity = root.createChild("water-optics-source-camera");
  const camera = cameraEntity.addComponent(Camera);
  camera.nearClipPlane = 0.1;
  camera.farClipPlane = 250;
  camera.cullingMask = (Layer.Everything &
    ~WATER_OPTICS_PLANAR_CLIP_SENTINEL_LAYER &
    ~WATER_OPTICS_PLANAR_ANCHOR_LAYER) as Layer;
  if (statsEnabled) cameraEntity.addComponent(Stats);

  const sunEntity = root.createChild("water-optics-key-light");
  sunEntity.transform.setRotation(-47, -28, 0);
  const sun = sunEntity.addComponent(DirectLight);
  sun.color = new Color(1, 0.93, 0.82, 1);

  const initialFixture = createWaterOpticsLabFixture(initialTier);
  const labScene = new WaterOpticsLabScene(engine, root, initialFixture);
  const waterRuntimeRoot = root.createChild("water-optics-heightfield-runtime");
  waterRuntimeRoot.layer = Layer.Layer30;
  const waterRuntime = new HeightfieldWaterRuntimeController(engine, waterRuntimeRoot);
  waterRuntime.setOpticalProfile(WATER_OPTICS_LAB_OPTICAL_PROFILE);
  const secondaryWaterRuntimeRoot = root.createChild("water-optics-secondary-heightfield-runtime");
  secondaryWaterRuntimeRoot.layer = Layer.Layer30;
  secondaryWaterRuntimeRoot.transform.setPosition(27, WATER_OPTICS_P1_CONSUMERS.secondaryPool.planeY, 0);
  secondaryWaterRuntimeRoot.isActive = false;
  const secondaryWaterRuntime = new WaterOpticsSecondaryPoolRuntime(engine, secondaryWaterRuntimeRoot);
  secondaryWaterRuntime.setOpticalProfile(WATER_OPTICS_LAB_OPTICAL_PROFILE);
  const compileWorker = new HeightfieldWaterCompileWorkerClient();
  const waterWorld = new WaterWorld();
  window.waterPcgP0 = new WaterP0DebugController(waterWorld);
  const cameraFeatures = new CameraWaterFeatureBroker(camera);
  const reflectionServiceHolder: { current?: WaterReflectionService } = {};
  const gpuTimer = new WebGL2WaterGpuTimer(gl, {
    onPlanarSampleResolved: (milliseconds) => reflectionServiceHolder.current?.recordPlanarGpuTime(milliseconds)
  });
  const reflectionServiceLease = WaterReflectionService.acquire(engine, root, camera, { planarGpuTimer: gpuTimer });
  const reflectionService = reflectionServiceLease.service;
  reflectionServiceHolder.current = reflectionService;
  const reflectionProbe = new DemoReflectionProbe(engine);
  reflectionService.setProbeTexture(reflectionProbe.texture);
  const p1Matrix = new WaterOpticsP1MatrixScene(engine, root, initialTier);
  let activeResource: HeightfieldWaterResource | undefined;
  let activeSourceHash = "";
  let runtimeError = "";
  let compileRevision = 0;

  const resize = (): void => {
    engine.canvas.resizeByClientSize();
    cameraFeatures.setViewportSize(engine.canvas.width, engine.canvas.height);
    reflectionService.setViewportSize(engine.canvas.width, engine.canvas.height);
  };
  resize();
  window.addEventListener("resize", resize);

  const rebuildTier = async (tier: WaterOpticsTier): Promise<void> => {
    const revision = ++compileRevision;
    let nextResource: HeightfieldWaterResource | undefined;
    try {
      const fixture = createWaterOpticsLabFixture(tier);
      nextResource = await compileWorker.compile(fixture.descriptor);
      if (revision !== compileRevision) {
        nextResource.dispose();
        return;
      }
      const activation = await waterRuntime.replaceActiveIncremental(fixture.descriptor.id, nextResource, {
        frameBudgetMs: 4,
        shouldCancel: () => revision !== compileRevision
      });
      if (revision !== compileRevision) {
        nextResource.dispose();
        return;
      }
      const grid = nextResource.data.grid;
      const halfCellX = grid.cellSizeXZ[0] * 0.5;
      const halfCellZ = grid.cellSizeXZ[1] * 0.5;
      waterWorld.unregister(fixture.descriptor.id);
      waterWorld.register(
        new WaterBodyRuntimeAdapter({
          id: fixture.descriptor.id,
          type: "heightfield",
          capabilities: getWaterBodyCapabilities("heightfield"),
          surface: activation.surfaceProvider,
          bounds: {
            minX: grid.originXZ[0] - halfCellX,
            minZ: grid.originXZ[1] - halfCellZ,
            maxX: grid.originXZ[0] + (grid.width - 1) * grid.cellSizeXZ[0] + halfCellX,
            maxZ: grid.originXZ[1] + (grid.height - 1) * grid.cellSizeXZ[1] + halfCellZ
          },
          priority: 100,
          metrics: {
            meshUploadCount: activation.meshUploadCount,
            drawCount: nextResource.data.chunks.length,
            triangleCount: nextResource.data.stats.triangleCount,
            resourceBytes: nextResource.byteLength
          }
        })
      );
      const previousResource = activeResource;
      activeResource = nextResource;
      nextResource = undefined;
      activeSourceHash = activeResource.metadata.compiledHash;
      runtimeError = "";
      previousResource?.dispose();
      waterRuntime.flushDeferredResources();
    } catch (error) {
      nextResource?.dispose();
      runtimeError = error instanceof Error ? error.message : String(error);
      throw error;
    }
  };

  let controller: WaterOpticsLabController;
  let freeCameraControl: WaterOpticsLabFreeCameraControl | undefined;
  const setFreeCameraControlEnabled = (enabled: boolean): void => {
    freeCameraControl?.destroy();
    freeCameraControl = undefined;
    if (!enabled) return;

    const nextControl = cameraEntity.addComponent(WaterOpticsLabFreeCameraControl);
    nextControl.floorMock = false;
    nextControl.movementSpeed = WATER_OPTICS_FREE_CAMERA_MOVEMENT_SPEED;
    nextControl.afterCameraUpdate = () => controller.tick();
    freeCameraControl = nextControl;
  };

  controller = new WaterOpticsLabController({
    engine,
    camera,
    cameraFeatures,
    reflectionService,
    gpuTimer,
    waterRuntime,
    secondaryWaterRuntime,
    p1Matrix,
    setPrimaryPoolVisible: (visible) => {
      waterRuntimeRoot.isActive = visible;
    },
    setSecondaryPoolVisible: (visible) => {
      secondaryWaterRuntime.setVisible(visible);
    },
    setPlanarAnchorVisible: (visible) => labScene.setPlanarAnchorVisible(visible),
    setPlanarOrientationMarkersVisible: (visible) => labScene.setPlanarOrientationMarkersVisible(visible),
    setReflectorTime: (seconds) => labScene.setReflectorTime(seconds),
    setFreeCameraControlEnabled,
    setTransparentOrderingProbeMode: (mode) => labScene.setTransparentOrderingProbeMode(mode),
    ensureSecondaryPoolRuntime: async () => {
      if (activeResource) await secondaryWaterRuntime.ensure(activeResource);
    },
    releaseSecondaryPoolRuntime: () => secondaryWaterRuntime.release(),
    statusElement: statusCandidate,
    metricsElement: metricsCandidate,
    statsEnabled,
    strictQuality,
    initialTier,
    initialPreset,
    initialSurfaceTime,
    initialFrozen: screenshotMode,
    rebuildTier,
    getRuntimeSnapshot: () => ({
      sourceHash: activeSourceHash,
      fixtureObjectCount: labScene.fixtureObjectCount,
      waterBodyCount: waterWorld.metrics.registeredBodyCount,
      transparentOrderingProbeMode: labScene.transparentOrderingProbeMode,
      transparentSentinelPriority: labScene.transparentOrderingSentinelPriority,
      transparentSentinelNormalPriority: WATER_OPTICS_TRANSPARENT_SENTINEL_NORMAL_PRIORITY,
      transparentSentinelTransparent: labScene.transparentOrderingSentinelTransparent,
      planarOrientationMarkersVisible: labScene.planarOrientationMarkersVisible,
      reflectorVisible: labScene.reflectorVisible,
      reflectorTime: labScene.reflectorTime,
      reflectorWorldPosition: labScene.reflectorWorldPosition,
      runtimeError
    }),
    getProbeSnapshot: () => ({
      textureAvailable: reflectionProbe.texture !== undefined,
      resourceBytes: reflectionProbe.metrics.activeResourceBytes,
      faceHashes: reflectionProbe.faceHashes,
      provenance: reflectionProbe.provenance
    })
  });
  const requestedReflectionSource = search.get("reflection");
  if (
    requestedReflectionSource === "auto" ||
    requestedReflectionSource === "sky" ||
    requestedReflectionSource === "probe" ||
    requestedReflectionSource === "planar"
  ) {
    controller.setReflectionMode(requestedReflectionSource);
  }
  window.waterPcgOptics = controller;

  // Camera render callbacks are dispatched only to Scripts on the Camera Entity.
  // Keeping update + end-render in one Script guarantees that a frame-envelope
  // query ends on the same source-Camera render that it began before.
  const updateScript = cameraEntity.addComponent(WaterOpticsLabUpdateScript);
  updateScript.gpuTimer = gpuTimer;
  updateScript.sourceCamera = camera;
  updateScript.callback = () => {
    if (!controller.freeCameraEnabled) controller.tick();
  };
  engine.run();

  try {
    await controller.setTier(initialTier);
    controller.setStatsPanelVisible(statsEnabled && search.get("statsPanel") !== "hidden");
  } catch (error) {
    controller.markError(error);
  }

  window.addEventListener("beforeunload", () => {
    compileRevision++;
    window.removeEventListener("resize", resize);
    window.waterPcgOptics = undefined;
    window.waterPcgP0 = undefined;
    updateScript.callback = undefined;
    updateScript.gpuTimer = undefined;
    updateScript.sourceCamera = undefined;
    controller.destroy();
    reflectionServiceHolder.current = undefined;
    gpuTimer.destroy();
    reflectionService.setProbeTexture(undefined);
    reflectionProbe.destroy();
    reflectionServiceLease.release();
    cameraFeatures.destroy();
    waterRuntime.destroy();
    secondaryWaterRuntime.destroy();
    waterWorld.destroy();
    activeResource?.dispose();
    compileWorker.dispose();
    p1Matrix.destroy();
    labScene.destroy();
  });
}

void bootstrapWaterOpticsLab().catch((error: unknown) => {
  console.error(error instanceof Error ? error : new Error("Water Optics Lab bootstrap failed."));
  const status = document.getElementById("water-optics-status");
  const metrics = document.getElementById("water-optics-metrics");
  if (status instanceof HTMLSpanElement) {
    status.textContent = "bootstrap failed";
    status.dataset.state = "error";
  }
  if (metrics instanceof HTMLDListElement)
    metrics.dataset.runtimeError = error instanceof Error ? error.message : String(error);
});
