import { Color, Matrix, Quaternion, type SphericalHarmonics3, Vector3 } from "@galacean/engine-math";
import { Camera } from "../../Camera";
import { Engine } from "../../Engine";
import { Scene } from "../../Scene";
import { CameraClearFlags } from "../../enums/CameraClearFlags";
import { BackgroundMode } from "../../enums/BackgroundMode";
import { Mesh, type Buffer } from "../../graphic";
import { Material } from "../../material";
import { MeshRenderer, PrimitiveMesh } from "../../mesh";
import { Shader } from "../../shader";
import {
  SkyBoxMaterial,
  SkyProceduralMaterial,
  SunMode,
  type SkyProceduralVolumetricClouds,
  type SkyProceduralVolumetricCloudSnapshot
} from "../../sky";
import { RenderTarget, TextureCube, TextureCubeFace, TextureFilterMode, TextureFormat } from "../../texture";
import { DirectLight } from "../DirectLight";
import { DiffuseMode } from "../enums/DiffuseMode";
import { createRealtimeIBLPrefilterSchedule, type RealtimeIBLPrefilterFrame } from "./RealtimeIBLPrefilterSchedule";
import {
  createRealtimeIBLSourceMipmapSchedule,
  type RealtimeIBLSourceMipmapFrame
} from "./RealtimeIBLSourceMipmapSchedule";
import { RealtimeSphericalHarmonicsGPU } from "./RealtimeSphericalHarmonicsGPU";

const CAPTURE_FACE_COUNT = 6;
const PREFILTER_FRAME_COUNT = 12;
const SOURCE_MIPMAP_MAX_DRAW_COUNT = 24;
const SAMPLE_BATCH_SIZE = 32;
const SPHERICAL_HARMONICS_SOURCE_RESOLUTION = 16;

/** Individually measurable stage in one progressive real-time IBL update. */
export type RealtimeIBLBakerProfileStage =
  | "start"
  | "sh-project"
  | "source-capture"
  | "source-mipmap"
  | "ggx-prefilter"
  | "publish";

/** Optional observer used to profile stage boundaries without coupling the baker to a timer implementation. */
export interface RealtimeIBLBakerProfiler {
  /** Begin one synchronous stage sample. */
  beginSample(revision: number, frame: number, stage: RealtimeIBLBakerProfileStage): void;
  /** End the current synchronous stage sample. */
  endSample(): void;
}

/** Options for one progressive real-time environment IBL baker. */
export interface RealtimeIBLBakerOptions {
  /** Width and height of each published cubemap face. @defaultValue `128` */
  resolution?: number;
  /** GGX samples accumulated per roughness texel before publication. @defaultValue `64` */
  sampleCount?: number;
  /** Optional stage observer for diagnostics. */
  profiler?: RealtimeIBLBakerProfiler;
}

/** Current state of one progressively scheduled bake transaction. */
export interface RealtimeIBLBakerSnapshot {
  readonly phase: "idle" | "capture" | "prefilter" | "publish";
  readonly frame: number;
  readonly activeRevision: number | null;
  readonly pendingRevision: number | null;
  readonly publishedRevision: number;
  readonly progress: number;
  readonly resolution: number;
  readonly sampleCount: number;
}

interface SkySnapshotBase {
  revision: number;
  signature: string;
  mesh: Mesh;
}

interface ProceduralSkySnapshot extends SkySnapshotBase {
  kind: "procedural";
  sunEnabled: boolean;
  sunColor: Color;
  sunWorldRotation: Quaternion;
  sunDirection: Vector3;
  sunAtmosphereColor: Color;
  atmosphereThickness: number;
  atmosphereHeight: number;
  observerHeight: number;
  rayleighScattering: number;
  rayleighScaleHeight: number;
  mieScattering: number;
  mieScaleHeight: number;
  mieAnisotropy: number;
  scatteringIntensity: number;
  horizonHaze: number;
  atmosphereSampleCount: number;
  skyTint: Color;
  groundTint: Color;
  customSkyTintStrength: number;
  customSkyZenithTint: Color;
  customSkyHorizonTint: Color;
  exposure: number;
  twilightIntensity: number;
  starIntensity: number;
  starSize: number;
  starCount: number;
  airglowIntensity: number;
  starAxis: Vector3;
  starRotation: number;
  moonDirection: Vector3;
  moonColor: Color;
  moonDiskIntensity: number;
  moonAtmosphereIntensity: number;
  moonAngularRadius: number;
  volumetricClouds: SkyProceduralVolumetricClouds | null;
}

interface StaticSkySnapshot extends SkySnapshotBase {
  kind: "static";
  material: SkyBoxMaterial;
}

type SkySnapshot = ProceduralSkySnapshot | StaticSkySnapshot;

interface ActiveBake {
  snapshot: SkySnapshot;
  frame: number;
  stagingBuffer: number;
  sphericalHarmonicsComplete: boolean;
  volumetricCloudSnapshot: SkyProceduralVolumetricCloudSnapshot | null;
}

interface FirstBakeWaiter {
  resolve: (texture: TextureCube) => void;
  reject: (reason: Error) => void;
}

/**
 * Progressively bakes the Scene sky into diffuse SH and a GGX-prefiltered specular cubemap.
 *
 * @remarks
 * Every bake freezes one sky revision. Six frames capture the source faces, dependency-ordered source mips are packed
 * under texel and draw budgets, and twelve frames distribute cost-balanced GGX work into a staging cubemap. The final
 * frame projects the staging cubemap's 16-pixel mip into SH on the GPU, then atomically publishes diffuse and specular
 * lighting.
 *
 * Procedural captures intentionally exclude the visible sun disk. The Scene's analytic DirectLight owns solar direct
 * lighting and specular highlights; atmosphere scattering, clouds, stars, and non-analytic celestial radiance remain in
 * the environment capture. This keeps one source of truth for solar energy without changing the visible Scene sky.
 */
export class RealtimeIBLBaker {
  readonly resolution: number;
  readonly sampleCount: number;

  private readonly _engine: Engine;
  private readonly _sourceScene: Scene;
  private readonly _bakerScene: Scene;
  private readonly _camera: Camera;
  private readonly _planeRenderer: MeshRenderer;
  private readonly _planeMesh: Mesh;
  private readonly _bakerSkyMaterial: SkyProceduralMaterial;
  private readonly _bakerSun: DirectLight;
  private readonly _sourceTexture: TextureCube;
  private readonly _sourceRenderTarget: RenderTarget;
  private readonly _sphericalHarmonicsMipLevel: number;
  private readonly _sourceMipmapSchedule: readonly RealtimeIBLSourceMipmapFrame[];
  private readonly _prefilterSchedule: readonly RealtimeIBLPrefilterFrame[];
  private readonly _prefilterStartFrame: number;
  private readonly _shProjectFrame: number;
  private readonly _publishFrame: number;
  private readonly _accumulationTextures: readonly [TextureCube, TextureCube];
  private readonly _accumulationRenderTargets: readonly [RenderTarget, RenderTarget];
  private readonly _outputTextures: readonly [TextureCube, TextureCube];
  private readonly _outputRenderTargets: readonly [RenderTarget, RenderTarget];
  private readonly _accumulationMaterial: Material;
  private readonly _resolveMaterial: Material;
  private readonly _gpuSphericalHarmonics: RealtimeSphericalHarmonicsGPU;
  private readonly _profiler: RealtimeIBLBakerProfiler | undefined;
  private readonly _initialDiffuseMode: DiffuseMode;
  private readonly _initialSphericalHarmonics: SphericalHarmonics3 | undefined;
  private readonly _initialSpecularTexture: TextureCube | null;
  private readonly _captureViewMatrix = new Matrix();
  private readonly _firstBakeWaiters: FirstBakeWaiter[] = [];

  private _activeBake: ActiveBake | null = null;
  private _pendingSnapshot: SkySnapshot | null = null;
  private _latestSignature = "";
  private _latestRevision = 0;
  private _publishedRevision = 0;
  private _publishedBuffer = -1;
  private _destroyed = false;
  private _transition: {
    capture: () => boolean | void;
    restore: () => void;
    resolve: () => void;
    reject: (error: Error) => void;
    sourceSH: Buffer | null;
    target: ActiveBake | null;
    phase: "draining" | "baking" | "ready";
  } | null = null;

  /** Lock the output pair, drain A, then capture B without publishing it to the scene.
   * The synchronous callbacks must apply and restore the source sky without presenting a frame.
   * Capture may advance one offscreen dependency slice and return false to defer capture to a later update.
   * Call finishTransition or cancelTransition to release the pair after preparation.
   */
  prepareTransition(capture: () => boolean | void, restore: () => void): Promise<void> {
    this._assertAlive();
    if (this._transition) throw new Error("An IBL transition already owns the output pair");
    if (this._publishedBuffer < 0 && !this._pendingSnapshot && !this._activeBake) this.requestBake();
    // Compile the dual-specular variants while the visible clock still rests at A,
    // not on the first animated frame. Weight zero leaves A unchanged.
    const ambient = this._sourceScene.ambientLight;
    ambient.secondarySpecularTexture = ambient.specularTexture;
    ambient.specularTextureBlend = 0;
    return new Promise((resolve, reject) => {
      this._transition = { capture, restore, resolve, reject, sourceSH: null, target: null, phase: "draining" };
    });
  }

  /** Apply the same endpoint weight to GPU diffuse SH and specular reflections. */
  blendTransition(weight: number): void {
    if (this._transition?.phase !== "ready") throw new Error("IBL target is not ready");
    if (!Number.isFinite(weight) || weight < 0 || weight > 1) throw new RangeError("IBL blend must be 0–1");
    const ambient = this._sourceScene.ambientLight;
    ambient._setRealtimeSphericalHarmonicsBuffer(this._gpuSphericalHarmonics.blend(weight));
    ambient.specularTextureBlend = weight;
  }

  /** Publish B only once the visible transition has reached it. */
  finishTransition(): void {
    const transition = this._transition;
    if (transition?.phase !== "ready") throw new Error("IBL target is not ready");
    this._transition = null;
    this._clearSpecularBlend();
    this._publish(transition.target!);
  }

  /** Cancel preparation/blending and restore the locked A environment. */
  cancelTransition(error = new Error("IBL transition cancelled")): void {
    const transition = this._transition;
    if (!transition) return;
    this._transition = null;
    if (transition.phase === "baking" && this._activeBake) {
      this._releaseVolumetricCloudSnapshot(this._activeBake);
      this._activeBake = null;
    }
    if (transition.phase !== "draining") this._pendingSnapshot = null;
    if (transition.sourceSH) this._sourceScene.ambientLight._setRealtimeSphericalHarmonicsBuffer(transition.sourceSH);
    this._clearSpecularBlend();
    this._latestSignature = "";
    transition.reject(error);
  }

  private _clearSpecularBlend(): void {
    const ambient = this._sourceScene.ambientLight;
    ambient.secondarySpecularTexture = null;
    ambient.specularTextureBlend = 0;
  }

  constructor(scene: Scene, options: RealtimeIBLBakerOptions = {}) {
    const resolution = options.resolution ?? 128;
    const sampleCount = options.sampleCount ?? 64;
    validateOptions(resolution, sampleCount);

    const engine = (this._engine = scene.engine);
    if (!engine._hardwareRenderer.isWebGL2) {
      throw new Error("RealtimeIBLBaker requires WebGL2 cubemap mip rendering.");
    }
    this._sourceScene = scene;
    this.resolution = resolution;
    this.sampleCount = sampleCount;
    this._profiler = options.profiler;

    const ambientLight = scene.ambientLight;
    this._initialDiffuseMode = ambientLight.diffuseMode;
    this._initialSphericalHarmonics = ambientLight.diffuseSphericalHarmonics;
    this._initialSpecularTexture = ambientLight.specularTexture ?? null;

    const accumulationShader = Shader.find("Lighting/RealtimeIBLAccumulate");
    const resolveShader = Shader.find("Lighting/RealtimeIBLResolve");
    if (!accumulationShader || !resolveShader) {
      throw new Error("RealtimeIBLBaker shaders are not registered. Run the shader precompile step before use.");
    }
    this._accumulationMaterial = new Material(engine, accumulationShader);
    this._resolveMaterial = new Material(engine, resolveShader);

    const bakerScene = (this._bakerScene = new Scene(engine));
    bakerScene.name = "Realtime IBL Baker";
    bakerScene.isActive = false;
    bakerScene.background.solidColor.set(0, 0, 0, 1);
    engine.sceneManager.addScene(bakerScene);

    const root = bakerScene.createRootEntity("Realtime IBL Baker");
    const camera = (this._camera = root.addComponent(Camera));
    camera.enabled = false;
    camera.enableFrustumCulling = false;
    camera.enableHDR = true;
    camera.isAlphaOutputRequired = true;
    camera.enablePostProcess = false;
    camera.fieldOfView = 90;
    camera.aspectRatio = 1;
    camera.clearFlags = CameraClearFlags.Color;

    const sunEntity = root.createChild("Realtime IBL Sun");
    this._bakerSun = sunEntity.addComponent(DirectLight);
    bakerScene.sun = this._bakerSun;

    const planeEntity = root.createChild("Realtime IBL Fullscreen Plane");
    planeEntity.isActive = false;
    const planeRenderer = (this._planeRenderer = planeEntity.addComponent(MeshRenderer));
    const planeMesh = (this._planeMesh = PrimitiveMesh.createPlane(engine, 2, 2));
    planeRenderer.mesh = planeMesh;
    planeRenderer.setMaterial(this._resolveMaterial);

    const bakerSkyMaterial = (this._bakerSkyMaterial = new SkyProceduralMaterial(engine));
    // Visible stars may scintillate, but one progressive six-face environment bake must remain temporally coherent.
    bakerSkyMaterial.starTwinkleIntensity = 0;
    // Cubemap texels are much wider than visible procedural stars. Integrate each Gaussian star over the capture
    // footprint while preserving its angular energy instead of relying on an unstable point sample.
    bakerSkyMaterial._setStarPixelFootprintFilterEnabled(true);
    bakerScene.background.sky.material = bakerSkyMaterial;

    const sourceTexture = (this._sourceTexture = createCubemap(engine, resolution, true, TextureFilterMode.Point));
    this._sourceRenderTarget = createRenderTarget(engine, resolution, sourceTexture);
    const sphericalHarmonicsSourceResolution = Math.min(resolution, SPHERICAL_HARMONICS_SOURCE_RESOLUTION);
    this._sphericalHarmonicsMipLevel = Math.log2(resolution / sphericalHarmonicsSourceResolution);
    this._sourceMipmapSchedule = createRealtimeIBLSourceMipmapSchedule({
      resolution,
      mipCount: sourceTexture.mipmapCount,
      maximumDrawCount: SOURCE_MIPMAP_MAX_DRAW_COUNT
    });
    this._prefilterStartFrame = CAPTURE_FACE_COUNT + this._sourceMipmapSchedule.length;
    this._shProjectFrame = this._prefilterStartFrame + PREFILTER_FRAME_COUNT;
    this._publishFrame = this._shProjectFrame;
    this._prefilterSchedule = createRealtimeIBLPrefilterSchedule({
      resolution,
      mipCount: sourceTexture.mipmapCount,
      sampleCount,
      sampleBatchSize: SAMPLE_BATCH_SIZE,
      frameCount: PREFILTER_FRAME_COUNT
    });
    this._gpuSphericalHarmonics = new RealtimeSphericalHarmonicsGPU(
      engine,
      ambientLight._getDiffuseSphericalHarmonicsData()
    );
    this._gpuSphericalHarmonics.warmUp(sourceTexture, 0, ambientLight._getDiffuseSphericalHarmonicsData());

    const accumulationTexture0 = createCubemap(engine, resolution, true, TextureFilterMode.Point);
    const accumulationTexture1 = createCubemap(engine, resolution, true, TextureFilterMode.Point);
    this._accumulationTextures = [accumulationTexture0, accumulationTexture1];
    this._accumulationRenderTargets = [
      createRenderTarget(engine, resolution, accumulationTexture0),
      createRenderTarget(engine, resolution, accumulationTexture1)
    ];

    const outputTexture0 = createCubemap(engine, resolution, true, TextureFilterMode.Trilinear);
    const outputTexture1 = createCubemap(engine, resolution, true, TextureFilterMode.Trilinear);
    outputTexture0.name = "RealtimeIBL-0";
    outputTexture1.name = "RealtimeIBL-1";
    this._outputTextures = [outputTexture0, outputTexture1];
    this._outputRenderTargets = [
      createRenderTarget(engine, resolution, outputTexture0),
      createRenderTarget(engine, resolution, outputTexture1)
    ];
  }

  /** Queue the current procedural or static sky as the newest bake revision. */
  requestBake(): number {
    this._assertAlive();
    if (this._transition) return this._latestRevision;
    const snapshot = this._captureSnapshot();
    if (snapshot.signature === this._latestSignature) {
      return this._latestRevision;
    }

    snapshot.revision = ++this._latestRevision;
    this._latestSignature = snapshot.signature;
    this._pendingSnapshot = snapshot;
    return snapshot.revision;
  }

  /** Process exactly one frame in the generated bake schedule. */
  update(): void {
    this._assertAlive();
    try {
      this._update();
    } catch (error) {
      if (!this._transition) throw error;
      this.cancelTransition(error instanceof Error ? error : new Error(String(error)));
    }
  }

  private _update(): void {
    const transition = this._transition;
    if (transition?.phase === "ready") return;
    if (transition?.phase === "draining" && !this._activeBake && !this._pendingSnapshot) {
      let preparedDependency = false;
      try {
        transition.sourceSH = this._sourceScene.ambientLight._realtimeSphericalHarmonicsBuffer;
        try {
          // False means a dependency (e.g. target cloud cache) advanced one frame but is not ready yet.
          // Always restore A before returning; never spin through preparation in a single frame.
          const ready = transition.capture();
          if (ready === false) return;
          preparedDependency = ready === true;
          const snapshot = this._captureSnapshot();
          snapshot.revision = ++this._latestRevision;
          this._latestSignature = snapshot.signature;
          this._pendingSnapshot = snapshot;
        } finally {
          transition.restore();
        }
        transition.phase = "baking";
      } catch (error) {
        this._pendingSnapshot = null;
        this.cancelTransition(error instanceof Error ? error : new Error(String(error)));
        return;
      }
      // The last cloud slice and first cubemap face must not land on the same frame.
      if (preparedDependency) return;
    }
    if (!this._activeBake && this._pendingSnapshot) {
      const pendingSnapshot = this._pendingSnapshot;
      const profiler = this._profiler;
      profiler?.beginSample(pendingSnapshot.revision, 0, "start");
      try {
        this._startPendingBake();
      } finally {
        profiler?.endSample();
      }
    }
    const activeBake = this._activeBake;
    if (!activeBake) {
      return;
    }

    if (activeBake.frame <= this._shProjectFrame) {
      this._processGpuFrameWithBakerScene(activeBake);
    }
    if (activeBake.frame === this._publishFrame && activeBake.sphericalHarmonicsComplete) {
      const profiler = this._profiler;
      profiler?.beginSample(activeBake.snapshot.revision, activeBake.frame, "publish");
      try {
        this._publish(activeBake);
      } finally {
        profiler?.endSample();
      }
      this._activeBake = null;
    } else if (activeBake.frame < this._publishFrame) {
      activeBake.frame++;
    }
  }

  /** Current active revision without allocating a diagnostic snapshot. */
  get activeRevision(): number | null {
    return this._activeBake?.snapshot.revision ?? null;
  }

  /** Newest queued revision without allocating a diagnostic snapshot. */
  get pendingRevision(): number | null {
    return this._pendingSnapshot?.revision ?? null;
  }

  /** Current progressive schedule frame, or `-1` while idle. */
  get frame(): number {
    return this._activeBake?.frame ?? -1;
  }

  /** Whether no active or queued bake work remains. */
  get isIdle(): boolean {
    return this._transition === null && this._activeBake === null && this._pendingSnapshot === null;
  }

  /** Resolves with the first fully published specular cubemap. */
  waitForFirstBake(): Promise<TextureCube> {
    if (this._publishedBuffer >= 0) {
      return Promise.resolve(this._outputTextures[this._publishedBuffer]);
    }
    if (this._destroyed) {
      return Promise.reject(new Error("RealtimeIBLBaker was destroyed before publishing."));
    }
    return new Promise<TextureCube>((resolve, reject) => this._firstBakeWaiters.push({ resolve, reject }));
  }

  /** Return a detached status snapshot for diagnostics. */
  getSnapshot(): RealtimeIBLBakerSnapshot {
    const active = this._activeBake;
    const frame = active?.frame ?? -1;
    return {
      phase:
        frame < 0
          ? "idle"
          : frame < CAPTURE_FACE_COUNT
            ? "capture"
            : frame < this._shProjectFrame
              ? "prefilter"
              : "publish",
      frame,
      activeRevision: active?.snapshot.revision ?? null,
      pendingRevision: this._pendingSnapshot?.revision ?? null,
      publishedRevision: this._publishedRevision,
      progress: active ? frame / this._publishFrame : this._publishedRevision > 0 ? 1 : 0,
      resolution: this.resolution,
      sampleCount: this.sampleCount
    };
  }

  /** Restore the scene's original ambient assets and release all runtime-owned GPU resources. */
  destroy(): void {
    if (this._destroyed) {
      return;
    }
    this.cancelTransition();
    this._destroyed = true;
    const ambientLight = this._sourceScene.ambientLight;
    if (this._gpuSphericalHarmonics.ownsCurrentBuffer(ambientLight._realtimeSphericalHarmonicsBuffer)) {
      ambientLight._setRealtimeSphericalHarmonicsBuffer(null);
      ambientLight.diffuseSphericalHarmonics = this._initialSphericalHarmonics!;
      ambientLight.diffuseMode = this._initialDiffuseMode;
    }
    if (
      ambientLight.specularTexture === this._outputTextures[0] ||
      ambientLight.specularTexture === this._outputTextures[1]
    ) {
      ambientLight.specularTexture = this._initialSpecularTexture!;
    }

    this._camera.renderTarget = null;
    if (this._activeBake) this._releaseVolumetricCloudSnapshot(this._activeBake);
    this._bakerScene.destroy();
    this._sourceRenderTarget.destroy(true);
    this._accumulationRenderTargets[0].destroy(true);
    this._accumulationRenderTargets[1].destroy(true);
    this._outputRenderTargets[0].destroy(true);
    this._outputRenderTargets[1].destroy(true);
    this._sourceTexture.destroy(true);
    this._accumulationTextures[0].destroy(true);
    this._accumulationTextures[1].destroy(true);
    this._outputTextures[0].destroy(true);
    this._outputTextures[1].destroy(true);
    this._planeMesh.destroy(true);
    this._accumulationMaterial.destroy(true);
    this._resolveMaterial.destroy(true);
    this._bakerSkyMaterial.destroy(true);
    this._gpuSphericalHarmonics.destroy();

    const error = new Error("RealtimeIBLBaker was destroyed before publishing.");
    for (let i = 0; i < this._firstBakeWaiters.length; i++) {
      this._firstBakeWaiters[i].reject(error);
    }
    this._firstBakeWaiters.length = 0;
  }

  private _captureSnapshot(): SkySnapshot {
    const sourceScene = this._sourceScene;
    const material = sourceScene.background.sky.material;
    const mesh = sourceScene.background.sky.mesh;
    if (sourceScene.background.mode !== BackgroundMode.Sky || !mesh) {
      throw new Error("RealtimeIBLBaker requires an active Scene sky and mesh.");
    }

    if (material instanceof SkyBoxMaterial) {
      const texture = material.texture;
      if (!texture) {
        throw new Error("RealtimeIBLBaker requires the static skybox to have a TextureCube.");
      }
      const secondaryTexture = material.secondaryTexture;
      return {
        kind: "static",
        revision: 0,
        signature: [
          "static",
          material.instanceId,
          mesh.instanceId,
          texture.instanceId,
          secondaryTexture?.instanceId ?? 0,
          material.textureBlend,
          material.rotation,
          material.exposure,
          material.tintColor.r,
          material.tintColor.g,
          material.tintColor.b,
          material.tintColor.a
        ].join("|"),
        mesh,
        material
      };
    }

    const sun = sourceScene.sun;
    if (!(material instanceof SkyProceduralMaterial) || !sun) {
      throw new Error("RealtimeIBLBaker supports SkyProceduralMaterial or SkyBoxMaterial Scene skies.");
    }
    const direction = sun.direction;
    const color = sun.color;
    const signature = [
      material.instanceId,
      mesh.instanceId,
      sun.enabled ? 1 : 0,
      direction.x,
      direction.y,
      direction.z,
      color.r,
      color.g,
      color.b,
      color.a,
      material.sunDirection.x,
      material.sunDirection.y,
      material.sunDirection.z,
      material.sunAtmosphereColor.r,
      material.sunAtmosphereColor.g,
      material.sunAtmosphereColor.b,
      material.atmosphereThickness,
      material.atmosphereHeight,
      material.observerHeight,
      material.rayleighScattering,
      material.rayleighScaleHeight,
      material.mieScattering,
      material.mieScaleHeight,
      material.mieAnisotropy,
      material.scatteringIntensity,
      material.horizonHaze,
      material.atmosphereSampleCount,
      material.skyTint.r,
      material.skyTint.g,
      material.skyTint.b,
      material.groundTint.r,
      material.groundTint.g,
      material.groundTint.b,
      material.customSkyTintStrength,
      material.customSkyZenithTint.r,
      material.customSkyZenithTint.g,
      material.customSkyZenithTint.b,
      material.customSkyHorizonTint.r,
      material.customSkyHorizonTint.g,
      material.customSkyHorizonTint.b,
      material.exposure,
      material.twilightIntensity,
      material.starIntensity,
      material.starSize,
      material.starCount,
      material.airglowIntensity,
      material.starAxis.x,
      material.starAxis.y,
      material.starAxis.z,
      material.starRotation,
      material.moonDirection.x,
      material.moonDirection.y,
      material.moonDirection.z,
      material.moonColor.r,
      material.moonColor.g,
      material.moonColor.b,
      material.moonDiskIntensity,
      material.moonAtmosphereIntensity,
      material.moonAngularRadius,
      material._volumetricCloudsSignature
    ].join("|");
    return {
      kind: "procedural",
      revision: 0,
      signature,
      mesh,
      sunEnabled: sun.enabled,
      sunColor: color.clone(),
      sunWorldRotation: sun.entity.transform.worldRotationQuaternion.clone(),
      sunDirection: material.sunDirection.clone(),
      sunAtmosphereColor: material.sunAtmosphereColor.clone(),
      atmosphereThickness: material.atmosphereThickness,
      atmosphereHeight: material.atmosphereHeight,
      observerHeight: material.observerHeight,
      rayleighScattering: material.rayleighScattering,
      rayleighScaleHeight: material.rayleighScaleHeight,
      mieScattering: material.mieScattering,
      mieScaleHeight: material.mieScaleHeight,
      mieAnisotropy: material.mieAnisotropy,
      scatteringIntensity: material.scatteringIntensity,
      horizonHaze: material.horizonHaze,
      atmosphereSampleCount: material.atmosphereSampleCount,
      skyTint: material.skyTint.clone(),
      groundTint: material.groundTint.clone(),
      customSkyTintStrength: material.customSkyTintStrength,
      customSkyZenithTint: material.customSkyZenithTint.clone(),
      customSkyHorizonTint: material.customSkyHorizonTint.clone(),
      exposure: material.exposure,
      twilightIntensity: material.twilightIntensity,
      starIntensity: material.starIntensity,
      starSize: material.starSize,
      starCount: material.starCount,
      airglowIntensity: material.airglowIntensity,
      starAxis: material.starAxis.clone(),
      starRotation: material.starRotation,
      moonDirection: material.moonDirection.clone(),
      moonColor: material.moonColor.clone(),
      moonDiskIntensity: material.moonDiskIntensity,
      moonAtmosphereIntensity: material.moonAtmosphereIntensity,
      moonAngularRadius: material.moonAngularRadius,
      volumetricClouds: material.volumetricClouds
    };
  }

  private _startPendingBake(): void {
    const snapshot = this._pendingSnapshot!;
    const volumetricCloudSnapshot =
      snapshot.kind === "procedural" && snapshot.volumetricClouds
        ? snapshot.volumetricClouds._acquireSkyCompositionSnapshot()
        : null;
    if (snapshot.kind === "procedural" && snapshot.volumetricClouds && !volumetricCloudSnapshot) return;

    this._pendingSnapshot = null;
    this._activeBake = {
      snapshot,
      frame: 0,
      stagingBuffer: this._publishedBuffer === 0 ? 1 : 0,
      sphericalHarmonicsComplete: false,
      volumetricCloudSnapshot
    };
    this._sourceTexture.filterMode = TextureFilterMode.Point;

    this._bakerScene.background.sky.mesh = snapshot.mesh;
    this._bakerScene.background.mode = BackgroundMode.Sky;
    if (snapshot.kind === "procedural") {
      const material = this._bakerSkyMaterial;
      material.atmosphereThickness = snapshot.atmosphereThickness;
      material.atmosphereHeight = snapshot.atmosphereHeight;
      material.observerHeight = snapshot.observerHeight;
      material.rayleighScattering = snapshot.rayleighScattering;
      material.rayleighScaleHeight = snapshot.rayleighScaleHeight;
      material.mieScattering = snapshot.mieScattering;
      material.mieScaleHeight = snapshot.mieScaleHeight;
      material.mieAnisotropy = snapshot.mieAnisotropy;
      material.scatteringIntensity = snapshot.scatteringIntensity;
      material.horizonHaze = snapshot.horizonHaze;
      material.atmosphereSampleCount = snapshot.atmosphereSampleCount;
      material.skyTint = snapshot.skyTint;
      material.groundTint = snapshot.groundTint;
      material.customSkyTintStrength = snapshot.customSkyTintStrength;
      material.customSkyZenithTint = snapshot.customSkyZenithTint;
      material.customSkyHorizonTint = snapshot.customSkyHorizonTint;
      material.exposure = snapshot.exposure;
      material.twilightIntensity = snapshot.twilightIntensity;
      material.starIntensity = snapshot.starIntensity;
      material.starSize = snapshot.starSize;
      material.starCount = snapshot.starCount;
      material.airglowIntensity = snapshot.airglowIntensity;
      material.starAxis.copyFrom(snapshot.starAxis);
      material.starRotation = snapshot.starRotation;
      material.moonDirection.copyFrom(snapshot.moonDirection);
      material.moonColor.copyFrom(snapshot.moonColor);
      material.sunMode = SunMode.None;
      material.sunDirection.copyFrom(snapshot.sunDirection);
      material.sunAtmosphereColor.copyFrom(snapshot.sunAtmosphereColor);
      material.moonDiskIntensity = snapshot.moonDiskIntensity;
      material.moonAtmosphereIntensity = snapshot.moonAtmosphereIntensity;
      material.moonAngularRadius = snapshot.moonAngularRadius;
      material._setVolumetricCloudSnapshot(volumetricCloudSnapshot);
      this._bakerScene.background.sky.material = material;
      this._bakerSun.enabled = snapshot.sunEnabled;
      this._bakerSun.color.copyFrom(snapshot.sunColor);
      this._bakerSun.entity.transform.worldRotationQuaternion = snapshot.sunWorldRotation;
    } else {
      this._bakerSkyMaterial._setVolumetricCloudSnapshot(null);
      this._bakerScene.background.sky.material = snapshot.material;
      this._bakerSun.enabled = false;
    }

    const ambientLight = this._sourceScene.ambientLight;
    if (!this._gpuSphericalHarmonics.ownsCurrentBuffer(ambientLight._realtimeSphericalHarmonicsBuffer)) {
      this._gpuSphericalHarmonics.resetCurrent(ambientLight._getDiffuseSphericalHarmonicsData());
    }
  }

  private _processGpuFrame(activeBake: ActiveBake): void {
    const frame = activeBake.frame;
    const profiler = this._profiler;
    const revision = activeBake.snapshot.revision;
    try {
      if (frame < CAPTURE_FACE_COUNT) {
        profiler?.beginSample(revision, frame, "source-capture");
        this._captureSourceFace(activeBake, frame);
      } else if (frame < this._prefilterStartFrame) {
        profiler?.beginSample(revision, frame, "source-mipmap");
        this._processSourceMipmapFrame(frame);
      } else if (frame < this._shProjectFrame) {
        profiler?.beginSample(revision, frame, "ggx-prefilter");
        this._processPrefilterFrame(activeBake);
      } else {
        profiler?.beginSample(revision, frame, "sh-project");
        const stagingTexture = this._outputTextures[activeBake.stagingBuffer];
        stagingTexture.filterMode = TextureFilterMode.Point;
        try {
          this._gpuSphericalHarmonics.project(stagingTexture, this._sphericalHarmonicsMipLevel);
        } finally {
          stagingTexture.filterMode = TextureFilterMode.Trilinear;
        }
        activeBake.sphericalHarmonicsComplete = true;
      }
    } finally {
      profiler?.endSample();
    }
  }

  private _processSourceMipmapFrame(frame: number): void {
    const scheduleFrame = this._sourceMipmapSchedule[frame - CAPTURE_FACE_COUNT];
    for (let i = 0; i < scheduleFrame.mips.length; i++) {
      this._downsampleSourceMip(scheduleFrame.mips[i]);
    }
    if (frame === this._prefilterStartFrame - 1) {
      this._sourceTexture.filterMode = TextureFilterMode.Trilinear;
    }
  }

  private _downsampleSourceMip(mip: number): void {
    const shaderData = this._resolveMaterial.shaderData;
    shaderData.setTexture("material_SourceMap", this._sourceTexture);
    shaderData.setFloat("material_SourceLod", mip - 1);
    shaderData.setFloat("material_ResolveAccumulation", 0);
    shaderData.setFloat("material_Downsample", 1);
    shaderData.setFloat("material_TargetSize", Math.max(1, this.resolution / 2 ** mip));
    for (let face = 0; face < 6; face++) {
      shaderData.setFloat("material_Face", face);
      this._renderPlane(this._resolveMaterial, this._accumulationRenderTargets[0], face, mip);
    }

    shaderData.setTexture("material_SourceMap", this._accumulationTextures[0]);
    shaderData.setFloat("material_SourceLod", mip);
    shaderData.setFloat("material_Downsample", 0);
    for (let face = 0; face < 6; face++) {
      shaderData.setFloat("material_Face", face);
      this._renderPlane(this._resolveMaterial, this._sourceRenderTarget, face, mip);
    }
  }

  private _captureSourceFace(activeBake: ActiveBake, face: number): void {
    try {
      this._planeRenderer.entity.isActive = false;
      this._bakerScene.background.mode = BackgroundMode.Sky;
      this._camera.renderTarget = this._sourceRenderTarget;
      this._setCaptureView(face);
      this._camera.render(TextureCubeFace.PositiveX + face);

      const shaderData = this._resolveMaterial.shaderData;
      shaderData.setTexture("material_SourceMap", this._sourceTexture);
      shaderData.setFloat("material_Face", face);
      shaderData.setFloat("material_SourceLod", 0);
      shaderData.setFloat("material_ResolveAccumulation", 0);
      shaderData.setFloat("material_Downsample", 0);
      this._renderPlane(this._resolveMaterial, this._outputRenderTargets[activeBake.stagingBuffer], face, 0);
    } finally {
      if (face === CAPTURE_FACE_COUNT - 1) this._releaseVolumetricCloudSnapshot(activeBake);
    }
  }

  private _processPrefilterFrame(activeBake: ActiveBake): void {
    const frame = this._prefilterSchedule[activeBake.frame - this._prefilterStartFrame];
    for (let i = 0; i < frame.items.length; i++) {
      const item = frame.items[i];
      this._accumulateBatch(item.face, item.mip, item.batchIndex);
      if (item.resolveSurface) {
        this._resolveSurface(activeBake.stagingBuffer, item.face, item.mip, item.batchIndex & 1);
      }
    }
  }

  private _accumulateBatch(face: number, mip: number, batchIndex: number): void {
    const writeBuffer = batchIndex & 1;
    const readBuffer = writeBuffer ^ 1;
    const shaderData = this._accumulationMaterial.shaderData;
    shaderData.setTexture("material_EnvironmentMap", this._sourceTexture);
    shaderData.setTexture("material_PreviousAccumulationMap", this._accumulationTextures[readBuffer]);
    shaderData.setFloat("material_Face", face);
    shaderData.setFloat("material_Roughness", mip / (this._sourceTexture.mipmapCount - 1));
    shaderData.setFloat("material_EnvironmentSize", this.resolution);
    shaderData.setFloat("material_AccumulationLod", mip);
    shaderData.setFloat("material_SampleOffset", batchIndex * SAMPLE_BATCH_SIZE);
    shaderData.setFloat("material_TotalSampleCount", this.sampleCount);
    this._renderPlane(this._accumulationMaterial, this._accumulationRenderTargets[writeBuffer], face, mip);
  }

  private _resolveSurface(stagingBuffer: number, face: number, mip: number, accumulationBuffer: number): void {
    const shaderData = this._resolveMaterial.shaderData;
    shaderData.setTexture("material_SourceMap", this._accumulationTextures[accumulationBuffer]);
    shaderData.setFloat("material_Face", face);
    shaderData.setFloat("material_SourceLod", mip);
    shaderData.setFloat("material_ResolveAccumulation", 1);
    shaderData.setFloat("material_Downsample", 0);
    this._renderPlane(this._resolveMaterial, this._outputRenderTargets[stagingBuffer], face, mip);
  }

  private _renderPlane(material: Material, target: RenderTarget, face: number, mip: number): void {
    this._bakerScene.background.mode = BackgroundMode.SolidColor;
    this._planeRenderer.setMaterial(material);
    this._planeRenderer.entity.isActive = true;
    this._camera.renderTarget = target;
    this._camera.render(TextureCubeFace.PositiveX + face, mip);
  }

  private _publish(activeBake: ActiveBake): void {
    const ambientLight = this._sourceScene.ambientLight;
    const transition = this._transition;
    if (transition?.phase === "baking") {
      this._gpuSphericalHarmonics.prepareBlend(transition.sourceSH!, this._gpuSphericalHarmonics.currentBuffer);
      ambientLight.secondarySpecularTexture = this._outputTextures[activeBake.stagingBuffer];
      ambientLight.specularTextureBlend = 0;
      transition.target = activeBake;
      transition.phase = "ready";
      transition.resolve();
      return;
    }
    ambientLight.diffuseMode = DiffuseMode.SphericalHarmonics;
    ambientLight._setRealtimeSphericalHarmonicsBuffer(this._gpuSphericalHarmonics.currentBuffer);
    ambientLight.specularTexture = this._outputTextures[activeBake.stagingBuffer];
    this._publishedBuffer = activeBake.stagingBuffer;
    this._publishedRevision = activeBake.snapshot.revision;
    const texture = this._outputTextures[this._publishedBuffer];
    for (let i = 0; i < this._firstBakeWaiters.length; i++) {
      this._firstBakeWaiters[i].resolve(texture);
    }
    this._firstBakeWaiters.length = 0;
    if (
      activeBake.snapshot.kind === "static" &&
      this._bakerScene.background.sky.material === activeBake.snapshot.material
    ) {
      this._bakerScene.background.sky.material = this._bakerSkyMaterial;
    }
  }

  private _releaseVolumetricCloudSnapshot(activeBake: ActiveBake): void {
    const snapshot = activeBake.volumetricCloudSnapshot;
    if (!snapshot) return;
    this._bakerSkyMaterial._setVolumetricCloudSnapshot(null);
    snapshot.release();
    activeBake.volumetricCloudSnapshot = null;
  }

  private _setCaptureView(face: number): void {
    const basis = CUBE_FACE_BASES[face];
    Matrix.lookAt(CAPTURE_ORIGIN, basis.forward, basis.up, this._captureViewMatrix);
    this._camera.viewMatrix = this._captureViewMatrix;
  }

  private _processGpuFrameWithBakerScene(activeBake: ActiveBake): void {
    this._bakerScene.isActive = true;
    try {
      this._bakerScene._updateShaderData();
      this._processGpuFrame(activeBake);
    } finally {
      this._planeRenderer.entity.isActive = false;
      this._bakerScene.isActive = false;
    }
  }

  private _assertAlive(): void {
    if (this._destroyed) {
      throw new Error("RealtimeIBLBaker has been destroyed.");
    }
  }
}

const CAPTURE_ORIGIN = new Vector3();
const CUBE_FACE_BASES = [
  { forward: new Vector3(1, 0, 0), up: new Vector3(0, -1, 0) },
  { forward: new Vector3(-1, 0, 0), up: new Vector3(0, -1, 0) },
  { forward: new Vector3(0, 1, 0), up: new Vector3(0, 0, 1) },
  { forward: new Vector3(0, -1, 0), up: new Vector3(0, 0, -1) },
  { forward: new Vector3(0, 0, 1), up: new Vector3(0, -1, 0) },
  { forward: new Vector3(0, 0, -1), up: new Vector3(0, -1, 0) }
] as const;

function createCubemap(
  engine: Engine,
  resolution: number,
  mipmap: boolean,
  filterMode: TextureFilterMode
): TextureCube {
  const texture = new TextureCube(engine, resolution, TextureFormat.R16G16B16A16, mipmap, false);
  texture.filterMode = filterMode;
  return texture;
}

function createRenderTarget(engine: Engine, resolution: number, texture: TextureCube): RenderTarget {
  const renderTarget = new RenderTarget(engine, resolution, resolution, texture);
  renderTarget.autoGenerateMipmaps = false;
  return renderTarget;
}

function validateOptions(resolution: number, sampleCount: number): void {
  if (!Number.isInteger(resolution) || resolution < 2 || (resolution & (resolution - 1)) !== 0) {
    throw new RangeError("RealtimeIBLBaker resolution must be a power-of-two integer greater than one.");
  }
  if (!Number.isInteger(sampleCount) || sampleCount < SAMPLE_BATCH_SIZE || sampleCount % SAMPLE_BATCH_SIZE !== 0) {
    throw new RangeError(`RealtimeIBLBaker sampleCount must be a multiple of ${SAMPLE_BATCH_SIZE}.`);
  }
}
