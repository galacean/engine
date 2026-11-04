import {
  AssetType,
  Camera,
  Material,
  PBRMaterial,
  Scene,
  Shader,
  WebGLEngine,
  ScreenSpaceReflection as SSR,
  ScreenSpaceReflectionActivationMode as Mode,
  ScreenSpaceReflectionSettingsSource as Source,
  ScreenSpaceReflectionQuality as Quality,
  ScreenSpaceReflectionReceiverMode as Receiver,
  ScreenSpaceReflectionReceiverPolicy as Policy,
  RenderQueueType,
  MeshRenderer,
  PrimitiveMesh
} from "@galacean/engine";
import { afterAll, beforeAll, expect, it } from "vitest";
let engine: WebGLEngine;
const urls: string[] = [];
function resource(data: unknown) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" }));
  urls.push(url);
  return url;
}
function sceneData(ssr?: unknown) {
  return {
    version: "2.0",
    refs: [],
    entities: [{ components: [0] }, { components: [1] }, { components: [2] }],
    components: [
      { type: "Camera" },
      {
        type: "Camera",
        props: {
          screenSpaceReflectionSettings: {
            settingsSource: Source.Override,
            overrideSettings: { activationMode: Mode.ForceOn, intensity: 0.4 }
          }
        }
      },
      {
        type: "Camera",
        props: {
          screenSpaceReflectionSettings: {
            overrideSettings: { activationMode: Mode.ForceOff },
            settingsSource: Source.Override
          }
        }
      }
    ],
    scene: { rootEntities: [0, 1, 2], background: { mode: 0, color: [0, 0, 0, 1] }, screenSpaceReflection: ssr }
  };
}
beforeAll(async () => {
  engine = await WebGLEngine.create({ canvas: document.createElement("canvas") });
});
afterAll(() => {
  engine.destroy();
  urls.forEach(URL.revokeObjectURL);
});
it("loads three camera policies and resolves scene changes, dynamic cameras and cross-scene moves", async () => {
  const scene = await engine.resourceManager.load<Scene>({
    type: AssetType.Scene,
    url: resource(sceneData({ activationMode: Mode.ForceOn, intensity: 0.8 }))
  });
  const [a, b, c] = scene.rootEntities.map((e) => e.getComponent(Camera)!);
  a.screenSpaceReflection._prepareSettings();
  expect(a.screenSpaceReflection.metrics.resolvedSettings.intensity).toBe(0.8);
  b.screenSpaceReflection._prepareSettings();
  expect(b.screenSpaceReflection.metrics.resolvedSettings.intensity).toBe(0.4);
  c.screenSpaceReflection._prepareSettings();
  expect(c.screenSpaceReflection.metrics.requested).toBe(false);
  scene.screenSpaceReflection.intensity = 0.6;
  a.screenSpaceReflection._prepareSettings();
  expect(a.screenSpaceReflection.metrics.resolvedSettings.intensity).toBe(0.6);
  b.screenSpaceReflection._prepareSettings();
  expect(b.screenSpaceReflection.metrics.resolvedSettings.intensity).toBe(0.4);
  b.screenSpaceReflection.settingsSource = Source.UseSceneSettings;
  b.screenSpaceReflection._prepareSettings();
  expect(b.screenSpaceReflection.metrics.resolvedSettings.intensity).toBe(0.6);
  b.screenSpaceReflection.settingsSource = Source.Override;
  expect(b.screenSpaceReflection.intensity).toBe(0.4);
  const d = scene.createRootEntity().addComponent(Camera);
  d.screenSpaceReflection._prepareSettings();
  expect(d.screenSpaceReflection.metrics.requested).toBe(true);
  const other = new Scene(engine);
  other.screenSpaceReflection.intensity = 0.2;
  other.addRootEntity(d.entity);
  d.screenSpaceReflection._prepareSettings();
  expect(d.screenSpaceReflection.metrics.resolvedSettings.intensity).toBe(0.2);
  const clone = b.entity.clone();
  other.addRootEntity(clone);
  expect(clone.getComponent(Camera)!.screenSpaceReflection.settingsSource).toBe(Source.Override);
  expect(clone.getComponent(Camera)!.screenSpaceReflection.intensity).toBe(0.4);
  scene.destroy();
  other.destroy();
});
it("keeps runtime and missing-field scene defaults compatible; explicit product settings opt in", async () => {
  const scene = await engine.resourceManager.load<Scene>({ type: AssetType.Scene, url: resource(sceneData()) });
  expect(scene.screenSpaceReflection.receiverPolicy).toBe(Policy.ExplicitOnly);
  expect(scene.screenSpaceReflection.resolutionScale).toBe(1);
  const fresh = new Scene(engine);
  expect(fresh.screenSpaceReflection.toJSON()).toEqual(scene.screenSpaceReflection.toJSON());
  fresh.screenSpaceReflection.apply({ receiverPolicy: Policy.StandardPbrAuto });
  fresh.screenSpaceReflection.applyPerformancePreset(Quality.Medium);
  expect(fresh.screenSpaceReflection.resolutionScale).toBe(0.5);
  scene.destroy();
  fresh.destroy();
});
it("presets change exactly six fields and do not serialize runtime state", () => {
  const scene = new Scene(engine);
  const settings = scene.screenSpaceReflection;
  settings.apply({ activationMode: Mode.ForceOn, intensity: 0.3, maxRoughness: 0.4, edgeFade: 0.2, rayLengthFade: 3 });
  const before = settings.toJSON();
  settings.applyPerformancePreset(Quality.High);
  for (const key of [
    "activationMode",
    "receiverPolicy",
    "intensity",
    "maxRoughness",
    "edgeFade",
    "rayLengthFade"
  ] as const)
    expect(settings[key]).toBe(before[key]);
  expect(settings.maxRaySteps).toBe(64);
  expect(settings.toJSON()).not.toHaveProperty("quality");
  const camera = scene.createRootEntity().addComponent(Camera);
  camera.screenSpaceReflection.applySettings(before);
  camera.screenSpaceReflection.applyPerformancePreset(Quality.Low);
  expect(camera.screenSpaceReflection.maxRaySteps).toBe(16);
  expect(camera.screenSpaceReflection.maxRoughness).toBe(0.4);
  scene.destroy();
});
it("Auto selects consumer requests and forced modes preserve dormant requests", () => {
  const scene = new Scene(engine);
  const ssr = scene.createRootEntity().addComponent(Camera).screenSpaceReflection;
  ssr._prepareSettings();
  expect(ssr.metrics.requested).toBe(false);
  const lease = ssr.acquireConsumer("water", {
    receiverMode: Receiver.TransparentSampleOnly,
    maxRaySteps: 12,
    intensity: 0.2
  });
  ssr._prepareSettings();
  expect(ssr.metrics.requested).toBe(true);
  ssr._prepareSettings();
  expect(ssr.getResolvedSettings(Receiver.TransparentSampleOnly).maxRaySteps).toBe(12);
  scene.screenSpaceReflection.activationMode = Mode.ForceOn;
  ssr._prepareSettings();
  expect(ssr.getResolvedSettings(Receiver.TransparentSampleOnly).maxRaySteps).toBe(32);
  scene.screenSpaceReflection.activationMode = Mode.ForceOff;
  ssr._prepareSettings();
  expect(ssr.metrics.requested).toBe(false);
  expect(lease.active).toBe(true);
  scene.screenSpaceReflection.activationMode = Mode.Auto;
  ssr._prepareSettings();
  expect(ssr.getResolvedSettings(Receiver.TransparentSampleOnly).maxRaySteps).toBe(12);
  lease.release();
  ssr._prepareSettings();
  expect(ssr.metrics.requested).toBe(false);
  scene.destroy();
});
it("loads four material classes, preserves strength, resolves queues and restores after incompatible lobes", async () => {
  const scene = new Scene(engine);
  scene.screenSpaceReflection.receiverPolicy = Policy.StandardPbrAuto;
  const ssr = scene.createRootEntity().addComponent(Camera).screenSpaceReflection;
  const loaded: Material[] = [];
  for (const [shader, mode] of [
    ["PBR", "Auto"],
    ["PBR", "Off"],
    ["PBR", "On"],
    ["Unlit", "On"]
  ] as const) {
    loaded.push(
      await engine.resourceManager.load<Material>({
        type: AssetType.Material,
        url: resource({
          name: mode,
          shader,
          shaderData: {},
          macros: [],
          screenSpaceReflection: { mode, intensity: 0.7 }
        })
      })
    );
  }
  expect(loaded.map((m) => ssr._isMaterialReceiver(m, RenderQueueType.Opaque))).toEqual([true, false, true, false]);
  const mat = loaded[2];
  mat.screenSpaceReflection = { ...mat.screenSpaceReflection, mode: "Off" };
  expect(SSR.getMaterialReceiverMode(mat)).toBe(Receiver.Disabled);
  mat.screenSpaceReflection = { ...mat.screenSpaceReflection, mode: "On" };
  expect(mat.screenSpaceReflection.intensity).toBe(0.7);
  for (const macro of [
    "MATERIAL_ENABLE_CLEAR_COAT",
    "MATERIAL_ENABLE_ANISOTROPY",
    "MATERIAL_ENABLE_IRIDESCENCE",
    "MATERIAL_ENABLE_SHEEN",
    "MATERIAL_ENABLE_TRANSMISSION"
  ]) {
    mat.shaderData.enableMacro(macro);
    expect(SSR.getMaterialReceiverMode(mat)).toBe(Receiver.Disabled);
    mat.shaderData.disableMacro(macro);
    expect(SSR.getMaterialReceiverMode(mat)).toBe(Receiver.OpaqueComposite);
  }
  expect(ssr._isMaterialReceiver(mat, RenderQueueType.Transparent)).toBe(false);
  expect(ssr._isMaterialReceiver(mat, RenderQueueType.AlphaTest)).toBe(true);
  const clone = mat.clone();
  expect(clone.screenSpaceReflection).toEqual(mat.screenSpaceReflection);
  clone.destroy();
  loaded.forEach((m) => m.destroy());
  scene.destroy();
});
it("renders a loaded author configuration through the built shader/pipeline", async () => {
  const scene = await engine.resourceManager.load<Scene>({
    type: AssetType.Scene,
    url: resource(sceneData({ activationMode: Mode.ForceOn, receiverPolicy: Policy.StandardPbrAuto }))
  });
  engine.sceneManager.activeScene = scene;
  const camera = scene.rootEntities[0].getComponent(Camera)!;
  camera.entity.transform.setPosition(0, 3, 5);
  camera.entity.transform.lookAt({ x: 0, y: 0, z: 0 } as any);
  scene.rootEntities[1].isActive = false;
  scene.rootEntities[2].isActive = false;
  const floor = scene.createRootEntity().addComponent(MeshRenderer);
  floor.mesh = PrimitiveMesh.createPlane(engine, 10, 10);
  const mat = new PBRMaterial(engine);
  mat.roughness = 0.1;
  floor.setMaterial(mat);
  engine.update();
  camera.screenSpaceReflection._prepareSettings();
  expect(camera.screenSpaceReflection.metrics.supported).toBe(true);
  camera.screenSpaceReflection._prepareSettings();
  expect(camera.screenSpaceReflection.metrics.effective).toBe(true);
  camera.screenSpaceReflection._prepareSettings();
  expect(camera.screenSpaceReflection.metrics.tracePassCount).toBeGreaterThan(0);
  camera.screenSpaceReflection._prepareSettings();
  expect(camera.screenSpaceReflection.metrics.opaqueReceiverElementCount).toBeGreaterThan(0);
  // CR-005: Scene edits must be consumed by the actual render entry without reading diagnostics first.
  scene.screenSpaceReflection.activationMode = Mode.ForceOff;
  engine.update();
  expect(camera.screenSpaceReflection.metrics.requested).toBe(false);
  scene.screenSpaceReflection.apply({ activationMode: Mode.ForceOn, intensity: 0.35 });
  engine.update();
  expect(camera.screenSpaceReflection.metrics.resolvedSettings.intensity).toBe(0.35);
  expect(camera.screenSpaceReflection.metrics.tracePassCount).toBeGreaterThan(0);

  scene.destroy();
  mat.destroy();
});

it("round-trips camera source and dormant overrides and releases leases on destruction", async () => {
  const scene = new Scene(engine);
  const c = scene.createRootEntity().addComponent(Camera);
  c.screenSpaceReflection.applySettings({ activationMode: Mode.ForceOff, intensity: 0.35 });
  c.screenSpaceReflection.settingsSource = Source.UseSceneSettings;
  const data = sceneData({ activationMode: Mode.ForceOn });
  data.components[1].props = {
    screenSpaceReflectionSettings: JSON.parse(JSON.stringify(c.screenSpaceReflectionSettings))
  };
  const restored = await engine.resourceManager.load<Scene>({ type: AssetType.Scene, url: resource(data) });
  const ssr = restored.rootEntities[1].getComponent(Camera)!.screenSpaceReflection;
  ssr._prepareSettings();
  expect(ssr.metrics.requested).toBe(true);
  ssr.settingsSource = Source.Override;
  ssr._prepareSettings();
  expect(ssr.metrics.requested).toBe(false);
  expect(ssr.intensity).toBe(0.35);
  const lease = ssr.acquireConsumer("test");
  restored.destroy();
  expect(lease.active).toBe(false);
  ssr._prepareSettings();
  expect(ssr.metrics.requested).toBe(false);
  scene.destroy();
});

it("copies scene authors on the first Override only, including after a never-overridden camera is reloaded", async () => {
  const scene = new Scene(engine);
  const c = scene.createRootEntity().addComponent(Camera);
  scene.screenSpaceReflection.intensity = 0.23;
  expect(c.screenSpaceReflectionSettings.overrideSettings).toBeUndefined();
  c.screenSpaceReflection.settingsSource = Source.Override;
  expect(c.screenSpaceReflection.intensity).toBe(0.23);
  c.screenSpaceReflection.settingsSource = Source.UseSceneSettings;
  scene.screenSpaceReflection.intensity = 0.9;
  c.screenSpaceReflection.settingsSource = Source.Override;
  expect(c.screenSpaceReflection.intensity).toBe(0.23);
  const data = sceneData({ intensity: 0.67 });
  data.components[1].props = { screenSpaceReflectionSettings: { settingsSource: Source.UseSceneSettings } } as any;
  const loaded = await engine.resourceManager.load<Scene>({ type: AssetType.Scene, url: resource(data) });
  const ssr = loaded.rootEntities[1].getComponent(Camera)!.screenSpaceReflection;
  ssr.settingsSource = Source.Override;
  expect(ssr.intensity).toBe(0.67);
  loaded.destroy();
  scene.destroy();
});
