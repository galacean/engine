import {
  Camera,
  Material,
  MeshRenderer,
  PBRMaterial,
  PrimitiveMesh,
  Scene,
  Shader,
  ScreenSpaceReflection as SSR,
  ScreenSpaceReflectionActivationMode as Activation,
  ScreenSpaceReflectionReceiverMode as Receiver,
  ScreenSpaceReflectionReceiverPolicy as Policy,
  WebGLEngine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import plantSource from "../../farming/src/farming/procedural/runtime/PlantOrganTint.shader?raw";
import { expect, it } from "vitest";
it("inherits Auto only with the active PBR SubShader opt-in", async () => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 64;
  const engine = await WebGLEngine.create({ canvas, shaderCompiler: new ShaderCompiler() });
  try {
    const scene = new Scene(engine);
    engine.sceneManager.activeScene = scene;
    scene.screenSpaceReflection.apply({ activationMode: Activation.ForceOn, receiverPolicy: Policy.StandardPbrAuto });
    const camera = scene.createRootEntity().addComponent(Camera);
    camera.entity.transform.setPosition(0, 0, 5);
    const renamed = Shader.create("Review/RenamedPBR", [...Shader.find("PBR")!.subShaders])!;
    const plant = Shader.create(plantSource)!;
    const mesh = PrimitiveMesh.createCuboid(engine, 0.5, 0.5, 0.5);
    const materials = [Shader.find("PBR")!, renamed, plant].map((shader, index) => {
      const material = new PBRMaterial(engine);
      material.shader = shader;
      material.roughness = 0.1;
      const renderer = scene.createRootEntity().addComponent(MeshRenderer);
      renderer.entity.transform.setPosition(index - 1, 0, 0);
      renderer.mesh = mesh;
      renderer.setMaterial(material);
      return material;
    });
    engine.update();
    console.info(JSON.stringify({ autoReceivers: camera.screenSpaceReflection.metrics.opaqueReceiverElementCount }));
    expect(camera.screenSpaceReflection.metrics.opaqueReceiverElementCount).toBe(2);
    const initialized = new Material(engine, renamed);
    expect(initialized.shaderData.getFloat("material_ScreenSpaceReflectionMode")).toBe(Receiver.Auto);
    expect(SSR.supportsMaterialTransparentSampling(materials[1])).toBe(false);
    expect(SSR.setMaterialReceiver(materials[2], Receiver.OpaqueComposite)).toBe(true);
    engine.update();
    expect(camera.screenSpaceReflection.metrics.opaqueReceiverElementCount).toBe(3);
  } finally {
    engine.destroy();
  }
});
