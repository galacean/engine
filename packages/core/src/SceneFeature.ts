import { Camera } from "./Camera";
import { Scene } from "./Scene";

/**
 * Scene feature plug-in.
 * @deprecated
 */
export abstract class SceneFeature {
  /**
   * Callback before every scene update.
   * @param scene - Scene
   */
  public preUpdate(scene: Scene): void {}

  /**
   * Callback after every scene update.
   * @param scene - Scene
   */
  public postUpdate(scene: Scene): void {}

  /**
   * Callback before scene rendering.
   * @param scene - Scene
   * @param camera - Camera
   */
  public preRender(scene: Scene, camera: Camera): void {}

  /**
   * Callback after scene rendering.
   * @param scene - Scene
   * @param camera - Camera
   */
  public postRender(scene: Scene, camera: Camera): void {}

  /**
   * Callback after the scene is destroyed.
   * @param scene - Scene
   */
  public destroy(scene: Scene): void {}
}
