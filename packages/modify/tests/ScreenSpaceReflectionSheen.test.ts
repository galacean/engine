import {
  Camera,
  Material,
  MeshRenderer,
  PBRMaterial,
  PrimitiveMesh,
  RenderQueueType,
  RenderTarget,
  Scene,
  Shader,
  ScreenSpaceReflection as SSR,
  ScreenSpaceReflectionActivationMode as Activation,
  ScreenSpaceReflectionReceiverPolicy as Policy,
  ScreenSpaceReflectionUpsamplingMode as Upsampling,
  Texture2D,
  TextureCube,
  TextureCubeFace,
  TextureFilterMode,
  TextureFormat,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { afterAll, beforeAll, expect, it } from "vitest";
import { readTraceTarget } from "./ScreenSpaceReflectionTraceReadback";
import legacySource from "./fixtures/ssr-legacy-v2.shader?raw";

const SIZE = 128;
let engine: WebGLEngine;
beforeAll(async () => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  engine = await WebGLEngine.create({ canvas, shaderCompiler: new ShaderCompiler() });
  const gl = engine._hardwareRenderer.gl;
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  console.info(
    JSON.stringify({ backend: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) })
  );
});
afterAll(() => engine.destroy());

function maxDelta(a: ArrayLike<number>, b: ArrayLike<number>): number {
  expect(a.length).toBe(b.length);
  let result = 0;
  for (let i = 0; i < a.length; i++) result = Math.max(result, Math.abs(a[i] - b[i]));
  return result;
}

function fixture(samples = 1, knownDFG = true) {
  const scene = new Scene(engine);
  engine.sceneManager.activeScene = scene;
  scene.screenSpaceReflection.apply({
    activationMode: Activation.ForceOn,
    receiverPolicy: Policy.StandardPbrAuto,
    maxRoughness: 0.6,
    resolutionScale: 1,
    upsamplingMode: Upsampling.Bilinear,
    edgeFade: 0,
    maxRaySteps: 64,
    maxRayDistance: 40,
    thickness: 0.5
  });
  scene.ambientLight.diffuseIntensity = 0;
  const environment = new TextureCube(engine, 1, TextureFormat.R8G8B8A8, false);
  for (let face = 0; face < 6; face++)
    environment.setPixelBuffer(face as TextureCubeFace, new Uint8Array([64, 64, 64, 255]));
  scene.ambientLight.specularTexture = environment;
  const camera = scene.createRootEntity().addComponent(Camera);
  camera.enableHDR = false;
  camera.entity.transform.setPosition(0, 1.2, 6);
  camera.entity.transform.lookAt(new Vector3(0, 0.4, 0));
  const output = new Texture2D(engine, SIZE, SIZE, TextureFormat.R8G8B8A8, false, false);
  const target = new RenderTarget(engine, SIZE, SIZE, output, TextureFormat.Depth24, samples);
  camera.renderTarget = target;
  const renderer = scene.createRootEntity().addComponent(MeshRenderer);
  const mesh = PrimitiveMesh.createPlane(engine, 30, 30);
  renderer.mesh = mesh;
  const material = new PBRMaterial(engine);
  material.baseColor.set(0.8, 0.7, 0.6, 1);
  material.metallic = 1;
  material.roughness = 0.15;
  material.screenSpaceReflection = { mode: "Auto", intensity: 1 };
  renderer.setMaterial(material);
  const textures: Texture2D[] = [];
  const texture = (bytes: number[], width = 1, height = 1) => {
    const value = new Texture2D(engine, width, height, TextureFormat.R8G8B8A8, false, false);
    value.filterMode = TextureFilterMode.Point;
    value.setPixelBuffer(new Uint8Array(bytes));
    textures.push(value);
    return value;
  };
  // A known lookup value makes the expected attenuation independent of LUT generation.
  // Surface and Forward both sample this same scene input on the GPU.
  const sheenDFG = 128 / 255;
  if (knownDFG) scene.shaderData.setTexture("scene_PrefilteredDFG", texture([0, 0, 128, 255]));
  const panel = scene.createRootEntity().addComponent(MeshRenderer);
  const panelMesh = PrimitiveMesh.createPlane(engine, 4.5, 2);
  panel.mesh = panelMesh;
  panel.entity.transform.setPosition(0, 1.2, -1);
  panel.entity.transform.setRotation(90, 0, 0);
  const emitter = new PBRMaterial(engine);
  emitter.baseColor.set(0, 0, 0, 1);
  emitter.emissiveColor.set(0.8, 0.1, 0.4, 1);
  emitter.screenSpaceReflection = { mode: "Off", intensity: 0 };
  panel.setMaterial(emitter);
  const pass = (camera as any)._renderPipeline._screenSpaceReflectionPass;
  let geometry = new Uint8Array(SIZE * SIZE * 4);
  let response = new Float32Array(0);
  let traced = new Float32Array(0);
  let formats: TextureFormat[] = [];
  let injectedTrace: number[] | null = null;
  const mockTrace = texture([0, 0, 0, 0]);
  camera.screenSpaceReflection.profiler = {
    beginSample(stage) {
      if (stage === "trace") {
        formats = pass._surfaceTarget.colorTextures.map((value: Texture2D) => value.format);
        pass._surfaceTarget.getColorTexture(0).getPixelBuffer(0, 0, SIZE, SIZE, 0, geometry);
        response = readTraceTarget(pass._surfaceTarget, SIZE, 1);
      }
      if (stage === "composite") {
        traced = readTraceTarget(pass._traceTarget, pass._traceTarget.width);
        if (injectedTrace) {
          mockTrace.setPixelBuffer(new Uint8Array(injectedTrace));
          pass._material.shaderData.setTexture("material_SSRTraceTexture", mockTrace);
        }
      }
    },
    endSample() {}
  };
  return {
    scene,
    camera,
    material,
    renderer,
    sheenDFG,
    texture,
    render(trace: number[] | null = null) {
      injectedTrace = trace;
      geometry.fill(0);
      response = new Float32Array(0);
      traced = new Float32Array(0);
      formats = [];
      engine.update();
      expect(engine._hardwareRenderer.gl.getError()).toBe(0);
      const pixels = new Uint8Array(SIZE * SIZE * 4);
      output.getPixelBuffer(0, 0, SIZE, SIZE, 0, pixels);
      return {
        pixels,
        geometry: geometry.slice(),
        response: response.slice(),
        trace: traced.slice(),
        formats: formats.slice(),
        metrics: { ...camera.screenSpaceReflection.metrics }
      };
    },
    destroy() {
      camera.screenSpaceReflection.profiler = null;
      scene.destroy();
      target.destroy();
      output.destroy();
      material.destroy();
      emitter.destroy();
      mesh.destroy();
      panelMesh.destroy();
      environment.destroy();
      textures.forEach((value) => value.destroy());
    }
  };
}

it("supports the built-in Sheen base layer for opaque and Alpha Test, excluding mixed effects", () => {
  const f = fixture();
  try {
    f.material.sheenColor.set(0.8, 0.4, 0.2, 1);
    f.camera.screenSpaceReflection._prepareSettings();
    expect(SSR.getMaterialReceiverCapability(f.material).supported).toBe(true);
    expect(f.camera.screenSpaceReflection._isMaterialReceiver(f.material, RenderQueueType.Opaque)).toBe(true);
    f.material.alphaCutoff = 0.5;
    expect(f.camera.screenSpaceReflection._isMaterialReceiver(f.material, RenderQueueType.AlphaTest)).toBe(true);
    expect(f.camera.screenSpaceReflection._isMaterialReceiver(f.material, RenderQueueType.Transparent)).toBe(false);
    for (const macro of ["CLEAR_COAT", "ANISOTROPY", "IRIDESCENCE", "TRANSMISSION"]) {
      f.material.shaderData.enableMacro(`MATERIAL_ENABLE_${macro}`);
      expect(SSR.getMaterialReceiverCapability(f.material).supported).toBe(false);
      f.material.shaderData.disableMacro(`MATERIAL_ENABLE_${macro}`);
    }
  } finally {
    f.destroy();
  }
});

it("requires explicit Sheen opt-in on custom V3 Surfaces", () => {
  const source = legacySource.replaceAll("ColorResponseV2", "ColorResponseV3");
  for (const optedIn of [false, true]) {
    const shader = Shader.create(
      source
        .replace("SSRTest/LegacyViewNormalV2", `SSRTest/SheenV3/${optedIn}`)
        .replace(
          'screenSpaceReflectionReceiver = "ColorResponseV3"',
          'screenSpaceReflectionReceiver = "ColorResponseV3"' +
            (optedIn ? ', screenSpaceReflectionSheen = "BaseLayerV1"' : "")
        )
    )!;
    const material = new Material(engine, shader);
    try {
      expect(SSR.getMaterialReceiverCapability(material).supported).toBe(true);
      material.shaderData.enableMacro("MATERIAL_ENABLE_SHEEN");
      expect(SSR.getMaterialReceiverCapability(material).supported).toBe(optedIn);
    } finally {
      material.destroy();
      shader.destroy();
    }
  }
});

it("applies Forward's Sheen attenuation to Surface and the Composite correction exactly once", () => {
  const f = fixture();
  try {
    const base = f.render([255, 0, 0, 255]);
    f.scene.screenSpaceReflection.activationMode = Activation.ForceOff;
    const baseForward = f.render();
    f.material.sheenColor.set(0.8, 0.4, 0.2, 1);
    f.material.sheenRoughness = 0.7;
    const sheenForward = f.render();
    f.scene.screenSpaceReflection.activationMode = Activation.ForceOn;
    const sheen = f.render([255, 0, 0, 255]);
    const scale = 1 - 0.8 * f.sheenDFG;
    let offset = -1;
    for (let i = 0; i < base.geometry.length; i += 4) {
      if (base.geometry[i + 3] > 0 && base.response[i] > 0.2) {
        offset = i;
        break;
      }
    }
    expect(offset).toBeGreaterThanOrEqual(0);
    expect(sheen.response).toHaveLength(base.response.length);
    expect(sheen.response[offset]).toBeGreaterThan(0.1);
    expect(maxDelta(base.geometry, sheen.geometry)).toBe(0);
    for (let channel = 0; channel < 3; channel++) {
      expect(Math.abs(sheen.response[offset + channel] - base.response[offset + channel] * scale)).toBeLessThanOrEqual(
        1 / 255
      );
      const baseCorrection = base.pixels[offset + channel] - baseForward.pixels[offset + channel];
      const sheenCorrection = sheen.pixels[offset + channel] - sheenForward.pixels[offset + channel];
      expect(Math.abs(sheenCorrection - baseCorrection * scale)).toBeLessThanOrEqual(2);
    }
    expect(Math.abs(base.pixels[offset] - baseForward.pixels[offset])).toBeGreaterThan(10);
  } finally {
    f.destroy();
  }
});

it.each([
  [1, Upsampling.Bilinear],
  [0.5, Upsampling.Bilateral],
  [0.5, Upsampling.GaussianBilateral]
])("renders real Sheen SSR at scale %s / mode %s without extra passes, attachments or bytes", (scale, mode) => {
  const f = fixture();
  try {
    f.scene.screenSpaceReflection.apply({ resolutionScale: scale, upsamplingMode: mode });
    const base = f.render();
    f.material.sheenColor.set(0.8, 0.4, 0.2, 1);
    const sheen = f.render();
    expect(sheen.formats).toEqual([TextureFormat.R8G8B8A8, TextureFormat.R8G8B8A8]);
    for (const key of [
      "surfacePassDrawCount",
      "tracePassCount",
      "compositePassCount",
      "filterPassCount",
      "upsamplePassCount",
      "fullscreenPassCount",
      "renderTargetCount",
      "renderTextureCount",
      "estimatedBytes"
    ] as const)
      expect(sheen.metrics[key], key).toBe(base.metrics[key]);
    expect(sheen.metrics.surfacePassDrawCount).toBe(1);
    expect(sheen.metrics.tracePassCount).toBe(1);
    expect(sheen.metrics.compositePassCount).toBe(1);
    let hits = 0;
    for (let i = 3; i < sheen.trace.length; i += 4) if (sheen.trace[i] > 0.01) hits++;
    expect(hits).toBeGreaterThan(10);
    f.scene.screenSpaceReflection.activationMode = Activation.ForceOff;
    const forward = f.render();
    let visibleCorrections = 0;
    for (let i = 0; i < sheen.pixels.length; i += 4)
      if (sheen.geometry[i + 3] && Math.abs(sheen.pixels[i] - forward.pixels[i]) > 2) visibleCorrections++;
    expect(visibleCorrections).toBeGreaterThan(10);
    console.info(
      JSON.stringify({ scale, mode, hits, visibleCorrections, estimatedBytes: sheen.metrics.estimatedBytes })
    );
  } finally {
    f.destroy();
  }
});

it.each([1, 4])(
  "preserves Alpha Test coverage and zero-Sheen/texture/miss/strength fallback with %sx MSAA",
  (samples) => {
    const f = fixture(samples);
    try {
      f.material.alphaCutoff = 0.5;
      f.material.baseTexture = f.texture([255, 255, 255, 0, 255, 255, 255, 255], 2);
      const ordinary = f.render([255, 0, 0, 255]);
      f.material.sheenColor.set(0.8, 0.4, 0.2, 1);
      f.material.sheenColorTexture = f.texture([0, 0, 0, 255]);
      const zeroTexture = f.render([255, 0, 0, 255]);
      expect(zeroTexture.metrics.surfacePassDrawCount).toBe(1);
      expect(maxDelta(ordinary.geometry, zeroTexture.geometry)).toBe(0);
      expect(maxDelta(ordinary.pixels, zeroTexture.pixels)).toBeLessThanOrEqual(1);
      expect(zeroTexture.geometry.some((value, index) => index % 4 === 3 && value > 0)).toBe(true);
      expect(zeroTexture.geometry.some((value, index) => index % 4 === 3 && value === 0)).toBe(true);
      f.material.sheenColorTexture = null!;
      const miss = f.render([0, 0, 0, 0]);
      f.scene.screenSpaceReflection.activationMode = Activation.ForceOff;
      const forward = f.render();
      expect(maxDelta(miss.pixels, forward.pixels)).toBeLessThanOrEqual(1);
      f.scene.screenSpaceReflection.activationMode = Activation.ForceOn;
      f.material.screenSpaceReflection = { mode: "Auto", intensity: 0 };
      expect(maxDelta(f.render().pixels, forward.pixels)).toBeLessThanOrEqual(1);
      f.material.screenSpaceReflection = { mode: "Auto", intensity: 1 };
      f.material.sheenColor.set(0, 0, 0, 1);
      expect(maxDelta(f.render([255, 0, 0, 255]).pixels, ordinary.pixels)).toBeLessThanOrEqual(1);
    } finally {
      f.destroy();
    }
  }
);

it("uses the base roughness cutoff even when the Sheen layer is smooth", () => {
  const f = fixture();
  try {
    f.material.sheenColor.set(0.8, 0.4, 0.2, 1);
    f.material.sheenRoughness = 0.05;
    f.material.roughness = 1;
    expect(SSR.getMaterialReceiverCapability(f.material).supported).toBe(true);
    const rough = f.render();
    expect(rough.metrics.surfacePassDrawCount).toBe(0);
    f.scene.screenSpaceReflection.activationMode = Activation.ForceOff;
    expect(maxDelta(rough.pixels, f.render().pixels)).toBeLessThanOrEqual(1);
    f.scene.screenSpaceReflection.activationMode = Activation.ForceOn;
    f.material.roughness = 0.15;
    f.material.sheenRoughness = 1;
    expect(f.render().metrics.surfacePassDrawCount).toBe(1);
  } finally {
    f.destroy();
  }
});

it("samples Sheen roughness texture alpha with the real Engine lookup while retaining base geometry", () => {
  const f = fixture(1, false);
  try {
    f.material.sheenColor.set(0.8, 0.4, 0.2, 1);
    f.material.sheenRoughness = 1;
    f.material.sheenRoughnessTexture = f.texture([0, 0, 0, 64]);
    const textured = f.render([255, 0, 0, 255]);
    f.material.sheenRoughnessTexture = null!;
    f.material.sheenRoughness = 64 / 255;
    const scalar = f.render([255, 0, 0, 255]);
    expect(maxDelta(textured.response, scalar.response)).toBeLessThanOrEqual(1 / 255);
    expect(maxDelta(textured.pixels, scalar.pixels)).toBeLessThanOrEqual(1);
    f.material.sheenRoughness = 1;
    const rough = f.render([255, 0, 0, 255]);
    expect(maxDelta(scalar.geometry, rough.geometry)).toBe(0);
    expect(maxDelta(scalar.response, rough.response)).toBeGreaterThan(2 / 255);
  } finally {
    f.destroy();
  }
});
