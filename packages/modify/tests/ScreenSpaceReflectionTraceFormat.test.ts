import {
  Camera,
  Color,
  GLCapabilityType,
  MeshRenderer,
  PBRMaterial,
  PrimitiveMesh,
  RenderTarget,
  Scene,
  ScreenSpaceReflectionActivationMode as Activation,
  ScreenSpaceReflectionReceiverPolicy as Policy,
  ScreenSpaceReflectionUpsamplingMode as Upsampling,
  Texture2D,
  TextureFilterMode,
  TextureFormat,
  Vector3,
  WebGLEngine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { afterAll, beforeAll, expect, it } from "vitest";

const SIZE = 512;
const DARK_LEVELS = 64;
// 8-bit linear trace keeps 13 of the 64 gradient levels; half float keeps at least 60.
const MIN_REFLECTED_LEVELS = 50;
const LIT_ROW_MIN_PIXELS = 40;

interface PassInternals {
  _traceTarget: RenderTarget | null;
}
interface Rhi {
  canIUse(capability: GLCapabilityType): boolean;
  gl: WebGL2RenderingContext;
}

let engine: WebGLEngine;
beforeAll(async () => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  engine = await WebGLEngine.create({ canvas, shaderCompiler: new ShaderCompiler() });
});
afterAll(() => engine.destroy());

/** Mirror a 0..63 emissive gradient in a floor; report the reflection's distinct levels and the trace format. */
function reflectGradient(hdr: boolean): {
  levels: number;
  traceFormat: TextureFormat;
  effective: boolean;
  estimatedBytes: number;
} {
  const scene = new Scene(engine);
  engine.sceneManager.activeScene = scene;
  scene.background.solidColor = new Color(0, 0, 0, 1);
  scene.screenSpaceReflection.apply({
    activationMode: Activation.ForceOn,
    receiverPolicy: Policy.ExplicitOnly,
    resolutionScale: 1,
    upsamplingMode: Upsampling.Bilinear,
    edgeFade: 0,
    maxRaySteps: 64,
    thickness: 1,
    maxRayDistance: 40
  });
  const camera = scene.createRootEntity().addComponent(Camera);
  camera.entity.transform.setPosition(0, 1.2, 6);
  camera.entity.transform.lookAt(new Vector3(0, 0.4, 0));
  camera.fieldOfView = 45;
  camera.enableHDR = hdr;
  const output = new Texture2D(engine, SIZE, SIZE, TextureFormat.R8G8B8A8, false, true);
  const target = new RenderTarget(engine, SIZE, SIZE, output, TextureFormat.Depth24);
  camera.renderTarget = target;

  const floor = scene.createRootEntity().addComponent(MeshRenderer);
  floor.mesh = PrimitiveMesh.createPlane(engine, 30, 30);
  const mirror = new PBRMaterial(engine);
  mirror.roughness = 0;
  mirror.metallic = 1;
  mirror.baseColor.set(1, 1, 1, 1);
  mirror.screenSpaceReflection = { mode: "On", intensity: 1 };
  floor.setMaterial(mirror);

  const gradient = new Texture2D(engine, DARK_LEVELS, 1, TextureFormat.R8G8B8A8, false, true);
  gradient.filterMode = TextureFilterMode.Point;
  const data = new Uint8Array(DARK_LEVELS * 4);
  for (let x = 0; x < DARK_LEVELS; x++) data.set([x, x, x, 255], x * 4);
  gradient.setPixelBuffer(data);
  const panel = scene.createRootEntity().addComponent(MeshRenderer);
  panel.mesh = PrimitiveMesh.createPlane(engine, 4.5, 2);
  panel.entity.transform.setPosition(0, 1.2, -1);
  panel.entity.transform.setRotation(90, 0, 0);
  const emissive = new PBRMaterial(engine);
  emissive.baseColor.set(0, 0, 0, 1);
  emissive.emissiveColor.set(1, 1, 1, 1);
  emissive.emissiveTexture = gradient;
  emissive.screenSpaceReflection = { mode: "Off", intensity: 0 };
  panel.setMaterial(emissive);

  let traceFormat = TextureFormat.R8G8B8A8;
  camera.screenSpaceReflection.profiler = {
    beginSample(stage) {
      if (stage !== "composite") return;
      const pass = (camera as unknown as { _renderPipeline: { _screenSpaceReflectionPass: PassInternals } })
        ._renderPipeline._screenSpaceReflectionPass;
      traceFormat = pass._traceTarget!.getColorTexture(0)!.format;
    },
    endSample() {}
  };
  engine.update();
  engine.update();
  const pixels = new Uint8Array(SIZE * SIZE * 4);
  output.getPixelBuffer(0, 0, SIZE, SIZE, 0, pixels);

  // Rows are lit in two contiguous runs: the panel itself, then its mirrored image below the horizon.
  const rows: { y: number; levels: number }[] = [];
  for (let y = 0; y < SIZE; y++) {
    const seen = new Set<number>();
    let lit = 0;
    for (let x = 0; x < SIZE; x++) {
      const value = pixels[(y * SIZE + x) * 4];
      seen.add(value);
      if (value > 0) lit++;
    }
    if (lit > LIT_ROW_MIN_PIXELS) rows.push({ y, levels: seen.size });
  }
  const firstGap = rows.findIndex((row, i) => i > 0 && row.y - rows[i - 1].y > 1);
  const reflection = firstGap < 0 ? [] : rows.slice(firstGap);
  const { effective, estimatedBytes } = camera.screenSpaceReflection.metrics;
  camera.screenSpaceReflection.profiler = null;
  scene.destroy();
  target.destroy();
  output.destroy();
  return {
    levels: reflection.reduce((best, row) => Math.max(best, row.levels), 0),
    traceFormat,
    effective,
    estimatedBytes
  };
}

it.each([false, true])("keeps dark reflection gradients smooth in half float trace (HDR=%s)", (hdr) => {
  const { levels, traceFormat, effective, estimatedBytes } = reflectGradient(hdr);
  console.info(JSON.stringify({ hdr, levels, traceFormat, estimatedBytes }));
  expect(effective).toBe(true);
  expect(traceFormat).toBe(TextureFormat.R16G16B16A16);
  expect(levels).toBeGreaterThanOrEqual(MIN_REFLECTED_LEVELS);
  expect((engine as unknown as { _hardwareRenderer: Rhi })._hardwareRenderer.gl.getError()).toBe(0);
});

it.each([
  GLCapabilityType.colorBufferHalfFloat,
  GLCapabilityType.textureHalfFloat,
  GLCapabilityType.textureHalfFloatLinear
])("falls back to an 8-bit trace without failing SSR when %s is unavailable", (missing) => {
  const rhi = (engine as unknown as { _hardwareRenderer: Rhi })._hardwareRenderer;
  const canIUse = rhi.canIUse;
  rhi.canIUse = function (capability: GLCapabilityType): boolean {
    return capability === missing ? false : canIUse.call(this, capability);
  };
  try {
    const { traceFormat, effective, estimatedBytes } = reflectGradient(false);
    console.info(JSON.stringify({ missing, fallbackEstimatedBytes: estimatedBytes }));
    expect(effective).toBe(true);
    expect(traceFormat).toBe(TextureFormat.R8G8B8A8);
  } finally {
    rhi.canIUse = canIUse;
  }
  expect(rhi.gl.getError()).toBe(0);
});
