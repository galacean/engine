import "@galacean/engine-loader";
import {
  BackgroundMode,
  Blitter,
  BloomEffect,
  Camera,
  CameraClearFlags,
  Color,
  DepthTextureMode,
  DiffuseMode,
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
  RenderBufferDepthFormat,
  RenderFace,
  RenderTarget,
  Scene,
  ScreenSpaceReflection,
  ScreenSpaceReflectionQuality,
  Shader,
  ShaderMacro,
  Texture2D,
  TextureCube,
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
import { AssetType, EngineEventType } from "@galacean/engine-core";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
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

function sceneSSR(scene: Scene): ScreenSpaceReflection {
  return scene.screenSpaceReflection;
}

function getSSRPass(cam: Camera): any {
  return (cam._renderPipeline as any)._ssrPass ?? null;
}

function mockPackedFormats(engine: WebGLEngine) {
  const rhi = engine._hardwareRenderer;
  const supportsFormat = rhi.supportsRenderTargetColorFormat.bind(rhi);
  return vi.spyOn(rhi, "supportsRenderTargetColorFormat").mockImplementation((format) => {
    return (
      format !== TextureFormat.R16_SFloat && format !== TextureFormat.R16G16B16A16_SFloat && supportsFormat(format)
    );
  });
}

function mockDepthOnly(engine: WebGLEngine) {
  const rhi = engine._hardwareRenderer;
  const supportsFormat = rhi.supportsTextureFormat.bind(rhi);
  return vi.spyOn(rhi, "supportsTextureFormat").mockImplementation((format) => {
    return format !== TextureFormat.Depth24Stencil8 && supportsFormat(format);
  });
}

function isSSRActiveForCamera(cam: Camera): boolean {
  const ssrPass = getSSRPass(cam);
  return Boolean(ssrPass && (ssrPass._state === SSRState.FirstTrace || ssrPass._state === SSRState.ActiveSteady));
}

function assertUnboundAtFrameEnd(cam: Camera): void {
  expect(cam.shaderData.getTexture("camera_SSRTexture")).toBeNull();
  const engineMacros = cam.engine._macroCollection;
  for (const macroName of [
    "CAMERA_ENABLE_SSR",
    "CAMERA_SSR_BILATERAL_SAMPLE",
    "SSR_PACKED_DEPTH_RG8",
    "CAMERA_DEPTH_NORMALS_PACKED_OCT8",
    "SSR_PACKED_HDR_REINHARD"
  ]) {
    expect(engineMacros.isEnable(ShaderMacro.getByName(macroName))).toBe(false);
  }
}

function getActiveSSROutputTexture(ssrPass: any): Texture2D {
  if (ssrPass._frame.preset.useTemporal) {
    const writtenIdx = ssrPass._history.temporalPingPongIndex === 0 ? 1 : 0;
    return ssrPass._resources.ssrPingPongTex[writtenIdx]!;
  }
  return ssrPass._resources.traceRawTex!;
}

function getSSRRetainedBytes(ssrPass: any): number {
  if (!ssrPass) return 0;
  const res = ssrPass._resources;
  const textures: Array<Texture2D | null | undefined> = [
    res.traceRawTex,
    res.hitDistTex,
    res.prevNormalRoughnessTex,
    res.prevColorPyramidTex,
    res.hiZTex[0],
    res.hiZTex[1],
    res.ssrPingPongTex[0],
    res.ssrPingPongTex[1]
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
  height = 120,
  withShaderCompiler = false
): Promise<{ engine: WebGLEngine; scene: Scene; gl: WebGL2RenderingContext }> {
  const engine = await WebGLEngine.create({
    canvas: createCanvas(width, height),
    ...(withShaderCompiler ? { shaderCompiler: new ShaderCompiler() } : {}),
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
  mesh.setPositions([
    new Vector3(-hw, -hh, 0),
    new Vector3(hw, -hh, 0),
    new Vector3(hw, hh, 0),
    new Vector3(-hw, hh, 0)
  ]);
  mesh.setNormals([new Vector3(0, 0, 1), new Vector3(0, 0, 1), new Vector3(0, 0, 1), new Vector3(0, 0, 1)]);
  mesh.setUVs([new Vector2(0, 0), new Vector2(1, 0), new Vector2(1, 1), new Vector2(0, 1)]);
  mesh.setColors([new Color(r, g, b, a), new Color(r, g, b, a), new Color(r, g, b, a), new Color(r, g, b, a)]);
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

describe("ScreenSpaceReflection (DepthNormals prepass)", () => {
  const createdEngines: Engine[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    while (createdEngines.length > 0) {
      const eng = createdEngines.pop()!;
      if (!eng.destroyed) {
        eng.destroy();
      }
    }
  });

  it("enforces Scene screenSpaceReflection defaults, clamping, PBRMaterial opt-out, and MaterialLoader deserialization", async () => {
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
    expect(ssr.intensity).toBe(1.25);
    ssr.intensity = Number.NaN;
    expect(ssr.intensity).toBeNaN();
    ssr.intensity = 1;
    ssr.maxRoughness = 3;
    expect(ssr.maxRoughness).toBe(1);
    ssr.maxDistance = 0.001;
    expect(ssr.maxDistance).toBe(0.1);
    ssr.maxDistance = Number.POSITIVE_INFINITY;
    expect(ssr.maxDistance).toBe(1000);
    ssr.thickness = 0;
    expect(ssr.thickness).toBe(0.005);
    ssr.edgeFade = 2;
    expect(ssr.edgeFade).toBe(0.5);
    ssr.temporalBlend = 2;
    expect(ssr.temporalBlend).toBe(0.95);
    ssr.quality = ScreenSpaceReflectionQuality.High;
    expect(ssr.quality).toBe(ScreenSpaceReflectionQuality.High);

    ssr.enabled = true;
    expect(ssr._isValid()).toBe(true);
    ssr.enabled = false;
    expect(ssr._isValid()).toBe(false);
    ssr.enabled = true;
    ssr.intensity = 0;
    expect(ssr._isValid()).toBe(false);
    ssr.intensity = 1;
    ssr.maxRoughness = 0;
    expect(ssr._isValid()).toBe(false);

    const pbrMat = new PBRMaterial(engine);
    const omitSSRMacro = ShaderMacro.getByName("MATERIAL_OMIT_SSR");
    expect(pbrMat.screenSpaceReflectionIntensity).toBe(1);
    expect(pbrMat.shaderData._macroCollection.isEnable(omitSSRMacro)).toBe(false);
    pbrMat.screenSpaceReflectionIntensity = 0;
    expect(pbrMat.shaderData._macroCollection.isEnable(omitSSRMacro)).toBe(true);
    pbrMat.screenSpaceReflectionIntensity = 0.4;
    expect(pbrMat.shaderData._macroCollection.isEnable(omitSSRMacro)).toBe(false);
    const clonedPbr = pbrMat.clone();
    expect(clonedPbr.screenSpaceReflectionIntensity).toBe(0.4);
    expect(clonedPbr.shaderData.getFloat("material_ScreenSpaceReflectionIntensity")).toBeCloseTo(0.4);

    const loadedMat = await engine.resourceManager.load<Material>({
      url: createBlobURL(
        {
          name: "LoadedSSRMat",
          shader: "PBR",
          shaderData: {
            material_ScreenSpaceReflectionIntensity: { type: "Float", value: 0.65 },
            material_Roughness: { type: "Float", value: 0.1 }
          },
          macros: []
        },
        "mat"
      ),
      type: AssetType.Material
    });
    expect(loadedMat.shaderData.getFloat("material_ScreenSpaceReflectionIntensity")).toBeCloseTo(0.65);
    expect(loadedMat.shaderData.getFloat("material_Roughness")).toBeCloseTo(0.1);
    loadedMat.destroy();
  });

  it("progresses state machine across Warmup/FirstTrace/ActiveSteady, Cut, Quality switches, Skipped paths, and DeviceLost", async () => {
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

    engine.update();
    engine._renderTargetPool.gc();
    const baselineTexMem = engine.renderingStatistics.textureMemory;
    const ssr = sceneSSR(scene);
    ssr.enabled = true;
    ssr.quality = ScreenSpaceReflectionQuality.Medium;

    // WarmupColor -> FirstTrace -> ActiveSteady
    engine.update();
    const ssrPass = getSSRPass(cam);
    expect(ssrPass._state).toBe(SSRState.WarmupColor);
    expect(isSSRActiveForCamera(cam)).toBe(false);
    assertUnboundAtFrameEnd(cam);

    engine.update();
    expect(ssrPass._state).toBe(SSRState.FirstTrace);
    expect(isSSRActiveForCamera(cam)).toBe(true);
    expect(ssrPass._resources.hiZTex[0]!.width).toBe(100);
    expect(ssrPass._resources.hiZTex[0]!.height).toBe(50);

    engine.update();
    expect(ssrPass._state).toBe(SSRState.ActiveSteady);
    const mediumBytes = getSSRRetainedBytes(ssrPass);
    expect(mediumBytes).toBeGreaterThan(0);

    // Camera cut resets history back to WarmupColor
    cam._invalidateRenderHistory();
    engine.update();
    expect(ssrPass._state).toBe(SSRState.WarmupColor);
    stepFrames(engine, 2);
    expect(ssrPass._state).toBe(SSRState.ActiveSteady);

    // Medium -> High (Hi-Z) -> Low (0.25x, non-temporal)
    ssr.quality = ScreenSpaceReflectionQuality.High;
    engine.update();
    expect(ssrPass._state).toBe(SSRState.WarmupColor);
    stepFrames(engine, 2);
    expect(ssrPass._state).toBe(SSRState.ActiveSteady);
    expect(ssrPass._resources.hiZTex[0]!.mipmapCount).toBeGreaterThan(1);

    ssr.quality = ScreenSpaceReflectionQuality.Low;
    stepFrames(engine, 2);
    expect(ssrPass._state).toBe(SSRState.FirstTrace);
    expect(ssrPass._resources.hiZTex[0]!.width).toBe(50);
    expect(ssrPass._resources.hiZTex[0]!.height).toBe(25);
    expect(ssrPass._resources.hiZTex[0]!.mipmapCount).toBe(1);
    expect(getSSRRetainedBytes(ssrPass)).toBeLessThan(mediumBytes);

    // Non-2D render targets & replacementShader skip SSR safely while keeping history
    const skipUnlitMat = new UnlitMaterial(engine);
    cam.setReplacementShader(skipUnlitMat.shader);
    engine.update();
    expect(ssrPass._state).toBe(SSRState.Skipped);
    expect(getSSRRetainedBytes(ssrPass)).toBeGreaterThan(0);
    cam.resetReplacementShader();
    skipUnlitMat.destroy();

    const depthOnlyRT = new RenderTarget(engine, 200, 100, null, TextureFormat.Depth24, 1);
    cam.renderTarget = depthOnlyRT;
    engine.update();
    expect(ssrPass._state).toBe(SSRState.Skipped);
    const cubeTex = new TextureCube(engine, 64, TextureFormat.R8G8B8A8_UNorm, false, false);
    const cubeRT = new RenderTarget(engine, 64, 64, cubeTex, TextureFormat.Depth24Stencil8, 1);
    cam.renderTarget = cubeRT;
    engine.update();
    expect(ssrPass._state).toBe(SSRState.Skipped);
    engine._renderContext.camera = cam;
    (cam._renderPipeline as any).render(engine._renderContext, TextureCubeFace.PositiveX);
    engine._renderContext.camera = null!;
    expect(ssrPass._state).toBe(SSRState.Skipped);
    cam.renderTarget = null;
    cubeRT.destroy(true);
    cubeTex.destroy(true);
    depthOnlyRT.destroy(true);

    // Disabled reclaims GPU memory cleanly
    ssr.enabled = false;
    engine.update();
    expect(ssrPass._state).toBe(SSRState.Disabled);
    expect(getSSRRetainedBytes(ssrPass)).toBe(0);
    engine._renderTargetPool.gc();
    expect(engine.renderingStatistics.textureMemory).toBe(baselineTexMem);

    // DeviceLost -> ContextLost -> DeviceRestored
    ssr.quality = ScreenSpaceReflectionQuality.Medium;
    ssr.enabled = true;
    stepFrames(engine, 3);
    expect(ssrPass._state).toBe(SSRState.ActiveSteady);

    // @ts-ignore simulate engine device loss & restore
    engine._onDeviceLost();
    expect(ssrPass._state).toBe(SSRState.ContextLost);
    expect(getSSRRetainedBytes(ssrPass)).toBe(0);
    expect(ssrPass._resources.hiZTex[0]).toBeNull();
    engine.update();
    expect(ssrPass._state).toBe(SSRState.ContextLost);

    const restored = new Promise<void>((resolve) => engine.once(EngineEventType.DeviceRestored, () => resolve()));
    // @ts-ignore
    engine._onDeviceRestored();
    stepFrames(engine, 3);
    await restored;
    expect(ssrPass._state).toBe(SSRState.ActiveSteady);
    expect(drainGlErrors(gl)).toEqual([]);
  });

  it("isolates multi-camera state and reclaims GPU textures, bindings, and macros on disable, GC, and Camera.destroy()", async () => {
    const { engine, scene, gl } = await createTestEngine(160, 120);
    createdEngines.push(engine);

    const root = scene.createRootEntity("root");
    const camEntA = root.createChild("camA");
    camEntA.transform.setPosition(0, 1.5, 4);
    camEntA.transform.lookAt(new Vector3(0, 0, 0));
    const camA = camEntA.addComponent(Camera);

    const camEntB = root.createChild("camB");
    camEntB.transform.setPosition(2, 1.5, 4);
    camEntB.transform.lookAt(new Vector3(0, 0, 0));
    const camB = camEntB.addComponent(Camera);

    const floorMat = new PBRMaterial(engine);
    floorMat.roughness = 0.05;
    addPlane(engine, root, "floor", [0, 0, 0], 8, 8, floorMat);

    const ssr = sceneSSR(scene);
    ssr.enabled = true;
    ssr.quality = ScreenSpaceReflectionQuality.High;
    stepFrames(engine, 3);

    const ssrPassA = getSSRPass(camA);
    const ssrPassB = getSSRPass(camB);
    expect(ssrPassA).not.toBe(ssrPassB);
    expect(ssrPassA._state).toBe(SSRState.ActiveSteady);
    expect(ssrPassB._state).toBe(SSRState.ActiveSteady);
    assertUnboundAtFrameEnd(camA);
    assertUnboundAtFrameEnd(camB);

    // ResourceManager.gc() preserves active isGCIgnored SSR buffers
    const activePyrTex = ssrPassA._resources.prevColorPyramidTex! as Texture2D;
    engine.resourceManager.gc();
    expect(activePyrTex.destroyed).toBe(false);

    // Disabling camB immediately reclaims its persistent textures without touching camA
    camEntB.isActive = false;
    expect(ssrPassB._state).toBe(SSRState.Disabled);
    expect(getSSRRetainedBytes(ssrPassB)).toBe(0);
    expect(camB.shaderData.getTexture("camera_SSRTexture")).toBeNull();
    engine.update();
    expect(ssrPassA._state).toBe(SSRState.ActiveSteady);

    // Destroying camA mid-frame or post-frame cleans up textures without negative refCount
    const writtenIdx = ssrPassA._history.temporalPingPongIndex === 0 ? 1 : 0;
    const ssrTex = ssrPassA._resources.ssrPingPongTex[writtenIdx]! as Texture2D;
    const hiZTex = ssrPassA._resources.hiZTex[0]! as Texture2D;
    const prevNRTex = ssrPassA._resources.prevNormalRoughnessTex! as Texture2D;
    camA.shaderData.setTexture("camera_SSRTexture", ssrTex);

    camA.destroy();
    expect(ssrTex.destroyed).toBe(true);
    expect(hiZTex.destroyed).toBe(true);
    expect(prevNRTex.destroyed).toBe(true);
    expect(ssrTex._getReferCount()).toBe(0);
    expect(hiZTex._getReferCount()).toBe(0);
    expect(prevNRTex._getReferCount()).toBe(0);
    expect(drainGlErrors(gl)).toEqual([]);
  });

  it("scales VRAM monotonically across presets and performs zero Texture2D/RenderTarget allocations at steady state", async () => {
    const { engine, scene, gl } = await createTestEngine(1280, 720);
    createdEngines.push(engine);

    const root = scene.createRootEntity("root");
    const camEnt = root.createChild("cam");
    camEnt.transform.setPosition(0, 1.5, 4);
    camEnt.transform.lookAt(new Vector3(0, 0, 0));
    const cam = camEnt.addComponent(Camera);

    const floorMat = new PBRMaterial(engine);
    floorMat.roughness = 0.05;
    addPlane(engine, root, "floor", [0, 0, 0], 6, 6, floorMat);

    const ssr = sceneSSR(scene);
    ssr.enabled = true;
    const ssrPass = getSSRPass(cam);

    ssr.quality = ScreenSpaceReflectionQuality.Low;
    stepFrames(engine, 2);
    const lowBytes = getSSRRetainedBytes(ssrPass);

    ssr.quality = ScreenSpaceReflectionQuality.Medium;
    stepFrames(engine, 3);
    const medBytes = getSSRRetainedBytes(ssrPass);

    ssr.quality = ScreenSpaceReflectionQuality.High;
    stepFrames(engine, 3);
    const highBytes = getSSRRetainedBytes(ssrPass);

    expect(lowBytes).toBeGreaterThan(0);
    expect(lowBytes).toBeLessThan(medBytes);
    expect(medBytes).toBeLessThan(highBytes);
    expect(highBytes).toBeLessThan(48 * 1024 * 1024);

    // Steady-state frames must reuse persistent allocations cleanly
    const rhi = engine._hardwareRenderer;
    const texCreateSpy = vi.spyOn(rhi, "createPlatformTexture2D");
    const rtCreateSpy = vi.spyOn(rhi, "createPlatformRenderTarget");
    stepFrames(engine, 5);
    expect(texCreateSpy).not.toHaveBeenCalled();
    expect(rtCreateSpy).not.toHaveBeenCalled();
    expect(drainGlErrors(gl)).toEqual([]);
  });

  it("adds strictly zero MSAA resolves relative to SSR Off across PBR, opaqueTexture refraction, and HDR+PostProcess", async () => {
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

    const pp = root.createChild("pp").addComponent(PostProcess);
    pp.addEffect(BloomEffect).enabled = true;
    pp.addEffect(TonemappingEffect).enabled = true;

    const blitSpy = vi.spyOn(gl, "blitFramebuffer");
    const ssr = sceneSSR(scene);
    const measureSteadyResolves = (ssrOn: boolean): number => {
      ssr.enabled = ssrOn;
      stepFrames(engine, 3);
      blitSpy.mockClear();
      engine.update();
      return blitSpy.mock.calls.length;
    };

    cam.opaqueTextureEnabled = false;
    cam.enablePostProcess = false;
    cam.enableHDR = false;
    expect(measureSteadyResolves(true) - measureSteadyResolves(false)).toBe(0);

    cam.opaqueTextureEnabled = true;
    expect(measureSteadyResolves(true) - measureSteadyResolves(false)).toBe(0);

    cam.opaqueTextureEnabled = false;
    cam.enableHDR = true;
    cam.enablePostProcess = true;
    expect(measureSteadyResolves(true) - measureSteadyResolves(false)).toBe(0);
    expect(drainGlErrors(gl)).toEqual([]);
  });

  it("renders physically aligned floor reflections across presets, LDR/HDR, ClearCoat, Orthographic, and near-plane geometry", async () => {
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
    const floorEnt = addPlane(engine, root, "mirrorFloor", [0, 0, -0.8], 10, 10, floorMat);

    const wallMat = new PBRMaterial(engine);
    wallMat.baseColor = new Color(0.1, 0, 0, 1);
    wallMat.emissiveColor = new Color(4.0, 0, 0, 1);
    wallMat.screenSpaceReflectionIntensity = 0;
    addBox(engine, root, "redWall", [0, 1.85, -1.8], [3.2, 2.0, 0.4], wallMat);

    const ssr = sceneSSR(scene);
    ssr.enabled = false;
    stepFrames(engine, 3);
    const offFloor = sampleRegionRGB(tex, 0.35, 0.68, 0.65, 0.95);

    // Quality sweep: Medium (LDR/HDR parity), High (HDR), VeryHigh
    ssr.enabled = true;
    for (const quality of [
      ScreenSpaceReflectionQuality.Medium,
      ScreenSpaceReflectionQuality.High,
      ScreenSpaceReflectionQuality.VeryHigh
    ]) {
      ssr.quality = quality;
      cam.enableHDR = quality !== ScreenSpaceReflectionQuality.Medium;
      stepFrames(engine, 3);
      const refl = sampleRegionRGB(tex, 0.35, 0.68, 0.65, 0.95);
      expect(refl.maxR).toBeGreaterThan(offFloor.maxR + 60);
    }

    // Medium HDR Reinhard matches High HDR intensity parity on bright >1.0 emitters
    floorMat.baseColor = new Color(1, 1, 1, 1);
    floorMat.metallic = 1.0;
    floorMat.screenSpaceReflectionIntensity = 0.12;
    wallMat.emissiveColor = new Color(12.0, 0, 0, 1);
    cam.enableHDR = true;
    ssr.quality = ScreenSpaceReflectionQuality.Medium;
    stepFrames(engine, 3);
    const medHDR = sampleRegionRGB(tex, 0.35, 0.68, 0.65, 0.95);
    ssr.quality = ScreenSpaceReflectionQuality.High;
    stepFrames(engine, 3);
    const highHDR = sampleRegionRGB(tex, 0.35, 0.68, 0.65, 0.95);
    expect(medHDR.maxR).toBeGreaterThan(200);
    expect(Math.abs(medHDR.avgR - highHDR.avgR)).toBeLessThan(35);

    // Restore base floor for ClearCoat, opt-out, Ortho, and near-plane checks
    floorMat.baseColor = new Color(0.02, 0.02, 0.02, 1);
    floorMat.metallic = 0.0;
    floorMat.screenSpaceReflectionIntensity = 0;
    wallMat.emissiveColor = new Color(4.0, 0, 0, 1);
    stepFrames(engine, 2);
    expect(Math.abs(sampleRegionRGB(tex, 0.35, 0.68, 0.65, 0.95).avgR - offFloor.avgR)).toBeLessThan(3);

    // Clear Coat dominant lobe & base reverse lobe
    floorMat.screenSpaceReflectionIntensity = 1.0;
    floorMat.roughness = 0.85;
    floorMat.clearCoat = 1.0;
    floorMat.clearCoatRoughness = 0.03;
    stepFrames(engine, 3);
    expect(sampleRegionRGB(tex, 0.35, 0.68, 0.65, 0.95).maxR).toBeGreaterThan(offFloor.maxR + 30);

    floorMat.roughness = 0.03;
    floorMat.clearCoatRoughness = 0.85;
    stepFrames(engine, 3);
    expect(sampleRegionRGB(tex, 0.35, 0.68, 0.65, 0.95).maxR).toBeGreaterThan(offFloor.maxR + 30);

    // Orthographic mode
    floorMat.clearCoat = 0;
    cam.isOrthographic = true;
    cam.orthographicSize = 2.5;
    stepFrames(engine, 3);
    expect(sampleRegionRGB(tex, 0.35, 0.68, 0.65, 0.95).zeroBlackPixels).toBeLessThan(
      sampleRegionRGB(tex, 0.35, 0.68, 0.65, 0.95).count
    );

    // Near-plane straddling + sky-only buffer zeroing
    cam.isOrthographic = false;
    ssr.quality = ScreenSpaceReflectionQuality.Medium;
    camEnt.transform.setPosition(0, 0.5, 2.5);
    camEnt.transform.lookAt(new Vector3(0, 0.35, -1.2));
    cam.nearClipPlane = 0.5;
    floorEnt.transform.setPosition(0, 0, 1.5);
    expect(sampleRegionRGB(tex, 0.35, 0.72, 0.65, 0.96)).toBeDefined();
    stepFrames(engine, 3);
    expect(sampleRegionRGB(tex, 0.35, 0.72, 0.65, 0.96).maxR).toBeGreaterThan(60);

    camEnt.transform.setPosition(0, 4.0, 20.0);
    camEnt.transform.lookAt(new Vector3(0, 4.0, 30.0));
    stepFrames(engine, 2);
    const outTex = getActiveSSROutputTexture(getSSRPass(cam));
    const emptyBuf = new Uint8Array(outTex.width * outTex.height * 4);
    outTex.getPixelBuffer(0, 0, outTex.width, outTex.height, 0, emptyBuf);
    expect(emptyBuf.every((v) => v === 0)).toBe(true);
    expect(drainGlErrors(gl)).toEqual([]);

    rt.destroy(true);
    tex.destroy(true);
  });

  it("maintains hole-free diagonal reflections under VeryHigh, recovers background behind thin occluders, and handles short-ray linear contact", async () => {
    // 1. High-res diagonal pillar continuity under VeryHigh
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
    addPlane(engine, root, "mirrorFloor", [0, 0, -1], 14, 14, floorMat);

    const pillarMat = new PBRMaterial(engine);
    pillarMat.emissiveColor = new Color(4.0, 0, 0, 1);
    pillarMat.screenSpaceReflectionIntensity = 0;
    addBox(engine, root, "tallPillar", [-0.6, 1.8, -2.2], [1.0, 3.6, 1.0], pillarMat);

    const ssr = sceneSSR(scene);
    ssr.enabled = false;
    stepFrames(engine, 2);
    const offPixels = new Uint8Array(W * H * 4);
    tex.getPixelBuffer(0, 0, W, H, 0, offPixels);

    ssr.enabled = true;
    ssr.quality = ScreenSpaceReflectionQuality.VeryHigh;
    stepFrames(engine, 5);
    const frameAPixels = new Uint8Array(W * H * 4);
    tex.getPixelBuffer(0, 0, W, H, 0, frameAPixels);
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
        if (offPixels[idx] > 10) continue;
        diffSum += Math.abs(frameAPixels[idx] - frameBPixels[idx]);
        diffCount++;
        if (frameAPixels[idx] > 80) {
          if (firstRedX === -1) firstRedX = x;
          lastRedX = x;
          redCount++;
        }
      }
      if (redCount >= 16) {
        totalReflectedRows++;
        let gaps = 0;
        for (let x = firstRedX + 2; x <= lastRedX - 2; x++) {
          const idx = (y * W + x) * 4;
          if (offPixels[idx] <= 10 && frameAPixels[idx] < 40) gaps++;
        }
        if (gaps === 0) reflectedRowsWithZeroGaps++;
      }
    }
    expect(totalReflectedRows).toBeGreaterThan(80);
    expect(reflectedRowsWithZeroGaps).toBe(totalReflectedRows);
    expect(diffSum / Math.max(diffCount, 1)).toBeLessThan(1.5);

    // 2. Thin foreground branch lattice escape (High Hi-Z) + mid-ground preservation
    root.clearChildren();
    const escapeCam = root.createChild("cam2").addComponent(Camera);
    escapeCam.entity.transform.setPosition(0, 2.2, 2);
    escapeCam.entity.transform.lookAt(new Vector3(0, 0.4, -18));
    escapeCam.fieldOfView = 50;
    escapeCam.renderTarget = rt;

    const lakeMat = new PBRMaterial(engine);
    lakeMat.baseColor = new Color(0.5, 0.5, 0.5, 1);
    lakeMat.metallic = 0.85;
    lakeMat.roughness = 0.02;
    addPlane(engine, root, "lake", [0, 0, -13], 30, 24, lakeMat);

    const cliffMat = new UnlitMaterial(engine);
    cliffMat.baseColor = new Color(0, 1, 0, 1);
    addBox(engine, root, "cliff", [0, 7, -17], [30, 16, 0.5], cliffMat);

    const twigMat = new UnlitMaterial(engine);
    twigMat.baseColor = new Color(0.06, 0.04, 0.02, 1);
    for (let i = 0; i < 6; i++) {
      addBox(engine, root, `twig_${i}`, [0, 1.4 + i * 0.5, -1.5], [16, 0.03, 0.03], twigMat);
    }
    const midBoxMat = new UnlitMaterial(engine);
    midBoxMat.baseColor = new Color(1, 0, 0, 1);
    addBox(engine, root, "midBox", [-2.2, 0.8, -8], [1.6, 1.8, 0.8], midBoxMat);

    ssr.quality = ScreenSpaceReflectionQuality.High;
    stepFrames(engine, 4);
    const px = new Uint8Array(W * H * 4);
    tex.getPixelBuffer(0, 0, W, H, 0, px);
    let behindHits = 0;
    let behindTotal = 0;
    let redHits = 0;
    for (let y = Math.floor(H * 0.58); y < Math.floor(H * 0.72); y++) {
      for (let x = Math.floor(W * 0.4); x < Math.floor(W * 0.75); x++) {
        const idx = (y * W + x) * 4;
        behindTotal++;
        if (px[idx + 1] > 140) behindHits++;
      }
    }
    for (let y = Math.floor(H * 0.5); y < Math.floor(H * 0.9); y++) {
      for (let x = 0; x < Math.floor(W * 0.45); x++) {
        const idx = (y * W + x) * 4;
        if (px[idx] > 140 && px[idx + 1] < 60) redHits++;
      }
    }
    expect(behindHits / behindTotal).toBeGreaterThan(0.55);
    expect(redHits).toBeGreaterThan(200);

    // 3. Linear short-ray first-step contact reflection
    root.clearChildren();
    const shortCam = root.createChild("shortCam").addComponent(Camera);
    shortCam.entity.transform.setPosition(0, 0.9, 1.8);
    shortCam.entity.transform.lookAt(new Vector3(0, 0.1, -0.5));
    shortCam.renderTarget = rt;
    addPlane(engine, root, "shortFloor", [0, 0, -0.4], 4, 4, lakeMat);
    const shortWallMat = new PBRMaterial(engine);
    shortWallMat.emissiveColor = new Color(4, 0, 0, 1);
    shortWallMat.screenSpaceReflectionIntensity = 0;
    addBox(engine, root, "shortRed", [0, 0.45, -0.65], [1.4, 0.9, 0.25], shortWallMat);
    ssr.quality = ScreenSpaceReflectionQuality.Medium;
    stepFrames(engine, 3);
    expect(sampleRegionRGB(tex, 0.35, 0.62, 0.65, 0.88).maxR).toBeGreaterThan(80);
    expect(drainGlErrors(gl)).toEqual([]);

    rt.destroy(true);
    tex.destroy(true);
  });

  it("captures opaque, alphaCutoff, Unlit, instanced, and custom DepthNormals contributors deterministically with PrePass and SAO", async () => {
    const { engine, scene, gl } = await createTestEngine(160, 120, true);
    createdEngines.push(engine);

    const root = scene.createRootEntity("root");
    const camEnt = scene.createRootEntity("camRoot").createChild("cam");
    camEnt.transform.setPosition(0, 0, 6);
    camEnt.transform.lookAt(new Vector3(0, 0, 0));
    const cam = camEnt.addComponent(Camera);
    cam.depthTextureMode = DepthTextureMode.PrePass;

    const customRecvShader = Shader.create(`Shader "Test/CustomDepthNormalsOrder" {
      SubShader "Default" {
        UsePass "Pipeline/DepthOnly/Default/DepthOnly"
        Pass "Forward" {
          Tags { pipelineStage = "Forward" }
          VertexShader = fVert; FragmentShader = fFrag;
          #include "ShaderLibrary/Common/Transform.glsl"
          #include "ShaderLibrary/Common/Attributes.glsl"
          void fVert(Attributes a) { gl_Position = renderer_MVPMat * vec4(a.POSITION, 1.0); }
          void fFrag() { gl_FragColor = vec4(1.0); }
        }
        Pass "DepthNormals" {
          Tags { pipelineStage = "DepthNormals" }
          DepthState = { Enabled = true; WriteEnabled = true; CompareFunction = CompareFunction.LessEqual; }
          BlendState = { Enabled = false; }
          VertexShader = rVert; FragmentShader = rFrag;
          #include "ShaderLibrary/Common/Common.glsl"
          #include "ShaderLibrary/Common/Transform.glsl"
          #include "ShaderLibrary/Common/Attributes.glsl"
          #include "ShaderLibrary/Pipeline/DepthNormalsCommon.glsl"
          void rVert(Attributes a) { gl_Position = renderer_MVPMat * vec4(a.POSITION, 1.0); }
          void rFrag() { gl_FragColor = packDepthNormals(vec3(0.0, 0.0, 1.0), 0.05); }
        }
      }
    }`);

    const mat = new Material(engine, customRecvShader);
    const farMR = addBox(engine, root, "farRecv", [0, 0, -2], [10, 10, 0.1], mat).getComponent(MeshRenderer)!;
    const nearMR = addBox(engine, root, "nearRecv", [0, 0, 2], [2.2, 2.2, 0.1], mat).getComponent(MeshRenderer)!;

    // Unlit + alphaCutoff + instanced edge occluder
    const unlitMat = new UnlitMaterial(engine);
    const unlitEnt = addBox(engine, root, "unlitOcc", [0, 0, 0], [1, 1, 0.2], unlitMat);
    const alphaMat = new PBRMaterial(engine);
    alphaMat.alphaCutoff = 0.5;
    alphaMat.baseColor = new Color(0, 1, 1, 0.85);
    alphaMat.screenSpaceReflectionIntensity = 0;
    const alphaEnt = addBox(engine, root, "alphaOcc", [0, 0, 1], [1, 1, 0.2], alphaMat);

    const instMat = new PBRMaterial(engine);
    instMat.enableInstancing = true;
    instMat.screenSpaceReflectionIntensity = 0;
    const sharedBox = PrimitiveMesh.createCuboid(engine, 1.0, 1.0, 0.2);
    for (const [name, x] of [
      ["instCenter", 0],
      ["instEdge", 3.5]
    ] as const) {
      const e = root.createChild(name);
      e.transform.setPosition(x, 0, -1);
      const mr = e.addComponent(MeshRenderer);
      mr.mesh = sharedBox;
      mr.setMaterial(instMat);
    }

    const ssr = sceneSSR(scene);
    ssr.enabled = true;
    ssr.quality = ScreenSpaceReflectionQuality.Medium;
    scene.ambientOcclusion.enabled = true;
    const ssrPass = getSSRPass(cam);

    const readDepth = (): Float32Array => {
      stepFrames(engine, 3);
      const depthTex = ssrPass._resources.hiZTex[1 - ssrPass._history.hiZPingPongIndex]!;
      return readSSRDepthBuffer(depthTex, ssrPass._caps.usesPackedDepthRG8, cam.farClipPlane);
    };

    farMR.priority = 1;
    nearMR.priority = 0;
    const d1 = readDepth();
    farMR.priority = 0;
    nearMR.priority = 1;
    const d2 = readDepth();
    let maxDiff = 0;
    for (let i = 0; i < d1.length; i++) {
      maxDiff = Math.max(maxDiff, Math.abs(d1[i] - d2[i]));
    }
    expect(maxDiff).toBeLessThan(0.05);

    // Removing alphaOcc and unlitOcc leaves instCenter (~6.90m) at center and farRecv (~7.95m) off-center
    alphaEnt.isActive = false;
    unlitEnt.isActive = false;
    nearMR.entity.isActive = false;
    const dFar = readDepth();
    const hiZW = ssrPass._resources.hiZTex[0]!.width;
    const cx = Math.floor(hiZW * 0.5);
    const cy = Math.floor(ssrPass._resources.hiZTex[0]!.height * 0.5);
    expect(dFar[cy * hiZW + cx]).toBeCloseTo(6.9, 1);
    expect(dFar[cy * hiZW + Math.floor(hiZW * 0.25)]).toBeCloseTo(7.95, 1);

    // Large-scene far depth (farClip=10000, z=-6000) is not treated as sky
    root.clearChildren();
    cam.farClipPlane = 10000;
    camEnt.transform.setPosition(0, 80, 0);
    camEnt.transform.lookAt(new Vector3(0, 0, -6000));
    const farFloorMat = new PBRMaterial(engine);
    farFloorMat.roughness = 0.02;
    addPlane(engine, root, "farFloor", [0, 0, -3000], 4000, 8000, farFloorMat);
    stepFrames(engine, 3);
    const farDepths = readSSRDepthBuffer(
      ssrPass._resources.hiZTex[1 - ssrPass._history.hiZPingPongIndex]!,
      ssrPass._caps.usesPackedDepthRG8,
      cam.farClipPlane
    );
    let minFar = Infinity;
    for (let i = 0; i < farDepths.length; i++) {
      if (farDepths[i] > 100 && farDepths[i] < minFar) minFar = farDepths[i];
    }
    expect(minFar).toBeLessThan(7500);
    expect(drainGlErrors(gl)).toEqual([]);

    sharedBox.destroy();
    mat.destroy();
    customRecvShader.destroy(true);
  });

  it("excludes transparent and matte surfaces from DepthNormals/SSR while letting background reflections show through semi-transparent layers", async () => {
    const { engine, scene, gl } = await createTestEngine(160, 120);
    createdEngines.push(engine);

    const { rt, tex } = createReadbackRT(engine, 160, 120);
    const root = scene.createRootEntity("root");
    const camEnt = root.createChild("cam");
    camEnt.transform.setPosition(0, 1.4, 3.6);
    camEnt.transform.lookAt(new Vector3(0, 0.2, -1.2));
    const cam = camEnt.addComponent(Camera);
    cam.renderTarget = rt;

    const beaconMat = new UnlitMaterial(engine);
    beaconMat.baseColor = new Color(0, 4, 0, 1);
    addBox(engine, root, "greenBeacon", [0, 1.2, -1.8], [3.2, 2.0, 0.3], beaconMat);

    const floorMat = new PBRMaterial(engine);
    floorMat.baseColor = new Color(0.02, 0.02, 0.02, 1);
    floorMat.metallic = 1.0;
    floorMat.roughness = 0.02;
    addPlane(engine, root, "floor", [0, 0, -0.4], 8, 8, floorMat);

    // Nearly opaque transparent PBR cover over glossy floor must fall back to IBL instead of copying floor SSR
    const opaqueCoverGlassMat = new PBRMaterial(engine);
    opaqueCoverGlassMat.isTransparent = true;
    opaqueCoverGlassMat.baseColor = new Color(0, 0, 0, 0.96);
    opaqueCoverGlassMat.roughness = 0.02;
    const opaqueCoverGlass = addBox(
      engine,
      root,
      "opaqueCoverGlass",
      [1.1, 0.05, -0.3],
      [1.8, 0.08, 3.0],
      opaqueCoverGlassMat
    );

    // Semi-transparent water over glossy floor preserves underlying reflection while opaque matte overlay cuts it off
    const ssr = sceneSSR(scene);
    ssr.enabled = true;
    ssr.quality = ScreenSpaceReflectionQuality.Medium;
    stepFrames(engine, 3);

    expect(sampleRegionRGB(tex, 0.25, 0.65, 0.42, 0.85).maxG).toBeGreaterThan(60);
    expect(sampleRegionRGB(tex, 0.6, 0.65, 0.8, 0.85).maxG).toBeLessThan(20);

    opaqueCoverGlass.destroy();
    const waterMat = new PBRMaterial(engine);
    waterMat.isTransparent = true;
    waterMat.baseColor = new Color(0.02, 0.05, 0.08, 0.25);
    waterMat.roughness = 0.58;
    const water = addPlane(engine, root, "water", [1.8, 0.3, 0.0], 3.2, 6.0, waterMat);
    stepFrames(engine, 3);
    expect(sampleRegionRGB(tex, 0.62, 0.72, 0.8, 0.92).maxG).toBeGreaterThan(40);

    water.destroy();
    const matteMat = new PBRMaterial(engine);
    matteMat.baseColor = new Color(0.02, 0.05, 0.08, 1.0);
    matteMat.roughness = 0.95;
    addPlane(engine, root, "matteCover", [1.8, 0.05, 0.0], 3.2, 6.0, matteMat);
    stepFrames(engine, 3);
    expect(sampleRegionRGB(tex, 0.62, 0.72, 0.8, 0.92).maxG).toBeLessThan(20);

    // Zero-alpha alphaCutoff & Transmission depth inclusion check
    root.clearChildren();
    const dCam = root.createChild("dCam").addComponent(Camera);
    dCam.entity.transform.setPosition(0, 0, 6);
    dCam.entity.transform.lookAt(new Vector3(0, 0, 0));
    addPlane(engine, root, "rear", [0, 0, 0], 8, 8, floorMat).transform.setRotation(90, 0, 0);
    const zeroAlphaMat = new PBRMaterial(engine);
    zeroAlphaMat.alphaCutoff = 0.5;
    zeroAlphaMat.baseTexture = createSolidRGBA8Tex(engine, 255, 0, 0, 0);
    const zEnt = addPlane(engine, root, "zeroAlpha", [0, 0, 2], 4, 4, zeroAlphaMat);
    zEnt.transform.setRotation(90, 0, 0);
    stepFrames(engine, 3);
    const dPass = getSSRPass(dCam);
    const dTex = dPass._resources.hiZTex[1 - dPass._history.hiZPingPongIndex]!;
    const depths = readSSRDepthBuffer(dTex, dPass._caps.usesPackedDepthRG8, dCam.farClipPlane);
    expect(depths[Math.floor(dTex.height / 2) * dTex.width + Math.floor(dTex.width / 2)]).toBeCloseTo(6.0, 1);

    zeroAlphaMat.alphaCutoff = 0;
    zeroAlphaMat.ior = 1.5;
    zeroAlphaMat.transmission = 0.8;
    stepFrames(engine, 3);
    const dTex2 = dPass._resources.hiZTex[1 - dPass._history.hiZPingPongIndex]!;
    const depths2 = readSSRDepthBuffer(dTex2, dPass._caps.usesPackedDepthRG8, dCam.farClipPlane);
    expect(depths2[Math.floor(dTex2.height / 2) * dTex2.width + Math.floor(dTex2.width / 2)]).toBeCloseTo(4.0, 1);
    expect(drainGlErrors(gl)).toEqual([]);

    rt.destroy(true);
    tex.destroy(true);
  });

  it("supports sampleScreenSpaceReflectionRaw helper in custom shaders and evaluates fwidth uniformly", async () => {
    const { engine, scene, gl } = await createTestEngine(160, 120, true);
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

    const rawSSRShader = Shader.create(`Shader "Test/SampleSSRRawHelper" {
      SubShader "Default" {
        Pass "DepthNormals" {
          Tags { pipelineStage = "DepthNormals" }
          DepthState = { Enabled = true; WriteEnabled = true; CompareFunction = CompareFunction.LessEqual; }
          BlendState = { Enabled = false; }
          VertexShader = rVert; FragmentShader = rFrag;
          #include "ShaderLibrary/Common/Common.glsl"
          #include "ShaderLibrary/Common/Transform.glsl"
          #include "ShaderLibrary/Common/Attributes.glsl"
          #include "ShaderLibrary/Pipeline/DepthNormalsCommon.glsl"
          float material_Roughness;
          void rVert(Attributes attr) { gl_Position = renderer_MVPMat * vec4(attr.POSITION, 1.0); }
          void rFrag() { gl_FragColor = packDepthNormals(vec3(0.0, 1.0, 0.0), material_Roughness); }
        }
        Pass "Forward" {
          Tags { pipelineStage = "Forward" }
          VertexShader = fVert; FragmentShader = fFrag;
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
              float fragEyeDepth;
              float depthSlope;
              getSSRFragmentDepth(fragEyeDepth, depthSlope);
              vec4 raw = sampleScreenSpaceReflectionRawWithDepth(v.positionCS, vec3(0.0, 1.0, 0.0), material_Roughness, fragEyeDepth, depthSlope);
              color = env * (1.0 - raw.a) + raw.rgb;
            #endif
            gl_FragColor = vec4(color, 1.0);
          }
        }
      }
    }`);

    const wallMat = new PBRMaterial(engine);
    wallMat.emissiveColor = new Color(4.0, 0, 0, 1);
    wallMat.screenSpaceReflectionIntensity = 0;
    addBox(engine, root, "redWall", [0, 1.85, -1.8], [3.2, 2.0, 0.4], wallMat);

    const floorMat = new Material(engine, rawSSRShader);
    floorMat.shaderData.setFloat("material_ScreenSpaceReflectionIntensity", 1.0);
    floorMat.shaderData.setFloat("material_Roughness", 0.03);
    addPlane(engine, root, "rawFloor", [0, 0, -0.8], 10, 10, floorMat);

    // Varying roughness/ClearCoat PBR mesh alongside transparent mesh verifies uniform fwidth execution
    const varyingRoughTex = new Texture2D(engine, 4, 4, TextureFormat.R8G8B8A8_UNorm, false, false);
    const roughBytes = new Uint8Array(4 * 4 * 4);
    for (let i = 0; i < 16; i++) {
      roughBytes[i * 4] = i % 2 === 0 ? 10 : 240;
      roughBytes[i * 4 + 1] = i % 2 === 0 ? 10 : 240;
      roughBytes[i * 4 + 3] = 255;
    }
    varyingRoughTex.setPixelBuffer(roughBytes);
    const mixedPBR = new PBRMaterial(engine);
    mixedPBR.roughness = 1.0;
    mixedPBR.roughnessMetallicTexture = varyingRoughTex;
    mixedPBR.clearCoat = 1.0;
    mixedPBR.clearCoatTexture = varyingRoughTex;
    mixedPBR.clearCoatRoughness = 0.05;
    addBox(engine, root, "mixedPBR", [-2.2, 0.5, -0.8], [1, 1, 1], mixedPBR);

    const ssr = sceneSSR(scene);
    ssr.enabled = true;
    for (const quality of [ScreenSpaceReflectionQuality.Medium, ScreenSpaceReflectionQuality.High]) {
      ssr.quality = quality;
      stepFrames(engine, 3);
      expect(sampleRegionRGB(tex, 0.35, 0.68, 0.65, 0.95).maxR).toBeGreaterThan(80);
    }

    floorMat.shaderData.setFloat("material_ScreenSpaceReflectionIntensity", 0);
    stepFrames(engine, 2);
    const optedOut = sampleRegionRGB(tex, 0.35, 0.68, 0.65, 0.95);
    expect(optedOut.maxR).toBeLessThan(5);
    expect(optedOut.avgB).toBeGreaterThan(40);
    expect(drainGlErrors(gl)).toEqual([]);

    varyingRoughTex.destroy(true);
    floorMat.destroy(true);
    rawSSRShader.destroy(true);
    rt.destroy(true);
    tex.destroy(true);
  });

  it("handles Depth24-only and RG8/OCT8 packed fallbacks, HDR NaN sanitization, farClip>65K sentinel, and edgeFade quantization", async () => {
    const { engine, scene, gl } = await createTestEngine(160, 120, true);
    createdEngines.push(engine);

    const { rt, tex } = createReadbackRT(engine, 160, 120);
    const root = scene.createRootEntity("root");
    const camEnt = root.createChild("cam");
    camEnt.transform.setPosition(0, 1.35, 3.6);
    camEnt.transform.lookAt(new Vector3(0, 0.35, -1.2));
    const cam = camEnt.addComponent(Camera);
    cam.nearClipPlane = 0.2;
    cam.farClipPlane = 100000;
    cam.renderTarget = rt;

    const floorMat = new PBRMaterial(engine);
    floorMat.baseColor = new Color(1, 1, 1, 1);
    floorMat.metallic = 1.0;
    floorMat.roughness = 0.02;
    addPlane(engine, root, "mirrorFloor", [0, 0, -0.8], 10, 10, floorMat);

    const wallMat = new PBRMaterial(engine);
    wallMat.emissiveColor = new Color(12.0, 0, 0, 1);
    wallMat.screenSpaceReflectionIntensity = 0;
    const wall = addBox(engine, root, "hdrWideWall", [0, 1.85, -1.8], [8.0, 2.0, 0.4], wallMat);

    const ssr = sceneSSR(scene);
    ssr.enabled = true;
    ssr.quality = ScreenSpaceReflectionQuality.Medium;
    cam.enableHDR = true;
    ssr.edgeFade = 0.45;

    // 1. Packed RG8/OCT8 + Depth24 fallback + HDR Reinhard anti-quantization check near edgeFade
    const depthMock = mockDepthOnly(engine);
    const packedMock = mockPackedFormats(engine);
    stepFrames(engine, 3);
    const ssrPass = getSSRPass(cam);
    expect(ssrPass._caps.usesPackedDepthRG8).toBe(true);
    expect(ssrPass._caps.usesPackedNormalOct8).toBe(true);
    expect(sampleRegionRGB(tex, 0.35, 0.68, 0.65, 0.95).maxR).toBeGreaterThan(60);

    const ssrOutTex = getActiveSSROutputTexture(ssrPass);
    const ssrBuf = new Uint8Array(ssrOutTex.width * ssrOutTex.height * 4);
    ssrOutTex.getPixelBuffer(0, 0, ssrOutTex.width, ssrOutTex.height, 0, ssrBuf);
    let lowConfCount = 0;
    let maxLowConfDecodedR = 0;
    for (let i = 0; i < ssrBuf.length; i += 4) {
      const a = ssrBuf[i + 3];
      if (a > 0 && a <= 12) {
        lowConfCount++;
        const enc = Math.min(ssrBuf[i] / 255, 253 / 255);
        maxLowConfDecodedR = Math.max(maxLowConfDecodedR, enc / Math.max(1 - enc, 2 / 255));
      }
    }
    expect(lowConfCount).toBeGreaterThan(0);
    expect(maxLowConfDecodedR).toBeLessThanOrEqual(1.0);
    packedMock.mockRestore();
    depthMock.mockRestore();

    // 2. HDR NaN sanitization in ColorPyramidPrefilter under High
    ssr.quality = ScreenSpaceReflectionQuality.High;
    const nanShader = Shader.create(`Shader "Test/HDRNanEmitter" {
      SubShader "Default" {
        Pass "Forward" {
          Tags { pipelineStage = "Forward" }
          VertexShader = vert; FragmentShader = frag;
          #include "ShaderLibrary/Common/Common.glsl"
          #include "ShaderLibrary/Common/Transform.glsl"
          #include "ShaderLibrary/Common/Attributes.glsl"
          float material_NegInput;
          void vert(Attributes attr) { gl_Position = renderer_MVPMat * vec4(attr.POSITION, 1.0); }
          void frag() { float n = sqrt(material_NegInput); gl_FragColor = vec4(n, n, n, 1.0); }
        }
      }
    }`);
    const nanMat = new Material(engine, nanShader);
    nanMat.shaderData.setFloat("material_NegInput", -1.0);
    wall.isActive = false;
    const nanWall = addBox(engine, root, "nanWall", [0, 1.85, -1.8], [3.2, 2.0, 0.4], nanMat);
    stepFrames(engine, 3);
    const pyrTex = ssrPass._resources.prevColorPyramidTex! as Texture2D;
    const isByte = pyrTex.format === TextureFormat.R8G8B8A8_UNorm;
    const pyrBuf = isByte
      ? new Uint8Array(pyrTex.width * pyrTex.height * 4)
      : new Float32Array(pyrTex.width * pyrTex.height * 4);
    pyrTex.getPixelBuffer(0, 0, pyrTex.width, pyrTex.height, 0, pyrBuf);
    for (let i = 0; i < pyrBuf.length; i += 4) {
      expect(Number.isFinite(pyrBuf[i])).toBe(true);
      expect(Number.isFinite(pyrBuf[i + 1])).toBe(true);
      expect(Number.isFinite(pyrBuf[i + 2])).toBe(true);
    }

    // 3. farClip=100000 sky background does not falsely match scene reflection
    nanWall.destroy();
    nanMat.destroy();
    nanShader.destroy(true);
    cam.enableHDR = false;
    scene.background.solidColor.set(0, 0, 1, 1);
    cam._invalidateRenderHistory();
    stepFrames(engine, 4);
    expect(sampleRegionRGB(tex, 0.35, 0.68, 0.65, 0.95).maxB).toBeLessThan(15);
    expect(drainGlErrors(gl)).toEqual([]);

    rt.destroy(true);
    tex.destroy(true);
  });

  it("scopes SSR macros per pass without cross-quality variant bloat and toggles Forward bilateral/1:1 variants", async () => {
    const { engine, scene, gl } = await createTestEngine(160, 120);
    createdEngines.push(engine);

    const { rt, tex } = createReadbackRT(engine, 160, 120);
    const root = scene.createRootEntity("root");
    const camEnt = root.createChild("cam");
    camEnt.transform.setPosition(0, 1.35, 3.6);
    camEnt.transform.lookAt(new Vector3(0, 0.35, -1.2));
    const cam = camEnt.addComponent(Camera);
    cam.renderTarget = rt;

    const beaconMat = new UnlitMaterial(engine);
    beaconMat.baseColor = new Color(0, 4, 0, 1);
    addBox(engine, root, "greenBeacon", [0, 1.2, -1.8], [3.2, 2.0, 0.3], beaconMat);

    const floorMat = new PBRMaterial(engine);
    floorMat.baseColor = new Color(0.02, 0.02, 0.02, 1);
    floorMat.metallic = 1.0;
    floorMat.roughness = 0.02;
    addPlane(engine, root, "floor", [0, 0, -0.4], 6, 6, floorMat);

    const pbrForwardPass = Shader.find("PBR")!.subShaders[0].passes.find(
      (p) => p.getTagValue("pipelineStage") === "Forward"
    )!;
    const origGetProgram = pbrForwardPass._getShaderProgram.bind(pbrForwardPass);
    const bilateralMacro = ShaderMacro.getByName("CAMERA_SSR_BILATERAL_SAMPLE");
    const enableMacro = ShaderMacro.getByName("CAMERA_ENABLE_SSR");
    const forwardVariants: Array<{ bilateral: boolean; units: number }> = [];
    const pbrSpy = vi.spyOn(pbrForwardPass, "_getShaderProgram").mockImplementation((eng, macros) => {
      const prog = origGetProgram(eng, macros);
      if (macros.isEnable(enableMacro) && prog.isValid) {
        forwardVariants.push({ bilateral: macros.isEnable(bilateralMacro), units: (prog as any)._activeTextureUint });
      }
      return prog;
    });

    const ssr = sceneSSR(scene);
    const pass = getSSRPass(cam);
    const passes = (pass._material.shader.subShaders[0] as any).passes as any[];
    const compileSpies = new Map<string, ReturnType<typeof vi.spyOn>>();
    for (const p of passes) {
      compileSpies.set(p.name, vi.spyOn(p, "_compileShaderProgram"));
    }

    ssr.enabled = true;
    for (const q of [
      ScreenSpaceReflectionQuality.Low,
      ScreenSpaceReflectionQuality.Medium,
      ScreenSpaceReflectionQuality.High,
      ScreenSpaceReflectionQuality.VeryHigh
    ]) {
      ssr.quality = q;
      stepFrames(engine, 3);
      const matMacros = pass._material.shaderData._macroCollection;
      expect(matMacros.isEnable(ShaderMacro.getByName("SSR_PACKED_DEPTH_RG8"))).toBe(false);
      expect(matMacros.isEnable(ShaderMacro.getByName("CAMERA_DEPTH_NORMALS_PACKED_OCT8"))).toBe(false);
      expect(matMacros.isEnable(ShaderMacro.getByName("SSR_PACKED_HDR_REINHARD"))).toBe(false);
    }

    // Minimal variants per SSR helper pass + High bilateral uses more texture units than VeryHigh 1:1
    expect(compileSpies.get("CopyTexture")!.mock.calls.length).toBeLessThanOrEqual(1);
    expect(compileSpies.get("BuildHiZMipN")!.mock.calls.length).toBeLessThanOrEqual(2);
    expect(compileSpies.get("ColorPyramidPrefilter")!.mock.calls.length).toBeLessThanOrEqual(2);
    expect(compileSpies.get("ColorPyramidDownsample")!.mock.calls.length).toBeLessThanOrEqual(2);
    const highUnits = forwardVariants.find((v) => v.bilateral)!.units;
    const directUnits = forwardVariants.find((v) => !v.bilateral)!.units;
    expect(directUnits).toBeLessThan(highUnits);

    // Re-visiting every quality hits cached programs (0 new compilations)
    for (const spy of compileSpies.values()) spy.mockClear();
    for (const q of [
      ScreenSpaceReflectionQuality.Low,
      ScreenSpaceReflectionQuality.Medium,
      ScreenSpaceReflectionQuality.High,
      ScreenSpaceReflectionQuality.VeryHigh
    ]) {
      ssr.quality = q;
      stepFrames(engine, 3);
    }
    expect(compileSpies.get("CopyTexture")!.mock.calls.length).toBe(0);
    expect(compileSpies.get("BuildHiZMipN")!.mock.calls.length).toBe(0);
    expect(compileSpies.get("ColorPyramidPrefilter")!.mock.calls.length).toBe(0);
    expect(compileSpies.get("ColorPyramidDownsample")!.mock.calls.length).toBe(0);
    expect(sampleRegionRGB(tex, 0.25, 0.65, 0.42, 0.85).maxG).toBeGreaterThan(60);
    expect(drainGlErrors(gl)).toEqual([]);

    pbrSpy.mockRestore();
    for (const spy of compileSpies.values()) spy.mockRestore();
    rt.destroy(true);
    tex.destroy(true);
  });

  it("builds conservative min-depth Hi-Z pyramids across odd, rectangular, and narrow fractional viewports", async () => {
    const { engine, scene, gl } = await createTestEngine(64, 64);
    createdEngines.push(engine);

    const root = scene.createRootEntity("root");
    const camEnt = root.createChild("cam");
    const camera = camEnt.addComponent(Camera);
    camera.farClipPlane = 100;
    camera.isOrthographic = true;
    camera.orthographicSize = 1;
    camera.depthTextureMode = DepthTextureMode.PrePass;

    const mat = new PBRMaterial(engine);
    mat.roughness = 0.05;
    addBox(engine, root, "receiver", [0, 0, -3], [4, 4, 1], mat);

    const ssr = sceneSSR(scene);
    ssr.enabled = true;
    ssr.quality = ScreenSpaceReflectionQuality.VeryHigh;

    // 1. Rectangular & short-edge mip completeness
    for (const [width, height, lastMip] of [
      [3, 5, 1],
      [1, 4, 0],
      [2, 100, 1],
      [16, 64, 4],
      [17, 9, 3]
    ]) {
      const { rt, tex } = createReadbackRT(engine, width, height);
      camera.renderTarget = rt;
      stepFrames(engine, 3);
      const pass = getSSRPass(camera);
      expect(isSSRActiveForCamera(camera)).toBe(true);
      expect(pass._frame.maxHiZMip).toBe(lastMip);
      const depth = pass._resources.hiZTex[1 - pass._history.hiZPingPongIndex];
      for (let mip = 0; mip <= lastMip; mip++) {
        for (const v of readSSRDepthBuffer(depth, pass._caps.usesPackedDepthRG8, camera.farClipPlane, mip)) {
          expect(v).toBeCloseTo(2.5, 1);
        }
      }
      camera.renderTarget = null;
      rt.destroy(true);
      tex.destroy(true);
    }

    // 2. Conservative odd-sized BuildHiZMipN reduction ([40,40,2,40,40] -> [2,2])
    stepFrames(engine, 2);
    const ssrPass = getSSRPass(camera);
    const material = ssrPass._material;
    const packed = ssrPass._caps.usesPackedDepthRG8;
    const format = ssrPass._caps.depthColorFormat;

    const runMipN = (srcValues: number[], dstW: number): Float32Array => {
      const srcTex = new Texture2D(engine, srcValues.length, 1, format, false, false);
      srcTex.filterMode = TextureFilterMode.Point;
      srcTex.wrapModeU = TextureWrapMode.Clamp;
      srcTex.wrapModeV = TextureWrapMode.Clamp;
      if (packed) {
        const ch = format === TextureFormat.R8G8_UNorm ? 2 : 4;
        const bytes = new Uint8Array(srcValues.length * ch);
        for (let i = 0; i < srcValues.length; i++) {
          const enc = Math.round(Math.sqrt(Math.max(0, Math.min(1, srcValues[i] / 100))) * 65535);
          bytes[i * ch] = (enc >> 8) & 0xff;
          bytes[i * ch + 1] = enc & 0xff;
          if (ch === 4) bytes[i * 4 + 3] = 255;
        }
        srcTex.setPixelBuffer(bytes);
      } else {
        srcTex.setPixelBuffer(new Uint16Array(srcValues.map(encodeHalfFloat)));
      }
      const dstTex = new Texture2D(engine, dstW, 1, format, false, false);
      dstTex.filterMode = TextureFilterMode.Point;
      const dstRT = new RenderTarget(engine, dstW, 1, dstTex, null, 1);
      material.shaderData.setVector4(
        "material_SSRSourceTexelSize",
        new Vector4(1 / srcValues.length, 1, srcValues.length, 1)
      );
      material.shaderData.setVector4("material_SSRDestTexelSize", new Vector4(1 / dstW, 1, dstW, 1));
      engine._renderContext.camera = camera;
      Blitter.blitTexture(engine, srcTex, dstRT, 0, new Vector4(0, 0, 1, 1), material, 1, undefined, 0);
      const out = readSSRDepthBuffer(dstTex, packed, 100);
      dstRT.destroy(true);
      dstTex.destroy(true);
      srcTex.destroy(true);
      return out;
    };

    const out5to2 = runMipN([40, 40, 2, 40, 40], 2);
    expect(out5to2[0]).toBeCloseTo(2.0, 0);
    expect(out5to2[1]).toBeCloseTo(2.0, 0);
    for (const v of runMipN([40, 40, 2, 40, 2, 40, 40], 3)) {
      expect(v).toBeCloseTo(2.0, 0);
    }

    // 3. Narrow fractional 7.75px Low-quality footprint still captures edge occluder
    const { rt: narrowRT, tex: narrowTex } = createReadbackRT(engine, 32, 8);
    root.clearChildren();
    const nCam = root.createChild("nCam").addComponent(Camera);
    nCam.entity.transform.setPosition(0, 0, 5);
    nCam.entity.transform.lookAt(new Vector3(0, 0, 0));
    nCam.nearClipPlane = 0.5;
    nCam.farClipPlane = 100;
    nCam.fieldOfView = 75;
    nCam.renderTarget = narrowRT;
    nCam.viewport.w = 7.75 / 8;
    ssr.quality = ScreenSpaceReflectionQuality.Low;
    const redOcc = new PBRMaterial(engine);
    redOcc.emissiveColor = new Color(1, 0, 0, 1);
    addBox(engine, root, "topBar", [0, 1.95, 2], [20, 0.35, 0.2], redOcc);
    stepFrames(engine, 2);
    const nPass = getSSRPass(nCam);
    const nHiZ = nPass._resources.hiZTex[1 - nPass._history.hiZPingPongIndex]!;
    const nBuf = readSSRDepthBuffer(nHiZ, nPass._caps.usesPackedDepthRG8, nCam.farClipPlane);
    expect(Math.min(...Array.from(nBuf))).toBeLessThan(10);
    expect(drainGlErrors(gl)).toEqual([]);

    narrowRT.destroy(true);
    narrowTex.destroy(true);
  });

  it("builds hardware or software color pyramids, caps non-VeryHigh presets at 960px, and isolates split-screen viewports", async () => {
    const { engine, scene, gl } = await createTestEngine(160, 120);
    createdEngines.push(engine);

    const root = scene.createRootEntity("root");
    const camEnt = root.createChild("cam");
    camEnt.transform.setPosition(0, 0, 5);
    camEnt.transform.lookAt(new Vector3(0, 0, 0));
    const cam = camEnt.addComponent(Camera);

    const quadMat = new PBRMaterial(engine);
    quadMat.roughness = 0.05;
    quadMat.baseColor = new Color(0, 0, 1, 1);
    quadMat.emissiveColor = new Color(0.2, 0.5, 0.9, 1);
    const mr = root.createChild("quad").addComponent(MeshRenderer);
    mr.mesh = createQuadWithVertexColorAlpha(engine, 12, 12, 1, 1, 1, 1);
    mr.setMaterial(quadMat);

    const ssr = sceneSSR(scene);
    ssr.enabled = true;
    ssr.quality = ScreenSpaceReflectionQuality.Medium;
    engine.update();

    const ssrPass = getSSRPass(cam);
    const pyrTex = ssrPass._resources.prevColorPyramidTex! as Texture2D;
    const genSpy = vi.spyOn(pyrTex, "generateMipmaps");
    const mipSupport = vi.spyOn(engine._hardwareRenderer, "supportsGenerateMipmaps");

    const assertMipBlue = (texture: Texture2D) => {
      const isByte = texture.format === TextureFormat.R8G8B8A8_UNorm;
      const scale = isByte ? 1 / 255 : 1;
      for (let mip = 0; mip <= 3; mip++) {
        const mw = Math.max(1, texture.width >> mip);
        const mh = Math.max(1, texture.height >> mip);
        const buf = isByte ? new Uint8Array(mw * mh * 4) : new Float32Array(mw * mh * 4);
        texture.getPixelBuffer(0, 0, mw, mh, mip, buf);
        expect(buf[(Math.floor(mh / 2) * mw + Math.floor(mw / 2)) * 4 + 2] * scale).toBeGreaterThan(0.2);
      }
    };

    stepFrames(engine, 2);
    expect(genSpy).toHaveBeenCalledTimes(2);
    assertMipBlue(pyrTex);

    // Software fallback on VeryHigh and when hardware lacks generateMipmaps
    ssr.quality = ScreenSpaceReflectionQuality.VeryHigh;
    stepFrames(engine, 2);
    assertMipBlue(ssrPass._resources.prevColorPyramidTex! as Texture2D);

    ssr.quality = ScreenSpaceReflectionQuality.Medium;
    stepFrames(engine, 1);
    const medPyrTex = ssrPass._resources.prevColorPyramidTex! as Texture2D;
    const fallbackSpy = vi.spyOn(medPyrTex, "generateMipmaps");
    mipSupport.mockReturnValue(false);
    stepFrames(engine, 2);
    expect(fallbackSpy).not.toHaveBeenCalled();
    assertMipBlue(medPyrTex);
    mipSupport.mockRestore();

    // Non-VeryHigh long edge capped at 960px on 4K RT while VeryHigh remains uncapped
    const { rt: rt4k, tex: tex4k } = createReadbackRT(engine, 3840, 2160);
    cam.renderTarget = rt4k;
    ssr.quality = ScreenSpaceReflectionQuality.High;
    stepFrames(engine, 2);
    expect(ssrPass._resources.hiZTex[0]!.width).toBe(960);
    expect(ssrPass._resources.prevColorPyramidTex?.width).toBe(960);
    ssr.quality = ScreenSpaceReflectionQuality.VeryHigh;
    engine.update();
    expect(ssrPass._resources.hiZTex[0]!.width).toBe(3840);
    expect(ssrPass._resources.prevColorPyramidTex?.width).toBe(3840);
    rt4k.destroy(true);
    tex4k.destroy(true);

    // Odd-width 101x64 split-screen isolation + external mipmap=true RT mip0 prefilter check
    const oddTex = new Texture2D(engine, 101, 64, TextureFormat.R8G8B8A8_UNorm, true, false);
    const oddRT = new RenderTarget(engine, 101, 64, oddTex, TextureFormat.Depth24Stencil8);
    oddRT.autoGenerateMipmaps = false;
    cam.renderTarget = oddRT;
    cam.viewport = new Vector4(0, 0, 0.5, 1);
    cam.priority = 1;
    scene.background.solidColor.set(0, 0, 1, 1);
    mr.entity.destroy();

    const camRight = root.createChild("camRight").addComponent(Camera);
    camRight.renderTarget = oddRT;
    camRight.viewport = new Vector4(0.5, 0, 0.5, 1);
    camRight.priority = 0;
    const redMat = new UnlitMaterial(engine);
    redMat.baseColor = new Color(1, 0, 0, 1);
    const redEnt = addPlane(engine, root, "redQuad", [0, 0, 0], 20, 20, redMat);
    redEnt.transform.setRotation(90, 0, 0);
    redEnt.layer = 1 << 5;
    cam.cullingMask = ~(1 << 5);
    camRight.cullingMask = 1 << 5;
    camRight.entity.transform.setPosition(0, 0, 3);
    camRight.entity.transform.lookAt(new Vector3(0, 0, 0));

    stepFrames(engine, 2);
    const pyrOdd = ssrPass._resources.prevColorPyramidTex!;
    const { rt: readRT, tex: readTex } = createReadbackRT(engine, pyrOdd.width, pyrOdd.height);
    engine._renderContext.camera = cam;
    Blitter.blitTexture(engine, pyrOdd, readRT);
    const pyrPixels = new Uint8Array(pyrOdd.width * pyrOdd.height * 4);
    readTex.getPixelBuffer(0, 0, pyrOdd.width, pyrOdd.height, 0, pyrPixels);
    let maxR = 0;
    let maxB = 0;
    for (let i = 0; i < pyrPixels.length; i += 4) {
      if (pyrPixels[i] > maxR) maxR = pyrPixels[i];
      if (pyrPixels[i + 2] > maxB) maxB = pyrPixels[i + 2];
    }
    expect(maxB).toBeGreaterThan(200);
    expect(maxR).toBe(0);
    expect(drainGlErrors(gl)).toEqual([]);

    readRT.destroy(true);
    readTex.destroy(true);
    oddRT.destroy(true);
    oddTex.destroy(true);
  });

  it("preserves discarded pixels, explicit destMipLevel, and MRT attachments in Blitter and GLRenderTarget", async () => {
    const { engine, scene, gl } = await createTestEngine(64, 64, true);
    createdEngines.push(engine);

    const cam = scene.createRootEntity("cam").addComponent(Camera);
    engine.update();
    engine._renderContext.camera = cam;

    // 1. Non-square GLRenderTarget mip switching + RBO depth
    const mipTex = new Texture2D(engine, 8, 2, TextureFormat.R8G8B8A8_UNorm, true, false);
    mipTex.filterMode = TextureFilterMode.Point;
    const mipRT = new RenderTarget(engine, 8, 2, mipTex, null, 1);
    mipRT.autoGenerateMipmaps = false;
    const rhi = engine._hardwareRenderer;
    const clearColors = [new Color(1, 0, 0, 1), new Color(0, 1, 0, 1), new Color(0, 0, 1, 1), new Color(1, 1, 0, 1)];
    for (let m = 0; m < 4; m++) {
      rhi.activeRenderTarget(mipRT, new Vector4(0, 0, 1, 1), true, m);
      rhi.clearRenderTarget(engine, CameraClearFlags.Color, clearColors[m]);
    }
    for (let m = 0; m < 4; m++) {
      const mw = Math.max(1, 8 >> m);
      const mh = Math.max(1, 2 >> m);
      const buf = new Uint8Array(mw * mh * 4);
      mipTex.getPixelBuffer(0, 0, mw, mh, m, buf);
      expect([buf[0], buf[1], buf[2]]).toEqual([
        clearColors[m].r * 255,
        clearColors[m].g * 255,
        clearColors[m].b * 255
      ]);
    }
    const rboTex = new Texture2D(engine, 16, 16, TextureFormat.R8G8B8A8_UNorm, false, false);
    const rboRT = new RenderTarget(engine, 16, 16, rboTex, RenderBufferDepthFormat.Depth, 1);
    rhi.activeRenderTarget(rboRT, new Vector4(0, 0, 1, 1), true);
    rhi.clearRenderTarget(engine, CameraClearFlags.All, new Color(0, 1, 1, 1));

    // 2. Blitter.blitTexture discard preservation + destMipLevel + MRT
    const discardTex = new Texture2D(engine, 16, 16, TextureFormat.R8G8B8A8_UNorm, false, false);
    const discardRT = new RenderTarget(engine, 16, 16, discardTex, null);
    const mrtTex0 = new Texture2D(engine, 16, 16, TextureFormat.R8G8B8A8_UNorm, true, false);
    const mrtTex1 = new Texture2D(engine, 16, 16, TextureFormat.R8G8B8A8_UNorm, true, false);
    const mrtRT = new RenderTarget(engine, 16, 16, [mrtTex0, mrtTex1], null);
    mrtRT.autoGenerateMipmaps = false;

    const blitShader = Shader.create(`Shader "Test/SSRBlitDiscardAndMRT" {
      SubShader "Default" {
        Pass "Discard" {
          DepthState = { Enabled = false; WriteEnabled = false; }
          BlendState = { Enabled = false; }
          VertexShader = vert; FragmentShader = dFrag;
          #include "ShaderLibrary/Blit/BlitVertex.glsl"
          void dFrag(Varyings v) { if (v.v_uv.x < 0.5) discard; gl_FragColor = vec4(0.0, 1.0, 0.0, 1.0); }
        }
        Pass "MRT" {
          DepthState = { Enabled = false; WriteEnabled = false; }
          VertexShader = vert; FragmentShader = mFrag;
          #include "ShaderLibrary/Blit/BlitVertex.glsl"
          struct Out { layout(location = 0) vec4 c0; layout(location = 1) vec4 c1; };
          Out mFrag(Varyings v) { Out o; o.c0 = vec4(1, 0, 0, 1); o.c1 = vec4(0, 1, 0, 1); return o; }
        }
      }
    }`);
    const blitMat = new Material(engine, blitShader);
    const srcTex = createSolidRGBA8Tex(engine, 255, 0, 0, 255);
    rhi.activeRenderTarget(discardRT, new Vector4(0, 0, 1, 1), true, 0);
    rhi.clearRenderTarget(engine, CameraClearFlags.Color, new Color(0, 0, 1, 1));
    Blitter.blitTexture(engine, srcTex, discardRT, 0, undefined, blitMat, 0);
    rhi.activeRenderTarget(mrtRT, new Vector4(0, 0, 1, 1), true, 0);
    rhi.clearRenderTarget(engine, CameraClearFlags.Color, new Color(0, 0, 1, 1));
    Blitter.blitTexture(engine, srcTex, mrtRT, 0, undefined, blitMat, 1, undefined, 1);
    rhi.activeRenderTarget(null, new Vector4(0, 0, 1, 1), false, 0);
    engine._renderContext.camera = null!;

    const discardPx = new Uint8Array(16 * 16 * 4);
    const px0 = new Uint8Array(16 * 16 * 4);
    const mip1Buf0 = new Uint8Array(8 * 8 * 4);
    const mip1Buf1 = new Uint8Array(8 * 8 * 4);
    discardTex.getPixelBuffer(0, 0, 16, 16, 0, discardPx);
    mrtTex0.getPixelBuffer(0, 0, 16, 16, 0, px0);
    mrtTex0.getPixelBuffer(0, 0, 8, 8, 1, mip1Buf0);
    mrtTex1.getPixelBuffer(0, 0, 8, 8, 1, mip1Buf1);
    expect([discardPx[(8 * 16 + 4) * 4], discardPx[(8 * 16 + 4) * 4 + 2]]).toEqual([0, 255]);
    expect([discardPx[(8 * 16 + 12) * 4], discardPx[(8 * 16 + 12) * 4 + 1]]).toEqual([0, 255]);
    expect([px0[0], px0[1], px0[2]]).toEqual([0, 0, 255]);
    expect(mip1Buf0[0]).toBe(255);
    expect(mip1Buf1[1]).toBe(255);
    expect(drainGlErrors(gl)).toEqual([]);

    blitMat.destroy();
    blitShader.destroy(true);
    srcTex.destroy(true);
    discardRT.destroy(true);
    discardTex.destroy(true);
    mrtRT.destroy(true);
    mrtTex0.destroy(true);
    mrtTex1.destroy(true);
    rboRT.destroy(true);
    rboTex.destroy(true);
    mipRT.destroy(true);
    mipTex.destroy(true);
  });

  it("keeps DepthOnly prepass consistent with DepthNormals for alphaCutoff and double-sided built-in materials", async () => {
    const { engine, scene, gl } = await createTestEngine(160, 120, true);
    createdEngines.push(engine);

    const root = scene.createRootEntity("root");
    const camEnt = root.createChild("cam");
    camEnt.transform.setPosition(0, 0, 6);
    camEnt.transform.lookAt(new Vector3(0, 0, 0));
    const cam = camEnt.addComponent(Camera);
    cam.nearClipPlane = 2;
    cam.farClipPlane = 10;
    cam.depthTextureMode = DepthTextureMode.PrePass;

    // Left: alphaCutoff material whose baseColor.a (0.2) < alphaCutoff (0.5) must be discarded in both modes.
    const alphaMat = new PBRMaterial(engine);
    alphaMat.alphaCutoff = 0.5;
    alphaMat.baseColor = new Color(1, 1, 1, 0.2);
    addBox(engine, root, "alphaDiscarded", [-1.5, 0, 1], [1.4, 2.0, 0.2], alphaMat);

    // Right: back-facing plane (-90 deg X rotation, normal -Z) toggles between RenderFace.Front (culled) and Double (kept).
    const doubleMat = new PBRMaterial(engine);
    doubleMat.renderFace = RenderFace.Front;
    const backPlane = addPlane(engine, root, "doubleSidedBackFace", [1.5, 0, 1], 1.4, 2.0, doubleMat);
    backPlane.transform.setRotation(-90, 0, 0);

    const depthReadShader = Shader.create(`Shader "Test/ReadDepthR8" {
      SubShader "Default" {
        Pass "Forward" {
          DepthState = { Enabled = false; WriteEnabled = false; }
          VertexShader = vert; FragmentShader = frag;
          #include "ShaderLibrary/Blit/BlitVertex.glsl"
          highp sampler2D renderer_BlitTexture;
          void frag(Varyings v) {
            float d = texture2D(renderer_BlitTexture, v.v_uv).r;
            gl_FragColor = vec4(d, d, d, 1.0);
          }
        }
      }
    }`);
    const depthReadMat = new Material(engine, depthReadShader);
    const tex = new Texture2D(engine, 160, 120, TextureFormat.R8G8B8A8_UNorm, false, false);
    const rt = new RenderTarget(engine, 160, 120, tex, null, 1);

    const readPrepassDepth = () => {
      stepFrames(engine, 1);
      const depthTex = cam.shaderData.getTexture("camera_DepthTexture") as Texture2D;
      engine._renderContext.camera = cam;
      Blitter.blitTexture(engine, depthTex, rt, 0, undefined, depthReadMat, 0);
      engine._renderContext.camera = null!;
      return {
        left: sampleRegionRGB(tex, 0.16, 0.35, 0.3, 0.65),
        right: sampleRegionRGB(tex, 0.7, 0.35, 0.84, 0.65)
      };
    };

    // 1. SSR off (DepthOnly): alpha discarded + back-face Front culled -> both cleared at 255
    sceneSSR(scene).enabled = false;
    const depthOnlyCulled = readPrepassDepth();
    expect(depthOnlyCulled.left.avgR).toBe(255);
    expect(depthOnlyCulled.right.avgR).toBe(255);

    // 2. Keep alphaCutoff (>= 0.5) and RenderFace.Double -> both write identical depth in DepthOnly & DepthNormals
    alphaMat.baseColor = new Color(1, 1, 1, 0.8);
    doubleMat.renderFace = RenderFace.Double;
    const depthOnlyVisible = readPrepassDepth();
    expect(depthOnlyVisible.left.avgR).toBeLessThan(220);
    expect(depthOnlyVisible.right.avgR).toBeLessThan(220);

    sceneSSR(scene).enabled = true;
    const depthNormalsVisible = readPrepassDepth();
    expect(depthNormalsVisible.left.avgR).toBeLessThan(220);
    expect(depthNormalsVisible.right.avgR).toBeLessThan(220);
    expect(Math.abs(depthOnlyVisible.left.avgR - depthNormalsVisible.left.avgR)).toBeLessThanOrEqual(1);
    expect(Math.abs(depthOnlyVisible.right.avgR - depthNormalsVisible.right.avgR)).toBeLessThanOrEqual(1);

    // 3. Re-test discarded/culled under SSR on (DepthNormals)
    alphaMat.baseColor = new Color(1, 1, 1, 0.2);
    doubleMat.renderFace = RenderFace.Front;
    const depthNormalsCulled = readPrepassDepth();
    expect(depthNormalsCulled.left.avgR).toBe(255);
    expect(depthNormalsCulled.right.avgR).toBe(255);
    expect(drainGlErrors(gl)).toEqual([]);

    rt.destroy(true);
    tex.destroy(true);
    depthReadMat.destroy();
    depthReadShader.destroy(true);
    alphaMat.destroy();
    doubleMat.destroy();
  });
});
