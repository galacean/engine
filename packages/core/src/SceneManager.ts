import { Scene } from "./Scene";
import { AssetPromise } from "./AssetDesign/AssetPromise";

/**
 * 场景管理员。
 */
export class SceneManager {
  _activeScene: Scene;

  /**
   * 当前激活场景。
   */
  get activeScene(): Scene {
    return this._activeScene;
  }

  set activeScene(scene: Scene) {
    const oldScene = this._activeScene;
    if (oldScene !== scene) {
      oldScene && oldScene._processActive(false);
      scene && scene._processActive(true);
      this._activeScene = scene;
    }
  }

  /**
   * 加载并激活场景。
   * @todo implements
   * @param url - 场景路径
   * @param destroyOldScene - 是否销毁旧场景信息
   * @returns 场景请求
   */
  loadScene(url: string, destroyOldScene: boolean = true): AssetPromise<Scene> {
    return null;
  }

  /**
   * 合并场景，将源场景合并到目标场景。
   * @todo implements
   * @remarks 合并后将使用 destScene 的全局信息,lightingMap 信息会进行合并。
   * @param sourceScene - 源场景
   * @param destScene - 目标场景
   */
  mergeScenes(sourceScene: Scene, destScene: Scene): void {}
}
