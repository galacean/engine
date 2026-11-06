import {
  Camera,
  Color,
  MeshRenderer,
  PBRMaterial,
  PrimitiveMesh,
  RenderTarget,
  Scene,
  ScreenSpaceReflectionActivationMode as Activation,
  ScreenSpaceReflectionReceiverPolicy as Policy,
  Texture2D,
  TextureFilterMode,
  TextureFormat,
  WebGLEngine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { expect, it } from "vitest";

const SIZE = 256;
const DARK_LEVELS = 64;
it("preserves LDR dark gradient levels outside SSR receivers", async () => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const engine = await WebGLEngine.create({ canvas, shaderCompiler: new ShaderCompiler() });
  try {
    const scene = new Scene(engine);
    engine.sceneManager.activeScene = scene;
    scene.background.solidColor = new Color(0, 0, 0, 1);
    scene.screenSpaceReflection.apply({ activationMode: Activation.ForceOn, receiverPolicy: Policy.ExplicitOnly });
    const camera = scene.createRootEntity().addComponent(Camera);
    camera.entity.transform.setPosition(0, 0, 5);
    camera.fieldOfView = 45;
    camera.enableHDR = false;
    const output = new Texture2D(engine, SIZE, SIZE, TextureFormat.R8G8B8A8, false, true);
    camera.renderTarget = new RenderTarget(engine, SIZE, SIZE, output, TextureFormat.Depth24);
    const texture = new Texture2D(engine, DARK_LEVELS, 1, TextureFormat.R8G8B8A8, false, true);
    texture.filterMode = TextureFilterMode.Point;
    const data = new Uint8Array(DARK_LEVELS * 4);
    for (let x = 0; x < DARK_LEVELS; x++) data.set([x, x, x, 255], x * 4);
    texture.setPixelBuffer(data);
    const panel = scene.createRootEntity().addComponent(MeshRenderer);
    panel.mesh = PrimitiveMesh.createPlane(engine, 4.15, 4.15);
    panel.entity.transform.setRotation(90, 0, 0);
    const gradient = new PBRMaterial(engine);
    gradient.baseColor.set(0, 0, 0, 1);
    gradient.emissiveColor.set(1, 1, 1, 1);
    gradient.emissiveTexture = texture;
    // A rough receiver activates the pipeline but contributes no SSR pixels.
    gradient.roughness = 1;
    gradient.screenSpaceReflection = { mode: "On", intensity: 1 };
    panel.setMaterial(gradient);
    const render = () => {
      engine.update();
      const pixels = new Uint8Array(SIZE * SIZE * 4);
      output.getPixelBuffer(0, 0, SIZE, SIZE, 0, pixels);
      return Array.from({ length: SIZE }, (_, x) => pixels[(SIZE * (SIZE / 2) + x) * 4]);
    };
    scene.screenSpaceReflection.activationMode = Activation.ForceOff;
    const off = render();
    scene.screenSpaceReflection.activationMode = Activation.ForceOn;
    const on = render();
    expect(camera.screenSpaceReflection.metrics.compositePassCount).toBe(1);
    const beforeLevels = new Set(off).size;
    const afterLevels = new Set(on).size;
    console.info(
      JSON.stringify({ beforeLevels, afterLevels, maxError: Math.max(...on.map((v, i) => Math.abs(v - off[i]))) })
    );
    expect(beforeLevels).toBeGreaterThan(50);
    expect(afterLevels).toBe(beforeLevels);
    expect(Math.max(...on.map((v, i) => Math.abs(v - off[i])))).toBeLessThanOrEqual(1);
  } finally {
    engine.destroy();
  }
});
