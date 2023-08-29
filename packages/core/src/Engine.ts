import { IPhysics, IPhysicsManager, IShaderLab } from "@galacean/engine-design";
import { Color } from "@galacean/engine-math/src/Color";
import { Font } from "./2d/text/Font";
import { Canvas } from "./Canvas";
import { EngineSettings } from "./EngineSettings";
import { Entity } from "./Entity";
import { ClassPool } from "./RenderPipeline/ClassPool";
import { MeshRenderData } from "./RenderPipeline/MeshRenderData";
import { RenderContext } from "./RenderPipeline/RenderContext";
import { RenderElement } from "./RenderPipeline/RenderElement";
import { SpriteRenderData } from "./RenderPipeline/SpriteRenderData";
import { Scene } from "./Scene";
import { SceneManager } from "./SceneManager";
import { ContentRestorer } from "./asset/ContentRestorer";
import { ResourceManager } from "./asset/ResourceManager";
import { EventDispatcher, Logger, Time } from "./base";
import { GLCapabilityType } from "./base/Constant";
import { ColorSpace } from "./enums/ColorSpace";
import { InputManager } from "./input";
import { Material } from "./material/Material";
import { PhysicsScene } from "./physics/PhysicsScene";
import { ColliderShape } from "./physics/shape/ColliderShape";
import { IHardwareRenderer } from "./renderingHardwareInterface";
import { Shader } from "./shader/Shader";
import { ShaderMacro } from "./shader/ShaderMacro";
import { ShaderMacroCollection } from "./shader/ShaderMacroCollection";
import { ShaderPass } from "./shader/ShaderPass";
import { ShaderPool } from "./shader/ShaderPool";
import { ShaderProgramPool } from "./shader/ShaderProgramPool";
import { BlendFactor } from "./shader/enums/BlendFactor";
import { BlendOperation } from "./shader/enums/BlendOperation";
import { ColorWriteMask } from "./shader/enums/ColorWriteMask";
import { CompareFunction } from "./shader/enums/CompareFunction";
import { CullMode } from "./shader/enums/CullMode";
import { RenderQueueType } from "./shader/enums/RenderQueueType";
import { RenderState } from "./shader/state/RenderState";
import { Texture2D, Texture2DArray, TextureCube, TextureCubeFace, TextureFormat } from "./texture";
import { BatcherManager } from "./RenderPipeline/batcher/BatcherManager";
import { SpriteMaskManager } from "./RenderPipeline/SpriteMaskManager";

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
  /** batcher manager of Engine. */
  readonly batcherManager: BatcherManager;
  /** sprite mask manager of Engine. */
  readonly spriteMaskManager: SpriteMaskManager;

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
  _meshRenderDataPool: ClassPool<MeshRenderData> = new ClassPool(MeshRenderData);
  /* @internal */
  _spriteRenderDataPool: ClassPool<SpriteRenderData> = new ClassPool(SpriteRenderData);

  /* @internal */
  _spriteDefaultMaterial: Material;
  /* @internal */
  _spriteMaskDefaultMaterial: Material;
  /* @internal */
  _textDefaultFont: Font;
  /* @internal */
  _renderContext: RenderContext = new RenderContext();

  /* @internal */
  _whiteTexture2D: Texture2D;
  /* @internal */
  _magentaTexture2D: Texture2D;
  /* @internal */
  _magentaTextureCube: TextureCube;
  /* @internal */
  _magentaTexture2DArray: Texture2DArray;
  /* @internal */
  _magentaMaterial: Material;
  /* @internal */
  _depthTexture2D: Texture2D;

  /* @internal */
  _backgroundTextureMaterial: Material;
  /* @internal */
  _renderCount: number = 0;
  /* @internal */
  _shaderProgramPools: ShaderProgramPool[] = [];
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
      this._requestId = requestAnimationFrame(this._animate);
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

    this._spriteDefaultMaterial = this._createSpriteMaterial();
    this._spriteMaskDefaultMaterial = this._createSpriteMaskMaterial();
    this._textDefaultFont = Font.createFromOS(this, "Arial");
    this._textDefaultFont.isGCIgnored = true;

    this.inputManager = new InputManager(this);
    this.batcherManager = new BatcherManager(this);
    this.spriteMaskManager = new SpriteMaskManager(this);

    this._initMagentaTextures(hardwareRenderer);

    if (!hardwareRenderer.canIUse(GLCapabilityType.depthTexture)) {
      this._macroCollection.enable(Engine._noDepthTextureMacro);
    } else {
      const depthTexture2D = new Texture2D(this, 1, 1, TextureFormat.Depth16, false);
      depthTexture2D.isGCIgnored = true;
      this._depthTexture2D = depthTexture2D;
    }

    const magentaMaterial = new Material(this, Shader.find("unlit"));
    magentaMaterial.isGCIgnored = true;
    magentaMaterial.shaderData.setColor("material_BaseColor", new Color(1.0, 0.0, 1.01, 1.0));
    this._magentaMaterial = magentaMaterial;

    const backgroundTextureMaterial = new Material(this, Shader.find("background-texture"));
    backgroundTextureMaterial.isGCIgnored = true;
    backgroundTextureMaterial.renderState.depthState.compareFunction = CompareFunction.LessEqual;
    this._backgroundTextureMaterial = backgroundTextureMaterial;

    const innerSettings = this._settings;
    const colorSpace = configuration.colorSpace || ColorSpace.Linear;
    colorSpace === ColorSpace.Gamma && this._macroCollection.enable(Engine._gammaMacro);
    innerSettings.colorSpace = colorSpace;
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
    cancelAnimationFrame(this._requestId);
    clearTimeout(this._timeoutId);
  }

  /**
   * Resume the engine.
   */
  resume(): void {
    if (!this._isPaused) return;
    this._isPaused = false;
    this.time._reset();
    this._requestId = requestAnimationFrame(this._animate);
  }

  /**
   * Update the engine loop manually. If you call engine.run(), you generally don't need to call this function.
   */
  update(): void {
    if (this._isDeviceLost) {
      return;
    }

    const time = this._time;
    time._update();

    const deltaTime = time.deltaTime;
    this._frameInProcess = true;

    this._renderElementPool.resetPool();
    this._meshRenderDataPool.resetPool();
    this._spriteRenderDataPool.resetPool();

    const { inputManager, _physicsInitialized: physicsInitialized } = this;
    inputManager._update();

    const loopScenes = this._sceneManager._scenes.getLoopArray();
    const sceneCount = loopScenes.length;
    // Sort cameras and fire script `onStart`
    for (let i = 0; i < sceneCount; i++) {
      const scene = loopScenes[i];
      if (scene.destroyed) continue;
      scene._cameraNeedSorting && scene._sortCameras();
      scene._componentsManager.callScriptOnStart();
    }

    // Update physics and fire `onPhysicsUpdate`
    if (physicsInitialized) {
      for (let i = 0; i < sceneCount; i++) {
        const scene = loopScenes[i];
        if (scene.destroyed) continue;
        scene.physics._update(deltaTime);
      }
    }

    // Fire `onPointerXX`
    physicsInitialized && inputManager._firePointerScript(loopScenes);

    // Fire `onUpdate`
    for (let i = 0; i < sceneCount; i++) {
      const scene = loopScenes[i];
      if (scene.destroyed) continue;
      scene._componentsManager.callScriptOnUpdate(deltaTime);
    }

    // Update `Animator` logic
    for (let i = 0; i < sceneCount; i++) {
      const scene = loopScenes[i];
      if (scene.destroyed) continue;
      scene._componentsManager.callAnimationUpdate(deltaTime);
    }

    // Fire `onLateUpdate`
    for (let i = 0; i < sceneCount; i++) {
      const scene = loopScenes[i];
      if (scene.destroyed) continue;
      scene._componentsManager.callScriptOnLateUpdate(deltaTime);
    }

    // Render scene and fire `onBeginRender` and `onEndRender`
    this._render(loopScenes);

    // Handling invalid scripts and fire `onDestroy`
    for (let i = 0; i < sceneCount; i++) {
      const scene = loopScenes[i];
      if (scene.destroyed) continue;
      if (!this._waitingDestroy) {
        scene._componentsManager.handlingInvalidScripts();
      }
    }

    if (this._waitingDestroy) {
      this._destroy();
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
    this._whiteTexture2D.destroy(true);
    this._magentaTexture2D.destroy(true);
    this._magentaTextureCube.destroy(true);
    this._textDefaultFont = null;
    this._fontMap = null;

    this.inputManager._destroy();
    this.batcherManager.destroy();
    this.spriteMaskManager.destroy();
    this.dispatch("shutdown", this);

    // Cancel animation
    this.pause();

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
    }
    return pool;
  }

  /**
   * @internal
   */
  _render(loopScenes: ReadonlyArray<Scene>): void {
    // Update `Renderer` logic and shader data
    for (let i = 0, n = loopScenes.length; i < n; i++) {
      const scene = loopScenes[i];
      if (scene.destroyed) continue;
      const deltaTime = this.time.deltaTime;
      scene._componentsManager.callRendererOnUpdate(deltaTime);
      scene._updateShaderData();
    }

    // Fire script `onBeginRender` and `onEndRender`
    for (let i = 0, n = loopScenes.length; i < n; i++) {
      const scene = loopScenes[i];
      if (scene.destroyed) continue;
      const cameras = scene._activeCameras;
      const cameraCount = cameras.length;
      if (cameraCount > 0) {
        for (let i = 0; i < cameraCount; i++) {
          const camera = cameras[i];
          const componentsManager = scene._componentsManager;
          componentsManager.callCameraOnBeginRender(camera);
          camera.render();
          componentsManager.callCameraOnEndRender(camera);

          // Temp solution for webgl implement bug
          if (this._hardwareRenderer._options._forceFlush) {
            this._hardwareRenderer.flush();
          }
        }
      } else {
        Logger.debug("No active camera in scene.");
      }
    }
  }

  /**
   * @internal
   * Standalone for CanvasRenderer plugin.
   */
  _initMagentaTextures(hardwareRenderer: IHardwareRenderer) {
    const whitePixel = new Uint8Array([255, 255, 255, 255]);
    const whiteTexture2D = new Texture2D(this, 1, 1, TextureFormat.R8G8B8A8, false);
    whiteTexture2D.setPixelBuffer(whitePixel);
    whiteTexture2D.isGCIgnored = true;

    const magentaPixel = new Uint8Array([255, 0, 255, 255]);
    const magentaTexture2D = new Texture2D(this, 1, 1, TextureFormat.R8G8B8A8, false);
    magentaTexture2D.setPixelBuffer(magentaPixel);
    magentaTexture2D.isGCIgnored = true;

    this.resourceManager.addContentRestorer(
      new (class extends ContentRestorer<Texture2D> {
        constructor() {
          super(magentaTexture2D);
        }
        restoreContent() {
          this.resource.setPixelBuffer(magentaPixel);
        }
      })()
    );

    const magentaTextureCube = new TextureCube(this, 1, TextureFormat.R8G8B8A8, false);
    for (let i = 0; i < 6; i++) {
      magentaTextureCube.setPixelBuffer(TextureCubeFace.PositiveX + i, magentaPixel);
    }
    magentaTextureCube.isGCIgnored = true;

    this.resourceManager.addContentRestorer(
      new (class extends ContentRestorer<TextureCube> {
        constructor() {
          super(magentaTextureCube);
        }
        restoreContent() {
          for (let i = 0; i < 6; i++) {
            this.resource.setPixelBuffer(TextureCubeFace.PositiveX + i, magentaPixel);
          }
        }
      })()
    );

    this._whiteTexture2D = whiteTexture2D;
    this._magentaTexture2D = magentaTexture2D;
    this._magentaTextureCube = magentaTextureCube;

    if (hardwareRenderer.isWebGL2) {
      const magentaTexture2DArray = new Texture2DArray(this, 1, 1, 1, TextureFormat.R8G8B8A8, false);
      magentaTexture2DArray.setPixelBuffer(0, magentaPixel);
      magentaTexture2DArray.isGCIgnored = true;
      this.resourceManager.addContentRestorer(
        new (class extends ContentRestorer<Texture2DArray> {
          constructor() {
            super(magentaTexture2DArray);
          }
          restoreContent() {
            this.resource.setPixelBuffer(0, magentaPixel);
          }
        })()
      );
      this._magentaTexture2DArray = magentaTexture2DArray;
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

  private _createSpriteMaterial(): Material {
    const material = new Material(this, Shader.find("Sprite"));
    const renderState = material.renderState;
    const target = renderState.blendState.targetBlendState;
    target.enabled = true;
    target.sourceColorBlendFactor = BlendFactor.SourceAlpha;
    target.destinationColorBlendFactor = BlendFactor.OneMinusSourceAlpha;
    target.sourceAlphaBlendFactor = BlendFactor.One;
    target.destinationAlphaBlendFactor = BlendFactor.OneMinusSourceAlpha;
    target.colorBlendOperation = target.alphaBlendOperation = BlendOperation.Add;
    renderState.depthState.writeEnabled = false;
    renderState.rasterState.cullMode = CullMode.Off;
    material.renderState.renderQueueType = RenderQueueType.Transparent;
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
    this._meshRenderDataPool.garbageCollection();
    this._spriteRenderDataPool.garbageCollection();
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
  /** Color space. */
  colorSpace?: ColorSpace;
  /** Shader lab */
  shaderLab?: IShaderLab;
}
