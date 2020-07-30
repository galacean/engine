import { Camera } from "./Camera";
import { Scene } from "./Scene";

/**
 * 场景的功能特性插件基类
 * @class
 */
export abstract class SceneFeature {
  /**
   * 场景 Update 之前的回调
   * @param {Scene} scene
   */
  public preUpdate(scene: Scene): void {}

  /**
   * 场景 Update 之后的回调
   * @param {Scene} scene
   */
  public postUpdate(scene: Scene): void {}

  /**
   * 场景渲染前的回调
   * @param scene
   * @param camera
   */
  public preRender(scene: Scene, camera: Camera): void {}

  /**
   * 场景渲染后的回调
   * @param scene
   * @param camera
   */
  public postRender(scene: Scene, camera: Camera): void {}

  /**
   * 场景销毁的时候调用
   * @param {Scene} scene
   */
  public destroy(scene: Scene): void {}
}
