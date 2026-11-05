import {
  Camera,
  Scene,
  Material,
  PBRMaterial,
  Shader,
  WebGLEngine,
  MeshRenderer,
  PrimitiveMesh,
  ScreenSpaceReflection as SSR,
  ScreenSpaceReflectionActivationMode as Mode,
  ScreenSpaceReflectionSettingsSource as Source,
  ScreenSpaceReflectionReceiverMode as Receiver,
  ScreenSpaceReflectionReceiverPolicy as Policy,
  RenderQueueType
} from "@galacean/engine";
import { SeedWorldPicker } from "../../world-planning/src/world/SeedWorldPicker";
import { beforeAll, afterAll, expect, it, vi } from "vitest";
let engine: WebGLEngine;
beforeAll(async () => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 32;
  engine = await WebGLEngine.create({ canvas });
});
afterAll(() => engine.destroy());

it("CR2-001 actual picker restores following, dormant override and failure-path snapshots", () => {
  const scene = new Scene(engine);
  const camera = scene.createRootEntity().addComponent(Camera);
  scene.screenSpaceReflection.activationMode = Mode.ForceOn;
  const picker = new SeedWorldPicker(camera);
  try {
    for (const state of ["follow", "dormant", "override"]) {
      if (state !== "follow") {
        camera.screenSpaceReflection.applySettings({ intensity: 0.25 });
        if (state === "dormant") camera.screenSpaceReflection.settingsSource = Source.UseSceneSettings;
      }
      const saved = camera.screenSpaceReflectionSettings;
      picker.warmup(() => {
        expect(camera.screenSpaceReflectionSettings).toEqual(saved);
        expect(camera.screenSpaceReflection.renderingEnabled).toBe(false);
      });
      expect(camera.screenSpaceReflectionSettings).toEqual(saved);
      expect(() =>
        picker.warmup(() => {
          expect(camera.screenSpaceReflectionSettings).toEqual(saved);
          expect(camera.screenSpaceReflection.renderingEnabled).toBe(false);
          throw new Error("pick failure");
        })
      ).toThrow("pick failure");
      expect(camera.screenSpaceReflectionSettings).toEqual(saved);
      expect(camera.screenSpaceReflection.renderingEnabled).toBe(true);
      camera.screenSpaceReflection.renderingEnabled = false;
      picker.warmup(() => {});
      expect(camera.screenSpaceReflection.renderingEnabled).toBe(false);
      camera.screenSpaceReflection.renderingEnabled = true;
      scene.screenSpaceReflection.intensity = 0.8;
      camera.screenSpaceReflection._prepareSettings();
      expect(camera.screenSpaceReflection.getResolvedSettings(Receiver.OpaqueComposite).intensity).toBe(
        state === "override" ? 0.25 : 0.8
      );
    }
  } finally {
    picker.dispose();
    scene.destroy();
  }
});

it("CR2-002 runtime Scene keeps legacy budget and does not enroll PBR during water demand", () => {
  const scene = new Scene(engine);
  engine.sceneManager.activeScene = scene;
  const camera = scene.createRootEntity().addComponent(Camera);
  camera.entity.transform.setPosition(0, 0, 3);
  const renderer = scene.createRootEntity().addComponent(MeshRenderer);
  const material = new PBRMaterial(engine);
  material.roughness = 0.3;
  renderer.mesh = PrimitiveMesh.createCuboid(engine);
  renderer.setMaterial(material);
  const lease = camera.screenSpaceReflection.acquireConsumer("water", { receiverMode: Receiver.TransparentSampleOnly });
  try {
    camera.render();
    const baselineDraws = camera.screenSpaceReflection.metrics.opaqueReceiverElementCount;
    expect(baselineDraws).toBe(0);
    expect(scene.screenSpaceReflection.toJSON()).toMatchObject({
      receiverPolicy: Policy.ExplicitOnly,
      resolutionScale: 1,
      upsamplingMode: 2,
      maxRayDistance: 20
    });
    // Explicit editor-style policy still enrolls the same PBR geometry.
    scene.screenSpaceReflection.receiverPolicy = Policy.StandardPbrAuto;
    camera.render();
    expect(camera.screenSpaceReflection.metrics.opaqueReceiverElementCount).toBeGreaterThan(baselineDraws);
  } finally {
    lease.release();
    scene.destroy();
    material.destroy();
  }
});

it("CR2-003 repeated authored receiver queries do not rewrite uniforms and invalidate on author, shader, queue and effects", () => {
  const material = new PBRMaterial(engine);
  const calls = vi.spyOn(material.shaderData, "setFloat");
  try {
    material.screenSpaceReflection = { mode: "On", intensity: 0.6 };
    calls.mockClear();
    for (let i = 0; i < 4; i++) expect(SSR.getMaterialReceiverMode(material)).toBe(Receiver.OpaqueComposite);
    material.screenSpaceReflection = { mode: "On", intensity: 0.6 };
    expect(calls).not.toHaveBeenCalled();
    material.shaderData.enableMacro("MATERIAL_ENABLE_CLEAR_COAT");
    expect(SSR.getMaterialReceiverMode(material)).toBe(Receiver.Disabled);
    expect(calls).not.toHaveBeenCalled();
    calls.mockClear();
    expect(SSR.getMaterialReceiverMode(material)).toBe(Receiver.Disabled);
    expect(calls).not.toHaveBeenCalled();
    material.shaderData.disableMacro("MATERIAL_ENABLE_CLEAR_COAT");
    expect(SSR.getMaterialReceiverMode(material)).toBe(Receiver.OpaqueComposite);
    expect(SSR.getMaterialReceiverMode(material, RenderQueueType.Transparent)).toBe(Receiver.Disabled);
    expect(SSR.getMaterialReceiverMode(material, RenderQueueType.Opaque)).toBe(Receiver.OpaqueComposite);
    material.shader = Shader.find("Unlit")!;
    expect(SSR.getMaterialReceiverMode(material)).toBe(Receiver.Disabled);
    material.shader = Shader.find("PBR")!;
    expect(SSR.getMaterialReceiverMode(material)).toBe(Receiver.OpaqueComposite);
    const pass = material.shader.subShaders[0].passes.find(
      (p) => p.getTagValue("screenSpaceReflectionReceiver") === "ColorResponseV2"
    )!;
    try {
      pass.setTag("screenSpaceReflectionReceiver", "incompatible");
      expect(SSR.getMaterialReceiverMode(material)).toBe(Receiver.Disabled);
    } finally {
      pass.setTag("screenSpaceReflectionReceiver", "ColorResponseV2");
    }
    expect(SSR.getMaterialReceiverMode(material)).toBe(Receiver.OpaqueComposite);
    material.screenSpaceReflection = { mode: "Off", intensity: 0.4 };
    expect(SSR.getMaterialReceiverMode(material)).toBe(Receiver.Disabled);
    const cloned = material.clone();
    expect(SSR.getMaterialReceiverMode(cloned)).toBe(Receiver.Disabled);
    cloned.destroy();
    material.screenSpaceReflection = { mode: "Auto", intensity: 0.6 };
    material.roughness = 0.3;
    const scene = new Scene(engine);
    scene.screenSpaceReflection.receiverPolicy = Policy.StandardPbrAuto;
    const ssr = scene.createRootEntity().addComponent(Camera).screenSpaceReflection;
    calls.mockClear();
    for (let i = 0; i < 4; i++) expect(ssr._isMaterialReceiver(material, RenderQueueType.Opaque)).toBe(true);
    expect(calls).not.toHaveBeenCalled();
    scene.destroy();
    const legacy = new PBRMaterial(engine);
    legacy.cloneTo(material);
    expect(SSR.setMaterialReceiver(material, Receiver.OpaqueComposite, 0.2)).toBe(true);
    expect(SSR.getMaterialReceiverMode(material)).toBe(Receiver.OpaqueComposite);
    legacy.destroy();
  } finally {
    calls.mockRestore();
    material.destroy();
  }
});

it("CR3-001 clearing author settings restores runtime ownership and the pre-author receiver, including clones", () => {
  const material = new PBRMaterial(engine);
  try {
    expect(SSR.setMaterialReceiver(material, Receiver.OpaqueComposite, 0.7)).toBe(true);
    material.screenSpaceReflection = { mode: "Off", intensity: 0.4 };
    material.screenSpaceReflection = { mode: "On", intensity: 0.2 };
    const clone = material.clone();
    try {
      for (const target of [material, clone]) {
        target.screenSpaceReflection = null;
        expect(target._screenSpaceReflectionAuthorSettings).toBeNull();
        expect(SSR.getMaterialReceiverMode(target)).toBe(Receiver.OpaqueComposite);
        expect(target.shaderData.getFloat("material_ScreenSpaceReflectionIntensity")).toBe(0.7);
        expect(SSR.setMaterialReceiver(target, Receiver.Disabled)).toBe(true);
        target.screenSpaceReflection = null;
        expect(SSR.getMaterialReceiverMode(target)).toBe(Receiver.Disabled);
      }
      // A subsequent edit snapshots the current runtime setting, not a stale first baseline.
      expect(SSR.setMaterialReceiver(material, Receiver.OpaqueComposite, 0.3)).toBe(true);
      material.screenSpaceReflection = { mode: "On", intensity: 0.9 };
      material.screenSpaceReflection = null;
      expect(material.shaderData.getFloat("material_ScreenSpaceReflectionIntensity")).toBe(0.3);
      // Restore a dormant legacy registration even while its current effects are unsupported.
      material.shaderData.enableMacro("MATERIAL_ENABLE_CLEAR_COAT");
      material.screenSpaceReflection = { mode: "Off", intensity: 0.4 };
      material.screenSpaceReflection = null;
      expect(SSR.getMaterialReceiverMode(material)).toBe(Receiver.Disabled);
      material.shaderData.disableMacro("MATERIAL_ENABLE_CLEAR_COAT");
      expect(SSR.getMaterialReceiverMode(material)).toBe(Receiver.OpaqueComposite);
      expect(material.shaderData.getFloat("material_ScreenSpaceReflectionIntensity")).toBe(0.3);
    } finally {
      clone.destroy();
    }
  } finally {
    material.destroy();
  }
});
