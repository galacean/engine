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
   * Registers a scene at the end of the scene list.
   * @param scene - A scene owned by this engine
   */
  addScene(scene: Scene): void;

  /**
   * Registers or moves a scene at the given position.
   * @param index - Zero-based position in the scene list
   * @param scene - A scene owned by this engine
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
      const active = targetScene.isActive;
      if (active) targetScene._assertActivationIdle(true);
      targetScene._sceneManager = this;
      scenes.add(index, targetScene);
      if (active) targetScene._processActive(true);
    }
  }

  /**
   * Unregisters a scene and deactivates its entity hierarchy without destroying it.
   * @param scene - The scene to unregister
   */
  removeScene(scene: Scene): void {
    const scenes = this._scenes;
    const index = scenes.indexOf(scene);
    if (index !== -1) {
      const active = scene.isActive;
      if (active) scene._assertActivationIdle(false);
      scenes.removeByIndex(index);
      scene._sceneManager = null;
      if (active) scene._processActive(false);
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
   * Moves root entities from the source scene into the destination scene.
   * @remarks The moved entities use the destination's scene settings. The source scene remains available.
   * @param sourceScene - The scene to move roots from
   * @param destScene - The scene to receive the roots
   */
  mergeScenes(sourceScene: Scene, destScene: Scene): void {
    if (sourceScene === destScene) return;
    const roots = sourceScene._rootEntities;
    while (
      roots.length > 0 &&
      !sourceScene.destroyed &&
      !sourceScene.pendingDestroy &&
      !destScene.destroyed &&
      !destScene.pendingDestroy
    ) {
      const root = roots[0];
      destScene.addRootEntity(root);
      if (roots[0] === root) break;
    }
  }

  /**
   * @internal
   */
  _destroyAllScene(): void {
    const allCreatedScenes = this._allCreatedScenes;
    let firstError: unknown;
    let hasError = false;
    while (allCreatedScenes.length > 0) {
      const scene = allCreatedScenes[0];
      try {
        scene.destroy();
      } catch (error) {
        if (!hasError) {
          firstError = error;
          hasError = true;
        }
        if (allCreatedScenes[0] === scene) {
          allCreatedScenes.shift();
        }
      }
    }
    if (hasError) {
      throw firstError;
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
