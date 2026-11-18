import {
  Camera,
  Color,
  CompareFunction,
  MeshRenderer,
  PBRMaterial,
  PrimitiveMesh,
  RenderStateElementKey,
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
const TEST_TIMEOUT_MS = 60000;
const MSAA_SAMPLES = [2, 4, 8] as const;
// A resolve may choose any sub-sample of the pixel. Orientations cover every sign of the depth gradient.
const MAX_MISSING_RATIO = 0.002;
const MIN_REFLECTION_RATIO = 0.9;
const OCCLUDER_CHANNEL_GAP = 40;
const ALTERED_DELTA = 6;
const REFLECTED_DELTA = 20;
const INTERIOR_RADIUS = 2;

interface Pose {
  readonly name: string;
  readonly camera: readonly [number, number, number];
  readonly rotation: readonly [number, number, number];
  readonly shape: "plane" | "sphere" | "cube";
  /** Cube resting on the receiver, when the pose also checks contact leakage. */
  readonly contact?: readonly [number, number, number];
}

const poses: readonly Pose[] = [
  { name: "floor", camera: [3, 2.5, 6], rotation: [0, 0, 0], shape: "plane", contact: [0, 0.75, 0] },
  { name: "wall +X", camera: [2.5, 0, 6], rotation: [0, 0, -90], shape: "plane", contact: [0.75, 0, 0] },
  { name: "wall -X", camera: [-2.5, 0, 6], rotation: [0, 0, 90], shape: "plane", contact: [-0.75, 0, 0] },
  { name: "ceiling", camera: [0, -2.5, 6], rotation: [180, 0, 0], shape: "plane", contact: [0, -0.75, 0] },
  { name: "roll 8", camera: [0, 2.5, 6], rotation: [0, 0, 8], shape: "plane" },
  { name: "slope 25", camera: [0, 2.5, 6], rotation: [25, 0, 0], shape: "plane" },
  { name: "steep 60", camera: [0, 2.5, 6], rotation: [60, 0, 0], shape: "plane" },
  { name: "diagonal 20/20", camera: [0, 2.5, 6], rotation: [20, 0, 20], shape: "plane" },
  { name: "diagonal 45/45", camera: [-1, 2, 6], rotation: [45, 0, 45], shape: "plane" },
  { name: "sphere", camera: [0, 1, 4], rotation: [0, 0, 0], shape: "sphere" },
  { name: "rotated cube", camera: [0, 1.5, 4], rotation: [0, 30, 0], shape: "cube" }
];

type StateMap = Record<number, number | boolean>;
interface PipelineInternals {
  constructor: { _screenSpaceReflectionSurfaceStates: StateMap; _screenSpaceReflectionMsaaSurfaceStates: StateMap };
  _screenSpaceReflectionPass: { _surfaceTarget: RenderTarget };
}

let engine: WebGLEngine;
beforeAll(async () => {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = SIZE;
  engine = await WebGLEngine.create({ canvas, shaderCompiler: new ShaderCompiler() });
});
afterAll(() => engine.destroy());

function isOccluder(mask: Uint8Array, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return false;
  const i = (y * SIZE + x) * 4;
  return Math.abs(mask[i] - mask[i + 2]) > OCCLUDER_CHANNEL_GAP;
}

function colorDelta(a: Uint8Array, b: Uint8Array, pixel: number): number {
  const i = pixel * 4;
  return Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
}

/** Build one receiver pose and run `measure`, always releasing every resource. */
function withPose<T>(
  pose: Pose,
  samples: number,
  withCube: boolean,
  measure: (context: {
    states: StateMap;
    surface: () => Uint8Array;
    render: () => Uint8Array;
    setReceiverActive: (active: boolean) => void;
    setSsr: (enabled: boolean) => void;
  }) => T
): T {
  const scene = new Scene(engine);
  engine.sceneManager.activeScene = scene;
  scene.background.solidColor = new Color(0.6, 0.55, 0.65, 1);
  scene.screenSpaceReflection.apply({
    activationMode: Activation.ForceOn,
    receiverPolicy: Policy.ExplicitOnly,
    resolutionScale: 1,
    upsamplingMode: Upsampling.Bilinear,
    edgeFade: 0,
    maxRaySteps: 64,
    thickness: 0.2
  });
  const camera = scene.createRootEntity().addComponent(Camera);
  camera.entity.transform.setPosition(...pose.camera);
  camera.entity.transform.lookAt(new Vector3(0, 0, 0));
  const output = new Texture2D(engine, SIZE, SIZE, TextureFormat.R8G8B8A8, false, false);
  const target = new RenderTarget(engine, SIZE, SIZE, output, TextureFormat.Depth24, samples);
  camera.renderTarget = target;

  const receiver = scene.createRootEntity().addComponent(MeshRenderer);
  receiver.mesh =
    pose.shape === "sphere"
      ? PrimitiveMesh.createSphere(engine, 1, 48)
      : pose.shape === "cube"
        ? PrimitiveMesh.createCuboid(engine, 1.5, 1.5, 1.5)
        : PrimitiveMesh.createPlane(engine, 12, 12);
  receiver.entity.transform.setRotation(...pose.rotation);
  const mirror = new PBRMaterial(engine);
  mirror.roughness = 0.05;
  mirror.metallic = 1;
  mirror.emissiveColor.set(0.2, 0.2, 0.3, 1);
  mirror.screenSpaceReflection = { mode: "On", intensity: 1 };
  receiver.setMaterial(mirror);

  const cube = scene.createRootEntity().addComponent(MeshRenderer);
  cube.mesh = PrimitiveMesh.createCuboid(engine, 1.5, 1.5, 1.5);
  const red = new PBRMaterial(engine);
  red.baseColor.set(0, 0, 0, 1);
  red.emissiveColor.set(0.8, 0.1, 0.1, 1);
  red.screenSpaceReflection = { mode: "Off", intensity: 0 };
  cube.setMaterial(red);
  if (pose.contact) cube.entity.transform.setPosition(...pose.contact);
  cube.entity.isActive = withCube;

  const pipeline = (camera as unknown as { _renderPipeline: PipelineInternals })._renderPipeline;
  let surfacePixels = new Uint8Array(SIZE * SIZE * 4);
  camera.screenSpaceReflection.profiler = {
    beginSample(stage) {
      if (stage !== "trace") return;
      surfacePixels = new Uint8Array(SIZE * SIZE * 4);
      (pipeline._screenSpaceReflectionPass._surfaceTarget.getColorTexture(0) as Texture2D).getPixelBuffer(
        0,
        0,
        SIZE,
        SIZE,
        0,
        surfacePixels
      );
    },
    endSample() {}
  };
  const states =
    samples > 1
      ? pipeline.constructor._screenSpaceReflectionMsaaSurfaceStates
      : pipeline.constructor._screenSpaceReflectionSurfaceStates;
  try {
    return measure({
      states,
      surface: () => surfacePixels,
      render: () => {
        engine.update();
        const pixels = new Uint8Array(SIZE * SIZE * 4);
        output.getPixelBuffer(0, 0, SIZE, SIZE, 0, pixels);
        return pixels;
      },
      setReceiverActive: (active) => (receiver.entity.isActive = active),
      setSsr: (enabled) =>
        (scene.screenSpaceReflection.activationMode = enabled ? Activation.ForceOn : Activation.ForceOff)
    });
  } finally {
    states[RenderStateElementKey.DepthStateCompareFunction] = CompareFunction.LessEqual;
    camera.screenSpaceReflection.profiler = null;
    scene.destroy();
    target.destroy();
    output.destroy();
    mirror.destroy();
    red.destroy();
  }
}

/** Fraction of receiver pixels (Surface depth test disabled) that the shipped depth test dropped. */
function missingReceiverRatio(pose: Pose, samples: number): { coverage: number; ratio: number } {
  return withPose(pose, samples, false, ({ states, surface, render }) => {
    states[RenderStateElementKey.DepthStateCompareFunction] = CompareFunction.Always;
    render();
    const reference = surface();
    states[RenderStateElementKey.DepthStateCompareFunction] = CompareFunction.LessEqual;
    render();
    const shipped = surface();
    let coverage = 0;
    let missing = 0;
    for (let i = 3; i < shipped.length; i += 4) {
      if (reference[i] === 0) continue;
      coverage++;
      if (shipped[i] === 0) missing++;
    }
    return { coverage, ratio: coverage ? missing / coverage : 0 };
  });
}

/** Reflection onto the receiver, and tint leaked onto occluder pixels away from the silhouette. */
function contactReport(pose: Pose, samples: number): { reflectionRatio: number; interiorLeak: number } {
  return withPose(pose, samples, true, ({ states, render, setReceiverActive, setSsr }) => {
    setReceiverActive(false);
    setSsr(false);
    const mask = render();
    setReceiverActive(true);
    const off = render();
    setSsr(true);
    states[RenderStateElementKey.DepthStateCompareFunction] = CompareFunction.Always;
    render();
    const unoccluded = render();
    states[RenderStateElementKey.DepthStateCompareFunction] = CompareFunction.LessEqual;
    render();
    const shipped = render();
    const reflected = (pixels: Uint8Array): number => {
      let count = 0;
      for (let i = 0; i < SIZE * SIZE; i++) {
        if (!isOccluder(mask, i % SIZE, Math.floor(i / SIZE)) && colorDelta(pixels, off, i) > REFLECTED_DELTA) count++;
      }
      return count;
    };
    let interiorLeak = 0;
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        if (!isOccluder(mask, x, y) || colorDelta(shipped, off, y * SIZE + x) <= ALTERED_DELTA) continue;
        let interior = true;
        for (let dy = -INTERIOR_RADIUS; dy <= INTERIOR_RADIUS && interior; dy++) {
          for (let dx = -INTERIOR_RADIUS; dx <= INTERIOR_RADIUS; dx++) {
            if (!isOccluder(mask, x + dx, y + dy)) {
              interior = false;
              break;
            }
          }
        }
        if (interior) interiorLeak++;
      }
    }
    const reference = reflected(unoccluded);
    return { reflectionRatio: reference ? reflected(shipped) / reference : 1, interiorLeak };
  });
}

it.each(MSAA_SAMPLES)(
  "keeps every receiver orientation covered at %ix MSAA",
  (samples) => {
    const report = poses.map((pose) => ({ pose: pose.name, ...missingReceiverRatio(pose, samples) }));
    console.info(
      JSON.stringify({ samples, report: report.map((r) => [r.pose, r.coverage, +(r.ratio * 100).toFixed(2)]) })
    );
    for (const { pose, coverage, ratio } of report) {
      expect(coverage, pose).toBeGreaterThan(0);
      expect(ratio, `${pose} at ${samples}x`).toBeLessThanOrEqual(MAX_MISSING_RATIO);
    }
    expect(
      (engine as unknown as { _hardwareRenderer: { gl: WebGL2RenderingContext } })._hardwareRenderer.gl.getError()
    ).toBe(0);
  },
  TEST_TIMEOUT_MS
);

it.each([1, ...MSAA_SAMPLES])(
  "reflects onto a receiver without leaking onto the occluder resting on it at %ix MSAA",
  (samples) => {
    const report = poses
      .filter((pose) => pose.contact)
      .map((pose) => ({ pose: pose.name, ...contactReport(pose, samples) }));
    console.info(JSON.stringify({ samples, report }));
    for (const { pose, reflectionRatio, interiorLeak } of report) {
      expect(interiorLeak, `${pose} at ${samples}x`).toBe(0);
      expect(reflectionRatio, `${pose} at ${samples}x`).toBeGreaterThanOrEqual(MIN_REFLECTION_RATIO);
    }
  },
  TEST_TIMEOUT_MS
);
