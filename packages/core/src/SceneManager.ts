import { AssetPromise } from "./asset/AssetPromise";
import { Engine } from "./Engine";
import { Scene } from "./Scene";

/**
 * Scene manager.
 */
export class SceneManager {
  /** @internal */
  _allScenes: Scene[] = [];
  /** @internal */
  _activeScene: Scene;

  /**
   * Get the activated scene.
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
   * Load and activate scene.
   * @param url - the path of the scene
   * @param destroyOldScene - whether to destroy old scene information
   * @returns scene promise
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
   * Merge the source scene into the target scene.
   * @remarks the global information of destScene will be used after the merge, and the lightingMap information will be merged.
   * @param sourceScene - source scene
   * @param destScene - target scene
   */
  mergeScenes(sourceScene: Scene, destScene: Scene): void {
    const oldRootEntities = sourceScene.rootEntities;
    for (let i: number = 0, n: number = oldRootEntities.length; i < n; i++) {
      destScene.addRootEntity(oldRootEntities[i]);
    }
  }

  /**
   * @internal
   */
  _destroyAllScene(): void {
    const allScenes = this._allScenes;
    while (allScenes[0]) {
      allScenes[0].destroy();
    }
  }
}
