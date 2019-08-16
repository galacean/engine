import { Engine } from "./Engine";
import { Scene } from "./Scene";

/**
 * 引擎功能特性插件基类
 * @class
 */
export class EngineFeature {

  /**
   * 引擎主循环运行之前的回调，用来预加载资源
   * @param {Engine} engine
   */
  public preLoad(engine: Engine): void {
  }

  /**
   * 场景 Tick 之前的回调
   * @param {Engine} engine
   * @param {Scene} currentScene
   */
  public preTick(engine: Engine, currentScene: Scene): void {
  }

  /**
   * 场景 Tick 完成之后的回调
   * @param {Engine} engine
   */
  public postTick(engine: Engine, currentScene: Scene): void {
  }

  /**
   * 引擎关闭的时候调用
   * @param {Engine} engine
   */
  public shutdown(engine: Engine): void {
  }

}
