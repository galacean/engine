import { Event, EventDispatcher, Logger, Time } from "@alipay/o3-base";
import { ResourceManager } from "./AssetDesign/ResourceManager";
import { AssetPool } from "./AssetPool";
import { Canvas } from "./EngineDesign/Canvas";
import { EngineOptions } from "./EngineDesign/EngineOptions";
import { HardwareRenderer } from "./EngineDesign/HardwareRenderer";
import { EngineFeature } from "./EngineFeature";
import { FeatureManager } from "./FeatureManager";
import { Scene } from "./Scene";
import { SceneManager } from "./SceneDesign/SceneManager";
const MAX_FPS: number = 60;

/*
Engine Feature:
{
  preLoad : function() {},
}
*/
const engineFeatureManager = new FeatureManager<EngineFeature>();

/**
 * 引擎包装类，管理一组场景，并对当前的一个场景执行渲染
 * @class
 */
export class Engine extends EventDispatcher {
  /**
   * 当前创建对象所属的默认引擎对象。
   */
  static defaultCreateObjectEngine: Engine = null;

  static _instanceIDCounter: number = 0;
  static _lastCreateEngine: Engine = null;

  private _vSyncCount: number = 1;
  private _targetTrameRate: number;
  private _canvas: Canvas;
  private _resourceManager: ResourceManager = new ResourceManager();
  private _sceneManager: SceneManager = new SceneManager();

  /**
   * 渲染画布。
   */
  get canvas(): Canvas {
    return this._canvas;
  }

  /**
   * 渲染器。
   */
  get hardwareRenderer(): any {
    return this._hardwareRenderer;
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
    return this._paused;
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
   * 目标帧率,vSyncCount = 0 时生效。
   */
  get targetFrameRate(): number {
    return this._targetTrameRate;
  }

  set targetFrameRate(value: number) {
    this._targetTrameRate = value;
  }

  private _FPS: number = MAX_FPS;

  private _time: Time = new Time();

  private _paused: boolean = true;

  private _FPSTime: number = 0;

  private _tickTime: number = 0;

  private _animateTime: Time = new Time();

  private _currentScene: Scene = new Scene(this);

  private _animate: () => void;

  _hardwareRenderer: any;

  /**
   * 创建引擎。
   * @param canvas - 渲染画布
   * @param hardwareRenderer - 渲染器
   * @param options - 引擎初始化选项
   */
  constructor(canvas: Canvas, hardwareRenderer: HardwareRenderer, engineOptions?: EngineOptions) {
    super();
    // 加入 Feature 管理
    engineFeatureManager.addObject(this);
    this.scenes = [this._currentScene];
    this._hardwareRenderer = hardwareRenderer;
    this._hardwareRenderer.init(canvas);
    this._canvas = canvas;
  }

  /**
   * 暂停引擎循环。
   */
  public pause(): void {
    this._paused = true;
    if (this.requestId) {
      cancelAnimationFrame(this.requestId);
      this.requestId = 0;
    }
  }

  /**
   * 恢复引擎循环。
   */
  public resume(): void {
    if (!this._paused) {
      return;
    }
    this._paused = false;

    if (!this._animate) {
      this._animate = () => {
        const animateTime = this._animateTime;
        animateTime.tick();

        // -- tick
        if (this._FPSTime) {
          if (this._tickTime >= this._FPSTime) {
            this._tick();
            this._tickTime -= this._FPSTime;
          }
          this._tickTime += animateTime.deltaTime;
        } else {
          this._tick();
        }

        this.requestId = requestAnimationFrame(this._animate);
      };
    }
    // 防止场景在后台渲染
    this.requestId = requestAnimationFrame(() => {
      // fix lastTickTime every time before animating, otherwise the 1st frame after resuming may gets a too large dt.
      this._animateTime.tick();
      this._animate();
    });
  }

  /**
   * 执行引擎循环。
   */
  public run(): void {
    engineFeatureManager.callFeatureMethod(this, "preLoad", [this]);
    this.resume();
    this.trigger(new Event("run", this));
  }

  /**
   * 销毁引擎。
   */
  public destroy(): void {}

  _getDefaultEngine(): Engine {
    return Engine.defaultCreateObjectEngine || Engine._lastCreateEngine;
  }

  private _tick(): void {
    if (this._paused) {
      return;
    }

    const time = this._time;
    time.tick();
    const deltaTime = time.deltaTime;
    engineFeatureManager.callFeatureMethod(this, "preTick", [this, this.scenes]);

    this._hardwareRenderer.beginFrame();
    for (const scene of this.scenes) {
      scene.update(deltaTime);
      scene.render();
      scene._componentsManager.callComponentDestory();
    }
    this._hardwareRenderer.endFrame();

    engineFeatureManager.callFeatureMethod(this, "postTick", [this, this.scenes]);
  }

  //-----------------------------------------@deprecated-----------------------------------

  /**
   * @deprecated
   */
  public assetPool: AssetPool = new AssetPool();

  /**
   * @deprecated
   */
  public requestId: number;

  public static registerPipline() {}

  /**
   * @deprecated
   * 当前场景
   * @member {Scene}
   * @readonly
   */
  get currentScene(): Scene {
    return this._currentScene;
  }

  set currentScene(scene: Scene) {
    if (scene) {
      this._currentScene = scene;

      if (
        !this.scenes.find((s) => {
          return s === scene;
        })
      ) {
        this.scenes.push(scene);
      }
    }
  }

  /**
   * @deprecated
   * 添加一个场景
   * @return {Scene} 新的场景
   */
  public addScene(): Scene {
    const scene = new Scene(this);
    this.scenes.push(scene);
    return scene;
  }

  /**
   * @deprecated
   * 设置当前渲染的场景
   * @param {number} index scenes 数组的索引
   */
  public setCurrentSceneByIndex(index: number): void {
    if (index >= 0 && index < this.scenes.length) {
      this._currentScene = this.scenes[index];
    } else {
      Logger.error("Engine -- bad scene index: " + index);
    }
  }

  public findFeature(Feature) {
    return engineFeatureManager.findFeature(this, Feature);
  }

  public static registerFeature(Feature: new () => EngineFeature): void {
    engineFeatureManager.registerFeature(Feature);
  }

  public features: EngineFeature[] = [];

  public scenes: Scene[];

  /**
   * 设置/限制帧速率，一般情况下FPS取值范围[15,60]
   * @param {number} FPS 帧速率，Frame per Second
   * @default 60
   */
  public setFPS(FPS: number): void {
    if (FPS >= MAX_FPS) {
      this._FPS = MAX_FPS;
      this._FPSTime = 0;
      this._tickTime = 0;
    } else {
      this._FPS = FPS;
      this._FPSTime = 1000 / FPS;
      this._tickTime = 0;
    }
  }

  /** 关闭当前引擎 */
  public shutdown(): void {
    // -- event
    this.trigger(new Event("shutdown", this));
    engineFeatureManager.callFeatureMethod(this, "shutdown", [this]);
    // -- cancel animation
    if (this.requestId) {
      cancelAnimationFrame(this.requestId);
      this.requestId = 0;
    }

    this._animate = undefined;

    // -- destroy scenes
    for (const scene of this.scenes) {
      scene.destroy();
    }
    this.scenes = [];

    this._currentScene = null;
    this.features = [];
    this._time = null;
    this._animateTime = null;

    // --
    this.assetPool.clear();
    this.assetPool = null;
    (engineFeatureManager as any)._objects = [];
  }
}
