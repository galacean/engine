import {
  IHardwareRenderer,
  IInputOptions,
  IPhysics,
  IPhysicsManager,
  IShaderAnalyzer,
  IShaderCompiler,
  IXRDevice
} from "@galacean/engine-design";
import { CharRenderInfo } from "./2d/text/CharRenderInfo";
import { Font } from "./2d/text/Font";
import { BasicResources } from "./BasicResources";
import { Camera } from "./Camera";
import { Canvas } from "./Canvas";
import { EngineEventType } from "./EngineEventType";
import { EngineSettings } from "./EngineSettings";
import { Entity } from "./Entity";
import { BatcherManager } from "./RenderPipeline/BatcherManager";
import { RenderContext } from "./RenderPipeline/RenderContext";
import { RenderTargetPool } from "./RenderPipeline/RenderTargetPool";
import { RenderElement } from "./RenderPipeline/RenderElement";
import { Scene } from "./Scene";
import { SceneManager } from "./SceneManager";
import { RenderingStatistics } from "./asset/RenderingStatistics";
import { ResourceManager } from "./asset/ResourceManager";
import { EngineObject, EventDispatcher, Logger, Time } from "./base";
import { GLCapabilityType } from "./base/Constant";
import { InputManager } from "./input";
import { ParticleBufferUtils } from "./particle/ParticleBufferUtils";
import { ColliderShape } from "./physics/shape/ColliderShape";
import { PostProcessPass } from "./postProcess/PostProcessPass";
import { PostProcessUberPass } from "./postProcess/PostProcessUberPass";
import { Shader } from "./shader/Shader";
import { ShaderMacro } from "./shader/ShaderMacro";
import { ShaderMacroCollection } from "./shader/ShaderMacroCollection";
import { ShaderProgramMap } from "./shader/ShaderProgramMap";
import { ShaderFactory } from "./shader/ShaderFactory";
import { RenderState } from "./shader/state/RenderState";
import { Texture2D, TextureFormat } from "./texture";
import { UIUtils } from "./ui/UIUtils";
import { ClearableObjectPool } from "./utils/ClearableObjectPool";
import { ReturnableObjectPool } from "./utils/ReturnableObjectPool";
import { XRManager } from "./xr/XRManager";

/**
 * Engine.
 */
export class Engine extends EventDispatcher {
  /** @internal */
  static _noDepthTextureMacro = ShaderMacro.getByName("ENGINE_NO_DEPTH_TEXTURE");
  /** @internal */
  static _noSRGBSupportMacro = ShaderMacro.getByName("ENGINE_NO_SRGB");
  /** @internal */
  static _outputSRGBCorrectMacro = ShaderMacro.getByName("ENGINE_OUTPUT_SRGB_CORRECT");
  /** @internal Conversion of space units to pixel units for 2D. */
  static _pixelsPerUnit: number = 100;
  /** @internal */
  static _physicalObjectsMap: Record<number, ColliderShape> = {};
  /** @internal */
  static _nativePhysics: IPhysics;

  /** Input manager of Engine. */
  readonly inputManager: InputManager;
  /** XR manager of Engine. */
  readonly xrManager: XRManager;

  /** @internal */
  _renderingStatistics: RenderingStatistics = new RenderingStatistics();
  /** @internal */
  _isDeviceLost: boolean = false;
  /** @internal */
  _batcherManager: BatcherManager;

  _particleBufferUtils: ParticleBufferUtils;
  /** @internal */
  _frameInProcess = false;
  /** @internal */
  _pendingDestroyObjects: EngineObject[] = [];
  /** @internal */
  _processingPendingDestroys = false;
  /** @internal */
  _physicsInitialized: boolean = false;
  /** @internal */
  _nativePhysicsManager: IPhysicsManager;
  /** @internal */
  _hardwareRenderer: IHardwareRenderer;
  /** @internal */
  _renderTargetPool: RenderTargetPool;
  /** @internal */
  _lastRenderState: RenderState = new RenderState();

  /** @internal */
  _renderElementPool = new ClearableObjectPool(RenderElement);
  /** @internal */
  _textRenderElementPool = new ClearableObjectPool(RenderElement);
  /** @internal */
  _charRenderInfoPool = new ReturnableObjectPool(CharRenderInfo, 50);

  /** @internal */
  _basicResources: BasicResources;
  /** @internal */
  _textDefaultFont: Font;
  /** @internal */
  _renderContext: RenderContext = new RenderContext();

  /** @internal */
  _depthTexture2D: Texture2D;

  /** @internal */
  _renderCount: number = 0;
  /** @internal */
  _shaderProgramMaps: ShaderProgramMap[] = [];
  /** @internal */
  _fontMap: Record<string, Font> = {};
  /** @internal */
  _macroCollection = new ShaderMacroCollection();

  /** @internal */
  _postProcessPassNeedRefresh = false;

  /** @internal */
  protected _canvas: Canvas;

  private _settings: EngineSettings = {};
  private _resourceManager: ResourceManager = new ResourceManager(this);
  private _sceneManager: SceneManager = new SceneManager(this);
  private _vSyncCount: number = 1;
  private _targetFrameRate: number = 60;
  private _time: Time = new Time();
  private _isPaused: boolean = true;
  private _requestId: number;
  private _timeoutId: number;
  private _vSyncCounter: number = 1;
  private _targetFrameInterval: number = 1000 / 60;
  private _destroyed: boolean = false;
  private _waitingDestroy: boolean = false;
  private _waitingGC: boolean = false;
  private _postProcessPasses = new Array<PostProcessPass>();
  private _activePostProcessPasses = new Array<PostProcessPass>();

  private _onCanvasResize = (): void => this._renderTargetPool.gc();

  private _animate = () => {
    if (this._vSyncCount) {
      const raf = this.xrManager?._getRequestAnimationFrame() || requestAnimationFrame;
      this._requestId = raf(this._animate);
      if (this._vSyncCounter++ % this._vSyncCount === 0) {
        this.update();
        this._vSyncCounter = 1;
      }
    } else {
      this._timeoutId = window.setTimeout(this._animate, this._targetFrameInterval);
      this.update();
    }
  };

  /**
   * Settings of Engine.
   */
  get settings(): EngineSettings {
    return this._settings;
  }

  /**
   * The canvas to use for rendering.
   */
  get canvas(): Canvas {
    return this._canvas;
  }

  /**
   * The resource manager.
   */
  get resourceManager(): ResourceManager {
    return this._resourceManager;
  }

  /**
   * The scene manager.
   */
  get sceneManager(): SceneManager {
    return this._sceneManager;
  }

  /**
   * The time information of the engine.
   */
  get time(): Time {
    return this._time;
  }

  /**
   * Rendering statistics.
   */
  get renderingStatistics(): RenderingStatistics {
    return this._renderingStatistics;
  }

  /**
   * Whether the engine is paused.
   */
  get isPaused(): boolean {
    return this._isPaused;
  }

  /**
   * The number of vertical synchronization means the number of vertical blanking for one frame.
   * @remarks 0 means that the vertical synchronization is turned off.
   */
  get vSyncCount(): number {
    return this._vSyncCount;
  }

  set vSyncCount(value: number) {
    this._vSyncCount = Math.max(0, Math.floor(value));
  }

  /**
   * Set the target frame rate you want to achieve.
   * @remarks
   * It only takes effect when vSyncCount = 0 (ie, vertical synchronization is turned off).
   * The larger the value, the higher the target frame rate, Number.POSITIVE_INFINITY represents the infinite target frame rate.
   */
  get targetFrameRate(): number {
    return this._targetFrameRate;
  }

  set targetFrameRate(value: number) {
    value = Math.max(0.000001, value);
    this._targetFrameRate = value;
    this._targetFrameInterval = 1000 / value;
  }

  /**
   * All post process passes.
   */
  get postProcessPasses(): ReadonlyArray<PostProcessPass> {
    return this._postProcessPasses;
  }

  /**
   * Indicates whether the engine is destroyed.
   */
  get destroyed(): boolean {
    return this._destroyed;
  }

  protected constructor(canvas: Canvas, hardwareRenderer: IHardwareRenderer, configuration: EngineConfiguration) {
    super();
    this._hardwareRenderer = hardwareRenderer;
    this._hardwareRenderer.init(canvas, this._onDeviceLost.bind(this), this._onDeviceRestored.bind(this));

    this._canvas = canvas;

    this._textDefaultFont = Font.createFromOS(this, "Arial");
    this._textDefaultFont.isGCIgnored = true;

    this._batcherManager = new BatcherManager(this);
    this._renderTargetPool = new RenderTargetPool(this);
    canvas._sizeUpdateFlagManager.addListener(this._onCanvasResize);
    this.inputManager = new InputManager(this, configuration.input);

    const { xrDevice } = configuration;
    if (xrDevice) {
      this.xrManager = new XRManager();
      this.xrManager._initialize(this, xrDevice);
    }

    if (!hardwareRenderer.canIUse(GLCapabilityType.depthTexture)) {
      this._macroCollection.enable(Engine._noDepthTextureMacro);
    } else {
      const depthTexture2D = new Texture2D(this, 1, 1, TextureFormat.Depth16, false, false);
      depthTexture2D.isGCIgnored = true;
      this._depthTexture2D = depthTexture2D;
    }

    if (!hardwareRenderer.canIUse(GLCapabilityType.sRGB)) {
      this._macroCollection.enable(Engine._noSRGBSupportMacro);
    }

    this._basicResources = new BasicResources(this);
    this._particleBufferUtils = new ParticleBufferUtils(this);

    const uberPass = new PostProcessUberPass(this);
    this.addPostProcessPass(uberPass);
  }

  /**
   * Create an entity.
   * @param name - The name of the entity
   * @returns Entity
   */
  createEntity(name?: string): Entity {
    return new Entity(this, name);
  }

  /**
   * Pause the engine.
   */
  pause(): void {
    this._isPaused = true;
    const caf = this.xrManager?._getCancelAnimationFrame() || cancelAnimationFrame;
    caf(this._requestId);
    clearTimeout(this._timeoutId);
  }

  /**
   * Resume the engine.
   */
  resume(): void {
    if (!this._isPaused) return;
    this._isPaused = false;
    this.time._reset();
    if (this._vSyncCount) {
      const raf = this.xrManager?._getRequestAnimationFrame() || requestAnimationFrame;
      this._requestId = raf(this._animate);
    } else {
      this._timeoutId = window.setTimeout(this._animate, this._targetFrameInterval);
    }
  }

  /**
   * Update the engine loop manually. If you call engine.run(), you generally don't need to call this function.
   */
  update(): void {
    this._canvas._pumpPendingResolution();

    const time = this._time;
    time._update();

    const deltaTime = time.deltaTime;
    this._frameInProcess = true;

    this._renderElementPool.clear();
    this._textRenderElementPool.clear();

    this.xrManager?._update();
    const { inputManager, _physicsInitialized: physicsInitialized } = this;
    inputManager._update();

    this._refreshActivePostProcessPasses();
    const scenes = this._sceneManager._scenes.getLoopArray();
    const sceneCount = scenes.length;

    // Sort cameras and fire script `onStart`
    for (let i = 0; i < sceneCount; i++) {
      const scene = scenes[i];
      if (!scene.isActive || scene.destroyed) continue;
      const componentsManager = scene._componentsManager;
      componentsManager.sortCameras();
      componentsManager.callScriptOnStart();
    }

    // Update physics and fire `onPhysicsUpdate`
    if (physicsInitialized) {
      for (let i = 0; i < sceneCount; i++) {
        const scene = scenes[i];
        if (!scene.isActive || scene.destroyed) continue;
        scene.physics._update(deltaTime);
      }
    }

    // Fire `onPointerXX`
    inputManager._firePointerScript(scenes);

    // Fire `onUpdate`
    for (let i = 0; i < sceneCount; i++) {
      const scene = scenes[i];
      if (!scene.isActive || scene.destroyed) continue;
      scene._componentsManager.callScriptOnUpdate(deltaTime);
    }

    // Update `Animator` logic
    for (let i = 0; i < sceneCount; i++) {
      const scene = scenes[i];
      if (!scene.isActive || scene.destroyed) continue;
      scene._componentsManager.callAnimationUpdate(deltaTime);
    }

    // Fire `onLateUpdate`
    for (let i = 0; i < sceneCount; i++) {
      const scene = scenes[i];
      if (!scene.isActive || scene.destroyed) continue;
      scene._componentsManager.callScriptOnLateUpdate(deltaTime);
    }

    // Render scene and fire `onBeginRender` and `onEndRender`
    if (!this._hardwareRenderer.isContextLost()) {
      this._render(scenes);
    }

    // Process pending destroys
    this._processPendingDestroyObjects();

    this._frameInProcess = false;

    if (this._waitingDestroy) {
      this._destroy();
    }

    if (this._waitingGC) {
      this._gc();
      this._waitingGC = false;
    }
  }

  /**
   * Execution engine loop.
   */
  run(): void {
    this.resume();
    this.dispatch(EngineEventType.Run, this);
  }

  /**
   * Force lose graphic device.
   * @remarks Used to simulate the phenomenon after the real loss of device.
   */
  forceLoseDevice(): void {
    this._hardwareRenderer.forceLoseDevice();
  }

  /**
   * Force restore graphic device.
   * @remarks Used to simulate the phenomenon after the real restore of device.
   */
  forceRestoreDevice(): void {
    this._hardwareRenderer.forceRestoreDevice();
  }

  /**
   * Add a post process pass.
   * @param pass - Post process pass to add
   */
  addPostProcessPass(pass: PostProcessPass): void {
    if (pass.engine !== this) {
      throw "The pass is not belong to this engine.";
    }

    const passes = this._postProcessPasses;
    if (passes.indexOf(pass) === -1) {
      passes.push(pass);
      pass.isActive && (this._postProcessPassNeedRefresh = true);
    }
  }

  /**
   * @internal
   */
  _removePostProcessPass(pass: PostProcessPass): void {
    const passes = this._postProcessPasses;
    const index = passes.indexOf(pass);
    if (index !== -1) {
      passes.splice(index, 1);

      pass.isActive && (this._postProcessPassNeedRefresh = true);
    }
  }

  /**
   * @internal
   */
  _refreshActivePostProcessPasses(): void {
    if (this._postProcessPassNeedRefresh) {
      this._postProcessPassNeedRefresh = false;

      const postProcessPasses = this._postProcessPasses;
      const activePostProcesses = this._activePostProcessPasses;
      activePostProcesses.length = 0;

      // Filter
      for (let i = 0, n = postProcessPasses.length; i < n; i++) {
        const pass = postProcessPasses[i];
        if (pass.isActive) {
          activePostProcesses.push(pass);
        }
      }

      // Sort
      if (activePostProcesses.length) {
        activePostProcesses.sort((a, b) => a.event - b.event);
      }
    }
  }

  /**
   * @internal
   */
  _getActivePostProcessPasses(): ReadonlyArray<PostProcessPass> {
    this._refreshActivePostProcessPasses();
    return this._activePostProcessPasses;
  }

  private _processPendingDestroyObjects(): void {
    const pending = this._pendingDestroyObjects;
    this._processingPendingDestroys = true;
    for (let i = 0, n = pending.length; i < n; i++) {
      pending[i].destroy();
    }
    pending.length = 0;
    this._processingPendingDestroys = false;
  }

  private _destroy(): void {
    this._destroyed = true;
    this._waitingDestroy = false;

    this._canvas._sizeUpdateFlagManager.removeListener(this._onCanvasResize);
    this._canvas._destroy();

    this._sceneManager._destroyAllScene();
    this._resourceManager._destroy();

    this.inputManager._destroy();
    this._batcherManager.destroy();
    this._renderTargetPool.gc();
    this.xrManager?._destroy();
    this.dispatch(EngineEventType.Shutdown, this);

    // Cancel animation
    this.pause();

    Shader._clear(this);
    this._hardwareRenderer.destroy();

    this.removeAllEventListeners();
  }

  /**
   * Destroy engine.
   * @remarks If call during frame execution will delay until the end of the frame
   */
  destroy(): void {
    if (this._destroyed) {
      return;
    }

    if (this._frameInProcess) {
      this._waitingDestroy = true;
    } else {
      this._destroy();
    }
  }

  /**
   * @internal
   */
  _getShaderProgramMap(index: number, trackMaps?: ShaderProgramMap[]): ShaderProgramMap {
    const shaderProgramMaps = this._shaderProgramMaps;
    let map = shaderProgramMaps[index];
    if (!map) {
      const length = index + 1;
      if (length > shaderProgramMaps.length) {
        shaderProgramMaps.length = length;
      }
      shaderProgramMaps[index] = map = new ShaderProgramMap(this);
      trackMaps?.push(map);
    }
    return map;
  }

  /**
   * @internal
   */
  _render(scenes: ReadonlyArray<Scene>): void {
    // Update `Renderer` logic and shader data
    const deltaTime = this.time.deltaTime;
    for (let i = 0, n = scenes.length; i < n; i++) {
      const scene = scenes[i];
      if (!scene.isActive || scene.destroyed) continue;
      scene._componentsManager.callRendererOnUpdate(deltaTime);
      scene._updateShaderData();
    }

    // Fire script `onBeginRender` and `onEndRender`
    for (let i = 0, n = scenes.length; i < n; i++) {
      const scene = scenes[i];
      if (!scene.isActive || scene.destroyed) continue;

      const componentsManager = scene._componentsManager;
      const cameras = componentsManager._activeCameras;

      if (cameras.length === 0) {
        Logger.debug("No active camera in scene.");
      } else {
        cameras.forEach(
          (camera: Camera) => {
            componentsManager.callCameraOnBeginRender(camera);

            const { pixelViewport } = camera;
            // `pixelViewport` width or height is `0` will cause internal render target create error and return can save performance
            if (pixelViewport.width !== 0 && pixelViewport.height !== 0) {
              // Update post process manager
              scene.postProcessManager._update(camera);
              camera.render();
            } else {
              Logger.warn("Camera pixelViewport width or height is 0.");
            }

            componentsManager.callCameraOnEndRender(camera);

            // Temp solution for webgl implement bug
            if (this._hardwareRenderer._options._forceFlush) {
              this._hardwareRenderer.flush();
            }
          },
          (camera: Camera, index: number) => {
            camera._cameraIndex = index;
          }
        );
      }

      const uiCanvas = componentsManager._overlayCanvases;
      if (uiCanvas.length > 0) {
        componentsManager.sortOverlayUICanvases();
        UIUtils.renderOverlay(this, scene, uiCanvas);
      }
    }
  }

  /**
   * @internal
   */
  _pendingGC() {
    if (this._frameInProcess) {
      this._waitingGC = true;
    } else {
      this._gc();
    }
  }

  /**
   * @internal
   */
  protected _initialize(configuration: EngineConfiguration): Promise<Engine> {
    const { shaderCompiler, shaderAnalyzer, physics } = configuration;

    if (shaderCompiler && !Shader._shaderCompiler) {
      // Bind the runtime include map so the preprocessor sees every chunk
      // the umbrella package's ShaderPool registered into ShaderFactory.
      // shader-compiler defaults to an empty map and stays free of any direct
      // ShaderFactory dependency, so the binding has to be wired here at the
      // runtime boundary.
      // @ts-ignore — `_setIncludeMap` is shader-compiler @internal; `includeMap`
      // is `ShaderFactory` @internal. Both intentionally cross-package wired.
      shaderCompiler._setIncludeMap(ShaderFactory.includeMap);
      if (shaderAnalyzer) shaderCompiler._setAnalyzer(shaderAnalyzer);
      Shader._shaderCompiler = shaderCompiler;
    }

    const initializePromises = new Array<Promise<any>>();
    if (physics) {
      initializePromises.push(
        physics.initialize().then(() => {
          if (Engine._nativePhysics) {
            console.warn(
              "A physics engine has already been configured. All physics operations will now be handled by the newly specified physics engine."
            );
          }
          Engine._nativePhysics = physics;
          this._nativePhysicsManager = physics.createPhysicsManager();
          this._physicsInitialized = true;
          return this;
        })
      );
    }

    const loaders = ResourceManager._loaders;
    for (const key in loaders) {
      const loader = loaders[key];
      if (loader.initialize) initializePromises.push(loader.initialize(this, configuration));
    }

    initializePromises.push(this._basicResources._initialize());
    return Promise.all(initializePromises).then(() => this);
  }

  private _onDeviceLost(): void {
    this._isDeviceLost = true;
    // Lose graphic resources
    this.resourceManager._lostGraphicResources();
    this._renderingStatistics._reset();
    console.log("Device lost.");
    this.dispatch(EngineEventType.DeviceLost, this);
  }

  private _onDeviceRestored(): void {
    this._hardwareRenderer.resetState();
    this._lastRenderState = new RenderState();
    // Clear shader program maps
    Shader._clear(this);
    this._shaderProgramMaps.length = 0;

    const { resourceManager } = this;
    // Restore graphic resources
    resourceManager._restoreGraphicResources();
    this._isDeviceLost = false;
    console.log("Graphic resource restored.");

    // Restore resources content
    resourceManager
      ._restoreResourcesContent()
      .then(() => {
        console.log("Graphic resource content restored.\n\n" + "Device restored.");
        this.dispatch(EngineEventType.DeviceRestored, this);
      })
      .catch((error) => {
        console.error(error);
      });
  }

  private _gc(): void {
    this._renderElementPool.garbageCollection();
    this._textRenderElementPool.garbageCollection();
    this._renderContext.garbageCollection();
    const scenes = this._sceneManager._scenes.getLoopArray();
    for (let i = 0, n = scenes.length; i < n; i++) {
      scenes[i]?.physics?._gc();
    }
  }

  /**
   * @deprecated
   * The first scene physics manager.
   */
  get physicsManager() {
    return this.sceneManager.scenes[0]?.physics;
  }
}

/**
 * Engine configuration.
 */
export interface EngineConfiguration {
  /** Physics. */
  physics?: IPhysics;
  /** XR Device. */
  xrDevice?: IXRDevice;
  /** Shader compiler. */
  shaderCompiler?: IShaderCompiler;
  /** Shader analyzer used while compiling shader passes. */
  shaderAnalyzer?: IShaderAnalyzer;
  /** Input options. */
  input?: IInputOptions;
}
