import {
  Camera,
  Color,
  Downsampling,
  MeshRenderer,
  PBRMaterial,
  PrimitiveMesh,
  RenderTarget,
  Scene,
  Shader,
  ShaderLanguage,
  ScreenSpaceReflectionActivationMode as Activation,
  ScreenSpaceReflectionReceiverPolicy as Policy,
  Texture2D,
  TextureFormat,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import PBRSource from "../src/native/shader/src/Shaders/PBR.shader?raw";
import { afterAll, beforeAll, expect, it, vi } from "vitest";

let engine: WebGLEngine;

beforeAll(async () => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  engine = await WebGLEngine.create({ canvas, shaderCompiler: new ShaderCompiler() });
});

afterAll(() => engine.destroy());

function createTransparentSampleMaterial(): PBRMaterial {
  const material = new PBRMaterial(engine);
  const source = PBRSource.replace('Shader "PBR"', 'Shader "OpaqueReuseTransparentReceiver"')
    .replace(
      'Tags { pipelineStage = "Forward"}',
      'Tags { pipelineStage = "Forward", screenSpaceReflectionTransparentSample = "SampleV1" }'
    )
    .replace("FragmentShader = PBRFragment;", "FragmentShader = opaqueReuseForward;")
    .replace(
      '#include "ShaderLibrary/PBR/ForwardPassPBR.glsl"',
      `#include "ShaderLibrary/PBR/ForwardPassPBR.glsl"
      sampler2D camera_OpaqueTexture;
      void opaqueReuseForward(Varyings v) {
        vec2 uv = gl_FragCoord.xy / vec2(128.0);
        gl_FragColor = vec4(texture2D(camera_OpaqueTexture, uv).rgb, 1.0);
      }`
    );
  material.shader = Shader.create(source, ShaderLanguage.GLSLES300)!;
  material.isTransparent = true;
  material.roughness = 0.05;
  material.screenSpaceReflection = { mode: "On", intensity: 1 };
  return material;
}

it("reuses SSR sceneColor for camera_OpaqueTexture when contract matches and falls back otherwise", () => {
  const scene = new Scene(engine);
  engine.sceneManager.activeScene = scene;
  scene.background.solidColor = new Color(0, 0, 0, 1);
  scene.screenSpaceReflection.apply({
    activationMode: Activation.ForceOn,
    receiverPolicy: Policy.ExplicitOnly,
    resolutionScale: 1,
    maxRaySteps: 16
  });

  const camera = scene.createRootEntity().addComponent(Camera);
  camera.entity.transform.setPosition(0, 0, 6);
  camera.entity.transform.lookAt(new Vector3(0, 0, 0));
  camera.opaqueTextureEnabled = true;
  camera.opaqueTextureDownsampling = Downsampling.TwoX;
  camera.screenSpaceReflection.useHalfResolutionInputs = true;

  const output = new Texture2D(engine, 128, 128, TextureFormat.R8G8B8A8, false, false);
  const rt = new RenderTarget(engine, 128, 128, output, TextureFormat.Depth24);
  camera.renderTarget = rt;

  // Bright green opaque backdrop behind the transparent receiver.
  const backdrop = scene.createRootEntity().addComponent(MeshRenderer);
  backdrop.entity.transform.setPosition(0, 0, -2);
  backdrop.entity.transform.setRotation(90, 0, 0);
  backdrop.mesh = PrimitiveMesh.createPlane(engine, 12, 12);
  const backdropMaterial = new PBRMaterial(engine);
  backdropMaterial.baseColor.set(0, 0, 0, 1);
  backdropMaterial.emissiveColor.set(0, 0.85, 0, 1);
  backdrop.setMaterial(backdropMaterial);

  // Transparent SSR receiver sampling camera_OpaqueTexture directly.
  const glass = scene.createRootEntity().addComponent(MeshRenderer);
  glass.entity.transform.setPosition(0, 0, 1);
  glass.entity.transform.setRotation(90, 0, 0);
  glass.mesh = PrimitiveMesh.createPlane(engine, 4, 4);
  const glassMaterial = createTransparentSampleMaterial();
  glass.setMaterial(glassMaterial);

  const pipeline = (camera as any)._renderPipeline;
  const opaquePass = pipeline._opaqueTexturePass;
  const onRenderSpy = vi.spyOn(opaquePass, "onRender");

  try {
    // 1. Half-res SSR + TwoX opaqueTexture + no opaque SSR composite -> reuse SSR sceneColor.
    engine.update();
    expect(camera.screenSpaceReflection.metrics.transparentSurfacePassDrawCount).toBeGreaterThan(0);
    expect(camera.screenSpaceReflection.metrics.opaqueSurfacePassDrawCount).toBe(0);
    expect(onRenderSpy).toHaveBeenCalledTimes(0);
    expect(opaquePass._renderTarget ?? null).toBeNull();
    const reusedTexture = camera.shaderData.getTexture("camera_OpaqueTexture") as Texture2D;
    expect([reusedTexture.width, reusedTexture.height]).toEqual([64, 64]);

    const pixel = new Uint8Array(4);
    output.getPixelBuffer(64, 64, 1, 1, 0, pixel);
    expect(pixel[1]).toBeGreaterThan(150);
    expect(pixel[0]).toBeLessThan(30);
    expect(pixel[2]).toBeLessThan(30);

    // 2. Full-res opaqueTextureDownsampling=None while SSR is half-res -> must fall back to OpaqueTexturePass.
    onRenderSpy.mockClear();
    camera.opaqueTextureDownsampling = Downsampling.None;
    engine.update();
    expect(onRenderSpy).toHaveBeenCalledTimes(1);
    expect(opaquePass._renderTarget).not.toBeNull();

    // 3. Full-res SSR (useHalfResolutionInputs=false) covers Downsampling.None -> reuse & release OpaqueTexturePass RT.
    onRenderSpy.mockClear();
    camera.screenSpaceReflection.useHalfResolutionInputs = false;
    engine.update();
    expect(onRenderSpy).toHaveBeenCalledTimes(0);
    expect(opaquePass._renderTarget).toBeNull();

    // 4. Opaque SSR receiver composited onto internalColorTarget -> must fall back to OpaqueTexturePass.
    onRenderSpy.mockClear();
    backdropMaterial.roughness = 0.05;
    backdropMaterial.screenSpaceReflection = { mode: "On", intensity: 1 };
    engine.update();
    expect(camera.screenSpaceReflection.metrics.opaqueSurfacePassDrawCount).toBeGreaterThan(0);
    expect(onRenderSpy).toHaveBeenCalledTimes(1);
  } finally {
    onRenderSpy.mockRestore();
    rt.destroy(true);
    backdropMaterial.destroy();
    glassMaterial.destroy();
    scene.destroy();
  }
});
