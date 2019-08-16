import { Scene } from "./Scene";
import { AssetPool } from "./AssetPool";
import { FeatureManager } from "./FeatureManager";
import { Time, Logger, Event, EventDispatcher } from "@alipay/r3-base";
import { ACamera } from "./ACamera";
import { EngineFeature } from "./EngineFeature";

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
   * 计时器对象
   * @member {Time}
   * @readonly
   */
  get time(): Time {

    return this._time;

  }

  /**
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

      if (!this.scenes.find((s) => {

        return s === scene;

      })) {

        this.scenes.push(scene);

      }

    }

  }

  /**
   * 是否处于暂停状态
   * @member {boolean}
   * @readonly
   */
  get isPaused(): boolean {
    return this._paused;
  }

  public static registerFeature(Feature: new () => EngineFeature): void {
    engineFeatureManager.registerFeature(Feature);
  }

  public features: EngineFeature[] = [];

  public scenes: Scene[];
  /**
   * 资源池
   * @member
   */
  public assetPool: AssetPool = new AssetPool();

  public requestId: number;

  private _FPS: number = MAX_FPS;

  private _rhis: any[] = [];

  private _time: Time = new Time();

  private _paused: boolean = false;

  private _FPSTime: number = 0;

  private _tickTime: number = 0;

  private _animateTime: Time = new Time();

  private _currentScene: Scene = new Scene(this);

  private _fixedUpdateInterval: number = 1000 / 30.0;

  private _animate: () => void;
  /**
   * 构造函数
   * @constructor
   */
  constructor() {

    super();

    // 加入 Feature 管理
    engineFeatureManager.addObject(this);

    // -- members -------------------------------------
    /**
     * 加载的所有场景的存储数组
     * @member
     */
    this.scenes = [this._currentScene];
  }

  public findFeature(Feature) {

    return engineFeatureManager.findFeature(this, Feature);

  }

  /**
   * 请求 RHI
   * @param {Function} T RHI类型
   * @param {String|HTMLCanvasElement} canvas 画布
   * @param {Object} attributes 配置信息
   * @private
   */
  public requireRHI<T>(RHI: new (canvas: string | HTMLCanvasElement, attributes: object) => T, canvas: string | HTMLCanvasElement, attributes: object): T {
    let c: HTMLCanvasElement;
    if (typeof canvas === "string") {
      c = document.getElementById(canvas) as HTMLCanvasElement;
    } else if (canvas instanceof HTMLCanvasElement) {
      c = canvas;
    }

    if (c) {
      for (const _rhi of this._rhis) {
        if (_rhi.canvas === c) {
          return _rhi;
        }
      }
      const rhi = new RHI(canvas, attributes);
      this._rhis.push(rhi);
      return rhi;
    } else {
      Logger.warn(`unknown canvas parameter:  ${canvas}`);
    }
  }

  /**
   * 添加一个场景
   * @return {Scene} 新的场景
   */
  public addScene(): Scene {
    const scene = new Scene(this);
    this.scenes.push(scene);
    return scene;
  }

  /**
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

  /**
   * 设置 fixedUpdate 事件触发的间隔时间
   * @param {number} t 间隔时间，单位：毫秒
   */
  public setFixedUpdateInterval(t: number): void {
    this._fixedUpdateInterval = t;
  }

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

  /** 暂停渲染 */
  public pause(): void {
    this._paused = true;
    if (this.requestId) {
      cancelAnimationFrame(this.requestId);
      this.requestId = 0;
    }
  }

  /** 继续（暂停后的）渲染 */
  public resume(): void {

    this._paused = false;

    let fixedUpdateAccumulator = 0;

    if (!this._animate) {
      this._animate = () => {

        const animateTime = this._animateTime;
        animateTime.tick();

        if (this._currentScene) {

          const interval = this._fixedUpdateInterval;
          fixedUpdateAccumulator += animateTime.deltaTime;
          // let updCount = 0;
          while (fixedUpdateAccumulator >= interval) {

            this._currentScene.trigger(new Event("fixedUpdate", this));
            fixedUpdateAccumulator -= interval;
            // updCount ++;

          }
          // console.log( 'updCount: ' + updCount  + ', ' + fixedUpdateAccumulator );

        }

        // -- tick
        if (this._FPSTime) {

          if (this._tickTime >= this._FPSTime) {

            this.tick();
            this._tickTime -= this._FPSTime;

          }
          this._tickTime += animateTime.deltaTime;

        } else {

          this.tick();

        }

        this.requestId = requestAnimationFrame(this._animate);

      };

    }

    // fix lastTickTime every time before animating, otherwise the 1st frame after resuming may gets a too large dt.
    this._animateTime.tick();
    this._animate();

    // var self = this;
    // var animateTime = this._animateTime;

    // var lastFixedUpdateTime = animateTime.nowTime;

    // function animate() {

    //   animateTime.tick();

    //   //-- fixed update
    //   if( self._currentScene ){

    //     const nowTime = animateTime.nowTime;
    //     const interval = self._fixedUpdateInterval;
    //     let dt = nowTime - lastFixedUpdateTime;
    //     const needUpdate = dt > interval;

    //     while( dt > interval ){

    //       self._currentScene.trigger( new Event( 'fixedUpdate', self ) );
    //       dt -= interval;

    //     }

    //     if( needUpdate ){

    //       lastFixedUpdateTime = nowTime - dt;

    //     }

    //   }

    //   //-- tick
    //   if ( self._FPSTime ) {

    //     if ( self._tickTime >= self._FPSTime ) {

    //       self.tick();
    //       self._tickTime -= self._FPSTime;

    //     }
    //     self._tickTime += animateTime.deltaTime;

    //   } else {

    //     self.tick();

    //   }
    //   self.requestId = requestAnimationFrame( animate );

    // }// end of function
    // animate();

  }

  /** 运行引擎，驱动每帧动画更新 */
  public run(): void {
    engineFeatureManager.callFeatureMethod(this, "preLoad", [this]);
    this.resume();
    this.trigger(new Event("run", this));
  }

  public render(scene: Scene, camera: ACamera): void {

  }

  /** 更新当前场景中对象的状态，并渲染当前帧画面
   * @private
   */
  public tick(): void {

    if (this._paused) {
      return;
    }

    const time = this._time;
    time.tick();
    const deltaTime = time.deltaTime;
    engineFeatureManager.callFeatureMethod(this, "preTick", [this, this.scenes]);

    for (const rhi of this._rhis) {
      rhi.beginFrame();
    }

    for (const scene of this.scenes) {
      scene.update(deltaTime);
      scene.render();
    }

    for (const rhi of this._rhis) {
      rhi.endFrame();
    }

    engineFeatureManager.callFeatureMethod(this, "postTick", [this, this.scenes]);

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

    // --
    this.assetPool.clear();

  }

}
