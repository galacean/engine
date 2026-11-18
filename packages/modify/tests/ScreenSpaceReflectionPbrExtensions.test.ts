import {
  Camera,
  CompareFunction,
  DirectLight,
  Engine,
  GLCapabilityType,
  Material,
  MeshRenderer,
  PBRMaterial,
  PrimitiveMesh,
  RenderQueueType,
  RenderTarget,
  Scene,
  Shader,
  ShaderMacro,
  ShaderMacroCollection,
  ShaderPass,
  SpriteMaskInteraction,
  StencilOperation,
  ScreenSpaceReflection as SSR,
  ScreenSpaceReflectionActivationMode as Activation,
  ScreenSpaceReflectionReceiverPolicy as Policy,
  ScreenSpaceReflectionUpsamplingMode as Upsampling,
  Texture2D,
  TextureCube,
  TextureCubeFace,
  TextureFormat,
  RefractionMode,
  ScreenSpaceReflectionReceiverMode as Receiver,
  TextureFilterMode,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { ShaderPool } from "../src/native/galacean/src/ShaderPool";
import { readTraceTarget } from "./ScreenSpaceReflectionTraceReadback";
import legacySource from "./fixtures/ssr-legacy-v2.shader?raw";
import pbrSource from "../src/native/shader/src/Shaders/PBR.shader?raw";
import surfaceSource from "../src/native/shader/src/Shaders/Pipeline/ScreenSpaceReflectionSurface.shader?raw";

function maxByteDelta(a: Uint8Array, b: Uint8Array): number {
  let delta = 0;
  for (let i = 0; i < a.length; i++) delta = Math.max(delta, Math.abs(a[i] - b[i]));
  return delta;
}

let engine: WebGLEngine;
beforeAll(async () => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 128;
  engine = await WebGLEngine.create({ canvas, shaderCompiler: new ShaderCompiler() });
  const gl = engine._hardwareRenderer.gl;
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  console.info(
    JSON.stringify({ backend: info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER) })
  );
});

const SIZE = 128;
interface PassInternals {
  _surfaceTarget: RenderTarget;
  _traceTarget: RenderTarget;
  _filteredTraceTarget: RenderTarget;
  _material: Material;
  composite(colorTarget: RenderTarget): void;
  publish(): void;
}

/** Read actual Surface MRTs; inject only radiance for isolated Composite replacement checks. */
function fixture(samples = 1, depthFormat = TextureFormat.Depth24) {
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
  scene.ambientLight.specularIntensity = 0.25;
  scene.background.solidColor.set(0.2, 0.35, 0.5, 1);
  const environment = new TextureCube(engine, 1, TextureFormat.R8G8B8A8, false);
  for (let face = 0; face < 6; face++) {
    environment.setPixelBuffer(face as TextureCubeFace, new Uint8Array([255, 255, 255, 255]));
  }
  scene.ambientLight.specularTexture = environment;
  const camera = scene.createRootEntity().addComponent(Camera);
  camera.enableHDR = false;
  camera.opaqueTextureEnabled = true;
  camera.entity.transform.setPosition(0, 1.2, 6);
  camera.entity.transform.lookAt(new Vector3());
  const output = new Texture2D(engine, SIZE, SIZE, TextureFormat.R8G8B8A8, false, false);
  const target = new RenderTarget(engine, SIZE, SIZE, output, depthFormat, samples);
  camera.renderTarget = target;
  const renderer = scene.createRootEntity().addComponent(MeshRenderer);
  const mesh = PrimitiveMesh.createPlane(engine, 30, 30);
  renderer.mesh = mesh;
  const material = new PBRMaterial(engine);
  material.metallic = 0;
  material.roughness = 0.2;
  material.screenSpaceReflection = { mode: "Auto", intensity: 1 };
  renderer.setMaterial(material);
  const pass = (camera as unknown as { _renderPipeline: { _screenSpaceReflectionPass: PassInternals } })._renderPipeline
    ._screenSpaceReflectionPass;
  const mockTrace = new Texture2D(engine, 1, 1, TextureFormat.R8G8B8A8, false, false);
  let injectedTrace: number[] | null = null;
  let traced = new Float32Array(0);
  let filtered = new Float32Array(0);
  let surfaceFormats: TextureFormat[] = [];
  let traceFormat: TextureFormat | null = null;
  let geometry = new Uint8Array(SIZE * SIZE * 4);
  let response = new Uint8Array(SIZE * SIZE * 4);
  camera.screenSpaceReflection.profiler = {
    beginSample(stage) {
      if (stage === "trace") {
        surfaceFormats = pass._surfaceTarget.colorTextures.map((texture) => texture!.format);
        traceFormat = pass._traceTarget.getColorTexture(0).format;
        (pass._surfaceTarget.getColorTexture(0) as Texture2D).getPixelBuffer(0, 0, SIZE, SIZE, 0, geometry);
        (pass._surfaceTarget.getColorTexture(1) as Texture2D | null)?.getPixelBuffer(0, 0, SIZE, SIZE, 0, response);
      }
      if (stage === "composite" && injectedTrace) {
        mockTrace.setPixelBuffer(new Uint8Array(injectedTrace));
        pass._material.shaderData.setTexture("material_SSRTraceTexture", mockTrace);
      } else if (stage === "composite") {
        traced = readTraceTarget(pass._traceTarget, pass._traceTarget.width);
        if (pass._filteredTraceTarget)
          filtered = readTraceTarget(pass._filteredTraceTarget, pass._filteredTraceTarget.width);
      }
    },
    endSample() {}
  };
  const publish = pass.publish;
  pass.publish = function () {
    traced = readTraceTarget(pass._traceTarget, pass._traceTarget.width);
    if (pass._filteredTraceTarget)
      filtered = readTraceTarget(pass._filteredTraceTarget, pass._filteredTraceTarget.width);
    publish.call(this);
    if (injectedTrace) {
      mockTrace.setPixelBuffer(new Uint8Array(injectedTrace));
      camera.shaderData.setTexture("camera_ScreenSpaceReflectionTexture", mockTrace);
    }
  };
  const textures: Texture2D[] = [];
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
  return {
    scene,
    camera,
    renderer,
    material,
    pass,
    environment,
    emitter,
    texture(rgba: number[] | Float32Array, width = 1, height = 1) {
      const texture = new Texture2D(
        engine,
        width,
        height,
        rgba instanceof Float32Array ? TextureFormat.R32G32B32A32 : TextureFormat.R8G8B8A8,
        false,
        false
      );
      texture.setPixelBuffer(rgba instanceof Float32Array ? rgba : new Uint8Array(rgba));
      texture.filterMode = TextureFilterMode.Point;
      textures.push(texture);
      return texture;
    },
    render(trace: number[] | null = null) {
      injectedTrace = trace;
      surfaceFormats = [];
      traceFormat = null;
      geometry.fill(0);
      response.fill(0);
      traced = new Float32Array(0);
      filtered = new Float32Array(0);
      engine.update();
      expect(engine._hardwareRenderer.gl.getError()).toBe(0);
      const point = camera.worldToScreenPoint(new Vector3(), new Vector3());
      const offset = ((SIZE - 1 - Math.floor(point.y)) * SIZE + Math.floor(point.x)) * 4;
      const pixels = new Uint8Array(SIZE * SIZE * 4);
      output.getPixelBuffer(0, 0, SIZE, SIZE, 0, pixels);
      return {
        surfaceFormats: surfaceFormats.slice(),
        traceFormat,
        geometry: Array.from(geometry.slice(offset, offset + 4)),
        response: Array.from(response.slice(offset, offset + 4)),
        color: Array.from(pixels.slice(offset, offset + 4)),
        pixels,
        trace: traced,
        filtered,
        surface: geometry.slice(),
        responses: response.slice(),
        metrics: { ...camera.screenSpaceReflection.metrics }
      };
    },
    destroy() {
      camera.screenSpaceReflection.profiler = null;
      pass.publish = publish;
      scene.destroy();
      target.destroy();
      output.destroy();
      material.destroy();
      mesh.destroy();
      panelMesh.destroy();
      emitter.destroy();
      mockTrace.destroy();
      environment.destroy();
      textures.forEach((texture) => texture.destroy());
    }
  };
}

afterAll(() => engine.destroy());

const features = ["anisotropy", "iridescence", "transmission"] as const;
type Feature = (typeof features)[number];
function enable(material: PBRMaterial, feature: Feature | "clearCoat" | "sheen") {
  if (feature === "sheen") {
    material.sheenColor.set(0.7, 0.4, 0.2, 1);
    material.sheenRoughness = 0.5;
  } else {
    material[feature] = 0.8;
  }
  if (feature === "iridescence") material.iridescenceThicknessRange.set(200, 500);
}

it.each(features)("accepts standalone %s through its real queue and preserves authored On / Auto intent", (feature) => {
  const f = fixture();
  try {
    enable(f.material, feature);
    const queue = feature === "transmission" ? RenderQueueType.Transparent : RenderQueueType.Opaque;
    expect(f.material.shaderData.getInt("renderQueueType")).toBe(queue);
    expect(SSR.getMaterialReceiverCapability(f.material).supported).toBe(true);
    f.camera.screenSpaceReflection._prepareSettings();
    for (const mode of ["Auto", "On"] as const) {
      f.material.screenSpaceReflection = { mode, intensity: 1 };
      expect(f.camera.screenSpaceReflection._isMaterialReceiver(f.material, queue)).toBe(true);
    }
    f.material.alphaCutoff = 0.5;
    const alphaQueue = f.material.shaderData.getInt("renderQueueType");
    expect(alphaQueue).toBe(feature === "transmission" ? RenderQueueType.Transparent : RenderQueueType.AlphaTest);
    expect(f.camera.screenSpaceReflection._isMaterialReceiver(f.material, alphaQueue)).toBe(true);
    f.material.isTransparent = true;
    expect(f.camera.screenSpaceReflection._isMaterialReceiver(f.material, RenderQueueType.Transparent)).toBe(false);
    f.material.isTransparent = false;
    expect(f.camera.screenSpaceReflection._isMaterialReceiver(f.material, alphaQueue)).toBe(true);
  } finally {
    f.destroy();
  }
});

it("rejects mixed Transmission and unadapted custom V3 Surfaces", () => {
  const f = fixture();
  const macros = ["CLEAR_COAT", "SHEEN", "ANISOTROPY", "IRIDESCENCE", "TRANSMISSION"];
  const shader = Shader.create(
    legacySource
      .replaceAll("ColorResponseV2", "ColorResponseV3")
      .replace("SSRTest/LegacyViewNormalV2", "SSRTest/CustomExtensionsV3")
  )!;
  const custom = new Material(engine, shader);
  try {
    expect(SSR.getMaterialReceiverCapability(custom).supported).toBe(true);
    for (let i = 0; i < macros.length; i++) {
      const a = `MATERIAL_ENABLE_${macros[i]}`;
      f.material.shaderData.enableMacro(a);
      expect(SSR.getMaterialReceiverCapability(f.material).supported).toBe(true);
      custom.shaderData.enableMacro(a);
      expect(SSR.getMaterialReceiverCapability(custom).supported).toBe(false);
      custom.shaderData.disableMacro(a);
      for (let j = i + 1; j < macros.length; j++) {
        const b = `MATERIAL_ENABLE_${macros[j]}`;
        f.material.shaderData.enableMacro(b);
        expect(SSR.getMaterialReceiverCapability(f.material).supported).toBe(macros[j] !== "TRANSMISSION");
        expect(SSR.getMaterialReceiverCapability(f.material, Receiver.Auto).supported).toBe(false);
        f.material.shaderData.disableMacro(b);
      }
      f.material.shaderData.disableMacro(a);
    }
  } finally {
    f.destroy();
    custom.destroy();
    shader.destroy();
  }
});

const opaqueExtensions = ["clearCoat", "sheen", "anisotropy", "iridescence"] as const;
const combinations = Array.from({ length: 15 }, (_, i) => opaqueExtensions.filter((_, j) => (i + 1) & (1 << j)))
  .filter((extensions) => extensions.length > 1)
  .flatMap((extensions) =>
    [false, true].map((alphaTest) => ({
      label: extensions.join(" + "),
      extensions,
      alphaTest,
      queue: alphaTest ? RenderQueueType.AlphaTest : RenderQueueType.Opaque
    }))
  );

it.each(combinations)(
  "traces $label with alphaTest=$alphaTest only when explicitly enabled",
  ({ extensions, alphaTest, queue }) => {
    const f = fixture();
    try {
      f.material.roughness = 0.1;
      f.material.alphaCutoff = alphaTest ? 0.5 : 0;
      for (const feature of extensions) enable(f.material, feature);
      if (extensions.includes("anisotropy")) f.material.anisotropy = 0.5;
      expect(f.material.shaderData.getInt("renderQueueType")).toBe(queue);
      const automatic = f.render();
      expect(automatic.metrics.surfacePassDrawCount).toBe(0);
      f.material.screenSpaceReflection = { mode: "On", intensity: 1 };
      const on = f.render();
      expect(on.metrics).toMatchObject({ surfacePassDrawCount: 1, tracePassCount: 1, compositePassCount: 1 });
      expect(on.surfaceFormats).toEqual([TextureFormat.R8G8B8A8, TextureFormat.R8G8B8A8]);
      let hits = 0;
      for (let i = 3; i < on.trace.length; i += 4) if (on.trace[i] > 0.01) hits++;
      expect(hits).toBeGreaterThan(10);
      expect(maxByteDelta(on.pixels, automatic.pixels)).toBeGreaterThan(2);

      f.material.isTransparent = true;
      expect(f.render().metrics.surfacePassDrawCount).toBe(0);
      f.material.isTransparent = false;
      expect(f.render().metrics.surfacePassDrawCount).toBe(1);
    } finally {
      f.destroy();
    }
  }
);

it.each([
  { samples: 1, alphaTest: false },
  { samples: 4, alphaTest: true }
])("subtracts only the combined material's Forward base reflection at $samples samples", ({ samples, alphaTest }) => {
  const f = fixture(samples);
  try {
    const light = f.scene.createRootEntity().addComponent(DirectLight);
    light.intensity = 0.2;
    light.entity.transform.setRotation(-30, 30, 0);
    f.scene.ambientLight.diffuseIntensity = 0.05;
    f.scene.ambientLight.specularIntensity = 0.4;
    // A wrong ray direction should subtract a different color, even if the
    // attenuation and Fresnel terms still match.
    const colors = [
      [255, 96, 96],
      [96, 255, 96],
      [96, 96, 255],
      [255, 255, 96],
      [96, 255, 255],
      [255, 96, 255]
    ];
    colors.forEach((rgb, face) => f.environment.setPixelBuffer(face as TextureCubeFace, new Uint8Array([...rgb, 255])));
    f.material.metallic = 0.7;
    f.material.roughness = 0.35;
    f.material.baseColor.set(0.45, 0.35, 0.25, 1);
    f.material.emissiveColor.set(0.05, 0.03, 0.01, 1);
    f.material.alphaCutoff = alphaTest ? 0.5 : 0;
    for (const feature of opaqueExtensions) enable(f.material, feature);
    f.material.clearCoatRoughness = 0.05;
    f.material.anisotropy = 0.9;
    f.material.anisotropyRotation = 90;
    if (alphaTest) {
      f.material.screenSpaceReflection = null;
      expect(SSR.setMaterialReceiver(f.material, Receiver.Auto)).toBe(false);
      expect(SSR.setMaterialReceiver(f.material, Receiver.OpaqueComposite)).toBe(true);
    } else {
      f.material.screenSpaceReflection = { mode: "On", intensity: 1 };
    }

    f.scene.screenSpaceReflection.activationMode = Activation.ForceOff;
    const forward = f.render();
    const coat = f.material.clearCoat;
    f.material.clearCoat = 0;
    const baseWithEnv = f.render();
    const intensity = f.scene.ambientLight.specularIntensity;
    f.scene.ambientLight.specularIntensity = 0;
    const baseWithoutEnv = f.render();
    f.scene.ambientLight.specularIntensity = intensity;
    f.material.clearCoat = coat;

    // The flat plane's center gives N·V from the known camera position. Without
    // clear coat, changing environment intensity isolates Forward's base term.
    const dotNV = 1.2 / Math.hypot(1.2, 6);
    const attenuation = 1 - coat * (0.04 + 0.96 * (1 - dotNV) ** 5);
    f.scene.screenSpaceReflection.activationMode = Activation.ForceOn;
    const blackHit = f.render([0, 0, 0, 255]);
    expect(blackHit.metrics.surfacePassDrawCount).toBe(1);
    expect(blackHit.geometry[3]).toBe(255);
    const removed = forward.color.slice(0, 3).map((value, c) => value - blackHit.color[c]);
    expect(Math.max(...removed)).toBeGreaterThan(5);
    for (let c = 0; c < 3; c++) {
      const expected = (baseWithEnv.color[c] - baseWithoutEnv.color[c]) * attenuation;
      expect(Math.abs(removed[c] - expected)).toBeLessThanOrEqual(2);
    }
    const miss = f.render([0, 0, 0, 0]);
    expect(miss.metrics.compositePassCount).toBe(1);
    // Keep the same SSR camera target and MSAA resolve path for the control.
    // ForceOff can change edge quantization even if Composite adds no reflection.
    const composite = vi.spyOn(f.pass, "composite").mockImplementation(() => {});
    try {
      const withoutComposite = f.render([0, 0, 0, 0]);
      expect(withoutComposite.metrics.tracePassCount).toBe(1);
      expect(withoutComposite.metrics.compositePassCount).toBe(0);
      expect(maxByteDelta(miss.pixels, withoutComposite.pixels)).toBeLessThanOrEqual(1);
    } finally {
      composite.mockRestore();
    }

    if (alphaTest) {
      f.material.baseTexture = f.texture([255, 255, 255, 0]);
      const cutout = f.render();
      expect(cutout.geometry[3]).toBe(0);
      expect(cutout.trace.some((value, i) => i % 4 === 3 && value > 0)).toBe(false);
    }
  } finally {
    f.destroy();
  }
});

it("reuses anisotropic bent normals, rotation and zero-strength texture without changing roughness", () => {
  const f = fixture();
  try {
    f.material.roughness = 0.35;
    const ordinary = f.render([0, 0, 0, 0]);
    expect(ordinary.geometry[3]).toBe(255);
    f.material.anisotropy = 0.8;
    const a = f.render();
    f.material.anisotropyRotation = 90;
    const b = f.render();
    expect(a.geometry[2]).toBe(ordinary.geometry[2]);
    expect(b.geometry[2]).toBe(ordinary.geometry[2]);
    expect(a.geometry.slice(0, 2)).not.toEqual(b.geometry.slice(0, 2));
    f.material.anisotropyTexture = f.texture([255, 128, 0, 255]);
    const zero = f.render([0, 0, 0, 0]);
    expect(zero.geometry).toEqual(ordinary.geometry);
    expect(maxByteDelta(zero.pixels, ordinary.pixels)).toBeLessThanOrEqual(1);
  } finally {
    f.destroy();
  }
});

it("subtracts the same directional environment as Forward for anisotropic rotations", () => {
  const f = fixture();
  try {
    f.material.metallic = 1;
    f.material.baseColor.set(0.4, 0.4, 0.4, 1);
    f.material.roughness = 0.35;
    f.material.anisotropy = 0.9;
    const colors = [
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
      [255, 255, 0],
      [0, 255, 255],
      [255, 0, 255]
    ];
    colors.forEach((rgb, face) => f.environment.setPixelBuffer(face as TextureCubeFace, new Uint8Array([...rgb, 255])));
    const seen: number[][] = [];
    for (const rotation of [0, 90]) {
      f.material.anisotropyRotation = rotation;
      f.scene.screenSpaceReflection.activationMode = Activation.ForceOff;
      const off = f.render();
      f.scene.screenSpaceReflection.activationMode = Activation.ForceOn;
      const on = f.render([128, 0, 0, 128]);
      seen.push(off.color);
      for (let c = 0; c < 3; c++) {
        const expected = off.color[c] * (1 - 128 / 255) + on.response[c] * (c === 0 ? 128 / 255 : 0);
        expect(Math.abs(on.color[c] - expected)).toBeLessThanOrEqual(2);
      }
    }
    expect(seen[0]).not.toEqual(seen[1]);
  } finally {
    f.destroy();
  }
});

it("retains Iridescence color and thickness textures in the common response", () => {
  const f = fixture();
  try {
    const plain = f.render([0, 0, 0, 0]);
    f.material.iridescence = 1;
    f.material.iridescenceIOR = 1.3;
    f.material.iridescenceThicknessRange.set(200, 500);
    const thick = f.render();
    f.material.iridescenceThicknessTexture = f.texture([0, 128, 0, 255]);
    const textured = f.render();
    f.material.iridescenceThicknessTexture = null;
    f.material.iridescenceThicknessRange.set(200, 200 + (300 * 128) / 255);
    const scalar = f.render();
    expect(textured.geometry).toEqual(plain.geometry);
    expect(textured.response).not.toEqual(thick.response);
    expect(textured.response).toEqual(scalar.response);
    f.material.iridescenceTexture = f.texture([0, 255, 255, 255]);
    const zero = f.render([0, 0, 0, 0]);
    expect(zero.response).toEqual(plain.response);
    expect(maxByteDelta(zero.pixels, plain.pixels)).toBeLessThanOrEqual(1);
    f.material.iridescenceTexture = null;
    f.scene.screenSpaceReflection.activationMode = Activation.ForceOff;
    const off = f.render();
    f.scene.screenSpaceReflection.activationMode = Activation.ForceOn;
    const on = f.render([128, 0, 0, 128]);
    for (let c = 0; c < 3; c++) {
      const expected = off.color[c] * (1 - 128 / 255) + on.response[c] * (c === 0 ? 128 / 255 : 0);
      expect(Math.abs(on.color[c] - expected)).toBeLessThanOrEqual(2);
    }
  } finally {
    f.destroy();
  }
});

it.each(features)(
  "renders real standalone %s SSR in all reconstruction modes without additional attachments",
  (feature) => {
    const f = fixture();
    try {
      f.scene.ambientLight.specularIntensity = 0.05;
      f.material.roughness = 0.1;
      enable(f.material, feature);
      let bytes: number | undefined;
      for (const [scale, mode] of [
        [1, Upsampling.Bilinear],
        [0.5, Upsampling.Bilateral],
        [0.5, Upsampling.GaussianBilateral]
      ] as const) {
        f.scene.screenSpaceReflection.apply({ resolutionScale: scale, upsamplingMode: mode });
        const on = f.render();
        expect(on.surfaceFormats).toEqual(
          feature === "transmission" ? [TextureFormat.R8G8B8A8] : [TextureFormat.R8G8B8A8, TextureFormat.R8G8B8A8]
        );
        expect(on.metrics).toMatchObject({
          surfacePassDrawCount: 1,
          tracePassCount: 1,
          compositePassCount: feature === "transmission" ? 0 : 1,
          transparentSurfacePassDrawCount: feature === "transmission" ? 1 : 0
        });
        let hits = 0;
        for (let i = 3; i < on.trace.length; i += 4) if (on.trace[i] > 0.01) hits++;
        expect(hits).toBeGreaterThan(10);
        f.scene.screenSpaceReflection.activationMode = Activation.ForceOff;
        const off = f.render();
        f.scene.screenSpaceReflection.activationMode = Activation.ForceOn;
        let changed = 0;
        for (let i = 0; i < on.pixels.length; i += 4) if (Math.abs(on.pixels[i] - off.pixels[i]) > 2) changed++;
        expect(changed).toBeGreaterThan(20);
        if (feature !== "transmission") {
          f.material[feature] = 0;
          const ordinary = f.render();
          expect(on.metrics.estimatedBytes).toBe(ordinary.metrics.estimatedBytes);
          expect(on.metrics.fullscreenPassCount).toBe(ordinary.metrics.fullscreenPassCount);
          enable(f.material, feature);
        } else {
          bytes = on.metrics.estimatedBytes;
          f.material.transmission = 0.3;
          expect(f.render().metrics.estimatedBytes).toBe(bytes);
          f.material.transmission = 0.8;
        }
        console.info(JSON.stringify({ feature, scale, mode, hits, changed, bytes: on.metrics.estimatedBytes }));
      }
    } finally {
      f.destroy();
    }
  }
);

it.each([1, 4])(
  "preserves fallback, Alpha Test and zero-feature textures for every extension at %sx MSAA",
  (samples) => {
    for (const feature of features) {
      const f = fixture(samples);
      try {
        enable(f.material, feature);
        f.material.alphaCutoff = 0.5;
        f.material.baseTexture = f.texture([255, 255, 255, 0, 255, 255, 255, 255], 2);
        f.scene.screenSpaceReflection.activationMode = Activation.ForceOff;
        const off = f.render();
        f.scene.screenSpaceReflection.activationMode = Activation.ForceOn;
        const miss = f.render([0, 0, 0, 0]);
        expect(maxByteDelta(miss.pixels, off.pixels)).toBeLessThanOrEqual(1);
        expect(miss.surface.some((x, i) => i % 4 === 3 && x === 0)).toBe(true);
        expect(miss.surface.some((x, i) => i % 4 === 3 && x > 0)).toBe(true);
        f.material.screenSpaceReflection = { mode: "Auto", intensity: 0 };
        expect(maxByteDelta(f.render().pixels, off.pixels)).toBeLessThanOrEqual(1);
        f.material.screenSpaceReflection = { mode: "Auto", intensity: 1 };
        f.scene.screenSpaceReflection.intensity = 0;
        expect(maxByteDelta(f.render().pixels, off.pixels)).toBeLessThanOrEqual(1);
        f.scene.screenSpaceReflection.intensity = 1;
        f.material.roughness = 1;
        expect(f.render().metrics.surfacePassDrawCount).toBe(0);
      } finally {
        f.destroy();
      }
    }
  }
);

it.each([RefractionMode.Planar, RefractionMode.Sphere])(
  "replaces only Transmission's reflected radiance and applies strength once (refraction=%s)",
  (mode) => {
    const f = fixture();
    try {
      f.material.roughness = 0.15;
      f.material.baseColor.set(0.6, 0.5, 0.4, 1);
      const ordinary = f.render([0, 0, 0, 0]);
      expect(ordinary.response[0]).toBeGreaterThan(0);
      f.material.transmission = 0.65;
      f.material.refractionMode = mode;
      f.material.thickness = 0.6;
      f.scene.screenSpaceReflection.activationMode = Activation.ForceOff;
      const off = f.render();
      expect(maxByteDelta(off.pixels, ordinary.pixels)).toBeGreaterThan(2);
      f.scene.screenSpaceReflection.activationMode = Activation.ForceOn;
      for (const [materialIntensity, cameraIntensity] of [
        [1, 1],
        [0.5, 1],
        [0.5, 0.5]
      ]) {
        f.material.screenSpaceReflection = { mode: "Auto", intensity: materialIntensity };
        f.scene.screenSpaceReflection.intensity = cameraIntensity;
        const on = f.render([128, 0, 0, 128]);
        for (let c = 0; c < 3; c++) {
          const correction =
            ((c === 0 ? 128 / 255 : 0) - (0.25 * 128) / 255) *
            ordinary.response[c] *
            materialIntensity *
            cameraIntensity;
          expect(Math.abs(on.color[c] - off.color[c] - correction)).toBeLessThanOrEqual(2);
        }
      }
      f.material.transmissionTexture = f.texture([0, 0, 0, 255]);
      f.material.screenSpaceReflection = { mode: "Auto", intensity: 1 };
      f.scene.screenSpaceReflection.intensity = 1;
      const zero = f.render([0, 0, 0, 0]);
      expect(maxByteDelta(zero.pixels, ordinary.pixels)).toBeLessThanOrEqual(1);
    } finally {
      f.destroy();
    }
  }
);

it("does not sample a different receiver's published texture when Transmission Auto is excluded by camera policy", () => {
  const f = fixture();
  const control = new PBRMaterial(engine);
  const mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
  try {
    enable(f.material, "transmission");
    f.scene.screenSpaceReflection.receiverPolicy = Policy.ExplicitOnly;
    control.transmission = 0.5;
    control.screenSpaceReflection = { mode: "On", intensity: 1 };
    const renderer = f.scene.createRootEntity().addComponent(MeshRenderer);
    renderer.mesh = mesh;
    renderer.entity.transform.setPosition(3, 0.5, 0);
    renderer.setMaterial(control);
    f.scene.screenSpaceReflection.activationMode = Activation.ForceOff;
    const off = f.render();
    f.scene.screenSpaceReflection.activationMode = Activation.ForceOn;
    const on = f.render([255, 0, 0, 255]);
    expect(on.metrics.transparentSurfacePassDrawCount).toBe(1);
    expect(Math.max(...on.color.map((value, i) => Math.abs(value - off.color[i])))).toBeLessThanOrEqual(1);
    f.material.screenSpaceReflection = { mode: "On", intensity: 1 };
    expect(f.render([255, 0, 0, 255]).color).not.toEqual(off.color);
    f.material.isTransparent = true;
    expect(
      Math.max(...f.render([255, 0, 0, 255]).color.map((value, i) => Math.abs(value - off.color[i])))
    ).toBeLessThanOrEqual(1);
  } finally {
    f.destroy();
    control.destroy();
    mesh.destroy();
  }
});

it.each(["stencil", "shared-material-mask"])(
  "keeps rejected Transmission on Forward IBL when another receiver publishes (%s)",
  (filter) => {
    const f = fixture(1, TextureFormat.Depth24Stencil8);
    const mesh = PrimitiveMesh.createPlane(engine, 30, 30);
    const shared = filter === "shared-material-mask";
    const behindMaterial = shared ? f.material : new PBRMaterial(engine);
    let custom: Shader | undefined;
    try {
      f.material.transmission = 0.65;
      f.material.roughness = 0.15;
      behindMaterial.transmission = 0.65;
      behindMaterial.roughness = 0.15;
      behindMaterial.metallic = 0;
      behindMaterial.screenSpaceReflection = { mode: "On", intensity: 1 };
      const behind = f.scene.createRootEntity().addComponent(MeshRenderer);
      behind.mesh = mesh;
      behind.entity.transform.setPosition(0, -0.3, 0);
      behind.setMaterial(behindMaterial);
      if (shared) {
        // Keep refraction from exposing a legitimate reflection on the rear draw.
        f.material.transmissionTexture = f.texture([0, 0, 0, 255]);
        f.renderer._maskInteraction = SpriteMaskInteraction.VisibleOutsideMask;
      } else {
        custom = Shader.create(pbrSource.replace('Shader "PBR"', 'Shader "SSRTest/StencilTransmission"'))!;
        f.material.shader = custom;
        const forward = custom.subShaders[0].passes.find((pass) => pass.getTagValue("pipelineStage") === "Forward")!;
        const stencil = forward._renderState.stencilState;
        stencil.enabled = true;
        stencil.compareFunctionFront = stencil.compareFunctionBack = CompareFunction.Always;
        stencil.passOperationFront = stencil.passOperationBack = StencilOperation.IncrementSaturate;
      }
      const off = shared
        ? (() => {
            f.scene.screenSpaceReflection.activationMode = Activation.ForceOff;
            const result = f.render();
            f.scene.screenSpaceReflection.activationMode = Activation.ForceOn;
            return result;
          })()
        : (() => {
            f.material.screenSpaceReflection = { mode: "Off", intensity: 1 };
            return f.render();
          })();
      f.material.screenSpaceReflection = { mode: "On", intensity: 1 };
      const rejected = f.render();
      expect(rejected.metrics.maskedReceiverElementCount).toBe(1);
      expect(rejected.metrics.transparentSurfacePassDrawCount).toBe(1);
      let hits = 0;
      for (let i = 3; i < rejected.trace.length; i += 4) if (rejected.trace[i] > 0.01) hits++;
      expect(hits).toBeGreaterThan(10);
      expect(maxByteDelta(rejected.pixels, off.pixels)).toBeLessThanOrEqual(1);
      if (shared) {
        f.renderer._maskInteraction = SpriteMaskInteraction.None;
      } else {
        custom!.subShaders[0].passes.find(
          (pass) => pass.getTagValue("pipelineStage") === "Forward"
        )!._renderState.stencilState.enabled = false;
      }
      const accepted = f.render();
      expect(accepted.metrics.maskedReceiverElementCount).toBe(0);
      expect(maxByteDelta(accepted.pixels, off.pixels)).toBeGreaterThan(2);
    } finally {
      f.destroy();
      if (!shared) behindMaterial.destroy();
      mesh.destroy();
      custom?.destroy();
    }
  }
);

it("preserves full sampler-budget Transmission and only adds SSR when a unit is available", () => {
  const f = fixture();
  const macros = new ShaderMacroCollection();
  const names = [
    "MATERIAL_ENABLE_TRANSMISSION",
    "MATERIAL_HAS_TRANSMISSION_TEXTURE",
    "MATERIAL_HAS_THICKNESS",
    "MATERIAL_HAS_THICKNESS_TEXTURE",
    "MATERIAL_HAS_BASETEXTURE",
    "MATERIAL_HAS_NORMALTEXTURE",
    "MATERIAL_HAS_EMISSIVETEXTURE",
    "MATERIAL_HAS_ROUGHNESS_METALLIC_TEXTURE",
    "MATERIAL_HAS_OCCLUSION_TEXTURE",
    "MATERIAL_HAS_SPECULAR_TEXTURE",
    "MATERIAL_HAS_SPECULAR_COLOR_TEXTURE",
    "RENDERER_HAS_NORMAL",
    "SCENE_USE_SPECULAR_ENV",
    "SCENE_USE_SPECULAR_ENV_BLEND",
    "SCENE_USE_PROBE_VOLUME"
  ];
  const ssrMacro = ShaderMacro.getByName("RENDERER_ENABLE_TRANSMISSION_SSR");
  const forward = Shader.find("PBR")!.subShaders[0].passes.find(
    (pass) => pass.getTagValue("pipelineStage") === "Forward"
  )!;
  const pipeline = (
    f.camera as unknown as {
      _renderPipeline: {
        _cullingResults: { transparentQueue: { batchedElements: { material: Material }[] } };
        _resolveTransparentShaderProgram(
          element: unknown,
          pass: ShaderPass,
          macros: ShaderMacroCollection
        ): ReturnType<ShaderPass["_getShaderProgram"]>;
      };
    }
  )._renderPipeline;
  try {
    f.material.transmission = 0.65;
    f.material.screenSpaceReflection = { mode: "On", intensity: 1 };
    f.render();
    const element = pipeline._cullingResults.transparentQueue.batchedElements.find(
      (element) => element.material === f.material
    )!;
    expect(element).toBeDefined();
    names.forEach((name) => macros.enable(ShaderMacro.getByName(name)));
    const base = forward._getShaderProgram(engine, macros);
    expect(base.isValid).toBe(true);
    expect(base.textureUnitCount).toBe(16);
    const gl = engine._hardwareRenderer.gl;
    const limit = gl.getParameter(gl.MAX_TEXTURE_IMAGE_UNITS);
    f.camera.shaderData.setFloat("camera_ScreenSpaceReflectionMaxRoughness", 0.6);
    const atBudget = pipeline._resolveTransparentShaderProgram(element, forward, macros);
    expect(atBudget.isValid).toBe(true);
    expect(atBudget.textureUnitCount).toBe(limit === 16 ? 16 : 17);
    if (limit === 16) expect(atBudget).toBe(base);
    expect(macros.isEnable(ssrMacro)).toBe(false);
    // A real linked 15-sampler Forward has room for exactly one SSR texture.
    macros.disable(ShaderMacro.getByName("MATERIAL_HAS_OCCLUSION_TEXTURE"));
    const withRoom = pipeline._resolveTransparentShaderProgram(element, forward, macros);
    expect(withRoom.isValid).toBe(true);
    expect(withRoom.textureUnitCount).toBe(16);
    expect(macros.isEnable(ssrMacro)).toBe(false);
    expect(pipeline._resolveTransparentShaderProgram(element, forward, macros)).toBe(withRoom);
    f.material.screenSpaceReflection = { mode: "Off", intensity: 1 };
    // Re-render clears the camera-local material eligibility cache.
    f.render();
    f.camera.shaderData.setFloat("camera_ScreenSpaceReflectionMaxRoughness", 0.6);
    expect(pipeline._resolveTransparentShaderProgram(element, forward, macros).textureUnitCount).toBe(15);
    f.material.screenSpaceReflection = { mode: "On", intensity: 1 };
    f.scene.screenSpaceReflection.activationMode = Activation.ForceOff;
    f.render();
    expect(pipeline._resolveTransparentShaderProgram(element, forward, macros).textureUnitCount).toBe(15);
    expect(macros.isEnable(ssrMacro)).toBe(false);
  } finally {
    f.destroy();
  }
});

it("keeps a shared Transmission material camera-local in either render order", () => {
  const f = fixture();
  const output = new Texture2D(engine, SIZE, SIZE, TextureFormat.R8G8B8A8, false, false);
  const target = new RenderTarget(engine, SIZE, SIZE, output, TextureFormat.Depth24);
  const camera = f.scene.createRootEntity().addComponent(Camera);
  camera.enableHDR = false;
  camera.opaqueTextureEnabled = true;
  camera.renderTarget = target;
  camera.entity.transform.setPosition(0, 1.2, 6);
  camera.entity.transform.lookAt(new Vector3());
  camera.priority = 1;
  camera.screenSpaceReflection.receiverPolicy = Policy.ExplicitOnly;
  const pass = (camera as unknown as { _renderPipeline: { _screenSpaceReflectionPass: PassInternals } })._renderPipeline
    ._screenSpaceReflectionPass;
  const publish = pass.publish;
  const mock = f.texture([255, 0, 0, 255]);
  pass.publish = function () {
    publish.call(this);
    camera.shaderData.setTexture("camera_ScreenSpaceReflectionTexture", mock);
  };
  const control = new PBRMaterial(engine);
  const mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
  const renderer = f.scene.createRootEntity().addComponent(MeshRenderer);
  renderer.mesh = mesh;
  renderer.entity.transform.setPosition(3, 0.5, 0);
  renderer.setMaterial(control);
  control.transmission = 0.5;
  control.screenSpaceReflection = { mode: "On", intensity: 1 };
  try {
    f.material.transmission = 0.65;
    f.material.screenSpaceReflection = { mode: "Auto", intensity: 1 };
    f.scene.screenSpaceReflection.activationMode = Activation.ForceOff;
    camera.screenSpaceReflection.activationMode = Activation.ForceOff;
    const off = f.render();
    const reference = new Uint8Array(SIZE * SIZE * 4);
    output.getPixelBuffer(0, 0, SIZE, SIZE, 0, reference);
    f.scene.screenSpaceReflection.activationMode = Activation.ForceOn;
    camera.screenSpaceReflection.activationMode = Activation.ForceOn;
    for (const priority of [0, 2]) {
      f.camera.priority = priority;
      const on = f.render([255, 0, 0, 255]);
      expect(maxByteDelta(on.pixels, off.pixels)).toBeGreaterThan(2);
      const pixels = new Uint8Array(reference.length);
      output.getPixelBuffer(0, 0, SIZE, SIZE, 0, pixels);
      // The explicitly enabled control may change; the Auto floor's center must not.
      const point = camera.worldToScreenPoint(new Vector3(), new Vector3());
      const offset = ((SIZE - 1 - Math.floor(point.y)) * SIZE + Math.floor(point.x)) * 4;
      expect(maxByteDelta(pixels.slice(offset, offset + 4), reference.slice(offset, offset + 4))).toBeLessThanOrEqual(
        1
      );
      expect(camera.screenSpaceReflection.metrics.transparentSurfacePassDrawCount).toBe(1);
      expect(
        f.material.shaderData._macroCollection.isEnable(ShaderMacro.getByName("RENDERER_ENABLE_TRANSMISSION_SSR"))
      ).toBe(false);
    }
  } finally {
    pass.publish = publish;
    f.destroy();
    target.destroy();
    output.destroy();
    control.destroy();
    mesh.destroy();
  }
});

it("does not trust a namesake custom V3 Surface or invalidate existing PBR materials", () => {
  const builtin = Shader.find("Pipeline/ScreenSpaceReflectionSurface")!;
  const original = new PBRMaterial(engine);
  const shader = Shader.create(
    legacySource.replaceAll("ColorResponseV2", "ColorResponseV3").replace("SSRTest/LegacyViewNormalV2", builtin.name)
  )!;
  const custom = new Material(engine, shader);
  const createdDuringCollision = new PBRMaterial(engine);
  const macros = ["CLEAR_COAT", "SHEEN", "ANISOTROPY", "IRIDESCENCE", "TRANSMISSION"];
  try {
    expect(Shader.find(builtin.name)).toBe(shader);
    expect(SSR.getMaterialReceiverCapability(custom).supported).toBe(true);
    for (const extension of macros) {
      const macro = `MATERIAL_ENABLE_${extension}`;
      for (const material of [original, createdDuringCollision, custom]) material.shaderData.enableMacro(macro);
      expect(SSR.getMaterialReceiverCapability(original).supported).toBe(true);
      expect(SSR.getMaterialReceiverCapability(createdDuringCollision).supported).toBe(true);
      expect(SSR.getMaterialReceiverCapability(custom).supported).toBe(false);
      for (const material of [original, createdDuringCollision, custom]) material.shaderData.disableMacro(macro);
    }
  } finally {
    original.destroy();
    createdDuringCollision.destroy();
    custom.destroy();
    shader.destroy();
  }
  expect(Shader.find(builtin.name)).toBe(builtin);
});

it.each(["clearCoat", "sheen", "anisotropy", "iridescence", "transmission"] as const)(
  "preserves real %s SSR through namesake Surface registration and destruction",
  (feature) => {
    const f = fixture();
    let namesake: Shader | undefined;
    try {
      if (feature === "sheen") f.material.sheenColor.set(0.8, 0.4, 0.2, 1);
      else f.material[feature] = 0.8;
      f.scene.screenSpaceReflection.activationMode = Activation.ForceOff;
      const off = f.render();
      f.scene.screenSpaceReflection.activationMode = Activation.ForceOn;
      const before = f.render();
      expect(before.metrics.tracePassCount).toBe(1);
      let hits = 0;
      for (let i = 3; i < before.trace.length; i += 4) if (before.trace[i] > 0.01) hits++;
      expect(hits).toBeGreaterThan(10);
      expect(maxByteDelta(before.pixels, off.pixels)).toBeGreaterThan(2);
      const actualPass = f.material.shader.subShaders[0].passes.find(
        (pass) => pass.getTagValue("pipelineStage") === "ScreenSpaceReflectionSurface"
      );
      namesake = Shader.create(surfaceSource)!;
      expect(namesake.subShaders[0].passes[0]).not.toBe(actualPass);
      const during = f.render();
      expect(SSR.getMaterialReceiverCapability(f.material).supported).toBe(true);
      expect(during.metrics.surfacePassDrawCount).toBe(1);
      expect(during.metrics.tracePassCount).toBe(1);
      expect(maxByteDelta(before.pixels, during.pixels)).toBeLessThanOrEqual(1);
      namesake.destroy();
      const after = f.render();
      expect(after.metrics.tracePassCount).toBe(1);
      expect(maxByteDelta(before.pixels, after.pixels)).toBeLessThanOrEqual(1);
    } finally {
      namesake?.destroy();
      f.destroy();
    }
  }
);

it("retains both generations of trusted PBR Surfaces through built-in re-registration and owner destruction", () => {
  const f = fixture();
  const originalBuiltins = Engine._builtinShaders;
  const created: Shader[] = [];
  const originalCreate = Shader._createFromPrecompiled;
  const registration = vi.spyOn(Shader, "_createFromPrecompiled").mockImplementation((data) => {
    const shader = originalCreate.call(Shader, data);
    created.push(shader);
    return shader;
  });
  let newer: PBRMaterial | undefined;
  try {
    f.material.clearCoat = 0.8;
    const before = f.render();
    expect(before.metrics.tracePassCount).toBe(1);
    const originalPass = f.material.shader.subShaders[0].passes.find(
      (pass) => pass.getTagValue("pipelineStage") === "ScreenSpaceReflectionSurface"
    );
    Engine._builtinShaders = ShaderPool.createShaders();
    registration.mockRestore();
    newer = new PBRMaterial(engine);
    newer.clearCoat = f.material.clearCoat;
    newer.roughness = f.material.roughness;
    newer.metallic = f.material.metallic;
    newer.screenSpaceReflection = { mode: "Auto", intensity: 1 };
    const newerOwner = created.find((shader) => shader.name === "Pipeline/ScreenSpaceReflectionSurface")!;
    expect(newerOwner).toBeDefined();
    expect(newer.shader.subShaders[0].passes).toContain(newerOwner.subShaders[0].passes[0]);
    expect(newerOwner.subShaders[0].passes[0]).not.toBe(originalPass);
    expect(SSR.getMaterialReceiverCapability(f.material).supported).toBe(true);
    expect(SSR.getMaterialReceiverCapability(newer).supported).toBe(true);
    expect(maxByteDelta(before.pixels, f.render().pixels)).toBeLessThanOrEqual(1);
    f.renderer.setMaterial(newer);
    const newerImage = f.render();
    expect(newerImage.metrics.tracePassCount).toBe(1);
    expect(maxByteDelta(before.pixels, newerImage.pixels)).toBeLessThanOrEqual(1);
    // A UsePass still owns the trusted pass identity after its source Shader is removed.
    expect(newerOwner.destroy()).toBe(true);
    expect(SSR.getMaterialReceiverCapability(newer).supported).toBe(true);
    const afterOwnerRemoval = f.render();
    expect(afterOwnerRemoval.metrics.tracePassCount).toBe(1);
    expect(maxByteDelta(newerImage.pixels, afterOwnerRemoval.pixels)).toBeLessThanOrEqual(1);
  } finally {
    registration.mockRestore();
    Engine._builtinShaders = originalBuiltins;
    f.renderer.setMaterial(f.material);
    newer?.destroy();
    for (let i = created.length - 1; i >= 0; i--) expect(created[i].destroy()).toBe(true);
    f.destroy();
  }
});
