import {
  OceanDebugView,
  OceanWaterBackend,
  type OceanWaterBackendRuntimeContext
} from "@galacean/engine-water/water/runtime/ocean/index";
import { Camera, DirectLight, Layer, Script, ShadowType, Vector3, WebGLEngine, WebGLMode } from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { createIntegratedWorldLightingRuntime } from "@galacean/engine-world-planning/integrations/terrain/lighting/IntegratedWorldPresentation";
import {
  INTEGRATED_WORLD_DAYLIGHT_REFERENCE_TIME_HOURS,
  INTEGRATED_WORLD_RENDER_PIXEL_RATIO
} from "@galacean/engine-world-planning/integrations/terrain/lighting/IntegratedWorldLightingPreset";
import { TERRAIN_DEFAULT_CAMERA_CONFIGURATION } from "@galacean/engine-world-planning/integrations/terrain/lighting/TerrainLightingRuntime";
import { INTEGRATED_WORLD_POST_PROCESS_PROFILE } from "@galacean/engine-terrain/terrain/project/IntegratedWorldPostProcessPreset";
import { TerrainPostProcessRuntime } from "@galacean/engine-terrain/terrain/project/TerrainPostProcessRuntime";
import { TerrainWindRuntime } from "@galacean/engine-terrain/terrain/project/TerrainWindRuntime";
import { WorldEnvironmentRuntime } from "@galacean/engine-world-planning/integrations/terrain/environment/WorldEnvironmentRuntime";
import { SeedWorldOceanWaterLevelRuntimeState } from "@galacean/engine-water/world/SeedWorldOceanWaterLevelRuntime";
import { resizeEngineCanvasByClientSize } from "../demo/resizeEngineCanvas.ts";
import {
  createShowcaseCameraController,
  resolveShowcaseCameraMode,
  SHOWCASE_CAMERA_MOVEMENT_SPEED,
  type ShowcaseCameraController
} from "../demo/showcase/ShowcaseCameraControl.ts";

import { OceanTextureLibrary } from "@galacean/engine-water/water/resources/ocean/index";
import { WaterSceneRuntimeHost } from "@galacean/engine-water/water/runtime/index";
import {
  createIslandOceanBody,
  createIslandOceanDescriptor,
  ISLAND_OCEAN_BODY_ID,
  sampleIslandHeight
} from "./IslandOceanSource.ts";
import { createIslandScene } from "./IslandScene.ts";

const OCEAN_CAMERA_VIEWS = {
  island: { position: [190, 100, 230], target: [0, 4, 0] },
  shore: { position: [85, 6, 58], target: [50, 0, 25] },
  horizon: { position: [120, 5, 100], target: [380, 1, 40] }
} as const;
type OceanCameraView = keyof typeof OCEAN_CAMERA_VIEWS;

const OCEAN_DIAGNOSTIC_DESCRIPTIONS: Partial<Record<OceanDebugView, string>> = {
  [OceanDebugView.DepthDensity]: "颜色表示深度产生的水色密度，不是水深米数；远海按深水饱和显示。",
  [OceanDebugView.Refraction]: "近处显示折射采样；远处紫灰斜纹表示不提供场景折射数据。",
  [OceanDebugView.EnvironmentReflection]: "显示环境反射；远海使用较平滑的反射采样。",
  [OceanDebugView.Foam]: "白色表示泡沫较强；远处紫灰斜纹表示未计算泡沫。",
  [OceanDebugView.Caustics]: "显示水底焦散；远处紫灰斜纹表示未计算焦散。",
  [OceanDebugView.DetailNormal]: "RGB 表示法线方向；远处渐变为平面法线。"
};

async function bootstrap(): Promise<void> {
  const engine = await WebGLEngine.create({
    canvas: "canvas",
    graphicDeviceOptions: { webGLMode: WebGLMode.WebGL2 },
    shaderCompiler: new ShaderCompiler()
  });
  let ready = false;
  let destroyed = false;
  const cleanup: Array<() => void | Promise<void>> = [() => engine.destroy()];
  const own = <T extends { destroy(): void | Promise<void> }>(resource: T): T => {
    if (destroyed) {
      void resource.destroy();
      throw new DOMException("Ocean showcase was closed during startup.", "AbortError");
    }
    cleanup.push(() => resource.destroy());
    return resource;
  };
  const dispose = async (): Promise<void> => {
    if (destroyed) return;
    destroyed = true;
    ready = false;
    engine.pause();
    Reflect.deleteProperty(window, "oceanGalleryDebug");
    for (const release of cleanup.reverse()) {
      try {
        await release();
      } catch (error) {
        console.error("[ocean-gallery] cleanup failed", error);
      }
    }
  };
  const onPageHide = (): void => {
    void dispose();
  };
  window.addEventListener("pagehide", onPageHide, { once: true });
  cleanup.push(() => window.removeEventListener("pagehide", onPageHide));
  if (import.meta.hot) import.meta.hot.dispose(() => void dispose());
  try {
    const scene = engine.sceneManager.activeScene!;
    const root = scene.createRootEntity("Ocean island showcase");
    const camera = root.createChild("Camera").addComponent(Camera);
    camera.fieldOfView = TERRAIN_DEFAULT_CAMERA_CONFIGURATION.fieldOfView;
    camera.farClipPlane = TERRAIN_DEFAULT_CAMERA_CONFIGURATION.farClipPlane;
    camera.nearClipPlane = 0.2;
    camera.enableHDR = TERRAIN_DEFAULT_CAMERA_CONFIGURATION.enableHDR;
    let cameraController: ShowcaseCameraController | undefined;
    const viewTarget = new Vector3();
    const light = root.createChild("Sun").addComponent(DirectLight);
    light.shadowType = ShadowType.SoftLow;
    const post = root.addComponent(TerrainPostProcessRuntime);
    post.initialize({ camera, ...INTEGRATED_WORLD_POST_PROCESS_PROFILE });
    const lighting = own(createIntegratedWorldLightingRuntime(light.entity, scene, light, post));
    lighting.setTuning({ playing: false, timeHours: INTEGRATED_WORLD_DAYLIGHT_REFERENCE_TIME_HOURS });
    lighting.applyVisualTuning({ shadowStrength: 0.9 });
    const wind = root.addComponent(TerrainWindRuntime);
    wind.initialize({ speedMps: 2, seed: 1729 });
    const descriptor = createIslandOceanDescriptor();
    own(createIslandScene(engine, root, descriptor));
    const backend = new OceanWaterBackend();
    const waterLevel = new SeedWorldOceanWaterLevelRuntimeState({
      bodyId: ISLAND_OCEAN_BODY_ID,
      defaultWaterLevelMetres: descriptor.config.waterLevel,
      adjustmentRangeMetres: 10,
      applySurfaceLevelOffset: (bodyId, offset) => backend.setRuntimeSurfaceLevelOffset(bodyId, offset)
    });
    const host = own(
      new WaterSceneRuntimeHost({
        engine,
        scene,
        root,
        camera,
        waterLayer: Layer.Layer30,
        reflection: { cullingMask: camera.cullingMask, waterLayerMask: Layer.Layer30 }
      })
    );
    host.registerBackend(backend);
    host.createEnvironmentReflectionProvider({
      id: "ocean-island-sky",
      source: { ambientLight: scene.ambientLight, rotationDegrees: 0, exposure: 1, hdr: true }
    });
    const body = host.registerAuthoring((assets) => createIslandOceanBody(assets, descriptor));
    let currentView: OceanCameraView = "island";
    const pauseButton = document.getElementById("pause") as HTMLButtonElement;
    const getOceanController = () => backend.getRuntimeDiagnostics(ISLAND_OCEAN_BODY_ID)?.controller;
    const syncPauseButton = (): void => {
      const paused = getOceanController()?.surfaceTimeOverride !== undefined;
      if (pauseButton.getAttribute("aria-pressed") === String(paused)) return;
      pauseButton.setAttribute("aria-pressed", String(paused));
      pauseButton.textContent = paused ? "继续海浪" : "暂停海浪";
    };
    const setView = (view: OceanCameraView): void => {
      const pose = OCEAN_CAMERA_VIEWS[view];
      const scale = view === "island" ? Math.max(1, (0.85 * engine.canvas.height) / engine.canvas.width) : 1;
      camera.entity.transform.setPosition(
        pose.target[0] + (pose.position[0] - pose.target[0]) * scale,
        pose.target[1] + (pose.position[1] - pose.target[1]) * scale,
        pose.target[2] + (pose.position[2] - pose.target[2]) * scale
      );
      viewTarget.set(pose.target[0], pose.target[1], pose.target[2]);
      camera.entity.transform.lookAt(new Vector3(...pose.target));
      cameraController?.syncFromTransform();
      currentView = view;
      document
        .querySelectorAll<HTMLButtonElement>("[data-view]")
        .forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.view === view)));
    };
    const resize = (): void => {
      resizeEngineCanvasByClientSize(engine, "canvas", INTEGRATED_WORLD_RENDER_PIXEL_RATIO);
      host.setViewportSize(engine.canvas.width, engine.canvas.height);
    };
    resize();
    setView("island");
    cameraController = own(
      createShowcaseCameraController(camera.entity, {
        mode: resolveShowcaseCameraMode(new URLSearchParams(window.location.search)),
        movementSpeed: SHOWCASE_CAMERA_MOVEMENT_SPEED.ocean
      })
    );
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(document.getElementById("canvas")!);
    cleanup.push(() => resizeObserver.disconnect());
    class OceanFrame extends Script {
      override onUpdate(deltaTime: number): void {
        if (!ready) return;
        backend.updateRuntime(ISLAND_OCEAN_BODY_ID, deltaTime);
        syncPauseButton();
      }
    }
    root.addComponent(OceanFrame);
    engine.run();
    own(
      await WorldEnvironmentRuntime.create(
        scene,
        camera,
        {
          sampleHeightInterpolated: sampleIslandHeight,
          sampleRainImpact: () => false,
          getPuddleHydrology: () => undefined
        },
        lighting,
        wind
      )
    );
    const textures = own(await OceanTextureLibrary.create(engine));
    // Body leases must be released before their borrowed texture library.
    cleanup.push(() => host.destroy());
    await host.loadBody({
      bodyId: ISLAND_OCEAN_BODY_ID,
      ...body,
      bodyOrigin: [0, 0],
      canonicalDescriptorHash: body.asset.sourceHash,
      developmentRuntime: waterLevel.developmentPort,
      setSurfaceTimeOverride: (seconds) => backend.setRuntimeSurfaceTimeOverride(ISLAND_OCEAN_BODY_ID, seconds),
      createRuntimeContext: (bodyRoot): OceanWaterBackendRuntimeContext => ({
        engine,
        root: bodyRoot,
        textures: textures.textures,
        cameraPositionProvider: () => camera.entity.transform.worldPosition,
        // Match SeedWorld's current presentation; the Ocean intentionally omits scene fog.
        sceneFogEnabled: false
      })
    });
    if (destroyed) return;
    ready = true;
    await lighting.waitForEnvironmentIBLIdle();
    if (destroyed) return;
    const surfaceViewSelect = document.getElementById("surface-view") as HTMLSelectElement;
    surfaceViewSelect.disabled = false;
    surfaceViewSelect.onchange = () => {
      const view = Number(surfaceViewSelect.value) as OceanDebugView;
      getOceanController()?.setDebugView(view);
      document.getElementById("diagnostic-legend")!.hidden = view === OceanDebugView.Final;
      document.getElementById("density-legend")!.hidden = view !== OceanDebugView.DepthDensity;

      document.getElementById("diagnostic-description")!.textContent = OCEAN_DIAGNOSTIC_DESCRIPTIONS[view] ?? "";
    };
    pauseButton.onclick = () => {
      backend.setRuntimeSurfaceTimeOverride(
        ISLAND_OCEAN_BODY_ID,
        getOceanController()?.surfaceTimeOverride === undefined ? engine.time.elapsedTime : undefined
      );
      syncPauseButton();
    };
    document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((button) => {
      button.onclick = () => setView(button.dataset.view as OceanCameraView);
    });
    document.querySelectorAll<HTMLButtonElement>("button").forEach((button) => {
      button.disabled = false;
    });
    if (import.meta.env.DEV) {
      const { mountWaterDevTools } = await import("@galacean/engine-water/water/devtools/index");
      if (destroyed) return;
      own(
        mountWaterDevTools({
          loader: host.loader,
          initiallyOpen: new URLSearchParams(location.search).get("debug") === "1",
          camera: {
            poses: { 环岛全景: "island", 近岸浅水: "shore", 远海地平线: "horizon" },
            readPose: () => currentView,
            setPose: (pose) => setView(pose as OceanCameraView)
          }
        })
      );
    }
    document.getElementById("status")!.hidden = true;
    document.body.dataset.ready = "true";
    const debug = {
      getDiagnostics: () => ({
        ready,
        view: currentView,
        paused: getOceanController()?.surfaceTimeOverride !== undefined,
        debugView: getOceanController()?.debugView,
        sharedSurface: {
          contractHash: getOceanController()?.config.renderContract?.contentHash,
          closureVariant: getOceanController()?.config.renderContract?.variantKey,
          geometry: "gerstner-nearshore / projected-horizon",
          optics: "WaterSurfaceShaderAssembler / FinalClosureV2",
          mediumPolicy: "stylized-depth-ramp; physical single-scattering unsupported"
        },
        camera: {
          position: [
            camera.entity.transform.worldPosition.x,
            camera.entity.transform.worldPosition.y,
            camera.entity.transform.worldPosition.z
          ],
          target: [viewTarget.x, viewTarget.y, viewTarget.z],
          forward: [
            camera.entity.transform.worldForward.x,
            camera.entity.transform.worldForward.y,
            camera.entity.transform.worldForward.z
          ]
        },
        ocean: backend.getRuntimeDiagnostics(ISLAND_OCEAN_BODY_ID)?.controller.metrics,
        tuning: getOceanController()?.tuning,
        waterLevel: waterLevel.readback,
        host: host.getDiagnostics(),
        lighting: lighting.getSnapshot()
      }),
      setView,
      setSurfaceTime: (seconds: number) => {
        if (!Number.isFinite(seconds) || seconds < 0) throw new RangeError("Ocean time must be non-negative.");
        backend.setRuntimeSurfaceTimeOverride(ISLAND_OCEAN_BODY_ID, seconds);
        syncPauseButton();
      }
    };
    Object.assign(window, { oceanGalleryDebug: debug });
  } catch (error) {
    const cancelled = destroyed;
    await dispose();
    if (!cancelled) throw error;
  }
}

void bootstrap().catch((error: unknown) => {
  if (error instanceof DOMException && error.name === "AbortError") return;
  console.error("[ocean-gallery] startup failed", error);
  const status = document.getElementById("status")!;
  status.hidden = false;
  status.textContent = `海洋加载失败：${error instanceof Error ? error.message : String(error)}`;
  document.body.dataset.ready = "false";
});
