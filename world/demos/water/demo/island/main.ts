import {
  BloomEffect,
  Camera,
  Color,
  ColorAdjustmentsEffect,
  DayNightProceduralSky,
  DayNightSolarPosition,
  DirectLight,
  Layer,
  PostProcess,
  RealtimeIBLBaker,
  Script,
  ShadowType,
  TonemappingEffect,
  TonemappingMode,
  Vector3,
  WebGLEngine,
  WebGLMode
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import {
  HeightfieldWaterBackend,
  HeightfieldWaterCompileWorkerClient
} from "@galacean/engine-water/water/runtime/heightfield/index";
import type { WaterSceneBodyRequest, WaterSceneBodySetTransaction } from "@galacean/engine-water/water/runtime/index";
import { WaterSceneRuntimeHost } from "@galacean/engine-water/water/runtime/index";
import {
  createOceanEditRevision,
  OceanEditSession,
  OceanWaterBackend
} from "@galacean/engine-water/water/runtime/ocean/index";
import { createIslandOceanOwnership } from "./WaterIslandOceanEditing.ts";
import { mountIslandOceanEditor } from "./WaterIslandOceanEditor.ts";

import { RiverCompileWorkerClient, RiverWaterBackend } from "@galacean/engine-water/water/runtime/river/index";

import { registerLakeWaterLook } from "@galacean/engine-water/water/presets/lake/index";
import { LAKE_NORMAL_RESOURCE, LakeNormalAssetLoader } from "@galacean/engine-water/water/resources/lake/index";
import { OceanTextureLibrary } from "@galacean/engine-water/water/resources/ocean/index";

import {
  createRiverWaterBodyAsset,
  createRiverWaterBodyInstance,
  RiverQualityLevel
} from "@galacean/engine-water/water/index";
import {
  registerRiverHighLook,
  registerRiverWaterBodyPresets,
  RIVER_HIGH_LOOK_ID,
  riverQualityPlanIdForQuality
} from "@galacean/engine-water/water/presets/river/index";

import {
  PROCEDURAL_SKY_REALTIME_IBL_OPTIONS,
  PROCEDURAL_SKY_SOLAR_POSITION
} from "@galacean/engine-environment/lighting/ProceduralSkyLightingProfile";
import { createIslandOceanBody } from "../../ocean/IslandOceanSource.ts";
import { resizeEngineCanvasByClientSize } from "../resizeEngineCanvas.ts";
import { WaterLandscapeAssets } from "../shared/WaterLandscapeAssets.ts";
import { createShowcaseCameraController } from "../showcase/ShowcaseCameraControl.ts";
import { createIslandLakeBody, getIslandWaterBodyRevision } from "./WaterIslandAuthoring.ts";
import { createWaterIslandBodies } from "./WaterIslandBodies.ts";
import { createWaterIslandLandscape } from "./WaterIslandLandscape.ts";
import { registerWaterIslandLook } from "./WaterIslandLook.ts";
import { WATER_ISLAND_PRESET } from "./WaterIslandPreset.ts";
import { createWaterIslandSource, createWaterIslandTerrain } from "./WaterIslandTerrain.ts";

type View = keyof typeof WATER_ISLAND_PRESET.cameras;
async function bootstrap() {
  const started = performance.now(),
    abort = new AbortController();
  let ready = false,
    closed = false,
    errorMessage: string | undefined,
    view: View = "hero",
    readyMs: number | undefined;
  const status = document.getElementById("status")!;
  const cleanup: (() => void | Promise<void>)[] = [];
  const own = <T>(value: T, release: (value: T) => void | Promise<void>): T => {
    if (closed) {
      void release(value);
      throw new DOMException("Island closed", "AbortError");
    }
    cleanup.push(() => release(value));
    return value;
  };
  const dispose = async () => {
    if (closed) return;
    closed = true;
    ready = false;
    document.body.dataset.ready = "false";
    abort.abort();
    for (const release of cleanup.reverse()) {
      try {
        await release();
      } catch (error) {
        console.error("[water-island] cleanup", error);
      }
    }
  };
  const onPageHide = () => void dispose();
  window.addEventListener("pagehide", onPageHide, { once: true });
  cleanup.push(() => window.removeEventListener("pagehide", onPageHide));
  if (import.meta.hot) import.meta.hot.dispose(() => void dispose());
  try {
    const engine = own(
      await WebGLEngine.create({
        canvas: "canvas",
        graphicDeviceOptions: { webGLMode: WebGLMode.WebGL2 },
        shaderCompiler: new ShaderCompiler()
      }),
      (e) => e.destroy()
    );
    const scene = engine.sceneManager.activeScene!,
      root = scene.createRootEntity("Water Island");
    scene.ambientLight.diffuseSolidColor = new Color(0.68, 0.74, 0.78, 1);
    scene.ambientLight.diffuseIntensity = 0.45;
    const sun = root.createChild("Sun").addComponent(DirectLight);
    sun.entity.transform.setRotation(-48, -35, 0);
    sun.color = new Color(1.25, 1.18, 1.05, 1);
    sun.shadowType = ShadowType.SoftLow;
    scene.shadowDistance = 240;
    const camera = root.createChild("Camera").addComponent(Camera);
    camera.nearClipPlane = 0.2;
    camera.farClipPlane = 2400;
    camera.fieldOfView = 50;
    camera.enableHDR = true;
    camera.enablePostProcess = true;
    const post = root.createChild("Island post processing").addComponent(PostProcess);
    post.addEffect(TonemappingEffect)!.mode.value = TonemappingMode.ACES;
    post.addEffect(ColorAdjustmentsEffect)!.postExposure.value = 0.65;
    const bloom = post.addEffect(BloomEffect)!;
    bloom.threshold.value = 1;
    bloom.intensity.value = 0.15;
    scene.sun = sun;
    const sky = own(
      new DayNightProceduralSky(scene, new DayNightSolarPosition(PROCEDURAL_SKY_SOLAR_POSITION), "Island daylight"),
      (s) => s.destroy()
    );
    sky.material.sunDirection.copyFrom(sun.entity.transform.worldForward);
    sky.material.exposure = 1;
    const baker = own(new RealtimeIBLBaker(scene, PROCEDURAL_SKY_REALTIME_IBL_OPTIONS), (b) => b.destroy());
    baker.requestBake();
    const host = own(
      new WaterSceneRuntimeHost({
        engine,
        scene,
        root,
        camera,
        waterLayer: Layer.Layer30,
        maximumConcurrentBodyPreparations: 2,
        reflection: { cullingMask: Layer.Everything, waterLayerMask: Layer.Layer30 }
      }),
      (h) => h.destroy()
    );
    const heightfieldWorker = own(new HeightfieldWaterCompileWorkerClient(), (w) => w.dispose()),
      riverWorker = own(new RiverCompileWorkerClient(), (w) => w.dispose());
    const lakeBackend = new HeightfieldWaterBackend({
      compile: (d, c) => heightfieldWorker.compile(d, c.signal, c.resolvedInstance?.qualityPlan.query ?? "dense")
    });
    const riverBackend = new RiverWaterBackend({ compile: (d, c) => riverWorker.compile(d, c.signal) }),
      oceanBackend = new OceanWaterBackend();
    host.createEnvironmentReflectionProvider({
      id: "island-daylight",
      source: { ambientLight: scene.ambientLight, rotationDegrees: 0, exposure: 1, hdr: true }
    });
    host.registerBackend(lakeBackend);
    host.registerBackend(riverBackend);
    host.registerBackend(oceanBackend);
    host.registerAuthoring(registerLakeWaterLook);
    host.registerAuthoring(registerRiverWaterBodyPresets);
    host.registerAuthoring(registerRiverHighLook);
    const normal = own(new LakeNormalAssetLoader(engine), (n) => n.requestDisposeAfterRuntimeDetach());
    host.registerRuntimeResource({
      descriptor: LAKE_NORMAL_RESOURCE,
      load: async () => {
        const resource = await normal.load();
        if (!resource) throw new Error("Lake normal texture unavailable");
        return { texture: resource.texture, releaseBorrow: normal.acquireRuntimeBorrow() };
      },
      destroy: (resource) => (resource as { releaseBorrow: () => void }).releaseBorrow()
    });
    const control = own(createShowcaseCameraController(camera.entity, { mode: "free", movementSpeed: 28 }), (c) =>
      c.destroy()
    );
    const setView = (next: View) => {
      const pose = WATER_ISLAND_PRESET.cameras[next];
      if (!pose) throw new Error("Unknown island camera");
      camera.entity.transform.setPosition(pose.position[0], pose.position[1], pose.position[2]);
      camera.entity.transform.lookAt(new Vector3(...pose.target));
      control.syncFromTransform();
      view = next;
    };
    const resize = () => {
      resizeEngineCanvasByClientSize(engine, "canvas", 1);
    };
    resize();
    setView("hero");
    const observer = new ResizeObserver(resize);
    observer.observe(document.getElementById("canvas")!);
    cleanup.push(() => observer.disconnect());
    const frames: number[] = [];
    let lastFrame = performance.now(),
      paused = false;
    class IslandFrame extends Script {
      override onUpdate(dt: number) {
        const now = performance.now();
        baker.update();
        if (ready) {
          frames.push(now - lastFrame);
          if (frames.length > 600) frames.shift();
          oceanBackend.updateRuntime("ocean", dt);
        }
        lastFrame = now;
      }
    }
    root.addComponent(IslandFrame);
    engine.run();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    let source = createWaterIslandTerrain(),
      bodies = createWaterIslandBodies(source);
    const ownership = createIslandOceanOwnership(source, bodies.ocean.config.nearshoreDescriptor.grid);
    const initialOcean = createOceanEditRevision(
      bodies.ocean.config.nearshoreDescriptor,
      ownership,
      { waterLevel: 0, terrain: source.terrain },
      0
    );
    bodies = {
      ...bodies,
      ocean: { ...bodies.ocean, config: { ...bodies.ocean.config, nearshoreDescriptor: initialOcean.nearshore } }
    };
    status.textContent = "正在准备水体与景观素材…";
    const loaded = await Promise.allSettled([
      baker.waitForFirstBake(),
      OceanTextureLibrary.create(engine).then((t) => own(t, (t) => t.destroy())),
      WaterLandscapeAssets.load(engine).then((a) => own(a, (a) => a.destroyAfterSceneDetach()))
    ]);
    const failed = loaded.find((r) => r.status === "rejected");
    if (failed?.status === "rejected") throw failed.reason;
    const textures = (loaded[1] as PromiseFulfilledResult<OceanTextureLibrary>).value;
    const assets = (loaded[2] as PromiseFulfilledResult<WaterLandscapeAssets>).value;
    // Release body borrowers before shared textures, including failures during preparation.
    cleanup.push(() => host.destroy());
    const transaction = host.beginBodySetTransaction();
    cleanup.push(() => transaction.rollback());
    let bodyRevisions = new Map<string, string>();
    let surfaceTimeOverride: number | undefined;
    const stageBodies = (
      transaction: WaterSceneBodySetTransaction,
      bodies: ReturnType<typeof createWaterIslandBodies>
    ) => {
      const nextRevisions = new Map<string, string>();
      const stageChangedBody = (request: WaterSceneBodyRequest) => {
        const revision = getIslandWaterBodyRevision(request);
        nextRevisions.set(request.bodyId, revision);
        if (bodyRevisions.get(request.bodyId) !== revision) transaction.stage(request);
      };
      for (const descriptor of bodies.lakes) {
        const body = host.registerAuthoring((a) => createIslandLakeBody(a, descriptor));
        stageChangedBody({
          bodyId: descriptor.id,
          ...body,
          createRuntimeContext: (bodyRoot) => ({ engine, root: bodyRoot, surfaceTimeOverride }),
          setSurfaceTimeOverride: (s) => lakeBackend.setRuntimeSurfaceTimeOverride(descriptor.id, s)
        });
      }
      for (const descriptor of bodies.rivers) {
        const asset = createRiverWaterBodyAsset(descriptor, descriptor.id),
          instance = createRiverWaterBodyInstance({
            id: descriptor.id,
            assetId: asset.id,
            lookPresetId: host.registerAuthoring((a) => registerWaterIslandLook(a, RIVER_HIGH_LOOK_ID, "river")),
            qualityPlanId: riverQualityPlanIdForQuality(RiverQualityLevel.High),
            visible: true
          });
        stageChangedBody({
          bodyId: descriptor.id,
          asset,
          instance: { ...instance, interaction: { query: true, buoyancy: false, wake: false } },
          createRuntimeContext: (bodyRoot) => ({ engine, root: bodyRoot, surfaceTimeOverride }),
          setSurfaceTimeOverride: (s) => riverBackend.getRuntimeController(descriptor.id)?.setSurfaceTimeOverride(s)
        });
      }
      const ocean = host.registerAuthoring((a) => {
        const body = createIslandOceanBody(a, bodies.ocean);
        return {
          ...body,
          instance: { ...body.instance, lookPresetId: registerWaterIslandLook(a, body.instance.lookPresetId, "ocean") }
        };
      });
      stageChangedBody({
        bodyId: "ocean",
        ...ocean,
        createRuntimeContext: (bodyRoot) => ({
          engine,
          root: bodyRoot,
          textures: textures.textures,
          cameraPositionProvider: () => camera.entity.transform.worldPosition,
          sceneFogEnabled: false,
          surfaceTimeOverride
        }),
        setSurfaceTimeOverride: (s) => oceanBackend.setRuntimeSurfaceTimeOverride("ocean", s)
      });
      return nextRevisions;
    };
    const initialBodyRevisions = stageBodies(transaction, bodies);
    let landscape = await createWaterIslandLandscape(
      engine,
      root,
      assets,
      source.terrain,
      WATER_ISLAND_PRESET.seed,
      abort.signal
    );
    cleanup.push(() => landscape.destroy());
    const prepared = await transaction.prepare(abort.signal);
    if (closed) {
      await prepared.rollback();
      return;
    }
    landscape.root.isActive = true;
    await prepared.commit().retiredCleanup;
    bodyRevisions = initialBodyRevisions;
    const oceanEditor = new OceanEditSession(initialOcean, ownership, async (next, signal) => {
      // Yield pending UI before bounded CPU compilation. All resources remain hidden until commit.
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      if (signal.aborted) throw new DOMException("Ocean edit cancelled", "AbortError");
      const nextSource = createWaterIslandSource(next.document.terrain, next.document.waterLevel);
      const nextBodies = createWaterIslandBodies(nextSource, next.nearshore);
      const water = host.beginBodySetTransaction();
      const previousLandscape = landscape;
      let ground: Awaited<ReturnType<typeof createWaterIslandLandscape>> | undefined;
      let field: ReturnType<typeof landscape.prepareWaterLevel> | undefined;
      let prepared: Awaited<ReturnType<typeof water.prepare>> | undefined;
      let retiredCleanup: Promise<void> | undefined;
      let nextBodyRevisions: Map<string, string>;
      try {
        nextBodyRevisions = stageBodies(water, nextBodies);
        if (next.terrainHash === oceanEditor.current.terrainHash) {
          field = landscape.prepareWaterLevel(next.document.waterLevel);
        } else {
          ground = await createWaterIslandLandscape(
            engine,
            root,
            assets,
            next.document.terrain,
            WATER_ISLAND_PRESET.seed,
            signal,
            next.document.waterLevel
          );
        }
        prepared = await water.prepare(signal);
      } catch (error) {
        try {
          await water.rollback();
        } finally {
          ground?.destroy();
          field?.rollback();
        }
        throw error;
      }
      return {
        commit: () => {
          // Prepare ground publication first, so a Water commit failure can restore it synchronously.
          field?.commit();
          if (ground) {
            ground.root.isActive = true;
            previousLandscape.root.isActive = false;
          }
          try {
            retiredCleanup = prepared!.commit().retiredCleanup;
          } catch (error) {
            field?.rollback();
            if (ground) {
              ground.root.isActive = false;
              previousLandscape.root.isActive = true;
            }
            throw error;
          }
          // Read the latest pause state at publication: it may change while preparation is pending.
          host.setSurfaceTimeOverride(surfaceTimeOverride);
          bodyRevisions = nextBodyRevisions;
          if (ground) landscape = ground;
          source = nextSource;
          bodies = nextBodies;
        },
        finalize: async () => {
          try {
            await retiredCleanup;
          } finally {
            field?.finalize();
            if (ground) previousLandscape.destroy();
          }
        },
        rollback: async () => {
          try {
            await prepared!.rollback();
          } finally {
            field?.rollback();
            ground?.destroy();
          }
        }
      };
    });
    // Dispose pending edits before their visible ground, water or texture owners.
    cleanup.push(() => oceanEditor.dispose());
    own(
      mountIslandOceanEditor(oceanEditor, () => setView("coast")),
      (panel) => panel.destroy()
    );
    const { mountWaterDevTools } = await import("@galacean/engine-water/water/devtools/index");
    own(
      mountWaterDevTools({
        loader: host.loader,
        mode: "presentation",
        initiallyOpen: false,
        camera: {
          poses: Object.fromEntries(Object.entries(WATER_ISLAND_PRESET.cameras).map(([id, p]) => [p.label, id])),
          readPose: () => view,
          setPose: (p) => setView(p as View)
        },
        sceneActions: [
          {
            group: "Surface",
            label: "暂停 / 继续动画",
            run: () => {
              paused = !paused;
              surfaceTimeOverride = paused ? engine.time.elapsedTime : undefined;
              host.setSurfaceTimeOverride(surfaceTimeOverride);
            }
          }
        ]
      }),
      (p) => p.destroy()
    );
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    if (closed) return;
    ready = true;
    readyMs = performance.now() - started;
    status.hidden = true;
    document.body.dataset.ready = "true";
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : String(error);
    const cancelled = closed;
    await dispose();
    if (!cancelled) {
      document.body.dataset.ready = "false";
      status.hidden = false;
      status.textContent = `岚湾岛加载失败：${errorMessage}`;
      console.error("[water-island] initialization failed", error);
    }
  }
}
void bootstrap();
