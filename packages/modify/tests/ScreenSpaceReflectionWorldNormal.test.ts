import {
  AssetType,
  Camera,
  Color,
  Material,
  Matrix,
  MeshRenderer,
  PBRMaterial,
  PrimitiveMesh,
  RenderTarget,
  Scene,
  ScreenSpaceReflectionActivationMode as Activation,
  ScreenSpaceReflectionDebugMode as Debug,
  ScreenSpaceReflectionReceiverPolicy as Policy,
  ScreenSpaceReflectionUpsamplingMode as Upsampling,
  Texture2D,
  TextureFormat,
  Vector2,
  Vector3,
  Vector4,
  WebGLEngine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { afterAll, beforeAll, expect, it } from "vitest";
import { readTraceTarget } from "./ScreenSpaceReflectionTraceReadback";
import { registerWaterBuiltinShaders } from "../../water/src/water/native/WaterBuiltinShaders";
import { createWaterMaterialDefaults } from "../../water/src/water/native/WaterMaterial";

const SIZE = 512;
const FRAMES = 41;
const STEP_DEGREES = 0.1;
const MAX_NORMAL_ERROR_DEGREES = 1;
let engine: WebGLEngine;

beforeAll(async () => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  engine = await WebGLEngine.create({ canvas, shaderCompiler: new ShaderCompiler() });
  const gl = engine._hardwareRenderer.gl;
  const info = gl.getExtension("WEBGL_debug_renderer_info");
  console.info(JSON.stringify({ renderer: info && gl.getParameter(info.UNMASKED_RENDERER_WEBGL) }));
});
afterAll(() => engine.destroy());

function decodeNormal(r: number, g: number): Vector3 {
  let x = (r / 255) * 2 - 1;
  let y = (g / 255) * 2 - 1;
  const z = 1 - Math.abs(x) - Math.abs(y);
  if (z < 0) {
    const oldX = x;
    x = (1 - Math.abs(y)) * (oldX >= 0 ? 1 : -1);
    y = (1 - Math.abs(oldX)) * (y >= 0 ? 1 : -1);
  }
  return new Vector3(x, y, z).normalize();
}

function angle(a: Vector3, b: Vector3): number {
  return (Math.acos(Math.min(1, Math.max(-1, Vector3.dot(a, b)))) * 180) / Math.PI;
}

function transformNormal(normal: Vector3, matrix: Readonly<Matrix>): Vector3 {
  const result = new Vector3();
  Vector3.transformNormal(normal, matrix, result);
  return result.normalize();
}

function fixture(material?: Material) {
  const scene = new Scene(engine);
  engine.sceneManager.activeScene = scene;
  scene.background.solidColor = new Color(0, 0, 0, 1);
  scene.screenSpaceReflection.apply({
    activationMode: Activation.ForceOn,
    receiverPolicy: Policy.ExplicitOnly,
    resolutionScale: 1,
    upsamplingMode: Upsampling.GaussianBilateral,
    edgeFade: 0,
    maxRaySteps: 64,
    hitRefinementSteps: 5,
    thickness: 0.25,
    maxRayDistance: 35
  });
  const camera = scene.createRootEntity("camera").addComponent(Camera);
  camera.entity.transform.setPosition(0, 1.2, 6);
  camera.fieldOfView = 45;
  camera.enableHDR = false;
  const output = new Texture2D(engine, SIZE, SIZE, TextureFormat.R8G8B8A8, false, false);
  const target = new RenderTarget(engine, SIZE, SIZE, output, TextureFormat.Depth24);
  camera.renderTarget = target;
  const receiver = scene.createRootEntity("mirror").addComponent(MeshRenderer);
  const mesh = PrimitiveMesh.createPlane(engine, 30, 30, 1, 1, false);
  receiver.mesh = mesh;
  const mirror = material ?? new PBRMaterial(engine);
  if (mirror instanceof PBRMaterial) {
    mirror.roughness = 0;
    mirror.metallic = 1;
  }
  mirror.screenSpaceReflection = { mode: "On", intensity: 1 };
  receiver.setMaterial(mirror);
  const pass = (
    camera as unknown as {
      _renderPipeline: { _screenSpaceReflectionPass: { _surfaceTarget: RenderTarget; _traceTarget: RenderTarget } };
    }
  )._renderPipeline._screenSpaceReflectionPass;
  let surface = new Uint8Array(SIZE * SIZE * 4);
  let trace = new Float32Array(0);
  let readTrace = false;
  camera.screenSpaceReflection.profiler = {
    beginSample(stage) {
      if (stage === "trace") {
        const texture = pass._surfaceTarget.getColorTexture(0) as Texture2D;
        expect(texture.format).toBe(TextureFormat.R8G8B8A8);
        expect(pass._surfaceTarget.getColorTexture(1)!.format).toBe(TextureFormat.R8G8B8A8);
        texture.getPixelBuffer(0, 0, SIZE, SIZE, 0, surface);
      } else if (stage === "composite" && readTrace) {
        trace = readTraceTarget(pass._traceTarget, SIZE);
      }
    },
    endSample() {}
  };
  return {
    scene,
    camera,
    receiver,
    mirror,
    mesh,
    render() {
      engine.update();
      expect(camera.screenSpaceReflection.metrics.effective).toBe(true);
      expect(engine._hardwareRenderer.gl.getError()).toBe(0);
    },
    sample() {
      const point = camera.worldToScreenPoint(new Vector3(), new Vector3());
      const x = Math.floor(point.x);
      const y = SIZE - 1 - Math.floor(point.y);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(SIZE);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(SIZE);
      const offset = (y * SIZE + x) * 4;
      expect(surface[offset + 3]).toBe(255);
      return { bytes: Array.from(surface.slice(offset, offset + 4)), offset };
    },
    debugPixel(offset: number) {
      const pixels = new Uint8Array(SIZE * SIZE * 4);
      output.getPixelBuffer(0, 0, SIZE, SIZE, 0, pixels);
      return Array.from(pixels.slice(offset, offset + 3));
    },
    trace() {
      readTrace = true;
      this.render();
      return trace;
    },
    destroy() {
      camera.screenSpaceReflection.profiler = null;
      scene.destroy();
      target.destroy();
      output.destroy();
      mirror.destroy();
    }
  };
}

it.each(["pitch", "yaw", "roll"] as const)(
  "keeps fixed world normals stable through slow camera %s on a floor and a slope",
  (axis) => {
    const context = fixture();
    try {
      const report = [];
      for (const slope of [false, true]) {
        context.receiver.entity.transform.setRotation(slope ? 23 : 0, slope ? 17 : 0, slope ? 11 : 0);
        const expected = transformNormal(new Vector3(0, 1, 0), context.receiver.entity.transform.worldMatrix);
        const codes = new Set<string>();
        let maxError = 0;
        let maxDebugError = 0;
        context.camera.screenSpaceReflection.debugMode = Debug.ReceiverNormal;
        for (let frame = 0; frame < FRAMES; frame++) {
          const delta = (frame - (FRAMES - 1) / 2) * STEP_DEGREES;
          context.camera.entity.transform.setRotation(
            -14 + (axis === "pitch" ? delta : 0),
            axis === "yaw" ? delta : 0,
            axis === "roll" ? delta : 0
          );
          context.render();
          const { bytes, offset } = context.sample();
          codes.add(bytes.slice(0, 2).join(","));
          const normal = decodeNormal(bytes[0], bytes[1]);
          maxError = Math.max(maxError, angle(normal, expected));
          // Debug keeps its existing view-space color meaning after the storage changes to world space.
          const viewNormal = transformNormal(normal, context.camera.viewMatrix);
          const expectedColor = [viewNormal.x, viewNormal.y, viewNormal.z].map((v) => (v * 0.5 + 0.5) * 255);
          const debug = context.debugPixel(offset);
          if (frame === 0 || frame === FRAMES - 1) {
            maxDebugError = Math.max(maxDebugError, ...debug.map((v, i) => Math.abs(v - expectedColor[i])));
          }
        }
        report.push({ slope, codes: [...codes], maxError, maxDebugError });
      }
      console.info(JSON.stringify({ axis, report }));
      for (const { slope, codes, maxError, maxDebugError } of report) {
        expect(
          codes,
          `${axis}, slope=${slope}: a static normal must not cross camera-driven quantization bins`
        ).toHaveLength(1);
        expect(maxError).toBeLessThan(MAX_NORMAL_ERROR_DEGREES);
        expect(maxDebugError).toBeLessThanOrEqual(2);
      }
    } finally {
      context.destroy();
    }
  },
  60000
);

it("updates actual surface normals while retaining the oct8 angular precision boundary", () => {
  const context = fixture();
  try {
    context.camera.entity.transform.setRotation(-14, 0, 0);
    const codes = new Set<string>();
    let maxError = 0;
    for (let frame = 0; frame < 17; frame++) {
      context.receiver.entity.transform.setRotation(15 + frame * 0.5, 17, 11);
      context.render();
      const { bytes } = context.sample();
      const expected = transformNormal(new Vector3(0, 1, 0), context.receiver.entity.transform.worldMatrix);
      maxError = Math.max(maxError, angle(decodeNormal(bytes[0], bytes[1]), expected));
      codes.add(bytes.slice(0, 2).join(","));
    }
    console.info(JSON.stringify({ changingNormals: { codes: codes.size, maxError } }));
    expect(codes.size).toBeGreaterThan(8);
    expect(maxError).toBeLessThan(MAX_NORMAL_ERROR_DEGREES);
  } finally {
    context.destroy();
  }
});

it.each(["lake", "river"] as const)(
  "writes world normals from the shipped %s Surface program",
  async (profile) => {
    registerWaterBuiltinShaders();
    const material = await engine.resourceManager.load<Material>({
      type: AssetType.Material,
      url: "data:application/json," + encodeURIComponent(JSON.stringify(createWaterMaterialDefaults(profile)))
    });
    const localMap = new Texture2D(engine, 1, 1, TextureFormat.R8G8B8A8, false, false);
    localMap.setPixelBuffer(new Uint8Array([128, 128, 128, 255]));
    material.shaderData.setTexture("material_LocalMapTexture", localMap);
    material.shaderData.setVector4("material_LocalMapDecode", new Vector4(1, 1, 8, 0));
    // Keep the producer's actual geometry/normal math; freeze its optional wave/detail inputs.
    for (const name of [
      "material_WaveStrength",
      "material_WavesEnabled",
      "material_MicroNormalsEnabled",
      "material_MacroDisplacementEnabled",
      "material_MicroSurfaceEnabled",
      "material_FlowNormalStrength",
      "material_AppearanceV2DetailEnabled",
      "material_RainRippleIntensity"
    ])
      material.shaderData.setFloat(name, 0);
    material.shaderData.setFloat("material_SurfaceTimeOverride", 0);
    const context = fixture(material);
    // River's mesh attributes carry width/depth/current independently of its material.
    for (let channel = 1; channel <= 5; channel++) {
      const value = channel === 3 ? new Vector2(100, 2) : new Vector2();
      context.mesh.setUVs(
        Array.from({ length: context.mesh.vertexCount }, () => value.clone()),
        channel
      );
    }
    context.mesh.uploadData(false);
    try {
      for (const slope of [false, true]) {
        context.receiver.entity.transform.setRotation(slope ? 23 : 0, slope ? 17 : 0, slope ? 11 : 0);
        const expected = transformNormal(new Vector3(0, 1, 0), context.receiver.entity.transform.worldMatrix);
        const codes = new Set<string>();
        let maxError = 0;
        for (let frame = 0; frame < FRAMES; frame++) {
          context.camera.entity.transform.setRotation(
            -12 - frame * STEP_DEGREES,
            frame * STEP_DEGREES,
            frame * STEP_DEGREES
          );
          context.render();
          expect(context.camera.screenSpaceReflection.metrics.transparentSurfacePassDrawCount).toBeGreaterThan(0);
          const { bytes } = context.sample();
          codes.add(bytes.slice(0, 2).join(","));
          maxError = Math.max(maxError, angle(decodeNormal(bytes[0], bytes[1]), expected));
        }
        console.info(JSON.stringify({ profile, slope, codes: [...codes], maxError }));
        expect(codes.size).toBe(1);
        expect(maxError).toBeLessThan(MAX_NORMAL_ERROR_DEGREES);
      }
    } finally {
      context.destroy();
      localMap.destroy();
    }
  },
  60000
);

it("moves the traced floor reflection smoothly during a slow stationary camera pitch", () => {
  const context = fixture();
  const panel = context.scene.createRootEntity("reflected-panel").addComponent(MeshRenderer);
  panel.mesh = PrimitiveMesh.createPlane(engine, 4.5, 2);
  panel.entity.transform.setPosition(0, 1.2, -1);
  panel.entity.transform.setRotation(90, 0, 0);
  const red = new PBRMaterial(engine);
  red.baseColor.set(0, 0, 0, 1);
  red.emissiveColor.set(1, 0, 0, 1);
  red.screenSpaceReflection = { mode: "Off", intensity: 0 };
  panel.setMaterial(red);
  try {
    const edges = [];
    for (let frame = 0; frame < FRAMES; frame++) {
      context.camera.entity.transform.setRotation(-12 - frame * STEP_DEGREES, 0, 0);
      const trace = context.trace();
      let edge = -1;
      for (let y = 0; y < SIZE; y++) {
        let lit = 0;
        for (let x = SIZE / 4; x < (SIZE * 3) / 4; x++) {
          const offset = (y * SIZE + x) * 4;
          if (trace[offset] > 0.2 && trace[offset] > trace[offset + 1] * 2) lit++;
        }
        if (lit > SIZE / 8) edge = y;
      }
      expect(edge, `frame ${frame}: red panel must appear in Trace`).toBeGreaterThan(0);
      edges.push(edge);
    }
    const deltas = edges.slice(1).map((edge, i) => edge - edges[i]);
    const maxStep = Math.max(...deltas.map(Math.abs));
    console.info(JSON.stringify({ reflectionMotion: { edges, maxStep } }));
    // At 512px/45deg, a 0.1deg pitch advances this edge by roughly one pixel.
    // A three-pixel ceiling allows raster/depth refinement, but catches the oct8 stalls and jumps.
    expect(maxStep).toBeLessThanOrEqual(3);
    expect(edges[0] - edges[edges.length - 1]).toBeGreaterThan(30);
  } finally {
    context.destroy();
    red.destroy();
  }
}, 60000);
