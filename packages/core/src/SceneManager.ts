import { Engine } from "./Engine";
import { Scene } from "./Scene";
import { AssetPromise } from "./asset/AssetPromise";
import { AssetType } from "./asset/AssetType";
import { SafeLoopArray } from "./utils/SafeLoopArray";

/**
 * Scene manager.
 */
export class SceneManager {
  /** @internal */
  _allCreatedScenes: Scene[] = [];
  /** @internal */
  _scenes: SafeLoopArray<Scene> = new SafeLoopArray<Scene>();

  /**
   * Get the scene list.
   */
  get scenes(): ReadonlyArray<Scene> {
    return this._scenes.getArray();
  }

  /**
   * @internal
   */
  constructor(public readonly engine: Engine) {}

  /**
   * Add scene.
   * @param scene - The scene which want to be added
   * @param scene - The scene which want to be added
   */
  addScene(scene: Scene, index?: number): void {
    if (scene.engine !== this.engine) {
      throw "The scene is not belong to this engine.";
    }
    const scenes = this._scenes;
    const checkIndex = scenes.indexOf(scene);
    if (checkIndex > -1) {
      scenes.removeByIndex(checkIndex);
    }

    if (typeof index === "number") {
      scenes.add(index, scene);
    } else {
      scenes.push(scene);
    }

    scene._processActive(true);
  }

  /**
   * Remove scene.
   * @param scene - The scene which want to be removed
   */
  removeScene(scene: Scene): void {
    const scenes = this._scenes;
    const index = scenes.indexOf(scene);
    if (index !== -1) {
      scenes.removeByIndex(index);
      scene._processActive(false);
    }
  }

  /**
   * Load and activate scene.
   * @param url - the path of the scene
   * @param destroyOldScene - whether to destroy old scene
   * @returns scene promise
   */
  loadScene(url: string, destroyOldScene: boolean = true): AssetPromise<Scene> {
    const scenePromise = this.engine.resourceManager.load<Scene>({ url, type: AssetType.Scene });
    scenePromise.then((scene: Scene) => {
      if (destroyOldScene) {
        const scenes = this._scenes.getArray();
        for (let i = 0, n = scenes.length; i < n; i++) {
          scenes[i].destroy();
        }
      }
      this.addScene(scene);
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
    const allCreatedScenes = this._allCreatedScenes;
    while (allCreatedScenes.length > 0) {
      allCreatedScenes[0].destroy();
    }
  }

  /**
   * @deprecated
   * Please use `scenes` instead.
   *
   * Get the first scene.
   */
  get activeScene(): Scene {
    return this._scenes.getArray()[0];
  }

  set activeScene(scene: Scene) {
    const firstScene = this.scenes[0];
    if (firstScene) {
      this.removeScene(firstScene);
    }
    scene && this.addScene(scene, 0);
  }
}
