import { Camera, MeshRenderer, PrimitiveMesh, Texture2D, UnlitMaterial, WebGLEngine } from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { expect, it } from "vitest";
import { RuntimeMeshPickSource } from "../../../packages/runtime-editor/src/runtime-inspection/runtime-mesh-picking";
import { RuntimeSceneInspection } from "../../../packages/runtime-editor/src/runtime-inspection/runtime-scene-inspection";
import { PhotoGraphics, PhotoSurface } from "../../../packages/world-planning/src/world/SeedWorldPhotoGraphics";
import { GpuPhoto } from "../../../packages/world-planning/src/world/SeedWorldPhotoImage";
import { SeedWorldPicker } from "../../../packages/world-planning/src/world/SeedWorldPicker";
import { decodeViewIdentity } from "../../../packages/world-planning/src/world/SeedWorldViewSnapshot";

async function setup() {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 240;
  const engine = await WebGLEngine.create({ canvas, shaderCompiler: new ShaderCompiler() });
  const scene = engine.sceneManager.activeScene;
  const camera = scene.createRootEntity("Camera").addComponent(Camera);
  return { canvas, engine, scene, camera };
}

it("keeps the ID under a photographed pixel after resize and movement", async () => {
  const { engine, scene, camera } = await setup();
  const picker = new SeedWorldPicker(camera);
  try {
    camera.enablePostProcess = true;
    const box = scene.createRootEntity("red box");
    box.transform.setPosition(1, 0, -5);
    const renderer = box.addComponent(MeshRenderer);
    renderer.mesh = PrimitiveMesh.createCuboid(engine, 0.2, 0.2, 0.2);
    const material = new UnlitMaterial(engine);
    material.baseColor.set(1, 0, 0, 1);
    renderer.setMaterial(material);
    const inspection = new RuntimeSceneInspection(scene);
    const picks = new RuntimeMeshPickSource(camera, inspection, () => {});
    const capture = picker.capture(
      (v) => picks.visit(v),
      (batch) => inspection.target(batch.renderer)
    );
    engine.update();
    const frame = await capture;
    try {
      engine.canvas.setResolution(240, 320);
      box.transform.setPosition(-1, 0, -5);
      engine.update();

      const y = frame.height >> 1;
      const colors = new Uint8Array(frame.width * 4);
      frame.image.texture.getPixelBuffer(0, y, frame.width, 1, 0, colors);
      const red = Array.from({ length: frame.width }, (_, x) => x).filter(
        (x) => colors[x * 4] > 128 && colors[x * 4 + 1] < 64 && colors[x * 4 + 2] < 64
      );
      expect(red.length).toBeGreaterThan(0);
      const pixel = frame.identities.read(red[red.length >> 1], y, 1, 1);
      const id = decodeViewIdentity(pixel, 0, frame.identities.identityBits);
      expect(frame.identities.resolve(id)?.entityId).toBe(box.instanceId);
    } finally {
      frame.identities.dispose();
      frame.image.dispose();
    }
  } finally {
    picker.dispose();
    engine.destroy();
  }
});

it("can repaint a live stroke surface after engine resource GC", async () => {
  const { canvas, engine, camera } = await setup();
  const graphics = new PhotoGraphics(engine, canvas, camera, () => {});
  const image = new GpuPhoto(new Texture2D(engine, 320, 240));
  const surface = new PhotoSurface(graphics, image);
  try {
    surface.paint([{ width: 3, color: "#ff453a", points: [{ x: 50, y: 60 }] }]);
    engine.resourceManager.gc();
    engine.update();
    surface.paint([{ width: 3, color: "#ff453a", points: [{ x: 50, y: 90 }] }]);
    const mask = surface.material.shaderData.getTexture("material_StrokeMaskTexture") as Texture2D;
    const center = new Uint8Array(4);
    mask.getPixelBuffer(50, 90, 1, 1, 0, center);
    expect(center[1]).toBeGreaterThan(0);
    surface.dispose();
    engine.update();
    expect(mask.destroyed).toBe(true);
  } finally {
    surface.dispose();
    image.dispose();
    graphics.dispose();
    engine.destroy();
  }
});
