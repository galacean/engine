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
  ScreenSpaceReflectionUpsamplingMode as Upsampling,
  Texture2D,
  TextureFormat,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { afterAll, beforeAll, expect, it } from "vitest";

const SIZE = 256;
const CUBE_SIZE = 1.5;
let engine: WebGLEngine;
beforeAll(async () => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  engine = await WebGLEngine.create({ canvas, shaderCompiler: new ShaderCompiler() });
});
afterAll(() => engine.destroy());

/** Count occluder pixels whose colour changes when SSR is enabled; the occluder is not a receiver. */
function countAlteredOccluderPixels(
  cubeCenterY: number,
  thickness: number,
  resolutionScale = 1,
  upsamplingMode = Upsampling.Bilinear,
  depthFormat = TextureFormat.Depth24,
  samples = 1
): number {
  const scene = new Scene(engine);
  engine.sceneManager.activeScene = scene;
  scene.background.solidColor = new Color(0.6, 0.55, 0.65, 1);
  scene.screenSpaceReflection.apply({
    activationMode: Activation.ForceOn,
    receiverPolicy: Policy.ExplicitOnly,
    resolutionScale,
    upsamplingMode,
    edgeFade: 0,
    thickness
  });
  const camera = scene.createRootEntity().addComponent(Camera);
  camera.entity.transform.setPosition(3, 2.5, 6);
  camera.entity.transform.lookAt(new Vector3(0, 0.5, 0));
  const output = new Texture2D(engine, SIZE, SIZE, TextureFormat.R8G8B8A8, false, false);
  camera.renderTarget = new RenderTarget(engine, SIZE, SIZE, output, depthFormat, samples);

  const floor = scene.createRootEntity().addComponent(MeshRenderer);
  floor.mesh = PrimitiveMesh.createPlane(engine, 10, 10);
  const mirror = new PBRMaterial(engine);
  mirror.roughness = 0.05;
  mirror.metallic = 1;
  mirror.emissiveColor.set(0.2, 0.2, 0.3, 1);
  mirror.screenSpaceReflection = { mode: "On", intensity: 1 };
  floor.setMaterial(mirror);

  const cube = scene.createRootEntity().addComponent(MeshRenderer);
  cube.entity.transform.setPosition(0, cubeCenterY, 0);
  cube.mesh = PrimitiveMesh.createCuboid(engine, CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
  const red = new PBRMaterial(engine);
  red.baseColor.set(0, 0, 0, 1);
  red.emissiveColor.set(0.8, 0.1, 0.1, 1);
  red.screenSpaceReflection = { mode: "Off", intensity: 0 };
  cube.setMaterial(red);

  const render = () => {
    engine.update();
    const pixels = new Uint8Array(SIZE * SIZE * 4);
    output.getPixelBuffer(0, 0, SIZE, SIZE, 0, pixels);
    return pixels;
  };
  // Occluder mask: the cube is the only red-dominant geometry once the floor is hidden.
  floor.entity.isActive = false;
  scene.screenSpaceReflection.activationMode = Activation.ForceOff;
  const mask = render();
  floor.entity.isActive = true;
  const off = render();
  scene.screenSpaceReflection.activationMode = Activation.ForceOn;
  const on = render();

  let altered = 0;
  let reflected = 0;
  let occluderPixels = 0;
  for (let i = 0; i < SIZE * SIZE; i++) {
    const isOccluder = Math.abs(mask[i * 4] - mask[i * 4 + 2]) > 40;
    const delta =
      Math.abs(on[i * 4] - off[i * 4]) +
      Math.abs(on[i * 4 + 1] - off[i * 4 + 1]) +
      Math.abs(on[i * 4 + 2] - off[i * 4 + 2]);
    if (isOccluder) {
      occluderPixels++;
      if (delta > 6) altered++;
    } else if (delta > 20) reflected++;
  }
  console.info(JSON.stringify({ resolutionScale, upsamplingMode, altered, reflected }));
  expect(reflected).toBeGreaterThan(100);
  expect(
    (engine as unknown as { _hardwareRenderer: { gl: WebGL2RenderingContext } })._hardwareRenderer.gl.getError()
  ).toBe(0);
  expect(occluderPixels).toBeGreaterThan(1000);
  scene.destroy();
  return altered;
}

it("does not composite a hidden receiver's reflection onto an occluder that touches it", () => {
  const contactCenterY = CUBE_SIZE / 2;
  // Contact edge: only isolated silhouette pixels may differ, never a band across the base.
  expect(countAlteredOccluderPixels(contactCenterY, 0.2)).toBeLessThan(30);
  // The result must not depend on the hit-thickness setting.
  expect(countAlteredOccluderPixels(contactCenterY, 0.02)).toBeLessThan(30);
  // Floating occluder stays untouched.
  expect(countAlteredOccluderPixels(contactCenterY + 0.35, 0.2)).toBe(0);
});

for (const resolutionScale of [0.5, 0.25]) {
  for (const upsamplingMode of [Upsampling.Bilinear, Upsampling.Bilateral]) {
    it(`keeps occluders unchanged at scale ${resolutionScale}, reconstruction ${upsamplingMode}`, () => {
      const altered = countAlteredOccluderPixels(CUBE_SIZE / 2, 0.2, resolutionScale, upsamplingMode);
      console.info(JSON.stringify({ resolutionScale, upsamplingMode, altered }));
      expect(altered).toBeLessThan(30);
    });
  }
}

for (const depthFormat of [TextureFormat.Depth24, TextureFormat.Depth24Stencil8]) {
  it(`preserves reflection and occlusion with MSAA and depth format ${depthFormat}`, () => {
    expect(countAlteredOccluderPixels(CUBE_SIZE / 2, 0.2, 0.5, Upsampling.Bilateral, depthFormat, 4)).toBeLessThan(30);
  });
}
