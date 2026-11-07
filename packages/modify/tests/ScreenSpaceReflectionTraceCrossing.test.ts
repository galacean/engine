import {
  Camera,
  MeshRenderer,
  PBRMaterial,
  PrimitiveMesh,
  RenderTarget,
  Scene,
  Texture2D,
  TextureFormat,
  TextureFilterMode,
  Vector3,
  Material,
  ScreenSpaceReflectionActivationMode as Activation,
  ScreenSpaceReflectionReceiverPolicy as Policy,
  WebGLEngine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { readTraceTarget } from "./ScreenSpaceReflectionTraceReadback";
import { expect, it } from "vitest";
const SIZE = 128;
const BYTE_MAX = 255;
const HIT_CONFIDENCE_THRESHOLD = 20;
it("continues to a valid distant hit after rejecting a thin foreground depth crossing", async () => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  const engine = await WebGLEngine.create({ canvas, shaderCompiler: new ShaderCompiler() });
  try {
    const scene = new Scene(engine);
    engine.sceneManager.activeScene = scene;
    scene.screenSpaceReflection.apply({
      activationMode: Activation.ForceOn,
      receiverPolicy: Policy.ExplicitOnly,
      resolutionScale: 1,
      maxRaySteps: 64,
      hitRefinementSteps: 5,
      maxRayDistance: 40,
      thickness: 0.02,
      edgeFade: 0
    });
    const camera = scene.createRootEntity().addComponent(Camera);
    camera.entity.transform.setPosition(0, 2.5, 6);
    camera.entity.transform.lookAt(new Vector3(0, 0.5, 0));
    const output = new Texture2D(engine, SIZE, SIZE, TextureFormat.R8G8B8A8, false, false);
    camera.renderTarget = new RenderTarget(engine, SIZE, SIZE, output, TextureFormat.Depth24);
    const floor = scene.createRootEntity().addComponent(MeshRenderer);
    floor.mesh = PrimitiveMesh.createPlane(engine, 20, 20);
    const material = new PBRMaterial(engine);
    material.roughness = 0.05;
    material.screenSpaceReflection = { mode: "On", intensity: 1 };
    floor.setMaterial(material);
    const hitDepth = new Texture2D(engine, SIZE, SIZE, TextureFormat.R32G32B32A32, false, false);
    hitDepth.filterMode = TextureFilterMode.Point;
    const depths = new Float32Array(SIZE * SIZE * 4);
    const rawDepth = (distance: number) =>
      camera.farClipPlane / (camera.farClipPlane - camera.nearClipPlane) -
      (camera.farClipPlane * camera.nearClipPlane) / ((camera.farClipPlane - camera.nearClipPlane) * distance);
    const pass = (
      camera as unknown as {
        _renderPipeline: {
          _screenSpaceReflectionPass: { _material: Material; _traceTarget: RenderTarget; trace(): void };
        };
      }
    )._renderPipeline._screenSpaceReflectionPass;
    const trace = pass.trace;
    let hits = 0;
    pass.trace = function () {
      this._material.shaderData.setTexture("material_SSRSceneDepthTexture", hitDepth);
      trace.call(this);
      const pixels = readTraceTarget(this._traceTarget, SIZE);
      hits = 0;
      for (let i = 3; i < pixels.length; i += 4) if (pixels[i] * BYTE_MAX > HIT_CONFIDENCE_THRESHOLD) hits++;
    };
    const measure = (strip: number) => {
      for (let y = 0; y < SIZE; y++)
        for (let x = 0; x < SIZE; x++)
          depths[(y * SIZE + x) * 4] = rawDepth(strip >= 0 && y >= strip && y < strip + 2 ? 1 : 12);
      hitDepth.setPixelBuffer(depths);
      engine.update();
      return hits;
    };
    const unobstructed = measure(-1);
    const samples = [32, 48, 64, 80, 96].map((strip) => ({ strip, hits: measure(strip) }));
    console.info(JSON.stringify({ unobstructed, samples }));
    expect(unobstructed).toBeGreaterThan(100);
    for (const sample of samples) expect(sample.hits).toBeGreaterThan(unobstructed * 0.9);
    expect(
      (engine as unknown as { _hardwareRenderer: { gl: WebGL2RenderingContext } })._hardwareRenderer.gl.getError()
    ).toBe(0);
  } finally {
    engine.destroy();
  }
});
