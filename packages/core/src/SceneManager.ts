import { Engine } from "./Engine";
import { Entity } from "./Entity";
import { Scene } from "./Scene";
import { AssetPromise } from "./asset/AssetPromise";
import { AssetType } from "./asset/AssetType";
import { ActiveChangeFlag } from "./enums/ActiveChangeFlag";
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
   */
  addScene(scene: Scene): void;

  /**
   * Add scene at specified index.
   * @param index - specified index
   * @param child - The scene which want to be added
   */
  addScene(index: number, scene: Scene): void;

  addScene(indexOrScene: number | Scene, scene?: Scene): void {
    const scenes = this._scenes;

    let index: number;
    if (typeof indexOrScene === "number") {
      if (indexOrScene < 0 || indexOrScene > scenes.length) {
        throw "The index is out of range.";
      }
      index = indexOrScene;
    } else {
      index = scenes.length;
      scene = indexOrScene;
    }

    const targetScene = scene!;
    if (targetScene.engine !== this.engine) {
      throw "The scene is not belong to this engine.";
    }

    if (targetScene._sceneManager) {
      const currentIndex = scenes.indexOf(targetScene);
      if (currentIndex !== index) {
        scenes.removeByIndex(currentIndex);
        scenes.add(index, targetScene);
      }
    } else {
      targetScene._sceneManager = this;
      scenes.add(index, targetScene);
      targetScene.isActive && targetScene._processActive(true);
    }
  }

  /**
   * Remove scene.
   * @param scene - The scene which want to be removed
   */
  removeScene(scene: Scene): void {
    const scenes = this._scenes;
    const index = scenes.indexOf(scene);
    if (index !== -1) {
      const removedScene = scenes.getArray()[index];
      scenes.removeByIndex(index);
      scene._sceneManager = null;
      removedScene.isActive && removedScene._processActive(false);
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
    if (sourceScene === destScene) {
      return;
    }

    const sourceRoots = sourceScene._rootEntities;
    const movedRoots: Entity[] = [];
    while (sourceRoots.length > 0) {
      const root = sourceRoots[0];
      Entity._removeFromChildren(sourceRoots, root);
      root._isRoot = false;

      let inActiveChangeFlag = ActiveChangeFlag.None;
      if (root._isActiveInHierarchy && !destScene._isActiveInEngine) {
        inActiveChangeFlag |= ActiveChangeFlag.Hierarchy;
      }
      if (root._isActiveInScene) {
        inActiveChangeFlag |= ActiveChangeFlag.Scene;
      }
      inActiveChangeFlag && root._processInActive(inActiveChangeFlag);

      if (!root.destroyed && !root.parent && !root._isRoot) {
        movedRoots.push(root);
      }
    }

    // Assign destination scene to every moved hierarchy before notifying components or activating,
    // so cross-root references (e.g. Joint.connectedBody) between sourceScene roots stay valid.
    for (let i = 0, n = movedRoots.length; i < n; i++) {
      const root = movedRoots[i];
      root._isRoot = true;
      Entity._addToChildren(destScene._rootEntities, root);
      Entity._assignOwnerScene(root, destScene);
    }

    for (let i = 0, n = movedRoots.length; i < n; i++) {
      Entity._notifySceneChanged(movedRoots[i], destScene);
    }

    for (let i = 0, n = movedRoots.length; i < n; i++) {
      const root = movedRoots[i];
      if (root.destroyed || !root._isRoot || root._scene !== destScene) {
        continue;
      }
      let activeChangeFlag = ActiveChangeFlag.None;
      if (root._isActive) {
        if (destScene._isActiveInEngine && !root._isActiveInHierarchy) {
          activeChangeFlag |= ActiveChangeFlag.Hierarchy;
        }
        activeChangeFlag |= ActiveChangeFlag.Scene;
      }
      activeChangeFlag && root._processActive(activeChangeFlag);
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
   * Get the first scene, or undefined if no scene is registered.
   * @remarks Assigning null or undefined removes the first scene.
   * @deprecated Please use `scenes` instead.
   */
  get activeScene(): Scene | undefined {
    return this._scenes.getArray()[0];
  }

  set activeScene(scene: Scene | null | undefined) {
    const firstScene = this.scenes[0];
    if (firstScene) {
      this.removeScene(firstScene);
    }
    scene && this.addScene(0, scene);
  }
}
