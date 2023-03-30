import { Color } from "@oasis-engine/math/src/Color";
import { Font } from "./2d/text/Font";
import { ResourceManager } from "./asset/ResourceManager";
import { Event, EventDispatcher, Logger, Time } from "./base";
import { GLCapabilityType } from "./base/Constant";
import { Canvas } from "./Canvas";
import { ComponentsManager } from "./ComponentsManager";
import { EngineSettings } from "./EngineSettings";
import { Entity } from "./Entity";
import { ColorSpace } from "./enums/ColorSpace";
import { InputManager } from "./input";
import { LightManager } from "./lighting/LightManager";
import { Material } from "./material/Material";
import { PhysicsManager } from "./physics";
import { IHardwareRenderer } from "./renderingHardwareInterface";
import { ClassPool } from "./RenderPipeline/ClassPool";
import { MeshRenderElement } from "./RenderPipeline/MeshRenderElement";
import { RenderContext } from "./RenderPipeline/RenderContext";
import { SpriteElement } from "./RenderPipeline/SpriteElement";
import { SpriteMaskElement } from "./RenderPipeline/SpriteMaskElement";
import { SpriteMaskManager } from "./RenderPipeline/SpriteMaskManager";
import { TextRenderElement } from "./RenderPipeline/TextRenderElement";
import { Scene } from "./Scene";
import { SceneManager } from "./SceneManager";
import { BlendFactor } from "./shader/enums/BlendFactor";
import { BlendOperation } from "./shader/enums/BlendOperation";
import { ColorWriteMask } from "./shader/enums/ColorWriteMask";
import { CompareFunction } from "./shader/enums/CompareFunction";
import { CullMode } from "./shader/enums/CullMode";
import { RenderQueueType } from "./shader/enums/RenderQueueType";
import { Shader } from "./shader/Shader";
import { ShaderMacro } from "./shader/ShaderMacro";
import { ShaderMacroCollection } from "./shader/ShaderMacroCollection";
import { ShaderPass } from "./shader/ShaderPass";
import { ShaderPool } from "./shader/ShaderPool";
import { ShaderProgramPool } from "./shader/ShaderProgramPool";
import { RenderState } from "./shader/state/RenderState";
import { Texture2D, Texture2DArray, TextureCube, TextureCubeFace, TextureFormat } from "./texture";

ShaderPool.init();

/**
 * Engine.
 */
export class Engine extends EventDispatcher {
  /** @internal */
  static _gammaMacro: ShaderMacro = Shader.getMacroByName("OASIS_COLORSPACE_GAMMA");
  /** @internal */
  static _noDepthTextureMacro: ShaderMacro = Shader.getMacroByName("OASIS_NO_DEPTH_TEXTURE");
  /** @internal Conversion of space units to pixel units for 2D. */
  static _pixelsPerUnit: number = 100;

  /** Physics manager of Engine. */
  readonly physicsManager: PhysicsManager;
  readonly inputManager: InputManager;

  _lightManager: LightManager = new LightManager();
  _componentsManager: ComponentsManager = new ComponentsManager();
  _hardwareRenderer: IHardwareRenderer;
  _lastRenderState: RenderState = new RenderState();
  _renderElementPool: ClassPool<MeshRenderElement> = new ClassPool(MeshRenderElement);
  _spriteElementPool: ClassPool<SpriteElement> = new ClassPool(SpriteElement);
  _spriteMaskElementPool: ClassPool<SpriteMaskElement> = new ClassPool(SpriteMaskElement);
  _textElementPool: ClassPool<TextRenderElement> = new ClassPool(TextRenderElement);
  _spriteDefaultMaterial: Material;
  _spriteMaskDefaultMaterial: Material;
  _textDefaultFont: Font;
  _renderContext: RenderContext = new RenderContext();

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
  _spriteMaskManager: SpriteMaskManager;
  /** @internal */
  _canSpriteBatch: boolean = true;
  /** @internal @todo: temporary solution */
  _macroCollection: ShaderMacroCollection = new ShaderMacroCollection();

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
  private _waittingDestroy: boolean = false;

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
   * Get the resource manager.
   */
  get resourceManager(): ResourceManager {
    return this._resourceManager;
  }

  /**
   * Get the scene manager.
   */
  get sceneManager(): SceneManager {
    return this._sceneManager;
  }

  /**
   * Get the Time class.
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

  /**
   * Create engine.
   * @param canvas - The canvas to use for rendering
   * @param hardwareRenderer - Graphics API renderer
   * @param settings - Engine Settings
   */
  constructor(canvas: Canvas, hardwareRenderer: IHardwareRenderer, settings?: EngineSettings) {
    super();
    this._hardwareRenderer = hardwareRenderer;
    this._hardwareRenderer.init(canvas);

    this.physicsManager = new PhysicsManager(this);

    this._canvas = canvas;
    this._sceneManager.activeScene = new Scene(this, "DefaultScene");

    this._spriteMaskManager = new SpriteMaskManager(this);
    this._spriteDefaultMaterial = this._createSpriteMaterial();
    this._spriteMaskDefaultMaterial = this._createSpriteMaskMaterial();
    this._textDefaultFont = Font.createFromOS(this, "Arial");
    this._textDefaultFont.isGCIgnored = false;

    this.inputManager = new InputManager(this);

    const magentaPixel = new Uint8Array([255, 0, 255, 255]);

    const magentaTexture2D = new Texture2D(this, 1, 1, TextureFormat.R8G8B8A8, false);
    magentaTexture2D.setPixelBuffer(magentaPixel);
    magentaTexture2D.isGCIgnored = true;

    const magentaTextureCube = new TextureCube(this, 1, TextureFormat.R8G8B8A8, false);
    magentaTextureCube.setPixelBuffer(TextureCubeFace.PositiveX, magentaPixel);
    magentaTextureCube.setPixelBuffer(TextureCubeFace.NegativeX, magentaPixel);
    magentaTextureCube.setPixelBuffer(TextureCubeFace.PositiveY, magentaPixel);
    magentaTextureCube.setPixelBuffer(TextureCubeFace.NegativeY, magentaPixel);
    magentaTextureCube.setPixelBuffer(TextureCubeFace.PositiveZ, magentaPixel);
    magentaTextureCube.setPixelBuffer(TextureCubeFace.NegativeZ, magentaPixel);
    magentaTextureCube.isGCIgnored = true;

    if (!hardwareRenderer.canIUse(GLCapabilityType.depthTexture)) {
      this._macroCollection.enable(Engine._noDepthTextureMacro);
    } else {
      const depthTexture2D = new Texture2D(this, 1, 1, TextureFormat.Depth16, false);
      depthTexture2D.isGCIgnored = true;
      this._depthTexture2D = depthTexture2D;
    }

    this._magentaTexture2D = magentaTexture2D;
    this._magentaTextureCube = magentaTextureCube;

    if (hardwareRenderer.isWebGL2) {
      const magentaTexture2DArray = new Texture2DArray(this, 1, 1, 1, TextureFormat.R8G8B8A8, false);
      magentaTexture2DArray.setPixelBuffer(0, magentaPixel);
      magentaTexture2DArray.isGCIgnored = true;
      this._magentaTexture2DArray = magentaTexture2DArray;
    }

    const magentaMaterial = new Material(this, Shader.find("unlit"));
    magentaMaterial.shaderData.setColor("u_baseColor", new Color(1.0, 0.0, 1.01, 1.0));
    this._magentaMaterial = magentaMaterial;

    const backgroundTextureMaterial = new Material(this, Shader.find("background-texture"));
    backgroundTextureMaterial.isGCIgnored = true;
    backgroundTextureMaterial.renderState.depthState.compareFunction = CompareFunction.LessEqual;
    this._backgroundTextureMaterial = backgroundTextureMaterial;

    const innerSettings = this._settings;
    const colorSpace = settings?.colorSpace || ColorSpace.Linear;
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
    this.time.reset();
    this._requestId = requestAnimationFrame(this._animate);
  }

  /**
   * Update the engine loop manually. If you call engine.run(), you generally don't need to call this function.
   */
  update(): void {
    const time = this._time;
    time.tick();
    
    const deltaTime = time.deltaTime;
    this._frameInProcess = true;

    this._renderElementPool.resetPool();
    this._spriteElementPool.resetPool();
    this._spriteMaskElementPool.resetPool();
    this._textElementPool.resetPool();

    const scene = this._sceneManager._activeScene;
    const componentsManager = this._componentsManager;
    if (scene) {
      scene._activeCameras.sort((camera1, camera2) => camera1.priority - camera2.priority);

      componentsManager.callScriptOnStart();
      this.physicsManager._initialized && this.physicsManager._update(deltaTime / 1000.0);
      this.inputManager._update();
      componentsManager.callScriptOnUpdate(deltaTime);
      componentsManager.callAnimationUpdate(deltaTime);
      componentsManager.callScriptOnLateUpdate(deltaTime);
      this._render(scene);
    }

    if (!this._waittingDestroy) {
      componentsManager.handlingInvalidScripts();
    }
    if (this._waittingDestroy) {
      this._destroy();
    }
    this._frameInProcess = false;
  }

  /**
   * Execution engine loop.
   */
  run(): void {
    this.resume();
    this.trigger(new Event("run", this));
  }

  private _destroy(): void {
    this._sceneManager._destroyAllScene();
    this._componentsManager.handlingInvalidScripts();

    this._resourceManager._destroy();
    this._magentaTexture2D.destroy(true);
    this._magentaTextureCube.destroy(true);
    this._textDefaultFont.destroy(true);

    this.inputManager._destroy();
    this.trigger(new Event("shutdown", this));

    // -- cancel animation
    this.pause();

    this._animate = null;

    this._sceneManager = null;
    this._resourceManager = null;
    this._canvas = null;
    this._time = null;

    // delete mask manager
    this._spriteMaskManager.destroy();

    this.removeAllEventListeners();
    this._waittingDestroy = false;
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
      this._waittingDestroy = true;
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
   * @intenral
   */
  _render(scene: Scene): void {
    const cameras = scene._activeCameras;
    const componentsManager = this._componentsManager;
    const deltaTime = this.time.deltaTime;
    componentsManager.callRendererOnUpdate(deltaTime);

    scene._updateShaderData();

    if (cameras.length > 0) {
      for (let i = 0, n = cameras.length; i < n; i++) {
        const camera = cameras[i];
        componentsManager.callCameraOnBeginRender(camera);
        camera.render();
        componentsManager.callCameraOnEndRender(camera);

        // temp solution for webgl implement bug
        if (this._hardwareRenderer._options._forceFlush) {
          this._hardwareRenderer.flush();
        }
      }
    } else {
      Logger.debug("NO active camera.");
    }
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
}
