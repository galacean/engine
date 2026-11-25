import "@galacean/engine-loader";
import {
  BackgroundMode,
  BlinnPhongMaterial,
  Blitter,
  BloomEffect,
  BoundingBox,
  Camera,
  CameraClearFlags,
  Color,
  DepthTextureMode,
  DiffuseMode,
  DirectLight,
  Engine,
  Entity,
  Loader,
  Material,
  Matrix,
  MeshRenderer,
  MeshTopology,
  ModelMesh,
  MSAASamples,
  PBRMaterial,
  PipelineStage,
  PostProcess,
  PostProcessPass,
  PrimitiveMesh,
  RenderFace,
  RenderQueueType,
  RenderTarget,
  Scene,
  ScreenSpaceReflection,
  ScreenSpaceReflectionQuality,
  Shader,
  ShaderMacro,
  Texture2D,
  TextureCubeFace,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode,
  TonemappingEffect,
  Transform,
  UnlitMaterial,
  Vector2,
  Vector3,
  Vector4,
  WebGLEngine
} from "@galacean/engine";
import { AssetType, EngineEventType, ShaderMacroCollection } from "@galacean/engine-core";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { applySceneData } from "../../../../packages/loader/src/SceneLoader";
import { afterEach, describe, expect, it, vi } from "vitest";

Loader.registerClass("Transform", Transform);
Loader.registerClass("Camera", Camera);

function drainGlErrors(gl: WebGL2RenderingContext): number[] {
  const errors: number[] = [];
  let err = gl.getError();
  while (err !== gl.NO_ERROR) {
    errors.push(err);
    err = gl.getError();
  }
  return errors;
}

const SSRState = {
  Disabled: "disabled",
  Skipped: "skipped",
  WarmupColor: "warmup-color",
  FirstTrace: "first-trace",
  ActiveSteady: "active-steady",
  ContextLost: "context-lost"
} as const;

function getSSRPass(cam: Camera): any {
  // @ts-ignore access internal SSR pass
  return cam._renderPipeline._ssrPass;
}

function isSSRActiveForCamera(cam: Camera): boolean {
  const ssrPass = getSSRPass(cam);
  return Boolean(ssrPass?._programResolver.forwardEnabled && cam.shaderData.getTexture("camera_SSRTexture"));
}

function getSSRRetainedBytes(ssrPass: any): number {
  if (!ssrPass) return 0;
  const res = ssrPass._resources;
  const hist = ssrPass._history;
  const textures: Array<Texture2D | null | undefined> = [
    res.ssrDepthTex,
    res.traceRawTex,
    res.hitDistTex,
    hist.prevColorPyramidTex,
    hist.hiZTex[0],
    hist.hiZTex[1],
    hist.recvNRTex[0],
    hist.recvNRTex[1],
    hist.recvDepthTex[0],
    hist.recvDepthTex[1],
    hist.ssrPingPongTex[0],
    hist.ssrPingPongTex[1]
  ];
  let total = 0;
  for (const tex of textures) {
    if (tex) total += tex._memorySize;
  }
  return total;
}

function createBlobURL(data: unknown, extension: string): string {
  return URL.createObjectURL(new Blob([JSON.stringify(data)], { type: "application/json" })) + `#.${extension}`;
}

function createCanvas(width = 160, height = 120): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function createTestEngine(
  width = 160,
  height = 120
): Promise<{ engine: WebGLEngine; scene: Scene; gl: WebGL2RenderingContext }> {
  const engine = await WebGLEngine.create({
    canvas: createCanvas(width, height),
    graphicDeviceOptions: {
      alpha: false,
      antialias: true,
      stencil: true,
      preserveDrawingBuffer: true
    }
  });
  const scene = engine.sceneManager.activeScene;
  scene.background.mode = BackgroundMode.SolidColor;
  scene.background.solidColor.set(0, 0, 0, 1);
  scene.ambientLight.diffuseMode = DiffuseMode.SolidColor;
  scene.ambientLight.diffuseSolidColor.set(0, 0, 0, 1);
  scene.ambientLight.diffuseIntensity = 0;
  scene.ambientLight.specularIntensity = 0;
  const gl = engine._hardwareRenderer.gl;
  drainGlErrors(gl);
  return { engine, scene, gl };
}

function stepFrames(engine: WebGLEngine, count: number): void {
  for (let i = 0; i < count; i++) {
    engine.update();
  }
}

function addBox(
  engine: WebGLEngine,
  parent: Entity,
  name: string,
  pos: [number, number, number],
  size: [number, number, number],
  material: Material
): Entity {
  const entity = parent.createChild(name);
  entity.transform.setPosition(pos[0], pos[1], pos[2]);
  const r = entity.addComponent(MeshRenderer);
  r.mesh = PrimitiveMesh.createCuboid(engine, size[0], size[1], size[2]);
  r.setMaterial(material);
  return entity;
}

function addPlane(
  engine: WebGLEngine,
  parent: Entity,
  name: string,
  pos: [number, number, number],
  width: number,
  height: number,
  material: Material
): Entity {
  const entity = parent.createChild(name);
  entity.transform.setPosition(pos[0], pos[1], pos[2]);
  const r = entity.addComponent(MeshRenderer);
  r.mesh = PrimitiveMesh.createPlane(engine, width, height);
  r.setMaterial(material);
  return entity;
}

function sampleRegionRGB(tex: Texture2D, x0Ratio: number, y0Ratio: number, x1Ratio: number, y1Ratio: number) {
  const w = tex.width;
  const h = tex.height;
  const pixels = new Uint8Array(w * h * 4);
  tex.getPixelBuffer(0, 0, w, h, 0, pixels);

  const x0 = Math.max(0, Math.floor(w * x0Ratio));
  const x1 = Math.min(w, Math.ceil(w * x1Ratio));
  const y0 = Math.max(0, Math.floor(h * y0Ratio));
  const y1 = Math.min(h, Math.ceil(h * y1Ratio));

  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let maxR = 0;
  let maxG = 0;
  let maxB = 0;
  let count = 0;
  let zeroBlackPixels = 0;

  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const idx = (y * w + x) * 4;
      const r = pixels[idx];
      const g = pixels[idx + 1];
      const b = pixels[idx + 2];
      sumR += r;
      sumG += g;
      sumB += b;
      if (r > maxR) maxR = r;
      if (g > maxG) maxG = g;
      if (b > maxB) maxB = b;
      if (r === 0 && g === 0 && b === 0) zeroBlackPixels++;
      count++;
    }
  }

  return {
    count,
    avgR: count > 0 ? sumR / count : 0,
    avgG: count > 0 ? sumG / count : 0,
    avgB: count > 0 ? sumB / count : 0,
    maxR,
    maxG,
    maxB,
    zeroBlackPixels,
    pixels
  };
}

function createReadbackRT(engine: WebGLEngine, width = 160, height = 120): { rt: RenderTarget; tex: Texture2D } {
  const tex = new Texture2D(engine, width, height, TextureFormat.R8G8B8A8_UNorm, false, true);
  const rt = new RenderTarget(engine, width, height, tex, TextureFormat.Depth24Stencil8, 1);
  return { rt, tex };
}

function createSolidRGBA8Tex(engine: WebGLEngine, r: number, g: number, b: number, a: number): Texture2D {
  const tex = new Texture2D(engine, 2, 2, TextureFormat.R8G8B8A8_UNorm, false, false);
  const data = new Uint8Array([r, g, b, a, r, g, b, a, r, g, b, a, r, g, b, a]);
  tex.setPixelBuffer(data);
  tex.wrapModeU = TextureWrapMode.Clamp;
  tex.wrapModeV = TextureWrapMode.Clamp;
  return tex;
}

function createQuadWithVertexColorAlpha(
  engine: WebGLEngine,
  width: number,
  height: number,
  r: number,
  g: number,
  b: number,
  a: number
): ModelMesh {
  const hw = width * 0.5;
  const hh = height * 0.5;
  const mesh = new ModelMesh(engine);
  const positions = [
    new Vector3(-hw, -hh, 0),
    new Vector3(hw, -hh, 0),
    new Vector3(hw, hh, 0),
    new Vector3(-hw, hh, 0)
  ];
  const normals = [new Vector3(0, 0, 1), new Vector3(0, 0, 1), new Vector3(0, 0, 1), new Vector3(0, 0, 1)];
  const uvs = [new Vector2(0, 0), new Vector2(1, 0), new Vector2(1, 1), new Vector2(0, 1)];
  const colors = [new Color(r, g, b, a), new Color(r, g, b, a), new Color(r, g, b, a), new Color(r, g, b, a)];
  mesh.setPositions(positions);
  mesh.setNormals(normals);
  mesh.setUVs(uvs);
  mesh.setColors(colors);
  mesh.setIndices(new Uint16Array([0, 1, 2, 0, 2, 3]));
  mesh.addSubMesh(0, 6, MeshTopology.Triangles);
  mesh.uploadData(false);
  return mesh;
}

function encodeHalfFloat(val: number): number {
  if (val === 0) return 0;
  const sign = val < 0 ? 1 : 0;
  const abs = Math.abs(val);
  const exp = Math.floor(Math.log2(abs));
  const frac = abs / Math.pow(2, exp) - 1;
  const biasedExp = Math.max(0, Math.min(31, exp + 15));
  const mant = Math.round(frac * 1024) & 0x3ff;
  return (sign << 15) | (biasedExp << 10) | mant;
}

function readSSRDepthBuffer(tex: Texture2D, packedRG8: boolean, farClip: number, mipLevel = 0): Float32Array {
  const w = Math.max(1, tex.width >> mipLevel);
  const h = Math.max(1, tex.height >> mipLevel);
  const result = new Float32Array(w * h);
  if (packedRG8) {
    const channels = tex.format === TextureFormat.R8G8_UNorm ? 2 : 4;
    const raw = new Uint8Array(w * h * channels);
    tex.getPixelBuffer(0, 0, w, h, mipLevel, raw);
    for (let i = 0; i < w * h; i++) {
      const hi = raw[i * channels];
      const lo = raw[i * channels + 1];
      const u = (hi * 256 + lo) / 65535;
      result[i] = u * u * farClip;
    }
  } else {
    const raw = new Float32Array(w * h * 4);
    tex.getPixelBuffer(0, 0, w, h, mipLevel, raw);
    for (let i = 0; i < w * h; i++) {
      result[i] = raw[i * 4];
    }
  }
  return result;
}

describe("ScreenSpaceReflection v2", () => {
  const createdEngines: Engine[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    while (createdEngines.length > 0) {
      createdEngines.pop()!.destroy();
    }
  });

  it("enforces defaults, clamping, cloneTo, and Material/Camera overrides", async () => {
    const { engine, scene } = await createTestEngine();
    createdEngines.push(engine);

    const ssr = scene.screenSpaceReflection;
    expect(ssr).toBeInstanceOf(ScreenSpaceReflection);
    expect(ssr.enabled).toBe(false);
    expect(ssr.quality).toBe(ScreenSpaceReflectionQuality.Medium);
    expect(ssr.intensity).toBe(1.0);
    expect(ssr.maxRoughness).toBe(0.6);
    expect(ssr.maxDistance).toBe(25);
    expect(ssr.thickness).toBe(0.15);
    expect(ssr.edgeFade).toBe(0.1);
    expect(ssr.temporalBlend).toBe(0.85);

    ssr.intensity = -2;
    expect(ssr.intensity).toBe(0);
    ssr.intensity = 1.25;
    ssr.intensity = Number.NaN;
    expect(ssr.intensity).toBe(1.25);
    ssr.maxRoughness = 3;
    expect(ssr.maxRoughness).toBe(1);
    ssr.maxDistance = 0.001;
    expect(ssr.maxDistance).toBe(0.1);
    ssr.maxDistance = 5000;
    expect(ssr.maxDistance).toBe(1000);
    ssr.maxDistance = Number.POSITIVE_INFINITY;
    expect(ssr.maxDistance).toBe(1000);
    ssr.thickness = 0;
    expect(ssr.thickness).toBe(0.005);
    ssr.edgeFade = 2;
    expect(ssr.edgeFade).toBe(0.5);
    ssr.temporalBlend = 2;
    expect(ssr.temporalBlend).toBe(0.95);
    ssr.quality = ScreenSpaceReflectionQuality.High;
    // @ts-expect-error runtime guard for invalid quality
    ssr.quality = "invalid";
    expect(ssr.quality).toBe(ScreenSpaceReflectionQuality.High);

    ssr.enabled = true;
    ssr.quality = ScreenSpaceReflectionQuality.High;
    ssr.intensity = 1.5;
    ssr.maxDistance = 40;
    expect(ssr.enabled).toBe(true);
    expect(ssr.quality).toBe(ScreenSpaceReflectionQuality.High);
    expect(ssr.intensity).toBe(1.5);
    expect(ssr.maxDistance).toBe(40);

    ssr.quality = ScreenSpaceReflectionQuality.VeryHigh;
    expect(ssr.quality).toBe(ScreenSpaceReflectionQuality.VeryHigh);
    ssr.quality = ScreenSpaceReflectionQuality.High;
    expect(ssr.quality).toBe(ScreenSpaceReflectionQuality.High);

    const copy = new ScreenSpaceReflection();
    ssr.cloneTo(copy);
    expect(copy.enabled).toBe(ssr.enabled);
    expect(copy.quality).toBe(ssr.quality);
    expect(copy.intensity).toBe(ssr.intensity);
    expect(copy.maxRoughness).toBe(ssr.maxRoughness);
    expect(copy.maxDistance).toBe(ssr.maxDistance);
    expect(copy.thickness).toBe(ssr.thickness);
    expect(copy.edgeFade).toBe(ssr.edgeFade);
    expect(copy.temporalBlend).toBe(ssr.temporalBlend);

    const cloned = ssr.clone();
    expect(cloned).toBeInstanceOf(ScreenSpaceReflection);
    expect(cloned).not.toBe(ssr);
    expect(cloned.enabled).toBe(ssr.enabled);
    expect(cloned.quality).toBe(ssr.quality);
    expect(cloned.intensity).toBe(ssr.intensity);
    expect(cloned.maxRoughness).toBe(ssr.maxRoughness);
    expect(cloned.maxDistance).toBe(ssr.maxDistance);
    expect(cloned.thickness).toBe(ssr.thickness);
    expect(cloned.edgeFade).toBe(ssr.edgeFade);
    expect(cloned.temporalBlend).toBe(ssr.temporalBlend);

    const camEnt = scene.createRootEntity("camA");
    const cam = camEnt.addComponent(Camera);
    expect(cam.enableScreenSpaceReflection).toBe(true);
    expect(cam.screenSpaceReflectionOverride).toBeNull();
    cam.screenSpaceReflectionOverride = copy;
    const camClone = camEnt.clone().getComponent(Camera)!;
    expect(camClone.screenSpaceReflectionOverride).not.toBeNull();
    expect(camClone.screenSpaceReflectionOverride).not.toBe(copy);
    expect(camClone.screenSpaceReflectionOverride!.maxDistance).toBe(40);

    const rawMat = new Material(engine, Shader.find("Unlit")!);
    expect(rawMat.screenSpaceReflectionIntensity).toBe(0);
    expect(rawMat.contributeScreenSpaceReflectionDepth).toBe(false);
    expect(rawMat.screenSpaceReflectionBilateral).toBe(true);
    expect(rawMat.screenSpaceReflectionOccluder).toBe(true);
    const pbrMat = new PBRMaterial(engine);
    expect(pbrMat.screenSpaceReflectionIntensity).toBe(1);
    expect(pbrMat.contributeScreenSpaceReflectionDepth).toBe(false);
    expect(pbrMat.screenSpaceReflectionBilateral).toBe(true);
    expect(pbrMat.screenSpaceReflectionOccluder).toBe(true);
    pbrMat.screenSpaceReflectionIntensity = 0.4;
    pbrMat.contributeScreenSpaceReflectionDepth = true;
    pbrMat.screenSpaceReflectionBilateral = false;
    pbrMat.screenSpaceReflectionOccluder = false;
    const clonedPbr = pbrMat.clone();
    expect(clonedPbr.screenSpaceReflectionIntensity).toBe(0.4);
    expect(clonedPbr.contributeScreenSpaceReflectionDepth).toBe(true);
    expect(clonedPbr.screenSpaceReflectionBilateral).toBe(false);
    expect(clonedPbr.screenSpaceReflectionOccluder).toBe(false);
  });

  it("deserializes v2 SSR settings via SceneLoader and MaterialLoader", async () => {
    const { engine, scene } = await createTestEngine();
    createdEngines.push(engine);

    await applySceneData(
      scene,
      {
        rootEntities: [],
        background: { mode: BackgroundMode.SolidColor, color: [0, 0, 0, 1] },
        screenSpaceReflection: {
          enabled: true,
          quality: ScreenSpaceReflectionQuality.Low,
          intensity: 1.25,
          maxRoughness: 0.45,
          maxDistance: 18,
          thickness: 0.25,
          edgeFade: 0.15,
          temporalBlend: 0.7
        }
      },
      engine.resourceManager,
      []
    );

    expect(scene.screenSpaceReflection.enabled).toBe(true);
    expect(scene.screenSpaceReflection.quality).toBe(ScreenSpaceReflectionQuality.Low);
    expect(scene.screenSpaceReflection.intensity).toBe(1.25);
    expect(scene.screenSpaceReflection.maxRoughness).toBe(0.45);
    expect(scene.screenSpaceReflection.maxDistance).toBe(18);
    expect(scene.screenSpaceReflection.thickness).toBe(0.25);
    expect(scene.screenSpaceReflection.edgeFade).toBe(0.15);
    expect(scene.screenSpaceReflection.temporalBlend).toBe(0.7);

    const mat = await engine.resourceManager.load<Material>({
      url: createBlobURL(
        {
          name: "LoadedSSRMat",
          shader: "PBR",
          screenSpaceReflectionIntensity: 0.65,
          contributeScreenSpaceReflectionDepth: true,
          screenSpaceReflectionBilateral: false,
          screenSpaceReflectionOccluder: false,
          shaderData: {},
          macros: []
        },
        "mat"
      ),
      type: AssetType.Material
    });
    expect(mat.screenSpaceReflectionIntensity).toBeCloseTo(0.65);
    expect(mat.contributeScreenSpaceReflectionDepth).toBe(true);
    expect(mat.screenSpaceReflectionBilateral).toBe(false);
    expect(mat.screenSpaceReflectionOccluder).toBe(false);
    mat.destroy();
  });

  it("progresses state machine cleanly (Warmup -> FirstTrace -> ActiveSteady), handles Skipped, Cut, Quality switches, Disabled, and DeviceLost", async () => {
    const { engine, scene, gl } = await createTestEngine(200, 100);
    createdEngines.push(engine);

    const root = scene.createRootEntity("root");
    const camEnt = root.createChild("cam");
    camEnt.transform.setPosition(0, 1.5, 4);
    camEnt.transform.lookAt(new Vector3(0, 0, 0));
    const cam = camEnt.addComponent(Camera);

    const floorMat = new PBRMaterial(engine);
    floorMat.roughness = 0.05;
    addPlane(engine, root, "floor", [0, 0, 0], 8, 8, floorMat);

    // Warm up non-SSR pipeline baseline render targets before measuring SSR texture delta
    engine.update();
    const baselineTexMem = engine.renderingStatistics.textureMemory;
    scene.screenSpaceReflection.enabled = true;
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.Medium;

    // Frame 1 -> WarmupColor
    engine.update();
    const ssrPass = getSSRPass(cam);
    expect(ssrPass._state).toBe(SSRState.WarmupColor);
    expect(isSSRActiveForCamera(cam)).toBe(false);

    // Frame 2 -> FirstTrace
    engine.update();
    expect(ssrPass._state).toBe(SSRState.FirstTrace);
    expect(isSSRActiveForCamera(cam)).toBe(true);
    expect(ssrPass._resources.ssrDepthTex!.width).toBe(100);
    expect(ssrPass._resources.ssrDepthTex!.height).toBe(50);

    // Frame 3 -> ActiveSteady
    engine.update();
    expect(ssrPass._state).toBe(SSRState.ActiveSteady);
    const mediumBytes = getSSRRetainedBytes(ssrPass);
    expect(mediumBytes).toBeGreaterThan(0);

    // Camera cut resets history back to WarmupColor -> FirstTrace -> ActiveSteady
    cam.notifyScreenSpaceReflectionCut();
    engine.update();
    expect(ssrPass._state).toBe(SSRState.WarmupColor);
    stepFrames(engine, 2);
    expect(ssrPass._state).toBe(SSRState.ActiveSteady);

    // Medium -> High switches from 0-Hi-Z Linear trace to hierarchical Hi-Z (rebuilds Hi-Z mip chain while retaining color history):
    // transitions WarmupColor -> FirstTrace -> ActiveSteady
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.High;
    engine.update();
    expect(ssrPass._state).toBe(SSRState.WarmupColor);
    engine.update();
    expect(ssrPass._state).toBe(SSRState.FirstTrace);
    engine.update();
    expect(ssrPass._state).toBe(SSRState.ActiveSteady);

    // High -> Low resizes trace targets (0.5x -> 0.25x) so it re-warms depth then drops temporal ping-pong buffers
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.Low;
    engine.update();
    expect(ssrPass._state).toBe(SSRState.WarmupColor);
    engine.update();
    expect(ssrPass._state).toBe(SSRState.FirstTrace);
    expect(ssrPass._resources.ssrDepthTex!.width).toBe(50);
    expect(ssrPass._resources.ssrDepthTex!.height).toBe(25);
    expect(getSSRRetainedBytes(ssrPass)).toBeLessThan(mediumBytes);

    // Rough / zero-intensity receiver -> Skipped
    floorMat.screenSpaceReflectionIntensity = 0;
    engine.update();
    expect(ssrPass._state).toBe(SSRState.Skipped);
    expect(isSSRActiveForCamera(cam)).toBe(false);

    // Restore receiver & test Disabled cleanup
    floorMat.screenSpaceReflectionIntensity = 1;
    stepFrames(engine, 2);
    cam.enableScreenSpaceReflection = false;
    engine.update();
    expect(ssrPass._state).toBe(SSRState.Disabled);
    expect(getSSRRetainedBytes(ssrPass)).toBe(0);
    expect(engine.renderingStatistics.textureMemory).toBe(baselineTexMem);

    // Re-enable then switch back to Medium before simulating DeviceLost / DeviceRestored
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.Medium;
    cam.enableScreenSpaceReflection = true;
    stepFrames(engine, 3);
    expect(ssrPass._state).toBe(SSRState.ActiveSteady);

    // @ts-ignore simulate engine device loss & restore
    engine._onDeviceLost();
    expect(ssrPass._state).toBe(SSRState.ContextLost);
    expect(getSSRRetainedBytes(ssrPass)).toBe(0);
    expect(engine.renderingStatistics.textureMemory).toBe(0);
    // @ts-ignore CR-004: persistent SSR GPU resources must be freed immediately on DeviceLost before DeviceRestored
    expect(cam._renderPipeline._ssrPass._history.prevColorPyramidTex).toBeNull();
    // @ts-ignore
    expect(cam._renderPipeline._ssrPass._resources.ssrDepthTex).toBeNull();
    engine.update();
    expect(ssrPass._state).toBe(SSRState.ContextLost);

    const restored = new Promise<void>((resolve) => engine.once(EngineEventType.DeviceRestored, () => resolve()));
    // @ts-ignore
    engine._onDeviceRestored();
    stepFrames(engine, 3);
    expect(ssrPass._state).toBe(SSRState.ActiveSteady);
    await restored;
    expect(ssrPass._state).toBe(SSRState.ActiveSteady);
    expect(drainGlErrors(gl)).toEqual([]);
  });

  it("renders with zero WebGL errors across Low/Medium/High, Scheme A/B stencil toggle, RG8/OCT8 packed fallback, and SAO", async () => {
    const { engine, scene, gl } = await createTestEngine(160, 120);
    createdEngines.push(engine);

    const root = scene.createRootEntity("root");
    const camEnt = root.createChild("cam");
    camEnt.transform.setPosition(0, 1.5, 4);
    camEnt.transform.lookAt(new Vector3(0, 0, 0));
    const cam = camEnt.addComponent(Camera);

    const floorMat = new PBRMaterial(engine);
    floorMat.roughness = 0.08;
    addPlane(engine, root, "floor", [0, 0, 0], 10, 10, floorMat);

    const boxMat = new PBRMaterial(engine);
    boxMat.emissiveColor = new Color(2, 0.5, 0.2, 1);
    boxMat.screenSpaceReflectionIntensity = 0;
    addBox(engine, root, "pillar", [0, 1, -1.5], [1, 2, 1], boxMat);

    // @ts-ignore access internal pass for A/B & fallback coverage
    const ssrPass = cam._renderPipeline._getOrCreateSSRPass();
    scene.screenSpaceReflection.enabled = true;

    for (const quality of [
      ScreenSpaceReflectionQuality.Low,
      ScreenSpaceReflectionQuality.Medium,
      ScreenSpaceReflectionQuality.High
    ]) {
      scene.screenSpaceReflection.quality = quality;
      const expectPackedNormalByLDR = quality !== ScreenSpaceReflectionQuality.High;
      for (const useHWStencil of [true, false]) {
        for (const forcePacked of [false, true]) {
          ssrPass._useHardwareStencil = useHWStencil;
          ssrPass._forcePackedFormats = forcePacked;
          stepFrames(engine, 3);
          expect(isSSRActiveForCamera(cam)).toBe(true);
          expect(ssrPass._frame.useHardwareStencil).toBe(useHWStencil);
          expect(ssrPass._caps.usesPackedDepthRG8).toBe(forcePacked);
          expect(ssrPass._caps.usesPackedNormalOct8).toBe(forcePacked || expectPackedNormalByLDR);
          expect(drainGlErrors(gl)).toEqual([]);
        }
      }
    }

    // Medium HDR retains R8G8B8A8 + Oct8 + reversible Reinhard (usesPackedNormalOct8 = true); High HDR upgrades to RGBA16F (usesPackedNormalOct8 = false)
    cam.enableHDR = true;
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.Medium;
    ssrPass._useHardwareStencil = true;
    ssrPass._forcePackedFormats = false;
    stepFrames(engine, 3);
    expect(ssrPass._caps.usesPackedNormalOct8).toBe(true);
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.High;
    stepFrames(engine, 3);
    expect(ssrPass._caps.usesPackedNormalOct8).toBe(false);
    cam.enableHDR = false;

    // Combined with SAO (forces DepthOnlyPass at 1.0x -> exercises DownsampleDepth max + BuildHiZMip0 min)
    ssrPass._useHardwareStencil = true;
    ssrPass._forcePackedFormats = false;
    scene.ambientOcclusion.enabled = true;
    cam.depthTextureMode = DepthTextureMode.PrePass;
    stepFrames(engine, 3);
    expect(ssrPass._state).toBe(SSRState.ActiveSteady);
    expect(drainGlErrors(gl)).toEqual([]);
  });

  it("adds strictly ZERO MSAA resolves relative to SSR Off across PBR, opaqueTexture refraction, and HDR+PostProcess", async () => {
    const { engine, scene, gl } = await createTestEngine(160, 120);
    createdEngines.push(engine);

    const root = scene.createRootEntity("root");
    const camEnt = root.createChild("cam");
    camEnt.transform.setPosition(0, 1.5, 4);
    camEnt.transform.lookAt(new Vector3(0, 0, 0));
    const cam = camEnt.addComponent(Camera);
    cam.msaaSamples = MSAASamples.FourX;

    const floorMat = new PBRMaterial(engine);
    floorMat.roughness = 0.08;
    addPlane(engine, root, "floor", [0, 0, 0], 8, 8, floorMat);

    const transMat = new PBRMaterial(engine);
    transMat.isTransparent = true;
    transMat.baseColor = new Color(0.4, 0.7, 0.9, 0.5);
    transMat.roughness = 0.08;
    addPlane(engine, root, "water", [0, 0.3, 0], 4, 4, transMat);

    const ppEntity = root.createChild("pp");
    const pp = ppEntity.addComponent(PostProcess);
    pp.addEffect(BloomEffect).enabled = true;
    pp.addEffect(TonemappingEffect).enabled = true;

    const blitSpy = vi.spyOn(gl, "blitFramebuffer");

    const measureSingleSteadyResolveCount = (ssrOn: boolean): number => {
      scene.screenSpaceReflection.enabled = ssrOn;
      stepFrames(engine, 3);
      blitSpy.mockClear();
      engine.update();
      return blitSpy.mock.calls.length;
    };

    // Case A: Standard PBR + 4x MSAA
    cam.opaqueTextureEnabled = false;
    cam.enablePostProcess = false;
    cam.enableHDR = false;
    const pbrOff = measureSingleSteadyResolveCount(false);
    const pbrOn = measureSingleSteadyResolveCount(true);
    expect(pbrOn - pbrOff).toBe(0);

    // Case B: opaqueTextureEnabled (Refraction) + 4x MSAA
    cam.opaqueTextureEnabled = true;
    const refrOff = measureSingleSteadyResolveCount(false);
    const refrOn = measureSingleSteadyResolveCount(true);
    expect(refrOn - refrOff).toBe(0);

    // Case C: HDR + PostProcess + 4x MSAA
    cam.opaqueTextureEnabled = false;
    cam.enableHDR = true;
    cam.enablePostProcess = true;
    const ppOff = measureSingleSteadyResolveCount(false);
    const ppOn = measureSingleSteadyResolveCount(true);
    expect(ppOn - ppOff).toBe(0);
    expect(drainGlErrors(gl)).toEqual([]);
  });

  it("produces physically aligned floor reflections, handles LDR, respects opt-out, Clear Coat, Ortho, and contributes transparent depth", async () => {
    const { engine, scene, gl } = await createTestEngine(160, 120);
    createdEngines.push(engine);

    const root = scene.createRootEntity("root");
    const camEnt = root.createChild("cam");
    camEnt.transform.setPosition(0, 1.35, 3.6);
    camEnt.transform.lookAt(new Vector3(0, 0.35, -1.2));
    const cam = camEnt.addComponent(Camera);
    cam.nearClipPlane = 0.2;
    cam.farClipPlane = 50;

    const { rt, tex } = createReadbackRT(engine, 160, 120);
    cam.renderTarget = rt;

    const floorMat = new PBRMaterial(engine);
    floorMat.baseColor = new Color(0.02, 0.02, 0.02, 1);
    floorMat.metallic = 0.0;
    floorMat.roughness = 0.03;
    floorMat.screenSpaceReflectionIntensity = 1.0;
    addPlane(engine, root, "mirrorFloor", [0, 0, -0.8], 10, 10, floorMat);

    // Bright red emissive wall rising from y = 0.85..2.85 at z = -1.8 (strictly above bottom floor strip in image)
    const pillarMat = new PBRMaterial(engine);
    pillarMat.baseColor = new Color(0.1, 0, 0, 1);
    pillarMat.emissiveColor = new Color(4.0, 0.0, 0.0, 1);
    pillarMat.screenSpaceReflectionIntensity = 0;
    const pillar = addBox(engine, root, "redWall", [0, 1.85, -1.8], [3.2, 2.0, 0.4], pillarMat);

    // 1. Baseline SSR Off (with flipProjection=true on offscreen RT, bottom floor sits in y=0.68..0.95 of readPixels buffer)
    scene.screenSpaceReflection.enabled = false;
    stepFrames(engine, 3);
    const offFloor = sampleRegionRGB(tex, 0.35, 0.68, 0.65, 0.95);

    // 2. SSR On (High, HDR) -> floor clearly reflects red wall above it
    scene.screenSpaceReflection.enabled = true;
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.High;
    cam.enableHDR = true;
    stepFrames(engine, 3);
    const onFloorHDR = sampleRegionRGB(tex, 0.35, 0.68, 0.65, 0.95);
    expect(onFloorHDR.maxR).toBeGreaterThan(offFloor.maxR + 60);
    expect(onFloorHDR.avgR).toBeGreaterThan(offFloor.avgR + 15);

    // 3. LDR -> zero black corruption, reflection still bright & accurate
    cam.enableHDR = false;
    cam.notifyScreenSpaceReflectionCut();
    stepFrames(engine, 3);
    const onFloorLDR = sampleRegionRGB(tex, 0.35, 0.68, 0.65, 0.95);
    expect(onFloorLDR.maxR).toBeGreaterThan(offFloor.maxR + 60);

    // 4. Opt-out -> matches SSR Off baseline
    floorMat.screenSpaceReflectionIntensity = 0;
    stepFrames(engine, 2);
    const optOutFloor = sampleRegionRGB(tex, 0.35, 0.68, 0.65, 0.95);
    expect(Math.abs(optOutFloor.avgR - offFloor.avgR)).toBeLessThan(3);

    // 5. Clear Coat dominant lobe: rough base (0.85) + clearCoat (1.0) + clearCoatRoughness (0.03)
    floorMat.screenSpaceReflectionIntensity = 1.0;
    floorMat.roughness = 0.85;
    floorMat.clearCoat = 1.0;
    floorMat.clearCoatRoughness = 0.03;
    stepFrames(engine, 3);
    const clearCoatFloor = sampleRegionRGB(tex, 0.35, 0.68, 0.65, 0.95);
    expect(clearCoatFloor.maxR).toBeGreaterThan(offFloor.maxR + 30);

    // 5b. CR-020 Clear Coat reverse lobe: smooth base (0.03) + clearCoat (1.0) + rough clearCoat (0.85) selects smoother base lobe
    floorMat.roughness = 0.03;
    floorMat.clearCoat = 1.0;
    floorMat.clearCoatRoughness = 0.85;
    stepFrames(engine, 3);
    const reverseCoatFloor = sampleRegionRGB(tex, 0.35, 0.68, 0.65, 0.95);
    expect(reverseCoatFloor.maxR).toBeGreaterThan(offFloor.maxR + 30);

    // Restore plain smooth floor for contributor test
    floorMat.clearCoat = 0;
    floorMat.roughness = 0.03;
    pillar.isActive = false;

    // 6. Transparent contributor (cyan curtain above floor)
    const cyanCurtainMat = new PBRMaterial(engine);
    cyanCurtainMat.isTransparent = true;
    cyanCurtainMat.baseColor = new Color(0, 0.2, 0.2, 0.85);
    cyanCurtainMat.emissiveColor = new Color(0, 4.0, 4.0, 1);
    cyanCurtainMat.screenSpaceReflectionIntensity = 0;
    cyanCurtainMat.contributeScreenSpaceReflectionDepth = false;
    addBox(engine, root, "cyanCurtain", [0, 1.85, -1.8], [3.2, 2.0, 0.3], cyanCurtainMat);

    stepFrames(engine, 3);
    const contribOff = sampleRegionRGB(tex, 0.35, 0.68, 0.65, 0.95);

    cyanCurtainMat.contributeScreenSpaceReflectionDepth = true;
    stepFrames(engine, 3);
    const contribOn = sampleRegionRGB(tex, 0.35, 0.68, 0.65, 0.95);
    expect(contribOn.avgG).toBeGreaterThan(contribOff.avgG + 15);
    expect(contribOn.maxG).toBeGreaterThan(contribOff.maxG + 60);

    // 7. Orthographic mode
    cam.isOrthographic = true;
    cam.orthographicSize = 2.5;
    stepFrames(engine, 3);
    expect(getSSRPass(cam)._state).toBe(SSRState.ActiveSteady);
    const orthoFloor = sampleRegionRGB(tex, 0.35, 0.68, 0.65, 0.95);
    expect(orthoFloor.zeroBlackPixels).toBeLessThan(orthoFloor.count);
    expect(drainGlErrors(gl)).toEqual([]);

    rt.destroy(true);
    tex.destroy(true);
  });

  it("handles layered water-over-tile and glass-over-water closest-wins contract and DepthOnly alphaCutoff + Double face", async () => {
    const { engine, scene, gl } = await createTestEngine(160, 120);
    createdEngines.push(engine);

    const root = scene.createRootEntity("root");
    const camEnt = root.createChild("cam");
    camEnt.transform.setPosition(0, 1.6, 3.8);
    camEnt.transform.lookAt(new Vector3(0, 0.3, -0.5));
    const cam = camEnt.addComponent(Camera);

    const { rt, tex } = createReadbackRT(engine, 160, 120);
    cam.renderTarget = rt;

    // Submerged opaque glossy tile below semi-transparent water
    const tileMat = new PBRMaterial(engine);
    tileMat.roughness = 0.04;
    tileMat.screenSpaceReflectionIntensity = 1.0;
    addPlane(engine, root, "submergedTile", [0, -0.1, 0], 8, 8, tileMat);

    const waterMat = new PBRMaterial(engine);
    waterMat.isTransparent = true;
    waterMat.baseColor = new Color(0.05, 0.25, 0.35, 0.5);
    waterMat.roughness = 0.04;
    waterMat.screenSpaceReflectionIntensity = 1.0;
    addPlane(engine, root, "waterSurface", [0, 0.25, 0], 8, 8, waterMat);

    // Front transparent glass pane over part of water (exercises dual-transparent verify depth)
    const glassMat = new PBRMaterial(engine);
    glassMat.isTransparent = true;
    glassMat.baseColor = new Color(0.8, 0.9, 1.0, 0.3);
    glassMat.roughness = 0.04;
    glassMat.screenSpaceReflectionIntensity = 1.0;
    addBox(engine, root, "glassPane", [0.8, 0.7, 0.9], [1.6, 1.2, 0.05], glassMat);

    // AlphaCutoff transparent-ish blocker in front of emissive green pillar (alpha < alphaCutoff -> must NOT occlude depth!)
    const light = root.createChild("sun").addComponent(DirectLight);
    light.intensity = 1.0;

    const beaconMat = new PBRMaterial(engine);
    beaconMat.emissiveColor = new Color(0, 4, 0, 1);
    beaconMat.screenSpaceReflectionIntensity = 0;
    addBox(engine, root, "greenBeacon", [0, 1.2, -2.0], [2.5, 2.0, 0.3], beaconMat);

    const alphaCutMat = new PBRMaterial(engine);
    alphaCutMat.baseColor = new Color(1, 0, 0, 0.2);
    alphaCutMat.alphaCutoff = 0.5;
    alphaCutMat.renderFace = RenderFace.Double;
    alphaCutMat.screenSpaceReflectionIntensity = 0;
    addBox(engine, root, "discardedWall", [0, 1.2, -1.2], [3.5, 2.4, 0.1], alphaCutMat);

    scene.screenSpaceReflection.enabled = true;
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.Medium;
    stepFrames(engine, 3);

    const ssrPass = getSSRPass(cam);
    expect(ssrPass._state).toBe(SSRState.ActiveSteady);
    expect(ssrPass._frame.transparentReceiverCount).toBeGreaterThanOrEqual(2);
    expect(drainGlErrors(gl)).toEqual([]);

    // Water must reflect green beacon even though discarded alphaCutoff wall is in front!
    const waterPixels = sampleRegionRGB(tex, 0.2, 0.65, 0.55, 0.95);
    expect(waterPixels.maxG).toBeGreaterThan(20);

    // Glass-over-water overlap region must render cleanly without black corruption
    const glassOverlapPixels = sampleRegionRGB(tex, 0.55, 0.45, 0.85, 0.75);
    expect(glassOverlapPixels.zeroBlackPixels).toBeLessThan(glassOverlapPixels.count);
    expect(glassOverlapPixels.avgG).toBeGreaterThan(5);

    rt.destroy(true);
    tex.destroy(true);
  });

  it("isolates multi-camera state and gracefully downgrades / falls back to IBL when exceeding maxFragmentTextureUnits", async () => {
    const { engine, scene, gl } = await createTestEngine(160, 120);
    createdEngines.push(engine);

    const root = scene.createRootEntity("root");
    const camAEnt = root.createChild("camA");
    camAEnt.transform.setPosition(-2, 1.5, 4);
    camAEnt.transform.lookAt(new Vector3(0, 0, 0));
    const camA = camAEnt.addComponent(Camera);

    const camBEnt = root.createChild("camB");
    camBEnt.transform.setPosition(2, 1.5, 4);
    camBEnt.transform.lookAt(new Vector3(0, 0, 0));
    const camB = camBEnt.addComponent(Camera);
    camB.priority = 1;
    const overrideB = new ScreenSpaceReflection();
    overrideB.enabled = true;
    overrideB.quality = ScreenSpaceReflectionQuality.Low;
    camB.screenSpaceReflectionOverride = overrideB;

    const { rt: rtA, tex: texA } = createReadbackRT(engine, 160, 120);
    const { rt: rtB, tex: texB } = createReadbackRT(engine, 160, 120);
    camA.renderTarget = rtA;
    camB.renderTarget = rtB;

    const floorMat = new PBRMaterial(engine);
    floorMat.roughness = 0.08;
    addPlane(engine, root, "floor", [0, 0, 0], 10, 10, floorMat);

    scene.screenSpaceReflection.enabled = true;
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.High;

    stepFrames(engine, 3);
    const ssrPassA = getSSRPass(camA);
    const ssrPassB = getSSRPass(camB);
    expect(ssrPassA._state).toBe(SSRState.ActiveSteady);
    expect(ssrPassA._resources.ssrDepthTex!.width).toBe(80);
    expect(ssrPassB._state).toBe(SSRState.FirstTrace);
    expect(ssrPassB._resources.ssrDepthTex!.width).toBe(40);
    expect(drainGlErrors(gl)).toEqual([]);

    // Simulate tight mobile texture-unit ceiling (maxFragmentTextureUnits = 2) -> must downgrade to IBL cleanly without GL errors
    const cap = engine._hardwareRenderer.capability as { maxFragmentTextureUnits: number };
    const origDesc =
      Object.getOwnPropertyDescriptor(Object.getPrototypeOf(cap), "maxFragmentTextureUnits") ??
      Object.getOwnPropertyDescriptor(cap, "maxFragmentTextureUnits");
    Object.defineProperty(cap, "maxFragmentTextureUnits", { configurable: true, get: () => 2 });
    try {
      stepFrames(engine, 2);
      expect(drainGlErrors(gl)).toEqual([]);
    } finally {
      if (origDesc) {
        Object.defineProperty(cap, "maxFragmentTextureUnits", origDesc);
      } else {
        // @ts-ignore
        delete cap.maxFragmentTextureUnits;
      }
    }

    rtA.destroy(true);
    texA.destroy(true);
    rtB.destroy(true);
    texB.destroy(true);
  });

  it("keeps estimated VRAM within reasonable mobile budgets at 1280x720", async () => {
    const { engine, scene } = await createTestEngine(1280, 720);
    createdEngines.push(engine);

    const root = scene.createRootEntity("root");
    const camEnt = root.createChild("cam");
    camEnt.transform.setPosition(0, 1.5, 4);
    camEnt.transform.lookAt(new Vector3(0, 0, 0));
    const cam = camEnt.addComponent(Camera);

    const floorMat = new PBRMaterial(engine);
    floorMat.roughness = 0.1;
    addPlane(engine, root, "floor", [0, 0, 0], 8, 8, floorMat);

    scene.screenSpaceReflection.enabled = true;
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.Low;
    stepFrames(engine, 3);
    const ssrPass = getSSRPass(cam);
    const lowBytes = getSSRRetainedBytes(ssrPass);

    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.High;
    stepFrames(engine, 3);
    const highBytes = getSSRRetainedBytes(ssrPass);

    expect(lowBytes).toBeGreaterThan(0);
    expect(lowBytes).toBeLessThan(highBytes);
    expect(highBytes).toBeLessThan(48 * 1024 * 1024);
  });

  it("CR-001: retries legal Forward variants on real WebGL2 texture-unit link failure without dropping draws", async () => {
    const { engine, scene, gl } = await createTestEngine(128, 96);
    createdEngines.push(engine);

    const maxUnits = engine._hardwareRenderer.capability.maxFragmentTextureUnits;
    const root = scene.createRootEntity("root");
    const camEnt = root.createChild("cam");
    camEnt.transform.setPosition(0, 0, 4);
    camEnt.transform.lookAt(new Vector3(0, 0, 0));
    const cam = camEnt.addComponent(Camera);

    const { rt, tex } = createReadbackRT(engine, 128, 96);
    cam.renderTarget = rt;

    // Populate enough features so PBR Forward approaches or reaches MAX_TEXTURE_IMAGE_UNITS
    const texDummy = createSolidRGBA8Tex(engine, 255, 255, 255, 255);
    const greenTex = createSolidRGBA8Tex(engine, 0, 255, 0, 255);
    const pbrMat = new PBRMaterial(engine);
    pbrMat.roughness = 0.08;
    pbrMat.emissiveColor = new Color(0, 1, 0, 1);

    const slots: Array<{ enable: () => void; disable: () => void }> = [
      { enable: () => (pbrMat.baseTexture = greenTex), disable: () => (pbrMat.baseTexture = null!) },
      { enable: () => (pbrMat.normalTexture = texDummy), disable: () => (pbrMat.normalTexture = null!) },
      {
        enable: () => (pbrMat.roughnessMetallicTexture = texDummy),
        disable: () => (pbrMat.roughnessMetallicTexture = null!)
      },
      { enable: () => (pbrMat.emissiveTexture = greenTex), disable: () => (pbrMat.emissiveTexture = null!) },
      { enable: () => (pbrMat.occlusionTexture = texDummy), disable: () => (pbrMat.occlusionTexture = null!) },
      {
        enable: () => {
          pbrMat.clearCoat = 1.0;
          pbrMat.clearCoatTexture = texDummy;
        },
        disable: () => {
          pbrMat.clearCoat = 0;
          pbrMat.clearCoatTexture = null!;
        }
      },
      {
        enable: () => (pbrMat.clearCoatRoughnessTexture = texDummy),
        disable: () => (pbrMat.clearCoatRoughnessTexture = null!)
      },
      {
        enable: () => (pbrMat.clearCoatNormalTexture = texDummy),
        disable: () => (pbrMat.clearCoatNormalTexture = null!)
      },
      {
        enable: () => {
          pbrMat.anisotropy = 0.5;
          pbrMat.anisotropyTexture = texDummy;
        },
        disable: () => {
          pbrMat.anisotropy = 0;
          pbrMat.anisotropyTexture = null!;
        }
      },
      {
        enable: () => {
          pbrMat.iridescence = 0.5;
          pbrMat.iridescenceTexture = texDummy;
        },
        disable: () => {
          pbrMat.iridescence = 0;
          pbrMat.iridescenceTexture = null!;
        }
      },
      {
        enable: () => (pbrMat.iridescenceThicknessTexture = texDummy),
        disable: () => (pbrMat.iridescenceThicknessTexture = null!)
      },
      {
        enable: () => {
          pbrMat.sheenColor = new Color(0.2, 0.2, 0.2, 1);
          pbrMat.sheenColorTexture = texDummy;
        },
        disable: () => {
          pbrMat.sheenColor = new Color(0, 0, 0, 1);
          pbrMat.sheenColorTexture = null!;
        }
      },
      {
        enable: () => (pbrMat.sheenRoughnessTexture = texDummy),
        disable: () => (pbrMat.sheenRoughnessTexture = null!)
      },
      {
        enable: () => (pbrMat.specularIntensityTexture = texDummy),
        disable: () => (pbrMat.specularIntensityTexture = null!)
      },
      {
        enable: () => (pbrMat.specularColorTexture = texDummy),
        disable: () => (pbrMat.specularColorTexture = null!)
      },
      { enable: () => (pbrMat.transmissionTexture = texDummy), disable: () => (pbrMat.transmissionTexture = null!) },
      {
        enable: () => {
          pbrMat.thickness = 0.5;
          pbrMat.thicknessTexture = texDummy;
        },
        disable: () => {
          pbrMat.thickness = 0;
          pbrMat.thicknessTexture = null!;
        }
      }
    ];
    // Enable extra camera/shadow samplers if needed so non-SSR PBR easily saturates maxUnits
    const light = root.createChild("sun").addComponent(DirectLight);
    light.intensity = 1;
    pbrMat.transmission = 0.25;
    pbrMat.isTransparent = false;

    const quad = root.createChild("quad");
    const mr = quad.addComponent(MeshRenderer);
    mr.mesh = createQuadWithVertexColorAlpha(engine, 3, 3, 1, 1, 1, 1);
    mr.setMaterial(pbrMat);

    const pass = pbrMat.shader.subShaders[0].passes[2]; // Forward Pass
    const origGetProgram = pass._getShaderProgram.bind(pass);
    let lastActiveUnits = 0;
    const progSpy = vi.spyOn(pass, "_getShaderProgram").mockImplementation((eng, macros) => {
      const prog = origGetProgram(eng, macros);
      lastActiveUnits = prog.activeTextureCount;
      return prog;
    });

    let appliedCount = 0;
    while (appliedCount < slots.length) {
      slots[appliedCount++].enable();
      scene.screenSpaceReflection.enabled = false;
      engine.update();
      if (lastActiveUnits >= maxUnits) {
        break;
      }
    }
    if (lastActiveUnits >= maxUnits) {
      expect(lastActiveUnits).toBe(maxUnits);

      // Measure SSR Off baseline first
      scene.screenSpaceReflection.enabled = false;
      stepFrames(engine, 2);
      const offPixels = sampleRegionRGB(tex, 0.35, 0.35, 0.65, 0.65);
      expect(offPixels.maxG).toBeGreaterThan(100);

      // Enable SSR High: without CR-001 fix, driver link fails and Forward draw is completely dropped (maxG = 0)
      const linkSeenInvalid: boolean[] = [];
      progSpy.mockImplementation((eng, macros) => {
        const prog = origGetProgram(eng, macros);
        linkSeenInvalid.push(prog.isValid);
        return prog;
      });
      scene.screenSpaceReflection.enabled = true;
      scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.High;
      stepFrames(engine, 3);
      expect(linkSeenInvalid).toContain(false);
      const highPixels = sampleRegionRGB(tex, 0.35, 0.35, 0.65, 0.65);
      expect(highPixels.maxG).toBeGreaterThan(100);
      expect(drainGlErrors(gl)).toEqual([]);

      // Now free 2 actually applied slots + add a transparent receiver so verifyDepth is required:
      // High (3 SSR textures) fails linking -> must downgrade to VerifyDepth (2 SSR textures), NOT lose verification
      slots[appliedCount - 1].disable();
      slots[appliedCount - 2].disable();
      const transMat = new PBRMaterial(engine);
      transMat.isTransparent = true;
      transMat.roughness = 0.05;
      transMat.baseColor = new Color(1, 1, 1, 0.5);
      addPlane(engine, root, "transHelper", [0, -0.5, 0], 1, 1, transMat);

      const verifyDepthMacro = ShaderMacro.getByName("CAMERA_SSR_VERIFY_RECEIVER_DEPTH");
      const bilateralMacro = ShaderMacro.getByName("CAMERA_SSR_BILATERAL_SAMPLE");
      const downgradeAttempts: Array<{ valid: boolean; verifyDepth: boolean; bilateral: boolean }> = [];
      progSpy.mockImplementation((eng, macros) => {
        const prog = origGetProgram(eng, macros);
        downgradeAttempts.push({
          valid: prog.isValid,
          verifyDepth: macros.isEnable(verifyDepthMacro),
          bilateral: macros.isEnable(bilateralMacro)
        });
        return prog;
      });

      stepFrames(engine, 3);
      progSpy.mockRestore();
      expect(downgradeAttempts.some((a) => !a.valid && a.bilateral)).toBe(true);
      expect(downgradeAttempts.some((a) => a.valid && !a.bilateral && a.verifyDepth)).toBe(true);
      const partialDowngradePixels = sampleRegionRGB(tex, 0.35, 0.35, 0.65, 0.65);
      expect(partialDowngradePixels.maxG).toBeGreaterThan(100);
      expect(drainGlErrors(gl)).toEqual([]);
    } else {
      // Desktop drivers such as Apple Metal ANGLE expose MAX_TEXTURE_IMAGE_UNITS = 32 (> PBR max samplers).
      // Verify (1) PBR activeTextureCount > capability.maxFragmentTextureUnits fallback chain and
      // (2) real WebGL2 gl.linkProgram texture-unit failure retry using a shader that saturates hardware maxUnits.
      expect(lastActiveUnits).toBeGreaterThanOrEqual(16);
      // @ts-ignore simulate mobile maxFragmentTextureUnits ceiling equal to PBR baseline
      engine._hardwareRenderer.capability._maxFragmentTextureUnits = lastActiveUnits;

      scene.screenSpaceReflection.enabled = false;
      stepFrames(engine, 2);
      const offPixels = sampleRegionRGB(tex, 0.35, 0.35, 0.65, 0.65);
      expect(offPixels.maxG).toBeGreaterThan(100);

      const capAttempts: Array<{ valid: boolean; activeUnits: number; bilateral: boolean }> = [];
      const bilateralMacro = ShaderMacro.getByName("CAMERA_SSR_BILATERAL_SAMPLE");
      const verifyDepthMacro = ShaderMacro.getByName("CAMERA_SSR_VERIFY_RECEIVER_DEPTH");
      progSpy.mockImplementation((eng, macros) => {
        const prog = origGetProgram(eng, macros);
        capAttempts.push({
          valid: prog.isValid,
          activeUnits: prog.activeTextureCount,
          bilateral: macros.isEnable(bilateralMacro)
        });
        return prog;
      });
      scene.screenSpaceReflection.enabled = true;
      scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.High;
      stepFrames(engine, 3);
      expect(capAttempts.some((a) => a.activeUnits > lastActiveUnits && a.bilateral)).toBe(true);
      expect(capAttempts.some((a) => a.valid && a.activeUnits <= lastActiveUnits)).toBe(true);
      expect(sampleRegionRGB(tex, 0.35, 0.35, 0.65, 0.65).maxG).toBeGreaterThan(100);
      expect(drainGlErrors(gl)).toEqual([]);

      slots[appliedCount - 1].disable();
      slots[appliedCount - 2].disable();
      const transMat = new PBRMaterial(engine);
      transMat.isTransparent = true;
      transMat.roughness = 0.05;
      transMat.baseColor = new Color(1, 1, 1, 0.5);
      addPlane(engine, root, "transHelper", [0, -0.5, 0], 1, 1, transMat);

      const downgradeAttempts: Array<{
        valid: boolean;
        activeUnits: number;
        verifyDepth: boolean;
        bilateral: boolean;
      }> = [];
      progSpy.mockImplementation((eng, macros) => {
        const prog = origGetProgram(eng, macros);
        downgradeAttempts.push({
          valid: prog.isValid,
          activeUnits: prog.activeTextureCount,
          verifyDepth: macros.isEnable(verifyDepthMacro),
          bilateral: macros.isEnable(bilateralMacro)
        });
        return prog;
      });
      stepFrames(engine, 3);
      progSpy.mockRestore();
      expect(downgradeAttempts.some((a) => a.activeUnits > lastActiveUnits && a.bilateral)).toBe(true);
      expect(
        downgradeAttempts.some((a) => a.valid && a.activeUnits <= lastActiveUnits && !a.bilateral && a.verifyDepth)
      ).toBe(true);
      expect(sampleRegionRGB(tex, 0.35, 0.35, 0.65, 0.65).maxG).toBeGreaterThan(100);
      expect(drainGlErrors(gl)).toEqual([]);

      // Real WebGL2 gl.linkProgram link-failure test at hardware maxUnits
      const linkEngine = await WebGLEngine.create({
        canvas: createCanvas(64, 64),
        graphicDeviceOptions: { alpha: false, antialias: false, stencil: true, preserveDrawingBuffer: true },
        shaderCompiler: new ShaderCompiler()
      });
      createdEngines.push(linkEngine);
      const linkScene = linkEngine.sceneManager.activeScene;
      const linkRoot = linkScene.createRootEntity("linkRoot");
      const linkCam = linkRoot.createChild("cam").addComponent(Camera);
      linkCam.entity.transform.setPosition(0, 0, 4);
      linkCam.entity.transform.lookAt(new Vector3(0, 0, 0));
      const linkRT = createReadbackRT(linkEngine, 64, 64);
      linkCam.renderTarget = linkRT.rt;

      const padCount = maxUnits;
      const padDecls = Array.from({ length: padCount }, (_, idx) => `sampler2D u_Pad_${idx};`).join("\n            ");
      const padSamples = Array.from({ length: padCount }, (_, idx) => `acc += texture2D(u_Pad_${idx}, v.v_uv);`).join(
        "\n              "
      );
      const linkShader = Shader.create(`Shader "Test/SSRSaturate${padCount}" {
        SubShader "Default" {
          UsePass "Pipeline/DepthOnly/Default/DepthOnly"
          Pass "Forward" {
            Tags { pipelineStage = "Forward" }
            VertexShader = vert;
            FragmentShader = frag;
            #include "ShaderLibrary/Common/Transform.glsl"
            #include "ShaderLibrary/Common/Attributes.glsl"
            ${padDecls}
            #ifdef CAMERA_ENABLE_SSR
              sampler2D camera_SSRTexture;
              sampler2D camera_SSRReceiverDepthTexture;
              #ifdef CAMERA_SSR_BILATERAL_SAMPLE
                sampler2D camera_SSRReceiverNormalRoughnessTexture;
              #endif
            #endif
            struct Varyings { vec2 v_uv; };
            Varyings vert(Attributes attr) {
              Varyings v;
              gl_Position = renderer_MVPMat * vec4(attr.POSITION, 1.0);
              v.v_uv = vec2(0.5);
              return v;
            }
            void frag(Varyings v) {
              vec4 acc = vec4(0.0);
              ${padSamples}
              #ifdef CAMERA_ENABLE_SSR
                acc += texture2D(camera_SSRTexture, v.v_uv);
                acc += texture2D(camera_SSRReceiverDepthTexture, v.v_uv);
                #ifdef CAMERA_SSR_BILATERAL_SAMPLE
                  acc += texture2D(camera_SSRReceiverNormalRoughnessTexture, v.v_uv);
                #endif
              #endif
              gl_FragColor = vec4(0.0, 1.0, 0.0, 1.0) + acc * 0.00001;
            }
          }
          UsePass "Pipeline/SSRReceiver/Default/SSRReceiver"
        }
      }`);
      try {
        const linkMat = new Material(linkEngine, linkShader);
        linkMat.screenSpaceReflectionIntensity = 1.0;
        const padTex = createSolidRGBA8Tex(linkEngine, 255, 255, 255, 255);
        for (let idx = 0; idx < padCount; idx++) {
          linkMat.shaderData.setTexture(`u_Pad_${idx}`, padTex);
        }
        const linkMr = linkRoot.createChild("quad").addComponent(MeshRenderer);
        linkMr.mesh = createQuadWithVertexColorAlpha(linkEngine, 3, 3, 1, 1, 1, 1);
        linkMr.setMaterial(linkMat);

        const linkPass = linkShader.subShaders[0].passes[1];
        const origLinkGetProg = linkPass._getShaderProgram.bind(linkPass);
        const linkStates: boolean[] = [];
        const linkSpy = vi.spyOn(linkPass, "_getShaderProgram").mockImplementation((eng, macros) => {
          const prog = origLinkGetProg(eng, macros);
          linkStates.push(prog.isValid);
          return prog;
        });

        linkScene.screenSpaceReflection.enabled = true;
        linkScene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.High;
        stepFrames(linkEngine, 3);
        linkSpy.mockRestore();

        expect(linkStates).toContain(false);
        expect(linkStates).toContain(true);
        expect(sampleRegionRGB(linkRT.tex, 0.35, 0.35, 0.65, 0.65).maxG).toBeGreaterThan(200);
        expect(drainGlErrors(linkEngine._hardwareRenderer.gl)).toEqual([]);

        padTex.destroy();
        linkMat.destroy();
      } finally {
        linkShader.destroy(true);
        linkRT.rt.destroy(true);
        linkRT.tex.destroy(true);
      }
    }

    rt.destroy(true);
    tex.destroy(true);
    texDummy.destroy(true);
    greenTex.destroy(true);
  });

  it("CR-002: excludes zero-alpha transparent PBR surfaces from stealing SSR receiver depth while preserving Transmission", async () => {
    const { engine, scene, gl } = await createTestEngine(128, 96);
    createdEngines.push(engine);

    const root = scene.createRootEntity("root");
    const camEnt = root.createChild("cam");
    camEnt.transform.setPosition(0, 0, 6);
    camEnt.transform.lookAt(new Vector3(0, 0, 0));
    const cam = camEnt.addComponent(Camera);

    const rearMat = new PBRMaterial(engine);
    rearMat.roughness = 0.05;
    const rearEnt = root.createChild("rear");
    rearEnt.transform.setPosition(0, 0, 0);
    const rearMR = rearEnt.addComponent(MeshRenderer);
    rearMR.mesh = createQuadWithVertexColorAlpha(engine, 8, 8, 1, 1, 1, 1);
    rearMR.setMaterial(rearMat);

    // Front transparent PBR with baseColor.a = 0 (eyeDepth ~4.0 vs rear ~6.0)
    const frontMat = new PBRMaterial(engine);
    frontMat.isTransparent = true;
    frontMat.baseColor = new Color(1, 0, 0, 0);
    frontMat.roughness = 0.05;
    const frontEnt = root.createChild("frontZeroAlpha");
    frontEnt.transform.setPosition(0, 0, 2);
    const frontMR = frontEnt.addComponent(MeshRenderer);
    frontMR.mesh = createQuadWithVertexColorAlpha(engine, 4, 4, 1, 1, 1, 1);
    frontMR.setMaterial(frontMat);

    scene.screenSpaceReflection.enabled = true;
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.Medium;
    stepFrames(engine, 3);

    // @ts-ignore access internal receiver depth texture
    const ssrPass = cam._renderPipeline._ssrPass;
    const readCenterDepth = (): number => {
      // @ts-ignore
      const history = ssrPass._history;
      // @ts-ignore
      const lastWrittenIdx = history.temporalPingPongIndex === 0 ? 1 : 0;
      const depthTex = history.recvDepthTex[lastWrittenIdx]!;
      const depths = readSSRDepthBuffer(depthTex, ssrPass._caps.usesPackedDepthRG8, cam.farClipPlane);
      const cx = Math.floor(depthTex.width / 2);
      const cy = Math.floor(depthTex.height / 2);
      return depths[cy * depthTex.width + cx];
    };

    // With zero-alpha front layer active, center receiver depth must be rear (~6.0), NOT front (~4.0)
    expect(readCenterDepth()).toBeCloseTo(6.0, 1);

    // Zero texture alpha variant on AlphaBlend material must also discard
    const zeroAlphaTex = createSolidRGBA8Tex(engine, 255, 0, 0, 0);
    frontMat.baseColor = new Color(1, 0, 0, 1);
    frontMat.baseTexture = zeroAlphaTex;
    stepFrames(engine, 2);
    expect(readCenterDepth()).toBeCloseTo(6.0, 1);
    frontMat.baseTexture = null!;

    // Zero vertex alpha variant on AlphaBlend material must also discard
    frontMR.enableVertexColor = true;
    frontMR.mesh = createQuadWithVertexColorAlpha(engine, 4, 4, 1, 1, 1, 0);
    stepFrames(engine, 2);
    expect(readCenterDepth()).toBeCloseTo(6.0, 1);

    // Non-blended Transmission with baseColor.a = 0 MUST keep receiving SSR (~4.0)
    const transmissiveMat = new PBRMaterial(engine);
    transmissiveMat.isTransparent = false;
    transmissiveMat.transmission = 1.0;
    transmissiveMat.baseColor = new Color(1, 1, 1, 0);
    transmissiveMat.roughness = 0.05;
    frontMR.enableVertexColor = false;
    frontMR.mesh = createQuadWithVertexColorAlpha(engine, 4, 4, 1, 1, 1, 1);
    frontMR.setMaterial(transmissiveMat);
    stepFrames(engine, 2);
    expect(readCenterDepth()).toBeCloseTo(4.0, 1);

    zeroAlphaTex.destroy(true);

    expect(drainGlErrors(gl)).toEqual([]);
  });

  it("CR-003: resolves closest opaque receiver deterministically across draw orders with PrePass and SAO", async () => {
    const { engine, scene, gl } = await createTestEngine(128, 80);
    createdEngines.push(engine);

    const root = scene.createRootEntity("root");
    const camEnt = root.createChild("cam");
    camEnt.transform.setPosition(0, 0, 6);
    camEnt.transform.lookAt(new Vector3(0, 0, 0));
    const cam = camEnt.addComponent(Camera);
    cam.depthTextureMode = DepthTextureMode.PrePass;

    const farMat = new PBRMaterial(engine);
    farMat.roughness = 0.05;
    const farEnt = root.createChild("farReceiver");
    farEnt.transform.setPosition(0, 0, -2); // eyeDepth = 8
    const farMR = farEnt.addComponent(MeshRenderer);
    farMR.mesh = createQuadWithVertexColorAlpha(engine, 12, 12, 1, 1, 1, 1);
    farMR.setMaterial(farMat);

    const nearMat = new PBRMaterial(engine);
    nearMat.roughness = 0.05;
    const nearEnt = root.createChild("nearReceiver");
    nearEnt.transform.setPosition(-0.2, 0, 2); // eyeDepth = 4, intentionally edges cutting across pixels
    const nearMR = nearEnt.addComponent(MeshRenderer);
    nearMR.mesh = createQuadWithVertexColorAlpha(engine, 2.3, 2.3, 1, 1, 1, 1);
    nearMR.setMaterial(nearMat);

    scene.screenSpaceReflection.enabled = true;
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.Medium;

    // @ts-ignore access internal receiver depth texture
    const ssrPass = cam._renderPipeline._getOrCreateSSRPass();
    const captureRecvDepth = (): Float32Array => {
      stepFrames(engine, 3);
      // @ts-ignore
      const history = ssrPass._history;
      // @ts-ignore
      const lastWrittenIdx = ssrPass._frame.preset.useTemporal ? (history.temporalPingPongIndex === 0 ? 1 : 0) : 0;
      const depthTex = history.recvDepthTex[lastWrittenIdx]!;
      return readSSRDepthBuffer(depthTex, ssrPass._caps.usesPackedDepthRG8, cam.farClipPlane);
    };

    // Order A: Near drawn BEFORE Far (the failing case under max-downsample + DepthWrite=false)
    nearMR.priority = 0;
    farMR.priority = 1;
    const depthsNearFirst = captureRecvDepth();

    // Order B: Far drawn BEFORE Near
    nearMR.priority = 1;
    farMR.priority = 0;
    const depthsFarFirst = captureRecvDepth();

    let diffCount = 0;
    let nearCount = 0;
    for (let i = 0; i < depthsNearFirst.length; i++) {
      if (Math.abs(depthsNearFirst[i] - 4.0) < 0.25) nearCount++;
      if (Math.abs(depthsNearFirst[i] - depthsFarFirst[i]) > 0.05) {
        diffCount++;
      }
    }
    expect(nearCount).toBeGreaterThan(20);
    expect(diffCount).toBe(0);

    // Re-verify with SAO enabled + Low (0.35x) preset
    scene.ambientOcclusion.enabled = true;
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.Low;
    nearMR.priority = 0;
    farMR.priority = 1;
    const lowNearFirst = captureRecvDepth();
    nearMR.priority = 1;
    farMR.priority = 0;
    const lowFarFirst = captureRecvDepth();
    let lowDiffCount = 0;
    for (let i = 0; i < lowNearFirst.length; i++) {
      if (Math.abs(lowNearFirst[i] - lowFarFirst[i]) > 0.05) {
        lowDiffCount++;
      }
    }
    expect(lowDiffCount).toBe(0);
    expect(drainGlErrors(gl)).toEqual([]);
  });

  it("CR-004: BuildHiZMipN reduces odd-sized depth intervals conservatively ([40,40,2,40,40] -> [2,2])", async () => {
    const { engine, scene, gl } = await createTestEngine(64, 64);
    createdEngines.push(engine);

    const root = scene.createRootEntity("root");
    const camEnt = root.createChild("cam");
    const cam = camEnt.addComponent(Camera);
    cam.farClipPlane = 100;
    const mat = new PBRMaterial(engine);
    mat.roughness = 0.05;
    addPlane(engine, root, "floor", [0, 0, -3], 4, 4, mat);

    scene.screenSpaceReflection.enabled = true;
    stepFrames(engine, 2);

    // @ts-ignore access internal BuildHiZMipN pass and capabilities
    const ssrPass = cam._renderPipeline._ssrPass;
    // @ts-ignore
    const material = ssrPass._material;
    const packed = ssrPass._caps.usesPackedDepthRG8;
    const format = ssrPass._caps.depthColorFormat;

    const createDepthInput = (values: number[]): Texture2D => {
      const tex = new Texture2D(engine, values.length, 1, format, false, false);
      tex.filterMode = TextureFilterMode.Point;
      tex.wrapModeU = TextureWrapMode.Clamp;
      tex.wrapModeV = TextureWrapMode.Clamp;
      if (packed) {
        const channels = format === TextureFormat.R8G8_UNorm ? 2 : 4;
        const bytes = new Uint8Array(values.length * channels);
        for (let i = 0; i < values.length; i++) {
          const u = Math.sqrt(Math.max(0, Math.min(1, values[i] / 100)));
          const enc = Math.round(u * 65535);
          bytes[i * channels] = (enc >> 8) & 0xff;
          bytes[i * channels + 1] = enc & 0xff;
          if (channels === 4) {
            bytes[i * 4 + 2] = 0;
            bytes[i * 4 + 3] = 255;
          }
        }
        tex.setPixelBuffer(bytes);
      } else {
        const halfs = new Uint16Array(values.map(encodeHalfFloat));
        tex.setPixelBuffer(halfs);
      }
      return tex;
    };

    const runMipN = (srcValues: number[], dstW: number): Float32Array => {
      const srcTex = createDepthInput(srcValues);
      const dstTex = new Texture2D(engine, dstW, 1, format, false, false);
      dstTex.filterMode = TextureFilterMode.Point;
      const dstRT = new RenderTarget(engine, dstW, 1, dstTex, null, 1);
      // @ts-ignore
      ssrPass._pyramidBuilder.sourceTexelSize.set(1 / srcValues.length, 1, srcValues.length, 1);
      // @ts-ignore
      ssrPass._pyramidBuilder.destTexelSize.set(1 / dstW, 1, dstW, 1);
      // @ts-ignore
      material.shaderData.setVector4("material_SSRSourceTexelSize", ssrPass._pyramidBuilder.sourceTexelSize);
      // @ts-ignore
      material.shaderData.setVector4("material_SSRDestTexelSize", ssrPass._pyramidBuilder.destTexelSize);
      engine._renderContext.camera = cam;
      Blitter.blitTexture(engine, srcTex, dstRT, 0, new Vector4(0, 0, 1, 1), material, 1, undefined, 0);
      const out = readSSRDepthBuffer(dstTex, packed, 100);
      dstRT.destroy(true);
      dstTex.destroy(true);
      srcTex.destroy(true);
      return out;
    };

    // 5 -> 2: center pixel (idx 2, depth 2.0) overlaps BOTH dst=0 and dst=1 -> [2, 2], NOT [40, 2]
    const out5to2 = runMipN([40, 40, 2, 40, 40], 2);
    expect(out5to2[0]).toBeLessThan(2.1);
    expect(out5to2[0]).toBeGreaterThan(1.9);
    expect(out5to2[1]).toBeLessThan(2.1);
    expect(out5to2[1]).toBeGreaterThan(1.9);

    // 7 -> 3: intervals overlap middle texels conservatively -> [2, 2, 2]
    const out7to3 = runMipN([40, 40, 2, 40, 2, 40, 40], 3);
    expect(out7to3[0]).toBeLessThan(2.1);
    expect(out7to3[1]).toBeLessThan(2.1);
    expect(out7to3[2]).toBeLessThan(2.1);
    expect(drainGlErrors(gl)).toEqual([]);
  });

  it("CR-005: captures color history strictly from camera viewport without bleeding neighboring split-screen regions", async () => {
    const { engine, scene, gl } = await createTestEngine(128, 64);
    createdEngines.push(engine);

    const { rt: sharedRT, tex: sharedTex } = createReadbackRT(engine, 128, 64);
    const root = scene.createRootEntity("root");

    // Camera Left paints left half SOLID RED and does not run SSR
    const camLeftEnt = root.createChild("camLeft");
    camLeftEnt.transform.setPosition(0, 0, 5);
    const camLeft = camLeftEnt.addComponent(Camera);
    camLeft.renderTarget = sharedRT;
    camLeft.viewport = new Vector4(0, 0, 0.5, 1);
    camLeft.clearFlags = 7; // CameraClearFlags.All
    camLeft.enableScreenSpaceReflection = false;
    camLeft.priority = 0;

    // Right camera paints right half SOLID BLUE (with SSR enabled)
    const camRightEnt = root.createChild("camRight");
    camRightEnt.transform.setPosition(0, 0, 5);
    camRightEnt.transform.lookAt(new Vector3(0, 0, 0));
    const camRight = camRightEnt.addComponent(Camera);
    camRight.renderTarget = sharedRT;
    camRight.viewport = new Vector4(0.5, 0, 0.5, 1);
    camRight.clearFlags = 7; // CameraClearFlags.All
    camRight.priority = 1;

    // Red plane only visible on left? Easier: put an active RED full quad drawn via left camera,
    // or set solid background per-camera by driving manual camera.render() in two passes!
    // Use solid blue scene background and fill left half of sharedRT with RED before camRight renders.
    scene.background.solidColor.set(0, 0, 1, 1);

    const blueFloorMat = new PBRMaterial(engine);
    blueFloorMat.baseColor = new Color(0, 0, 1, 1);
    blueFloorMat.emissiveColor = new Color(0, 0, 1, 1);
    blueFloorMat.roughness = 0.05;
    addPlane(engine, root, "bluePlane", [0, 0, 0], 10, 10, blueFloorMat);

    // Pre-fill left half RED each frame by having camLeft draw a red unlit quad (background solid red on camLeft override via shader/material)
    const redMat = new UnlitMaterial(engine);
    redMat.baseColor = new Color(1, 0, 0, 1);
    const redEnt = root.createChild("redLeftCover");
    redEnt.transform.setPosition(0, 0, 1);
    redEnt.layer = 2; // Layer.Layer1 -> only camLeft sees it!
    const redMR = redEnt.addComponent(MeshRenderer);
    redMR.mesh = createQuadWithVertexColorAlpha(engine, 20, 20, 1, 1, 1, 1);
    redMR.setMaterial(redMat);
    camLeft.cullingMask = 2;
    camRight.cullingMask = 1;

    scene.screenSpaceReflection.enabled = true;
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.Medium;

    stepFrames(engine, 3);

    // Confirm sharedRT has RED on left and BLUE on right
    const leftHalfRT = sampleRegionRGB(sharedTex, 0.1, 0.2, 0.4, 0.8);
    const rightHalfRT = sampleRegionRGB(sharedTex, 0.6, 0.2, 0.9, 0.8);
    expect(leftHalfRT.avgR).toBeGreaterThan(200);
    expect(rightHalfRT.avgB).toBeGreaterThan(200);

    // Inspect camRight's prevColorPyramidTex: BOTH left and right halves must be BLUE (zero red bleed!)
    // @ts-ignore access internal history texture
    const pyrTex = camRight._renderPipeline._ssrPass._history.prevColorPyramidTex!;
    const pyrW = pyrTex.width;
    const pyrH = pyrTex.height;
    const isByte = pyrTex.format === TextureFormat.R8G8B8A8_UNorm;
    const buf = isByte ? new Uint8Array(pyrW * pyrH * 4) : new Float32Array(pyrW * pyrH * 4);
    pyrTex.getPixelBuffer(0, 0, pyrW, pyrH, 0, buf);
    const scale = isByte ? 1 / 255 : 1;
    let maxR = 0;
    let minB = Infinity;
    for (let i = 0; i < pyrW * pyrH; i++) {
      const r = buf[i * 4] * scale;
      const b = buf[i * 4 + 2] * scale;
      if (r > maxR) maxR = r;
      if (b < minB) minB = b;
    }
    expect(maxR).toBeLessThan(0.05);
    expect(minB).toBeGreaterThan(0.5);

    // Also test vertical split (camRight occupying TOP half viewport y=0.5..1.0, bottom half filled RED)
    camLeft.viewport = new Vector4(0, 0, 1, 0.5);
    camRight.viewport = new Vector4(0, 0.5, 1, 0.5);
    stepFrames(engine, 3);
    const vPyrTex = camRight._renderPipeline._ssrPass._history.prevColorPyramidTex!;
    const vBuf = isByte
      ? new Uint8Array(vPyrTex.width * vPyrTex.height * 4)
      : new Float32Array(vPyrTex.width * vPyrTex.height * 4);
    vPyrTex.getPixelBuffer(0, 0, vPyrTex.width, vPyrTex.height, 0, vBuf);
    let vMaxR = 0;
    let vMinB = Infinity;
    for (let i = 0; i < vPyrTex.width * vPyrTex.height; i++) {
      const r = vBuf[i * 4] * scale;
      const b = vBuf[i * 4 + 2] * scale;
      if (r > vMaxR) vMaxR = r;
      if (b < vMinB) vMinB = b;
    }
    expect(vMaxR).toBeLessThan(0.05);
    expect(vMinB).toBeGreaterThan(0.5);
    expect(drainGlErrors(gl)).toEqual([]);

    sharedRT.destroy(true);
    sharedTex.destroy(true);
  });

  it("CR-006: keeps Unlit AlphaTest DepthOnly consistent with Unlit Forward when vertex color alpha is 0", async () => {
    const { engine, scene, gl } = await createTestEngine(128, 96);
    createdEngines.push(engine);

    const root = scene.createRootEntity("root");
    const camEnt = root.createChild("cam");
    camEnt.transform.setPosition(0, 0, 6);
    camEnt.transform.lookAt(new Vector3(0, 0, 0));
    const cam = camEnt.addComponent(Camera);

    const { rt, tex } = createReadbackRT(engine, 128, 96);
    cam.renderTarget = rt;

    // Rear reflective floor/wall at z = 0 (eyeDepth = 6.0)
    const rearMat = new PBRMaterial(engine);
    rearMat.baseColor = new Color(1, 0, 0, 1);
    rearMat.emissiveColor = new Color(1, 0, 0, 1);
    rearMat.roughness = 0.05;
    addPlane(engine, root, "rear", [0, 0, 0], 10, 10, rearMat);
    const rearQuad = root.createChild("rearQuad");
    rearQuad.transform.setPosition(0, 0, 0);
    const rearMR = rearQuad.addComponent(MeshRenderer);
    rearMR.mesh = createQuadWithVertexColorAlpha(engine, 8, 8, 1, 1, 1, 1);
    rearMR.setMaterial(rearMat);

    // Front quad at z = 2 (eyeDepth = 4.0) with vertex alpha = 0 and alphaCutoff = 0.5
    const unlitMat = new UnlitMaterial(engine);
    unlitMat.baseColor = new Color(0, 1, 0, 1);
    unlitMat.alphaCutoff = 0.5;
    const frontEnt = root.createChild("frontCutout");
    frontEnt.transform.setPosition(0, 0, 2);
    const frontMR = frontEnt.addComponent(MeshRenderer);
    frontMR.enableVertexColor = true;
    frontMR.mesh = createQuadWithVertexColorAlpha(engine, 4, 4, 1, 1, 1, 0);
    frontMR.setMaterial(unlitMat);

    scene.screenSpaceReflection.enabled = true;
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.Medium;
    stepFrames(engine, 3);

    // Unlit Forward ignores vertex alpha -> center color is GREEN AND latest Hi-Z mip0 center is ~4.0
    const unlitColor = sampleRegionRGB(tex, 0.45, 0.45, 0.55, 0.55);
    expect(unlitColor.avgG).toBeGreaterThan(200);
    // @ts-ignore access internal Hi-Z mip0 history depth
    const ssrPass = cam._renderPipeline._ssrPass;
    const readTraceCenter = (): number => {
      // @ts-ignore
      const history = ssrPass._history;
      const lastHiZIdx = history.hiZPingPongIndex === 0 ? 1 : 0;
      const traceDepthTex = history.hiZTex[lastHiZIdx]!;
      const depths = readSSRDepthBuffer(traceDepthTex, ssrPass._caps.usesPackedDepthRG8, cam.farClipPlane);
      const cx = Math.floor(traceDepthTex.width / 2);
      const cy = Math.floor(traceDepthTex.height / 2);
      return depths[cy * traceDepthTex.width + cx];
    };
    expect(readTraceCenter()).toBeCloseTo(4.0, 1);

    // Switch to PBR alphaCutoff = 0.5 on same vertexAlpha=0 mesh -> PBR multiplies vertex alpha -> discarded in BOTH Forward & DepthOnly (~6.0)
    const pbrCutMat = new PBRMaterial(engine);
    pbrCutMat.baseColor = new Color(0, 1, 0, 1);
    pbrCutMat.emissiveColor = new Color(0, 1, 0, 1);
    pbrCutMat.alphaCutoff = 0.5;
    frontMR.setMaterial(pbrCutMat);
    stepFrames(engine, 2);
    const pbrColor = sampleRegionRGB(tex, 0.45, 0.45, 0.55, 0.55);
    expect(pbrColor.avgR).toBeGreaterThan(200);
    expect(readTraceCenter()).toBeCloseTo(6.0, 1);

    // Switch to BlinnPhong alphaCutoff = 0.5 on same vertexAlpha=0 mesh -> multiplies vertex alpha -> discarded in BOTH Forward & DepthOnly (~6.0)
    const bpCutMat = new BlinnPhongMaterial(engine);
    bpCutMat.baseColor = new Color(0, 1, 0, 1);
    bpCutMat.emissiveColor = new Color(0, 1, 0, 1);
    bpCutMat.alphaCutoff = 0.5;
    frontMR.setMaterial(bpCutMat);
    stepFrames(engine, 2);
    const bpColor = sampleRegionRGB(tex, 0.45, 0.45, 0.55, 0.55);
    expect(bpColor.avgR).toBeGreaterThan(200);
    expect(readTraceCenter()).toBeCloseTo(6.0, 1);
    expect(drainGlErrors(gl)).toEqual([]);

    rt.destroy(true);
    tex.destroy(true);
  });

  it("CR-007: deserializes $type Camera.screenSpaceReflectionOverride loaded via SceneLoader", async () => {
    const { engine, gl } = await createTestEngine(96, 64);
    createdEngines.push(engine);

    const sceneJson = {
      version: "2.0",
      refs: [],
      entities: [
        {
          name: "camEntity",
          position: [0, 1.5, 4],
          components: [0]
        },
        {
          name: "floor",
          position: [0, 0, 0],
          components: []
        }
      ],
      components: [
        {
          type: "Camera",
          props: {
            screenSpaceReflectionOverride: {
              $type: "ScreenSpaceReflection",
              enabled: true,
              quality: 1,
              maxDistance: 33
            }
          }
        }
      ],
      scene: {
        name: "CR007Scene",
        rootEntities: [0, 1],
        background: { mode: BackgroundMode.SolidColor, color: [0, 0, 0, 1] }
      }
    };

    const loadedScene = await engine.resourceManager.load<Scene>({
      url: createBlobURL(sceneJson, "scene"),
      type: AssetType.Scene
    });
    engine.sceneManager.activeScene = loadedScene;

    const camEnt = loadedScene.findEntityByName("camEntity")!;
    const cam = camEnt.getComponent(Camera)!;
    expect(cam.screenSpaceReflectionOverride).toBeInstanceOf(ScreenSpaceReflection);
    expect(cam.screenSpaceReflectionOverride!.enabled).toBe(true);
    expect(cam.screenSpaceReflectionOverride!.quality).toBe(ScreenSpaceReflectionQuality.Medium);
    expect(cam.screenSpaceReflectionOverride!.maxDistance).toBe(33);

    // Add reflective plane and ensure zero runtime errors when rendering
    const floorMat = new PBRMaterial(engine);
    floorMat.roughness = 0.05;
    addPlane(engine, loadedScene.findEntityByName("floor")!, "plane", [0, 0, 0], 6, 6, floorMat);

    expect(() => stepFrames(engine, 3)).not.toThrow();
    expect(getSSRPass(cam)._state).toBe(SSRState.ActiveSteady);

    // Direct ScreenSpaceReflection instance assignment & clone also preserve override cleanly
    const directOverride = new ScreenSpaceReflection();
    directOverride.enabled = true;
    directOverride.quality = ScreenSpaceReflectionQuality.High;
    directOverride.intensity = 1.4;
    cam.screenSpaceReflectionOverride = directOverride;
    expect(cam.screenSpaceReflectionOverride).toBe(directOverride);
    expect(cam.screenSpaceReflectionOverride!.quality).toBe(ScreenSpaceReflectionQuality.High);
    const clonedCam = camEnt.clone().getComponent(Camera)!;
    expect(clonedCam.screenSpaceReflectionOverride).toBeInstanceOf(ScreenSpaceReflection);
    expect(clonedCam.screenSpaceReflectionOverride).not.toBe(cam.screenSpaceReflectionOverride);
    expect(clonedCam.screenSpaceReflectionOverride!.intensity).toBe(1.4);
    expect(drainGlErrors(gl)).toEqual([]);
  });

  it("CR-008: contains transient RT allocation errors in SSR, releases borrowed pool RTs, and keeps Forward rendering", async () => {
    const { engine, scene, gl } = await createTestEngine(128, 96);
    createdEngines.push(engine);

    const root = scene.createRootEntity("root");
    const camEnt = root.createChild("cam");
    camEnt.transform.setPosition(0, 0, 5);
    camEnt.transform.lookAt(new Vector3(0, 0, 0));
    const cam = camEnt.addComponent(Camera);

    const { rt, tex } = createReadbackRT(engine, 128, 96);
    cam.renderTarget = rt;

    const mat = new PBRMaterial(engine);
    mat.baseColor = new Color(0, 0, 1, 1);
    mat.emissiveColor = new Color(0, 0, 1, 1);
    mat.roughness = 0.08;
    const mr = root.createChild("blueQuad").addComponent(MeshRenderer);
    mr.mesh = createQuadWithVertexColorAlpha(engine, 6, 6, 1, 1, 1, 1);
    mr.setMaterial(mat);

    scene.screenSpaceReflection.enabled = true;
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.High;

    // Warm up color history so Frame 2 enters Hi-Z pyramid allocation
    engine.update();
    const ssrPass = getSSRPass(cam);
    expect(ssrPass._state).toBe(SSRState.WarmupColor);

    const pool = engine._renderTargetPool;
    const origAlloc = pool.allocateRenderTarget.bind(pool);
    const rhi = engine._hardwareRenderer;
    const origCreateRT = rhi.createPlatformRenderTarget.bind(rhi);

    // 1) Inject failure on persistent Hi-Z colorRT allocation inside prepare()/_ensurePersistentResources()
    // @ts-ignore
    ssrPass._deactivate(SSRState.Skipped, cam);
    let persistentHiZFailed = false;
    const spyPersistentHiZ = vi.spyOn(rhi, "createPlatformRenderTarget").mockImplementation((target) => {
      const colorTex = target.getColorTexture(0);
      if (
        !persistentHiZFailed &&
        colorTex &&
        colorTex.format === ssrPass._caps.depthColorFormat &&
        colorTex.mipmapCount > 1 &&
        target.depthTexture === null
      ) {
        persistentHiZFailed = true;
        throw new Error("Simulated persistent Hi-Z RT allocation failure");
      }
      return origCreateRT(target);
    });

    expect(() => engine.update()).not.toThrow();
    spyPersistentHiZ.mockRestore();
    expect(persistentHiZFailed).toBe(true);

    // Forward MUST still have rendered blue output and zero Hi-Z scratches leaked
    const afterHiZFail = sampleRegionRGB(tex, 0.35, 0.35, 0.65, 0.65);
    expect(afterHiZFail.avgB).toBeGreaterThan(200);
    // @ts-ignore
    expect(ssrPass._pyramidBuilder.hiZScratchRTs.length).toBe(0);
    expect(isSSRActiveForCamera(cam)).toBe(false);

    // Recover cleanly across next frames
    stepFrames(engine, 3);
    expect(ssrPass._state).toBe(SSRState.ActiveSteady);

    // 2) Cover Hi-Z fallback scratch allocation failure (1st pool depth RT when _forceHiZScratch = true)
    // @ts-ignore
    ssrPass._forceHiZScratch = true;
    let hiZFallbackAllocs = 0;
    const spyHiZFallback = vi.spyOn(pool, "allocateRenderTarget").mockImplementation((...args) => {
      if (args[2] === ssrPass._caps.depthColorFormat) {
        hiZFallbackAllocs++;
        if (hiZFallbackAllocs === 1) {
          throw new Error("Simulated Hi-Z scratch RT allocation failure");
        }
      }
      return origAlloc(...args);
    });
    expect(() => engine.update()).not.toThrow();
    spyHiZFallback.mockRestore();
    // @ts-ignore
    ssrPass._forceHiZScratch = false;
    // @ts-ignore
    expect(ssrPass._pyramidBuilder.hiZScratchRTs.length).toBe(0);
    expect(isSSRActiveForCamera(cam)).toBe(false);

    stepFrames(engine, 3);
    expect(ssrPass._state).toBe(SSRState.ActiveSteady);

    // Inject failure on mip-1 ColorPyramid scratch allocation inside software fallback captureHistory
    // @ts-ignore
    ssrPass._forceSoftwareColorPyramidMipmaps = true;
    let colorPyrAllocs = 0;
    const spyColor = vi.spyOn(pool, "allocateRenderTarget").mockImplementation((...args) => {
      if (args[2] === ssrPass._caps.colorPyramidFormat && args[0] < 128) {
        colorPyrAllocs++;
        if (colorPyrAllocs === 1) {
          throw new Error("Simulated ColorPyramid RT allocation failure");
        }
      }
      return origAlloc(...args);
    });

    expect(() => engine.update()).not.toThrow();
    spyColor.mockRestore();
    // @ts-ignore
    ssrPass._forceSoftwareColorPyramidMipmaps = false;

    // @ts-ignore
    expect(ssrPass._pyramidBuilder.colorScratchRTs.length).toBe(0);
    expect(isSSRActiveForCamera(cam)).toBe(false);
    const afterColorFail = sampleRegionRGB(tex, 0.35, 0.35, 0.65, 0.65);
    expect(afterColorFail.avgB).toBeGreaterThan(200);

    // Must recover back to ActiveSteady afterwards with zero GL errors
    stepFrames(engine, 3);
    expect(ssrPass._state).toBe(SSRState.ActiveSteady);
    expect(drainGlErrors(gl)).toEqual([]);

    rt.destroy(true);
    tex.destroy(true);
  });

  it("Item 1: attaches hardware Stencil (_ssrDepthTex) to Temporal Resolve ping-pong RTs and clears background to 0", async () => {
    const { engine, scene, gl } = await createTestEngine(128, 96);
    createdEngines.push(engine);

    const root = scene.createRootEntity("root");
    const camEnt = root.createChild("cam");
    camEnt.transform.setPosition(0, 0, 6);
    camEnt.transform.lookAt(new Vector3(0, 0, 0));
    const cam = camEnt.addComponent(Camera);

    // Small reflective box in center, surrounded by non-receiver sky/background
    const boxMat = new PBRMaterial(engine);
    boxMat.roughness = 0.05;
    boxMat.emissiveColor = new Color(0.2, 0.5, 1.0, 1);
    const boxEnt = root.createChild("centerReceiver");
    const mr = boxEnt.addComponent(MeshRenderer);
    mr.mesh = createQuadWithVertexColorAlpha(engine, 2, 2, 1, 1, 1, 1);
    mr.setMaterial(boxMat);

    scene.screenSpaceReflection.enabled = true;
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.Medium;
    stepFrames(engine, 4);

    // @ts-ignore access internal ping-pong RTs & depth
    const ssrPass = cam._renderPipeline._ssrPass;
    // @ts-ignore
    const history = ssrPass._history;
    // @ts-ignore
    expect(history.ssrPingPongRT[0]!.depthTexture).toBe(ssrPass._resources.ssrDepthTex);
    // @ts-ignore
    expect(history.ssrPingPongRT[1]!.depthTexture).toBe(ssrPass._resources.ssrDepthTex);

    // Background corner pixel outside center receiver must stay (0,0,0,0) in active ping-pong output
    const writtenIdx = history.temporalPingPongIndex === 0 ? 1 : 0;
    const outTex = history.ssrPingPongTex[writtenIdx]!;
    const outPixels = new Uint8Array(outTex.width * outTex.height * 4);
    outTex.getPixelBuffer(0, 0, outTex.width, outTex.height, 0, outPixels);
    expect(outPixels[0]).toBe(0);
    expect(outPixels[1]).toBe(0);
    expect(outPixels[2]).toBe(0);
    expect(outPixels[3]).toBe(0);

    // Toggling Scheme B (_useHardwareStencil = false) cleanly detaches depth from ping-pong RTs
    ssrPass._useHardwareStencil = false;
    stepFrames(engine, 3);
    expect(history.ssrPingPongRT[0]!.depthTexture).toBeNull();
    expect(history.ssrPingPongRT[1]!.depthTexture).toBeNull();
    expect(drainGlErrors(gl)).toEqual([]);
  });

  it("Item 2: executes fwidth uniformly before non-uniform roughness/ClearCoat branches in Forward PBR", async () => {
    const { engine, scene, gl } = await createTestEngine(128, 96);
    createdEngines.push(engine);

    const root = scene.createRootEntity("root");
    const camEnt = root.createChild("cam");
    camEnt.transform.setPosition(0, 1.5, 4);
    camEnt.transform.lookAt(new Vector3(0, 0, 0));
    const cam = camEnt.addComponent(Camera);

    // Spatially varying roughnessMetallicTexture & clearCoatTexture straddling maxRoughness (0.5) & 0.1
    const varyingRoughTex = new Texture2D(engine, 4, 4, TextureFormat.R8G8B8A8_UNorm, false, false);
    const data = new Uint8Array(4 * 4 * 4);
    for (let i = 0; i < 16; i++) {
      data[i * 4] = i % 2 === 0 ? 10 : 240; // R: clearCoat
      data[i * 4 + 1] = i % 2 === 0 ? 10 : 240; // G: roughness
      data[i * 4 + 2] = 0;
      data[i * 4 + 3] = 255;
    }
    varyingRoughTex.setPixelBuffer(data);

    const mat = new PBRMaterial(engine);
    mat.roughness = 1.0;
    mat.roughnessMetallicTexture = varyingRoughTex;
    mat.clearCoat = 1.0;
    mat.clearCoatTexture = varyingRoughTex;
    mat.clearCoatRoughness = 0.05;
    addPlane(engine, root, "floor", [0, 0, 0], 6, 6, mat);

    const transMat = new PBRMaterial(engine);
    transMat.isTransparent = true;
    transMat.roughness = 0.05;
    transMat.baseColor = new Color(0.5, 0.7, 1.0, 0.4);
    addPlane(engine, root, "water", [0, 0.2, 0], 3, 3, transMat);

    scene.screenSpaceReflection.enabled = true;
    scene.screenSpaceReflection.maxRoughness = 0.5;
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.Medium;
    stepFrames(engine, 3);
    expect(getSSRPass(cam)._state).toBe(SSRState.ActiveSteady);
    expect(drainGlErrors(gl)).toEqual([]);

    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.High;
    stepFrames(engine, 3);
    expect(getSSRPass(cam)._state).toBe(SSRState.ActiveSteady);
    expect(drainGlErrors(gl)).toEqual([]);

    varyingRoughTex.destroy(true);
  });

  it("Items 3.2 & 4: uses in-place Hi-Z & hardware generateMipmaps with zero mip-1 scratches, preserves valid mips, and reclaims Skipped after 10 idle frames", async () => {
    const { engine, scene, gl } = await createTestEngine(160, 120);
    createdEngines.push(engine);

    const root = scene.createRootEntity("root");
    const camEnt = root.createChild("cam");
    camEnt.transform.setPosition(0, 0, 5);
    camEnt.transform.lookAt(new Vector3(0, 0, 0));
    const cam = camEnt.addComponent(Camera);

    const floorMat = new PBRMaterial(engine);
    floorMat.roughness = 0.05;
    floorMat.baseColor = new Color(0, 0, 1, 1);
    floorMat.emissiveColor = new Color(0, 0.4, 0.8, 1);
    const quad = root.createChild("quad");
    const mr = quad.addComponent(MeshRenderer);
    mr.mesh = createQuadWithVertexColorAlpha(engine, 12, 12, 1, 1, 1, 1);
    mr.setMaterial(floorMat);

    scene.screenSpaceReflection.enabled = true;
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.Medium;
    stepFrames(engine, 5);

    // @ts-ignore access internal pass & pool
    const ssrPass = cam._renderPipeline._ssrPass;
    // @ts-ignore
    const freeRTs: RenderTarget[] = engine._renderTargetPool._freeRenderTargets;
    // @ts-ignore
    const depthBuckets = freeRTs.filter((rt) => rt.getColorTexture(0)?.format === ssrPass._caps.depthColorFormat);
    // @ts-ignore
    const colorBuckets = freeRTs.filter((rt) => rt.getColorTexture(0)?.format === ssrPass._caps.colorPyramidFormat);
    // P1-1 + Plan 2: persistent ping-pong in-place Hi-Z uses 0 pool RTs (both 80x60 hiZTex[0/1] live in history) and hardware generateMipmaps uses 0 color scratches!
    expect(depthBuckets.length).toBe(0);
    expect(colorBuckets.length).toBe(0);
    // @ts-ignore
    expect(`${ssrPass._history.hiZTex[0]!.width}x${ssrPass._history.hiZTex[0]!.height}`).toBe("80x60");
    // @ts-ignore
    expect(`${ssrPass._history.hiZTex[1]!.width}x${ssrPass._history.hiZTex[1]!.height}`).toBe("80x60");
    const scratchAllocSpy = vi.spyOn(engine._renderTargetPool, "allocateRenderTarget");
    try {
      stepFrames(engine, 1);
      const ssrScratchAllocs = scratchAllocSpy.mock.calls.filter((args) => args[0] < 160 && args[7] === 1);
      expect(ssrScratchAllocs.length).toBe(0);
    } finally {
      scratchAllocSpy.mockRestore();
    }

    // Confirm downsampled mips 0..3 inside prevColorPyramidTex actually contain non-zero linear scene color
    // @ts-ignore
    const pyrTex = ssrPass._history.prevColorPyramidTex!;
    const isByte = pyrTex.format === TextureFormat.R8G8B8A8_UNorm;
    for (let mip = 0; mip <= 3; mip++) {
      const mw = Math.max(1, pyrTex.width >> mip);
      const mh = Math.max(1, pyrTex.height >> mip);
      const buf = isByte ? new Uint8Array(mw * mh * 4) : new Float32Array(mw * mh * 4);
      pyrTex.getPixelBuffer(0, 0, mw, mh, mip, buf);
      const scale = isByte ? 1 / 255 : 1;
      const cx = Math.floor(mw / 2);
      const cy = Math.floor(mh / 2);
      const bVal = buf[(cy * mw + cx) * 4 + 2] * scale;
      expect(bVal).toBeGreaterThan(0.2);
    }

    // Skipped for 2 frames keeps persistent resources (prevents brief pan thrash)
    floorMat.screenSpaceReflectionIntensity = 0;
    stepFrames(engine, 2);
    expect(ssrPass._state).toBe(SSRState.Skipped);
    expect(getSSRRetainedBytes(ssrPass)).toBeGreaterThan(0);

    // Reaching 10 consecutive Skipped frames releases persistent resources to 0, then cleanly recovers
    stepFrames(engine, 8);
    expect(ssrPass._state).toBe(SSRState.Skipped);
    expect(getSSRRetainedBytes(ssrPass)).toBe(0);

    floorMat.screenSpaceReflectionIntensity = 1.0;
    stepFrames(engine, 3);
    expect(ssrPass._state).toBe(SSRState.ActiveSteady);
    expect(drainGlErrors(gl)).toEqual([]);
  });

  it("Item 5.1: caches rejected SSR ShaderProgram fallback for O(1) lookup on subsequent frames", async () => {
    const { engine, scene, gl } = await createTestEngine(128, 96);
    createdEngines.push(engine);

    const maxUnits = engine._hardwareRenderer.capability.maxFragmentTextureUnits;
    const root = scene.createRootEntity("root");
    const camEnt = root.createChild("cam");
    camEnt.transform.setPosition(0, 0, 4);
    camEnt.transform.lookAt(new Vector3(0, 0, 0));
    const cam = camEnt.addComponent(Camera);

    const { rt, tex } = createReadbackRT(engine, 128, 96);
    cam.renderTarget = rt;

    const texDummy = createSolidRGBA8Tex(engine, 255, 255, 255, 255);
    const pbrMat = new PBRMaterial(engine);
    pbrMat.roughness = 0.08;
    pbrMat.emissiveColor = new Color(0, 1, 0, 1);
    const light = root.createChild("sun").addComponent(DirectLight);
    light.intensity = 1;
    pbrMat.transmission = 0.25;
    pbrMat.isTransparent = false;

    const enableFns: Array<() => void> = [
      () => (pbrMat.baseTexture = texDummy),
      () => (pbrMat.normalTexture = texDummy),
      () => (pbrMat.roughnessMetallicTexture = texDummy),
      () => (pbrMat.emissiveTexture = texDummy),
      () => (pbrMat.occlusionTexture = texDummy),
      () => {
        pbrMat.clearCoat = 1.0;
        pbrMat.clearCoatTexture = texDummy;
      },
      () => (pbrMat.clearCoatRoughnessTexture = texDummy),
      () => (pbrMat.clearCoatNormalTexture = texDummy),
      () => {
        pbrMat.anisotropy = 0.5;
        pbrMat.anisotropyTexture = texDummy;
      },
      () => {
        pbrMat.iridescence = 0.5;
        pbrMat.iridescenceTexture = texDummy;
      },
      () => (pbrMat.iridescenceThicknessTexture = texDummy),
      () => {
        pbrMat.sheenColor = new Color(0.2, 0.2, 0.2, 1);
        pbrMat.sheenColorTexture = texDummy;
      },
      () => (pbrMat.sheenRoughnessTexture = texDummy),
      () => (pbrMat.specularIntensityTexture = texDummy),
      () => (pbrMat.specularColorTexture = texDummy),
      () => (pbrMat.transmissionTexture = texDummy)
    ];

    const mr = root.createChild("quad").addComponent(MeshRenderer);
    mr.mesh = createQuadWithVertexColorAlpha(engine, 3, 3, 1, 1, 1, 1);
    mr.setMaterial(pbrMat);

    const pass = pbrMat.shader.subShaders[0].passes[2];
    const origGetProgram = pass._getShaderProgram.bind(pass);
    let activeUnits = 0;
    const progSpy = vi.spyOn(pass, "_getShaderProgram").mockImplementation((eng, macros) => {
      const prog = origGetProgram(eng, macros);
      activeUnits = prog.activeTextureCount;
      return prog;
    });
    for (let i = 0; i < enableFns.length && activeUnits < maxUnits; i++) {
      enableFns[i]();
      scene.screenSpaceReflection.enabled = false;
      engine.update();
    }
    if (activeUnits < maxUnits) {
      // @ts-ignore simulate mobile maxFragmentTextureUnits ceiling equal to PBR baseline
      engine._hardwareRenderer.capability._maxFragmentTextureUnits = activeUnits;
    }

    progSpy.mockClear();
    scene.screenSpaceReflection.enabled = true;
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.High;
    // Warm up + first trace (populates fallback pointer cache)
    stepFrames(engine, 3);
    expect(progSpy.mock.calls.length).toBeGreaterThan(3);

    // Steady frame must call _getShaderProgram ONLY ONCE for this Forward Pass (O(1) cached pointer!)
    progSpy.mockClear();
    engine.update();
    expect(progSpy.mock.calls.length).toBe(1);
    progSpy.mockRestore();

    const steadyPixels = sampleRegionRGB(tex, 0.35, 0.35, 0.65, 0.65);
    expect(steadyPixels.maxG).toBeGreaterThan(100);
    expect(drainGlErrors(gl)).toEqual([]);

    rt.destroy(true);
    tex.destroy(true);
    texDummy.destroy(true);
  });

  it("Item 5.3: supports alternating-frame throttled cameras without resetting history to WarmupColor", async () => {
    const { engine, scene, gl } = await createTestEngine(128, 96);
    createdEngines.push(engine);

    const root = scene.createRootEntity("root");
    const camEnt = root.createChild("cam");
    camEnt.transform.setPosition(0, 1.5, 4);
    camEnt.transform.lookAt(new Vector3(0, 0, 0));
    const cam = camEnt.addComponent(Camera);

    const floorMat = new PBRMaterial(engine);
    floorMat.roughness = 0.05;
    addPlane(engine, root, "floor", [0, 0, 0], 6, 6, floorMat);

    scene.screenSpaceReflection.enabled = true;
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.Medium;

    // Frame 1 (active) -> WarmupColor
    cam.enabled = true;
    engine.update();
    const ssrPass = getSSRPass(cam);
    expect(ssrPass._state).toBe(SSRState.WarmupColor);

    // Frame 2 skipped (30fps secondary camera), Frame 3 active -> must advance to FirstTrace
    cam.enabled = false;
    engine.update();
    cam.enabled = true;
    engine.update();
    expect(ssrPass._state).toBe(SSRState.FirstTrace);

    // Frame 4 skipped, Frame 5 active -> must advance to ActiveSteady
    cam.enabled = false;
    engine.update();
    cam.enabled = true;
    engine.update();
    expect(ssrPass._state).toBe(SSRState.ActiveSteady);
    expect(drainGlErrors(gl)).toEqual([]);
  });

  it("CR-009: keeps 780x1688 Medium LDR <= 11 MiB and Medium HDR <= 14.5 MiB with aliased recvNR and Low < Medium < High", async () => {
    const { engine, scene, gl } = await createTestEngine(780, 1688);
    createdEngines.push(engine);

    const root = scene.createRootEntity("root");
    const camEnt = root.createChild("cam");
    camEnt.transform.setPosition(0, 1.5, 4);
    camEnt.transform.lookAt(new Vector3(0, 0, 0));
    const cam = camEnt.addComponent(Camera);

    const floorMat = new PBRMaterial(engine);
    floorMat.roughness = 0.05;
    addPlane(engine, root, "floor", [0, 0, 0], 8, 8, floorMat);

    scene.screenSpaceReflection.enabled = true;

    // Low LDR (0.25x = 195x422)
    cam.enableHDR = false;
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.Low;
    stepFrames(engine, 3);
    const ssrPass = getSSRPass(cam);
    const lowBytes = getSSRRetainedBytes(ssrPass);
    expect(ssrPass._resources.ssrDepthTex!.width).toBe(195);
    expect(ssrPass._resources.ssrDepthTex!.height).toBe(422);
    expect(lowBytes).toBeLessThanOrEqual(4.5 * 1024 * 1024);

    // Medium LDR (0.5x = 390x844, RGBA8 + Oct8 + aliased recvNR onto ssrPingPongTex)
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.Medium;
    stepFrames(engine, 3);
    const medLDRBytes = getSSRRetainedBytes(ssrPass);
    // @ts-ignore verify Medium aliases recvNR rather than holding separate recvNRTex buffers and aligns Hi-Z steps to 28
    const history = ssrPass._history;
    // @ts-ignore
    expect(ssrPass._frame.preset.maxSteps).toBe(28);
    expect(history.recvNRTex[0]).toBeNull();
    expect(history.recvNRTex[1]).toBeNull();
    expect(medLDRBytes).toBeLessThanOrEqual(11 * 1024 * 1024);

    // Medium HDR (R8G8B8A8 + Oct8 + reversible Reinhard HDR, still aliased cleanly)
    cam.enableHDR = true;
    stepFrames(engine, 3);
    const medHDRBytes = getSSRRetainedBytes(ssrPass);
    expect(history.recvNRTex[0]).toBeNull();
    expect(ssrPass._caps.usesPackedNormalOct8).toBe(true);
    expect(medHDRBytes).toBe(medLDRBytes);
    expect(medHDRBytes).toBeLessThanOrEqual(11 * 1024 * 1024);

    // High HDR
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.High;
    stepFrames(engine, 3);
    const highHDRBytes = getSSRRetainedBytes(ssrPass);

    expect(lowBytes).toBeLessThan(medLDRBytes);
    expect(medHDRBytes).toBeLessThan(highHDRBytes);
    expect(drainGlErrors(gl)).toEqual([]);
  });

  it("CR-010: unbinds all SSR camera textures and macros cleanly on disable without dangling refCount -1", async () => {
    const { engine, scene, gl } = await createTestEngine(128, 96);
    createdEngines.push(engine);

    const root = scene.createRootEntity("root");
    const camEnt = root.createChild("cam");
    camEnt.transform.setPosition(0, 1.5, 4);
    camEnt.transform.lookAt(new Vector3(0, 0, 0));
    const cam = camEnt.addComponent(Camera);

    const transMat = new PBRMaterial(engine);
    transMat.isTransparent = true;
    transMat.roughness = 0.05;
    transMat.baseColor = new Color(0.5, 0.7, 1.0, 0.5);
    addPlane(engine, root, "water", [0, 0, 0], 6, 6, transMat);

    scene.screenSpaceReflection.enabled = true;
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.High;
    stepFrames(engine, 3);

    const ssrTex = cam.shaderData.getTexture("camera_SSRTexture") as Texture2D;
    const recvDepthTex = cam.shaderData.getTexture("camera_SSRReceiverDepthTexture") as Texture2D;
    const recvNRTex = cam.shaderData.getTexture("camera_SSRReceiverNormalRoughnessTexture") as Texture2D;
    expect(ssrTex).not.toBeNull();
    expect(recvDepthTex).not.toBeNull();
    expect(recvNRTex).not.toBeNull();

    // Disable SSR -> all 3 textures and all 5 macros must be cleared BEFORE textures are destroyed
    cam.enableScreenSpaceReflection = false;
    engine.update();

    expect(cam.shaderData.getTexture("camera_SSRTexture")).toBeNull();
    expect(cam.shaderData.getTexture("camera_SSRReceiverDepthTexture")).toBeNull();
    expect(cam.shaderData.getTexture("camera_SSRReceiverNormalRoughnessTexture")).toBeNull();
    for (const macroName of [
      "CAMERA_ENABLE_SSR",
      "CAMERA_SSR_VERIFY_RECEIVER_DEPTH",
      "CAMERA_SSR_BILATERAL_SAMPLE",
      "SSR_PACKED_DEPTH_RG8",
      "SSR_PACKED_NORMAL_OCT8"
    ]) {
      const m = ShaderMacro.getByName(macroName);
      expect(cam.shaderData._macroCollection.isEnable(m)).toBe(false);
      expect(cam._globalShaderMacro.isEnable(m)).toBe(false);
    }
    expect(ssrTex.destroyed).toBe(true);
    expect(recvDepthTex.destroyed).toBe(true);
    expect(recvNRTex.destroyed).toBe(true);
    expect(ssrTex._getReferCount()).toBe(0);
    expect(recvDepthTex._getReferCount()).toBe(0);
    expect(recvNRTex._getReferCount()).toBe(0);

    // Re-enable SSR -> old destroyed textures must stay at refCount 0 (never drop to -1!)
    cam.enableScreenSpaceReflection = true;
    stepFrames(engine, 3);
    expect(ssrTex._getReferCount()).toBe(0);
    expect(recvDepthTex._getReferCount()).toBe(0);
    expect(recvNRTex._getReferCount()).toBe(0);
    expect(drainGlErrors(gl)).toEqual([]);
  });

  it("CR-011: uses zero-GC swap-and-pop removal in _popAndFreeScratch without calling Array.splice", async () => {
    const { engine, scene, gl } = await createTestEngine(128, 96);
    createdEngines.push(engine);

    const root = scene.createRootEntity("root");
    const camEnt = root.createChild("cam");
    camEnt.transform.setPosition(0, 1.5, 4);
    camEnt.transform.lookAt(new Vector3(0, 0, 0));
    const cam = camEnt.addComponent(Camera);

    const floorMat = new PBRMaterial(engine);
    floorMat.roughness = 0.05;
    addPlane(engine, root, "floor", [0, 0, 0], 6, 6, floorMat);

    scene.screenSpaceReflection.enabled = true;
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.Medium;
    stepFrames(engine, 3);

    // @ts-ignore access internal scratch lists
    const ssrPass = cam._renderPipeline._ssrPass;
    // @ts-ignore
    const hiZList = ssrPass._pyramidBuilder.hiZScratchRTs;
    // @ts-ignore
    const colorList = ssrPass._pyramidBuilder.colorScratchRTs;
    const hiZSpliceSpy = vi.spyOn(hiZList, "splice");
    const colorSpliceSpy = vi.spyOn(colorList, "splice");

    stepFrames(engine, 3);
    expect(hiZSpliceSpy).not.toHaveBeenCalled();
    expect(colorSpliceSpy).not.toHaveBeenCalled();
    expect(hiZList.length).toBe(0);
    expect(colorList.length).toBe(0);
    expect(drainGlErrors(gl)).toEqual([]);
  });

  it("CR-012: defaults built-in PBR .mat assets to intensity 1 unless explicitly specified, while keeping non-PBR/custom at 0", async () => {
    const engine = await WebGLEngine.create({
      canvas: createCanvas(64, 64),
      shaderCompiler: new ShaderCompiler()
    });
    createdEngines.push(engine);

    const pbrDefault = await engine.resourceManager.load<Material>({
      url: createBlobURL({ name: "PBRDefaultSSR", shader: "PBR", shaderData: {}, macros: [] }, "mat"),
      type: AssetType.Material
    });
    expect(pbrDefault.screenSpaceReflectionIntensity).toBe(1);

    const pbrExplicitZero = await engine.resourceManager.load<Material>({
      url: createBlobURL(
        { name: "PBROptOut", shader: "PBR", screenSpaceReflectionIntensity: 0, shaderData: {}, macros: [] },
        "mat"
      ),
      type: AssetType.Material
    });
    expect(pbrExplicitZero.screenSpaceReflectionIntensity).toBe(0);

    const pbrLegacyShaderData = await engine.resourceManager.load<Material>({
      url: createBlobURL(
        {
          name: "PBRLegacyZero",
          shader: "PBR",
          shaderData: { material_ScreenSpaceReflectionIntensity: { type: "Float", value: 0.25 } },
          macros: []
        },
        "mat"
      ),
      type: AssetType.Material
    });
    expect(pbrLegacyShaderData.screenSpaceReflectionIntensity).toBeCloseTo(0.25);

    const unlitMat = await engine.resourceManager.load<Material>({
      url: createBlobURL({ name: "UnlitDefault", shader: "Unlit", shaderData: {}, macros: [] }, "mat"),
      type: AssetType.Material
    });
    expect(unlitMat.screenSpaceReflectionIntensity).toBe(0);

    // Custom shader named "PBR" (not Engine._builtinShaders.pbr) must remain 0
    const builtinPBR = Shader.find("PBR")!;
    const customPBR = Shader.create(`Shader "PBR" {
      SubShader "Custom" {
        Pass "Custom" {
          void vert() { gl_Position = vec4(0.0); }
          void frag() { gl_FragColor = vec4(1.0); }
          VertexShader = vert;
          FragmentShader = frag;
        }
      }
    }`);
    try {
      const customLoaded = await engine.resourceManager.load<Material>({
        url: createBlobURL({ name: "CustomNamesakePBR", shader: "PBR", shaderData: {}, macros: [] }, "mat"),
        type: AssetType.Material
      });
      expect(customLoaded.shader).toBe(customPBR);
      expect(customLoaded.screenSpaceReflectionIntensity).toBe(0);
      customLoaded.destroy();
    } finally {
      customPBR.destroy(true);
    }
    expect(Shader.find("PBR")).toBe(builtinPBR);

    pbrDefault.destroy();
    pbrExplicitZero.destroy();
    pbrLegacyShaderData.destroy();
    unlitMat.destroy();
  });

  it("supports VeryHigh full-resolution trace and color pyramid with 1:1 Forward sampling, Karis mip1, split-screen safety, and clean preset transitions", async () => {
    const { engine, scene, gl } = await createTestEngine(160, 120);
    createdEngines.push(engine);

    const root = scene.createRootEntity("root");
    const camEnt = root.createChild("cam");
    camEnt.transform.setPosition(0, 1.35, 3.6);
    camEnt.transform.lookAt(new Vector3(0, 0.35, -1.2));
    const cam = camEnt.addComponent(Camera);
    cam.nearClipPlane = 0.2;
    cam.farClipPlane = 50;

    const { rt, tex } = createReadbackRT(engine, 160, 120);
    cam.renderTarget = rt;

    const floorMat = new PBRMaterial(engine);
    floorMat.baseColor = new Color(0.02, 0.02, 0.02, 1);
    floorMat.metallic = 0.0;
    floorMat.roughness = 0.03;
    floorMat.screenSpaceReflectionIntensity = 1.0;
    addPlane(engine, root, "mirrorFloor", [0, 0, -0.8], 10, 10, floorMat);

    const pillarMat = new PBRMaterial(engine);
    pillarMat.baseColor = new Color(0.1, 0, 0, 1);
    pillarMat.emissiveColor = new Color(4.0, 0.0, 0.0, 1);
    pillarMat.screenSpaceReflectionIntensity = 0;
    addBox(engine, root, "redWall", [0, 1.85, -1.8], [3.2, 2.0, 0.4], pillarMat);

    // 1. Baseline off
    scene.screenSpaceReflection.enabled = false;
    stepFrames(engine, 2);
    const offFloor = sampleRegionRGB(tex, 0.35, 0.68, 0.65, 0.95);

    // 2. Enable VeryHigh (full-res 160x120 trace & color pyramid, 1:1 Forward sampling without bilateral upsample)
    scene.screenSpaceReflection.enabled = true;
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.VeryHigh;
    stepFrames(engine, 4);

    const ssrPass = getSSRPass(cam);
    expect(isSSRActiveForCamera(cam)).toBe(true);
    expect(ssrPass._state).toBe(SSRState.ActiveSteady);
    expect(ssrPass._resources.ssrDepthTex!.width).toBe(160);
    expect(ssrPass._resources.ssrDepthTex!.height).toBe(120);
    expect(ssrPass._caps.usesPackedNormalOct8).toBe(false);

    // @ts-ignore
    const pyrTex = ssrPass._history.prevColorPyramidTex!;
    expect(pyrTex.width).toBe(160);
    expect(pyrTex.height).toBe(120);

    // Forward uses crisp 1:1 sampling (no bilateral macro, no NR sampler slot), no depth-verify on opaque-only,
    // and transient SSR macros must NEVER leak into camera.shaderData._macroCollection or camera._globalShaderMacro.
    // @ts-ignore inspect active program resolver state
    expect(engine._renderContext.programResolver).toBe(ssrPass._programResolver);
    // @ts-ignore
    expect(ssrPass._programResolver.forwardEnabled).toBe(true);
    // @ts-ignore
    expect(ssrPass._programResolver.bilateralSample).toBe(false);
    // @ts-ignore
    expect(ssrPass._programResolver.verifyReceiverDepth).toBe(false);
    expect(cam.shaderData.getTexture("camera_SSRReceiverNormalRoughnessTexture")).toBeNull();
    for (const macroName of [
      "CAMERA_ENABLE_SSR",
      "CAMERA_SSR_VERIFY_RECEIVER_DEPTH",
      "CAMERA_SSR_BILATERAL_SAMPLE",
      "SSR_PACKED_DEPTH_RG8",
      "SSR_PACKED_NORMAL_OCT8"
    ]) {
      const m = ShaderMacro.getByName(macroName);
      expect(cam.shaderData._macroCollection.isEnable(m)).toBe(false);
      expect(cam._globalShaderMacro.isEnable(m)).toBe(false);
    }
    // Temporary color pyramid macros must be cleaned up after captureHistory
    // @ts-ignore
    const passMacros = ssrPass._material.shaderData._macroCollection;
    expect(passMacros.isEnable(ShaderMacro.getByName("SSR_COLOR_PYRAMID_FULL_RES"))).toBe(false);
    expect(passMacros.isEnable(ShaderMacro.getByName("SSR_COLOR_PYRAMID_KARIS_DOWNSAMPLE"))).toBe(false);

    // Verify crisp 1:1 mip 0 and populated Karis-weighted mip 1
    const isByte = pyrTex.format === TextureFormat.R8G8B8A8_UNorm;
    const scale = isByte ? 1 / 255 : 1;
    const mip0Buf = isByte ? new Uint8Array(160 * 120 * 4) : new Float32Array(160 * 120 * 4);
    pyrTex.getPixelBuffer(0, 0, 160, 120, 0, mip0Buf);
    const mip1W = 80;
    const mip1H = 60;
    const mip1Buf = isByte ? new Uint8Array(mip1W * mip1H * 4) : new Float32Array(mip1W * mip1H * 4);
    pyrTex.getPixelBuffer(0, 0, mip1W, mip1H, 1, mip1Buf);
    let maxMip0R = 0;
    for (let i = 0; i < 160 * 120; i++) {
      maxMip0R = Math.max(maxMip0R, mip0Buf[i * 4] * scale);
    }
    let maxMip1R = 0;
    for (let i = 0; i < mip1W * mip1H; i++) {
      const r = mip1Buf[i * 4] * scale;
      expect(Number.isFinite(r)).toBe(true);
      maxMip1R = Math.max(maxMip1R, r);
    }
    expect(maxMip0R).toBeGreaterThan(0.5);
    expect(maxMip1R).toBeGreaterThan(0.2);

    // Physically aligned glossy reflection on floor under VeryHigh
    const veryHighFloor = sampleRegionRGB(tex, 0.35, 0.68, 0.65, 0.95);
    expect(veryHighFloor.maxR).toBeGreaterThan(offFloor.maxR + 60);
    expect(veryHighFloor.avgR).toBeGreaterThan(offFloor.avgR + 15);
    const veryHighBytes = getSSRRetainedBytes(ssrPass);

    // 3. Adding a transparent receiver enables CAMERA_SSR_VERIFY_RECEIVER_DEPTH in Forward even in VeryHigh
    const waterMat = new PBRMaterial(engine);
    waterMat.isTransparent = true;
    waterMat.roughness = 0.05;
    waterMat.baseColor = new Color(0.1, 0.4, 0.6, 0.45);
    const waterEnt = addPlane(engine, root, "shallowWater", [0, 0.25, -0.8], 4, 4, waterMat);
    stepFrames(engine, 2);
    // @ts-ignore inspect active program resolver state
    expect(engine._renderContext.programResolver).toBe(ssrPass._programResolver);
    // @ts-ignore
    expect(ssrPass._programResolver.forwardEnabled).toBe(true);
    // @ts-ignore
    expect(ssrPass._programResolver.verifyReceiverDepth).toBe(true);
    // @ts-ignore
    expect(ssrPass._programResolver.bilateralSample).toBe(false);
    expect(cam.shaderData._macroCollection.isEnable(ShaderMacro.getByName("CAMERA_SSR_VERIFY_RECEIVER_DEPTH"))).toBe(
      false
    );
    expect(cam._globalShaderMacro.isEnable(ShaderMacro.getByName("CAMERA_SSR_VERIFY_RECEIVER_DEPTH"))).toBe(false);
    waterEnt.destroy();

    // 4. Clean preset transitions: VeryHigh -> High -> Medium -> VeryHigh, plus SAO full-res depth 1:1 path
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.High;
    stepFrames(engine, 3);
    expect(ssrPass._resources.ssrDepthTex!.width).toBe(80);
    expect(ssrPass._resources.ssrDepthTex!.height).toBe(60);
    expect(veryHighBytes).toBeGreaterThan(getSSRRetainedBytes(ssrPass));

    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.Medium;
    stepFrames(engine, 3);
    expect(ssrPass._state).toBe(SSRState.ActiveSteady);

    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.VeryHigh;
    scene.ambientOcclusion.enabled = true;
    cam.depthTextureMode = DepthTextureMode.PrePass;
    stepFrames(engine, 4);
    expect(ssrPass._state).toBe(SSRState.ActiveSteady);
    expect(ssrPass._resources.ssrDepthTex!.width).toBe(160);
    expect(ssrPass._resources.ssrDepthTex!.height).toBe(120);

    // 5. Split-screen horizontal viewport isolation under VeryHigh (1:1 full-res prefilter path)
    scene.ambientOcclusion.enabled = false;
    cam.depthTextureMode = DepthTextureMode.None;
    const camLeftEnt = root.createChild("camLeft");
    camLeftEnt.transform.setPosition(0, 1.35, 3.6);
    camLeftEnt.transform.lookAt(new Vector3(0, 0.35, -1.2));
    const camLeft = camLeftEnt.addComponent(Camera);
    camLeft.renderTarget = rt;
    camLeft.viewport = new Vector4(0, 0, 0.5, 1);
    camLeft.clearFlags = CameraClearFlags.All;
    camLeft.cullingMask = 2;
    camLeft.priority = 0;

    cam.viewport = new Vector4(0.5, 0, 0.5, 1);
    cam.clearFlags = CameraClearFlags.DepthStencil;
    cam.cullingMask = 1;
    cam.priority = 1;

    const greenMat = new UnlitMaterial(engine);
    greenMat.baseColor = new Color(0, 1, 0, 1);
    const leftQuad = root.createChild("leftGreenCover");
    leftQuad.layer = 2;
    leftQuad.transform.setPosition(0, 0, 0.5);
    const leftMR = leftQuad.addComponent(MeshRenderer);
    leftMR.mesh = createQuadWithVertexColorAlpha(engine, 20, 20, 1, 1, 1, 1);
    leftMR.setMaterial(greenMat);
    stepFrames(engine, 3);

    // Inspect cam (right half): prevColorPyramidTex must contain zero green leak from left half
    // @ts-ignore
    const splitPyrTex = cam._renderPipeline._ssrPass._history.prevColorPyramidTex!;
    const splitBuf = isByte
      ? new Uint8Array(splitPyrTex.width * splitPyrTex.height * 4)
      : new Float32Array(splitPyrTex.width * splitPyrTex.height * 4);
    splitPyrTex.getPixelBuffer(0, 0, splitPyrTex.width, splitPyrTex.height, 0, splitBuf);
    let maxSplitG = 0;
    for (let i = 0; i < splitPyrTex.width * splitPyrTex.height; i++) {
      maxSplitG = Math.max(maxSplitG, splitBuf[i * 4 + 1] * scale);
    }
    expect(maxSplitG).toBeLessThan(0.05);

    // 6. SceneLoader deserialization supports VeryHigh
    await applySceneData(
      scene,
      {
        rootEntities: [],
        background: { mode: BackgroundMode.SolidColor, color: [0, 0, 0, 1] },
        screenSpaceReflection: { enabled: true, quality: ScreenSpaceReflectionQuality.VeryHigh }
      },
      engine.resourceManager,
      []
    );
    expect(scene.screenSpaceReflection.quality).toBe(ScreenSpaceReflectionQuality.VeryHigh);
    expect(drainGlErrors(gl)).toEqual([]);

    rt.destroy(true);
    tex.destroy(true);
  });

  it("maintains hole-free, flicker-free diagonal pillar reflection across high-res floor spans under VeryHigh HiZTrace", async () => {
    const W = 512;
    const H = 384;
    const { engine, scene, gl } = await createTestEngine(W, H);
    createdEngines.push(engine);

    const root = scene.createRootEntity("root");
    const camEnt = root.createChild("cam");
    camEnt.transform.setPosition(1.6, 2.0, 4.4);
    camEnt.transform.lookAt(new Vector3(0.0, 0.7, -1.5));
    const cam = camEnt.addComponent(Camera);
    cam.nearClipPlane = 0.2;
    cam.farClipPlane = 50;
    cam.enableHDR = true;

    const { rt, tex } = createReadbackRT(engine, W, H);
    cam.renderTarget = rt;

    const floorMat = new PBRMaterial(engine);
    floorMat.baseColor = new Color(0, 0, 0, 1);
    floorMat.metallic = 0.0;
    floorMat.roughness = 0.02;
    floorMat.screenSpaceReflectionIntensity = 1.0;
    addPlane(engine, root, "mirrorFloor", [0, 0, -1], 14, 14, floorMat);

    const pillarMat = new PBRMaterial(engine);
    pillarMat.baseColor = new Color(0.1, 0, 0, 1);
    pillarMat.emissiveColor = new Color(4.0, 0.0, 0.0, 1);
    pillarMat.screenSpaceReflectionIntensity = 0;
    addBox(engine, root, "tallPillar", [-0.6, 1.8, -2.2], [1.0, 3.6, 1.0], pillarMat);

    // Capture baseline (SSR Off) to identify pure floor pixels strictly outside the pillar silhouette
    scene.screenSpaceReflection.enabled = false;
    stepFrames(engine, 2);
    const offPixels = new Uint8Array(W * H * 4);
    tex.getPixelBuffer(0, 0, W, H, 0, offPixels);

    // Enable VeryHigh and reach steady state
    scene.screenSpaceReflection.enabled = true;
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.VeryHigh;
    stepFrames(engine, 5);
    const frameAPixels = new Uint8Array(W * H * 4);
    tex.getPixelBuffer(0, 0, W, H, 0, frameAPixels);

    // Advance several more jittered frames and verify frame-to-frame stability
    stepFrames(engine, 4);
    const frameBPixels = new Uint8Array(W * H * 4);
    tex.getPixelBuffer(0, 0, W, H, 0, frameBPixels);

    let reflectedRowsWithZeroGaps = 0;
    let totalReflectedRows = 0;
    let diffSum = 0;
    let diffCount = 0;

    for (let y = 0; y < H; y++) {
      let firstRedX = -1;
      let lastRedX = -1;
      let redCount = 0;
      for (let x = 0; x < W; x++) {
        const idx = (y * W + x) * 4;
        if (offPixels[idx] > 10) continue; // skip the directly-visible pillar silhouette itself
        const rA = frameAPixels[idx];
        const rB = frameBPixels[idx];
        diffSum += Math.abs(rA - rB);
        diffCount++;
        if (rA > 80) {
          if (firstRedX === -1) firstRedX = x;
          lastRedX = x;
          redCount++;
        }
      }
      if (redCount >= 16) {
        totalReflectedRows++;
        // Check for internal dropouts inside [firstRedX + 2, lastRedX - 2] (comb-tearing leaves zero-red holes)
        let internalGaps = 0;
        for (let x = firstRedX + 2; x <= lastRedX - 2; x++) {
          const idx = (y * W + x) * 4;
          if (offPixels[idx] <= 10 && frameAPixels[idx] < 40) {
            internalGaps++;
          }
        }
        if (internalGaps === 0) {
          reflectedRowsWithZeroGaps++;
        }
      }
    }

    expect(totalReflectedRows).toBeGreaterThan(80);
    expect(reflectedRowsWithZeroGaps).toBe(totalReflectedRows);
    expect(diffSum / Math.max(diffCount, 1)).toBeLessThan(1.5);
    expect(drainGlErrors(gl)).toEqual([]);

    rt.destroy(true);
    tex.destroy(true);
  });

  it("Plan 2 Hi-Z: pins TEXTURE_BASE_LEVEL/MAX_LEVEL per mip, restores [0, 1000] in finally on throw, and supports _forceHiZScratch fallback", async () => {
    const { engine, scene, gl } = await createTestEngine(160, 120);
    createdEngines.push(engine);

    const root = scene.createRootEntity("root");
    const camEnt = root.createChild("cam");
    camEnt.transform.setPosition(0, 1.5, 4);
    camEnt.transform.lookAt(new Vector3(0, 0, -1));
    const cam = camEnt.addComponent(Camera);

    const floorMat = new PBRMaterial(engine);
    floorMat.roughness = 0.05;
    floorMat.baseColor = new Color(0.2, 0.2, 0.2, 1);
    floorMat.screenSpaceReflectionIntensity = 1.0;
    addPlane(engine, root, "floor", [0, 0, -1], 10, 10, floorMat);

    const boxMat = new PBRMaterial(engine);
    boxMat.emissiveColor = new Color(0, 1.0, 0, 1);
    boxMat.screenSpaceReflectionIntensity = 0;
    addBox(engine, root, "greenBox", [0, 0.8, -1.5], [1, 1.6, 1], boxMat);

    scene.screenSpaceReflection.enabled = true;
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.High;
    stepFrames(engine, 2);
    const ssrPass = getSSRPass(cam);
    expect(ssrPass._state).toBe(SSRState.FirstTrace);

    const origSetRange = (Texture2D.prototype as unknown as { _setMipLevelRange: (b: number, m: number) => boolean })
      ._setMipLevelRange;
    const observedRanges: Array<{ tex: Texture2D; base: number; max: number }> = [];
    const rangeSpy = vi
      .spyOn(
        Texture2D.prototype as unknown as { _setMipLevelRange: (b: number, m: number) => boolean },
        "_setMipLevelRange"
      )
      .mockImplementation(function (this: Texture2D, baseLevel: number, maxLevel: number) {
        observedRanges.push({ tex: this, base: baseLevel, max: maxLevel });
        return origSetRange.call(this, baseLevel, maxLevel);
      });

    stepFrames(engine, 1);
    expect(ssrPass._state).toBe(SSRState.ActiveSteady);
    expect(observedRanges.length).toBe(6); // 80x60 trace -> maxHiZMip = min(6, floor(log2(60))) = 5 -> m = 1..5 plus finally [0,1000]
    expect(observedRanges.map((c) => [c.base, c.max])).toEqual([
      [0, 0],
      [1, 1],
      [2, 2],
      [3, 3],
      [4, 4],
      [0, 1000]
    ]);
    const hiZTexUsed = observedRanges[0].tex;
    // Verify GL texture parameters are actually restored to [0, 1000]
    // @ts-ignore access RHI bindTexture
    engine._hardwareRenderer.bindTexture(hiZTexUsed._platformTexture);
    expect(gl.getTexParameter(gl.TEXTURE_2D, gl.TEXTURE_BASE_LEVEL)).toBe(0);
    expect(gl.getTexParameter(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL)).toBe(1000);
    expect(drainGlErrors(gl)).toEqual([]);

    // Inject an error inside BuildHiZMipN (passIndex === 1) mid-loop and verify finally STILL restores [0, 1000]
    observedRanges.length = 0;
    const origBlit = Blitter.blitTexture;
    let hiZMipNCalls = 0;
    const blitSpy = vi.spyOn(Blitter, "blitTexture").mockImplementation((...args) => {
      if (args[6] === 1) {
        hiZMipNCalls++;
        if (hiZMipNCalls === 2) {
          throw new Error("Simulated BuildHiZMipN failure");
        }
      }
      return origBlit.apply(Blitter, args);
    });
    expect(() => engine.update()).not.toThrow();
    blitSpy.mockRestore();
    rangeSpy.mockRestore();

    expect(observedRanges.length).toBeGreaterThanOrEqual(2);
    const lastCall = observedRanges[observedRanges.length - 1];
    expect([lastCall.base, lastCall.max]).toEqual([0, 1000]);
    // @ts-ignore
    engine._hardwareRenderer.bindTexture(lastCall.tex._platformTexture);
    expect(gl.getTexParameter(gl.TEXTURE_2D, gl.TEXTURE_BASE_LEVEL)).toBe(0);
    expect(gl.getTexParameter(gl.TEXTURE_2D, gl.TEXTURE_MAX_LEVEL)).toBe(1000);

    // @ts-ignore
    expect(ssrPass._pyramidBuilder.hiZScratchRTs.length).toBe(0);
    stepFrames(engine, 3);
    expect(ssrPass._state).toBe(SSRState.ActiveSteady);

    // Verify _forceHiZScratch fallback works cleanly and allocates mip-1 scratch
    const scratchAllocSpy = vi.spyOn(engine._renderTargetPool, "allocateRenderTarget");
    ssrPass._forceHiZScratch = true;
    try {
      stepFrames(engine, 1);
      const hiZScratchAllocs = scratchAllocSpy.mock.calls.filter(
        (args) => args[0] === 40 && args[1] === 30 && args[2] === ssrPass._caps.depthColorFormat
      );
      expect(hiZScratchAllocs.length).toBe(1);
      expect(ssrPass._pyramidBuilder.hiZScratchRTs.length).toBe(0);
    } finally {
      scratchAllocSpy.mockRestore();
      ssrPass._forceHiZScratch = false;
    }
    expect(drainGlErrors(gl)).toEqual([]);
  });

  it("Plan 2 ColorPyramid: uses Texture2D.generateMipmaps on Medium/High and software scratch fallback on VeryHigh and _forceSoftwareColorPyramidMipmaps", async () => {
    const { engine, scene, gl } = await createTestEngine(160, 120);
    createdEngines.push(engine);

    const root = scene.createRootEntity("root");
    const camEnt = root.createChild("cam");
    camEnt.transform.setPosition(0, 0, 5);
    camEnt.transform.lookAt(new Vector3(0, 0, 0));
    const cam = camEnt.addComponent(Camera);

    const mat = new PBRMaterial(engine);
    mat.roughness = 0.05;
    mat.baseColor = new Color(0, 0, 1, 1);
    mat.emissiveColor = new Color(0.2, 0.5, 0.9, 1);
    const mr = root.createChild("quad").addComponent(MeshRenderer);
    mr.mesh = createQuadWithVertexColorAlpha(engine, 12, 12, 1, 1, 1, 1);
    mr.setMaterial(mat);

    scene.screenSpaceReflection.enabled = true;
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.Medium;
    engine.update();

    // @ts-ignore access internal pass & history
    const ssrPass = cam._renderPipeline._ssrPass;
    // @ts-ignore
    const pyrTex = ssrPass._history.prevColorPyramidTex!;
    const genSpy = vi.spyOn(pyrTex, "generateMipmaps");

    const assertMipsPopulated = (texture: Texture2D) => {
      const isByte = texture.format === TextureFormat.R8G8B8A8_UNorm;
      const scale = isByte ? 1 / 255 : 1;
      for (let mip = 0; mip <= 3; mip++) {
        const mw = Math.max(1, texture.width >> mip);
        const mh = Math.max(1, texture.height >> mip);
        const buf = isByte ? new Uint8Array(mw * mh * 4) : new Float32Array(mw * mh * 4);
        texture.getPixelBuffer(0, 0, mw, mh, mip, buf);
        const cx = Math.floor(mw / 2);
        const cy = Math.floor(mh / 2);
        const bVal = buf[(cy * mw + cx) * 4 + 2] * scale;
        expect(bVal).toBeGreaterThan(0.2);
      }
    };

    // Medium -> hardware generateMipmaps(), zero scratch
    const colorScratchAllocSpy = vi.spyOn(engine._renderTargetPool, "allocateRenderTarget");
    try {
      stepFrames(engine, 2);
      expect(genSpy).toHaveBeenCalledTimes(2);
      expect(
        colorScratchAllocSpy.mock.calls.filter((args) => args[2] === ssrPass._caps.colorPyramidFormat).length
      ).toBe(0);
      assertMipsPopulated(pyrTex);

      // High -> still 0.5x color pyramid, uses hardware generateMipmaps()
      genSpy.mockClear();
      colorScratchAllocSpy.mockClear();
      scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.High;
      stepFrames(engine, 2);
      expect(genSpy).toHaveBeenCalledTimes(2);
      expect(
        colorScratchAllocSpy.mock.calls.filter((args) => args[2] === ssrPass._caps.colorPyramidFormat).length
      ).toBe(0);
      assertMipsPopulated(pyrTex);

      // VeryHigh -> 1.0x color pyramid allocates new full-res prevColorPyramidTex & uses software Karis mip1 + downsample
      const texGenProtoSpy = vi.spyOn(Texture2D.prototype, "generateMipmaps");
      texGenProtoSpy.mockClear();
      colorScratchAllocSpy.mockClear();
      scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.VeryHigh;
      stepFrames(engine, 2);
      // Note: generateMipmaps may only be called if cameraRenderTarget has mipmaps; prevColorPyramidTex must NOT use generateMipmaps on VeryHigh!
      // @ts-ignore
      const veryHighPyrTex = ssrPass._history.prevColorPyramidTex!;
      expect(texGenProtoSpy.mock.instances.includes(veryHighPyrTex)).toBe(false);
      expect(
        colorScratchAllocSpy.mock.calls.filter(
          (args) => args[0] === 80 && args[1] === 60 && args[2] === ssrPass._caps.colorPyramidFormat
        ).length
      ).toBe(2);
      expect(ssrPass._pyramidBuilder.colorScratchRTs.length).toBe(0);
      assertMipsPopulated(veryHighPyrTex);
      texGenProtoSpy.mockRestore();

      // Software fallback on Medium when _forceSoftwareColorPyramidMipmaps = true
      scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.Medium;
      stepFrames(engine, 1);
      // @ts-ignore
      const medPyrTex2 = ssrPass._history.prevColorPyramidTex!;
      const fallbackSpy = vi.spyOn(medPyrTex2, "generateMipmaps");
      colorScratchAllocSpy.mockClear();
      // @ts-ignore
      ssrPass._forceSoftwareColorPyramidMipmaps = true;
      stepFrames(engine, 2);
      expect(fallbackSpy).not.toHaveBeenCalled();
      expect(
        colorScratchAllocSpy.mock.calls.filter(
          (args) => args[0] === 40 && args[1] === 30 && args[2] === ssrPass._caps.colorPyramidFormat
        ).length
      ).toBe(2);
      expect(ssrPass._pyramidBuilder.colorScratchRTs.length).toBe(0);
      assertMipsPopulated(medPyrTex2);
    } finally {
      colorScratchAllocSpy.mockRestore();
      // @ts-ignore
      ssrPass._forceSoftwareColorPyramidMipmaps = false;
    }

    expect(drainGlErrors(gl)).toEqual([]);
  });

  it("caps non-VeryHigh SSR trace and color pyramid long edge to 960px on 3K/4K viewports while keeping VeryHigh uncapped", async () => {
    const { engine, scene, gl } = await createTestEngine(3020, 1544);
    createdEngines.push(engine);

    scene.background.solidColor = new Color(0.2, 0.4, 0.8, 1.0);
    const root = scene.createRootEntity("root");
    const camEnt = root.createChild("cam");
    camEnt.transform.setPosition(0, 1.5, 4);
    camEnt.transform.lookAt(new Vector3(0, 0, 0));
    const cam = camEnt.addComponent(Camera);

    const floorMat = new PBRMaterial(engine);
    floorMat.roughness = 0.05;
    addPlane(engine, root, "floor", [0, 0, 0], 4, 4, floorMat);

    scene.screenSpaceReflection.enabled = true;
    // @ts-ignore
    const ssrPass = cam._renderPipeline._getOrCreateSSRPass();

    // 3020x1544 Low -> trace keeps 0.25x (755x386 <= 960), color pyramid capped to 960x490
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.Low;
    stepFrames(engine, 2);
    expect(ssrPass._resources.ssrDepthTex!.width).toBe(755);
    expect(ssrPass._resources.ssrDepthTex!.height).toBe(386);
    // @ts-ignore
    expect(ssrPass._history.prevColorPyramidTex?.width).toBe(960);
    // @ts-ignore
    expect(ssrPass._history.prevColorPyramidTex?.height).toBe(490);

    // 3020x1544 Medium -> both trace and color pyramid capped to 960x490
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.Medium;
    stepFrames(engine, 2);
    expect(ssrPass._resources.ssrDepthTex!.width).toBe(960);
    expect(ssrPass._resources.ssrDepthTex!.height).toBe(490);
    // @ts-ignore
    expect(ssrPass._history.prevColorPyramidTex?.width).toBe(960);
    // @ts-ignore
    expect(ssrPass._history.prevColorPyramidTex?.height).toBe(490);

    // 3020x1544 High -> capped to 960x490 (~28 MiB instead of ~68 MiB) & valid prefiltered color mip0
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.High;
    stepFrames(engine, 3);
    expect(ssrPass._resources.ssrDepthTex!.width).toBe(960);
    expect(ssrPass._resources.ssrDepthTex!.height).toBe(490);
    expect(getSSRRetainedBytes(ssrPass)).toBeLessThan(36 * 1024 * 1024);
    // @ts-ignore
    const highPyrTex = ssrPass._history.prevColorPyramidTex!;
    expect(highPyrTex.width).toBe(960);
    expect(highPyrTex.height).toBe(490);
    const isByte = highPyrTex.format === TextureFormat.R8G8B8A8_UNorm;
    const sampleBuf = isByte ? new Uint8Array(960 * 490 * 4) : new Float32Array(960 * 490 * 4);
    highPyrTex.getPixelBuffer(0, 0, 960, 490, 0, sampleBuf);
    const cornerBlue = sampleBuf[2] * (isByte ? 1 / 255 : 1);
    expect(cornerBlue).toBeGreaterThan(0.2);

    // 3020x1544 VeryHigh -> remains uncapped at 1.0x (3020x1544)
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.VeryHigh;
    stepFrames(engine, 1);
    expect(ssrPass._resources.ssrDepthTex!.width).toBe(3020);
    expect(ssrPass._resources.ssrDepthTex!.height).toBe(1544);
    // @ts-ignore
    expect(ssrPass._history.prevColorPyramidTex?.width).toBe(3020);
    // @ts-ignore
    expect(ssrPass._history.prevColorPyramidTex?.height).toBe(1544);

    // 3840x2160 RenderTarget resize -> Low and High both clamp >= 0.25x (960x540) to preserve <= 4:1 DownsampleDepth ratio
    const { rt: rt4k, tex: tex4k } = createReadbackRT(engine, 3840, 2160);
    cam.renderTarget = rt4k;
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.High;
    stepFrames(engine, 2);
    expect(ssrPass._resources.ssrDepthTex!.width).toBe(960);
    expect(ssrPass._resources.ssrDepthTex!.height).toBe(540);
    // @ts-ignore
    expect(ssrPass._history.prevColorPyramidTex?.width).toBe(960);

    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.Low;
    stepFrames(engine, 2);
    expect(ssrPass._resources.ssrDepthTex!.width).toBe(960);
    expect(ssrPass._resources.ssrDepthTex!.height).toBe(540);

    cam.renderTarget = null;
    rt4k.destroy(true);
    tex4k.destroy(true);

    expect(drainGlErrors(gl)).toEqual([]);
  });

  it("TBDR load/store actions: uses non-scissored clear for fullscreen Blitter LOAD and invalidates SSR DepthStencil and MSAA/Depth STORE cleanly with 0 GL errors", async () => {
    const { engine, scene, gl } = await createTestEngine(256, 192);
    createdEngines.push(engine);

    const root = scene.createRootEntity("root");
    const camEnt = root.createChild("cam");
    camEnt.transform.setPosition(0, 1.5, 4);
    camEnt.transform.lookAt(new Vector3(0, 0, 0));
    const cam = camEnt.addComponent(Camera);
    cam.enableHDR = true;
    cam.enablePostProcess = true;

    const floorMat = new PBRMaterial(engine);
    floorMat.roughness = 0.08;
    addPlane(engine, root, "floor", [0, 0, 0], 6, 6, floorMat);

    const waterMat = new PBRMaterial(engine);
    waterMat.isTransparent = true;
    waterMat.roughness = 0.05;
    waterMat.baseColor = new Color(0.2, 0.6, 0.9, 0.5);
    addPlane(engine, root, "water", [0, 0.2, 0], 4, 4, waterMat);

    scene.screenSpaceReflection.enabled = true;
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.High;

    // Warm up history first so ActiveSteady runs full Hi-Z + TemporalResolve + ColorPyramid + PostProcess
    stepFrames(engine, 3);

    const calls: Array<{ target: number; attachments: number[] }> = [];
    const clearCalls: Array<{ mask: number; scissorEnabled: boolean; fbo: WebGLFramebuffer | null }> = [];
    const invSpy = vi.spyOn(gl, "invalidateFramebuffer").mockImplementation(function (
      this: WebGL2RenderingContext,
      target: number,
      attachments: Iterable<number>
    ) {
      calls.push({ target, attachments: Array.from(attachments) });
      return WebGL2RenderingContext.prototype.invalidateFramebuffer.call(this, target, attachments);
    });
    const clearSpy = vi.spyOn(gl, "clear").mockImplementation(function (this: WebGL2RenderingContext, mask: number) {
      clearCalls.push({
        mask,
        scissorEnabled: this.isEnabled(this.SCISSOR_TEST),
        fbo: this.getParameter(this.FRAMEBUFFER_BINDING)
      });
      return WebGL2RenderingContext.prototype.clear.call(this, mask);
    });

    try {
      // 1) Non-MSAA High HDR frame: Blitter uses non-scissored gl.clear(COLOR) (never invalidateFramebuffer(COLOR0)
      //    which triggers ANGLE-Metal RobustResourceInit CPU replaceRegion), while SSR & internalColorTarget still
      //    discard DepthStencil STORE via invalidateFramebuffer.
      cam.msaaSamples = MSAASamples.None;
      engine.update();
      expect(
        calls.some(
          (c) => c.target === gl.FRAMEBUFFER && c.attachments.length === 1 && c.attachments[0] === gl.COLOR_ATTACHMENT0
        )
      ).toBe(false);
      expect(clearCalls.some((c) => c.fbo !== null && c.mask === gl.COLOR_BUFFER_BIT && !c.scissorEnabled)).toBe(true);
      expect(
        calls.some(
          (c) =>
            c.target === gl.FRAMEBUFFER &&
            c.attachments.length === 1 &&
            c.attachments[0] === gl.DEPTH_STENCIL_ATTACHMENT
        )
      ).toBe(true);
      expect(drainGlErrors(gl)).toEqual([]);

      // 2) Low (!useTemporal) also invalidates _ssrDepthTex after HiZTrace with 0 GL errors
      calls.length = 0;
      scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.Low;
      engine.update();
      expect(
        calls.some(
          (c) =>
            c.target === gl.FRAMEBUFFER &&
            c.attachments.length === 1 &&
            c.attachments[0] === gl.DEPTH_STENCIL_ATTACHMENT
        )
      ).toBe(true);
      expect(drainGlErrors(gl)).toEqual([]);

      // 3) MSAA 4x + opaqueTextureEnabled (mid-frame resolve must NOT discard MSAA; final resolve MUST discard READ_FRAMEBUFFER)
      calls.length = 0;
      scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.High;
      cam.msaaSamples = MSAASamples.FourX;
      cam.opaqueTextureEnabled = true;
      stepFrames(engine, 2);
      const msaaDiscardCalls = calls.filter(
        (c) =>
          c.target === gl.READ_FRAMEBUFFER &&
          c.attachments.includes(gl.COLOR_ATTACHMENT0) &&
          c.attachments.includes(gl.DEPTH_STENCIL_ATTACHMENT)
      );
      // Exactly 1 MSAA discard per frame (final resolve), NOT on mid-frame opaqueTexture resolve
      expect(msaaDiscardCalls.length).toBe(2);
      expect(drainGlErrors(gl)).toEqual([]);
    } finally {
      invSpy.mockRestore();
      clearSpy.mockRestore();
    }
  });

  it("decouples Forward bilateral sampling per material under High quality", async () => {
    const engine = await WebGLEngine.create({
      canvas: createCanvas(160, 120),
      graphicDeviceOptions: { alpha: false, antialias: true, stencil: true, preserveDrawingBuffer: true },
      shaderCompiler: new ShaderCompiler()
    });
    createdEngines.push(engine);
    const scene = engine.sceneManager.activeScene;
    scene.background.mode = BackgroundMode.SolidColor;
    scene.background.solidColor.set(0, 0, 0, 1);
    scene.ambientLight.diffuseMode = DiffuseMode.SolidColor;
    scene.ambientLight.diffuseSolidColor.set(0, 0, 0, 1);
    scene.ambientLight.diffuseIntensity = 0;
    scene.ambientLight.specularIntensity = 0;
    const gl = engine._hardwareRenderer.gl;
    drainGlErrors(gl);

    const root = scene.createRootEntity("root");
    const camEnt = root.createChild("cam");
    camEnt.transform.setPosition(0, 1.35, 3.6);
    camEnt.transform.lookAt(new Vector3(0, 0.35, -1.2));
    const cam = camEnt.addComponent(Camera);
    cam.nearClipPlane = 0.2;
    cam.farClipPlane = 50;

    const { rt, tex } = createReadbackRT(engine, 160, 120);
    cam.renderTarget = rt;

    const reflectorMat = new PBRMaterial(engine);
    reflectorMat.baseColor = new Color(0.1, 0, 0, 1);
    reflectorMat.emissiveColor = new Color(4.0, 0, 0, 1);
    reflectorMat.roughness = 0.9;
    reflectorMat.screenSpaceReflectionIntensity = 0;
    addBox(engine, root, "reflectorWall", [0, 1.85, -1.8], [6.0, 2.0, 0.4], reflectorMat);

    // Left floor: default bilateral = true
    const leftFloorMat = new PBRMaterial(engine);
    leftFloorMat.baseColor = new Color(0.02, 0.02, 0.02, 1);
    leftFloorMat.metallic = 0.0;
    leftFloorMat.roughness = 0.03;
    expect(leftFloorMat.screenSpaceReflectionBilateral).toBe(true);
    addPlane(engine, root, "leftFloor", [-2.2, 0, -0.8], 4.2, 10, leftFloorMat);

    // Right floor: opt-out bilateral = false (falls back to CAMERA_SSR_VERIFY_RECEIVER_DEPTH)
    const rightFloorMat = new PBRMaterial(engine);
    rightFloorMat.baseColor = new Color(0.02, 0.02, 0.02, 1);
    rightFloorMat.metallic = 0.0;
    rightFloorMat.roughness = 0.03;
    rightFloorMat.screenSpaceReflectionBilateral = false;
    addPlane(engine, root, "rightFloor", [2.2, 0, -0.8], 4.2, 10, rightFloorMat);

    // Foreground surface without an SSRReceiver pass, overlapping the inner-right floor in screen space:
    // CAMERA_SSR_VERIFY_RECEIVER_DEPTH must reject the rear floor's SSR sample instead of bleeding red onto it.
    const noReceiverShader = Shader.create(`Shader "Test/ForwardOnlySSRVerifyCutoff" {
      SubShader "Default" {
        UsePass "Pipeline/DepthOnly/Default/DepthOnly"
        Pass "Forward" {
          Tags { pipelineStage = "Forward" }
          VertexShader = vert;
          FragmentShader = frag;
          #include "ShaderLibrary/Common/Common.glsl"
          #include "ShaderLibrary/Common/Transform.glsl"
          #include "ShaderLibrary/Common/Attributes.glsl"
          #include "ShaderLibrary/Lighting/ScreenSpaceReflection/ScreenSpaceReflectionSample.glsl"
          struct Varyings {
            vec4 positionCS;
          };
          Varyings vert(Attributes attr) {
            Varyings v;
            v.positionCS = renderer_MVPMat * vec4(attr.POSITION, 1.0);
            gl_Position = v.positionCS;
            return v;
          }
          void frag(Varyings v) {
            vec3 reflected = vec3(0.0, 0.0, 0.0);
            #ifdef CAMERA_ENABLE_SSR
              reflected = evaluateScreenSpaceReflection(v.positionCS, vec3(0.0, 1.0, 0.0), 0.05, vec3(0.0, 0.0, 0.0));
            #endif
            gl_FragColor = vec4(reflected.r, 0.8, 0.0, 1.0);
          }
        }
      }
    }`);
    const fgMat = new Material(engine, noReceiverShader);
    fgMat.screenSpaceReflectionIntensity = 1.0;
    fgMat.screenSpaceReflectionBilateral = false;
    addBox(engine, root, "fgBox", [0.45, 0.55, 1.4], [0.5, 0.5, 0.2], fgMat);

    const pbrForwardPass = Shader.find("PBR")!.subShaders[0].passes.find(
      (p) => p.getTagValue("pipelineStage") === "Forward"
    )!;
    const fgForwardPass = noReceiverShader.subShaders[0].passes[1];
    const origGetProgram = pbrForwardPass._getShaderProgram.bind(pbrForwardPass);
    const origFgGetProgram = fgForwardPass._getShaderProgram.bind(fgForwardPass);
    const bilateralMacro = ShaderMacro.getByName("CAMERA_SSR_BILATERAL_SAMPLE");
    const verifyMacro = ShaderMacro.getByName("CAMERA_SSR_VERIFY_RECEIVER_DEPTH");
    const enableMacro = ShaderMacro.getByName("CAMERA_ENABLE_SSR");
    const compiledVariants: Array<{ bilateral: boolean; verify: boolean; units: number }> = [];
    const fgCompiledVariants: Array<{ bilateral: boolean; verify: boolean }> = [];
    const spy = vi.spyOn(pbrForwardPass, "_getShaderProgram").mockImplementation((eng, macros) => {
      const prog = origGetProgram(eng, macros);
      if (macros.isEnable(enableMacro) && prog.isValid) {
        compiledVariants.push({
          bilateral: macros.isEnable(bilateralMacro),
          verify: macros.isEnable(verifyMacro),
          units: prog.activeTextureCount
        });
      }
      return prog;
    });
    const fgSpy = vi.spyOn(fgForwardPass, "_getShaderProgram").mockImplementation((eng, macros) => {
      const prog = origFgGetProgram(eng, macros);
      if (macros.isEnable(enableMacro) && prog.isValid) {
        fgCompiledVariants.push({
          bilateral: macros.isEnable(bilateralMacro),
          verify: macros.isEnable(verifyMacro)
        });
      }
      return prog;
    });

    try {
      scene.screenSpaceReflection.enabled = true;
      scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.High;
      stepFrames(engine, 3);

      const bilateralEntries = compiledVariants.filter((v) => v.bilateral && !v.verify);
      const verifyEntries = compiledVariants.filter((v) => !v.bilateral && v.verify);
      expect(bilateralEntries.length).toBeGreaterThan(0);
      expect(verifyEntries.length).toBeGreaterThan(0);
      expect(verifyEntries[0].units).toBe(bilateralEntries[0].units - 1);
      expect(fgCompiledVariants.some((v) => !v.bilateral && v.verify)).toBe(true);

      // Left floor (bilateral = true) and outer-right floor (bilateral = false) both show strong red reflection
      const leftFloorStats = sampleRegionRGB(tex, 0.2, 0.68, 0.42, 0.92);
      const rightFloorStats = sampleRegionRGB(tex, 0.72, 0.68, 0.88, 0.92);
      expect(leftFloorStats.maxR).toBeGreaterThan(80);
      expect(rightFloorStats.maxR).toBeGreaterThan(80);

      // Foreground box without SSRReceiver pass (tagged G ~ 204) is cut off by CAMERA_SSR_VERIFY_RECEIVER_DEPTH (no red bleed)
      const fullFrame = sampleRegionRGB(tex, 0, 0, 1, 1);
      let fgPixelCount = 0;
      let fgMaxR = 0;
      for (let i = 0; i < fullFrame.pixels.length; i += 4) {
        const r = fullFrame.pixels[i];
        const g = fullFrame.pixels[i + 1];
        if (g > 180) {
          fgPixelCount++;
          if (r > fgMaxR) fgMaxR = r;
        }
      }
      expect(fgPixelCount).toBeGreaterThan(50);
      expect(fgMaxR).toBeLessThan(15);

      expect(drainGlErrors(gl)).toEqual([]);
    } finally {
      spy.mockRestore();
      fgSpy.mockRestore();
      noReceiverShader.destroy(true);
      rt.destroy(true);
      tex.destroy(true);
    }
  });

  it("PBRMaterial: keeps DepthOnlyRenderQueue synchronized across transmission, alphaCutoff, and isTransparent", async () => {
    const { engine } = await createTestEngine(64, 64);
    createdEngines.push(engine);

    const mat = new PBRMaterial(engine);
    expect(mat.shaderData.getFloat("material_DepthOnlyRenderQueue")).toBe(RenderQueueType.Opaque);

    mat.transmission = 0.8;
    expect(mat.shaderData.getInt("renderQueueType")).toBe(RenderQueueType.Transparent);
    expect(mat.shaderData.getFloat("material_DepthOnlyRenderQueue")).toBe(RenderQueueType.Transparent);

    mat.alphaCutoff = 0.5;
    expect(mat.shaderData.getInt("renderQueueType")).toBe(RenderQueueType.Transparent);
    expect(mat.shaderData.getFloat("material_DepthOnlyRenderQueue")).toBe(RenderQueueType.Transparent);

    mat.transmission = 0;
    expect(mat.shaderData.getInt("renderQueueType")).toBe(RenderQueueType.AlphaTest);
    expect(mat.shaderData.getFloat("material_DepthOnlyRenderQueue")).toBe(RenderQueueType.AlphaTest);

    mat.isTransparent = true;
    mat.transmission = 0.5;
    expect(mat.shaderData.getFloat("material_DepthOnlyRenderQueue")).toBe(RenderQueueType.Transparent);
    mat.transmission = 0;
    expect(mat.shaderData.getFloat("material_DepthOnlyRenderQueue")).toBe(RenderQueueType.Transparent);
    mat.isTransparent = false;
    expect(mat.shaderData.getFloat("material_DepthOnlyRenderQueue")).toBe(RenderQueueType.AlphaTest);
    mat.alphaCutoff = 0;
    expect(mat.shaderData.getFloat("material_DepthOnlyRenderQueue")).toBe(RenderQueueType.Opaque);
    mat.destroy();
  });

  it("High & HDR robustness: validates High virtual reprojection, HDR NaN sanitization, farClip>65K sentinel, and replacementShader skip", async () => {
    const { engine, scene, gl } = await createTestEngine(160, 120);
    createdEngines.push(engine);

    const root = scene.createRootEntity("root");
    const camEnt = root.createChild("cam");
    camEnt.transform.setPosition(0, 1.35, 3.6);
    camEnt.transform.lookAt(new Vector3(0, 0.35, -1.2));
    const cam = camEnt.addComponent(Camera);
    cam.enableHDR = true;
    cam.nearClipPlane = 0.2;
    cam.farClipPlane = 100000;

    const { rt, tex } = createReadbackRT(engine, 160, 120);
    cam.renderTarget = rt;

    const floorMat = new PBRMaterial(engine);
    floorMat.baseColor = new Color(0.02, 0.02, 0.02, 1);
    floorMat.metallic = 0.0;
    floorMat.roughness = 0.03;
    addPlane(engine, root, "mirrorFloor", [0, 0, -0.8], 10, 10, floorMat);

    const wallMat = new PBRMaterial(engine);
    wallMat.baseColor = new Color(0.1, 0, 0, 1);
    wallMat.emissiveColor = new Color(4.0, 0.0, 0.0, 1);
    wallMat.screenSpaceReflectionIntensity = 0;
    const wall = addBox(engine, root, "redWall", [0, 1.85, -1.8], [3.2, 2.0, 0.4], wallMat);

    scene.screenSpaceReflection.enabled = true;
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.High;
    stepFrames(engine, 3);

    // CR-006: small camera translation on flat mirror plane preserves High temporal history & reflection
    // @ts-ignore
    const ssrPass = cam._renderPipeline._ssrPass;
    camEnt.transform.setPosition(0.08, 1.35, 3.6);
    camEnt.transform.lookAt(new Vector3(0.08, 0.35, -1.2));
    stepFrames(engine, 2);
    expect(ssrPass._state).toBe(SSRState.ActiveSteady);
    // @ts-ignore
    expect(ssrPass._history.hasTemporalHistory).toBe(true);
    const transFloor = sampleRegionRGB(tex, 0.35, 0.68, 0.65, 0.95);
    expect(transFloor.maxR).toBeGreaterThan(50);

    // CR-010: setReplacementShader skips SSR cleanly WITHOUT destroying persistent SSR GPU resources
    // @ts-ignore
    const preSkipDepthTex = ssrPass._resources.ssrDepthTex;
    expect(preSkipDepthTex).not.toBeNull();
    const replacementShader = Shader.create(`Shader "Test/ReplacementSkipSSR" {
      SubShader "Default" {
        Pass "Forward" {
          Tags { pipelineStage = "Forward" }
          VertexShader = vert;
          FragmentShader = frag;
          #include "ShaderLibrary/Common/Common.glsl"
          #include "ShaderLibrary/Common/Transform.glsl"
          #include "ShaderLibrary/Common/Attributes.glsl"
          void vert(Attributes attr) { gl_Position = renderer_MVPMat * vec4(attr.POSITION, 1.0); }
          void frag() { gl_FragColor = vec4(0.0, 0.5, 0.0, 1.0); }
        }
      }
    }`);
    try {
      cam.setReplacementShader(replacementShader);
      engine.update();
      expect(isSSRActiveForCamera(cam)).toBe(false);
      expect(ssrPass._state).toBe(SSRState.Skipped);
      expect(engine._renderContext.programResolver).toBeNull();
      // @ts-ignore
      expect(ssrPass._programResolver.forwardEnabled).toBe(false);
      // @ts-ignore
      expect(ssrPass._resources.ssrDepthTex).toBe(preSkipDepthTex);
      expect(preSkipDepthTex.destroyed).toBe(false);

      cam.resetReplacementShader();
      engine.update();
      expect(isSSRActiveForCamera(cam)).toBe(true);
      // @ts-ignore
      expect(ssrPass._resources.ssrDepthTex).toBe(preSkipDepthTex);
    } finally {
      replacementShader.destroy(true);
    }

    // CR-007: HDR NaN source pixel must sanitize to 0 (no NaN / 65504 firefly in prevColorPyramid or floor)
    const nanShader = Shader.create(`Shader "Test/HDRNanEmitter" {
      SubShader "Default" {
        Pass "Forward" {
          Tags { pipelineStage = "Forward" }
          VertexShader = vert;
          FragmentShader = frag;
          #include "ShaderLibrary/Common/Common.glsl"
          #include "ShaderLibrary/Common/Transform.glsl"
          #include "ShaderLibrary/Common/Attributes.glsl"
          float material_NegInput;
          void vert(Attributes attr) { gl_Position = renderer_MVPMat * vec4(attr.POSITION, 1.0); }
          void frag() {
            float n = sqrt(material_NegInput);
            gl_FragColor = vec4(n, n, n, 1.0);
          }
        }
      }
    }`);
    const nanMat = new Material(engine, nanShader);
    nanMat.shaderData.setFloat("material_NegInput", -1.0);
    wall.isActive = false;
    const nanWall = addBox(engine, root, "nanWall", [0, 1.85, -1.8], [3.2, 2.0, 0.4], nanMat);
    try {
      stepFrames(engine, 3);
      // @ts-ignore
      const pyrTex = ssrPass._history.prevColorPyramidTex!;
      const isByte = pyrTex.format === TextureFormat.R8G8B8A8_UNorm;
      const buf = isByte
        ? new Uint8Array(pyrTex.width * pyrTex.height * 4)
        : new Float32Array(pyrTex.width * pyrTex.height * 4);
      pyrTex.getPixelBuffer(0, 0, pyrTex.width, pyrTex.height, 0, buf);
      let maxPyr = 0;
      for (let i = 0; i < buf.length; i += 4) {
        const r = isByte ? buf[i] / 255 : buf[i];
        const g = isByte ? buf[i + 1] / 255 : buf[i + 1];
        const b = isByte ? buf[i + 2] / 255 : buf[i + 2];
        expect(Number.isFinite(r)).toBe(true);
        expect(Number.isFinite(g)).toBe(true);
        expect(Number.isFinite(b)).toBe(true);
        maxPyr = Math.max(maxPyr, r, g, b);
      }
      expect(maxPyr).toBeLessThan(1.0);
      const nanFloor = sampleRegionRGB(tex, 0.35, 0.68, 0.65, 0.95);
      expect(nanFloor.maxR).toBeLessThan(20);
      expect(nanFloor.maxG).toBeLessThan(20);
    } finally {
      nanWall.destroy();
      nanMat.destroy();
      nanShader.destroy(true);
    }

    // CR-008: farClipPlane = 100000 (> 65065) with R16F depth still treats bright blue sky as sentinel (no false sky hits)
    cam.enableHDR = false;
    scene.background.solidColor.set(0, 0, 1, 1);
    cam.notifyScreenSpaceReflectionCut();
    stepFrames(engine, 4);
    expect(ssrPass._caps.usesPackedDepthRG8).toBe(false);
    const skyFloor = sampleRegionRGB(tex, 0.35, 0.68, 0.65, 0.95);
    expect(skyFloor.maxB).toBeLessThan(15);
    expect(drainGlErrors(gl)).toEqual([]);

    rt.destroy(true);
    tex.destroy(true);
  });

  it("CR-020: verifies RG8/OCT8 packed readback, submerged tile depth cutoff, and steady-state zero Texture2D/RenderTarget allocations", async () => {
    const { engine, scene, gl } = await createTestEngine(160, 120);
    createdEngines.push(engine);

    const root = scene.createRootEntity("root");
    const camEnt = root.createChild("cam");
    camEnt.transform.setPosition(0, 1.35, 3.6);
    camEnt.transform.lookAt(new Vector3(0, 0.35, -1.2));
    const cam = camEnt.addComponent(Camera);

    const { rt, tex } = createReadbackRT(engine, 160, 120);
    cam.renderTarget = rt;

    const floorMat = new PBRMaterial(engine);
    floorMat.baseColor = new Color(0.02, 0.02, 0.02, 1);
    floorMat.metallic = 0.0;
    floorMat.roughness = 0.03;
    addPlane(engine, root, "mirrorFloor", [0, 0, -0.8], 10, 10, floorMat);

    const wallMat = new PBRMaterial(engine);
    wallMat.emissiveColor = new Color(4.0, 0.0, 0.0, 1);
    wallMat.screenSpaceReflectionIntensity = 0;
    addBox(engine, root, "redWall", [0, 1.85, -1.8], [3.2, 2.0, 0.4], wallMat);

    // 1. Baseline off
    scene.screenSpaceReflection.enabled = false;
    stepFrames(engine, 2);
    const offFloor = sampleRegionRGB(tex, 0.35, 0.68, 0.65, 0.95);

    // 2. RG8 / OCT8 packed mode accurate pixel readback
    // @ts-ignore
    const ssrPass = cam._renderPipeline._getOrCreateSSRPass();
    // @ts-ignore
    ssrPass._forcePackedFormats = true;
    scene.screenSpaceReflection.enabled = true;
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.Medium;
    stepFrames(engine, 3);
    expect(ssrPass._state).toBe(SSRState.ActiveSteady);
    expect(ssrPass._caps.usesPackedDepthRG8).toBe(true);
    expect(ssrPass._caps.usesPackedNormalOct8).toBe(true);
    const packedFloor = sampleRegionRGB(tex, 0.35, 0.68, 0.65, 0.95);
    expect(packedFloor.maxR).toBeGreaterThan(offFloor.maxR + 40);

    // 3. Steady-state zero Texture2D / RenderTarget allocations
    // @ts-ignore
    ssrPass._forcePackedFormats = false;
    stepFrames(engine, 3);
    expect(ssrPass._state).toBe(SSRState.ActiveSteady);
    const rhi = engine._hardwareRenderer;
    const texCreateSpy = vi.spyOn(rhi, "createPlatformTexture2D");
    const rtCreateSpy = vi.spyOn(rhi, "createPlatformRenderTarget");
    stepFrames(engine, 5);
    expect(texCreateSpy).not.toHaveBeenCalled();
    expect(rtCreateSpy).not.toHaveBeenCalled();
    texCreateSpy.mockRestore();
    rtCreateSpy.mockRestore();

    // 4. Submerged tile depth cutoff: flat semi-transparent rough water (0.58 < maxRoughness 0.6) over right half
    // claims SSRReceiver depth at y=0.25 with ~0 SSR of its own, cutting off deeper mirrorFloor reflection underneath
    const coverWaterMat = new PBRMaterial(engine);
    coverWaterMat.isTransparent = true;
    coverWaterMat.baseColor = new Color(0.02, 0.05, 0.08, 0.25);
    coverWaterMat.roughness = 0.58;
    coverWaterMat.screenSpaceReflectionIntensity = 1.0;
    addPlane(engine, root, "coverWater", [1.8, 0.3, 0.0], 3.2, 6.0, coverWaterMat);
    stepFrames(engine, 3);
    const uncoveredLeft = sampleRegionRGB(tex, 0.2, 0.72, 0.38, 0.92);
    const coveredRight = sampleRegionRGB(tex, 0.62, 0.72, 0.8, 0.92);
    expect(uncoveredLeft.maxR).toBeGreaterThan(40);
    expect(coveredRight.maxR).toBeLessThan(uncoveredLeft.maxR * 0.5);
    expect(drainGlErrors(gl)).toEqual([]);

    rt.destroy(true);
    tex.destroy(true);
  });

  it("skips screenSpaceReflectionOccluder=false and sub-threshold micro occluders in Step A DepthOnly while keeping large occluders", async () => {
    const { engine, scene, gl } = await createTestEngine(160, 128);
    createdEngines.push(engine);

    const root = scene.createRootEntity("root");
    const camEnt = root.createChild("cam");
    camEnt.transform.setPosition(0, 0, 6);
    camEnt.transform.lookAt(new Vector3(0, 0, 0));
    const cam = camEnt.addComponent(Camera);

    const { rt, tex } = createReadbackRT(engine, 160, 128);
    cam.renderTarget = rt;

    // Rear glossy wall at z = -2 (eyeDepth = 8.0)
    const rearMat = new PBRMaterial(engine);
    rearMat.baseColor = new Color(1, 0, 0, 1);
    rearMat.emissiveColor = new Color(1, 0, 0, 1);
    rearMat.roughness = 0.05;
    addBox(engine, root, "rearWall", [0, 0, -2], [12, 10, 0.2], rearMat);

    // Mid blocker at z = 0 (eyeDepth ~ 5.9), large enough to cover the center when enabled
    const foliageMat = new UnlitMaterial(engine);
    foliageMat.baseColor = new Color(0, 1, 0, 1);
    foliageMat.alphaCutoff = 0.5;
    foliageMat.screenSpaceReflectionOccluder = false;
    addBox(engine, root, "foliageCard", [0, 0, 0], [4, 4, 0.2], foliageMat);

    // Tiny distant/micro prop on the left half that projects well below Step A threshold on 80x64
    const tinyPropMat = new PBRMaterial(engine);
    tinyPropMat.baseColor = new Color(0, 0, 1, 1);
    tinyPropMat.screenSpaceReflectionIntensity = 0;
    addBox(engine, root, "tinyProp", [-0.6, 0, 1.0], [0.04, 0.04, 0.04], tinyPropMat);

    // Large pillar on the right half that stays well above Step A threshold
    const bigPillarMat = new PBRMaterial(engine);
    bigPillarMat.baseColor = new Color(0, 0, 1, 1);
    bigPillarMat.screenSpaceReflectionIntensity = 0;
    addBox(engine, root, "bigPillar", [1.2, 0, 1.0], [1.4, 3.0, 0.2], bigPillarMat);

    scene.screenSpaceReflection.enabled = true;
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.Medium;
    stepFrames(engine, 3);

    // @ts-ignore access internal trace depth history
    const ssrPass = cam._renderPipeline._ssrPass;
    const sampleDepth = (u: number, v: number): number => {
      // @ts-ignore
      const history = ssrPass._history;
      const lastHiZIdx = history.hiZPingPongIndex === 0 ? 1 : 0;
      const traceDepthTex = history.hiZTex[lastHiZIdx]!;
      const depths = readSSRDepthBuffer(traceDepthTex, ssrPass._caps.usesPackedDepthRG8, cam.farClipPlane);
      const x = Math.min(traceDepthTex.width - 1, Math.max(0, Math.floor(u * traceDepthTex.width)));
      const y = Math.min(traceDepthTex.height - 1, Math.max(0, Math.floor(v * traceDepthTex.height)));
      return depths[y * traceDepthTex.width + x];
    };

    // With screenSpaceReflectionOccluder = false, center hits rearWall (~7.9); bigPillar (~4.9) stays occluded; tinyProp does not replace rearWall
    expect(sampleDepth(0.5, 0.5)).toBeCloseTo(7.9, 1);
    expect(sampleDepth(0.35, 0.5)).toBeCloseTo(7.9, 1);
    expect(sampleDepth(0.75, 0.5)).toBeCloseTo(4.9, 1);

    // Enabling screenSpaceReflectionOccluder restores DepthOnly occlusion for the mid card (~5.9)
    foliageMat.screenSpaceReflectionOccluder = true;
    stepFrames(engine, 2);
    expect(sampleDepth(0.5, 0.5)).toBeCloseTo(5.9, 1);
    expect(drainGlErrors(gl)).toEqual([]);

    rt.destroy(true);
    tex.destroy(true);
  });

  it("A2/A3/A4/P1.1/F6: preserves history across cubeFace sub-views, recovers from RT alloc failure, reclaims disabled camera after idle frames, destroys old textures immediately on resize, and resets RG8 on farClip change", async () => {
    const { engine, scene, gl } = await createTestEngine(128, 96);
    createdEngines.push(engine);

    const root = scene.createRootEntity("root");
    const camEnt = root.createChild("cam");
    camEnt.transform.setPosition(0, 1.5, 4);
    camEnt.transform.lookAt(new Vector3(0, 0, 0));
    const cam = camEnt.addComponent(Camera);

    const floorMat = new PBRMaterial(engine);
    floorMat.roughness = 0.05;
    addPlane(engine, root, "floor", [0, 0, 0], 6, 6, floorMat);

    scene.screenSpaceReflection.enabled = true;
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.Medium;
    stepFrames(engine, 3);
    const ssrPass = getSSRPass(cam);
    expect(ssrPass._state).toBe(SSRState.ActiveSteady);

    // A2: rendering a cubeFace sub-view on the same camera must NOT destroy main-view history
    // @ts-ignore
    const origColorTex = ssrPass._history.prevColorPyramidTex;
    const cubeRT = new RenderTarget(
      engine,
      32,
      32,
      new Texture2D(engine, 32, 32, TextureFormat.R8G8B8A8_UNorm, false),
      null,
      1
    );
    const prevRT = cam.renderTarget;
    cam.renderTarget = cubeRT;
    cam.render(TextureCubeFace.PositiveX, 0);
    cam.renderTarget = prevRT;
    cubeRT.getColorTexture(0)?.destroy(true);
    cubeRT.destroy(true);
    // @ts-ignore
    expect(ssrPass._history.prevColorPyramidTex).toBe(origColorTex);
    // @ts-ignore
    expect(ssrPass._history.hasColorHistory).toBe(true);
    stepFrames(engine, 1);
    expect(ssrPass._state).toBe(SSRState.ActiveSteady);

    // P1.1: resizing/rotating immediately destroys old private textures (not pendingDestroy)
    // @ts-ignore
    const oldDepthTex = ssrPass._resources.ssrDepthTex!;
    // @ts-ignore
    const oldColorTex = ssrPass._history.prevColorPyramidTex!;
    const rot = createReadbackRT(engine, 96, 128);
    cam.renderTarget = rot.rt;
    stepFrames(engine, 1);
    expect(oldDepthTex.destroyed).toBe(true);
    expect(oldDepthTex.pendingDestroy).toBe(false);
    expect(oldColorTex.destroyed).toBe(true);
    expect(oldColorTex.pendingDestroy).toBe(false);
    cam.renderTarget = null;
    rot.rt.destroy(true);
    rot.tex.destroy(true);

    // F6: RG8 packed mode resets history when farClipPlane changes
    ssrPass._forcePackedFormats = true;
    stepFrames(engine, 3);
    expect(ssrPass._state).toBe(SSRState.ActiveSteady);
    cam.farClipPlane = 250;
    stepFrames(engine, 1);
    expect(ssrPass._state).toBe(SSRState.WarmupColor);
    ssrPass._forcePackedFormats = false;
    stepFrames(engine, 3);
    expect(ssrPass._state).toBe(SSRState.ActiveSteady);

    // A3: transient RenderTarget failure during same-size rebuild must recover on next frame
    // @ts-ignore
    ssrPass._deactivate(SSRState.Skipped, cam);
    const origDepthTexCtor = ssrPass._resources.createPointClampTex.bind(ssrPass._resources);
    let failOnce = true;
    const spy = vi
      .spyOn(ssrPass._resources, "createPointClampTex")
      .mockImplementation((w: number, h: number, fmt: TextureFormat) => {
        if (failOnce) {
          failOnce = false;
          throw new Error("Simulated transient allocation failure");
        }
        return origDepthTexCtor(w, h, fmt);
      });
    try {
      stepFrames(engine, 1);
      expect(ssrPass._state).toBe(SSRState.Skipped);
    } finally {
      spy.mockRestore();
    }
    stepFrames(engine, 3);
    expect(ssrPass._state).toBe(SSRState.ActiveSteady);

    // A4: disabled camera reclaims persistent SSR resources after >= 10 idle engine frames
    expect(getSSRRetainedBytes(ssrPass)).toBeGreaterThan(0);
    cam.enabled = false;
    stepFrames(engine, 11);
    expect(getSSRRetainedBytes(ssrPass)).toBe(0);
    expect(isSSRActiveForCamera(cam)).toBe(false);
    // Re-enabling recovers cleanly
    cam.enabled = true;
    stepFrames(engine, 3);
    expect(ssrPass._state).toBe(SSRState.ActiveSteady);
    expect(drainGlErrors(gl)).toEqual([]);
  });

  it("F1/F3/F4: rejects 20.1m back transparent layer behind 20.0m front receiver, handles 4x MSAA with 3 active post-process passes, and syncs legacy transparent PBR .mat DepthOnly queue", async () => {
    const engine = await WebGLEngine.create({
      canvas: createCanvas(128, 96),
      shaderCompiler: new ShaderCompiler(),
      graphicDeviceOptions: {
        alpha: false,
        antialias: true,
        stencil: true,
        preserveDrawingBuffer: true
      }
    });
    const scene = engine.sceneManager.activeScene;
    scene.background.mode = BackgroundMode.SolidColor;
    scene.background.solidColor.set(0, 0, 0, 1);
    const gl = engine._hardwareRenderer.gl;
    drainGlErrors(gl);
    createdEngines.push(engine);

    const root = scene.createRootEntity("root");
    const camEnt = root.createChild("cam");
    camEnt.transform.setPosition(0, 0, 20);
    camEnt.transform.lookAt(new Vector3(0, 0, 0));
    const cam = camEnt.addComponent(Camera);

    // F4: legacy transparent PBR .mat JSON without material_DepthOnlyRenderQueue must default DepthOnly queue to Transparent (3000)
    const legacyBlobUrl = createBlobURL(
      {
        name: "LegacyGlass",
        shader: "PBR",
        shaderData: {
          renderQueueType: { type: "Integer", value: RenderQueueType.Transparent },
          blendEnabled: { type: "Boolean", value: true }
        },
        macros: []
      },
      "mat"
    );
    try {
      const loadedMat = await engine.resourceManager.load<Material>({ url: legacyBlobUrl, type: AssetType.Material });
      expect(loadedMat.shaderData.getFloat("material_DepthOnlyRenderQueue")).toBe(RenderQueueType.Transparent);
      loadedMat.destroy();
    } finally {
      URL.revokeObjectURL(legacyBlobUrl.split("#")[0]);
    }

    // F1: Front glossy transparent plane at z=0 (eyeDepth=20.0m) and back transparent plane at z=-0.1 (eyeDepth=20.1m)
    const { rt, tex } = createReadbackRT(engine, 128, 96);
    cam.renderTarget = rt;

    // Bright green emitter on the right side (visible in frustum and hit by off-center reflection ray from z=0)
    const emitterMat = new UnlitMaterial(engine);
    emitterMat.baseColor = new Color(0, 1, 0, 1);
    addBox(engine, root, "emitter", [4.0, 0, 10], [2.4, 8, 0.2], emitterMat);

    // Front transparent receiver strictly parallel to image plane (depthSlope = 0) at z = 0 (eyeDepth = 20.0m)
    const frontMat = new PBRMaterial(engine);
    frontMat.isTransparent = true;
    frontMat.baseColor = new Color(0, 0, 0, 0.01);
    frontMat.roughness = 0.05;
    frontMat.metallic = 0.0;
    frontMat.screenSpaceReflectionBilateral = false;
    addBox(engine, root, "frontGlass", [0, 0, 0], [10, 8, 0.002], frontMat);

    // Back transparent layer at z = -0.1 (eyeDepth = 20.1m, 0.1m behind front, depthSlope = 0)
    const probeShader = Shader.create(`Shader "Test/F1BackDepthVerify" {
      SubShader "Default" {
        Pass "Forward" {
          Tags { pipelineStage = "Forward" }
          RenderQueueType = Transparent;
          DepthState = { Enabled = true; WriteEnabled = false; }
          VertexShader = vert;
          FragmentShader = frag;
          #include "ShaderLibrary/Common/Common.glsl"
          #include "ShaderLibrary/Common/Transform.glsl"
          #include "ShaderLibrary/Lighting/ScreenSpaceReflection/ScreenSpaceReflectionSample.glsl"
          struct Attributes { vec3 POSITION; };
          struct Varyings { vec4 posCS; };
          Varyings vert(Attributes a) {
            Varyings v;
            v.posCS = renderer_MVPMat * vec4(a.POSITION, 1.0);
            gl_Position = v.posCS;
            return v;
          }
          void frag(Varyings v) {
            vec3 outC = vec3(0.0, 0.0, 1.0);
            #ifdef CAMERA_ENABLE_SSR
              outC = evaluateScreenSpaceReflection(v.posCS, vec3(0.0, 0.0, 1.0), 0.05, vec3(0.0, 0.0, 1.0));
            #endif
            gl_FragColor = vec4(outC, 1.0);
          }
        }
      }
    }`);
    const probeMat = new Material(engine, probeShader);
    probeMat.screenSpaceReflectionIntensity = 1.0;
    probeMat.screenSpaceReflectionBilateral = false;
    addBox(engine, root, "backGlass", [0, 0, -0.1], [10, 8, 0.002], probeMat);

    scene.screenSpaceReflection.enabled = true;
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.Medium;
    stepFrames(engine, 4);
    const centerPx = new Uint8Array(4);
    tex.getPixelBuffer(82, 48, 1, 1, 0, centerPx);
    // Back layer at 20.1m must reject 20.0m front receiver (tol ~0.04m < 0.10m) and keep fallback blue
    expect(centerPx[2]).toBeGreaterThan(200);
    expect(centerPx[1]).toBeLessThan(30);

    // F3: 4x MSAA + 3 active PostProcessPass instances must read Pass 2's output in Pass 3 (not stale scene color)
    const makeTagPass = (name: string, color: [number, number, number]): PostProcessPass => {
      const passShader = Shader.create(`Shader "Test/${name}" {
        SubShader "Default" {
          Pass "Blit" {
            DepthState = { Enabled = false; WriteEnabled = false; }
            VertexShader = vert;
            FragmentShader = frag;
            struct Attributes { vec4 POSITION_UV; };
            struct Varyings { vec2 uv; };
            sampler2D renderer_BlitTexture;
            Varyings vert(Attributes a) {
              Varyings v;
              v.uv = a.POSITION_UV.zw;
              gl_Position = vec4(a.POSITION_UV.xy, 0.0, 1.0);
              return v;
            }
            void frag(Varyings v) {
              vec3 prev = texture2D(renderer_BlitTexture, v.uv).rgb;
              gl_FragColor = vec4(prev + vec3(${color[0].toFixed(2)}, ${color[1].toFixed(2)}, ${color[2].toFixed(2)}), 1.0);
            }
          }
        }
      }`);
      const mat = new Material(engine, passShader);
      class TagPass extends PostProcessPass {
        override isValid(): boolean {
          return true;
        }
        override onRender(camera: Camera, srcTexture: Texture2D, destTarget: RenderTarget | null): void {
          Blitter.blitTexture(camera.engine, srcTexture, destTarget, 0, undefined, mat, 0);
        }
      }
      return new TagPass(engine);
    };

    scene.background.solidColor = new Color(0, 0, 0, 1);
    scene.screenSpaceReflection.enabled = false;
    cam.msaaSamples = MSAASamples.FourX;
    cam.enablePostProcess = true;
    const p1 = makeTagPass("PPPass1", [0.4, 0.0, 0.0]);
    const p2 = makeTagPass("PPPass2", [0.0, 0.4, 0.0]);
    const p3 = makeTagPass("PPPass3", [0.0, 0.0, 0.4]);
    engine.addPostProcessPass(p1);
    engine.addPostProcessPass(p2);
    engine.addPostProcessPass(p3);
    try {
      stepFrames(engine, 1);
      const ppPx = new Uint8Array(4);
      tex.getPixelBuffer(4, 4, 1, 1, 0, ppPx);
      // All 3 passes accumulated: R >= 0.4, G >= 0.4 (from Pass 2!), B >= 0.4 (from Pass 3)
      expect(ppPx[0]).toBeGreaterThan(80);
      expect(ppPx[1]).toBeGreaterThan(80);
      expect(ppPx[2]).toBeGreaterThan(80);
    } finally {
      p1.isActive = false;
      p2.isActive = false;
      p3.isActive = false;
    }

    expect(drainGlErrors(gl)).toEqual([]);
    probeMat.destroy();
    probeShader.destroy();
    rt.destroy(true);
    tex.destroy(true);
  });

  it("recovers background cliff reflection behind foreground thin branch lattice via Hi-Z foreground-escape while preserving mid-ground object reflections", async () => {
    const { engine, scene, gl } = await createTestEngine(640, 640);
    createdEngines.push(engine);

    const { rt, tex } = createReadbackRT(engine, 640, 640);
    const root = scene.createRootEntity("root");
    const camEnt = root.createChild("cam");
    camEnt.transform.setPosition(0, 2.2, 2);
    camEnt.transform.lookAt(new Vector3(0, 0.4, -18));
    const cam = camEnt.addComponent(Camera);
    cam.fieldOfView = 50;
    cam.renderTarget = rt;

    // Dark mirror lake surface
    const floorMat = new PBRMaterial(engine);
    floorMat.baseColor = new Color(0.02, 0.02, 0.02, 1);
    floorMat.metallic = 1.0;
    floorMat.roughness = 0.02;
    floorMat.screenSpaceReflectionIntensity = 1.0;
    addPlane(engine, root, "lake", [0, 0, -13], 30, 24, floorMat);

    // Tall bright green background cliff wall behind the lake
    const cliffMat = new UnlitMaterial(engine);
    cliffMat.baseColor = new Color(0, 1, 0, 1);
    addBox(engine, root, "cliff", [0, 7, -24], [30, 16, 0.5], cliffMat);

    // Foreground leafless branch lattice close to camera (z = -4, eyeDepth ~6m << lake 10..22m << cliff 26m)
    // Spans left-center x in [-5, +0.5], leaving right side unobstructed for reference comparison.
    const twigMat = new UnlitMaterial(engine);
    twigMat.baseColor = new Color(0.06, 0.04, 0.02, 1);
    const twigHeights = [1.4, 1.9, 2.4, 2.9, 3.4, 3.9];
    for (let idx = 0; idx < twigHeights.length; idx++) {
      addBox(engine, root, `twig-${idx}`, [-2.0, twigHeights[idx], -4.0], [5.0, 0.07, 0.07], twigMat);
    }

    // Mid-ground bright red pillar standing on the right side of the lake (z = -15) that MUST reflect cleanly
    const pillarMat = new UnlitMaterial(engine);
    pillarMat.baseColor = new Color(1, 0, 0, 1);
    addBox(engine, root, "midPillar", [4.2, 2.5, -15], [1.6, 5.0, 1.6], pillarMat);

    scene.screenSpaceReflection.enabled = true;
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.High;
    scene.screenSpaceReflection.maxDistance = 120;
    scene.screenSpaceReflection.thickness = 0.2;
    scene.screenSpaceReflection.edgeFade = 0.02;
    stepFrames(engine, 4);

    // Readback reflection strip on the lake surface behind the foreground twig lattice (left-center x = 200..300)
    // and unobstructed right-of-lattice reference (x = 360..410), in lower-mid lake y = 140..250 (bottom-up coords).
    const behindBuf = new Uint8Array(100 * 110 * 4);
    tex.getPixelBuffer(200, 140, 100, 110, 0, behindBuf);
    let behindGreenHits = 0;
    for (let i = 0; i < behindBuf.length; i += 4) {
      if (behindBuf[i + 1] > 100 && behindBuf[i] < 40) behindGreenHits++;
    }
    const behindCoverage = behindGreenHits / (100 * 110);

    const clearBuf = new Uint8Array(50 * 110 * 4);
    tex.getPixelBuffer(360, 140, 50, 110, 0, clearBuf);
    let clearGreenHits = 0;
    for (let i = 0; i < clearBuf.length; i += 4) {
      if (clearBuf[i + 1] > 100 && clearBuf[i] < 40) clearGreenHits++;
    }
    const clearCoverage = clearGreenHits / (50 * 110);

    // Behind-lattice lake column must retain strong green cliff reflection (previously dropped near 0% under 28-step Hi-Z)
    expect(clearCoverage).toBeGreaterThan(0.7);
    expect(behindCoverage).toBeGreaterThan(0.55);

    // Mid-ground red pillar on the right must still reflect cleanly on the lake in front of it
    const pillarReflBuf = new Uint8Array(120 * 180 * 4);
    tex.getPixelBuffer(440, 120, 120, 180, 0, pillarReflBuf);
    let redHits = 0;
    for (let i = 0; i < pillarReflBuf.length; i += 4) {
      if (pillarReflBuf[i] > 120 && pillarReflBuf[i + 1] < 40) redHits++;
    }
    expect(redHits).toBeGreaterThan(200);
    expect(drainGlErrors(gl)).toEqual([]);

    rt.destroy(true);
    tex.destroy(true);
  });

  it("enforces architecture boundary invariants (RHI invalidateRenderTarget safety, custom shader non-pruning, ShaderProgram member-access sampler counting, immediate destroy without Engine internal mutation)", async () => {
    const engine = await WebGLEngine.create({
      canvas: createCanvas(160, 120),
      shaderCompiler: new ShaderCompiler(),
      graphicDeviceOptions: {
        alpha: false,
        antialias: true,
        stencil: true,
        preserveDrawingBuffer: true
      }
    });
    createdEngines.push(engine);
    const scene = engine.sceneManager.activeScene;
    const gl = engine._hardwareRenderer.gl;
    const rhi = engine._hardwareRenderer;
    drainGlErrors(gl);

    // 1. RHI invalidateRenderTarget safety: skip when target is NOT active or partial scissor blocks full clear
    const colorTexA = new Texture2D(engine, 64, 64, TextureFormat.R8G8B8A8_UNorm, false, false);
    const rtA = new RenderTarget(engine, 64, 64, colorTexA, TextureFormat.Depth16, 1);
    const invSpy = vi.spyOn(gl, "invalidateFramebuffer");
    try {
      rhi.activeRenderTarget(null, new Vector4(0, 0, 1, 1), false);
      rhi.invalidateRenderTarget?.(rtA, CameraClearFlags.Color);
      expect(invSpy).toHaveBeenCalledTimes(0);

      rhi.activeRenderTarget(rtA, new Vector4(0, 0, 0.5, 0.5), false);
      rhi.invalidateRenderTarget?.(rtA, CameraClearFlags.Color, true);
      expect(invSpy).toHaveBeenCalledTimes(0);

      rhi.activeRenderTarget(rtA, new Vector4(0, 0, 1, 1), false);
      rhi.invalidateRenderTarget?.(rtA, CameraClearFlags.Color, true);
      expect(invSpy).toHaveBeenCalledTimes(1);

      rtA.destroy(true);
      colorTexA.destroy(true);
      rhi.invalidateRenderTarget?.(rtA, CameraClearFlags.Color);
      expect(invSpy).toHaveBeenCalledTimes(1);
    } finally {
      invSpy.mockRestore();
      rhi.activeRenderTarget(null, new Vector4(0, 0, 1, 1), false);
    }
    expect(drainGlErrors(gl)).toEqual([]);

    // 2. ShaderProgram._activeFragmentTextureCount ignores `.member` / swizzle member access on vertex-only samplers
    const memberAccessShader = Shader.create(`Shader "Test/BoundaryMemberSampler" {
      SubShader "Default" {
        Pass "Forward" {
          Tags { pipelineStage = "Forward" }
          VertexShader = vert;
          FragmentShader = frag;
          struct Attributes { vec3 POSITION; };
          struct Varyings { vec4 color; };
          sampler2D rgb;
          Varyings vert(Attributes attr) {
            Varyings v;
            vec4 tex = texture2D(rgb, vec2(0.5));
            v.color = vec4(tex.rgb + vec3(1.0), 1.0);
            gl_Position = vec4(attr.POSITION + tex.xyz * 0.001, 1.0);
            return v;
          }
          void frag(Varyings v) {
            gl_FragColor = vec4(v.color.rgb, 1.0);
          }
        }
      }
    }`);
    try {
      const program = memberAccessShader.subShaders[0].passes[0]._getShaderProgram(engine, new ShaderMacroCollection());
      expect(program.isValid).toBe(true);
      expect(program.activeTextureCount).toBe(0);
    } finally {
      memberAccessShader.destroy(true);
    }

    // 3. Custom non-PBR shader declaring `material_Roughness = 1.0` must NOT be pruned by PBR scalar roughness optimization
    const customNonPBRShader = Shader.create(`Shader "Test/BoundaryCustomRoughnessSSR" {
      SubShader "Default" {
        Pass "Forward" {
          Tags { pipelineStage = "Forward" }
          VertexShader = vert;
          FragmentShader = frag;
          #include "ShaderLibrary/Common/Common.glsl"
          #include "ShaderLibrary/Common/Transform.glsl"
          #include "ShaderLibrary/Common/Attributes.glsl"
          float material_Roughness;
          void vert(Attributes attr) { gl_Position = renderer_MVPMat * vec4(attr.POSITION, 1.0); }
          void frag() { gl_FragColor = vec4(material_Roughness * 0.1, 0.2, 0.3, 1.0); }
        }
        Pass "SSRReceiver" {
          Tags { pipelineStage = "SSRReceiver" }
          VertexShader = vert;
          FragmentShader = frag;
          #include "ShaderLibrary/Common/Common.glsl"
          #include "ShaderLibrary/Common/Transform.glsl"
          #include "ShaderLibrary/Common/Attributes.glsl"
          struct CustomSSROut {
            layout(location = 0) vec4 normalRoughness;
            layout(location = 1) vec4 receiverDepth;
          };
          void vert(Attributes attr) { gl_Position = renderer_MVPMat * vec4(attr.POSITION, 1.0); }
          CustomSSROut frag() {
            CustomSSROut o;
            o.normalRoughness = vec4(0.5, 0.5, 0.1, 1.0);
            o.receiverDepth = vec4(0.5, 0.0, 0.0, 1.0);
            return o;
          }
        }
      }
    }`);
    const root = scene.createRootEntity("root");
    const camEnt = root.createChild("cam");
    camEnt.transform.setPosition(0, 1.5, 4);
    camEnt.transform.lookAt(new Vector3(0, 0, 0));
    const cam = camEnt.addComponent(Camera);

    const customMat = new Material(engine, customNonPBRShader);
    customMat.screenSpaceReflectionIntensity = 1.0;
    customMat.shaderData.setFloat("material_Roughness", 1.0);

    const floorEnt = addPlane(engine, root, "floor", [0, 0, 0], 6, 6, customMat);
    scene.screenSpaceReflection.enabled = true;
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.Medium;
    scene.screenSpaceReflection.maxRoughness = 0.5;
    stepFrames(engine, 3);
    const ssrPass = getSSRPass(cam);
    expect(isSSRActiveForCamera(cam)).toBe(true);
    expect(ssrPass._frame.opaqueReceiverCount).toBe(1);

    // Built-in PBR scalar roughness >= maxRoughness still prunes properly
    const pbrMat = new PBRMaterial(engine);
    pbrMat.roughness = 0.9;
    pbrMat.screenSpaceReflectionIntensity = 1.0;
    floorEnt.getComponent(MeshRenderer)!.setMaterial(pbrMat);
    stepFrames(engine, 1);
    expect(isSSRActiveForCamera(cam)).toBe(false);
    expect(ssrPass._frame.opaqueReceiverCount).toBe(0);

    // Restore eligible PBR material to trigger persistent allocations at Medium resolution, then resize to Low
    pbrMat.roughness = 0.05;
    stepFrames(engine, 3);
    expect(isSSRActiveForCamera(cam)).toBe(true);

    // 4. EngineObject._destroyImmediate synchronously destroys resized SSR textures without mutating engine._processingPendingDestroys
    // @ts-ignore
    const oldDepthTex: Texture2D = ssrPass._resources.ssrDepthTex!;
    expect(oldDepthTex).not.toBeNull();
    expect(oldDepthTex.destroyed).toBe(false);

    let processingDuringImmediate: boolean | null = null;
    const origDestroyImmediate = oldDepthTex._destroyImmediate.bind(oldDepthTex);
    const immediateSpy = vi.spyOn(oldDepthTex, "_destroyImmediate").mockImplementation(() => {
      processingDuringImmediate = engine._processingPendingDestroys;
      origDestroyImmediate();
    });
    try {
      scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.Low;
      engine.update();
      expect(immediateSpy).toHaveBeenCalledTimes(1);
      expect(processingDuringImmediate).toBe(false);
      expect(oldDepthTex.destroyed).toBe(true);
    } finally {
      immediateSpy.mockRestore();
      customMat.destroy();
      pbrMat.destroy();
      customNonPBRShader.destroy(true);
    }
    expect(drainGlErrors(gl)).toEqual([]);
  });

  it("P3-1: immediately destroys ScreenSpaceReflectionPass private material idempotently and syncs BlinnPhong legacy .mat DepthOnly queue", async () => {
    const { engine, scene, gl } = await createTestEngine(64, 64);
    createdEngines.push(engine);

    const camEnt = scene.createRootEntity("cam-ent");
    const cam = camEnt.addComponent(Camera);
    // Lazy init: non-SSR camera must not allocate _ssrPass or register device listeners
    // @ts-ignore verify lazy SSR pass creation on non-SSR camera
    expect(cam._renderPipeline._ssrPass).toBeNull();
    expect(isSSRActiveForCamera(cam)).toBe(false);
    expect(getSSRRetainedBytes(getSSRPass(cam))).toBe(0);

    // @ts-ignore access internal SSR pass and private material for lifecycle verification
    const ssrPass = cam._renderPipeline._getOrCreateSSRPass();
    // @ts-ignore
    const privateMat = ssrPass._material;
    expect(privateMat.destroyed).toBe(false);

    ssrPass.onDestroy();
    expect(privateMat.destroyed).toBe(true);
    expect(privateMat._getReferCount()).toBe(0);
    expect(ssrPass._state).toBe(SSRState.Disabled);
    expect(isSSRActiveForCamera(cam)).toBe(false);
    expect(getSSRRetainedBytes(ssrPass)).toBe(0);
    // Second onDestroy() must be idempotent without throwing or underflowing referCount
    expect(() => ssrPass.onDestroy()).not.toThrow();

    const blinnMat = await engine.resourceManager.load<Material>({
      url: createBlobURL(
        {
          name: "LegacyTransparentBlinnPhong",
          shader: "BlinnPhong",
          shaderData: {
            blendEnabled: { type: "Boolean", value: true }
          },
          macros: []
        },
        "mat"
      ),
      type: AssetType.Material
    });
    expect(blinnMat.shaderData.getFloat("material_DepthOnlyRenderQueue")).toBe(RenderQueueType.Transparent);
    blinnMat.destroy(true);

    expect(drainGlErrors(gl)).toEqual([]);
  });

  it("P0-1.3: verifies merged DownsampleAndBuildHiZMip0 accuracy (Medium/VeryHigh, SAO, SSR_HAS_CONTRIB_DEPTH) and _hiZDepthMip0RT resize/destroy lifecycle", async () => {
    const { engine, scene, gl } = await createTestEngine(160, 120);
    createdEngines.push(engine);

    const root = scene.createRootEntity("root");
    const camEnt = root.createChild("cam");
    camEnt.transform.setPosition(0, 1.35, 3.6);
    camEnt.transform.lookAt(new Vector3(0, 0.35, -1.2));
    const cam = camEnt.addComponent(Camera);
    cam.nearClipPlane = 0.2;
    cam.farClipPlane = 50;
    cam.depthTextureMode = DepthTextureMode.PrePass;

    // SAO forces full DepthOnly prepass on every frame
    scene.ambientOcclusion.enabled = true;

    const { rt, tex } = createReadbackRT(engine, 160, 120);
    cam.renderTarget = rt;

    const floorMat = new PBRMaterial(engine);
    floorMat.baseColor = new Color(0.02, 0.02, 0.02, 1);
    floorMat.roughness = 0.03;
    floorMat.screenSpaceReflectionIntensity = 1.0;
    addPlane(engine, root, "floor", [0, 0, -0.8], 10, 10, floorMat);

    // Opaque red backdrop on the left, transparent cyan depth-contributor curtain on the right
    const rearWallMat = new PBRMaterial(engine);
    rearWallMat.baseColor = new Color(0.08, 0, 0, 1);
    rearWallMat.emissiveColor = new Color(4.0, 0.0, 0.0, 1);
    rearWallMat.screenSpaceReflectionIntensity = 0;
    addBox(engine, root, "redWall", [-1.3, 1.85, -1.8], [2.2, 2.0, 0.4], rearWallMat);

    const contribMat = new PBRMaterial(engine);
    contribMat.isTransparent = true;
    contribMat.baseColor = new Color(0.0, 0.2, 0.2, 0.85);
    contribMat.emissiveColor = new Color(0.0, 4.0, 4.0, 1);
    contribMat.screenSpaceReflectionIntensity = 0;
    contribMat.contributeScreenSpaceReflectionDepth = false;
    addBox(engine, root, "cyanCurtain", [1.3, 1.85, -1.5], [2.2, 2.0, 0.3], contribMat);

    // Transparent contributor floating in front of the floor at eyeDepth ~3.1m (floor behind is ~4.6m).
    // Proves gl_FragDepth writes opaque-only maxD to _ssrDepthTex BEFORE folding contribRawDepth into Hi-Z minD.
    const frontCardMat = new PBRMaterial(engine);
    frontCardMat.isTransparent = true;
    frontCardMat.baseColor = new Color(0.05, 0.05, 0.05, 0.15);
    frontCardMat.screenSpaceReflectionIntensity = 0;
    frontCardMat.contributeScreenSpaceReflectionDepth = true;
    const frontCard = addBox(engine, root, "frontContribCard", [0, 0.45, 0.6], [1.2, 0.6, 0.1], frontCardMat);
    frontCard.isActive = false;

    // @ts-ignore access internal pass for merged pass & RT lifecycle assertions
    const ssrPass = cam._renderPipeline._getOrCreateSSRPass();
    // @ts-ignore
    const buildMip0Spy = vi.spyOn(ssrPass._pyramidBuilder, "buildHiZMip0");

    scene.screenSpaceReflection.enabled = true;

    for (const quality of [ScreenSpaceReflectionQuality.Medium, ScreenSpaceReflectionQuality.VeryHigh]) {
      scene.screenSpaceReflection.quality = quality;

      // Without contrib depth: left floor reflects opaque red wall, right floor stays dark; merged pass runs
      frontCard.isActive = false;
      contribMat.contributeScreenSpaceReflectionDepth = false;
      stepFrames(engine, 3);
      buildMip0Spy.mockClear();
      engine.update();
      expect(buildMip0Spy).toHaveBeenCalledTimes(1);
      expect(buildMip0Spy.mock.calls[0][5]).toBe(true);
      const leftWithoutContrib = sampleRegionRGB(tex, 0.14, 0.68, 0.42, 0.95);
      const rightWithoutContrib = sampleRegionRGB(tex, 0.58, 0.68, 0.86, 0.95);
      expect(leftWithoutContrib.maxR).toBeGreaterThan(80);

      // With SSR_HAS_CONTRIB_DEPTH: right cyan curtain depth folds into Hi-Z minD (right reflection turns cyan)
      // while frontCard at ~3.1m folds into Hi-Z minD without occluding the ~4.6m opaque floor in _ssrDepthTex.
      contribMat.contributeScreenSpaceReflectionDepth = true;
      frontCard.isActive = true;
      stepFrames(engine, 3);
      const rightWithContrib = sampleRegionRGB(tex, 0.58, 0.68, 0.86, 0.95);
      expect(rightWithContrib.maxG).toBeGreaterThan(rightWithoutContrib.maxG + 50);
      expect(rightWithContrib.avgG).toBeGreaterThan(rightWithoutContrib.avgG + 12);

      // Verify Hi-Z mip 0 saw frontCard (< 3.5m) while opaque floor behind it (> 3.8m) passed _ssrDepthTex test
      // @ts-ignore
      const history = ssrPass._history;
      // @ts-ignore
      const lastWrittenIdx = ssrPass._frame.preset.useTemporal ? (history.temporalPingPongIndex === 0 ? 1 : 0) : 0;
      const lastHiZIdx = history.hiZPingPongIndex === 0 ? 1 : 0;
      const hiZMip0Depths = readSSRDepthBuffer(
        history.hiZTex[lastHiZIdx]!,
        ssrPass._caps.usesPackedDepthRG8,
        cam.farClipPlane
      );
      const recvDepths = readSSRDepthBuffer(
        history.recvDepthTex[lastWrittenIdx]!,
        ssrPass._caps.usesPackedDepthRG8,
        cam.farClipPlane
      );
      let overlapOpaqueUnoccludedCount = 0;
      for (let i = 0; i < hiZMip0Depths.length; i++) {
        if (hiZMip0Depths[i] > 1.5 && hiZMip0Depths[i] < 3.5 && recvDepths[i] > 3.8 && recvDepths[i] < 10.0) {
          overlapOpaqueUnoccludedCount++;
        }
      }
      expect(overlapOpaqueUnoccludedCount).toBeGreaterThan(10);
      expect(drainGlErrors(gl)).toEqual([]);
    }

    // Verify steady-state reuse of persistent ping-pong hiZDepthMip0RT[0/1] & hiZColorRT[0/1] (zero new RT allocations)
    // @ts-ignore
    const history = ssrPass._history;
    // Step 1 extra frame so both ping-pong slots 0 and 1 have lazily initialized hiZDepthMip0RT
    engine.update();
    const steadyMip0RT0 = history.hiZDepthMip0RT[0] as RenderTarget;
    const steadyMip0RT1 = history.hiZDepthMip0RT[1] as RenderTarget;
    const steadyColorRT0 = history.hiZColorRT[0] as RenderTarget;
    const steadyColorRT1 = history.hiZColorRT[1] as RenderTarget;
    expect(steadyMip0RT0).not.toBeNull();
    expect(steadyMip0RT1).not.toBeNull();
    expect(steadyMip0RT0.destroyed).toBe(false);
    expect(steadyMip0RT1.destroyed).toBe(false);
    stepFrames(engine, 2);
    expect(history.hiZDepthMip0RT[0]).toBe(steadyMip0RT0);
    expect(history.hiZDepthMip0RT[1]).toBe(steadyMip0RT1);
    expect(history.hiZColorRT[0]).toBe(steadyColorRT0);
    expect(history.hiZColorRT[1]).toBe(steadyColorRT1);

    // Resize: old hiZDepthMip0RT[0/1] & hiZColorRT[0/1] must be destroyed immediately (not pendingDestroy) before _ssrDepthTex/hiZTex
    const resized = createReadbackRT(engine, 128, 96);
    cam.renderTarget = resized.rt;
    stepFrames(engine, 4);
    expect(steadyMip0RT0.destroyed).toBe(true);
    expect(steadyMip0RT0.pendingDestroy).toBe(false);
    expect(steadyMip0RT1.destroyed).toBe(true);
    expect(steadyMip0RT1.pendingDestroy).toBe(false);
    expect(steadyColorRT0.destroyed).toBe(true);
    expect(steadyColorRT1.destroyed).toBe(true);
    const resizedMip0RT0 = history.hiZDepthMip0RT[0] as RenderTarget;
    const resizedMip0RT1 = history.hiZDepthMip0RT[1] as RenderTarget;
    expect(resizedMip0RT0).not.toBeNull();
    expect(resizedMip0RT1).not.toBeNull();
    expect(resizedMip0RT0).not.toBe(steadyMip0RT0);
    expect(resizedMip0RT1).not.toBe(steadyMip0RT1);
    expect(resizedMip0RT0.destroyed).toBe(false);
    expect(resizedMip0RT1.destroyed).toBe(false);
    expect(drainGlErrors(gl)).toEqual([]);

    // Disable SSR: hiZDepthMip0RT[0/1], hiZColorRT[0/1], and hiZTex[0/1] are destroyed and cleared cleanly
    cam.enableScreenSpaceReflection = false;
    engine.update();
    expect(resizedMip0RT0.destroyed).toBe(true);
    expect(resizedMip0RT1.destroyed).toBe(true);
    expect(history.hiZDepthMip0RT[0]).toBeNull();
    expect(history.hiZDepthMip0RT[1]).toBeNull();
    expect(history.hiZColorRT[0]).toBeNull();
    expect(history.hiZColorRT[1]).toBeNull();
    expect(history.hiZTex[0]).toBeNull();
    expect(history.hiZTex[1]).toBeNull();
    expect(drainGlErrors(gl)).toEqual([]);

    cam.renderTarget = null;
    resized.rt.destroy(true);
    resized.tex.destroy(true);
    rt.destroy(true);
    tex.destroy(true);
  });

  it("Track 1 P1-1: swaps persistent ping-pong Hi-Z cleanly across states with 0 copy passes, samples mip 0 prevTraceDepth, skips empty opaque SSRReceiver queue, and reclaims cleanly", async () => {
    const { engine, scene, gl } = await createTestEngine(160, 120);
    createdEngines.push(engine);

    const root = scene.createRootEntity("root");
    const camEnt = root.createChild("cam");
    camEnt.transform.setPosition(0, 1.35, 3.6);
    camEnt.transform.lookAt(new Vector3(0, 0.35, -1.2));
    const cam = camEnt.addComponent(Camera);
    cam.nearClipPlane = 0.2;
    cam.farClipPlane = 50;

    const { rt, tex } = createReadbackRT(engine, 160, 120);
    cam.renderTarget = rt;

    // Non-receiving opaque ground + red emissive wall + transparent glossy water receiver
    const opaqueGroundMat = new PBRMaterial(engine);
    opaqueGroundMat.baseColor = new Color(0.02, 0.02, 0.02, 1);
    opaqueGroundMat.roughness = 0.95;
    opaqueGroundMat.screenSpaceReflectionIntensity = 0;
    addPlane(engine, root, "opaqueGround", [0, -0.05, -0.8], 10, 10, opaqueGroundMat);

    const wallMat = new PBRMaterial(engine);
    wallMat.baseColor = new Color(0.08, 0, 0, 1);
    wallMat.emissiveColor = new Color(4.0, 0.0, 0.0, 1);
    wallMat.screenSpaceReflectionIntensity = 0;
    addBox(engine, root, "redWall", [0, 1.85, -1.8], [3.2, 2.0, 0.4], wallMat);

    const waterMat = new PBRMaterial(engine);
    waterMat.isTransparent = true;
    waterMat.baseColor = new Color(0.02, 0.04, 0.06, 0.75);
    waterMat.roughness = 0.03;
    waterMat.screenSpaceReflectionIntensity = 1.0;
    addPlane(engine, root, "water", [0, 0.0, -0.8], 10, 10, waterMat);

    // @ts-ignore access internal pipeline/history/material
    const renderPipeline = cam._renderPipeline;
    const ssrPass = renderPipeline._getOrCreateSSRPass();
    const history = ssrPass._history;
    const queueProto = Object.getPrototypeOf(renderPipeline._cullingResults.opaqueQueue);
    const queueRenderSpy = vi.spyOn(queueProto, "render");
    const blitSpy = vi.spyOn(Blitter, "blitTexture");

    // Baseline SSR Off
    scene.screenSpaceReflection.enabled = false;
    stepFrames(engine, 2);
    const offWaterPixels = sampleRegionRGB(tex, 0.35, 0.68, 0.65, 0.95);

    scene.screenSpaceReflection.enabled = true;
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.Medium;

    // Frame 0 (WarmupColor): writes hiZTex[0] mip 0, flips hiZPingPongIndex 0 -> 1 while temporalPingPongIndex remains 0
    engine.update();
    expect(ssrPass._state).toBe(SSRState.WarmupColor);
    expect(history.hasHiZHistory).toBe(true);
    expect(history.hiZPingPongIndex).toBe(1);
    expect(history.temporalPingPongIndex).toBe(0);

    // Frame 1 (FirstTrace): writes hiZTex[1], reads prevTraceDepth from hiZTex[0] (distinct texture!), flips 1 -> 0
    blitSpy.mockClear();
    queueRenderSpy.mockClear();
    engine.update();
    expect(ssrPass._state).toBe(SSRState.FirstTrace);
    expect(history.hiZPingPongIndex).toBe(0);
    expect(history.temporalPingPongIndex).toBe(1);
    // Empty opaque SSRReceiver queue guard: only transparentQueue runs SSRReceiver (1 call, not 3!)
    const firstTraceReceiverCalls = queueRenderSpy.mock.calls.filter((c) => c[1] === PipelineStage.SSRReceiver);
    expect(firstTraceReceiverCalls.length).toBe(1);

    // Frame 2 (ActiveSteady): writes hiZTex[0], reads prevTraceDepth from hiZTex[1], 0 PASS_COPY_TEXTURE calls in steady state!
    blitSpy.mockClear();
    queueRenderSpy.mockClear();
    engine.update();
    expect(ssrPass._state).toBe(SSRState.ActiveSteady);
    expect(history.hiZPingPongIndex).toBe(1);
    expect(history.temporalPingPongIndex).toBe(0);
    const steadyCopyCalls = blitSpy.mock.calls.filter((c) => c[6] === 2 /* PASS_COPY_TEXTURE */);
    expect(steadyCopyCalls.length).toBe(0);
    const steadyReceiverCalls = queueRenderSpy.mock.calls.filter((c) => c[1] === PipelineStage.SSRReceiver);
    expect(steadyReceiverCalls.length).toBe(1);

    // Grazing-angle reflection check across steady frames (mip 0 prevTraceDepth avoids false coarse-mip disocclusion)
    stepFrames(engine, 2);
    const waterPixels = sampleRegionRGB(tex, 0.35, 0.68, 0.65, 0.95);
    expect(waterPixels.maxR).toBeGreaterThan(offWaterPixels.maxR + 50);
    expect(waterPixels.avgR).toBeGreaterThan(offWaterPixels.avgR + 10);
    expect(drainGlErrors(gl)).toEqual([]);

    // Idle reclaim after 10 Skipped frames releases both hiZTex[0/1] & hiZColorRT[0/1] cleanly
    const prevHiZTex0 = history.hiZTex[0]!;
    const prevHiZTex1 = history.hiZTex[1]!;
    const prevHiZColorRT0 = history.hiZColorRT[0]!;
    const prevHiZColorRT1 = history.hiZColorRT[1]!;
    waterMat.screenSpaceReflectionIntensity = 0;
    stepFrames(engine, 10);
    expect(ssrPass._state).toBe(SSRState.Skipped);
    expect(getSSRRetainedBytes(ssrPass)).toBe(0);
    expect(prevHiZTex0.destroyed).toBe(true);
    expect(prevHiZTex1.destroyed).toBe(true);
    expect(prevHiZColorRT0.destroyed).toBe(true);
    expect(prevHiZColorRT1.destroyed).toBe(true);
    expect(history.hiZTex[0]).toBeNull();
    expect(history.hiZTex[1]).toBeNull();
    expect(history.hiZColorRT[0]).toBeNull();
    expect(history.hiZColorRT[1]).toBeNull();
    expect(drainGlErrors(gl)).toEqual([]);

    rt.destroy(true);
    tex.destroy(true);
  });

  it("Track 1 P1-2 & P1-3b: validates HiZTrace/TemporalResolve parity and sampleScreenSpaceReflectionRaw helper in custom shaders", async () => {
    const { engine, scene, gl } = await createTestEngine(160, 120);
    createdEngines.push(engine);

    const root = scene.createRootEntity("root");
    const camEnt = root.createChild("cam");
    camEnt.transform.setPosition(0, 1.35, 3.6);
    camEnt.transform.lookAt(new Vector3(0, 0.35, -1.2));
    const cam = camEnt.addComponent(Camera);
    cam.nearClipPlane = 0.2;
    cam.farClipPlane = 50;

    const { rt, tex } = createReadbackRT(engine, 160, 120);
    cam.renderTarget = rt;

    const rawSSRShader = Shader.create(`Shader "Test/SampleScreenSpaceReflectionRaw" {
      SubShader "Default" {
        UsePass "Pipeline/DepthOnly/Default/DepthOnly"
        Pass "SSRReceiver" {
          Tags { pipelineStage = "SSRReceiver" }
          DepthState = { Enabled = true; WriteEnabled = false; CompareFunction = CompareFunction.LessEqual; }
          BlendState = { Enabled = false; }
          StencilState = {
            Enabled = true; ReferenceValue = 1; Mask = 255; WriteMask = 255;
            CompareFunctionFront = CompareFunction.Always; CompareFunctionBack = CompareFunction.Always;
            PassOperationFront = StencilOperation.Replace; PassOperationBack = StencilOperation.Replace;
            FailOperationFront = StencilOperation.Keep; FailOperationBack = StencilOperation.Keep;
            ZFailOperationFront = StencilOperation.Keep; ZFailOperationBack = StencilOperation.Keep;
          }
          VertexShader = rVert;
          FragmentShader = rFrag;
          #include "ShaderLibrary/Common/Common.glsl"
          #include "ShaderLibrary/Common/Transform.glsl"
          #include "ShaderLibrary/Common/Attributes.glsl"
          #include "ShaderLibrary/Lighting/ScreenSpaceReflection/ScreenSpaceReflectionCommon.glsl"
          float material_Roughness;
          struct Varyings { vec3 positionWS; };
          struct Out { layout(location = 0) vec4 nr; layout(location = 1) vec4 d; };
          Varyings rVert(Attributes attr) {
            Varyings v;
            v.positionWS = (renderer_ModelMat * vec4(attr.POSITION, 1.0)).xyz;
            gl_Position = renderer_MVPMat * vec4(attr.POSITION, 1.0);
            return v;
          }
          Out rFrag(Varyings v) {
            Out o;
            o.nr = packSSRNormalRoughness(vec3(0.0, 1.0, 0.0), material_Roughness);
            o.d = encodeSSRDepth(remapDepthBufferEyeDepth(gl_FragCoord.z), camera_ProjectionParams.z);
            return o;
          }
        }
        Pass "Forward" {
          Tags { pipelineStage = "Forward" }
          VertexShader = fVert;
          FragmentShader = fFrag;
          #include "ShaderLibrary/Common/Common.glsl"
          #include "ShaderLibrary/Common/Transform.glsl"
          #include "ShaderLibrary/Common/Attributes.glsl"
          #include "ShaderLibrary/Lighting/ScreenSpaceReflection/ScreenSpaceReflectionSample.glsl"
          float material_Roughness;
          struct Varyings { vec4 positionCS; };
          Varyings fVert(Attributes attr) {
            Varyings v;
            v.positionCS = renderer_MVPMat * vec4(attr.POSITION, 1.0);
            gl_Position = v.positionCS;
            return v;
          }
          void fFrag(Varyings v) {
            vec3 env = vec3(0.0, 0.0, 0.25);
            vec3 color = env;
            #ifdef CAMERA_ENABLE_SSR
              vec4 raw = sampleScreenSpaceReflectionRaw(v.positionCS, vec3(0.0, 1.0, 0.0), material_Roughness);
              color = env * (1.0 - raw.a) + raw.rgb;
            #endif
            gl_FragColor = vec4(color, 1.0);
          }
        }
      }
    }`);

    const wallMat = new PBRMaterial(engine);
    wallMat.emissiveColor = new Color(4.0, 0.0, 0.0, 1);
    wallMat.screenSpaceReflectionIntensity = 0;
    addBox(engine, root, "redWall", [0, 1.85, -1.8], [3.2, 2.0, 0.4], wallMat);

    const floorMat = new Material(engine, rawSSRShader);
    floorMat.screenSpaceReflectionIntensity = 1.0;
    floorMat.shaderData.setFloat("material_Roughness", 0.03);
    addPlane(engine, root, "rawFloor", [0, 0, -0.8], 10, 10, floorMat);

    scene.screenSpaceReflection.enabled = true;
    for (const quality of [ScreenSpaceReflectionQuality.Medium, ScreenSpaceReflectionQuality.High]) {
      scene.screenSpaceReflection.quality = quality;
      floorMat.shaderData.setFloat("material_Roughness", 0.03);
      stepFrames(engine, 3);
      // Slight camera pan to exercise TemporalResolve reprojection + variance clamp & disocclusion paths
      camEnt.transform.setPosition(0.15, 1.35, 3.55);
      engine.update();
      camEnt.transform.setPosition(0, 1.35, 3.6);
      engine.update();

      const reflected = sampleRegionRGB(tex, 0.35, 0.68, 0.65, 0.95);
      expect(reflected.maxR).toBeGreaterThan(80);
      expect(reflected.avgR).toBeGreaterThan(15);
      expect(drainGlErrors(gl)).toEqual([]);
    }

    // Roughness >= maxRoughness or intensity = 0 causes sampleScreenSpaceReflectionRaw to early-out to vec4(0.0) -> pure env blue
    floorMat.screenSpaceReflectionIntensity = 0;
    stepFrames(engine, 2);
    const optedOut = sampleRegionRGB(tex, 0.35, 0.68, 0.65, 0.95);
    expect(optedOut.maxR).toBeLessThan(5);
    expect(optedOut.avgB).toBeGreaterThan(40);
    expect(drainGlErrors(gl)).toEqual([]);

    floorMat.destroy(true);
    rawSSRShader.destroy(true);
    rt.destroy(true);
    tex.destroy(true);
  });

  it("Track 1 P2-3a: GLRenderTarget caches per-mip WebGLFramebuffers for mipLevel > 0, preserves mipmap parity, and deletes all cached FBOs on destroy()", async () => {
    const { engine, gl } = await createTestEngine(64, 64);
    createdEngines.push(engine);

    const mipTex = new Texture2D(engine, 32, 32, TextureFormat.R8G8B8A8_UNorm, true, false);
    mipTex.filterMode = TextureFilterMode.Point;
    mipTex.wrapModeU = TextureWrapMode.Clamp;
    mipTex.wrapModeV = TextureWrapMode.Clamp;

    const createFboSpy = vi.spyOn(gl, "createFramebuffer");
    const attachTexSpy = vi.spyOn(gl, "framebufferTexture2D");
    const deleteFboSpy = vi.spyOn(gl, "deleteFramebuffer");

    const mipRT = new RenderTarget(engine, 32, 32, mipTex, null, 1);
    mipRT.autoGenerateMipmaps = false;

    const rhi = engine._hardwareRenderer;
    const colors = [
      new Color(1, 0, 0, 1), // mip 0: red
      new Color(0, 1, 0, 1), // mip 1: green
      new Color(0, 0, 1, 1), // mip 2: blue
      new Color(1, 1, 0, 1) // mip 3: yellow
    ];

    const renderAllMips = () => {
      for (let m = 0; m < 4; m++) {
        rhi.activeRenderTarget(mipRT, new Vector4(0, 0, 1, 1), true, m);
        rhi.invalidateRenderTarget?.(mipRT, CameraClearFlags.Color, true);
        rhi.clearRenderTarget(engine, CameraClearFlags.Color, colors[m]);
      }
      rhi.activeRenderTarget(null, new Vector4(0, 0, 1, 1), false, 0);
    };

    // Pass 1: primary _frameBuffer handles mip 0 (0 extra FBOs); mips 1..3 create 3 cached mip FBOs
    createFboSpy.mockClear();
    attachTexSpy.mockClear();
    renderAllMips();
    expect(createFboSpy).toHaveBeenCalledTimes(3);
    expect(attachTexSpy).toHaveBeenCalledTimes(3);
    expect(drainGlErrors(gl)).toEqual([]);

    // Pass 2: all 4 mips reuse cached FBOs -> 0 createFramebuffer and 0 framebufferTexture2D calls!
    createFboSpy.mockClear();
    attachTexSpy.mockClear();
    renderAllMips();
    expect(createFboSpy).not.toHaveBeenCalled();
    expect(attachTexSpy).not.toHaveBeenCalled();
    expect(drainGlErrors(gl)).toEqual([]);

    // Verify exact pixel parity across mips 0..3
    const expectedRGB = [
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
      [255, 255, 0]
    ];
    for (let m = 0; m < 4; m++) {
      const mw = 32 >> m;
      const buf = new Uint8Array(mw * mw * 4);
      mipTex.getPixelBuffer(0, 0, mw, mw, m, buf);
      expect([buf[0], buf[1], buf[2]]).toEqual(expectedRGB[m]);
    }

    // destroy() must delete primary FBO + all 3 cached mip FBOs cleanly
    deleteFboSpy.mockClear();
    mipRT.destroy(true);
    mipTex.destroy(true);
    expect(deleteFboSpy).toHaveBeenCalledTimes(4);
    expect(drainGlErrors(gl)).toEqual([]);
  });

  it("Item 3: tightens SSR receiver scissor, handles near-plane straddling, leaves zero stale pixels on camera motion, and skips offscreen cleanly", async () => {
    const { engine, scene, gl } = await createTestEngine(160, 120);
    createdEngines.push(engine);

    const { rt, tex } = createReadbackRT(engine, 160, 120);
    const root = scene.createRootEntity("root");
    const camEnt = root.createChild("cam");
    camEnt.transform.setPosition(0, 1.35, 3.6);
    camEnt.transform.lookAt(new Vector3(0, 0.35, -1.2));
    const cam = camEnt.addComponent(Camera);
    cam.nearClipPlane = 0.2;
    cam.farClipPlane = 50;
    cam.renderTarget = rt;

    const wallMat = new PBRMaterial(engine);
    wallMat.baseColor = new Color(0.1, 0, 0, 1);
    wallMat.emissiveColor = new Color(4.0, 0, 0, 1);
    wallMat.screenSpaceReflectionIntensity = 0;
    addBox(engine, root, "redWall", [0, 1.2, -1.8], [3.2, 2.0, 0.4], wallMat);

    const floorMat = new PBRMaterial(engine);
    floorMat.baseColor = new Color(0.02, 0.02, 0.02, 1);
    floorMat.metallic = 0.0;
    floorMat.roughness = 0.03;
    floorMat.screenSpaceReflectionIntensity = 1.0;
    const floorEnt = addPlane(engine, root, "smallFloor", [0, 0, -0.4], 1.4, 1.8, floorMat);

    scene.screenSpaceReflection.enabled = true;
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.Medium;
    stepFrames(engine, 3);

    // @ts-ignore access internal scissor state
    const ssrPass = cam._renderPipeline._ssrPass;
    expect(isSSRActiveForCamera(cam)).toBe(true);
    const traceW = ssrPass._frame.traceWidth;
    const traceH = ssrPass._frame.traceHeight;
    const scissor1 = ssrPass._lastReceiverScissor;
    expect(scissor1.z).toBeGreaterThan(0);
    expect(scissor1.w).toBeGreaterThan(0);
    expect(scissor1.z).toBeLessThan(traceW);
    expect(scissor1.w).toBeLessThan(traceH);

    const floorSample = sampleRegionRGB(tex, 0.35, 0.58, 0.65, 0.76);
    expect(floorSample.maxR).toBeGreaterThan(60);

    // Pan camera right so the receiver moves left; outside pixels on final SSR buffer must be exact zero.
    camEnt.transform.setPosition(1.8, 1.35, 3.6);
    camEnt.transform.lookAt(new Vector3(1.8, 0.35, -1.2));
    stepFrames(engine, 2);

    const scissor2 = ssrPass._lastReceiverScissor;
    expect(scissor2.z).toBeGreaterThan(0);
    expect(scissor2.z).toBeLessThan(traceW);
    const ssrTex = cam.shaderData.getTexture("camera_SSRTexture") as Texture2D;
    expect(ssrTex).toBeTruthy();
    const ssrW = ssrTex.width;
    const ssrH = ssrTex.height;
    const ssrPixels = new Uint8Array(ssrW * ssrH * 4);
    ssrTex.getPixelBuffer(0, 0, ssrW, ssrH, 0, ssrPixels);
    const sx0 = scissor2.x;
    const sy0 = scissor2.y;
    const sx1 = sx0 + scissor2.z;
    const sy1 = sy0 + scissor2.w;
    let maxOutside = 0;
    for (let y = 0; y < ssrH; y++) {
      for (let x = 0; x < ssrW; x++) {
        if (x >= sx0 && x < sx1 && y >= sy0 && y < sy1) continue;
        const idx = (y * ssrW + x) * 4;
        const v = Math.max(ssrPixels[idx], ssrPixels[idx + 1], ssrPixels[idx + 2], ssrPixels[idx + 3]);
        if (v > maxOutside) maxOutside = v;
      }
    }
    expect(maxOutside).toBe(0);

    // Receiver straddling camera near plane must clip against near plane without discarding foreground reflections.
    camEnt.transform.setPosition(0, 0.5, 2.5);
    camEnt.transform.lookAt(new Vector3(0, 0.35, -1.2));
    cam.nearClipPlane = 0.5;
    floorEnt.transform.setPosition(0, 0, 1.5);
    floorEnt.transform.setScale(5, 1, 5);
    stepFrames(engine, 2);
    expect(ssrPass._lastReceiverScissor.z).toBeGreaterThan(0);
    expect(ssrPass._lastReceiverScissor.w).toBeGreaterThan(0);
    const nearSample = sampleRegionRGB(tex, 0.35, 0.72, 0.65, 0.96);
    expect(nearSample.maxR).toBeGreaterThan(60);

    // Turning away from all receivers clears SSR and leaves zero GL errors.
    camEnt.transform.setPosition(0, 4.0, 20.0);
    camEnt.transform.lookAt(new Vector3(0, 4.0, 30.0));
    stepFrames(engine, 1);
    expect(isSSRActiveForCamera(cam)).toBe(false);
    expect(drainGlErrors(gl)).toEqual([]);

    rt.destroy(true);
    tex.destroy(true);
  });

  it("Item 4: Medium HDR Reinhard+Oct8 decodes bright HDR reflections (>1.0) matching High RGBA16F parity with zero GL errors", async () => {
    const { engine, scene, gl } = await createTestEngine(160, 120);
    createdEngines.push(engine);

    const { rt, tex } = createReadbackRT(engine, 160, 120);
    const root = scene.createRootEntity("root");
    const camEnt = root.createChild("cam");
    camEnt.transform.setPosition(0, 1.35, 3.6);
    camEnt.transform.lookAt(new Vector3(0, 0.35, -1.2));
    const cam = camEnt.addComponent(Camera);
    cam.nearClipPlane = 0.2;
    cam.farClipPlane = 50;
    cam.renderTarget = rt;

    const floorMat = new PBRMaterial(engine);
    floorMat.baseColor = new Color(1.0, 1.0, 1.0, 1);
    floorMat.metallic = 1.0;
    floorMat.roughness = 0.02;
    floorMat.screenSpaceReflectionIntensity = 0.12;
    addPlane(engine, root, "mirrorFloor", [0, 0, -0.8], 10, 10, floorMat);

    const wallMat = new PBRMaterial(engine);
    wallMat.baseColor = new Color(0.05, 0, 0, 1);
    wallMat.emissiveColor = new Color(12.0, 0, 0, 1);
    wallMat.screenSpaceReflectionIntensity = 0;
    addBox(engine, root, "hdrRedWall", [0, 1.85, -1.8], [3.2, 2.0, 0.4], wallMat);

    scene.screenSpaceReflection.enabled = true;
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.Medium;
    cam.enableHDR = true;
    stepFrames(engine, 3);

    const ssrPass = getSSRPass(cam);
    expect(ssrPass._caps.usesPackedNormalOct8).toBe(true);
    const medHDRFloor = sampleRegionRGB(tex, 0.35, 0.68, 0.65, 0.95);

    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.High;
    stepFrames(engine, 3);
    expect(ssrPass._caps.usesPackedNormalOct8).toBe(false);
    const highHDRFloor = sampleRegionRGB(tex, 0.35, 0.68, 0.65, 0.95);

    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.Medium;
    cam.enableHDR = false;
    cam.notifyScreenSpaceReflectionCut();
    stepFrames(engine, 3);
    const medLDRFloor = sampleRegionRGB(tex, 0.35, 0.68, 0.65, 0.95);

    expect(medHDRFloor.maxR).toBeGreaterThan(200);
    expect(medHDRFloor.avgR).toBeGreaterThan(medLDRFloor.avgR + 40);
    expect(Math.abs(medHDRFloor.avgR - highHDRFloor.avgR)).toBeLessThan(35);
    expect(drainGlErrors(gl)).toEqual([]);

    rt.destroy(true);
    tex.destroy(true);
  });

  it("SSR Quality Trace Mode: Low/Medium use Linear trace (0-Hi-Z mips), High uses Hi-Z, Camera override switches cleanly, and zero GL resources leak", async () => {
    const { engine, scene, gl } = await createTestEngine(160, 120);
    createdEngines.push(engine);

    const { rt, tex } = createReadbackRT(engine, 160, 120);
    const root = scene.createRootEntity("root");
    const camEnt = root.createChild("cam");
    camEnt.transform.setPosition(0, 1.35, 3.6);
    camEnt.transform.lookAt(new Vector3(0, 0.35, -1.2));
    const cam = camEnt.addComponent(Camera);
    cam.nearClipPlane = 0.2;
    cam.farClipPlane = 50;
    cam.renderTarget = rt;

    const floorMat = new PBRMaterial(engine);
    floorMat.baseColor = new Color(0.02, 0.02, 0.02, 1);
    floorMat.metallic = 0.0;
    floorMat.roughness = 0.03;
    floorMat.screenSpaceReflectionIntensity = 1.0;
    addPlane(engine, root, "mirrorFloor", [0, 0, -0.8], 10, 10, floorMat);

    const wallMat = new PBRMaterial(engine);
    wallMat.baseColor = new Color(0.1, 0, 0, 1);
    wallMat.emissiveColor = new Color(4.0, 0.0, 0.0, 1);
    wallMat.screenSpaceReflectionIntensity = 0;
    addBox(engine, root, "redWall", [0, 1.85, -1.8], [3.2, 2.0, 0.4], wallMat);

    // Medium defaults to Linear trace (0-Hi-Z mips)
    scene.screenSpaceReflection.enabled = true;
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.Medium;
    stepFrames(engine, 3);

    // @ts-ignore access internal history state to verify Hi-Z mip allocation
    const ssrPass = cam._renderPipeline._ssrPass;
    expect(isSSRActiveForCamera(cam)).toBe(true);
    expect(ssrPass._frame.preset.useLinearTrace).toBe(true);
    // @ts-ignore
    expect(ssrPass._history.hiZTex[0]!.mipmapCount).toBe(1);
    const linearBytes = getSSRRetainedBytes(ssrPass);
    const linearSample = sampleRegionRGB(tex, 0.35, 0.68, 0.65, 0.95);
    expect(linearSample.maxR).toBeGreaterThan(80);
    expect(drainGlErrors(gl)).toEqual([]);

    // Low also defaults to Linear trace (0-Hi-Z mips)
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.Low;
    stepFrames(engine, 2);
    expect(isSSRActiveForCamera(cam)).toBe(true);
    expect(ssrPass._frame.preset.useLinearTrace).toBe(true);
    // @ts-ignore
    expect(ssrPass._history.hiZTex[0]!.mipmapCount).toBe(1);

    // Switch to High preset (hierarchical Hi-Z trace)
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.High;
    stepFrames(engine, 3);

    expect(isSSRActiveForCamera(cam)).toBe(true);
    expect(ssrPass._frame.preset.useLinearTrace).toBe(false);
    // @ts-ignore
    expect(ssrPass._history.hiZTex[0]!.mipmapCount).toBeGreaterThan(1);
    const hizBytes = getSSRRetainedBytes(ssrPass);
    expect(linearBytes).toBeLessThan(hizBytes);
    const hizSample = sampleRegionRGB(tex, 0.35, 0.68, 0.65, 0.95);
    expect(hizSample.maxR).toBeGreaterThan(80);
    expect(drainGlErrors(gl)).toEqual([]);

    // Verify Camera.screenSpaceReflectionOverride can override High back to Medium (Linear trace)
    const override = new ScreenSpaceReflection();
    scene.screenSpaceReflection.cloneTo(override);
    override.quality = ScreenSpaceReflectionQuality.Medium;
    cam.screenSpaceReflectionOverride = override;
    stepFrames(engine, 3);

    expect(isSSRActiveForCamera(cam)).toBe(true);
    expect(ssrPass._frame.preset.useLinearTrace).toBe(true);
    // @ts-ignore
    expect(ssrPass._history.hiZTex[0]!.mipmapCount).toBe(1);
    expect(getSSRRetainedBytes(ssrPass)).toBe(linearBytes);
    const overrideLinearSample = sampleRegionRGB(tex, 0.35, 0.68, 0.65, 0.95);
    expect(overrideLinearSample.maxR).toBeGreaterThan(80);
    expect(drainGlErrors(gl)).toEqual([]);

    // Clearing override returns to Scene High (Hi-Z mode), and setting scene back to Medium restores Linear cleanly
    cam.screenSpaceReflectionOverride = null;
    stepFrames(engine, 3);
    expect(ssrPass._frame.preset.useLinearTrace).toBe(false);

    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.Medium;
    stepFrames(engine, 3);

    expect(isSSRActiveForCamera(cam)).toBe(true);
    expect(ssrPass._frame.preset.useLinearTrace).toBe(true);
    // @ts-ignore
    expect(ssrPass._history.hiZTex[0]!.mipmapCount).toBe(1);
    expect(getSSRRetainedBytes(ssrPass)).toBe(linearBytes);
    const linearRestoredSample = sampleRegionRGB(tex, 0.35, 0.68, 0.65, 0.95);
    expect(linearRestoredSample.maxR).toBeGreaterThan(80);

    // Disabling SSR on an instantiated pass enters Disabled and releases retained SSR buffers
    scene.screenSpaceReflection.enabled = false;
    engine.update();
    expect(ssrPass._state).toBe(SSRState.Disabled);
    expect(isSSRActiveForCamera(cam)).toBe(false);
    expect(getSSRRetainedBytes(ssrPass)).toBe(0);
    expect(drainGlErrors(gl)).toEqual([]);

    rt.destroy(true);
    tex.destroy(true);
  });

  it("Blitter.blitTexture: preserves discarded destination pixels by default and clears only when clearColor is true", async () => {
    const { engine, scene, gl } = await createTestEngine(64, 64);
    createdEngines.push(engine);

    const camEnt = scene.createRootEntity("cam");
    const cam = camEnt.addComponent(Camera);
    engine.update();
    engine._renderContext.camera = cam;

    const discardShader = Shader.create(`Shader "Test/DiscardBlit" {
      SubShader "Default" {
        Pass "Blit" {
          DepthState = { Enabled = false; WriteEnabled = false; }
          BlendState = { Enabled = false; }
          VertexShader = vert;
          FragmentShader = frag;
          #include "ShaderLibrary/Blit/BlitVertex.glsl"
          void frag(Varyings v) {
            if (v.v_uv.x < 0.5) {
              discard;
            }
            gl_FragColor = vec4(0.0, 1.0, 0.0, 1.0);
          }
        }
      }
    }`);
    const discardMat = new Material(engine, discardShader);

    const srcTex = createSolidRGBA8Tex(engine, 255, 255, 255, 255);
    const { rt: dstRT, tex: dstTex } = createReadbackRT(engine, 64, 64);
    const rhi = engine._hardwareRenderer;
    const blue = new Color(0, 0, 1, 1);
    const px = new Uint8Array(64 * 64 * 4);

    // 1. Default clearColor = false: discarded left half preserves prior blue pixels
    rhi.activeRenderTarget(dstRT, new Vector4(0, 0, 1, 1), true, 0);
    rhi.clearRenderTarget(engine, CameraClearFlags.Color, blue);
    Blitter.blitTexture(engine, srcTex, dstRT, 0, undefined, discardMat, 0);
    rhi.activeRenderTarget(null, new Vector4(0, 0, 1, 1), false, 0);

    dstTex.getPixelBuffer(0, 0, 64, 64, 0, px);
    const leftIdx = (32 * 64 + 16) * 4;
    const rightIdx = (32 * 64 + 48) * 4;
    expect([px[leftIdx], px[leftIdx + 1], px[leftIdx + 2], px[leftIdx + 3]]).toEqual([0, 0, 255, 255]);
    expect([px[rightIdx], px[rightIdx + 1], px[rightIdx + 2], px[rightIdx + 3]]).toEqual([0, 255, 0, 255]);

    // 2. Explicit clearColor = true: discarded left half is cleared to transparent black
    rhi.activeRenderTarget(dstRT, new Vector4(0, 0, 1, 1), true, 0);
    rhi.clearRenderTarget(engine, CameraClearFlags.Color, blue);
    Blitter.blitTexture(engine, srcTex, dstRT, 0, undefined, discardMat, 0, undefined, 0, true);
    rhi.activeRenderTarget(null, new Vector4(0, 0, 1, 1), false, 0);

    dstTex.getPixelBuffer(0, 0, 64, 64, 0, px);
    expect([px[leftIdx], px[leftIdx + 1], px[leftIdx + 2], px[leftIdx + 3]]).toEqual([0, 0, 0, 0]);
    expect([px[rightIdx], px[rightIdx + 1], px[rightIdx + 2], px[rightIdx + 3]]).toEqual([0, 255, 0, 255]);
    expect(drainGlErrors(gl)).toEqual([]);

    discardMat.destroy(true);
    discardShader.destroy(true);
    srcTex.destroy(true);
    dstRT.destroy(true);
    dstTex.destroy(true);
  });

  it("SSRDepthOccluderCuller: projects view-space depth instead of Euclidean distance so lateral screen-edge occluders are not culled", async () => {
    const { engine, scene, gl } = await createTestEngine(1600, 900);
    createdEngines.push(engine);

    const { rt, tex } = createReadbackRT(engine, 1600, 900);
    const root = scene.createRootEntity("root");
    const camEnt = root.createChild("cam");
    camEnt.transform.setPosition(0, 0, 15);
    camEnt.transform.lookAt(new Vector3(0, 0, 0));
    const cam = camEnt.addComponent(Camera);
    cam.fieldOfView = 60;
    cam.nearClipPlane = 0.2;
    cam.farClipPlane = 100;
    cam.renderTarget = rt;

    const floorMat = new PBRMaterial(engine);
    floorMat.roughness = 0.05;
    floorMat.screenSpaceReflectionIntensity = 1.0;
    addPlane(engine, root, "floor", [0, -2, 0], 10, 10, floorMat);

    // At depth = 15, fov = 60, Medium traceHeight = 540 -> _minPixels = 21.6, _projScale = 935.3.
    // Box [0.45, 0.72, 0.2] has halfDiag = 0.436 -> view-space projected height ~ 28.0 px >= 21.6 px,
    // whereas lateral 92% edge Euclidean distance ~ 20.6m would falsely shrink below 21.6 px.
    const occluderMat = new PBRMaterial(engine);
    occluderMat.screenSpaceReflectionIntensity = 0;
    const lateralOccluder = addBox(engine, root, "lateralOccluder", [0, 0, 0], [0.45, 0.72, 0.2], occluderMat);
    const tinyProp = addBox(engine, root, "tinyProp", [0, 0, 0], [0.04, 0.04, 0.04], occluderMat);

    scene.screenSpaceReflection.enabled = true;
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.Medium;
    stepFrames(engine, 3);

    // @ts-ignore access internal culler & trace depth history
    const ssrPass = cam._renderPipeline._ssrPass;
    // @ts-ignore
    const culler = ssrPass._occluderCuller;
    const centerMR = lateralOccluder.getComponent(MeshRenderer)!;
    const tinyMR = tinyProp.getComponent(MeshRenderer)!;
    culler.prepare(cam, 960, 540, cam.viewMatrix);
    expect(culler._isBoundsLargeEnoughForDepth(centerMR.bounds)).toBe(true);
    expect(culler._isBoundsLargeEnoughForDepth(tinyMR.bounds)).toBe(false);

    // Move identical occluder laterally to ~92% of horizontal frustum edge (same view depth = 15)
    lateralOccluder.transform.setPosition(14.16, 0, 0);
    stepFrames(engine, 2);
    expect(culler._isBoundsLargeEnoughForDepth(centerMR.bounds)).toBe(true);

    // Confirm end-to-end DepthOnly -> Hi-Z mip0 wrote ~15.0m near the right screen edge (not farClip 100)
    // @ts-ignore
    const history = ssrPass._history;
    const lastHiZIdx = history.hiZPingPongIndex === 0 ? 1 : 0;
    const hiZTex = history.hiZTex[lastHiZIdx]!;
    const depths = readSSRDepthBuffer(hiZTex, ssrPass._caps.usesPackedDepthRG8, cam.farClipPlane);
    const cy = Math.floor(hiZTex.height * 0.5);
    let minEdgeDepth = cam.farClipPlane;
    for (let x = Math.floor(hiZTex.width * 0.9); x < hiZTex.width; x++) {
      for (let y = cy - 4; y <= cy + 4; y++) {
        const d = depths[y * hiZTex.width + x];
        if (d < minEdgeDepth) minEdgeDepth = d;
      }
    }
    expect(minEdgeDepth).toBeLessThan(20.0);
    expect(minEdgeDepth).toBeGreaterThan(10.0);
    expect(drainGlErrors(gl)).toEqual([]);

    rt.destroy(true);
    tex.destroy(true);
  });

  it("SSRDepthOccluderCuller: enforces short-edge threshold on portrait viewports, supports orthographic & instanced batches, and fails open on invalid inputs", async () => {
    const { engine, scene } = await createTestEngine(432, 960);
    createdEngines.push(engine);

    const root = scene.createRootEntity("root");
    const camEnt = root.createChild("cam");
    camEnt.transform.setPosition(0, 0, 15);
    camEnt.transform.lookAt(new Vector3(0, 0, 0));
    const cam = camEnt.addComponent(Camera);
    cam.fieldOfView = 60;
    cam.nearClipPlane = 0.2;
    cam.farClipPlane = 100;

    const mat = new PBRMaterial(engine);
    // On 432x960 portrait (fovY=60, depth=15): shortEdge=432 -> minPixels=17.28 (4% of width).
    // Box [0.25, 0.25, 0.25] has R=0.2165 -> projected diameter ~24.4 px (~5.6% of width): must NOT be culled.
    const portraitOccluder = addBox(engine, root, "portraitOccluder", [0, 0, 0], [0.25, 0.25, 0.25], mat);
    const tinyA = addBox(engine, root, "tinyA", [0, 0, 0], [0.04, 0.04, 0.04], mat);
    const tinyB = addBox(engine, root, "tinyB", [0.2, 0, 0], [0.04, 0.04, 0.04], mat);
    const orthoLarge = addBox(engine, root, "orthoLarge", [0, 0, 0], [0.6, 0.6, 0.6], mat);
    const orthoSmall = addBox(engine, root, "orthoSmall", [0, 0, 0], [0.2, 0.2, 0.2], mat);

    const portraitMR = portraitOccluder.getComponent(MeshRenderer)!;
    const tinyAMR = tinyA.getComponent(MeshRenderer)!;
    const tinyBMR = tinyB.getComponent(MeshRenderer)!;
    const orthoLargeMR = orthoLarge.getComponent(MeshRenderer)!;
    const orthoSmallMR = orthoSmall.getComponent(MeshRenderer)!;

    // @ts-ignore access internal culler
    const ssrPass = cam._renderPipeline._getOrCreateSSRPass();
    // @ts-ignore
    const culler = ssrPass._occluderCuller;

    // 1. Portrait short-edge threshold
    culler.prepare(cam, 432, 960, cam.viewMatrix, cam.projectionMatrix);
    expect(culler._isBoundsLargeEnoughForDepth(portraitMR.bounds)).toBe(true);
    expect(culler._isBoundsLargeEnoughForDepth(tinyAMR.bounds)).toBe(false);

    // 2. Instanced batches and material opt-out
    expect(
      culler.isOccluderElement({ material: mat, component: tinyAMR, instancedRenderers: [tinyAMR, tinyBMR] })
    ).toBe(false);
    expect(
      culler.isOccluderElement({ material: mat, component: tinyAMR, instancedRenderers: [tinyAMR, portraitMR] })
    ).toBe(true);
    mat.screenSpaceReflectionOccluder = false;
    expect(culler.isOccluderElement({ material: mat, component: portraitMR, instancedRenderers: [] })).toBe(false);
    mat.screenSpaceReflectionOccluder = true;

    // 3. Fail-open on inverted, zero-extent, and NaN bounds
    const invertedBounds = new BoundingBox(new Vector3(1, 1, 1), new Vector3(0.99, 0.99, 0.99));
    const zeroBounds = new BoundingBox(new Vector3(0, 0, 0), new Vector3(0, 0, 0));
    const nanBounds = new BoundingBox(new Vector3(NaN, 0, 0), new Vector3(1, 1, 1));
    expect(culler._isBoundsLargeEnoughForDepth(invertedBounds)).toBe(true);
    expect(culler._isBoundsLargeEnoughForDepth(zeroBounds)).toBe(true);
    expect(culler._isBoundsLargeEnoughForDepth(nanBounds)).toBe(true);

    // 4. Orthographic camera branch (orthoSize=10, 800x450 -> minDiag = 0.8)
    cam.isOrthographic = true;
    cam.orthographicSize = 10;
    cam.aspectRatio = 800 / 450;
    culler.prepare(cam, 800, 450, cam.viewMatrix, cam.projectionMatrix);
    expect(culler._isBoundsLargeEnoughForDepth(orthoLargeMR.bounds)).toBe(true);
    expect(culler._isBoundsLargeEnoughForDepth(orthoSmallMR.bounds)).toBe(false);

    // 5. Fail-open on non-finite viewMatrix / trace dimensions
    cam.isOrthographic = false;
    const badView = new Matrix();
    badView.copyFrom(cam.viewMatrix);
    badView.elements[2] = NaN;
    culler.prepare(cam, 800, 450, badView, cam.projectionMatrix);
    expect(culler._isBoundsLargeEnoughForDepth(tinyAMR.bounds)).toBe(true);

    culler.prepare(cam, 800, Infinity, cam.viewMatrix, cam.projectionMatrix);
    expect(culler._isBoundsLargeEnoughForDepth(tinyAMR.bounds)).toBe(true);

    culler.prepare(cam, 0, 450, cam.viewMatrix, cam.projectionMatrix);
    expect(culler._isBoundsLargeEnoughForDepth(tinyAMR.bounds)).toBe(true);
  });

  it("Allocation cleanup: cleans up partially created persistent SSR resources when first prepare() throws mid-allocation", async () => {
    const { engine, scene, gl } = await createTestEngine(160, 120);
    createdEngines.push(engine);

    const root = scene.createRootEntity("root");
    const camEnt = root.createChild("cam");
    camEnt.transform.setPosition(0, 1.5, 4);
    camEnt.transform.lookAt(new Vector3(0, 0, 0));
    const cam = camEnt.addComponent(Camera);

    const floorMat = new PBRMaterial(engine);
    floorMat.roughness = 0.1;
    addPlane(engine, root, "floor", [0, 0, 0], 6, 6, floorMat);

    scene.screenSpaceReflection.enabled = true;
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.Medium;

    // @ts-ignore access internal pass & RHI
    const ssrPass = cam._renderPipeline._getOrCreateSSRPass();
    const rhi = engine._hardwareRenderer;
    const origCreateRT = rhi.createPlatformRenderTarget.bind(rhi);
    let partialColorPyramidTex: Texture2D | null = null;
    const spyDepthRT = vi.spyOn(rhi, "createPlatformRenderTarget").mockImplementation((target) => {
      if (target.depthTexture?.format === TextureFormat.Depth24Stencil8) {
        // Section 1 already allocated prevColorPyramidTex before Section 2 creates Depth24Stencil8 RT.
        // @ts-ignore
        partialColorPyramidTex = ssrPass._history.prevColorPyramidTex;
        throw new Error("Simulated Depth24Stencil8 RT failure after ColorPyramid allocation");
      }
      return origCreateRT(target);
    });

    expect(() => engine.update()).not.toThrow();
    spyDepthRT.mockRestore();

    expect(partialColorPyramidTex).not.toBeNull();
    expect(partialColorPyramidTex!.destroyed).toBe(true);
    // Immediately disable camera and advance 20 frames + GC: zero leaked SSR bytes remain
    cam.enableScreenSpaceReflection = false;
    stepFrames(engine, 20);
    engine.resourceManager.gc();
    expect(getSSRRetainedBytes(ssrPass)).toBe(0);
    // @ts-ignore
    expect(ssrPass._history.prevColorPyramidTex).toBeNull();
    expect(drainGlErrors(gl)).toEqual([]);
  });

  it("Camera.destroy(): unbinds SSR textures before destroying them without negative refCount", async () => {
    const { engine, scene, gl } = await createTestEngine(160, 120);
    createdEngines.push(engine);

    const root = scene.createRootEntity("root");
    const camEnt = root.createChild("cam");
    camEnt.transform.setPosition(0, 1.5, 4);
    camEnt.transform.lookAt(new Vector3(0, 0, 0));
    const cam = camEnt.addComponent(Camera);

    const floorMat = new PBRMaterial(engine);
    floorMat.roughness = 0.08;
    addPlane(engine, root, "floor", [0, 0, 0], 6, 6, floorMat);

    scene.screenSpaceReflection.enabled = true;
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.High;
    stepFrames(engine, 3);

    const ssrTex = cam.shaderData.getTexture("camera_SSRTexture") as Texture2D;
    const recvDepthTex = cam.shaderData.getTexture("camera_SSRReceiverDepthTexture") as Texture2D;
    const recvNRTex = cam.shaderData.getTexture("camera_SSRReceiverNormalRoughnessTexture") as Texture2D;
    expect(ssrTex).not.toBeNull();
    expect(recvDepthTex).not.toBeNull();
    expect(recvNRTex).not.toBeNull();
    expect(ssrTex._getReferCount()).toBeGreaterThan(0);

    // Direct camera destruction invokes Camera._onDestroy -> _renderPipeline.destroy() -> _ssrPass.onDestroy()
    // while cam.destroyed is already true and cam.shaderData is about to release references.
    cam.destroy();

    expect(ssrTex.destroyed).toBe(true);
    expect(recvDepthTex.destroyed).toBe(true);
    expect(recvNRTex.destroyed).toBe(true);
    expect(ssrTex._getReferCount()).toBe(0);
    expect(recvDepthTex._getReferCount()).toBe(0);
    expect(recvNRTex._getReferCount()).toBe(0);
    expect(drainGlErrors(gl)).toEqual([]);
  });

  it("GLRenderTarget: falls back to primary FBO with target mip attached when mip FBO creation fails", async () => {
    const { engine, gl } = await createTestEngine(64, 64);
    createdEngines.push(engine);

    const mipTex = new Texture2D(engine, 32, 32, TextureFormat.R8G8B8A8_UNorm, true, false);
    mipTex.filterMode = TextureFilterMode.Point;
    mipTex.wrapModeU = TextureWrapMode.Clamp;
    mipTex.wrapModeV = TextureWrapMode.Clamp;
    const mipRT = new RenderTarget(engine, 32, 32, mipTex, null, 1);
    mipRT.autoGenerateMipmaps = false;

    const rhi = engine._hardwareRenderer;
    const vp = new Vector4(0, 0, 1, 1);

    // 1. Write red to mip 0
    rhi.activeRenderTarget(mipRT, vp, true, 0);
    rhi.clearRenderTarget(engine, CameraClearFlags.Color, new Color(1, 0, 0, 1));

    // 2. Simulate gl.createFramebuffer() returning null when trying to allocate mip 1 FBO
    const createSpy = vi.spyOn(gl, "createFramebuffer").mockReturnValueOnce(null);
    rhi.activeRenderTarget(mipRT, vp, true, 1);
    createSpy.mockRestore();
    rhi.clearRenderTarget(engine, CameraClearFlags.Color, new Color(0, 1, 0, 1));
    rhi.activeRenderTarget(null, vp, false, 0);

    // Mip 0 must still be intact red (never overwritten by mip 1 fallback), and mip 1 must be green
    const buf0 = new Uint8Array(32 * 32 * 4);
    mipTex.getPixelBuffer(0, 0, 32, 32, 0, buf0);
    expect([buf0[0], buf0[1], buf0[2], buf0[3]]).toEqual([255, 0, 0, 255]);

    const buf1 = new Uint8Array(16 * 16 * 4);
    mipTex.getPixelBuffer(0, 0, 16, 16, 1, buf1);
    expect([buf1[0], buf1[1], buf1[2], buf1[3]]).toEqual([0, 255, 0, 255]);
    expect(drainGlErrors(gl)).toEqual([]);

    mipRT.destroy(true);
    mipTex.destroy(true);
  });

  it("SSR_PACKED_HDR_REINHARD: avoids low-confidence quantization blow-up near edgeFade borders", async () => {
    const { engine, scene, gl } = await createTestEngine(160, 120);
    createdEngines.push(engine);

    const { rt, tex } = createReadbackRT(engine, 160, 120);
    const root = scene.createRootEntity("root");
    const camEnt = root.createChild("cam");
    camEnt.transform.setPosition(0, 1.35, 3.6);
    camEnt.transform.lookAt(new Vector3(0, 0.35, -1.2));
    const cam = camEnt.addComponent(Camera);
    cam.nearClipPlane = 0.2;
    cam.farClipPlane = 50;
    cam.enableHDR = true;
    cam.renderTarget = rt;

    const floorMat = new PBRMaterial(engine);
    floorMat.baseColor = new Color(1, 1, 1, 1);
    floorMat.metallic = 1.0;
    floorMat.roughness = 0.02;
    floorMat.screenSpaceReflectionIntensity = 1.0;
    addPlane(engine, root, "floor", [0, 0, -0.8], 10, 10, floorMat);

    // Wide bright red HDR wall so reflection spans into screen edgeFade margin
    const wallMat = new PBRMaterial(engine);
    wallMat.emissiveColor = new Color(12.0, 0, 0, 1);
    wallMat.screenSpaceReflectionIntensity = 0;
    addBox(engine, root, "hdrWideWall", [0, 1.85, -1.8], [8.0, 2.0, 0.4], wallMat);

    scene.screenSpaceReflection.enabled = true;
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.Medium;
    scene.screenSpaceReflection.edgeFade = 0.45;
    stepFrames(engine, 3);

    const ssrTex = cam.shaderData.getTexture("camera_SSRTexture") as Texture2D;
    const sw = ssrTex.width;
    const sh = ssrTex.height;
    const ssrBuf = new Uint8Array(sw * sh * 4);
    ssrTex.getPixelBuffer(0, 0, sw, sh, 0, ssrBuf);

    let lowConfCount = 0;
    let maxLowConfDecodedR = 0;
    for (let i = 0; i < ssrBuf.length; i += 4) {
      const a = ssrBuf[i + 3];
      if (a > 0 && a <= 12) {
        lowConfCount++;
        const enc = Math.min(ssrBuf[i] / 255, 253 / 255);
        const decodedR = enc / Math.max(1 - enc, 2 / 255);
        if (decodedR > maxLowConfDecodedR) {
          maxLowConfDecodedR = decodedR;
        }
      }
    }
    expect(lowConfCount).toBeGreaterThan(0);
    // Decoded premultiplied radiance at low confidence (a <= 12/255) must stay bounded cleanly, never blowing up.
    expect(maxLowConfDecodedR).toBeLessThanOrEqual(1.0);
    expect(drainGlErrors(gl)).toEqual([]);

    rt.destroy(true);
    tex.destroy(true);
  });

  it("WebGLGraphicDevice: resets _activeTargetWidth/Height when invalidating or destroying the active RenderTarget", async () => {
    const { engine, gl } = await createTestEngine(160, 120);
    createdEngines.push(engine);

    const rhi = engine._hardwareRenderer as any;
    const mainW = rhi.getMainFrameBufferWidth();
    const mainH = rhi.getMainFrameBufferHeight();
    const smallTex = new Texture2D(engine, 32, 32, TextureFormat.R8G8B8A8_UNorm, false, false);
    const smallRT = new RenderTarget(engine, 32, 32, smallTex, null, 1);

    // 1. Activate small RT then invalidate bound RT -> scissor() must compare against main FB, not stale 32x32
    rhi.activeRenderTarget(smallRT, new Vector4(0, 0, 1, 1), true, 0);
    expect(rhi._activeTargetWidth).toBe(32);
    expect(rhi._activeTargetHeight).toBe(32);

    rhi._invalidateBoundRenderTarget();
    gl.bindFramebuffer(gl.FRAMEBUFFER, rhi._mainFrameBuffer);
    expect(rhi._activeTargetWidth).toBe(0);
    expect(rhi._activeTargetHeight).toBe(0);

    rhi.scissor(0, 0, 32, 32);
    expect(rhi._scissorEnable).toBe(true);
    expect(gl.isEnabled(gl.SCISSOR_TEST)).toBe(true);

    rhi.scissor(0, 0, mainW, mainH);
    expect(rhi._scissorEnable).toBe(false);
    expect(gl.isEnabled(gl.SCISSOR_TEST)).toBe(false);

    // 2. Activate small RT then destroy it -> _onRenderTargetDestroy resets target dims as well
    rhi.activeRenderTarget(smallRT, new Vector4(0, 0, 1, 1), true, 0);
    smallRT.destroy(true);
    smallTex.destroy(true);
    gl.bindFramebuffer(gl.FRAMEBUFFER, rhi._mainFrameBuffer);
    expect(rhi._activeTargetWidth).toBe(0);
    expect(rhi._activeTargetHeight).toBe(0);

    rhi.scissor(0, 0, 32, 32);
    expect(rhi._scissorEnable).toBe(true);
    rhi.scissor(0, 0, mainW, mainH);
    expect(rhi._scissorEnable).toBe(false);
    expect(drainGlErrors(gl)).toEqual([]);
  });

  it("Receiver scissor: falls back to full-screen scissor on degenerate zero-volume or inverted bounds while keeping flat planes tight", async () => {
    const { engine, scene, gl } = await createTestEngine(160, 120);
    createdEngines.push(engine);

    const { rt, tex } = createReadbackRT(engine, 160, 120);
    const root = scene.createRootEntity("root");
    const camEnt = root.createChild("cam");
    camEnt.transform.setPosition(0, 1.35, 3.6);
    camEnt.transform.lookAt(new Vector3(0, 0.35, -1.2));
    const cam = camEnt.addComponent(Camera);
    cam.nearClipPlane = 0.2;
    cam.farClipPlane = 50;
    cam.enableFrustumCulling = false;
    cam.renderTarget = rt;

    const wallMat = new PBRMaterial(engine);
    wallMat.emissiveColor = new Color(4.0, 0, 0, 1);
    wallMat.screenSpaceReflectionIntensity = 0;
    addBox(engine, root, "redWall", [0, 1.85, -1.8], [6.0, 2.0, 0.4], wallMat);

    // Procedural XZ plane WITHOUT calculateBounds(): mesh.bounds stays at default (0,0,0)..(0,0,0)
    const procMesh = new ModelMesh(engine);
    procMesh.setPositions([new Vector3(-5, 0, -5), new Vector3(5, 0, -5), new Vector3(5, 0, 5), new Vector3(-5, 0, 5)]);
    procMesh.setNormals([new Vector3(0, 1, 0), new Vector3(0, 1, 0), new Vector3(0, 1, 0), new Vector3(0, 1, 0)]);
    procMesh.setUVs([new Vector2(0, 0), new Vector2(1, 0), new Vector2(1, 1), new Vector2(0, 1)]);
    procMesh.setIndices(new Uint16Array([0, 2, 1, 0, 3, 2]));
    procMesh.addSubMesh(0, 6, MeshTopology.Triangles);
    procMesh.uploadData(false);

    const floorMat = new PBRMaterial(engine);
    floorMat.baseColor = new Color(0.02, 0.02, 0.02, 1);
    floorMat.metallic = 0.0;
    floorMat.roughness = 0.03;
    floorMat.screenSpaceReflectionIntensity = 1.0;

    const floorEnt = root.createChild("procFloor");
    floorEnt.transform.setPosition(0, 0, -0.8);
    const floorMR = floorEnt.addComponent(MeshRenderer);
    floorMR.mesh = procMesh;
    floorMR.setMaterial(floorMat);

    scene.screenSpaceReflection.enabled = true;
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.Medium;
    stepFrames(engine, 3);

    // @ts-ignore access internal scissor state
    const ssrPass = cam._renderPipeline._ssrPass;
    expect(isSSRActiveForCamera(cam)).toBe(true);
    const traceW = ssrPass._frame.traceWidth;
    const traceH = ssrPass._frame.traceHeight;
    expect([
      ssrPass._lastReceiverScissor.x,
      ssrPass._lastReceiverScissor.y,
      ssrPass._lastReceiverScissor.z,
      ssrPass._lastReceiverScissor.w
    ]).toEqual([0, 0, traceW, traceH]);

    // Left and right sides of the procedural floor must both receive reflection (not clipped to a 4x4 point scissor)
    expect(sampleRegionRGB(tex, 0.15, 0.7, 0.3, 0.92).maxR).toBeGreaterThan(80);
    expect(sampleRegionRGB(tex, 0.7, 0.7, 0.85, 0.92).maxR).toBeGreaterThan(80);

    // Inverted bounds also safely fall back to full-screen scissor
    procMesh.bounds.min.set(2, 2, 2);
    procMesh.bounds.max.set(1, 1, 1);
    floorEnt.transform.setPosition(0, 0, -0.81);
    stepFrames(engine, 2);
    expect([
      ssrPass._lastReceiverScissor.x,
      ssrPass._lastReceiverScissor.y,
      ssrPass._lastReceiverScissor.z,
      ssrPass._lastReceiverScissor.w
    ]).toEqual([0, 0, traceW, traceH]);

    // Valid small flat plane (minY === maxY, non-zero X/Z) still tightens scissor
    const smallPlane = PrimitiveMesh.createPlane(engine, 1.4, 1.8);
    floorMR.mesh = smallPlane;
    floorEnt.transform.setPosition(0, 0, -0.4);
    stepFrames(engine, 2);
    expect(ssrPass._lastReceiverScissor.z).toBeGreaterThan(0);
    expect(ssrPass._lastReceiverScissor.z).toBeLessThan(traceW);
    expect(drainGlErrors(gl)).toEqual([]);

    procMesh.destroy();
    smallPlane.destroy();
    rt.destroy(true);
    tex.destroy(true);
  });

  it("Linear trace toggle: runtime quality switch (High Hi-Z <-> Medium Linear) enters WarmupColor when hiZTex rebuilds to keep depth and color aligned", async () => {
    const { engine, scene, gl } = await createTestEngine(160, 120);
    createdEngines.push(engine);

    const { rt, tex } = createReadbackRT(engine, 160, 120);
    const root = scene.createRootEntity("root");
    const camEnt = root.createChild("cam");
    camEnt.transform.setPosition(0, 1.35, 3.6);
    camEnt.transform.lookAt(new Vector3(0, 0.35, -1.2));
    const cam = camEnt.addComponent(Camera);
    cam.nearClipPlane = 0.2;
    cam.farClipPlane = 50;
    cam.renderTarget = rt;

    const floorMat = new PBRMaterial(engine);
    floorMat.baseColor = new Color(0.02, 0.02, 0.02, 1);
    floorMat.roughness = 0.03;
    floorMat.screenSpaceReflectionIntensity = 1.0;
    addPlane(engine, root, "floor", [0, 0, -0.8], 10, 10, floorMat);

    const wallMat = new PBRMaterial(engine);
    wallMat.emissiveColor = new Color(4.0, 0, 0, 1);
    wallMat.screenSpaceReflectionIntensity = 0;
    addBox(engine, root, "redWall", [0, 1.85, -1.8], [3.2, 2.0, 0.4], wallMat);

    scene.screenSpaceReflection.enabled = true;
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.High;
    stepFrames(engine, 3);
    const ssrPass = getSSRPass(cam);
    expect(ssrPass._state).toBe(SSRState.ActiveSteady);
    expect(ssrPass._frame.preset.useLinearTrace).toBe(false);

    // Toggle to Medium (Linear trace) on an active camera: first frame after hiZTex rebuild MUST run WarmupColor,
    // then FirstTrace, then ActiveSteady with reflection intact.
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.Medium;
    engine.update();
    expect(ssrPass._state).toBe(SSRState.WarmupColor);
    expect(isSSRActiveForCamera(cam)).toBe(false);

    engine.update();
    expect(ssrPass._state).toBe(SSRState.FirstTrace);
    expect(isSSRActiveForCamera(cam)).toBe(true);

    engine.update();
    expect(ssrPass._state).toBe(SSRState.ActiveSteady);
    expect(ssrPass._frame.preset.useLinearTrace).toBe(true);
    expect(sampleRegionRGB(tex, 0.35, 0.68, 0.65, 0.95).maxR).toBeGreaterThan(80);

    // Toggle back to High (Hi-Z): also transitions WarmupColor -> FirstTrace -> ActiveSteady cleanly
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.High;
    engine.update();
    expect(ssrPass._state).toBe(SSRState.WarmupColor);
    stepFrames(engine, 2);
    expect(ssrPass._state).toBe(SSRState.ActiveSteady);
    expect(ssrPass._frame.preset.useLinearTrace).toBe(false);
    expect(sampleRegionRGB(tex, 0.35, 0.68, 0.65, 0.95).maxR).toBeGreaterThan(80);
    expect(drainGlErrors(gl)).toEqual([]);

    rt.destroy(true);
    tex.destroy(true);
  });

  it("Offscreen receiver early-out: preserves state alignment for captureHistory without spurious scissor calls", async () => {
    const { engine, scene, gl } = await createTestEngine(160, 120);
    createdEngines.push(engine);

    const { rt, tex } = createReadbackRT(engine, 160, 120);
    const root = scene.createRootEntity("root");
    const camEnt = root.createChild("cam");
    camEnt.transform.setPosition(0, 1.35, 3.6);
    camEnt.transform.lookAt(new Vector3(0, 0.35, -1.2));
    const cam = camEnt.addComponent(Camera);
    cam.enableFrustumCulling = false;
    cam.renderTarget = rt;

    const floorMat = new PBRMaterial(engine);
    floorMat.roughness = 0.03;
    floorMat.screenSpaceReflectionIntensity = 1.0;
    const floorEnt = addPlane(engine, root, "offscreenFloor", [50, 0, -0.8], 2, 2, floorMat);

    scene.screenSpaceReflection.enabled = true;
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.Medium;
    stepFrames(engine, 2);

    // Consecutive offscreen frame: all dirty rects already clean -> no spurious rhi.scissor(traceW, traceH)
    // while smaller Hi-Z mip is still bound, SCISSOR_TEST remains disabled, and history tracking stays aligned.
    // @ts-ignore access internal pass & RHI scissor state
    const ssrPass = cam._renderPipeline._ssrPass;
    const rhi = engine._hardwareRenderer as any;
    let scissorEnabledAfterPreForward: boolean | null = null;
    const origPreForward = ssrPass.onPreForward.bind(ssrPass);
    const preForwardSpy = vi.spyOn(ssrPass, "onPreForward").mockImplementation((...args) => {
      origPreForward(...args);
      scissorEnabledAfterPreForward = rhi._scissorEnable;
    });
    try {
      engine.update();
      expect(isSSRActiveForCamera(cam)).toBe(false);
      // @ts-ignore
      expect(ssrPass._history.hasHiZHistory).toBe(true);
      // @ts-ignore
      expect(ssrPass._history.hasColorHistory).toBe(true);
      expect(scissorEnabledAfterPreForward).toBe(false);
    } finally {
      preForwardSpy.mockRestore();
    }

    // Bring floor back into view -> resumes immediately with valid color + Hi-Z history and 0 GL errors
    floorEnt.transform.setPosition(0, 0, -0.8);
    stepFrames(engine, 2);
    expect(isSSRActiveForCamera(cam)).toBe(true);
    expect(drainGlErrors(gl)).toEqual([]);

    rt.destroy(true);
    tex.destroy(true);
  });

  it("Linear trace short ray: handles first-step close contact reflection cleanly with zero GL errors", async () => {
    const { engine, scene, gl } = await createTestEngine(160, 120);
    createdEngines.push(engine);

    const { rt, tex } = createReadbackRT(engine, 160, 120);
    const root = scene.createRootEntity("root");
    const camEnt = root.createChild("cam");
    camEnt.transform.setPosition(0, 1.35, 3.6);
    camEnt.transform.lookAt(new Vector3(0, 0.35, -1.2));
    const cam = camEnt.addComponent(Camera);
    cam.nearClipPlane = 0.2;
    cam.farClipPlane = 50;
    cam.renderTarget = rt;

    const floorMat = new PBRMaterial(engine);
    floorMat.baseColor = new Color(0.02, 0.02, 0.02, 1);
    floorMat.metallic = 0.0;
    floorMat.roughness = 0.03;
    floorMat.screenSpaceReflectionIntensity = 1.0;
    addPlane(engine, root, "floor", [0, 0, -0.8], 10, 10, floorMat);

    // Close contact wall resting directly on the floor + short maxDistance so totalPx <= maxSteps hits on step 0
    const wallMat = new PBRMaterial(engine);
    wallMat.emissiveColor = new Color(4.0, 0, 0, 1);
    wallMat.screenSpaceReflectionIntensity = 0;
    addBox(engine, root, "closeRedWall", [0, 0.5, -1.2], [3.2, 1.0, 0.3], wallMat);

    scene.screenSpaceReflection.enabled = true;
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.Medium;
    scene.screenSpaceReflection.maxDistance = 0.6;
    scene.screenSpaceReflection.thickness = 0.2;
    stepFrames(engine, 3);

    const ssrPass = getSSRPass(cam);
    expect(ssrPass._state).toBe(SSRState.ActiveSteady);
    expect(ssrPass._frame.preset.useLinearTrace).toBe(true);
    expect(sampleRegionRGB(tex, 0.35, 0.62, 0.65, 0.88).maxR).toBeGreaterThan(80);
    expect(drainGlErrors(gl)).toEqual([]);

    rt.destroy(true);
    tex.destroy(true);
  });

  it("Capability & Skip behavior: detects capabilities once per active frame and preserves usesPackedNormalOct8 across Skipped", async () => {
    const { engine, scene, gl } = await createTestEngine(160, 120);
    createdEngines.push(engine);

    const root = scene.createRootEntity("root");
    const camEnt = root.createChild("cam");
    camEnt.transform.setPosition(0, 1.5, 4);
    camEnt.transform.lookAt(new Vector3(0, 0, 0));
    const cam = camEnt.addComponent(Camera);
    cam.enableHDR = true;

    const floorMat = new PBRMaterial(engine);
    floorMat.roughness = 0.08;
    addPlane(engine, root, "floor", [0, 0, 0], 6, 6, floorMat);

    scene.screenSpaceReflection.enabled = true;
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.High;
    stepFrames(engine, 3);

    const ssrPass = getSSRPass(cam);
    expect(ssrPass._state).toBe(SSRState.ActiveSteady);
    expect(ssrPass._caps.usesPackedNormalOct8).toBe(false);

    const rhi = engine._hardwareRenderer;
    const supportsSpy = vi.spyOn(rhi, "supportsRenderTargetColorFormat");
    const countR16CapabilityProbes = (): number =>
      supportsSpy.mock.calls.filter((args) => args[0] === TextureFormat.R16_SFloat).length;

    try {
      engine.update();
      expect(countR16CapabilityProbes()).toBe(1);
      expect(ssrPass._caps.usesPackedNormalOct8).toBe(false);

      // Zero receivers -> Skipped: does not re-run capability detection with false or clobber High usesPackedNormalOct8
      supportsSpy.mockClear();
      floorMat.screenSpaceReflectionIntensity = 0;
      engine.update();
      expect(ssrPass._state).toBe(SSRState.Skipped);
      expect(countR16CapabilityProbes()).toBe(0);
      expect(ssrPass._caps.usesPackedNormalOct8).toBe(false);

      // setReplacementShader -> Skipped: also preserves High usesPackedNormalOct8
      floorMat.screenSpaceReflectionIntensity = 1.0;
      stepFrames(engine, 3);
      expect(ssrPass._caps.usesPackedNormalOct8).toBe(false);
      supportsSpy.mockClear();
      const unlitMat = new UnlitMaterial(engine);
      cam.setReplacementShader(unlitMat.shader);
      engine.update();
      expect(ssrPass._state).toBe(SSRState.Skipped);
      expect(countR16CapabilityProbes()).toBe(0);
      expect(ssrPass._caps.usesPackedNormalOct8).toBe(false);
      cam.resetReplacementShader();
      unlitMat.destroy();
      expect(drainGlErrors(gl)).toEqual([]);
    } finally {
      supportsSpy.mockRestore();
    }
  });

  it("Early offscreen culling: skips BuildHiZMipN and DownsampleAndBuildHiZMip0 when receivers are offscreen and clears cached elements", async () => {
    const { engine, scene, gl } = await createTestEngine(160, 120);
    createdEngines.push(engine);

    const { rt, tex } = createReadbackRT(engine, 160, 120);
    const root = scene.createRootEntity("root");
    const camEnt = root.createChild("cam");
    camEnt.transform.setPosition(0, 1.35, 3.6);
    camEnt.transform.lookAt(new Vector3(0, 0.35, -1.2));
    const cam = camEnt.addComponent(Camera);
    cam.nearClipPlane = 0.2;
    cam.farClipPlane = 50;
    cam.enableFrustumCulling = false;
    cam.depthTextureMode = DepthTextureMode.PrePass;
    cam.renderTarget = rt;

    const wallMat = new PBRMaterial(engine);
    wallMat.emissiveColor = new Color(4.0, 0, 0, 1);
    wallMat.screenSpaceReflectionIntensity = 0;
    addBox(engine, root, "redWall", [0, 1.2, -1.8], [3.2, 2.0, 0.4], wallMat);

    const floorMat = new PBRMaterial(engine);
    floorMat.baseColor = new Color(0.02, 0.02, 0.02, 1);
    floorMat.metallic = 0.0;
    floorMat.roughness = 0.03;
    floorMat.screenSpaceReflectionIntensity = 1.0;
    const floorEnt = addPlane(engine, root, "offscreenFloor", [50, 0, -0.4], 1.4, 1.8, floorMat);

    scene.screenSpaceReflection.enabled = true;
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.High;
    stepFrames(engine, 2);

    // @ts-ignore inspect internal pass & blit passes during offscreen frame
    const ssrPass = cam._renderPipeline._ssrPass;
    const origBlit = Blitter.blitTexture;
    const ssrBlitPasses: number[] = [];
    const blitSpy = vi.spyOn(Blitter, "blitTexture").mockImplementation((...args) => {
      // @ts-ignore match internal SSR material
      if (args[5] === ssrPass._material) {
        ssrBlitPasses.push(args[6] as number);
      }
      return origBlit.apply(Blitter, args);
    });
    try {
      engine.update();
    } finally {
      blitSpy.mockRestore();
    }

    // BuildHiZMip0 (0) + ColorPyramidPrefilter (5) run; BuildHiZMipN (1), HiZTrace (3), DownsampleAndBuildHiZMip0 (7) are skipped.
    expect(ssrBlitPasses).toContain(0);
    expect(ssrBlitPasses).not.toContain(1);
    expect(ssrBlitPasses).not.toContain(3);
    expect(ssrBlitPasses).not.toContain(7);
    // @ts-ignore _receiverElements must be cleared at end of frame so no stale RenderElements linger
    expect(ssrPass._receiverElements.length).toBe(0);
    // @ts-ignore
    expect(ssrPass._history.hasHiZHistory).toBe(true);
    // @ts-ignore
    expect(ssrPass._history.hasColorHistory).toBe(true);

    // Move back into view -> resumes immediately with valid reflection
    floorEnt.transform.setPosition(0, 0, -0.4);
    stepFrames(engine, 2);
    expect(isSSRActiveForCamera(cam)).toBe(true);
    expect(sampleRegionRGB(tex, 0.35, 0.58, 0.65, 0.76).maxR).toBeGreaterThan(60);
    expect(drainGlErrors(gl)).toEqual([]);

    rt.destroy(true);
    tex.destroy(true);
  });
});
