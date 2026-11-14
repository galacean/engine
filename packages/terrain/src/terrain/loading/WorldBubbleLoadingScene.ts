import worldBubbleLoadingShaderSourceAsset from "./shaders/WorldBubbleLoading.shader?raw";
import {
  BloomDownScaleMode,
  BloomEffect,
  Camera,
  CameraClearFlags,
  Color,
  Material,
  MeshRenderer,
  PostProcess,
  PrimitiveMesh,
  Scene,
  Script,
  Shader,
  Vector2,
  WebGLEngine
} from "@galacean/engine";
import { ShaderCompiler } from "@galacean/engine-shader-compiler";

const WORLD_BUBBLE_LOADING_SHADER_NAME = "IntegratedWorld/WorldBubbleLoadingV1";
const WORLD_BUBBLE_LOADING_RENDER_SCALE = 0.72;
const WORLD_BUBBLE_LOADING_MAX_PIXEL_RATIO = 1.5;
const WORLD_BUBBLE_LOADING_REVEAL_SECONDS = 1;
const WORLD_BUBBLE_LOADING_SETTLE_SECONDS = 0.6;
const WORLD_BUBBLE_LOADING_PROGRESS_PER_TRANSFER = 0.03;
const WORLD_BUBBLE_LOADING_MIN_PROGRESS_PER_TRANSFER = 0.01;
const WORLD_BUBBLE_LOADING_TRANSFER_SPAWN_SECONDS = 0.18;
const WORLD_BUBBLE_LOADING_REFERENCE_DISTANCE = 0.55;
const WORLD_BUBBLE_LOADING_REFERENCE_SECONDS = 1.24;
const WORLD_BUBBLE_LOADING_TRAVEL_SPEED =
  WORLD_BUBBLE_LOADING_REFERENCE_DISTANCE / WORLD_BUBBLE_LOADING_REFERENCE_SECONDS;
const WORLD_BUBBLE_LOADING_PATH_SAMPLES = 24;
const WORLD_BUBBLE_LOADING_MAX_CONCURRENT_TRANSFERS = 4;
const WORLD_BUBBLE_LOADING_PUSH_DURATION = 0.1;
const WORLD_BUBBLE_LOADING_BACK_STRENGTH = 1.1;
// easeOutBack first reaches the World at this point, then performs its subtle
// overshoot/settle while already hidden inside the fused SDF surface.
const WORLD_BUBBLE_LOADING_FUSION_TRAVEL =
  WORLD_BUBBLE_LOADING_PUSH_DURATION +
  (1 - WORLD_BUBBLE_LOADING_PUSH_DURATION) / (WORLD_BUBBLE_LOADING_BACK_STRENGTH + 1);

function worldBubbleHash11(value: number): number {
  const raw = Math.sin(value * 127.1 + 311.7) * 43758.5453123;
  return raw - Math.floor(raw);
}

function worldBubbleEasedTravel(travel: number): number {
  const pushDuration = WORLD_BUBBLE_LOADING_PUSH_DURATION;
  const pushDistance = 0.185;
  if (travel < pushDuration) {
    const push = travel / pushDuration;
    return pushDistance * push * push;
  }
  const settle = (travel - pushDuration) / (1 - pushDuration);
  const backOffset = settle - 1;
  const backStrength = WORLD_BUBBLE_LOADING_BACK_STRENGTH;
  const easeOutBack =
    1 + (backStrength + 1) * backOffset * backOffset * backOffset + backStrength * backOffset * backOffset;
  return pushDistance + (1 - pushDistance) * easeOutBack;
}

function worldBubbleParticlePosition(
  index: number,
  travel: number,
  aspect: number,
  worldRadius: number
): readonly [number, number] {
  const seed = worldBubbleHash11(index + 1);
  const angle = index * 2.39996323 + seed * 0.7;
  const directionX = Math.cos(angle);
  const directionY = Math.sin(angle);
  const tangentX = -directionY;
  const tangentY = directionX;
  const easedTravel = worldBubbleEasedTravel(travel);
  const airEnvelope = Math.sin(travel * Math.PI);
  const airPhase = seed * Math.PI * 2;
  const screenEdge = 0.54 / Math.max(Math.abs(directionY), Math.abs(directionX) / Math.max(aspect, 0.1));
  const outerRadius = screenEdge * (0.92 + 0.26 * worldBubbleHash11(index + 37));
  const innerRadius = worldRadius * 0.58;
  const radialDistance = outerRadius + (innerRadius - outerRadius) * easedTravel;
  const radialBob = Math.sin(travel * Math.PI * 2.6 + airPhase) * 0.01 * airEnvelope;
  const broadDrift = (-0.12 + 0.24 * worldBubbleHash11(index + 53)) * airEnvelope;
  const floatingDrift =
    (Math.sin(travel * Math.PI * 2 + airPhase) * 0.03 + Math.sin(travel * Math.PI * 4.4 + airPhase * 1.7) * 0.007) *
    airEnvelope;
  return [
    directionX * (radialDistance + radialBob) + tangentX * (broadDrift + floatingDrift),
    directionY * (radialDistance + radialBob) + tangentY * (broadDrift + floatingDrift)
  ];
}

function worldBubbleParticlePathLength(index: number, aspect: number, worldRadius: number): number {
  let previous = worldBubbleParticlePosition(index, 0, aspect, worldRadius);
  let length = 0;
  for (let sample = 1; sample <= WORLD_BUBBLE_LOADING_PATH_SAMPLES; sample++) {
    const current = worldBubbleParticlePosition(index, sample / WORLD_BUBBLE_LOADING_PATH_SAMPLES, aspect, worldRadius);
    length += Math.hypot(current[0] - previous[0], current[1] - previous[1]);
    previous = current;
  }
  return length;
}

/** Fusing SDF circles shaded with bjarnia's LoadingOrb ring and bloom formula. */
export const worldBubbleLoadingShaderSource = worldBubbleLoadingShaderSourceAsset;

export interface WorldBubbleLoadingSnapshot {
  readonly progress: number;
  readonly targetProgress: number;
  readonly transfer: number;
  readonly transferActive: boolean;
  readonly burst: number;
  readonly state: "loading" | "revealing" | "complete" | "destroyed";
}

export interface WorldBubbleLoadingSceneOptions {
  readonly reducedMotion?: boolean;
  readonly motionEnabled?: boolean;
  readonly onVisualProgress?: (progress: number) => void;
  readonly onRevealStart?: () => void;
}

interface WorldBubblePendingTransfer {
  readonly index: number;
  readonly progressDelta: number;
}

interface WorldBubbleActiveTransfer extends WorldBubblePendingTransfer {
  readonly duration: number;
  progress: number;
  progressCommitted: boolean;
}

class WorldBubbleLoadingDriver extends Script {
  owner: WorldBubbleLoadingScene | null = null;

  override onUpdate(deltaTime: number): void {
    this.owner?.updateFrame(deltaTime);
  }
}

/**
 * Galacean loading Scene with no external assets, IBL, lighting, or environment dependencies.
 * It can own a small standalone Engine for demos, or share the production World Engine so startup
 * uses one canvas, one WebGL context, and an actual Loading Scene layered above the World Scene.
 */
export class WorldBubbleLoadingScene {
  private readonly _resolution = new Vector2(1, 1);
  private readonly _resizeListener = (): void => this.resize();
  private _worldUnderlay: Scene | undefined;
  private _targetProgress = 0;
  private _displayProgress = 0;
  private _queuedProgress = 0;
  private readonly _pendingTransfers: WorldBubblePendingTransfer[] = [];
  private readonly _activeTransfers: WorldBubbleActiveTransfer[] = [];
  private _transferSpawnElapsed = 0;
  private _nextTransferIndex = 0;
  private _time = 0;
  private _burst = 0;
  private _burstStarted = false;
  private _state: WorldBubbleLoadingSnapshot["state"] = "loading";
  private _revealElapsed = 0;
  private _settleElapsed = 0;
  private _settleStartProgress = 0;
  private _revealPromise: Promise<void> | null = null;
  private _resolveReveal: (() => void) | null = null;
  private _prepareReveal: (() => void) | undefined;

  private constructor(
    private readonly _canvas: HTMLCanvasElement | undefined,
    private readonly _engine: WebGLEngine,
    private readonly _scene: Scene,
    private readonly _camera: Camera,
    private readonly _material: Material,
    private readonly _ownsEngine: boolean,
    private readonly _reducedMotion: boolean,
    private _motionEnabled: boolean,
    private readonly _onVisualProgress?: (progress: number) => void,
    private readonly _onRevealStart?: () => void
  ) {
    if (_ownsEngine) window.addEventListener("resize", this._resizeListener);
    this._time = _motionEnabled ? 0 : 2;
    this.resize();
  }

  /** Creates and starts the standalone loading renderer used by demos and previews. */
  static async create(
    canvas: HTMLCanvasElement,
    options: WorldBubbleLoadingSceneOptions = {}
  ): Promise<WorldBubbleLoadingScene> {
    let engine: WebGLEngine | null = null;
    try {
      engine = await WebGLEngine.create({
        canvas,
        shaderCompiler: new ShaderCompiler(),
        graphicDeviceOptions: {
          alpha: true,
          depth: false,
          stencil: false,
          premultipliedAlpha: true,
          powerPreference: "low-power"
        }
      });
      engine.vSyncCount = 0;
      engine.targetFrameRate = options.reducedMotion ? 15 : 30;
      const scene = engine.sceneManager.activeScene!;
      const loadingScene = WorldBubbleLoadingScene._createInScene(canvas, engine, scene, true, options);
      engine.run();
      await WorldBubbleLoadingScene._waitForWarmupFrames();
      return loadingScene;
    } catch (error) {
      engine?.destroy();
      throw error;
    }
  }

  /** Creates a real Loading Scene inside an existing production World Engine. */
  static async createInEngine(
    engine: WebGLEngine,
    options: WorldBubbleLoadingSceneOptions = {}
  ): Promise<WorldBubbleLoadingScene> {
    const scene = new Scene(engine, "World LoadingOrb Scene");
    engine.sceneManager.addScene(scene);
    try {
      const loadingScene = WorldBubbleLoadingScene._createInScene(undefined, engine, scene, false, options);
      await WorldBubbleLoadingScene._waitForWarmupFrames();
      return loadingScene;
    } catch (error) {
      scene.destroy();
      throw error;
    }
  }

  private static _createInScene(
    canvas: HTMLCanvasElement | undefined,
    engine: WebGLEngine,
    scene: Scene,
    ownsEngine: boolean,
    options: WorldBubbleLoadingSceneOptions
  ): WorldBubbleLoadingScene {
    scene.name ||= "World LoadingOrb Scene";
    scene.background.solidColor.set(0, 0, 0, 0);
    const root = scene.createRootEntity("World LoadingOrb Fusion Scene");
    const cameraEntity = root.createChild("Loading Camera");
    const camera = cameraEntity.addComponent(Camera);
    camera.clearFlags = CameraClearFlags.All;
    camera.isAlphaOutputRequired = true;
    camera.enableFrustumCulling = false;
    camera.enableHDR = true;
    camera.enablePostProcess = true;

    const postProcess = root.createChild("Loading Global Bloom").addComponent(PostProcess);
    postProcess.isGlobal = true;
    const bloom = postProcess.addEffect(BloomEffect)!;
    bloom.downScale.value = BloomDownScaleMode.Quarter;
    bloom.highQualityFiltering.value = true;
    bloom.threshold.value = 0.62;
    bloom.intensity.value = 3.8;
    bloom.scatter.value = 0.9;
    bloom.tint.value.copyFrom(new Color(0.055, 0.065, 1.0, 0.0));

    const shader = Shader.find(WORLD_BUBBLE_LOADING_SHADER_NAME) ?? Shader.create(worldBubbleLoadingShaderSource);
    const material = new Material(engine, shader);
    material.isGCIgnored = true;
    const motionEnabled = options.motionEnabled ?? true;
    material.shaderData.setFloat("material_WorldBubbleTime", motionEnabled ? 0 : 2);
    material.shaderData.setFloat("material_WorldBubbleProgress", 0);
    material.shaderData.setFloat("material_WorldBubbleBurst", 0);
    material.shaderData.setFloat("material_WorldBubbleReducedMotion", options.reducedMotion ? 1 : 0);
    for (let slot = 0; slot < WORLD_BUBBLE_LOADING_MAX_CONCURRENT_TRANSFERS; slot++) {
      material.shaderData.setFloat(`material_WorldBubbleTransfer${slot}`, 0);
      material.shaderData.setFloat(`material_WorldBubbleTransferIndex${slot}`, 0);
      material.shaderData.setFloat(`material_WorldBubbleHasTransfer${slot}`, 0);
    }

    const surface = root.createChild("LoadingOrb Fusion Surface");
    const renderer = surface.addComponent(MeshRenderer);
    renderer.mesh = PrimitiveMesh.createPlane(engine, 2, 2, 1, 1, false);
    renderer.setMaterial(material);

    const loadingScene = new WorldBubbleLoadingScene(
      canvas,
      engine,
      scene,
      camera,
      material,
      ownsEngine,
      options.reducedMotion ?? false,
      motionEnabled,
      options.onVisualProgress,
      options.onRevealStart
    );
    const driver = root.addComponent(WorldBubbleLoadingDriver);
    driver.owner = loadingScene;
    return loadingScene;
  }

  private static _waitForWarmupFrames(): Promise<void> {
    return new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  }

  /** Monotonically advances the visualized loading progress. */
  setProgress(progress: number): void {
    if (this._state !== "loading") return;
    const normalized = Math.max(0, Math.min(progress, 1));
    this._targetProgress = Math.max(this._targetProgress, normalized);
    if (this._motionEnabled) this._queueProgress(this._targetProgress);
  }

  /** Freezes or releases every breathing and transfer animation without hiding the static orb. */
  setMotionEnabled(enabled: boolean): void {
    if (this._state === "destroyed") return;
    this._motionEnabled = enabled;
  }

  /** Advances the orb without replaying historical transfer particles. */
  synchronizeProgress(progress: number): void {
    if (this._state !== "loading") return;
    const normalized = Math.max(0, Math.min(progress, 1));
    if (normalized <= this._displayProgress) return;
    this._targetProgress = Math.max(this._targetProgress, normalized);
    this._displayProgress = normalized;
    this._queuedProgress = Math.max(this._queuedProgress, normalized);
    this._transferSpawnElapsed = 0;
    this._pendingTransfers.length = 0;
    this._activeTransfers.length = 0;
    const shaderData = this._material.shaderData;
    shaderData.setFloat("material_WorldBubbleProgress", this._displayProgress);
    for (let slot = 0; slot < WORLD_BUBBLE_LOADING_MAX_CONCURRENT_TRANSFERS; slot++) {
      shaderData.setFloat(`material_WorldBubbleTransfer${slot}`, 0);
      shaderData.setFloat(`material_WorldBubbleHasTransfer${slot}`, 0);
    }
    this._onVisualProgress?.(this._displayProgress);
  }

  /** Coalesces outstanding progress into a short settle, then reveals at exactly 100%. */
  reveal(prepareReveal?: () => void): Promise<void> {
    if (this._state === "destroyed" || this._state === "complete") return Promise.resolve();
    if (this._revealPromise) return this._revealPromise;
    this._prepareReveal = prepareReveal;
    if (this._reducedMotion) this.synchronizeProgress(1);
    this._targetProgress = 1;
    this._queuedProgress = 1;
    this._settleStartProgress = this._displayProgress;
    this._settleElapsed = 0;
    // Progress is evidence of readiness, not animation debt. Keep at most one
    // visible group; never replay dozens of queued transfers after boot finishes.
    const availableSlots = WORLD_BUBBLE_LOADING_MAX_CONCURRENT_TRANSFERS - this._activeTransfers.length;
    for (const transfer of this._pendingTransfers.splice(0, availableSlots)) {
      this._activeTransfers.push({
        ...transfer,
        duration: WORLD_BUBBLE_LOADING_SETTLE_SECONDS,
        progress: 0,
        progressCommitted: true
      });
    }
    this._pendingTransfers.length = 0;
    for (const transfer of this._activeTransfers) transfer.progressCommitted = true;
    this._state = "revealing";
    this._revealPromise = new Promise<void>((resolve) => {
      this._resolveReveal = resolve;
    });
    return this._revealPromise;
  }

  /** Places the World Scene below this Scene and preserves it while the LoadingOrb fades away. */
  attachWorldUnderlay(worldScene: Scene): void {
    if (this._state === "destroyed") return;
    if (worldScene.engine !== this._engine) {
      throw new Error("Loading Scene and World Scene must belong to the same Engine");
    }
    const sceneManager = this._engine.sceneManager;
    sceneManager.addScene(0, worldScene);
    if (sceneManager.scenes[sceneManager.scenes.length - 1] !== this._scene) {
      sceneManager.removeScene(this._scene);
      sceneManager.addScene(this._scene);
    }
    this._worldUnderlay = worldScene;
    this._camera.clearFlags = CameraClearFlags.None;
  }

  /** Restores standalone clearing if a candidate World Scene rolls back before publication. */
  detachWorldUnderlay(worldScene: Scene): void {
    if (this._worldUnderlay !== worldScene) return;
    this._worldUnderlay = undefined;
    this._camera.clearFlags = CameraClearFlags.All;
  }

  /** Resets and resumes the renderer so one canvas/context can cover repeated World generations. */
  restart(): void {
    if (this._state === "destroyed") return;
    this._resolveReveal?.();
    this._targetProgress = 0;
    this._displayProgress = 0;
    this._queuedProgress = 0;
    this._transferSpawnElapsed = 0;
    this._nextTransferIndex = 0;
    this._pendingTransfers.length = 0;
    this._activeTransfers.length = 0;
    this._burst = 0;
    this._burstStarted = false;
    this._state = "loading";
    this._revealElapsed = 0;
    this._settleElapsed = 0;
    this._settleStartProgress = 0;
    this._revealPromise = null;
    this._resolveReveal = null;
    this._prepareReveal = undefined;

    const shaderData = this._material.shaderData;
    shaderData.setFloat("material_WorldBubbleProgress", 0);
    shaderData.setFloat("material_WorldBubbleBurst", 0);
    for (let slot = 0; slot < WORLD_BUBBLE_LOADING_MAX_CONCURRENT_TRANSFERS; slot++) {
      shaderData.setFloat(`material_WorldBubbleTransfer${slot}`, 0);
      shaderData.setFloat(`material_WorldBubbleTransferIndex${slot}`, 0);
      shaderData.setFloat(`material_WorldBubbleHasTransfer${slot}`, 0);
    }
    this._scene.isActive = true;
    this.resize();
    if (this._ownsEngine) this._engine.resume();
  }

  /** Stops only the loading Scene while retaining it for the next generation. */
  suspend(): void {
    if (this._state === "destroyed") return;
    if (this._ownsEngine) this._engine.pause();
    else this._scene.isActive = false;
  }

  /** Current deterministic loading animation state for diagnostics and tests. */
  getSnapshot(): WorldBubbleLoadingSnapshot {
    const primaryTransfer = this._activeTransfers[0];
    return Object.freeze({
      progress: this._displayProgress,
      targetProgress: this._targetProgress,
      transfer: primaryTransfer?.progress ?? 0,
      transferActive: primaryTransfer !== undefined,
      burst: this._burst,
      state: this._state
    });
  }

  /** @internal Called by the Scene-owned Script. */
  updateFrame(deltaTime: number): void {
    if (this._state === "destroyed" || (!this._motionEnabled && this._state === "loading")) return;
    const elapsed = Math.max(0, Math.min(deltaTime, 0.1));
    this._time += elapsed;

    if (this._state === "revealing" && !this._burstStarted && this._displayProgress < 1) {
      this._settleElapsed += elapsed;
      const t = Math.min(this._settleElapsed / WORLD_BUBBLE_LOADING_SETTLE_SECONDS, 1);
      const eased = t * t * (3 - 2 * t);
      this._displayProgress = this._settleStartProgress + (1 - this._settleStartProgress) * eased;
      this._onVisualProgress?.(this._displayProgress);
    }

    for (let slot = this._activeTransfers.length - 1; slot >= 0; slot--) {
      const transfer = this._activeTransfers[slot];
      const duration =
        this._state === "revealing"
          ? Math.min(transfer.duration, WORLD_BUBBLE_LOADING_SETTLE_SECONDS)
          : transfer.duration;
      transfer.progress = Math.min(transfer.progress + elapsed / duration, 1);
      if (!transfer.progressCommitted && transfer.progress >= WORLD_BUBBLE_LOADING_FUSION_TRAVEL) {
        transfer.progressCommitted = true;
        this._displayProgress = Math.min(this._queuedProgress, this._displayProgress + transfer.progressDelta);
        this._onVisualProgress?.(this._displayProgress);
      }
      if (transfer.progress >= 1) {
        this._activeTransfers.splice(slot, 1);
      }
    }
    if (!this._burstStarted) this._spawnQueuedTransfers(elapsed);

    if (
      this._state === "revealing" &&
      this._pendingTransfers.length === 0 &&
      this._activeTransfers.length === 0 &&
      this._displayProgress >= 1 - 1e-8
    ) {
      if (!this._burstStarted) {
        this._displayProgress = 1;
        this._onVisualProgress?.(1);
        this._burstStarted = true;
        this._prepareReveal?.();
        this._prepareReveal = undefined;
        this._onRevealStart?.();
      }
      const duration = this._reducedMotion ? 0.42 : WORLD_BUBBLE_LOADING_REVEAL_SECONDS;
      this._revealElapsed += elapsed;
      this._burst = Math.min(this._revealElapsed / duration, 1);
      if (this._burst >= 1) {
        this._state = "complete";
        this._resolveReveal?.();
        this._resolveReveal = null;
      }
    }

    const shaderData = this._material.shaderData;
    shaderData.setFloat("material_WorldBubbleTime", this._time);
    shaderData.setFloat("material_WorldBubbleProgress", this._displayProgress);
    shaderData.setFloat("material_WorldBubbleBurst", this._burst);
    for (let slot = 0; slot < WORLD_BUBBLE_LOADING_MAX_CONCURRENT_TRANSFERS; slot++) {
      const transfer = this._activeTransfers[slot];
      shaderData.setFloat(`material_WorldBubbleTransfer${slot}`, transfer?.progress ?? 0);
      shaderData.setFloat(`material_WorldBubbleTransferIndex${slot}`, transfer?.index ?? 0);
      shaderData.setFloat(`material_WorldBubbleHasTransfer${slot}`, transfer ? 1 : 0);
    }
  }

  private _queueProgress(progress: number): void {
    const progressDelta = progress - this._queuedProgress;
    // Resource callbacks such as progressive IBL may report dozens of sub-percent
    // deltas. Accumulate them until one bubble can advance the integer UI by at
    // least 1%, instead of showing visually fused bubbles with an unchanged number.
    if (progressDelta <= 0 || (progress < 1 && progressDelta + 1e-8 < WORLD_BUBBLE_LOADING_MIN_PROGRESS_PER_TRANSFER))
      return;
    const transferCount = Math.ceil(progressDelta / WORLD_BUBBLE_LOADING_PROGRESS_PER_TRANSFER);
    const transferProgressDelta = progressDelta / transferCount;
    const wasIdle = this._pendingTransfers.length === 0 && this._activeTransfers.length === 0;
    for (let transfer = 0; transfer < transferCount; transfer++) {
      this._pendingTransfers.push({
        index: this._nextTransferIndex++,
        progressDelta: transferProgressDelta
      });
    }
    this._queuedProgress = progress;
    if (wasIdle) this._transferSpawnElapsed = WORLD_BUBBLE_LOADING_TRANSFER_SPAWN_SECONDS;
  }

  private _spawnQueuedTransfers(elapsed: number): void {
    if (this._pendingTransfers.length === 0) {
      this._transferSpawnElapsed = 0;
      return;
    }
    this._transferSpawnElapsed += elapsed;
    while (
      this._transferSpawnElapsed >= WORLD_BUBBLE_LOADING_TRANSFER_SPAWN_SECONDS &&
      this._pendingTransfers.length > 0 &&
      this._activeTransfers.length < WORLD_BUBBLE_LOADING_MAX_CONCURRENT_TRANSFERS
    ) {
      this._transferSpawnElapsed -= WORLD_BUBBLE_LOADING_TRANSFER_SPAWN_SECONDS;
      const transfer = this._pendingTransfers.shift()!;
      this._activeTransfers.push({
        ...transfer,
        duration: this._calculateTransferDuration(transfer.index),
        progress: 0,
        progressCommitted: false
      });
    }
    if (this._activeTransfers.length >= WORLD_BUBBLE_LOADING_MAX_CONCURRENT_TRANSFERS) {
      this._transferSpawnElapsed = Math.min(this._transferSpawnElapsed, WORLD_BUBBLE_LOADING_TRANSFER_SPAWN_SECONDS);
    }
  }

  private _calculateTransferDuration(index: number): number {
    const aspect = this._resolution.x / Math.max(this._resolution.y, 1);
    const authoredRadius = 0.035 + (0.125 - 0.035) * Math.pow(this._displayProgress, 0.9);
    const pathLength = worldBubbleParticlePathLength(index, aspect, authoredRadius);
    return pathLength / WORLD_BUBBLE_LOADING_TRAVEL_SPEED;
  }

  /** Synchronizes the shader aspect ratio and scales standalone previews below device resolution. */
  resize(): void {
    if (this._state === "destroyed") return;
    let width: number;
    let height: number;
    if (this._ownsEngine && this._canvas) {
      const cssWidth = Math.max(this._canvas.clientWidth || window.innerWidth, 1);
      const cssHeight = Math.max(this._canvas.clientHeight || window.innerHeight, 1);
      const pixelRatio = Math.min(window.devicePixelRatio || 1, WORLD_BUBBLE_LOADING_MAX_PIXEL_RATIO);
      const motionScale = this._reducedMotion ? 0.58 : WORLD_BUBBLE_LOADING_RENDER_SCALE;
      width = Math.max(1, Math.round(cssWidth * pixelRatio * motionScale));
      height = Math.max(1, Math.round(cssHeight * pixelRatio * motionScale));
      this._engine.canvas.setResolution(width, height);
    } else {
      width = Math.max(this._engine.canvas.width, 1);
      height = Math.max(this._engine.canvas.height, 1);
    }
    this._resolution.set(width, height);
    this._material.shaderData.setVector2("material_WorldBubbleResolution", this._resolution);
  }

  /** Releases the standalone Engine, or only this Scene when embedded in the World Engine. */
  destroy(): void {
    if (this._state === "destroyed") return;
    if (this._ownsEngine) window.removeEventListener("resize", this._resizeListener);
    this._state = "destroyed";
    this._prepareReveal = undefined;
    this._resolveReveal?.();
    this._resolveReveal = null;
    if (this._ownsEngine) this._engine.destroy();
    else this._scene.destroy();
  }
}
