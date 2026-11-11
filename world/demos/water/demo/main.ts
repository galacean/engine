import { Camera, Color, DirectLight, Layer, ShadowType, Vector3, WebGLEngine, WebGLMode } from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import {
  createRiverWaterBodyAsset,
  createRiverWaterBodyInstance,
  RiverQualityLevel,
  sampleWaterTerrainHeight
} from "@galacean/engine-water/water/index";
import {
  registerRiverWaterBodyPresets,
  riverQualityPlanIdForQuality
} from "@galacean/engine-water/water/presets/river/index";
import * as dat from "dat.gui";
import { RiverDemoCleanup } from "./river/RiverDemoCleanup.ts";

import {
  commitRiverEdit,
  RiverCompileWorkerClient,
  RiverEditSession,
  RiverWaterBackend,
  type RiverEditPublication
} from "@galacean/engine-water/water/runtime/river/index";

import { createWaterSurfaceSample, WaterSceneRuntimeHost } from "@galacean/engine-water/water/runtime/index";

import { registerRiverHighLook, RIVER_HIGH_LOOK_ID } from "@galacean/engine-water/water/presets/river/index";
import { resizeEngineCanvasByClientSize } from "./resizeEngineCanvas.ts";
import {
  createRiverDemoSceneSource,
  RIVER_DEMO_SCENARIOS,
  RIVER_DEMO_SCENE_DEFAULTS,
  type RiverDemoSceneParameters
} from "./river/RiverDemoSceneSource.ts";
import { createShowcaseCameraController } from "./showcase/ShowcaseCameraControl.ts";

import { createRiverDemoEnvironment } from "./river/RiverDemoEnvironment.ts";
import {
  applyRiverDemoLook,
  exportRiverDemoLook,
  importRiverDemoLook,
  readRiverDemoLook,
  validateRiverDemoLook,
  type RiverDemoLook
} from "./river/RiverDemoLook.ts";
import { createRiverDemoLookPanel } from "./river/RiverDemoLookPanel.ts";
import { riverDemoSceneConfiguration, type RiverDemoCameraView } from "./river/RiverDemoSceneConfiguration.ts";
import { RiverDemoSceneView } from "./river/RiverDemoSceneView.ts";
import { RiverValleyAssets } from "./river/RiverValleyAssets.ts";
import { registerRiverValleyLook, RIVER_VALLEY_LOOK_ID } from "./river/RiverValleyScene.ts";
import { RiverValleySceneView } from "./river/RiverValleySceneView.ts";
import { WaterLandscapeAssets } from "./shared/WaterLandscapeAssets.ts";

import { createRiverEditorPanel } from "./river/RiverEditorPanel.ts";

async function bootstrapRiverDemo() {
  const engine = await WebGLEngine.create({
    canvas: "canvas",
    shaderCompiler: new ShaderCompiler(),
    graphicDeviceOptions: { webGLMode: WebGLMode.WebGL2 }
  });
  const cleanup = new RiverDemoCleanup();
  cleanup.defer(() => engine.destroy());
  try {
    const scene = engine.sceneManager.activeScene!;
    scene.background.solidColor = new Color(0.55, 0.73, 0.8, 1);
    scene.ambientLight.diffuseSolidColor = new Color(0.68, 0.74, 0.78, 1);
    scene.ambientLight.diffuseIntensity = 0.35;
    const root = scene.createRootEntity("river-demo");
    const sun = root.createChild("sun");
    sun.transform.setRotation(-48, -35, 0);
    const sunlight = sun.addComponent(DirectLight);
    sunlight.color = new Color(1.5, 1.425, 1.29, 1);
    sunlight.shadowType = ShadowType.SoftLow;
    scene.shadowDistance = 100;
    scene.fogColor = new Color(0.55, 0.67, 0.68, 1);
    scene.fogStart = 95;
    scene.fogEnd = 200;
    const cameraEntity = root.createChild("camera");
    const camera = cameraEntity.addComponent(Camera);
    camera.nearClipPlane = 0.1;
    camera.farClipPlane = 240;
    const cameraControl = createShowcaseCameraController(cameraEntity, { mode: "free", movementSpeed: 10 });
    cleanup.defer(() => cameraControl.destroy());
    let landscapeAssets: WaterLandscapeAssets | undefined;
    let valleyAssets: RiverValleyAssets | undefined;
    cleanup.defer(() => valleyAssets?.destroy());
    cleanup.defer(() => landscapeAssets?.destroyAfterSceneDetach());
    const host = new WaterSceneRuntimeHost({
      engine,
      scene,
      camera,
      root,
      cacheEntryLimit: 4,
      reflection: { cullingMask: Layer.Everything, waterLayerMask: Layer.Layer30 }
    });
    cleanup.defer(() => host.destroy());
    const compileWorker = new RiverCompileWorkerClient();
    cleanup.defer(() => compileWorker.dispose());
    const riverBackend = new RiverWaterBackend({
      compile: (descriptor, context) => compileWorker.compile(descriptor, context.signal)
    });
    host.registerBackend(riverBackend);
    host.registerAuthoring(registerRiverWaterBodyPresets);
    host.registerAuthoring(registerRiverHighLook);
    host.registerAuthoring(registerRiverValleyLook);
    let environment: Awaited<ReturnType<typeof createRiverDemoEnvironment>> | undefined;
    cleanup.defer(() => environment?.destroy());
    async function ensureValleyAssets() {
      return (valleyAssets ??= await RiverValleyAssets.load(engine));
    }
    environment = await createRiverDemoEnvironment(scene, camera, sunlight, host);
    landscapeAssets = await WaterLandscapeAssets.load(engine);
    const resize = () => {
      resizeEngineCanvasByClientSize(engine);
    };
    resize();
    window.addEventListener("resize", resize);
    cleanup.defer(() => window.removeEventListener("resize", resize));
    engine.run();
    await environment!.waitForReady();

    const sceneParameters = { ...RIVER_DEMO_SCENE_DEFAULTS };
    let activeLookId = riverDemoSceneConfiguration(sceneParameters.scenario).lookId;
    const defaultLooks = new Map(
      [RIVER_HIGH_LOOK_ID, activeLookId].map((id) => [id, host.assets.getLookAuthoringSnapshot(id)!])
    );
    let appearanceParameters = readRiverDemoLook(defaultLooks.get(activeLookId)!);
    const probeCoordinates = { x: 0, z: 0 };
    const status = document.createElement("output");
    status.setAttribute("aria-live", "polite");
    status.style.cssText =
      "position:fixed;left:16px;bottom:16px;padding:10px 14px;border-radius:5px;background:#10272bdb;color:#eff8f7;font:12px/1.7 system-ui;white-space:pre;pointer-events:none;z-index:4";
    document.body.append(status);
    cleanup.defer(() => status.remove());
    const gui = new dat.GUI({ width: 300 });
    cleanup.defer(() => gui.destroy());
    gui.domElement.dataset.waterDebugPanel = "river";
    function refreshGui(folder: dat.GUI): void {
      folder.__controllers.forEach((controller) => controller.updateDisplay());
      Object.values(folder.__folders).forEach(refreshGui);
    }
    const requestedTime = new URLSearchParams(window.location.search).get("surfaceTime");
    let surfaceTimeOverride =
      requestedTime !== null && Number.isFinite(Number(requestedTime)) ? Number(requestedTime) : undefined;
    const bodyId = "river-demo";
    let sceneView: RiverDemoSceneView | RiverValleySceneView | undefined;
    const presentation = { sceneryVisible: true };
    let editorSession: RiverEditSession | undefined;
    let editorPanel: ReturnType<typeof createRiverEditorPanel> | undefined;
    cleanup.defer(() => sceneView?.destroy());
    cleanup.defer(() => editorSession?.cancel());
    cleanup.defer(() => editorPanel?.destroy());
    let publishedSceneParameters: RiverDemoSceneParameters | undefined;
    let sceneUpdateAbortController: AbortController | undefined;
    let pendingMutation = Promise.resolve();
    let disposed = false;
    let phase = "准备中";
    let lastError: string | undefined;
    let waterVisible = true;
    const probePoint = new Vector3();
    const surfaceSample = createWaterSurfaceSample();

    function sampleWaterAt(x: number, z: number) {
      probePoint.set(x, 0, z);
      const hit = !disposed && host.world.sampleSurface(probePoint, surfaceSample);
      const bedHeight = sceneView ? sampleWaterTerrainHeight(sceneView.terrain, x, z) : undefined;
      return {
        hit,
        surfaceHeight: hit ? surfaceSample.surfacePosition.y : undefined,
        bedHeight,
        waterDepth: hit ? surfaceSample.waterDepth : undefined,
        terrainRevision: sceneView?.terrain.revision
      };
    }
    function refreshStatus() {
      if (disposed) return;
      const sample = sampleWaterAt(probeCoordinates.x, probeCoordinates.z);
      const metre = (value: number | undefined) => (value === undefined ? "—" : `${value.toFixed(3)} m`);
      status.textContent = `${phase} · High · 地形版本 ${sceneView?.terrain.revision ?? "—"}\n水面 ${metre(sample.surfaceHeight)}  河床 ${metre(sample.bedHeight)}  水深 ${metre(sample.waterDepth)}${lastError ? `\n${lastError}` : ""}`;
    }
    const reportError = (error: unknown) => {
      if (error instanceof Error && error.name === "AbortError") {
        phase = "已取消";
      } else {
        phase = "更新失败";
        lastError = error instanceof Error ? error.message : String(error);
        console.error("[river-demo]", error);
      }
      refreshStatus();
    };
    function enqueueMutation(operation: () => Promise<void>): Promise<void> {
      const next = pendingMutation.then(async () => {
        if (!disposed) await operation();
      });
      pendingMutation = next.catch(reportError);
      return next;
    }
    function updateScene(): Promise<void> {
      if (sceneParameters.scenario === "editing" && publishedSceneParameters?.scenario === "editing" && editorSession) {
        if (!editorSession.snapshot.draft.riverEnabled) editorSession.setRiverEnabled(true);
        return publishEditor("apply");
      }
      editorSession?.cancel();
      return publishSceneChange({ kind: "replace", parameters: { ...sceneParameters } });
    }
    function removeWaterBody(): Promise<void> {
      if (editorSession && publishedSceneParameters?.scenario === "editing") return publishEditor("remove");
      editorSession?.cancel();
      return publishSceneChange({ kind: "remove" });
    }
    function publishSceneChange(
      change:
        | {
            kind: "replace";
            parameters: RiverDemoSceneParameters;
            edit?: { session: RiverEditSession; publication: RiverEditPublication };
          }
        | { kind: "remove" }
    ): Promise<void> {
      sceneUpdateAbortController?.abort();
      const updateAbortController = new AbortController();
      sceneUpdateAbortController = updateAbortController;
      const edit = change.kind === "replace" ? change.edit : undefined;
      const cancelEdit = () => updateAbortController.abort();
      edit?.publication.signal.addEventListener("abort", cancelEdit, { once: true });
      if (edit?.publication.signal.aborted) updateAbortController.abort();
      return enqueueMutation(async () => {
        if (updateAbortController.signal.aborted) throw new DOMException("更新已取消", "AbortError");
        phase = change.kind === "remove" ? "删除中" : "准备中";
        lastError = undefined;
        refreshStatus();
        const transaction = host.beginBodySetTransaction();
        const revision = transaction.revision;
        let stagedSceneView: RiverDemoSceneView | RiverValleySceneView | undefined;
        let stagedEditorSession: RiverEditSession | undefined;
        try {
          if (change.kind === "remove") {
            transaction.remove(bodyId);
          } else {
            if (change.parameters.scenario === "valley") await ensureValleyAssets();
            if (updateAbortController.signal.aborted || disposed) throw new DOMException("更新已取消", "AbortError");
            const sceneSource = edit
              ? {
                  riverDescriptor: edit.session.createDescriptor(edit.publication.document, edit.publication.terrain),
                  terrain: edit.publication.terrain,
                  objects: [],
                  scenario: "editing" as const
                }
              : createRiverDemoSceneSource(change.parameters, revision, valleyAssets?.terrain);
            if (change.parameters.scenario === "editing") {
              stagedEditorSession =
                edit?.session ??
                new RiverEditSession(
                  sceneSource.terrain,
                  sceneSource.riverDescriptor.segments[0].curve.points.map((point) => ({
                    id: point.id,
                    position: point.position,
                    width: point.width ?? 8,
                    flowSpeed: point.flowSpeed ?? 1,
                    elevationLocked: true
                  }))
                );
              sceneSource.terrain = edit?.publication.terrain ?? stagedEditorSession.publishedTerrain;
              sceneSource.riverDescriptor = stagedEditorSession.createDescriptor(
                edit?.publication.document,
                sceneSource.terrain
              );
            }
            // Scenery clearance also depends on edited points, even on unchanged terrain.
            stagedSceneView =
              sceneSource.scenario === "valley"
                ? new RiverValleySceneView(engine, root, sceneSource.terrain, valleyAssets!, host.world)
                : new RiverDemoSceneView(
                    engine,
                    root,
                    sceneSource.terrain,
                    sceneSource.objects,
                    sceneSource.scenario,
                    landscapeAssets!,
                    sceneSource.riverDescriptor.segments[0].curve.points
                  );
            if (stagedSceneView instanceof RiverValleySceneView) {
              stagedSceneView.effects?.setLook(
                host.assets.getLookAuthoringSnapshot(RIVER_VALLEY_LOOK_ID)!.look.contactEffects
              );
              stagedSceneView.effects?.setVisible(waterVisible);
            }
            stagedSceneView.scenery.isActive = presentation.sceneryVisible;
            if (edit && !edit.publication.document.riverEnabled) transaction.remove(bodyId);
            else {
              const asset = createRiverWaterBodyAsset(sceneSource.riverDescriptor);
              transaction.stage({
                bodyId,
                asset,
                instance: createRiverWaterBodyInstance({
                  id: bodyId,
                  assetId: asset.id,
                  lookPresetId: riverDemoSceneConfiguration(change.parameters.scenario).lookId,
                  qualityPlanId: riverQualityPlanIdForQuality(RiverQualityLevel.High),
                  visible: waterVisible
                }),
                createRuntimeContext: (bodyRoot) => ({ engine, root: bodyRoot, surfaceTimeOverride })
              });
            }
          }
          const prepared = await transaction.prepare(updateAbortController.signal);
          if (updateAbortController.signal.aborted || disposed) {
            await prepared.rollback();
            throw new DOMException("更新已取消", "AbortError");
          }
          const previousSceneView = sceneView;
          const publication = commitRiverEdit(edit?.publication, prepared, {
            commit: () => {
              if (change.kind === "replace") environment!.setScenario(change.parameters.scenario, valleyAssets);
              if (stagedSceneView) {
                stagedSceneView.root.isActive = true;
                if (previousSceneView) previousSceneView.root.isActive = false;
              }
            },
            rollback: () => {
              if (publishedSceneParameters) environment!.setScenario(publishedSceneParameters.scenario, valleyAssets);
              if (stagedSceneView) stagedSceneView.root.isActive = false;
              if (previousSceneView) previousSceneView.root.isActive = true;
            }
          });
          if (change.kind === "remove" && sceneView instanceof RiverValleySceneView)
            sceneView.effects?.setVisible(false);
          if (change.kind === "replace" && stagedSceneView) {
            sceneView = stagedSceneView;
            stagedSceneView = undefined;
            const scenarioChanged = publishedSceneParameters?.scenario !== change.parameters.scenario;
            publishedSceneParameters = change.parameters;
            refreshIntro(change.parameters.scenario);
            const previousLookId = activeLookId;
            activeLookId = riverDemoSceneConfiguration(change.parameters.scenario).lookId;
            appearanceParameters = readRiverDemoLook(host.assets.getLookAuthoringSnapshot(activeLookId)!);
            if (scenarioChanged) {
              const configuration = riverDemoSceneConfiguration(change.parameters.scenario);
              setCameraView(configuration.initialView);
              [probeCoordinates.x, probeCoordinates.z] = configuration.probe;
            }
            if (sceneView instanceof RiverValleySceneView) sceneView.setSurfaceTime(surfaceTimeOverride);
            lookPanel.refresh(previousLookId !== activeLookId);
          }

          editorSession = stagedEditorSession;
          refreshEditor();
          phase = change.kind === "remove" || edit?.publication.document.riverEnabled === false ? "水体已删除" : "就绪";
          refreshStatus();
          if (change.kind === "replace" && previousSceneView !== sceneView) previousSceneView?.destroy();
          await publication.retiredCleanup;
        } finally {
          if (transaction.active) await transaction.rollback();
          stagedSceneView?.destroy();
        }
      }).finally(() => {
        edit?.publication.signal.removeEventListener("abort", cancelEdit);
        edit?.publication.finish();
        refreshEditor();
      });
    }
    function requireEditor(): RiverEditSession {
      if (!editorSession || publishedSceneParameters?.scenario !== "editing")
        throw new Error("请先选择河流编辑与河槽场景");
      return editorSession;
    }
    function refreshEditor() {
      if (disposed) return;
      editorPanel?.refresh();
      for (const controller of sceneGui.__controllers) {
        if (["width", "depth", "flowSpeed"].includes(controller.property))
          controller.domElement.closest("li")!.style.display =
            editorSession || (publishedSceneParameters?.scenario === "valley" && controller.property !== "flowSpeed")
              ? "none"
              : "";
      }
    }
    async function publishEditor(action: "apply" | "undo" | "redo" | "remove") {
      const session = requireEditor();
      const publication =
        action === "undo"
          ? session.prepareUndo()
          : action === "redo"
            ? session.prepareRedo()
            : action === "remove"
              ? session.prepareRemove()
              : session.prepareApply();
      await publishSceneChange({
        kind: "replace",
        parameters: { ...sceneParameters, scenario: "editing" },
        edit: { session, publication }
      });
    }
    async function publishAppearanceParameters(candidate: RiverDemoLook, lookId: string): Promise<void> {
      const requested = validateRiverDemoLook(candidate);
      await host.updateLookAuthoring(lookId, (current) => applyRiverDemoLook(current, requested));
      if (activeLookId === lookId) {
        appearanceParameters = requested;
        if (sceneView instanceof RiverValleySceneView) sceneView.effects?.setLook(requested.contactEffects);
      }
      lastError = undefined;
      phase = host.hasBody(bodyId) ? "就绪" : "水体已删除";
      refreshStatus();
    }
    function replaceAppearanceParameters(candidate: RiverDemoLook): Promise<void> {
      const requested = validateRiverDemoLook(candidate);
      const lookId = activeLookId;
      return enqueueMutation(() => publishAppearanceParameters(requested, lookId));
    }
    function patchAppearanceParameters(parameters: Partial<RiverDemoLook>): Promise<void> {
      // Capture caller-owned arrays now, but merge against the latest committed state inside the queue.
      const patch = structuredClone(parameters);
      const lookId = activeLookId;
      return enqueueMutation(() =>
        publishAppearanceParameters(
          { ...readRiverDemoLook(host.assets.getLookAuthoringSnapshot(lookId)!), ...patch },
          lookId
        )
      );
    }
    function setSurfaceTime(time?: number) {
      if (time !== undefined && (!Number.isFinite(time) || time < 0)) throw new RangeError("时间必须为非负有限数。");
      surfaceTimeOverride = time;
      if (sceneView instanceof RiverValleySceneView) sceneView.setSurfaceTime(time);
      riverBackend.getRuntimeController(bodyId)?.setSurfaceTimeOverride(time);
    }
    function setCameraView(view: RiverDemoCameraView) {
      const pose = riverDemoSceneConfiguration(publishedSceneParameters?.scenario ?? sceneParameters.scenario).camera(
        view
      );
      camera.fieldOfView = pose.fov;
      cameraEntity.transform.setPosition(pose.position[0], pose.position[1], pose.position[2]);
      cameraEntity.transform.lookAt(new Vector3(pose.target[0], pose.target[1], pose.target[2]));
      cameraControl.syncFromTransform();
    }

    const actions = {
      updateScene: () => {
        void updateScene().catch(() => {});
      },
      removeWaterBody: () => {
        void removeWaterBody().catch(() => {});
      },
      cancelSceneUpdate: () => sceneUpdateAbortController?.abort(),
      resetScene: () => {
        Object.assign(sceneParameters, RIVER_DEMO_SCENE_DEFAULTS);
        refreshGui(gui);
        setCameraView("overview");
        void updateScene().catch(() => {});
      },
      overview: () => setCameraView("overview"),
      detail: () => setCameraView("detail"),
      grazing: () => setCameraView("grazing"),
      toggleWaterVisible: () => setWaterVisible(!waterVisible)
    };
    const sceneGui = gui.addFolder("河流场景");
    sceneGui.add(sceneParameters, "scenario", RIVER_DEMO_SCENARIOS).name("场景").onChange(actions.updateScene);
    sceneGui.add(sceneParameters, "width", 4, 14, 0.5).name("基准河宽（米）").onFinishChange(actions.updateScene);
    sceneGui.add(sceneParameters, "depth", 0.3, 2.5, 0.1).name("河槽深度（米）").onFinishChange(actions.updateScene);
    sceneGui.add(sceneParameters, "flowSpeed", 0, 3, 0.1).name("流速（米/秒）").onFinishChange(actions.updateScene);
    sceneGui.add(actions, "updateScene").name("创建 / 更新");
    sceneGui.add(actions, "removeWaterBody").name("删除水体");
    sceneGui.add(actions, "cancelSceneUpdate").name("取消更新");
    sceneGui.add(actions, "resetScene").name("重置场景");
    sceneGui.open();
    editorPanel = createRiverEditorPanel(gui, {
      session: () => editorSession,
      camera,
      cameraControl,
      canvas: document.getElementById("canvas") as HTMLCanvasElement,
      publish: publishEditor
    });
    const lookPanel = createRiverDemoLookPanel(gui, {
      readLook: () => appearanceParameters,
      readLookName: () => (activeLookId === RIVER_VALLEY_LOOK_ID ? "River Valley High" : "River High 风格化"),
      readDefaultLook: () => readRiverDemoLook(defaultLooks.get(activeLookId)!),
      applyLook: replaceAppearanceParameters,
      patchLook: patchAppearanceParameters,
      readSurfaceTime: () => surfaceTimeOverride,

      exportLook: () => exportRiverDemoLook(appearanceParameters),
      importLook: (json) => replaceAppearanceParameters(importRiverDemoLook(json)),
      setSurfaceTime,
      setEnvironmentEnabled: environment!.setEnabled
    });
    cleanup.defer(() => lookPanel.destroy());
    const observation = gui.addFolder("观察与查询");
    observation.add(actions, "overview").name("总览");
    observation.add(actions, "detail").name("水底近景");
    observation.add(actions, "grazing").name("低角度");
    for (const [view, label] of [
      ["upstream", "上游陡降"],
      ["cascade", "岩岸跌水"],
      ["downstream", "下游弯道"],
      ["bridge", "桥岸"],
      ["top", "垂直标定"],
      ["low2", "低角度 2°"],
      ["low5", "低角度 5°"],
      ["low15", "低角度 15°"]
    ] as const) {
      observation.add({ go: () => setCameraView(view) }, "go").name(label);
    }
    observation.add(actions, "toggleWaterVisible").name("显示 / 隐藏水面");
    observation.add(probeCoordinates, "x", -128, 128, 0.1).name("探针 X").onChange(refreshStatus);
    observation.add(probeCoordinates, "z", -128, 128, 0.1).name("探针 Z").onChange(refreshStatus);
    observation.open();
    sceneGui
      .add(presentation, "sceneryVisible")
      .name("显示河岸景物")
      .onChange((visible: boolean) => {
        if (sceneView) sceneView.scenery.isActive = visible;
      });
    function refreshIntro(scenario: RiverDemoSceneParameters["scenario"]) {
      const intro = document.getElementById("case-intro-text");
      if (intro)
        intro.textContent = `${riverDemoSceneConfiguration(scenario).description} WASD 移动，Q/E 升降，拖动查看。`;
    }
    refreshIntro(sceneParameters.scenario);
    setCameraView("overview");

    function setWaterVisible(value: boolean): void {
      waterVisible = value;
      host.setVisible(value, "river");
      if (sceneView instanceof RiverValleySceneView) sceneView.effects?.setVisible(value);
    }

    function dispose() {
      disposed = true;
      sceneUpdateAbortController?.abort();
      return cleanup.dispose();
    }

    const onPageHide = () => void dispose();
    window.addEventListener("pagehide", onPageHide, { once: true });
    cleanup.defer(() => window.removeEventListener("pagehide", onPageHide));
    import.meta.hot?.dispose(() => void dispose());
    cleanup.defer(async () => {
      disposed = true;
      sceneUpdateAbortController?.abort();
      await pendingMutation;
    });
    await updateScene();
    return;
  } catch (error) {
    try {
      await cleanup.dispose();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "River 初始化及清理失败");
    }
    throw error;
  }
}

declare global {
  interface Window {
    riverDemo?: Awaited<ReturnType<typeof bootstrapRiverDemo>>;
  }
}

void bootstrapRiverDemo().catch((error) => {
  console.error("[river-demo] initialization failed", error);
  const intro = document.getElementById("case-intro-text");
  if (intro) intro.textContent = `初始化失败：${String(error)}`;
});
