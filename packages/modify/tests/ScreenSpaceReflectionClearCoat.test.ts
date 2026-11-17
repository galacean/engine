import {
  Camera,
  FogMode,
  DirectLight,
  GLCapabilityType,
  Material,
  MeshRenderer,
  PBRMaterial,
  PrimitiveMesh,
  RenderQueueType,
  RenderTarget,
  Scene,
  Shader,
  ShaderLanguage,
  ScreenSpaceReflection as SSR,
  ScreenSpaceReflectionActivationMode as Activation,
  ScreenSpaceReflectionReceiverPolicy as Policy,
  ScreenSpaceReflectionUpsamplingMode as Upsampling,
  Texture2D,
  TextureCube,
  TextureCubeFace,
  TextureFormat,
  TextureFilterMode,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { afterAll, beforeAll, expect, it } from "vitest";
import { readTraceTarget } from "./ScreenSpaceReflectionTraceReadback";
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
}

/** Read actual Surface MRTs; inject only radiance for isolated Composite replacement checks. */
function fixture(samples = 1) {
  const scene = new Scene(engine);
  engine.sceneManager.activeScene = scene;
  scene.screenSpaceReflection.apply({
    activationMode: Activation.ForceOn,
    receiverPolicy: Policy.StandardPbrAuto,
    maxRoughness: 0.6,
    resolutionScale: 1,
    upsamplingMode: Upsampling.Bilinear,
    edgeFade: 0
  });
  scene.ambientLight.diffuseIntensity = 0;
  const environment = new TextureCube(engine, 1, TextureFormat.R8G8B8A8, false);
  for (let face = 0; face < 6; face++) {
    environment.setPixelBuffer(face as TextureCubeFace, new Uint8Array([255, 255, 255, 255]));
  }
  scene.ambientLight.specularTexture = environment;
  const camera = scene.createRootEntity().addComponent(Camera);
  camera.enableHDR = false;
  camera.entity.transform.setPosition(0, 3, 6);
  camera.entity.transform.lookAt(new Vector3());
  const output = new Texture2D(engine, SIZE, SIZE, TextureFormat.R8G8B8A8, false, false);
  const target = new RenderTarget(engine, SIZE, SIZE, output, TextureFormat.Depth24, samples);
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
        (pass._surfaceTarget.getColorTexture(1) as Texture2D).getPixelBuffer(0, 0, SIZE, SIZE, 0, response);
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
  const textures: Texture2D[] = [];
  return {
    scene,
    camera,
    renderer,
    material,
    pass,
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
      scene.destroy();
      target.destroy();
      output.destroy();
      material.destroy();
      mesh.destroy();
      mockTrace.destroy();
      environment.destroy();
      textures.forEach((texture) => texture.destroy());
    }
  };
}

afterAll(() => engine.destroy());

it("accepts built-in Clear Coat for opaque / Alpha Test while excluding transparency and mixed effects", () => {
  const f = fixture();
  try {
    f.material.clearCoat = 1;
    f.camera.screenSpaceReflection._prepareSettings();
    expect(SSR.getMaterialReceiverCapability(f.material).supported).toBe(true);
    expect(f.camera.screenSpaceReflection._isMaterialReceiver(f.material, RenderQueueType.Opaque)).toBe(true);
    expect(f.camera.screenSpaceReflection._isMaterialReceiver(f.material, RenderQueueType.AlphaTest)).toBe(true);
    expect(f.camera.screenSpaceReflection._isMaterialReceiver(f.material, RenderQueueType.Transparent)).toBe(false);
    for (const macro of ["ANISOTROPY", "IRIDESCENCE", "SHEEN", "TRANSMISSION"]) {
      f.material.shaderData.enableMacro(`MATERIAL_ENABLE_${macro}`);
      expect(SSR.getMaterialReceiverCapability(f.material).supported).toBe(false);
      f.material.shaderData.disableMacro(`MATERIAL_ENABLE_${macro}`);
    }
  } finally {
    f.destroy();
  }
});

it.each([false, true])("keeps custom V3 layer reception disabled, including retired extension tags (%s)", (tagged) => {
  const shader = Shader.create(`Shader "Test/UnlayeredV3/${tagged}" { SubShader "Default" { Pass "Surface" {
    Tags { pipelineStage = "ScreenSpaceReflectionSurface", screenSpaceReflectionReceiver = "ColorResponseV3"
      ${tagged ? ', screenSpaceReflectionClearCoat = "SingleLayerV1", screenSpaceReflectionSheen = "BaseLayerV1"' : ""} }
    VertexShader = vert; FragmentShader = frag;
    struct Attributes { vec3 POSITION; };
    void vert(Attributes v) { gl_Position = vec4(v.POSITION, 1.0); }
    void frag() { gl_FragColor = vec4(1.0); }
  } } }`)!;
  const material = new Material(engine, shader);
  try {
    expect(SSR.getMaterialReceiverCapability(material).supported).toBe(true);
    for (const macro of ["CLEAR_COAT", "SHEEN"]) {
      material.shaderData.enableMacro(`MATERIAL_ENABLE_${macro}`);
      expect(SSR.getMaterialReceiverCapability(material).supported).toBe(false);
      material.shaderData.disableMacro(`MATERIAL_ENABLE_${macro}`);
    }
  } finally {
    material.destroy();
    shader.destroy();
  }
});

it("allows shared PBR UsePass reception without extension tags and rejects an additional custom Surface", () => {
  for (const customSurface of [false, true]) {
    const shader = Shader.create(`Shader "Test/SharedBaseSurface/${customSurface}" { SubShader "Default" {
      UsePass "Pipeline/ScreenSpaceReflectionSurface/Default/ScreenSpaceReflectionSurface"
      ${
        customSurface
          ? `Pass "CustomSurface" {
        Tags { pipelineStage = "ScreenSpaceReflectionSurface", screenSpaceReflectionReceiver = "ColorResponseV3" }
        VertexShader = vert; FragmentShader = frag;
        struct Attributes { vec3 POSITION; };
        void vert(Attributes v) { gl_Position = vec4(v.POSITION, 1.0); }
        void frag() { gl_FragColor = vec4(1.0); }
      }`
          : ""
      }
    } }`)!;
    const material = new Material(engine, shader);
    try {
      expect(SSR.getMaterialReceiverCapability(material).supported).toBe(true);
      for (const macro of ["CLEAR_COAT", "SHEEN"]) {
        material.shaderData.enableMacro(`MATERIAL_ENABLE_${macro}`);
        expect(SSR.getMaterialReceiverCapability(material).supported).toBe(!customSurface);
        material.shaderData.disableMacro(`MATERIAL_ENABLE_${macro}`);
      }
    } finally {
      material.destroy();
      shader.destroy();
    }
  }
});

it("compiles the common Surface with base / Clear Coat maps and both tangent paths", () => {
  const shader = Shader.create(
    surfaceSource.replace('Shader "Pipeline/ScreenSpaceReflectionSurface"', 'Shader "Test/BaseLayerSurface300"'),
    ShaderLanguage.GLSLES300
  )!;
  try {
    const maps = [
      "MATERIAL_ENABLE_CLEAR_COAT",
      "MATERIAL_HAS_CLEAR_COAT_TEXTURE",
      "MATERIAL_HAS_CLEAR_COAT_ROUGHNESS_TEXTURE",
      "MATERIAL_HAS_CLEAR_COAT_NORMAL_TEXTURE",
      "MATERIAL_HAS_NORMALTEXTURE"
    ];
    for (const geometry of [[], ["RENDERER_HAS_NORMAL"], ["RENDERER_HAS_NORMAL", "RENDERER_HAS_TANGENT"]]) {
      expect(shader.compileVariant(engine, [...maps, ...geometry])).toBe(true);
    }
  } finally {
    shader.destroy();
  }
});

it("keeps base geometry and a nonzero response throughout Clear Coat strength and normal changes", () => {
  const f = fixture();
  try {
    const base = f.render();
    f.material.clearCoatRoughness = 0.05;
    f.material.clearCoatNormalTexture = f.texture([200, 128, 230, 255]);
    for (const strength of [0.0001, 0.25, 0.5, 0.75, 1]) {
      f.material.clearCoat = strength;
      const coated = f.render();
      expect(coated.geometry).toEqual(base.geometry);
      expect(coated.response[3]).toBe(255);
      expect(coated.response[0]).toBeGreaterThan(0);
      expect(coated.surfaceFormats).toEqual([TextureFormat.R8G8B8A8, TextureFormat.R8G8B8A8]);
    }
  } finally {
    f.destroy();
  }
});

it("uses textured base roughness and base normal, independent of the Clear Coat maps", () => {
  const f = fixture();
  try {
    f.material.roughness = 1;
    f.material.roughnessMetallicTexture = f.texture([255, 26, 255, 255]);
    const base = f.render();
    expect(base.geometry[2]).toBeCloseTo(26, -1);
    f.material.clearCoat = 1;
    f.material.clearCoatRoughness = 1;
    f.material.clearCoatRoughnessTexture = f.texture([255, 13, 255, 255]);
    f.material.clearCoatNormalTexture = f.texture([200, 128, 230, 255]);
    const coated = f.render();
    expect(coated.geometry).toEqual(base.geometry);
    f.material.normalTexture = f.material.clearCoatNormalTexture;
    expect(f.render().geometry.slice(0, 2)).not.toEqual(base.geometry.slice(0, 2));
  } finally {
    f.destroy();
  }
});

it("rejects rough bases in Auto even with a smooth Clear Coat, and enforces the cutoff for explicit On", () => {
  const f = fixture();
  try {
    f.material.roughness = 1;
    f.material.clearCoat = 1;
    f.material.clearCoatRoughness = 0.05;
    const automatic = f.render();
    expect(automatic.metrics.surfacePassDrawCount).toBe(0);
    f.material.screenSpaceReflection = { mode: "On", intensity: 1 };
    const explicit = f.render([255, 0, 0, 255]);
    expect(explicit.metrics.surfacePassDrawCount).toBe(1);
    expect(explicit.geometry[2]).toBe(255);
    f.scene.screenSpaceReflection.activationMode = Activation.ForceOff;
    const forward = f.render();
    expect(maxByteDelta(automatic.pixels, forward.pixels)).toBeLessThanOrEqual(1);
    expect(maxByteDelta(explicit.pixels, forward.pixels)).toBeLessThanOrEqual(1);
    f.scene.screenSpaceReflection.activationMode = Activation.ForceOn;
    f.material.roughness = 0.2;
    for (const maxRoughness of [0.6, 0.05, 0.6]) {
      f.scene.screenSpaceReflection.maxRoughness = maxRoughness;
      const sample = f.render([255, 0, 0, 255]);
      expect(sample.metrics.surfacePassDrawCount).toBe(1);
      expect(f.camera.shaderData.getFloat("camera_ScreenSpaceReflectionMaxRoughness")).toBe(-1);
      if (maxRoughness === 0.05) {
        f.scene.screenSpaceReflection.activationMode = Activation.ForceOff;
        expect(maxByteDelta(sample.pixels, f.render().pixels)).toBeLessThanOrEqual(1);
        f.scene.screenSpaceReflection.activationMode = Activation.ForceOn;
      }
    }
  } finally {
    f.destroy();
  }
});

it.each([GLCapabilityType.colorBufferHalfFloat, GLCapabilityType.textureHalfFloat])(
  "retains Clear Coat SSR with RGBA8 Surface and Trace when half-float capability %s is absent",
  (missing) => {
    const f = fixture();
    const rhi = engine._hardwareRenderer;
    const canIUse = rhi.canIUse;
    rhi.canIUse = function (capability: GLCapabilityType) {
      return capability === missing ? false : canIUse.call(this, capability);
    };
    try {
      f.material.clearCoat = 1;
      expect(SSR.getMaterialReceiverCapability(f.material).supported).toBe(true);
      const rendered = f.render([255, 0, 0, 255]);
      expect(rendered.metrics.tracePassCount).toBe(1);
      expect(rendered.surfaceFormats).toEqual([TextureFormat.R8G8B8A8, TextureFormat.R8G8B8A8]);
      expect(rendered.traceFormat).toBe(TextureFormat.R8G8B8A8);
    } finally {
      rhi.canIUse = canIUse;
      f.destroy();
    }
  }
);

it("restores ordinary PBR for zero Clear Coat and zero strength texture", () => {
  const f = fixture();
  try {
    const plain = f.render([255, 0, 0, 255]);
    f.material.clearCoat = 1;
    f.material.clearCoatRoughness = 0.05;
    f.material.clearCoatNormalTexture = f.texture([200, 128, 230, 255]);
    f.material.clearCoatTexture = f.texture([0, 255, 255, 255]);
    const zero = f.render([255, 0, 0, 255]);
    expect(zero.geometry).toEqual(plain.geometry);
    expect(maxByteDelta(zero.pixels, plain.pixels)).toBeLessThanOrEqual(1);
    f.material.clearCoatTexture = null;
    f.material.clearCoat = 0;
    expect(maxByteDelta(f.render([255, 0, 0, 255]).pixels, plain.pixels)).toBeLessThanOrEqual(1);
  } finally {
    f.destroy();
  }
});

it.each([1, 4])(
  "replaces only base IBL, preserving Clear Coat / direct / diffuse / emissive and fallback (MSAA=%s)",
  (samples) => {
    const f = fixture(samples);
    try {
      f.scene.ambientLight.specularIntensity = 0.25;
      f.scene.ambientLight.diffuseIntensity = 0.05;
      const light = f.scene.createRootEntity().addComponent(DirectLight);
      light.intensity = 0.2;
      light.entity.transform.setRotation(-30, 30, 0);
      f.material.baseColor.set(0.3, 0.2, 0.1, 1);
      f.material.emissiveColor.set(0.05, 0.02, 0.01, 1);
      f.material.clearCoat = 1;
      f.material.clearCoatNormalTexture = f.texture([200, 128, 230, 255]);
      for (const coatRoughness of [0.05, 0.8]) {
        f.material.clearCoatRoughness = coatRoughness;
        f.scene.screenSpaceReflection.activationMode = Activation.ForceOff;
        const forward = f.render();
        f.scene.screenSpaceReflection.activationMode = Activation.ForceOn;
        const on = f.render([255, 0, 0, 255]);
        expect(on.geometry[3]).toBe(255);
        for (let c = 0; c < 3; c++) {
          const expected = forward.color[c] + ((c === 0 ? 1 : 0) - 0.25) * on.response[c];
          expect(Math.abs(on.color[c] - expected)).toBeLessThanOrEqual(2);
        }
        expect(on.color[0]).toBeGreaterThan(forward.color[0]);
        expect(on.color[1]).toBeLessThan(forward.color[1]);
        expect(maxByteDelta(f.render([0, 0, 0, 0]).pixels, forward.pixels)).toBeLessThanOrEqual(1);
        f.material.screenSpaceReflection = { mode: "Auto", intensity: 0 };
        expect(maxByteDelta(f.render().pixels, forward.pixels)).toBeLessThanOrEqual(1);
        f.material.screenSpaceReflection = { mode: "Auto", intensity: 1 };
        f.scene.screenSpaceReflection.intensity = 0;
        expect(maxByteDelta(f.render().pixels, forward.pixels)).toBeLessThanOrEqual(1);
        f.scene.screenSpaceReflection.intensity = 1;
      }
      f.material.alphaCutoff = 0.5;
      f.material.baseTexture = f.texture([255, 255, 255, 0]);
      expect(f.render().geometry[3]).toBe(0);
      f.material.baseTexture = null;
      expect(f.render().geometry[3]).toBe(255);
    } finally {
      f.destroy();
    }
  }
);

it("applies Forward Clear Coat attenuation once and applies AO / fog only to the correction", () => {
  const f = fixture();
  try {
    f.material.metallic = 1;
    f.material.baseColor.set(0.2, 0.3, 0.4, 1);
    const base = f.render([255, 0, 0, 255]);
    f.scene.screenSpaceReflection.activationMode = Activation.ForceOff;
    const baseForward = f.render();
    f.material.clearCoat = 0.25;
    const coatForward = f.render();
    f.scene.screenSpaceReflection.activationMode = Activation.ForceOn;
    const coated = f.render([255, 0, 0, 255]);
    const dotNV = 3 / Math.hypot(3, 6);
    const attenuation = 1 - 0.25 * (0.04 + 0.96 * (1 - dotNV) ** 5);
    for (let c = 0; c < 3; c++) {
      expect(Math.abs(coated.response[c] - base.response[c] * attenuation)).toBeLessThanOrEqual(1);
      const expectedCorrection = (base.color[c] - baseForward.color[c]) * attenuation;
      expect(Math.abs(coated.color[c] - coatForward.color[c] - expectedCorrection)).toBeLessThanOrEqual(2);
    }
    f.material.occlusionTexture = f.texture([0, 0, 0, 255]);
    expect(f.render().response[0]).toBeLessThan(coated.response[0]);
    f.material.occlusionTexture = null;
    f.scene.fogMode = FogMode.Exponential;
    f.scene.fogDensity = 0.2;
    expect(f.render().response[0]).toBeLessThan(coated.response[0]);
    const miss = f.render([0, 0, 0, 0]);
    f.scene.screenSpaceReflection.activationMode = Activation.ForceOff;
    expect(maxByteDelta(miss.pixels, f.render().pixels)).toBeLessThanOrEqual(1);
  } finally {
    f.destroy();
  }
});

it.each([
  [1, Upsampling.Bilinear],
  [0.5, Upsampling.Bilateral],
  [0.5, Upsampling.GaussianBilateral],
  [0.25, Upsampling.Bilinear]
])(
  "renders real Clear Coat base SSR without selection fade or extra resources at scale %s / mode %s",
  (scale, upsamplingMode) => {
    const f = fixture();
    const emissive = new PBRMaterial(engine);
    const panelMesh = PrimitiveMesh.createPlane(engine, 4.5, 2);
    try {
      f.scene.ambientLight.specularIntensity = 0.05;
      f.scene.screenSpaceReflection.apply({
        resolutionScale: scale,
        upsamplingMode,
        maxRaySteps: 64,
        maxRayDistance: 40,
        thickness: 0.5
      });
      f.camera.entity.transform.setPosition(0, 1.2, 6);
      f.camera.entity.transform.lookAt(new Vector3(0, 0.4, 0));
      f.material.roughness = 0.1;
      const panel = f.scene.createRootEntity().addComponent(MeshRenderer);
      panel.mesh = panelMesh;
      panel.entity.transform.setPosition(0, 1.2, -1);
      panel.entity.transform.setRotation(90, 0, 0);
      emissive.baseColor.set(0, 0, 0, 1);
      emissive.emissiveColor.set(1, 0, 0, 1);
      emissive.screenSpaceReflection = { mode: "Off", intensity: 0 };
      panel.setMaterial(emissive);
      const plain = f.render();
      f.material.clearCoat = 1;
      f.material.clearCoatRoughness = 0.05;
      f.material.clearCoatNormalTexture = f.texture([200, 128, 230, 255]);
      const on = f.render();
      expect(on.surface).toEqual(plain.surface);
      expect(on.surfaceFormats).toEqual([TextureFormat.R8G8B8A8, TextureFormat.R8G8B8A8]);
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
      ] as const) {
        expect(on.metrics[key], key).toBe(plain.metrics[key]);
      }
      expect(on.metrics).toMatchObject({ surfacePassDrawCount: 1, tracePassCount: 1, compositePassCount: 1 });
      let hits = 0;
      for (let i = 3; i < on.trace.length; i += 4) {
        expect(on.trace[i]).toBe(plain.trace[i]);
        if (on.trace[i] > 0.01) hits++;
      }
      expect(hits).toBeGreaterThan(10);
      f.scene.screenSpaceReflection.activationMode = Activation.ForceOff;
      const off = f.render();
      let reflected = 0;
      for (let i = 0; i < on.pixels.length; i += 4) if (on.pixels[i] - off.pixels[i] > 2) reflected++;
      expect(reflected).toBeGreaterThan(20);
      console.info(
        JSON.stringify({ scale, upsamplingMode, hits, reflected, estimatedBytes: on.metrics.estimatedBytes })
      );
    } finally {
      f.destroy();
      emissive.destroy();
      panelMesh.destroy();
    }
  }
);
