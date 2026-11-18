import {
  Camera,
  MeshRenderer,
  PBRMaterial,
  PrimitiveMesh,
  Scene,
  ScreenSpaceReflection as SSR,
  ScreenSpaceReflectionActivationMode as Activation,
  ScreenSpaceReflectionReceiverPolicy as Policy,
  WebGLEngine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { expect, it, vi } from "vitest";

const ELEMENTS = 200;
it("resolves each material once per camera frame and skips Auto capability work under ExplicitOnly", async () => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  const engine = await WebGLEngine.create({ canvas, shaderCompiler: new ShaderCompiler() });
  try {
    const scene = new Scene(engine);
    engine.sceneManager.activeScene = scene;
    scene.screenSpaceReflection.apply({ activationMode: Activation.ForceOn, receiverPolicy: Policy.ExplicitOnly });
    const camera = scene.createRootEntity().addComponent(Camera);
    camera.entity.transform.setPosition(0, 0, 20);
    const mesh = PrimitiveMesh.createCuboid(engine, 0.1, 0.1, 0.1);
    const materials: PBRMaterial[] = [];
    for (let i = 0; i < ELEMENTS; i++) {
      const renderer = scene.createRootEntity().addComponent(MeshRenderer);
      renderer.entity.transform.setPosition(((i % 20) - 10) * 0.2, (Math.floor(i / 20) - 5) * 0.2, 0);
      renderer.mesh = mesh;
      const material = new PBRMaterial(engine);
      renderer.setMaterial(material);
      materials.push(material);
    }
    materials[0].screenSpaceReflection = { mode: "On", intensity: 1 };
    engine.update();
    const predicate = vi.spyOn(camera.screenSpaceReflection, "_isMaterialReceiver");
    const capability = vi.spyOn(SSR, "getMaterialReceiverCapability");
    try {
      engine.update();
      const predicateCalls = predicate.mock.calls.length;
      const capabilityCalls = capability.mock.calls.length;
      const capabilityObjects = new Set(capability.mock.results.map((r) => r.value)).size;
      console.info(JSON.stringify({ elements: ELEMENTS, predicateCalls, capabilityCalls, capabilityObjects }));
      expect(camera.screenSpaceReflection.metrics.opaqueReceiverElementCount).toBe(1);
      expect(predicateCalls).toBeLessThanOrEqual(ELEMENTS);
      expect(capabilityCalls).toBeLessThanOrEqual(2);
      expect(capabilityObjects).toBe(1);
      materials[1].screenSpaceReflection = { mode: "On", intensity: 1 };
      engine.update();
      expect(camera.screenSpaceReflection.metrics.opaqueReceiverElementCount).toBe(2);
      materials[0].screenSpaceReflection = { mode: "Off", intensity: 1 };
      engine.update();
      expect(camera.screenSpaceReflection.metrics.opaqueReceiverElementCount).toBe(1);
    } finally {
      predicate.mockRestore();
      capability.mockRestore();
    }
  } finally {
    engine.destroy();
  }
});
