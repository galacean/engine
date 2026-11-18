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
  ScreenSpaceReflectionContent as Content,
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
function verifyReceiverSelection(): void {
  const scene = new Scene(engine);
  engine.sceneManager.activeScene = scene;
  scene.background.solidColor = new Color(0.6, 0.55, 0.65, 1);
  scene.screenSpaceReflection.apply({
    activationMode: Activation.ForceOn,
    receiverPolicy: Policy.ExplicitOnly,
    resolutionScale: 0.5,
    upsamplingMode: Upsampling.Bilateral,
    reflectionContent: Content.OpaqueAndTransparent,
    edgeFade: 0,
    thickness: 0.2
  });
  const camera = scene.createRootEntity().addComponent(Camera);
  camera.entity.transform.setPosition(3, 2.5, 6);
  camera.entity.transform.lookAt(new Vector3(0, 0.5, 0));
  const output = new Texture2D(engine, SIZE, SIZE, TextureFormat.R8G8B8A8, false, false);
  camera.renderTarget = new RenderTarget(engine, SIZE, SIZE, output, TextureFormat.Depth24);

  const floor = scene.createRootEntity().addComponent(MeshRenderer);
  floor.mesh = PrimitiveMesh.createPlane(engine, 10, 10);
  const mirror = new PBRMaterial(engine);
  mirror.roughness = 0.05;
  mirror.metallic = 1;
  mirror.emissiveColor.set(0.2, 0.2, 0.3, 1);
  mirror.screenSpaceReflection = { mode: "On", intensity: 1 };
  floor.setMaterial(mirror);

  const cube = scene.createRootEntity().addComponent(MeshRenderer);
  cube.entity.transform.setPosition(0, CUBE_SIZE / 2, 0);
  cube.mesh = PrimitiveMesh.createCuboid(engine, CUBE_SIZE, CUBE_SIZE, CUBE_SIZE);
  const red = new PBRMaterial(engine);
  red.baseColor.set(0, 0, 0, 1);
  red.emissiveColor.set(0.8, 0.1, 0.1, 1);
  red.screenSpaceReflection = { mode: "Off", intensity: 0 };
  cube.setMaterial(red);

  const glass = scene.createRootEntity().addComponent(MeshRenderer);
  glass.mesh = floor.mesh;
  glass.entity.transform.setPosition(0, 0.1, 0);
  const material = new PBRMaterial(engine);
  material.isTransparent = true;
  material.baseColor.set(0.5, 0.5, 0.5, 0.2);
  material.screenSpaceReflection = { mode: "Off", intensity: 0 };
  glass.setMaterial(material);
  let origins = 0;
  camera.screenSpaceReflection.profiler = {
    beginSample(stage) {
      if (stage !== "upsample") return;
      const pass = (
        camera as unknown as {
          _renderPipeline: { _screenSpaceReflectionPass: { _traceTarget: RenderTarget } };
        }
      )._renderPipeline._screenSpaceReflectionPass;
      const texture = pass._traceTarget.getColorTexture(1) as Texture2D;
      const data = new Uint8Array(texture.width * texture.height * 4);
      texture.getPixelBuffer(0, 0, texture.width, texture.height, 0, data);
      origins = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] + data[i + 1] + data[i + 2] + data[i + 3] > 0) origins++;
      }
    },
    endSample() {}
  };
  engine.update();
  const opaqueOnlyOrigins = origins;
  material.contributeScreenSpaceReflection = true;
  engine.update();
  console.info(JSON.stringify({ opaqueOnlyOrigins, contributionOrigins: origins }));
  expect(camera.screenSpaceReflection.metrics.contributionDepthDrawCount).toBe(1);
  expect(opaqueOnlyOrigins).toBeGreaterThan(1000);
  expect(origins).toBe(opaqueOnlyOrigins);
  expect(
    (engine as unknown as { _hardwareRenderer: { gl: WebGL2RenderingContext } })._hardwareRenderer.gl.getError()
  ).toBe(0);
  scene.destroy();
}

it("keeps opaque receivers selected behind transparent contributors", verifyReceiverSelection);
