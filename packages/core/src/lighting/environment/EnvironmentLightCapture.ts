import { Color, Matrix, Quaternion, type SphericalHarmonics3, Vector3 } from "@galacean/engine-math";
import { Camera } from "../../Camera";
import { Engine } from "../../Engine";
import { Scene } from "../../Scene";
import { GLCapabilityType } from "../../base/Constant";
import { CameraClearFlags } from "../../enums/CameraClearFlags";
import { BackgroundMode } from "../../enums/BackgroundMode";
import { Mesh } from "../../graphic";
import { Material } from "../../material";
import { MeshRenderer, PrimitiveMesh } from "../../mesh";
import { Shader } from "../../shader";
import { SkyEnvironmentCaptureMacro } from "../../sky";
import { RenderTarget, TextureCube, TextureCubeFace, TextureFilterMode, TextureFormat } from "../../texture";
import { AmbientLight } from "../AmbientLight";
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
export type EnvironmentLightCaptureProfileStage =
  | "start"
  | "sh-project"
  | "source-capture"
  | "source-mipmap"
  | "ggx-prefilter"
  | "publish";

/** Optional observer used to profile stage boundaries without coupling environment capture to a timer implementation. */
export interface EnvironmentLightCaptureProfiler {
  /** Begin one synchronous stage sample. */
  beginSample(revision: number, frame: number, stage: EnvironmentLightCaptureProfileStage): void;
  /** End the current synchronous stage sample. */
  endSample(): void;
}

/** Options for one progressive real-time environment-light capture. */
export interface EnvironmentLightCaptureOptions {
  /** Width and height of each published cubemap face. @defaultValue `128` */
  resolution?: number;
  /** GGX samples accumulated per roughness texel before publication. @defaultValue `64` */
  sampleCount?: number;
  /**
   * Whether environment capture includes a sky shader's solar disk. @defaultValue `false`
   * @remarks
   * Sky shaders can distinguish environment capture with `SCENE_ENVIRONMENT_CAPTURE` and inspect
   * `SCENE_ENVIRONMENT_CAPTURE_INCLUDE_SUN` before drawing an analytic solar disk. This does not remove a disk that is
   * already authored into a static cubemap.
   */
  includeSun?: boolean;
  /** Optional stage observer for diagnostics. */
  profiler?: EnvironmentLightCaptureProfiler;
}

/** Current state of one progressively scheduled environment update. */
export interface EnvironmentLightCaptureSnapshot {
  readonly phase: "idle" | "capture" | "prefilter" | "publish";
  readonly frame: number;
  readonly activeRevision: number | null;
  readonly pendingRevision: number | null;
  readonly publishedRevision: number;
  readonly progress: number;
  readonly resolution: number;
  readonly sampleCount: number;
  readonly includeSun: boolean;
}

interface SkySnapshot {
  revision: number;
  mesh: Mesh;
  material: Material;
  sunEnabled: boolean;
  sunColor: Color;
  sunWorldRotation: Quaternion;
}

interface ActiveBake {
  snapshot: SkySnapshot;
  frame: number;
  stagingBuffer: number;
  sphericalHarmonicsComplete: boolean;
}

interface FirstBakeWaiter {
  resolve: (texture: TextureCube) => void;
  reject: (reason: Error) => void;
}

/**
 * Progressively captures and convolves the Scene sky into diffuse SH and a GGX-prefiltered specular cubemap.
 *
 * @remarks
 * Every update freezes one sky revision. Six frames capture the source faces, dependency-ordered source mips are packed
 * under texel and draw budgets, and twelve frames distribute cost-balanced GGX work into a staging cubemap. The final
 * frame projects the source cubemap's 16-pixel mip into SH on the GPU, then atomically publishes diffuse and specular
 * lighting. Call {@link EnvironmentLightCapture.requestUpdate} to enqueue a revision, then call
 * {@link EnvironmentLightCapture.update} once per frame until it is published.
 *
 * A revision clones the sky Material and snapshots `Scene.sun`. Custom sky parameters that must remain stable during
 * capture should therefore live in the sky Material's shader data. Arbitrary Scene shader data is intentionally not
 * copied into the private capture Scene because it can contain unrelated lighting, fog, and render-state ownership.
 */
export class EnvironmentLightCapture {
  readonly resolution: number;
  readonly sampleCount: number;
  readonly includeSun: boolean;

  private static readonly _owners = new WeakMap<AmbientLight, EnvironmentLightCapture>();

  private readonly _engine: Engine;
  private readonly _sourceScene: Scene;
  private readonly _ambientLight: AmbientLight;
  private readonly _bakerScene: Scene;
  private readonly _camera: Camera;
  private readonly _planeRenderer: MeshRenderer;
  private readonly _planeMesh: Mesh;
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
  private readonly _profiler: EnvironmentLightCaptureProfiler | undefined;
  private readonly _initialDiffuseMode: DiffuseMode;
  private readonly _initialSphericalHarmonics: SphericalHarmonics3 | undefined;
  private readonly _initialSpecularTexture: TextureCube | null;
  private readonly _captureViewMatrix = new Matrix();
  private readonly _firstBakeWaiters: FirstBakeWaiter[] = [];

  private _activeBake: ActiveBake | null = null;
  private _pendingSnapshot: SkySnapshot | null = null;
  private _latestRevision = 0;
  private _publishedRevision = 0;
  private _publishedBuffer = -1;
  private _destroyed = false;

  constructor(scene: Scene, options: EnvironmentLightCaptureOptions = {}) {
    const resolution = options.resolution ?? 128;
    const sampleCount = options.sampleCount ?? 64;
    validateOptions(resolution, sampleCount);

    const engine = (this._engine = scene.engine);
    if (!engine._hardwareRenderer.isWebGL2) {
      throw new Error("EnvironmentLightCapture requires WebGL2 cubemap mip rendering.");
    }
    if (
      !engine._hardwareRenderer.canIUse(GLCapabilityType.textureHalfFloat) ||
      !engine._hardwareRenderer.canIUse(GLCapabilityType.colorBufferHalfFloat)
    ) {
      throw new Error("EnvironmentLightCapture requires renderable half-float textures.");
    }
    const ambientLight = scene.ambientLight;
    if (EnvironmentLightCapture._owners.has(ambientLight)) {
      throw new Error("EnvironmentLightCapture requires exclusive ownership of the Scene AmbientLight.");
    }
    this._sourceScene = scene;
    this._ambientLight = ambientLight;
    this.resolution = resolution;
    this.sampleCount = sampleCount;
    this.includeSun = options.includeSun ?? false;
    this._profiler = options.profiler;

    this._initialDiffuseMode = ambientLight.diffuseMode;
    this._initialSphericalHarmonics = ambientLight.diffuseSphericalHarmonics;
    this._initialSpecularTexture = ambientLight.specularTexture ?? null;

    const accumulationShader = Shader.find("Lighting/RealtimeIBLAccumulate");
    const resolveShader = Shader.find("Lighting/RealtimeIBLResolve");
    if (!accumulationShader || !resolveShader) {
      throw new Error("EnvironmentLightCapture shaders are not registered. Run the shader precompile step before use.");
    }
    this._accumulationMaterial = new Material(engine, accumulationShader);
    this._resolveMaterial = new Material(engine, resolveShader);

    const bakerScene = (this._bakerScene = new Scene(engine));
    bakerScene.name = "Realtime IBL Baker";
    bakerScene.isActive = false;
    bakerScene.background.solidColor.set(0, 0, 0, 1);
    bakerScene.shaderData.enableMacro(SkyEnvironmentCaptureMacro.Capture);
    if (this.includeSun) {
      bakerScene.shaderData.enableMacro(SkyEnvironmentCaptureMacro.IncludeSun);
    }
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
    EnvironmentLightCapture._owners.set(ambientLight, this);
  }

  /**
   * Clone the current Scene sky and queue it as the newest environment-lighting revision.
   * @remarks Calling this again replaces an older pending revision without interrupting a revision already in flight.
   */
  requestUpdate(): number {
    this._assertAlive();
    const revision = this._latestRevision + 1;
    const snapshot = this._captureSnapshot(revision);
    this._latestRevision = revision;
    if (this._pendingSnapshot) {
      this._releaseSnapshot(this._pendingSnapshot);
    }
    this._pendingSnapshot = snapshot;
    return snapshot.revision;
  }

  /** Process exactly one frame in the generated capture schedule. */
  update(): void {
    this._assertAlive();
    if (!this._activeBake && this._pendingSnapshot) {
      const pendingSnapshot = this._pendingSnapshot;
      this._profileStage(pendingSnapshot.revision, 0, "start", () => this._startPendingBake());
    }
    const activeBake = this._activeBake;
    if (!activeBake) {
      return;
    }

    if (activeBake.frame <= this._shProjectFrame) {
      this._withBakerSceneActive(() => this._processGpuFrame(activeBake));
    }
    if (activeBake.frame === this._publishFrame && activeBake.sphericalHarmonicsComplete) {
      this._profileStage(activeBake.snapshot.revision, activeBake.frame, "publish", () => this._publish(activeBake));
      this._activeBake = null;
    } else if (activeBake.frame < this._publishFrame) {
      activeBake.frame++;
    }
  }

  /** Resolves with the first fully published specular cubemap. */
  waitForFirstUpdate(): Promise<TextureCube> {
    if (this._publishedBuffer >= 0) {
      return Promise.resolve(this._outputTextures[this._publishedBuffer]);
    }
    if (this._destroyed) {
      return Promise.reject(new Error("EnvironmentLightCapture was destroyed before publishing."));
    }
    return new Promise<TextureCube>((resolve, reject) => this._firstBakeWaiters.push({ resolve, reject }));
  }

  /** Return a detached status snapshot for diagnostics. */
  getSnapshot(): EnvironmentLightCaptureSnapshot {
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
      sampleCount: this.sampleCount,
      includeSun: this.includeSun
    };
  }

  /** Restore the scene's original ambient assets and release all runtime-owned GPU resources. */
  destroy(): void {
    if (this._destroyed) {
      return;
    }
    this._destroyed = true;
    const ambientLight = this._ambientLight;
    if (this._gpuSphericalHarmonics.ownsCurrentBuffer(ambientLight._realtimeSphericalHarmonicsBuffer)) {
      ambientLight._setRealtimeSphericalHarmonicsBuffer(null);
      if (this._initialSphericalHarmonics) {
        ambientLight.diffuseSphericalHarmonics = this._initialSphericalHarmonics;
      }
      ambientLight.diffuseMode = this._initialDiffuseMode;
    }
    if (
      ambientLight.specularTexture === this._outputTextures[0] ||
      ambientLight.specularTexture === this._outputTextures[1]
    ) {
      ambientLight.specularTexture = this._initialSpecularTexture!;
    }

    this._camera.renderTarget = null;
    const activeSnapshot = this._activeBake?.snapshot;
    const pendingSnapshot = this._pendingSnapshot;
    this._bakerScene.destroy();
    if (activeSnapshot) {
      this._releaseSnapshot(activeSnapshot);
    }
    if (pendingSnapshot) {
      this._releaseSnapshot(pendingSnapshot);
    }
    this._activeBake = null;
    this._pendingSnapshot = null;
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
    this._gpuSphericalHarmonics.destroy();

    const error = new Error("EnvironmentLightCapture was destroyed before publishing.");
    for (let i = 0; i < this._firstBakeWaiters.length; i++) {
      this._firstBakeWaiters[i].reject(error);
    }
    this._firstBakeWaiters.length = 0;
    if (EnvironmentLightCapture._owners.get(ambientLight) === this) {
      EnvironmentLightCapture._owners.delete(ambientLight);
    }
  }

  private _captureSnapshot(revision: number): SkySnapshot {
    const sourceScene = this._sourceScene;
    const material = sourceScene.background.sky.material;
    const mesh = sourceScene.background.sky.mesh;
    if (sourceScene.background.mode !== BackgroundMode.Sky || !material || !mesh) {
      throw new Error("EnvironmentLightCapture requires an active Scene sky with a material and mesh.");
    }
    if (material.destroyed || mesh.destroyed) {
      throw new Error("EnvironmentLightCapture cannot capture a destroyed Scene sky resource.");
    }

    const capturedMaterial = material.clone();
    capturedMaterial._addReferCount(1);
    mesh._addReferCount(1);
    const sun = sourceScene.sun;
    return {
      revision,
      mesh,
      material: capturedMaterial,
      sunEnabled: sun?.enabled ?? false,
      sunColor: sun?.color.clone() ?? new Color(0, 0, 0, 1),
      sunWorldRotation: sun?.entity.transform.worldRotationQuaternion.clone() ?? new Quaternion()
    };
  }

  private _startPendingBake(): void {
    const snapshot = this._pendingSnapshot!;
    this._pendingSnapshot = null;
    this._activeBake = {
      snapshot,
      frame: 0,
      stagingBuffer: this._publishedBuffer === 0 ? 1 : 0,
      sphericalHarmonicsComplete: false
    };
    this._sourceTexture.filterMode = TextureFilterMode.Point;

    this._bakerScene.background.sky.mesh = snapshot.mesh;
    this._bakerScene.background.sky.material = snapshot.material;
    this._bakerScene.background.mode = BackgroundMode.Sky;
    this._bakerSun.enabled = snapshot.sunEnabled;
    this._bakerSun.color.copyFrom(snapshot.sunColor);
    this._bakerSun.entity.transform.worldRotationQuaternion = snapshot.sunWorldRotation;

    const ambientLight = this._ambientLight;
    if (!this._gpuSphericalHarmonics.ownsCurrentBuffer(ambientLight._realtimeSphericalHarmonicsBuffer)) {
      this._gpuSphericalHarmonics.resetCurrent(ambientLight._getDiffuseSphericalHarmonicsData());
    }
  }

  private _processGpuFrame(activeBake: ActiveBake): void {
    const frame = activeBake.frame;
    if (frame < CAPTURE_FACE_COUNT) {
      const revision = activeBake.snapshot.revision;
      this._profileStage(revision, frame, "source-capture", () => this._captureSourceFace(activeBake, frame));
    } else if (frame < this._prefilterStartFrame) {
      this._profileStage(activeBake.snapshot.revision, frame, "source-mipmap", () =>
        this._processSourceMipmapFrame(frame)
      );
    } else if (frame < this._shProjectFrame) {
      this._profileStage(activeBake.snapshot.revision, frame, "ggx-prefilter", () =>
        this._processPrefilterFrame(activeBake)
      );
    } else if (frame === this._shProjectFrame) {
      this._profileStage(activeBake.snapshot.revision, frame, "sh-project", () => {
        this._gpuSphericalHarmonics.project(this._sourceTexture, this._sphericalHarmonicsMipLevel);
        activeBake.sphericalHarmonicsComplete = true;
      });
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
    const ambientLight = this._ambientLight;
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
    this._bakerScene.background.sky.material = null;
    this._bakerScene.background.sky.mesh = null;
    this._releaseSnapshot(activeBake.snapshot);
  }

  private _setCaptureView(face: number): void {
    const basis = CUBE_FACE_BASES[face];
    Matrix.lookAt(CAPTURE_ORIGIN, basis.forward, basis.up, this._captureViewMatrix);
    this._camera.viewMatrix = this._captureViewMatrix;
  }

  private _withBakerSceneActive(action: () => void): void {
    this._bakerScene.isActive = true;
    try {
      this._bakerScene._updateShaderData();
      action();
    } finally {
      this._planeRenderer.entity.isActive = false;
      this._bakerScene.isActive = false;
    }
  }

  private _profileStage(
    revision: number,
    frame: number,
    stage: EnvironmentLightCaptureProfileStage,
    action: () => void
  ): void {
    const profiler = this._profiler;
    if (!profiler) {
      action();
      return;
    }
    profiler.beginSample(revision, frame, stage);
    try {
      action();
    } finally {
      profiler.endSample();
    }
  }

  private _releaseSnapshot(snapshot: SkySnapshot): void {
    snapshot.material._addReferCount(-1);
    snapshot.material.destroy();
    snapshot.mesh._addReferCount(-1);
  }

  private _assertAlive(): void {
    if (this._destroyed) {
      throw new Error("EnvironmentLightCapture has been destroyed.");
    }
    if (this._sourceScene.ambientLight !== this._ambientLight) {
      throw new Error("EnvironmentLightCapture requires the Scene AmbientLight assigned at construction.");
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
    throw new RangeError("EnvironmentLightCapture resolution must be a power-of-two integer greater than one.");
  }
  if (!Number.isInteger(sampleCount) || sampleCount < SAMPLE_BATCH_SIZE || sampleCount % SAMPLE_BATCH_SIZE !== 0) {
    throw new RangeError(`EnvironmentLightCapture sampleCount must be a multiple of ${SAMPLE_BATCH_SIZE}.`);
  }
}
