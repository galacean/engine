import { Event, EventDispatcher, Logger, Time } from "./base";
import { ResourceManager } from "./asset/ResourceManager";
import { Canvas } from "./Canvas";
import { HardwareRenderer } from "./HardwareRenderer";
import { EngineFeature } from "./EngineFeature";
import { FeatureManager } from "./FeatureManager";
import { Scene } from "./Scene";
import { SceneManager } from "./SceneManager";
import { Entity } from "./Entity";
import { ComponentsManager } from "./ComponentsManager";

/** todo: delete */
const engineFeatureManager = new FeatureManager<EngineFeature>();

/**
 * 引擎。
 */
export class Engine extends EventDispatcher {
  /**
   * 当前创建对象所属的默认引擎对象。
   */
  static defaultCreateObjectEngine: Engine = null;

  static _lastCreateEngine: Engine = null;

  static _getDefaultEngine(): Engine {
    return Engine.defaultCreateObjectEngine || Engine._lastCreateEngine;
  }

  _componentsManager: ComponentsManager = new ComponentsManager();
  _hardwareRenderer: HardwareRenderer;

  protected _canvas: Canvas;
  private _resourceManager: ResourceManager = new ResourceManager(this);
  private _sceneManager: SceneManager = new SceneManager(this);
  private _vSyncCount: number = 1;
  private _targetFrameRate: number = 60;
  private _time: Time = new Time();
  private _isPaused: boolean = true;
  private _requestId: number;
  private _timeoutId: number;
  private _loopCounter: number = 0;
  private _targetFrameInterval: number = 1000 / 60;

  private _animate = () => {
    if (this._vSyncCount) {
      this._requestId = requestAnimationFrame(this._animate);
      if (this._loopCounter++ % this._vSyncCount === 0) {
        this.update();
        this._loopCounter = 0;
      }
    } else {
      this._timeoutId = window.setTimeout(this._animate, this._targetFrameInterval);
      this.update();
    }
  };

  /**
   * 渲染画布。
   */
  get canvas(): Canvas {
    return this._canvas;
  }

  /**
   * 资源管理器。
   */
  get resourceManager(): ResourceManager {
    return this._resourceManager;
  }

  /**
   * 场景管理器。
   */
  get sceneManager(): SceneManager {
    return this._sceneManager;
  }

  /**
   * 计时器。
   */
  get time(): Time {
    return this._time;
  }

  /**
   * 是否暂停。
   */
  get isPaused(): boolean {
    return this._isPaused;
  }

  /**
   * 垂直同步数量,表示执行一帧的垂直消隐数量,0表示关闭垂直同步。
   */
  get vSyncCount(): number {
    return this._vSyncCount;
  }

  set vSyncCount(value: number) {
    this._vSyncCount = Math.max(0, Math.floor(value));
  }

  /**
   * 目标帧率，vSyncCount = 0（即关闭垂直同步）时生效。
   * 值越大，目标帧率越高，Number.POSITIVE_INFINIT 表示无穷大目标帧率。
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
   * @deprecated
   * 图形API渲染器。
   */
  get renderhardware(): HardwareRenderer {
    return this._hardwareRenderer;
  }

  /**
   * 创建引擎。
   * @param canvas - 渲染画布
   * @param hardwareRenderer - 渲染器
   */
  constructor(canvas: Canvas, hardwareRenderer: HardwareRenderer) {
    super();
    Engine._lastCreateEngine = this;
    this._hardwareRenderer = hardwareRenderer;
    this._hardwareRenderer.init(canvas);
    this._canvas = canvas;
    // @todo delete
    engineFeatureManager.addObject(this);
    this._sceneManager.activeScene = new Scene("DefaultScene", this);
  }

  /**
   * 创建实体。
   * @param name - 名字
   */
  createEntity(name?: string): Entity {
    return new Entity(name, this);
  }

  /**
   * 暂停引擎循环。
   */
  pause(): void {
    this._isPaused = true;
    cancelAnimationFrame(this._requestId);
    clearTimeout(this._timeoutId);
  }

  /**
   * 恢复引擎循环。
   */
  resume(): void {
    if (!this._isPaused) return;
    this._isPaused = false;
    requestAnimationFrame(this._animate);
  }

  /**
   * 引擎手动更新，如果调用 run() 则一般无需调用该函数。
   */
  update(): void {
    const time = this._time;
    time.tick();
    const deltaTime = time.deltaTime;
    engineFeatureManager.callFeatureMethod(this, "preTick", [this, this._sceneManager._activeScene]);

    this._hardwareRenderer.beginFrame();

    const scene = this._sceneManager._activeScene;
    const componentsManager = this._componentsManager;
    if (scene) {
      componentsManager.callScriptOnStart();
      componentsManager.callScriptOnUpdate(deltaTime);
      componentsManager.callAnimationUpdate(deltaTime);
      componentsManager.callScriptOnLateUpdate(deltaTime);

      this._render(scene);
    }

    this._componentsManager.callComponentDestory();
    this._hardwareRenderer.endFrame();

    engineFeatureManager.callFeatureMethod(this, "postTick", [this, this._sceneManager._activeScene]);
  }

  /**
   * 执行引擎循环。
   */
  run(): void {
    // @todo: delete
    engineFeatureManager.callFeatureMethod(this, "preLoad", [this]);
    this.resume();
    this.trigger(new Event("run", this));
  }

  /**
   * 销毁引擎。
   */
  destroy(): void {
    // -- event
    this.trigger(new Event("shutdown", this));
    engineFeatureManager.callFeatureMethod(this, "shutdown", [this]);

    // -- cancel animation
    this.pause();

    this._animate = null;

    this._sceneManager._activeScene.destroy();
    this._sceneManager = null;
    this._resourceManager.gc();
    this._resourceManager = null;

    this._canvas = null;

    this.features = [];
    this._time = null;

    // todo: delete
    (engineFeatureManager as any)._objects = [];
  }

  _render(scene: Scene): void {
    const cameras = scene._activeCameras;
    const componentsManager = this._componentsManager;
    const deltaTime = this.time.deltaTime;
    componentsManager.callRendererOnUpdate(deltaTime);
    if (cameras.length > 0) {
      // 针对 priority 进行排序
      //@ts-ignore
      cameras.sort((camera1, camera2) => camera1.priority - camera2.priority);
      for (let i = 0, l = cameras.length; i < l; i++) {
        const camera = cameras[i];
        const cameraEntity = camera.entity;
        if (camera.enabled && cameraEntity.isActiveInHierarchy) {
          componentsManager.callCameraOnBeginRender(camera);
          Scene.sceneFeatureManager.callFeatureMethod(scene, "preRender", [this, camera]); //TODO:移除
          camera.render();
          Scene.sceneFeatureManager.callFeatureMethod(scene, "postRender", [this, camera]); //TODO:移除
          componentsManager.callCameraOnEndRender(camera);
        }
      }
    } else {
      Logger.debug("NO active camera.");
    }
  }

  //-----------------------------------------@deprecated-----------------------------------

  findFeature(Feature) {
    return engineFeatureManager.findFeature(this, Feature);
  }

  static registerFeature(Feature: new () => EngineFeature): void {
    engineFeatureManager.registerFeature(Feature);
  }

  features: EngineFeature[] = [];
}
