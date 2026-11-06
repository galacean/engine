import {
  AssetType,
  BackgroundMode,
  Camera,
  Color,
  DirectLight,
  DiffuseMode,
  type Engine,
  type Entity,
  type GLTFResource,
  MeshRenderer,
  MeshTopology,
  ModelMesh,
  PBRMaterial,
  PrimitiveMesh,
  ScreenSpaceReflection,
  ScreenSpaceReflectionDebugMode,
  ScreenSpaceReflectionQuality,
  ScreenSpaceReflectionUpsamplingMode,
  type ScreenSpaceReflectionProfiler,
  ScreenSpaceReflectionReceiverMode,
  Script,
  ShadowType,
  SkyBoxMaterial,
  Texture2D,
  TextureCube,
  TextureCubeFace,
  TextureFilterMode,
  TextureFormat,
  TextureWrapMode,
  Vector2,
  Vector3,
  Vector4,
  WebGLEngine,
  WebGLMode
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";
import { FreeControl } from "@galacean/engine-animals/controls/FreeControl";

type SsrDemoDebugMode = "final" | "surface" | "depth" | "hit" | "confidence" | "steps";
type SsrDemoCameraPose = "acceptance" | "edge" | "curve";
type SsrDemoQuality = "low" | "medium" | "high";
type UnavailableMetric = "unavailable";

export interface SsrDemoSnapshot {
  readonly state: "loading" | "ready" | "error";
  readonly enabled: boolean;
  readonly requested: boolean;
  readonly effective: boolean;
  readonly supported: boolean;
  readonly quality: SsrDemoQuality | "custom";
  readonly resolutionScale: number;
  readonly upsamplingMode: ScreenSpaceReflectionUpsamplingMode;
  readonly fullscreenPassCount: number;
  readonly filterPassCount: number;
  readonly upsamplePassCount: number;
  readonly debugMode: SsrDemoDebugMode;
  readonly cameraPose: SsrDemoCameraPose;
  readonly cameraPosition: readonly [number, number, number];
  readonly cameraForward: readonly [number, number, number];
  readonly frozen: boolean;
  readonly temporal: false;
  readonly cameraCutCount: number;
  readonly activeConsumerLeaseCount: number;
  readonly renderTargetCount: number;
  readonly width: number;
  readonly height: number;
  readonly estimatedBytes: number;
  readonly surfacePassDrawCount: number;
  readonly unsupportedReason: string | null;
  readonly errorReason: string | null;
}

export interface SsrDiagnosticsCapture {
  readonly captureMode: "metrics-only";
  readonly capturedAtFrame: number;
  readonly snapshot: SsrDemoSnapshot;
  readonly rawHitRatio: UnavailableMetric;
  readonly averageSteps: UnavailableMetric;
  readonly receiverPixels: UnavailableMetric;
  readonly unavailableReason: string;
}

export interface SsrDemoApi {
  readonly ready: Promise<void>;
  setEnabled(enabled: boolean): void;
  setQualityPreset(quality: SsrDemoQuality): void;
  setReconstruction(scale: number, mode: ScreenSpaceReflectionUpsamplingMode): void;
  setProfiler(profiler: ScreenSpaceReflectionProfiler | null): void;
  setDebugMode(mode: SsrDemoDebugMode): void;
  setCameraPose(pose: SsrDemoCameraPose): void;
  freezeTime(enabled: boolean): void;
  cameraCut(): void;
  getSnapshot(): SsrDemoSnapshot;
  captureDiagnostics(): Promise<SsrDiagnosticsCapture>;
}

declare global {
  interface Window {
    ssrDemo?: SsrDemoApi;
    ssrDemoError?: string;
  }
}

interface CameraPoseDefinition {
  readonly position: readonly [number, number, number];
  readonly target: readonly [number, number, number];
  readonly fieldOfView: number;
}

interface PbrDefinition {
  readonly name: string;
  readonly color: readonly [number, number, number, number];
  readonly roughness: number;
  readonly metallic: number;
  readonly emissive?: readonly [number, number, number, number];
}

interface SsrSceneAssets {
  readonly gasMask: GLTFResource;
  readonly oakTree: GLTFResource;
  readonly tallPineTree: GLTFResource;
  readonly roundPineTree: GLTFResource;
  readonly woodBaseColor: Texture2D;
  readonly woodNormal: Texture2D;
  readonly waterBaseColor: Texture2D;
  readonly waterNormal: Texture2D;
  readonly waterRoughness: Texture2D;
  readonly meadowCube: TextureCube;
}

interface ExhibitRig {
  readonly animatedSubject: Entity;
  readonly waterMaterial: PBRMaterial;
}

const CAMERA_POSES: Readonly<Record<SsrDemoCameraPose, CameraPoseDefinition>> = Object.freeze({
  acceptance: Object.freeze({
    position: [-5.3, 2.4, -7.8] as const,
    target: [0, 1.35, -0.9] as const,
    fieldOfView: 42
  }),
  edge: Object.freeze({
    position: [-7.45, 2.45, -7.3] as const,
    target: [-4.8, 0.65, 2.4] as const,
    fieldOfView: 42
  }),
  curve: Object.freeze({
    position: [-3.4, 1.55, -5.5] as const,
    target: [0, 0.72, -0.8] as const,
    fieldOfView: 38
  })
});

const DEBUG_MODES: Readonly<Record<SsrDemoDebugMode, ScreenSpaceReflectionDebugMode>> = Object.freeze({
  final: ScreenSpaceReflectionDebugMode.None,
  surface: ScreenSpaceReflectionDebugMode.ReceiverNormal,
  depth: ScreenSpaceReflectionDebugMode.ReceiverDepth,
  hit: ScreenSpaceReflectionDebugMode.Hit,
  confidence: ScreenSpaceReflectionDebugMode.Confidence,
  steps: ScreenSpaceReflectionDebugMode.Steps
});

const QUALITY_PRESETS: Readonly<Record<SsrDemoQuality, ScreenSpaceReflectionQuality>> = Object.freeze({
  low: ScreenSpaceReflectionQuality.Low,
  medium: ScreenSpaceReflectionQuality.Medium,
  high: ScreenSpaceReflectionQuality.High
});

const ASSET_URLS = Object.freeze({
  gasMask: new URL("./assets/gasmask.glb", import.meta.url).href,
  oakTree: new URL("./assets/kenney-tree-oak.glb", import.meta.url).href,
  tallPineTree: new URL("./assets/kenney-tree-pine-tall.glb", import.meta.url).href,
  roundPineTree: new URL("./assets/kenney-tree-pine-round.glb", import.meta.url).href,
  woodBaseColor: new URL("./assets/fine-grained-wood-basecolor.jpg", import.meta.url).href,
  woodNormal: new URL("./assets/fine-grained-wood-normal-gl.jpg", import.meta.url).href,
  waterBaseColor: new URL("./assets/water-surface-basecolor.png", import.meta.url).href,
  waterNormal: new URL("./assets/water-surface-normal.png", import.meta.url).href,
  waterRoughness: new URL("./assets/water-surface-roughness.png", import.meta.url).href,
  meadowFaces: Object.freeze([
    new URL("./assets/meadow-2-px.png", import.meta.url).href,
    new URL("./assets/meadow-2-nx.png", import.meta.url).href,
    new URL("./assets/meadow-2-py.png", import.meta.url).href,
    new URL("./assets/meadow-2-ny.png", import.meta.url).href,
    new URL("./assets/meadow-2-pz.png", import.meta.url).href,
    new URL("./assets/meadow-2-nz.png", import.meta.url).href
  ] as const)
});

const FREEZE_ACCEPTANCE_TIME = 0.65;
const STATUS_UPDATE_INTERVAL = 0.12;
const LAKE_SKY_EXPOSURE = 0.86;
const FREE_CAMERA_MOVEMENT_SPEED = 4;

class SsrDemoDriver extends Script {
  runtime!: SsrDemoRuntime;

  override onUpdate(deltaTime: number): void {
    this.runtime.update(deltaTime);
  }
}

class SsrFreeCameraController {
  private control: FreeControl | undefined;

  constructor(private readonly cameraEntity: Entity) {}

  resetFromTransform(): void {
    this.control?.destroy();
    const control = this.cameraEntity.addComponent(FreeControl);
    control.movementSpeed = FREE_CAMERA_MOVEMENT_SPEED;
    control.floorMock = false;
    this.control = control;
  }

  destroy(): void {
    this.control?.destroy();
    this.control = undefined;
  }
}

class SsrDemoRuntime {
  private time = FREEZE_ACCEPTANCE_TIME;
  private frozen = false;
  private debugMode: SsrDemoDebugMode = "final";
  private cameraPose: SsrDemoCameraPose = "acceptance";
  private cameraCutCount = 0;
  private frameCount = 0;
  private statusElapsed = 0;
  private readonly waterTiling = new Vector4(6.25, 6.25, 0.08, 0.14);

  constructor(
    private readonly camera: Camera,
    private readonly animatedSubject: Entity,
    private readonly waterMaterial: PBRMaterial,
    private readonly resetFreeCamera: () => void
  ) {
    const ssr = camera.screenSpaceReflection;
    ssr.enabled = true;
    ssr.quality = ScreenSpaceReflectionQuality.High;
    ssr.intensity = 1;
    ssr.maxRayDistance = 22;
    ssr.thickness = 0.2;
    ssr.maxRoughness = 0.52;
    ssr.edgeFade = 0.05;
    ssr.debugMode = ScreenSpaceReflectionDebugMode.None;
    this.applyCameraPose();
    this.applyMotion();
    this.syncUi();
  }

  update(deltaTime: number): void {
    this.frameCount++;
    const finiteDeltaTime = Number.isFinite(deltaTime) ? Math.min(Math.max(deltaTime, 0), 0.1) : 0;
    if (!this.frozen) {
      this.time += finiteDeltaTime;
      this.applyMotion();
    }

    this.statusElapsed = Math.min(this.statusElapsed + finiteDeltaTime, STATUS_UPDATE_INTERVAL);
    if (this.statusElapsed >= STATUS_UPDATE_INTERVAL) {
      this.statusElapsed = 0;
      this.syncUi();
    }
  }

  synchronizeStatus(): void {
    this.statusElapsed = 0;
    this.syncUi();
  }

  setEnabled(enabled: boolean): void {
    this.camera.screenSpaceReflection.enabled = enabled;
    this.syncUi();
  }

  setQualityPreset(quality: SsrDemoQuality): void {
    this.camera.screenSpaceReflection.applyQualityPreset(QUALITY_PRESETS[quality]);
    this.syncUi();
  }

  setReconstruction(scale: number, mode: ScreenSpaceReflectionUpsamplingMode): void {
    const ssr = this.camera.screenSpaceReflection;
    ssr.resolutionScale = scale;
    ssr.upsamplingMode = mode;
    this.syncUi();
  }

  setProfiler(profiler: ScreenSpaceReflectionProfiler | null): void {
    this.camera.screenSpaceReflection.profiler = profiler;
  }

  setDebugMode(mode: SsrDemoDebugMode): void {
    this.debugMode = mode;
    this.camera.screenSpaceReflection.debugMode = DEBUG_MODES[mode];
    this.syncUi();
  }

  setCameraPose(pose: SsrDemoCameraPose): void {
    this.cameraPose = pose;
    this.applyCameraPose();
    this.syncUi();
  }

  freezeTime(enabled: boolean): void {
    this.frozen = enabled;
    if (enabled) {
      this.time = FREEZE_ACCEPTANCE_TIME;
      this.applyMotion();
    }
    this.syncUi();
  }

  cameraCut(): void {
    this.cameraCutCount++;
    this.applyCameraPose();
    this.syncUi();
  }

  getSnapshot(): SsrDemoSnapshot {
    const ssr = this.camera.screenSpaceReflection;
    const metrics = ssr.metrics;
    const settings = metrics.opaqueResolvedSettings;
    const quality =
      (Object.keys(QUALITY_PRESETS) as SsrDemoQuality[]).find((name) => {
        const preset = ScreenSpaceReflection.getQualityPreset(QUALITY_PRESETS[name]);
        return (Object.keys(preset) as (keyof typeof preset)[]).every((key) => settings[key] === preset[key]);
      }) ?? "custom";
    const cameraTransform = this.camera.entity.transform;
    const documentState = document.body.dataset.state;
    return Object.freeze({
      state: documentState === "ready" ? "ready" : documentState === "error" ? "error" : "loading",
      enabled: ssr.enabled,
      requested: metrics.requested,
      effective: metrics.effective,
      supported: metrics.supported,
      quality,
      resolutionScale: settings.resolutionScale,
      upsamplingMode: settings.upsamplingMode,
      fullscreenPassCount: metrics.fullscreenPassCount,
      filterPassCount: metrics.filterPassCount,
      upsamplePassCount: metrics.upsamplePassCount,
      debugMode: this.debugMode,
      cameraPose: this.cameraPose,
      cameraPosition: freezeVector3(cameraTransform.worldPosition),
      cameraForward: freezeVector3(cameraTransform.worldForward),
      frozen: this.frozen,
      temporal: false,
      cameraCutCount: this.cameraCutCount,
      activeConsumerLeaseCount: metrics.activeConsumerLeaseCount,
      renderTargetCount: metrics.renderTargetCount,
      width: metrics.width,
      height: metrics.height,
      estimatedBytes: metrics.estimatedBytes,
      surfacePassDrawCount: metrics.surfacePassDrawCount,
      unsupportedReason: metrics.unsupportedReason,
      errorReason: metrics.unsupportedReason
    });
  }

  async captureDiagnostics(): Promise<SsrDiagnosticsCapture> {
    await nextFrames(2);
    return Object.freeze({
      captureMode: "metrics-only",
      capturedAtFrame: this.frameCount,
      snapshot: this.getSnapshot(),
      rawHitRatio: "unavailable",
      averageSteps: "unavailable",
      receiverPixels: "unavailable",
      unavailableReason:
        "V1 public diagnostics avoid synchronous GPU readback; use debug screenshots for pixel metrics."
    });
  }

  private applyMotion(): void {
    const turn = Math.sin(this.time * 0.42) * 3.4;
    const lift = Math.sin(this.time * 0.64) * 0.015;
    this.animatedSubject.transform.setPosition(0, lift, 0);
    this.animatedSubject.transform.setRotation(0, turn, 0);
    this.waterTiling.set(6.25, 6.25, (0.08 + this.time * 0.012) % 1, (0.14 - this.time * 0.009) % 1);
    this.waterMaterial.tilingOffset = this.waterTiling;
  }

  private applyCameraPose(): void {
    const pose = CAMERA_POSES[this.cameraPose];
    this.camera.entity.transform.setPosition(...pose.position);
    this.camera.entity.transform.lookAt(new Vector3(...pose.target));
    this.camera.fieldOfView = pose.fieldOfView;
    this.resetFreeCamera();
  }

  private syncUi(): void {
    syncUi(this.getSnapshot());
  }
}

let activeEngine: WebGLEngine | null = null;
let activeRuntime: SsrDemoRuntime | null = null;
let startupError: string | null = null;
let resolveReady!: () => void;
let rejectReady!: (reason: unknown) => void;
const ready = new Promise<void>((resolve, reject) => {
  resolveReady = resolve;
  rejectReady = reject;
});
void ready.catch(() => undefined);

const api: SsrDemoApi = Object.freeze({
  ready,
  setEnabled(enabled: boolean) {
    requireRuntime().setEnabled(enabled);
  },
  setQualityPreset(quality: SsrDemoQuality) {
    requireRuntime().setQualityPreset(quality);
  },
  setReconstruction(scale: number, mode: ScreenSpaceReflectionUpsamplingMode) {
    requireRuntime().setReconstruction(scale, mode);
  },
  setProfiler(profiler: ScreenSpaceReflectionProfiler | null) {
    requireRuntime().setProfiler(profiler);
  },
  setDebugMode(mode: SsrDemoDebugMode) {
    requireRuntime().setDebugMode(mode);
  },
  setCameraPose(pose: SsrDemoCameraPose) {
    requireRuntime().setCameraPose(pose);
  },
  freezeTime(enabled: boolean) {
    requireRuntime().freezeTime(enabled);
  },
  cameraCut() {
    requireRuntime().cameraCut();
  },
  getSnapshot() {
    return activeRuntime?.getSnapshot() ?? createStartupSnapshot(startupError);
  },
  async captureDiagnostics() {
    await ready;
    return requireRuntime().captureDiagnostics();
  }
});

window.ssrDemo = api;
bindControls(api);

void boot().catch((error: unknown) => {
  startupError = error instanceof Error ? (error.stack ?? error.message) : String(error);
  window.ssrDemoError = startupError;
  document.body.dataset.state = "error";
  const loading = required<HTMLElement>("loading");
  loading.innerHTML = `<b>SSR Demo 启动失败</b><small>${escapeHtml(startupError)}</small>`;
  syncUi(createStartupSnapshot(startupError));
  rejectReady(error);
  activeEngine?.destroy();
  activeEngine = null;
  console.error("[screen-space-reflection] startup failed", error);
});

async function boot(): Promise<void> {
  const engine = await WebGLEngine.create({
    canvas: "canvas",
    shaderCompiler: new ShaderCompiler(),
    graphicDeviceOptions: { webGLMode: WebGLMode.WebGL2 }
  });
  activeEngine = engine;
  engine.canvas.setAutoResolution();

  const assets = await loadSceneAssets(engine);
  const scene = engine.sceneManager.activeScene!;
  createLakeEnvironment(engine, assets, scene);
  scene.castShadows = true;
  scene.shadowDistance = 32;

  const cameraEntity = scene.createRootEntity("SSR Lake Free Camera");
  const camera = cameraEntity.addComponent(Camera);
  camera.enableHDR = false;
  camera.nearClipPlane = 0.1;
  camera.farClipPlane = 80;
  const freeCameraController = new SsrFreeCameraController(cameraEntity);

  const sunEntity = scene.createRootEntity("Meadow Sun Key Light");
  sunEntity.transform.setRotation(-43, -28, 0);
  const sun = sunEntity.addComponent(DirectLight);
  sun.color = new Color(1.08, 0.96, 0.79, 1);
  sun.shadowType = ShadowType.SoftLow;
  scene.sun = sun;

  const exhibit = createLakeSsrExhibit(engine, assets, scene.createRootEntity("CC0 Meadow Lake SSR Exhibit"));
  const runtime = new SsrDemoRuntime(camera, exhibit.animatedSubject, exhibit.waterMaterial, () =>
    freeCameraController.resetFromTransform()
  );
  activeRuntime = runtime;
  const driver = cameraEntity.addComponent(SsrDemoDriver);
  driver.runtime = runtime;

  window.addEventListener(
    "beforeunload",
    () => {
      driver.enabled = false;
      freeCameraController.destroy();
      window.ssrDemo = undefined;
      activeRuntime = null;
      activeEngine?.destroy();
      activeEngine = null;
    },
    { once: true }
  );

  engine.run();
  await nextFrames(3);
  document.body.dataset.state = "ready";
  runtime.synchronizeStatus();
  resolveReady();
}

async function loadSceneAssets(engine: Engine): Promise<SsrSceneAssets> {
  const [
    gasMask,
    oakTree,
    tallPineTree,
    roundPineTree,
    woodBaseColor,
    woodNormal,
    waterBaseColor,
    waterNormal,
    waterRoughness,
    meadowCube
  ] = await Promise.all([
    engine.resourceManager.load<GLTFResource>({ type: AssetType.GLTF, url: ASSET_URLS.gasMask }),
    engine.resourceManager.load<GLTFResource>({ type: AssetType.GLTF, url: ASSET_URLS.oakTree }),
    engine.resourceManager.load<GLTFResource>({ type: AssetType.GLTF, url: ASSET_URLS.tallPineTree }),
    engine.resourceManager.load<GLTFResource>({ type: AssetType.GLTF, url: ASSET_URLS.roundPineTree }),
    loadTexture(engine, ASSET_URLS.woodBaseColor, true),
    loadTexture(engine, ASSET_URLS.woodNormal, false),
    loadTexture(engine, ASSET_URLS.waterBaseColor, true),
    loadTexture(engine, ASSET_URLS.waterNormal, false),
    loadTexture(engine, ASSET_URLS.waterRoughness, false),
    loadEnvironmentCube(engine, ASSET_URLS.meadowFaces)
  ]);

  woodBaseColor.name = "Poly Haven Fine Grained Wood Base Color";
  woodNormal.name = "Poly Haven Fine Grained Wood OpenGL Normal";
  waterBaseColor.name = "ProcTexture Water Surface Base Color";
  waterNormal.name = "ProcTexture Water Surface OpenGL Normal";
  waterRoughness.name = "ProcTexture Water Surface Roughness";
  meadowCube.name = "Poly Haven Meadow 2 Environment Cube";
  meadowCube.filterMode = TextureFilterMode.Trilinear;

  return Object.freeze({
    gasMask,
    oakTree,
    tallPineTree,
    roundPineTree,
    woodBaseColor,
    woodNormal,
    waterBaseColor,
    waterNormal,
    waterRoughness,
    meadowCube
  });
}

async function loadTexture(engine: Engine, url: string, isSRGBColorSpace: boolean): Promise<Texture2D> {
  return engine.resourceManager.load<Texture2D>({
    type: AssetType.Texture,
    url,
    params: {
      isSRGBColorSpace,
      mipmap: true,
      wrapModeU: TextureWrapMode.Repeat,
      wrapModeV: TextureWrapMode.Repeat,
      filterMode: TextureFilterMode.Trilinear,
      anisoLevel: 8
    }
  });
}

async function loadEnvironmentCube(engine: Engine, urls: readonly string[]): Promise<TextureCube> {
  if (urls.length !== 6) throw new Error(`Environment cubemap requires six faces, received ${urls.length}.`);
  const images = await Promise.all(
    urls.map(async (url) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Environment cubemap face failed to load: ${response.status} ${url}`);
      return createImageBitmap(await response.blob());
    })
  );
  const texture = new TextureCube(engine, 256, TextureFormat.R8G8B8A8, true, true);
  try {
    for (let face = 0; face < images.length; face++) {
      texture.setImageSource(TextureCubeFace.PositiveX + face, images[face]);
    }
    texture.generateMipmaps();
    return texture;
  } catch (error) {
    texture.destroy(true);
    throw error;
  } finally {
    for (const image of images) image.close();
  }
}

function createLakeEnvironment(
  engine: Engine,
  assets: SsrSceneAssets,
  scene: NonNullable<WebGLEngine["sceneManager"]["activeScene"]>
): void {
  const skyMaterial = new SkyBoxMaterial(engine);
  skyMaterial.name = "Poly Haven Meadow 2 CC0 Skybox";
  skyMaterial.texture = assets.meadowCube;
  skyMaterial.exposure = LAKE_SKY_EXPOSURE;
  skyMaterial.tintColor = new Color(1, 1, 1, 1);
  scene.background.mode = BackgroundMode.Sky;
  scene.background.sky.mesh = PrimitiveMesh.createCuboid(engine, 1, 1, 1);
  scene.background.sky.material = skyMaterial;

  scene.ambientLight.diffuseMode = DiffuseMode.SolidColor;
  scene.ambientLight.diffuseSolidColor = new Color(0.4, 0.5, 0.35, 1);
  scene.ambientLight.diffuseIntensity = 1.12;
  scene.ambientLight.specularTexture = assets.meadowCube;
  scene.ambientLight.specularIntensity = 1;
}

function createLakeSsrExhibit(engine: Engine, assets: SsrSceneAssets, parent: Entity): ExhibitRig {
  createMeadowShore(engine, parent);
  const waterMaterial = createWaterSurface(engine, assets, parent);
  createTreeGrove(assets, parent);

  const dock = parent.createChild("Wooden Lake SSR Dock");
  dock.transform.setPosition(-0.15, 0.02, -0.8);
  createWoodPedestal(engine, assets, dock);

  const animatedSubject = dock.createChild("SSR Reflection Source Assembly");
  createGasMask(assets.gasMask, animatedSubject);
  createCorrugatedHose(engine, animatedSubject);
  createHoseTerminal(engine, animatedSubject);
  createMaterialReferenceProps(engine, parent);
  return Object.freeze({ animatedSubject, waterMaterial });
}

function createMeadowShore(engine: Engine, parent: Entity): void {
  const material = createPbrMaterial(engine, {
    name: "Matte Meadow Shore",
    color: [0.14, 0.24, 0.1, 1],
    roughness: 0.92,
    metallic: 0
  });
  ScreenSpaceReflection.setMaterialReceiver(material, ScreenSpaceReflectionReceiverMode.Disabled, 0);
  const shore = parent.createChild("Matte Meadow Shoreline");
  shore.transform.setPosition(0, -0.12, -0.4);
  const renderer = shore.addComponent(MeshRenderer);
  renderer.mesh = PrimitiveMesh.createPlane(engine, 27, 21, 1, 1, false);
  renderer.setMaterial(material);
  renderer.castShadows = false;
  renderer.receiveShadows = true;
}

function createWaterSurface(engine: Engine, assets: SsrSceneAssets, parent: Entity): PBRMaterial {
  const material = new PBRMaterial(engine);
  material.name = "CC0 Water Surface SSR Receiver";
  material.baseColor = new Color(0.22, 0.46, 0.52, 1);
  material.baseTexture = assets.waterBaseColor;
  material.normalTexture = assets.waterNormal;
  material.roughnessMetallicTexture = assets.waterRoughness;
  material.normalTextureIntensity = 0.28;
  material.roughness = 0.08;
  material.metallic = 0;
  material.ior = 1.333;
  material.specularIntensity = 2;
  material.tilingOffset = new Vector4(6.25, 6.25, 0.08, 0.14);
  ScreenSpaceReflection.setMaterialReceiver(material, ScreenSpaceReflectionReceiverMode.OpaqueComposite, 1);

  const water = parent.createChild("ProcTexture Water Surface PBR");
  water.transform.setPosition(0, 0, -0.4);
  const renderer = water.addComponent(MeshRenderer);
  renderer.mesh = PrimitiveMesh.createPlane(engine, 18, 13, 1, 1, false);
  renderer.setMaterial(material);
  renderer.castShadows = false;
  renderer.receiveShadows = true;
  return material;
}

function createTreeGrove(assets: SsrSceneAssets, parent: Entity): void {
  const grove = parent.createChild("Kenney Nature Kit Tree Grove");
  createTreeInstance(assets.tallPineTree, grove, "Tall Pine West", [-7.2, 0, 5.5], 18, 2.65);
  createTreeInstance(assets.oakTree, grove, "Oak West Bank", [-3.9, 0, 5.6], -12, 2.45);
  createTreeInstance(assets.tallPineTree, grove, "Tall Pine North", [0.8, 0, 5.8], 9, 2.8);
  createTreeInstance(assets.roundPineTree, grove, "Round Pine East", [5.9, 0, 5.2], -18, 2.65);
  createTreeInstance(assets.oakTree, grove, "Oak East Bank", [8.1, 0, 2.7], 24, 2.2);
  createTreeInstance(assets.roundPineTree, grove, "Round Pine West Bank", [-8.35, 0, 1.25], -26, 2.15);
}

function createTreeInstance(
  resource: GLTFResource,
  parent: Entity,
  name: string,
  position: readonly [number, number, number],
  rotationY: number,
  scale: number
): void {
  for (const material of resource.materials ?? []) {
    if (material instanceof PBRMaterial) {
      ScreenSpaceReflection.setMaterialReceiver(material, ScreenSpaceReflectionReceiverMode.Disabled, 0);
    }
  }

  const anchor = parent.createChild(`Kenney ${name}`);
  anchor.transform.setPosition(...position);
  anchor.transform.setRotation(0, rotationY, 0);
  anchor.transform.setScale(scale, scale, scale);
  const instance = resource.instantiateSceneRoot();
  instance.name = `Kenney Nature Kit ${name} GLB`;
  anchor.addChild(instance);
  const renderers: MeshRenderer[] = [];
  instance.getComponentsIncludeChildren(MeshRenderer, renderers);
  for (const renderer of renderers) {
    renderer.castShadows = true;
    renderer.receiveShadows = true;
  }
}

function createMaterialReferenceProps(engine: Engine, parent: Entity): void {
  const chrome = createPbrMaterial(engine, {
    name: "Chrome SSR Material Reference",
    color: [0.72, 0.82, 0.84, 1],
    roughness: 0.06,
    metallic: 0.96
  });
  ScreenSpaceReflection.setMaterialReceiver(chrome, ScreenSpaceReflectionReceiverMode.OpaqueComposite, 0.8);
  createSphere(engine, parent, "Chrome Reflection Buoy", [3.05, 0.5, -1.35], 0.5, chrome);

  const matte = createPbrMaterial(engine, {
    name: "Matte Clay Material Reference",
    color: [0.56, 0.14, 0.07, 1],
    roughness: 0.9,
    metallic: 0
  });
  ScreenSpaceReflection.setMaterialReceiver(matte, ScreenSpaceReflectionReceiverMode.Disabled, 0);
  createSphere(engine, parent, "Matte Clay Buoy", [3.05, 0.34, -0.35], 0.34, matte);
}

function createWoodPedestal(engine: Engine, assets: SsrSceneAssets, parent: Entity): void {
  const material = new PBRMaterial(engine);
  material.name = "CC0 Fine Grained Wood Pedestal";
  material.baseColor = new Color(0.9, 0.72, 0.52, 1);
  material.baseTexture = assets.woodBaseColor;
  material.normalTexture = assets.woodNormal;
  material.normalTextureIntensity = 0.48;
  material.roughness = 0.31;
  material.metallic = 0;
  material.tilingOffset = new Vector4(1.35, 1.35, 0, 0);
  ScreenSpaceReflection.setMaterialReceiver(material, ScreenSpaceReflectionReceiverMode.Disabled, 0);

  createCuboid(engine, parent, "Wood Pedestal Lower Bevel", [0, 0.12, 0], [2.5, 0.24, 1.62], material, true);
  createCuboid(engine, parent, "Wood Pedestal Body", [0, 0.34, 0], [2.62, 0.34, 1.72], material, true);
  createCuboid(engine, parent, "Wood Pedestal Upper Bevel", [0, 0.56, 0], [2.76, 0.12, 1.86], material, true);
}

function createSphere(
  engine: Engine,
  parent: Entity,
  name: string,
  position: readonly [number, number, number],
  radius: number,
  material: PBRMaterial
): Entity {
  const entity = parent.createChild(name);
  entity.transform.setPosition(...position);
  const renderer = entity.addComponent(MeshRenderer);
  renderer.mesh = PrimitiveMesh.createSphere(engine, radius, 28);
  renderer.setMaterial(material);
  renderer.castShadows = true;
  renderer.receiveShadows = true;
  return entity;
}

function createGasMask(resource: GLTFResource, parent: Entity): void {
  for (const material of resource.materials ?? []) {
    if (material instanceof PBRMaterial) {
      material.name = "OpenGameArt CC0 Gas Mask PBR";
      material.roughness = 0.72;
      ScreenSpaceReflection.setMaterialReceiver(material, ScreenSpaceReflectionReceiverMode.Disabled, 0);
    }
  }

  const anchor = parent.createChild("OpenGameArt CC0 Gas Mask");
  anchor.transform.setPosition(-0.08, 1.08, 0.08);
  anchor.transform.setRotation(0, 100, 0);
  anchor.transform.setScale(1.82, 1.82, 1.82);
  const instance = resource.instantiateSceneRoot();
  instance.name = "kleenstudios Gasmask GLB";
  anchor.addChild(instance);
  const renderers: MeshRenderer[] = [];
  instance.getComponentsIncludeChildren(MeshRenderer, renderers);
  for (const renderer of renderers) {
    renderer.castShadows = true;
    renderer.receiveShadows = true;
  }
}

function createCorrugatedHose(engine: Engine, parent: Entity): void {
  const material = createPbrMaterial(engine, {
    name: "Corrugated Rubber Hose",
    color: [0.045, 0.052, 0.044, 1],
    roughness: 0.38,
    metallic: 0.02
  });
  ScreenSpaceReflection.setMaterialReceiver(material, ScreenSpaceReflectionReceiverMode.Disabled, 0);

  const hose = parent.createChild("Procedural Corrugated Breathing Hose");
  const renderer = hose.addComponent(MeshRenderer);
  renderer.mesh = createCorrugatedHoseMesh(engine);
  renderer.setMaterial(material);
  renderer.castShadows = true;
  renderer.receiveShadows = true;
}

function createCorrugatedHoseMesh(engine: Engine): ModelMesh {
  const segmentCount = 88;
  const radialSegmentCount = 12;
  const corrugationCount = 30;
  const radius = 0.095;
  const positions: Vector3[] = [];
  const normals: Vector3[] = [];
  const uvs: Vector2[] = [];
  const indices: number[] = [];
  const boundsMinimum = new Vector3(Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE);
  const boundsMaximum = new Vector3(-Number.MAX_VALUE, -Number.MAX_VALUE, -Number.MAX_VALUE);

  for (let segment = 0; segment <= segmentCount; segment++) {
    const u = segment / segmentCount;
    const center = sampleCubicBezier(
      [0.23, 1.47, -0.55],
      [0.58, 1.12, -0.63],
      [0.18, 0.72, -0.62],
      [1.14, 0.66, -0.18],
      u
    );
    const tangent = sampleCubicBezierTangent(
      [0.23, 1.47, -0.55],
      [0.58, 1.12, -0.63],
      [0.18, 0.72, -0.62],
      [1.14, 0.66, -0.18],
      u
    );
    const sideLength = Math.max(1e-6, Math.hypot(tangent.x, tangent.y));
    const side = new Vector3(-tangent.y / sideLength, tangent.x / sideLength, 0);
    const up = normalizeVector3(
      new Vector3(
        tangent.y * side.z - tangent.z * side.y,
        tangent.z * side.x - tangent.x * side.z,
        tangent.x * side.y - tangent.y * side.x
      )
    );
    const rib = 1 + Math.sin(u * corrugationCount * Math.PI * 2) * 0.15;
    const currentRadius = radius * rib;

    for (let radial = 0; radial <= radialSegmentCount; radial++) {
      const angle = (radial / radialSegmentCount) * Math.PI * 2;
      const cosine = Math.cos(angle);
      const sine = Math.sin(angle);
      const normal = normalizeVector3(
        new Vector3(side.x * cosine + up.x * sine, side.y * cosine + up.y * sine, side.z * cosine + up.z * sine)
      );
      const position = new Vector3(
        center.x + normal.x * currentRadius,
        center.y + normal.y * currentRadius,
        center.z + normal.z * currentRadius
      );
      positions.push(position);
      normals.push(normal);
      uvs.push(new Vector2(u * corrugationCount * 0.5, radial / radialSegmentCount));
      boundsMinimum.set(
        Math.min(boundsMinimum.x, position.x),
        Math.min(boundsMinimum.y, position.y),
        Math.min(boundsMinimum.z, position.z)
      );
      boundsMaximum.set(
        Math.max(boundsMaximum.x, position.x),
        Math.max(boundsMaximum.y, position.y),
        Math.max(boundsMaximum.z, position.z)
      );
    }
  }

  const ringSize = radialSegmentCount + 1;
  for (let segment = 0; segment < segmentCount; segment++) {
    for (let radial = 0; radial < radialSegmentCount; radial++) {
      const a = segment * ringSize + radial;
      const b = a + ringSize;
      const c = b + 1;
      const d = a + 1;
      indices.push(a, b, d, b, c, d);
    }
  }

  const mesh = new ModelMesh(engine, "Procedural Corrugated Breathing Hose Mesh");
  mesh.bounds.min.copyFrom(boundsMinimum);
  mesh.bounds.max.copyFrom(boundsMaximum);
  mesh.setPositions(positions);
  mesh.setNormals(normals);
  mesh.setUVs(uvs);
  mesh.setIndices(new Uint16Array(indices));
  mesh.addSubMesh(0, indices.length, MeshTopology.Triangles);
  mesh.uploadData(true);
  return mesh;
}

function createHoseTerminal(engine: Engine, parent: Entity): void {
  const material = createPbrMaterial(engine, {
    name: "Hose Metal Terminal",
    color: [0.48, 0.51, 0.47, 1],
    roughness: 0.24,
    metallic: 0.86
  });
  ScreenSpaceReflection.setMaterialReceiver(material, ScreenSpaceReflectionReceiverMode.Disabled, 0);
  const terminal = parent.createChild("Breathing Hose Metal Terminal");
  terminal.transform.setPosition(1.23, 0.66, -0.13);
  terminal.transform.setRotation(0, 0, -80);
  const renderer = terminal.addComponent(MeshRenderer);
  renderer.mesh = PrimitiveMesh.createCylinder(engine, 0.13, 0.11, 0.42, 24, 1);
  renderer.setMaterial(material);
  renderer.castShadows = true;
  renderer.receiveShadows = true;
}

function createCuboid(
  engine: Engine,
  parent: Entity,
  name: string,
  position: readonly [number, number, number],
  size: readonly [number, number, number],
  material: PBRMaterial,
  castShadows: boolean
): Entity {
  const entity = parent.createChild(name);
  entity.transform.setPosition(...position);
  const renderer = entity.addComponent(MeshRenderer);
  renderer.mesh = PrimitiveMesh.createCuboid(engine, ...size);
  renderer.setMaterial(material);
  renderer.castShadows = castShadows;
  renderer.receiveShadows = true;
  return entity;
}

function createPbrMaterial(engine: Engine, definition: PbrDefinition): PBRMaterial {
  const material = new PBRMaterial(engine);
  material.name = definition.name;
  material.baseColor = new Color(...definition.color);
  material.roughness = definition.roughness;
  material.metallic = definition.metallic;
  if (definition.emissive) material.emissiveColor = new Color(...definition.emissive);
  return material;
}

function sampleCubicBezier(
  start: readonly [number, number, number],
  controlA: readonly [number, number, number],
  controlB: readonly [number, number, number],
  end: readonly [number, number, number],
  t: number
): Vector3 {
  const inverse = 1 - t;
  const startWeight = inverse * inverse * inverse;
  const controlAWeight = 3 * inverse * inverse * t;
  const controlBWeight = 3 * inverse * t * t;
  const endWeight = t * t * t;
  return new Vector3(
    start[0] * startWeight + controlA[0] * controlAWeight + controlB[0] * controlBWeight + end[0] * endWeight,
    start[1] * startWeight + controlA[1] * controlAWeight + controlB[1] * controlBWeight + end[1] * endWeight,
    start[2] * startWeight + controlA[2] * controlAWeight + controlB[2] * controlBWeight + end[2] * endWeight
  );
}

function sampleCubicBezierTangent(
  start: readonly [number, number, number],
  controlA: readonly [number, number, number],
  controlB: readonly [number, number, number],
  end: readonly [number, number, number],
  t: number
): Vector3 {
  const inverse = 1 - t;
  return normalizeVector3(
    new Vector3(
      3 * inverse * inverse * (controlA[0] - start[0]) +
        6 * inverse * t * (controlB[0] - controlA[0]) +
        3 * t * t * (end[0] - controlB[0]),
      3 * inverse * inverse * (controlA[1] - start[1]) +
        6 * inverse * t * (controlB[1] - controlA[1]) +
        3 * t * t * (end[1] - controlB[1]),
      3 * inverse * inverse * (controlA[2] - start[2]) +
        6 * inverse * t * (controlB[2] - controlA[2]) +
        3 * t * t * (end[2] - controlB[2])
    )
  );
}

function normalizeVector3(value: Vector3): Vector3 {
  const length = Math.max(1e-6, Math.hypot(value.x, value.y, value.z));
  value.set(value.x / length, value.y / length, value.z / length);
  return value;
}

function bindControls(demo: SsrDemoApi): void {
  const enabled = required<HTMLInputElement>("ssr-enabled");
  const freeze = required<HTMLInputElement>("freeze-time");
  enabled.addEventListener("change", () => demo.setEnabled(enabled.checked));
  freeze.addEventListener("change", () => demo.freezeTime(freeze.checked));
  required<HTMLButtonElement>("camera-cut").addEventListener("click", () => demo.cameraCut());

  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-quality-preset]")) {
    button.addEventListener("click", () => {
      const quality = button.dataset.qualityPreset;
      if (quality === "low" || quality === "medium" || quality === "high") demo.setQualityPreset(quality);
    });
  }

  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-camera-pose]")) {
    button.addEventListener("click", () => {
      const pose = button.dataset.cameraPose;
      if (isCameraPose(pose)) demo.setCameraPose(pose);
    });
  }

  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-debug-mode]")) {
    button.addEventListener("click", () => {
      const mode = button.dataset.debugMode;
      if (isDebugMode(mode)) demo.setDebugMode(mode);
    });
  }

  required<HTMLButtonElement>("capture-diagnostics").addEventListener("click", async () => {
    const output = required<HTMLOutputElement>("diagnostic-result");
    output.value = "capturing…";
    try {
      const capture = await demo.captureDiagnostics();
      const snapshot = capture.snapshot;
      output.value = `frame ${capture.capturedAtFrame} · ${snapshot.surfacePassDrawCount} draws · hit/steps unavailable`;
    } catch (error: unknown) {
      output.value = error instanceof Error ? error.message : String(error);
    }
  });
}

function syncUi(snapshot: SsrDemoSnapshot): void {
  document.body.dataset.ssr = snapshot.enabled ? "on" : "off";
  document.body.dataset.debug = snapshot.debugMode;
  document.body.dataset.pose = snapshot.cameraPose;
  document.body.dataset.frozen = String(snapshot.frozen);
  document.body.dataset.effective = String(snapshot.effective);
  document.body.dataset.supported = String(snapshot.supported);

  const enabled = required<HTMLInputElement>("ssr-enabled");
  const freeze = required<HTMLInputElement>("freeze-time");
  enabled.checked = snapshot.enabled;
  freeze.checked = snapshot.frozen;

  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-camera-pose]")) {
    button.setAttribute("aria-pressed", String(button.dataset.cameraPose === snapshot.cameraPose));
  }
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-debug-mode]")) {
    button.setAttribute("aria-pressed", String(button.dataset.debugMode === snapshot.debugMode));
  }

  required<HTMLOutputElement>("effective-state").value = resolveEffectiveLabel(snapshot);
  required<HTMLElement>("support-state").textContent = resolveSupportLabel(snapshot);
  required<HTMLElement>("rt-state").textContent =
    `${snapshot.renderTargetCount} · ${snapshot.width}×${snapshot.height}`;
  required<HTMLElement>("draw-state").textContent = String(snapshot.surfacePassDrawCount);
  required<HTMLElement>("fullscreen-state").textContent = String(snapshot.fullscreenPassCount);
  const qualityLabel = snapshot.quality === "custom" ? "自定义" : snapshot.quality;
  required<HTMLElement>("quality-state").textContent = `${qualityLabel} · ${snapshot.resolutionScale}×`;
  for (const button of document.querySelectorAll<HTMLButtonElement>("[data-quality-preset]")) {
    button.setAttribute("aria-pressed", String(button.dataset.qualityPreset === snapshot.quality));
  }
  required<HTMLElement>("memory-state").textContent = formatBytes(snapshot.estimatedBytes);
}

function createStartupSnapshot(error: string | null): SsrDemoSnapshot {
  return Object.freeze({
    state: error ? "error" : "loading",
    enabled: true,
    requested: true,
    effective: false,
    supported: false,
    quality: "custom",
    resolutionScale: 1,
    upsamplingMode: ScreenSpaceReflectionUpsamplingMode.GaussianBilateral,
    fullscreenPassCount: 0,
    filterPassCount: 0,
    upsamplePassCount: 0,
    debugMode: "final",
    cameraPose: "acceptance",
    cameraPosition: Object.freeze([0, 0, 0] as const),
    cameraForward: Object.freeze([0, 0, -1] as const),
    frozen: false,
    temporal: false,
    cameraCutCount: 0,
    activeConsumerLeaseCount: 0,
    renderTargetCount: 0,
    width: 0,
    height: 0,
    estimatedBytes: 0,
    surfacePassDrawCount: 0,
    unsupportedReason: error,
    errorReason: error
  });
}

function freezeVector3(vector: Vector3): readonly [number, number, number] {
  return Object.freeze([vector.x, vector.y, vector.z] as const);
}

function requireRuntime(): SsrDemoRuntime {
  if (!activeRuntime) throw new Error("SSR Demo is not ready. Await window.ssrDemo.ready before controlling it.");
  return activeRuntime;
}

function isCameraPose(value: string | undefined): value is SsrDemoCameraPose {
  return value === "acceptance" || value === "edge" || value === "curve";
}

function isDebugMode(value: string | undefined): value is SsrDemoDebugMode {
  return (
    value === "final" ||
    value === "surface" ||
    value === "depth" ||
    value === "hit" ||
    value === "confidence" ||
    value === "steps"
  );
}

function resolveEffectiveLabel(snapshot: SsrDemoSnapshot): string {
  if (snapshot.state === "error") return "ERROR";
  if (!snapshot.enabled) return "DISABLED";
  if (!snapshot.supported) return snapshot.state === "loading" ? "PENDING" : "UNSUPPORTED";
  return snapshot.effective ? "EFFECTIVE" : "INACTIVE";
}

function resolveSupportLabel(snapshot: SsrDemoSnapshot): string {
  if (snapshot.state === "loading") return "checking";
  if (snapshot.supported) return "WebGL2 · supported";
  return snapshot.unsupportedReason ?? "unsupported";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function nextFrames(count: number): Promise<void> {
  return new Promise((resolve) => {
    const step = (remaining: number): void => {
      if (remaining <= 0) {
        resolve();
        return;
      }
      requestAnimationFrame(() => step(remaining - 1));
    };
    step(count);
  });
}

function required<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing required SSR Demo element #${id}.`);
  return element as T;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => {
    const entities: Readonly<Record<string, string>> = Object.freeze({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;"
    });
    return entities[character];
  });
}
