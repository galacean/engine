import { Scene } from "./Scene";
import { AssetPromise } from "../AssetDesign/AssetPromise";

/**
 * 场景管理员。
 */
export class SceneManager {
  /**
   * 当前激活场景。
   */
  get scene(): Scene {
    return null;
  }

  set scene(scene: Scene) {}

  /**
   * 加载并激活场景场景。
   * @param url - 场景路径
   * @param isAdditive - 是否为叠加模式，true 会将节点叠加到当前场景并使用当前场景的光照信息,false 会关闭当前所有场景并切换为载入场景
   * @returns 场景请求
   */
  loadScene(url: string, isAdditive: boolean = false): AssetPromise<Scene> {
    return null;
  }

  /**
   * 合并场景，将源场景合并到目标场景。
   * @param sourceScene - 源场景
   * @param destScene - 目标场景
   */
  mergeScenes(sourceScene: Scene, destScene: Scene) {}
}
