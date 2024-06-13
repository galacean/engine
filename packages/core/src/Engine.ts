import {
  IHardwareRenderer,
  IInputOptions,
  IPhysics,
  IPhysicsManager,
  IShaderLab,
  IXRDevice
} from "@galacean/engine-design";
import { Color } from "@galacean/engine-math";
import { SpriteMaskInteraction } from "./2d";
import { Font } from "./2d/text/Font";
import { BasicResources } from "./BasicResources";
import { Camera } from "./Camera";
import { Canvas } from "./Canvas";
import { EngineSettings } from "./EngineSettings";
import { Entity } from "./Entity";
import { ClassPool } from "./RenderPipeline/ClassPool";
import { RenderContext } from "./RenderPipeline/RenderContext";
import { RenderData } from "./RenderPipeline/RenderData";
import { RenderElement } from "./RenderPipeline/RenderElement";
import { SpriteMaskManager } from "./RenderPipeline/SpriteMaskManager";
import { SpriteMaskRenderData } from "./RenderPipeline/SpriteMaskRenderData";
import { SpriteRenderData } from "./RenderPipeline/SpriteRenderData";
import { TextRenderData } from "./RenderPipeline/TextRenderData";
import { Scene } from "./Scene";
import { SceneManager } from "./SceneManager";
import { ResourceManager } from "./asset/ResourceManager";
import { EventDispatcher, Logger, Time } from "./base";
import { GLCapabilityType } from "./base/Constant";
import { ColorSpace } from "./enums/ColorSpace";
import { InputManager } from "./input";
import { Material } from "./material/Material";
import { ParticleBufferUtils } from "./particle/ParticleBufferUtils";
import { PhysicsScene } from "./physics/PhysicsScene";
import { ColliderShape } from "./physics/shape/ColliderShape";
import { CompareFunction } from "./shader";
import { Shader } from "./shader/Shader";
import { ShaderMacro } from "./shader/ShaderMacro";
import { ShaderMacroCollection } from "./shader/ShaderMacroCollection";
import { ShaderPass } from "./shader/ShaderPass";
import { ShaderPool } from "./shader/ShaderPool";
import { ShaderProgramPool } from "./shader/ShaderProgramPool";
import { BlendFactor } from "./shader/enums/BlendFactor";
import { BlendOperation } from "./shader/enums/BlendOperation";
import { ColorWriteMask } from "./shader/enums/ColorWriteMask";
import { CullMode } from "./shader/enums/CullMode";
import { RenderQueueType } from "./shader/enums/RenderQueueType";
import { RenderState } from "./shader/state/RenderState";
import { Texture2D, TextureFormat } from "./texture";
import { XRManager } from "./xr/XRManager";

ShaderPool.init();

/**
 * Engine.
 */
export class Engine extends EventDispatcher {
  /** @internal */
  static _gammaMacro: ShaderMacro = ShaderMacro.getByName("ENGINE_IS_COLORSPACE_GAMMA");
  /** @internal */
  static _noDepthTextureMacro: ShaderMacro = ShaderMacro.getByName("ENGINE_NO_DEPTH_TEXTURE");
  /** @internal Conversion of space units to pixel units for 2D. */
  static _pixelsPerUnit: number = 100;

  /** Input manager of Engine. */
  readonly inputManager: InputManager;
  /** XR manager of Engine. */
  readonly xrManager: XRManager;

  /** @internal */
  _particleBufferUtils: ParticleBufferUtils;
  /** @internal */
  _physicsInitialized: boolean = false;
  /** @internal */
  _physicalObjectsMap: Record<number, ColliderShape> = {};
  /** @internal */
  _nativePhysicsManager: IPhysicsManager;
  /* @internal */
  _hardwareRenderer: IHardwareRenderer;
  /* @internal */
  _lastRenderState: RenderState = new RenderState();

  /* @internal */
  _renderElementPool: ClassPool<RenderElement> = new ClassPool(RenderElement);
  /* @internal */
  _renderDataPool: ClassPool<RenderData> = new ClassPool(RenderData);
  /* @internal */
  _spriteRenderDataPool: ClassPool<SpriteRenderData> = new ClassPool(SpriteRenderData);
  /* @internal */
  _spriteMaskRenderDataPool: ClassPool<SpriteMaskRenderData> = new ClassPool(SpriteMaskRenderData);
  /* @internal */
  _textRenderDataPool: ClassPool<TextRenderData> = new ClassPool(TextRenderData);

  /* @internal */
  _basicResources: BasicResources;
  /* @internal */
  _spriteDefaultMaterial: Material;
  /** @internal */
  _spriteDefaultMaterials: Material[] = [];
  /* @internal */
  _spriteMaskDefaultMaterial: Material;
  /* @internal */
  _textDefaultFont: Font;
  /* @internal */
  _renderContext: RenderContext = new RenderContext();

  /* @internal */
  _meshMagentaMaterial: Material;
  /* @internal */
  _particleMagentaMaterial: Material;
  /* @internal */
  _depthTexture2D: Texture2D;

  /* @internal */
  _renderCount: number = 0;
  /* @internal */
  _shaderProgramPools: ShaderProgramPool[] = [];
  /** @internal */
  _spriteMaskManager: SpriteMaskManager;
  /** @internal */
  _canSpriteBatch: boolean = true;
  /** @internal */
  _fontMap: Record<string, Font> = {};
  /** @internal @todo: temporary solution */
  _macroCollection: ShaderMacroCollection = new ShaderMacroCollection();

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
  private _frameInProcess: boolean = false;
  private _waitingDestroy: boolean = false;
  private _isDeviceLost: boolean = false;
  private _waitingGC: boolean = false;

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

    this._spriteMaskManager = new SpriteMaskManager(this);
    const { _spriteDefaultMaterials: spriteDefaultMaterials } = this;
    this._spriteDefaultMaterial = spriteDefaultMaterials[SpriteMaskInteraction.None] = this._createSpriteMaterial(
      SpriteMaskInteraction.None
    );
    spriteDefaultMaterials[SpriteMaskInteraction.VisibleInsideMask] = this._createSpriteMaterial(
      SpriteMaskInteraction.VisibleInsideMask
    );
    spriteDefaultMaterials[SpriteMaskInteraction.VisibleOutsideMask] = this._createSpriteMaterial(
      SpriteMaskInteraction.VisibleOutsideMask
    );
    this._spriteMaskDefaultMaterial = this._createSpriteMaskMaterial();
    this._textDefaultFont = Font.createFromOS(this, "Arial");
    this._textDefaultFont.isGCIgnored = true;

    this.inputManager = new InputManager(this, configuration.input);

    const { xrDevice } = configuration;
    if (xrDevice) {
      this.xrManager = new XRManager();
      this.xrManager._initialize(this, xrDevice);
    }


    if (!hardwareRenderer.canIUse(GLCapabilityType.depthTexture)) {
      this._macroCollection.enable(Engine._noDepthTextureMacro);
    } else {
      const depthTexture2D = new Texture2D(this, 1, 1, TextureFormat.Depth16, false);
      depthTexture2D.isGCIgnored = true;
      this._depthTexture2D = depthTexture2D;
    }

    const meshMagentaMaterial = new Material(this, Shader.find("unlit"));
    meshMagentaMaterial.isGCIgnored = true;
    meshMagentaMaterial.shaderData.setColor("material_BaseColor", new Color(1.0, 0.0, 1.01, 1.0));
    this._meshMagentaMaterial = meshMagentaMaterial;

    const particleMagentaMaterial = new Material(this, Shader.find("particle-shader"));
    particleMagentaMaterial.isGCIgnored = true;
    particleMagentaMaterial.shaderData.setColor("material_BaseColor", new Color(1.0, 0.0, 1.01, 1.0));
    this._particleMagentaMaterial = particleMagentaMaterial;

    const innerSettings = this._settings;
    const colorSpace = configuration.colorSpace || ColorSpace.Linear;
    colorSpace === ColorSpace.Gamma && this._macroCollection.enable(Engine._gammaMacro);
    innerSettings.colorSpace = colorSpace;

    this._basicResources = new BasicResources(this);
    this._particleBufferUtils = new ParticleBufferUtils(this);
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
    const time = this._time;
    time._update();

    const deltaTime = time.deltaTime;
    this._frameInProcess = true;

    this._renderElementPool.resetPool();
    this._renderDataPool.resetPool();
    this._spriteRenderDataPool.resetPool();
    this._spriteMaskRenderDataPool.resetPool();
    this._textRenderDataPool.resetPool();

    this.xrManager?._update();
    const { inputManager, _physicsInitialized: physicsInitialized } = this;
    inputManager._update();

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
    physicsInitialized && inputManager._firePointerScript(scenes);

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
    if (!this._isDeviceLost) {
      this._render(scenes);
    }

    if (this._waitingDestroy) {
      this._destroy();
    } else {
      // Handling invalid scripts and fire `onDestroy`
      for (let i = 0; i < sceneCount; i++) {
        const scene = scenes[i];
        if (!scene.isActive || scene.destroyed) continue;
        scene._componentsManager.handlingInvalidScripts();
      }
    }

    if (this._waitingGC) {
      this._gc();
      this._waitingGC = false;
    }
    this._frameInProcess = false;
  }

  /**
   * Execution engine loop.
   */
  run(): void {
    this.resume();
    this.dispatch("run", this);
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

  private _destroy(): void {
    this._sceneManager._destroyAllScene();

    this._resourceManager._destroy();
    this._textDefaultFont = null;
    this._fontMap = null;

    this.inputManager._destroy();
    this.xrManager?._destroy();
    this.dispatch("shutdown", this);

    // Cancel animation
    this.pause();

    this._spriteMaskManager.destroy();
    this._hardwareRenderer.destroy();

    this.removeAllEventListeners();

    this._animate = null;
    this._sceneManager = null;
    this._resourceManager = null;
    this._canvas = null;
    this._time = null;

    this._waitingDestroy = false;
    this._destroyed = true;
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
  _getShaderProgramPool(shaderPass: ShaderPass): ShaderProgramPool {
    const index = shaderPass._shaderPassId;
    const shaderProgramPools = this._shaderProgramPools;
    let pool = shaderProgramPools[index];
    if (!pool) {
      const length = index + 1;
      if (length > shaderProgramPools.length) {
        shaderProgramPools.length = length;
      }
      shaderProgramPools[index] = pool = new ShaderProgramPool();
      shaderPass._shaderProgramPools.push(pool);
    }
    return pool;
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
      const cameras = scene._componentsManager._activeCameras;

      if (cameras.length === 0) {
        Logger.debug("No active camera in scene.");
        continue;
      }

      cameras.forEach(
        (camera: Camera) => {
          const componentsManager = scene._componentsManager;
          componentsManager.callCameraOnBeginRender(camera);
          camera.render();
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
    const { shaderLab, physics } = configuration;

    if (shaderLab) {
      Shader._shaderLab = shaderLab;
    }

    const initializePromises = new Array<Promise<any>>();
    if (physics) {
      initializePromises.push(
        physics.initialize().then(() => {
          PhysicsScene._nativePhysics = physics;
          this._nativePhysicsManager = physics.createPhysicsManager();
          this._physicsInitialized = true;
          return this;
        })
      );
    }

    const loaders = ResourceManager._loaders;
    for (let key in loaders) {
      const loader = loaders[key];
      if (loader.initialize) initializePromises.push(loader.initialize(this, configuration));
    }
    return Promise.all(initializePromises).then(() => this);
  }

  private _createSpriteMaterial(maskInteraction: SpriteMaskInteraction): Material {
    const material = new Material(this, Shader.find("Sprite"));
    const renderState = material.renderState;
    const target = renderState.blendState.targetBlendState;
    target.enabled = true;
    target.sourceColorBlendFactor = BlendFactor.SourceAlpha;
    target.destinationColorBlendFactor = BlendFactor.OneMinusSourceAlpha;
    target.sourceAlphaBlendFactor = BlendFactor.One;
    target.destinationAlphaBlendFactor = BlendFactor.OneMinusSourceAlpha;
    target.colorBlendOperation = target.alphaBlendOperation = BlendOperation.Add;
    if (maskInteraction !== SpriteMaskInteraction.None) {
      const stencilState = renderState.stencilState;
      stencilState.enabled = true;
      stencilState.writeMask = 0x00;
      stencilState.referenceValue = 1;
      const compare =
        maskInteraction === SpriteMaskInteraction.VisibleInsideMask
          ? CompareFunction.LessEqual
          : CompareFunction.Greater;
      stencilState.compareFunctionFront = compare;
      stencilState.compareFunctionBack = compare;
    }
    renderState.depthState.writeEnabled = false;
    renderState.rasterState.cullMode = CullMode.Off;
    renderState.renderQueueType = RenderQueueType.Transparent;
    material.isGCIgnored = true;
    return material;
  }

  private _createSpriteMaskMaterial(): Material {
    const material = new Material(this, Shader.find("SpriteMask"));
    const renderState = material.renderState;
    renderState.blendState.targetBlendState.colorWriteMask = ColorWriteMask.None;
    renderState.rasterState.cullMode = CullMode.Off;
    renderState.stencilState.enabled = true;
    renderState.depthState.enabled = false;
    material.isGCIgnored = true;
    return material;
  }

  private _onDeviceLost(): void {
    this._isDeviceLost = true;
    // Lose graphic resources
    this.resourceManager._lostGraphicResources();
    console.log("Device lost.");
    this.dispatch("devicelost", this);
  }

  private _onDeviceRestored(): void {
    this._hardwareRenderer.resetState();
    this._lastRenderState = new RenderState();
    // Clear shader pools
    this._shaderProgramPools.length = 0;

    const { resourceManager } = this;
    // Restore graphic resources
    resourceManager._restoreGraphicResources();
    console.log("Graphic resource restored.");

    // Restore resources content
    resourceManager
      ._restoreResourcesContent()
      .then(() => {
        console.log("Graphic resource content restored.\n\n" + "Device restored.");
        this.dispatch("devicerestored", this);
        this._isDeviceLost = false;
      })
      .catch((error) => {
        console.error(error);
      });
  }

  private _gc(): void {
    this._renderElementPool.garbageCollection();
    this._renderDataPool.garbageCollection();
    this._spriteRenderDataPool.garbageCollection();
    this._spriteMaskRenderDataPool.garbageCollection();
    this._textRenderDataPool.garbageCollection();
    this._renderContext.garbageCollection();
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
  /** Color space. */
  colorSpace?: ColorSpace;
  /** Shader lab. */
  shaderLab?: IShaderLab;
  /** Input options. */
  input?: IInputOptions;
}
