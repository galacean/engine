import "@galacean/engine-loader";
import {
  BackgroundMode,
  BlinnPhongMaterial,
  Blitter,
  BloomEffect,
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
  MeshRenderer,
  MeshTopology,
  ModelMesh,
  MSAASamples,
  PBRMaterial,
  PostProcess,
  PrimitiveMesh,
  RenderFace,
  RenderTarget,
  Scene,
  ScreenSpaceReflectionQuality,
  ScreenSpaceReflectionSettings,
  Shader,
  ShaderMacro,
  SSRRuntimeState,
  Texture2D,
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
import { AssetType, EngineEventType } from "@galacean/engine-core";
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
    const raw = new Uint8Array(w * h * 4);
    tex.getPixelBuffer(0, 0, w, h, mipLevel, raw);
    for (let i = 0; i < w * h; i++) {
      const hi = raw[i * 4];
      const lo = raw[i * 4 + 1];
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

  it("enforces defaults, clamping, cloneTo, toJSON, and Material/Camera overrides", async () => {
    const { engine, scene } = await createTestEngine();
    createdEngines.push(engine);

    const ssr = scene.screenSpaceReflection;
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
    ssr.intensity = Number.NaN;
    expect(ssr.intensity).toBe(1.0);
    ssr.maxRoughness = 3;
    expect(ssr.maxRoughness).toBe(1);
    ssr.maxDistance = 0.001;
    expect(ssr.maxDistance).toBe(0.1);
    ssr.maxDistance = 5000;
    expect(ssr.maxDistance).toBe(1000);
    ssr.thickness = 0;
    expect(ssr.thickness).toBe(0.005);
    ssr.edgeFade = 2;
    expect(ssr.edgeFade).toBe(0.5);
    ssr.temporalBlend = 2;
    expect(ssr.temporalBlend).toBe(0.95);
    // @ts-expect-error runtime guard for invalid quality
    ssr.quality = "invalid";
    expect(ssr.quality).toBe(ScreenSpaceReflectionQuality.Medium);

    ssr.apply({ enabled: true, quality: ScreenSpaceReflectionQuality.High, intensity: 1.5, maxDistance: 40 });
    expect(ssr.enabled).toBe(true);
    expect(ssr.quality).toBe(ScreenSpaceReflectionQuality.High);
    expect(ssr.intensity).toBe(1.5);
    expect(ssr.maxDistance).toBe(40);
    expect(ssr.toJSON().maxDistance).toBe(40);

    ssr.quality = ScreenSpaceReflectionQuality.XHigh;
    expect(ssr.quality).toBe(ScreenSpaceReflectionQuality.XHigh);
    expect(ssr.toJSON().quality).toBe(ScreenSpaceReflectionQuality.XHigh);
    ssr.apply({ quality: ScreenSpaceReflectionQuality.High });
    expect(ssr.quality).toBe(ScreenSpaceReflectionQuality.High);

    const copy = new ScreenSpaceReflectionSettings();
    ssr.cloneTo(copy);
    expect(copy.toJSON()).toEqual(ssr.toJSON());

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
    const pbrMat = new PBRMaterial(engine);
    expect(pbrMat.screenSpaceReflectionIntensity).toBe(1);
    expect(pbrMat.contributeScreenSpaceReflectionDepth).toBe(false);
    pbrMat.screenSpaceReflectionIntensity = 0.4;
    pbrMat.contributeScreenSpaceReflectionDepth = true;
    const clonedPbr = pbrMat.clone();
    expect(clonedPbr.screenSpaceReflectionIntensity).toBe(0.4);
    expect(clonedPbr.contributeScreenSpaceReflectionDepth).toBe(true);
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

    expect(scene.screenSpaceReflection.toJSON()).toEqual({
      enabled: true,
      quality: ScreenSpaceReflectionQuality.Low,
      intensity: 1.25,
      maxRoughness: 0.45,
      maxDistance: 18,
      thickness: 0.25,
      edgeFade: 0.15,
      temporalBlend: 0.7
    });

    const mat = await engine.resourceManager.load<Material>({
      url: createBlobURL(
        {
          name: "LoadedSSRMat",
          shader: "PBR",
          screenSpaceReflectionIntensity: 0.65,
          contributeScreenSpaceReflectionDepth: true,
          shaderData: {},
          macros: []
        },
        "mat"
      ),
      type: AssetType.Material
    });
    expect(mat.screenSpaceReflectionIntensity).toBeCloseTo(0.65);
    expect(mat.contributeScreenSpaceReflectionDepth).toBe(true);
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

    scene.screenSpaceReflection.enabled = true;
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.Medium;

    // Frame 1 -> WarmupColor
    engine.update();
    expect(cam.screenSpaceReflectionDiagnostics.state).toBe(SSRRuntimeState.WarmupColor);
    expect(cam.screenSpaceReflectionDiagnostics.active).toBe(false);

    // Frame 2 -> FirstTrace
    engine.update();
    expect(cam.screenSpaceReflectionDiagnostics.state).toBe(SSRRuntimeState.FirstTrace);
    expect(cam.screenSpaceReflectionDiagnostics.active).toBe(true);
    expect(cam.screenSpaceReflectionDiagnostics.traceWidth).toBe(100);
    expect(cam.screenSpaceReflectionDiagnostics.traceHeight).toBe(50);

    // Frame 3 -> ActiveSteady
    engine.update();
    expect(cam.screenSpaceReflectionDiagnostics.state).toBe(SSRRuntimeState.ActiveSteady);
    const mediumBytes = cam.screenSpaceReflectionDiagnostics.estimatedBytes;
    expect(mediumBytes).toBeGreaterThan(0);

    // Camera cut resets history back to WarmupColor -> FirstTrace -> ActiveSteady
    cam.notifyScreenSpaceReflectionCut();
    engine.update();
    expect(cam.screenSpaceReflectionDiagnostics.state).toBe(SSRRuntimeState.WarmupColor);
    stepFrames(engine, 2);
    expect(cam.screenSpaceReflectionDiagnostics.state).toBe(SSRRuntimeState.ActiveSteady);

    // Medium -> High transitions through FirstTrace (color history retained!)
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.High;
    engine.update();
    expect(cam.screenSpaceReflectionDiagnostics.state).toBe(SSRRuntimeState.FirstTrace);
    engine.update();
    expect(cam.screenSpaceReflectionDiagnostics.state).toBe(SSRRuntimeState.ActiveSteady);

    // High -> Low resizes trace targets (0.5x -> 0.25x) so it re-warms depth then drops temporal ping-pong buffers
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.Low;
    engine.update();
    expect(cam.screenSpaceReflectionDiagnostics.state).toBe(SSRRuntimeState.WarmupColor);
    engine.update();
    expect(cam.screenSpaceReflectionDiagnostics.state).toBe(SSRRuntimeState.FirstTrace);
    expect(cam.screenSpaceReflectionDiagnostics.traceWidth).toBe(50);
    expect(cam.screenSpaceReflectionDiagnostics.traceHeight).toBe(25);
    expect(cam.screenSpaceReflectionDiagnostics.estimatedBytes).toBeLessThan(mediumBytes);

    // Rough / zero-intensity receiver -> Skipped
    floorMat.screenSpaceReflectionIntensity = 0;
    engine.update();
    expect(cam.screenSpaceReflectionDiagnostics.state).toBe(SSRRuntimeState.Skipped);
    expect(cam.screenSpaceReflectionDiagnostics.active).toBe(false);

    // Restore receiver & test Disabled cleanup
    floorMat.screenSpaceReflectionIntensity = 1;
    stepFrames(engine, 2);
    cam.enableScreenSpaceReflection = false;
    engine.update();
    expect(cam.screenSpaceReflectionDiagnostics.state).toBe(SSRRuntimeState.Disabled);
    expect(cam.screenSpaceReflectionDiagnostics.estimatedBytes).toBe(0);

    // Re-enable then switch back to Medium before simulating DeviceLost / DeviceRestored
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.Medium;
    cam.enableScreenSpaceReflection = true;
    stepFrames(engine, 3);
    expect(cam.screenSpaceReflectionDiagnostics.state).toBe(SSRRuntimeState.ActiveSteady);

    // @ts-ignore simulate engine device loss & restore
    engine._isDeviceLost = true;
    engine.dispatch(EngineEventType.DeviceLost, engine);
    engine.update();
    expect(cam.screenSpaceReflectionDiagnostics.state).toBe(SSRRuntimeState.ContextLost);

    // @ts-ignore
    engine._isDeviceLost = false;
    engine.dispatch(EngineEventType.DeviceRestored, engine);
    stepFrames(engine, 3);
    expect(cam.screenSpaceReflectionDiagnostics.state).toBe(SSRRuntimeState.ActiveSteady);
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
    const ssrPass = cam._renderPipeline._ssrPass;
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
          const diag = cam.screenSpaceReflectionDiagnostics;
          expect(diag.active).toBe(true);
          expect(diag.useHardwareStencil).toBe(useHWStencil);
          expect(diag.usesPackedDepthRG8).toBe(forcePacked);
          expect(diag.usesPackedNormalOct8).toBe(forcePacked || expectPackedNormalByLDR);
          expect(drainGlErrors(gl)).toEqual([]);
        }
      }
    }

    // HDR Medium upgrades normal/roughness to RGBA16F (usesPackedNormalOct8 = false)
    cam.enableHDR = true;
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.Medium;
    ssrPass._useHardwareStencil = true;
    ssrPass._forcePackedFormats = false;
    stepFrames(engine, 3);
    expect(cam.screenSpaceReflectionDiagnostics.usesPackedNormalOct8).toBe(false);
    cam.enableHDR = false;

    // Combined with SAO (forces DepthOnlyPass at 1.0x -> exercises DownsampleDepth max + BuildHiZMip0 min)
    ssrPass._useHardwareStencil = true;
    ssrPass._forcePackedFormats = false;
    scene.ambientOcclusion.enabled = true;
    cam.depthTextureMode = DepthTextureMode.PrePass;
    stepFrames(engine, 3);
    expect(cam.screenSpaceReflectionDiagnostics.state).toBe(SSRRuntimeState.ActiveSteady);
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
    expect(cam.screenSpaceReflectionDiagnostics.state).toBe(SSRRuntimeState.ActiveSteady);
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

    const diag = cam.screenSpaceReflectionDiagnostics;
    expect(diag.state).toBe(SSRRuntimeState.ActiveSteady);
    expect(diag.transparentReceiverCount).toBeGreaterThanOrEqual(2);
    expect(drainGlErrors(gl)).toEqual([]);

    // Water must reflect green beacon even though discarded alphaCutoff wall is in front!
    const waterPixels = sampleRegionRGB(tex, 0.2, 0.65, 0.55, 0.95);
    expect(waterPixels.maxG).toBeGreaterThan(20);

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
    const overrideB = new ScreenSpaceReflectionSettings();
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
    expect(camA.screenSpaceReflectionDiagnostics.state).toBe(SSRRuntimeState.ActiveSteady);
    expect(camA.screenSpaceReflectionDiagnostics.traceWidth).toBe(80);
    expect(camB.screenSpaceReflectionDiagnostics.state).toBe(SSRRuntimeState.FirstTrace);
    expect(camB.screenSpaceReflectionDiagnostics.traceWidth).toBe(40);
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
    const lowBytes = cam.screenSpaceReflectionDiagnostics.estimatedBytes;

    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.High;
    stepFrames(engine, 3);
    const highBytes = cam.screenSpaceReflectionDiagnostics.estimatedBytes;

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
      const lastWrittenIdx = history.pingPongIndex === 0 ? 1 : 0;
      const depthTex = history.recvDepthTex[lastWrittenIdx]!;
      const depths = readSSRDepthBuffer(depthTex, ssrPass._usesPackedDepthRG8, cam.farClipPlane);
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
    const ssrPass = cam._renderPipeline._ssrPass;
    const captureRecvDepth = (): Float32Array => {
      stepFrames(engine, 3);
      // @ts-ignore
      const history = ssrPass._history;
      // @ts-ignore
      const lastWrittenIdx = ssrPass._useTemporal ? (history.pingPongIndex === 0 ? 1 : 0) : 0;
      const depthTex = history.recvDepthTex[lastWrittenIdx]!;
      return readSSRDepthBuffer(depthTex, ssrPass._usesPackedDepthRG8, cam.farClipPlane);
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
    const packed = ssrPass._usesPackedDepthRG8;
    const format = ssrPass._depthColorFormat;

    const createDepthInput = (values: number[]): Texture2D => {
      const tex = new Texture2D(engine, values.length, 1, format, false, false);
      tex.filterMode = TextureFilterMode.Point;
      tex.wrapModeU = TextureWrapMode.Clamp;
      tex.wrapModeV = TextureWrapMode.Clamp;
      if (packed) {
        const bytes = new Uint8Array(values.length * 4);
        for (let i = 0; i < values.length; i++) {
          const u = Math.sqrt(Math.max(0, Math.min(1, values[i] / 100)));
          const enc = Math.round(u * 65535);
          bytes[i * 4] = (enc >> 8) & 0xff;
          bytes[i * 4 + 1] = enc & 0xff;
          bytes[i * 4 + 2] = 0;
          bytes[i * 4 + 3] = 255;
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
      ssrPass._sourceTexelSize.set(1 / srcValues.length, 1, srcValues.length, 1);
      // @ts-ignore
      ssrPass._destTexelSize.set(1 / dstW, 1, dstW, 1);
      material.shaderData.setTexture("material_SSRHiZInputTexture", srcTex);
      // @ts-ignore
      material.shaderData.setVector4("material_SSRSourceTexelSize", ssrPass._sourceTexelSize);
      // @ts-ignore
      material.shaderData.setVector4("material_SSRDestTexelSize", ssrPass._destTexelSize);
      engine._renderContext.camera = cam;
      Blitter.blitTexture(engine, srcTex, dstRT, 0, new Vector4(0, 0, 1, 1), material, 2, undefined, 0);
      material.shaderData.setTexture("material_SSRHiZInputTexture", null);
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

    // Unlit Forward ignores vertex alpha -> center color is GREEN AND prevTraceDepthTex center is ~4.0
    const unlitColor = sampleRegionRGB(tex, 0.45, 0.45, 0.55, 0.55);
    expect(unlitColor.avgG).toBeGreaterThan(200);
    // @ts-ignore access internal Hi-Z mip0 history depth
    const ssrPass = cam._renderPipeline._ssrPass;
    // @ts-ignore
    const traceDepthTex = ssrPass._history.prevTraceDepthTex!;
    const readTraceCenter = (): number => {
      const depths = readSSRDepthBuffer(traceDepthTex, ssrPass._usesPackedDepthRG8, cam.farClipPlane);
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

  it("CR-007: normalizes plain JSON Camera.screenSpaceReflectionOverride loaded via SceneLoader", async () => {
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
    expect(cam.screenSpaceReflectionOverride).toBeInstanceOf(ScreenSpaceReflectionSettings);
    expect(cam.screenSpaceReflectionOverride!.enabled).toBe(true);
    expect(cam.screenSpaceReflectionOverride!.quality).toBe(ScreenSpaceReflectionQuality.Medium);
    expect(cam.screenSpaceReflectionOverride!.maxDistance).toBe(33);

    // Add reflective plane and ensure zero runtime errors when rendering
    const floorMat = new PBRMaterial(engine);
    floorMat.roughness = 0.05;
    addPlane(engine, loadedScene.findEntityByName("floor")!, "plane", [0, 0, 0], 6, 6, floorMat);

    expect(() => stepFrames(engine, 3)).not.toThrow();
    expect(cam.screenSpaceReflectionDiagnostics.state).toBe(SSRRuntimeState.ActiveSteady);

    // Direct plain-object assignment & clone also stay normalized
    cam.screenSpaceReflectionOverride = { enabled: true, quality: 2, intensity: 1.4 };
    expect(cam.screenSpaceReflectionOverride).toBeInstanceOf(ScreenSpaceReflectionSettings);
    expect(cam.screenSpaceReflectionOverride!.quality).toBe(ScreenSpaceReflectionQuality.High);
    const clonedCam = camEnt.clone().getComponent(Camera)!;
    expect(clonedCam.screenSpaceReflectionOverride).toBeInstanceOf(ScreenSpaceReflectionSettings);
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
    expect(cam.screenSpaceReflectionDiagnostics.state).toBe(SSRRuntimeState.WarmupColor);

    // @ts-ignore access internal scratch lists
    const ssrPass = cam._renderPipeline._ssrPass;
    const pool = engine._renderTargetPool;
    const origAlloc = pool.allocateRenderTarget.bind(pool);
    let allocCalls = 0;

    // Inject failure on 2nd Hi-Z scratch allocation inside renderPreForward (note: BasicRenderPipeline internalColorTarget may or may not allocate before renderPreForward; trigger specifically when format === ssrPass._depthColorFormat on 2nd call)
    let hiZAllocs = 0;
    const spyHiZ = vi.spyOn(pool, "allocateRenderTarget").mockImplementation((...args) => {
      if (args[2] === ssrPass._depthColorFormat) {
        hiZAllocs++;
        if (hiZAllocs === 2) {
          throw new Error("Simulated Hi-Z RT allocation failure");
        }
      }
      return origAlloc(...args);
    });

    expect(() => engine.update()).not.toThrow();
    spyHiZ.mockRestore();

    // Forward MUST still have rendered blue output and zero Hi-Z scratches leaked
    const afterHiZFail = sampleRegionRGB(tex, 0.35, 0.35, 0.65, 0.65);
    expect(afterHiZFail.avgB).toBeGreaterThan(200);
    // @ts-ignore
    expect(ssrPass._hiZScratchRTs.length).toBe(0);
    expect(cam.screenSpaceReflectionDiagnostics.active).toBe(false);

    // Recover cleanly across next frames
    stepFrames(engine, 3);
    expect(cam.screenSpaceReflectionDiagnostics.state).toBe(SSRRuntimeState.ActiveSteady);

    // Inject failure on mip-1 ColorPyramid scratch allocation inside captureHistory
    let colorPyrAllocs = 0;
    const spyColor = vi.spyOn(pool, "allocateRenderTarget").mockImplementation((...args) => {
      if (args[2] === ssrPass._colorPyramidFormat && args[0] < 128) {
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
    expect(ssrPass._colorScratchRTs.length).toBe(0);
    expect(cam.screenSpaceReflectionDiagnostics.active).toBe(false);
    const afterColorFail = sampleRegionRGB(tex, 0.35, 0.35, 0.65, 0.65);
    expect(afterColorFail.avgB).toBeGreaterThan(200);

    // Must recover back to ActiveSteady afterwards with zero GL errors
    stepFrames(engine, 3);
    expect(cam.screenSpaceReflectionDiagnostics.state).toBe(SSRRuntimeState.ActiveSteady);
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
    expect(history.ssrPingPongRT[0]!.depthTexture).toBe(ssrPass._ssrDepthTex);
    // @ts-ignore
    expect(history.ssrPingPongRT[1]!.depthTexture).toBe(ssrPass._ssrDepthTex);

    // Background corner pixel outside center receiver must stay (0,0,0,0) in active ping-pong output
    const writtenIdx = history.pingPongIndex === 0 ? 1 : 0;
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
    expect(cam.screenSpaceReflectionDiagnostics.state).toBe(SSRRuntimeState.ActiveSteady);
    expect(drainGlErrors(gl)).toEqual([]);

    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.High;
    stepFrames(engine, 3);
    expect(cam.screenSpaceReflectionDiagnostics.state).toBe(SSRRuntimeState.ActiveSteady);
    expect(drainGlErrors(gl)).toEqual([]);

    varyingRoughTex.destroy(true);
  });

  it("Items 3.2 & 4: uses single mip-1 pooled scratch per pyramid, preserves valid mips, and reclaims Skipped after 10 idle frames", async () => {
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
    const depthBuckets = freeRTs.filter((rt) => rt.getColorTexture(0)?.format === ssrPass._depthColorFormat);
    // @ts-ignore
    const colorBuckets = freeRTs.filter((rt) => rt.getColorTexture(0)?.format === ssrPass._colorPyramidFormat);
    // Expect strictly 2 depth RTs (hiZRT 80x60 + mip1 scratch 40x30) and 1 color RT (mip1 scratch 40x30) — NOT per-mip buckets!
    expect(depthBuckets.length).toBe(2);
    expect(colorBuckets.length).toBe(1);
    expect(depthBuckets.map((r) => `${r.width}x${r.height}`).sort()).toEqual(["40x30", "80x60"]);
    expect(`${colorBuckets[0].width}x${colorBuckets[0].height}`).toBe("40x30");

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
    expect(cam.screenSpaceReflectionDiagnostics.state).toBe(SSRRuntimeState.Skipped);
    expect(cam.screenSpaceReflectionDiagnostics.estimatedBytes).toBeGreaterThan(0);

    // Reaching 10 consecutive Skipped frames releases persistent resources to 0, then cleanly recovers
    stepFrames(engine, 8);
    expect(cam.screenSpaceReflectionDiagnostics.state).toBe(SSRRuntimeState.Skipped);
    expect(cam.screenSpaceReflectionDiagnostics.estimatedBytes).toBe(0);

    floorMat.screenSpaceReflectionIntensity = 1.0;
    stepFrames(engine, 3);
    expect(cam.screenSpaceReflectionDiagnostics.state).toBe(SSRRuntimeState.ActiveSteady);
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

    scene.screenSpaceReflection.enabled = true;
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.High;
    // Warm up + first trace (populates fallback pointer cache)
    stepFrames(engine, 3);

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
    expect(cam.screenSpaceReflectionDiagnostics.state).toBe(SSRRuntimeState.WarmupColor);

    // Frame 2 skipped (30fps secondary camera), Frame 3 active -> must advance to FirstTrace
    cam.enabled = false;
    engine.update();
    cam.enabled = true;
    engine.update();
    expect(cam.screenSpaceReflectionDiagnostics.state).toBe(SSRRuntimeState.FirstTrace);

    // Frame 4 skipped, Frame 5 active -> must advance to ActiveSteady
    cam.enabled = false;
    engine.update();
    cam.enabled = true;
    engine.update();
    expect(cam.screenSpaceReflectionDiagnostics.state).toBe(SSRRuntimeState.ActiveSteady);
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
    const lowDiag = { ...cam.screenSpaceReflectionDiagnostics };
    expect(lowDiag.traceWidth).toBe(195);
    expect(lowDiag.traceHeight).toBe(422);
    expect(lowDiag.estimatedBytes).toBeLessThanOrEqual(4.5 * 1024 * 1024);

    // Medium LDR (0.5x = 390x844, RGBA8 + Oct8 + aliased recvNR onto ssrPingPongTex)
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.Medium;
    stepFrames(engine, 3);
    const medLDRDiag = { ...cam.screenSpaceReflectionDiagnostics };
    // @ts-ignore verify Medium aliases recvNR rather than holding separate recvNRTex buffers
    const history = cam._renderPipeline._ssrPass._history;
    expect(history.recvNRTex[0]).toBeNull();
    expect(history.recvNRTex[1]).toBeNull();
    expect(medLDRDiag.estimatedBytes).toBeLessThanOrEqual(11 * 1024 * 1024);

    // Medium HDR (RGBA16F, still aliased cleanly)
    cam.enableHDR = true;
    stepFrames(engine, 3);
    const medHDRDiag = { ...cam.screenSpaceReflectionDiagnostics };
    expect(history.recvNRTex[0]).toBeNull();
    expect(medHDRDiag.estimatedBytes).toBeLessThanOrEqual(14.5 * 1024 * 1024);

    // High HDR
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.High;
    stepFrames(engine, 3);
    const highHDRBytes = cam.screenSpaceReflectionDiagnostics.estimatedBytes;

    expect(lowDiag.estimatedBytes).toBeLessThan(medLDRDiag.estimatedBytes);
    expect(medLDRDiag.estimatedBytes).toBeLessThan(medHDRDiag.estimatedBytes);
    expect(medHDRDiag.estimatedBytes).toBeLessThan(highHDRBytes);
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
    const hiZList = ssrPass._hiZScratchRTs;
    // @ts-ignore
    const colorList = ssrPass._colorScratchRTs;
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

  it("supports XHigh full-resolution trace and color pyramid with 1:1 Forward sampling, Karis mip1, split-screen safety, and clean preset transitions", async () => {
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

    // 2. Enable XHigh (full-res 160x120 trace & color pyramid, 1:1 Forward sampling without bilateral upsample)
    scene.screenSpaceReflection.enabled = true;
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.XHigh;
    stepFrames(engine, 4);

    const xhighDiag = cam.screenSpaceReflectionDiagnostics;
    expect(xhighDiag.active).toBe(true);
    expect(xhighDiag.state).toBe(SSRRuntimeState.ActiveSteady);
    expect(xhighDiag.traceWidth).toBe(160);
    expect(xhighDiag.traceHeight).toBe(120);
    expect(xhighDiag.usesPackedNormalOct8).toBe(false);

    // @ts-ignore inspect internal history & Forward camera bindings
    const ssrPass = cam._renderPipeline._ssrPass;
    // @ts-ignore
    const pyrTex = ssrPass._history.prevColorPyramidTex!;
    expect(pyrTex.width).toBe(160);
    expect(pyrTex.height).toBe(120);

    // Forward uses crisp 1:1 sampling (no bilateral macro, no NR sampler slot), no depth-verify on opaque-only
    expect(cam.shaderData._macroCollection.isEnable(ShaderMacro.getByName("CAMERA_ENABLE_SSR"))).toBe(true);
    expect(cam.shaderData._macroCollection.isEnable(ShaderMacro.getByName("CAMERA_SSR_BILATERAL_SAMPLE"))).toBe(false);
    expect(cam.shaderData._macroCollection.isEnable(ShaderMacro.getByName("CAMERA_SSR_VERIFY_RECEIVER_DEPTH"))).toBe(
      false
    );
    expect(cam.shaderData.getTexture("camera_SSRReceiverNormalRoughnessTexture")).toBeNull();
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

    // Physically aligned glossy reflection on floor under XHigh
    const xhighFloor = sampleRegionRGB(tex, 0.35, 0.68, 0.65, 0.95);
    expect(xhighFloor.maxR).toBeGreaterThan(offFloor.maxR + 60);
    expect(xhighFloor.avgR).toBeGreaterThan(offFloor.avgR + 15);
    const xhighBytes = xhighDiag.estimatedBytes;

    // 3. Adding a transparent receiver enables CAMERA_SSR_VERIFY_RECEIVER_DEPTH in Forward even in XHigh
    const waterMat = new PBRMaterial(engine);
    waterMat.isTransparent = true;
    waterMat.roughness = 0.05;
    waterMat.baseColor = new Color(0.1, 0.4, 0.6, 0.45);
    const waterEnt = addPlane(engine, root, "shallowWater", [0, 0.25, -0.8], 4, 4, waterMat);
    stepFrames(engine, 2);
    expect(cam.shaderData._macroCollection.isEnable(ShaderMacro.getByName("CAMERA_SSR_VERIFY_RECEIVER_DEPTH"))).toBe(
      true
    );
    expect(cam.shaderData._macroCollection.isEnable(ShaderMacro.getByName("CAMERA_SSR_BILATERAL_SAMPLE"))).toBe(false);
    waterEnt.destroy();

    // 4. Clean preset transitions: XHigh -> High -> Medium -> XHigh, plus SAO full-res depth 1:1 path
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.High;
    stepFrames(engine, 3);
    const highDiag = cam.screenSpaceReflectionDiagnostics;
    expect(highDiag.traceWidth).toBe(80);
    expect(highDiag.traceHeight).toBe(60);
    expect(xhighBytes).toBeGreaterThan(highDiag.estimatedBytes);

    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.Medium;
    stepFrames(engine, 3);
    expect(cam.screenSpaceReflectionDiagnostics.state).toBe(SSRRuntimeState.ActiveSteady);

    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.XHigh;
    scene.ambientOcclusion.enabled = true;
    cam.depthTextureMode = DepthTextureMode.PrePass;
    stepFrames(engine, 4);
    expect(cam.screenSpaceReflectionDiagnostics.state).toBe(SSRRuntimeState.ActiveSteady);
    expect(cam.screenSpaceReflectionDiagnostics.traceWidth).toBe(160);
    expect(cam.screenSpaceReflectionDiagnostics.traceHeight).toBe(120);

    // 5. Split-screen horizontal viewport isolation under XHigh (1:1 full-res prefilter path)
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

    // 6. SceneLoader deserialization supports XHigh
    await applySceneData(
      scene,
      {
        rootEntities: [],
        background: { mode: BackgroundMode.SolidColor, color: [0, 0, 0, 1] },
        screenSpaceReflection: { enabled: true, quality: ScreenSpaceReflectionQuality.XHigh }
      },
      engine.resourceManager,
      []
    );
    expect(scene.screenSpaceReflection.quality).toBe(ScreenSpaceReflectionQuality.XHigh);
    expect(drainGlErrors(gl)).toEqual([]);

    rt.destroy(true);
    tex.destroy(true);
  });

  it("maintains hole-free, flicker-free diagonal pillar reflection across high-res floor spans under XHigh HiZTrace", async () => {
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

    // Enable XHigh and reach steady state
    scene.screenSpaceReflection.enabled = true;
    scene.screenSpaceReflection.quality = ScreenSpaceReflectionQuality.XHigh;
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
});
