import { AssetPromise } from "./asset/AssetPromise";
import { Engine } from "./Engine";
import { Scene } from "./Scene";

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
   * @internal
   */
  constructor(public readonly engine: Engine) {}

  /**
   * 加载并激活场景。
   * @param url - 场景路径
   * @param destroyOldScene - 是否销毁旧场景信息
   * @returns 场景请求
   */
  loadScene(url: string, destroyOldScene: boolean = true): AssetPromise<Scene> {
    const scenePromise = this.engine.resourceManager.load<Scene>(url);
    scenePromise.then((scene: Scene) => {
      const oldScene: Scene = this._activeScene;
      this.activeScene = scene;
      if (oldScene && destroyOldScene) {
        oldScene.destroy();
      }
    });
    return scenePromise;
  }

  /**
   * 合并场景，将源场景合并到目标场景。
   * @remarks 合并后将使用 destScene 的全局信息,lightingMap 信息会进行合并。
   * @param sourceScene - 源场景
   * @param destScene - 目标场景
   */
  mergeScenes(sourceScene: Scene, destScene: Scene): void {
    const oldRootEntities = sourceScene.rootEntities;
    for (let i: number = 0, n: number = oldRootEntities.length; i < n; i++) {
      destScene.addRootEntity(oldRootEntities[i]);
    }
  }
}
