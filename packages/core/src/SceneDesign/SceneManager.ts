import { Scene } from "./Scene";
import { AsyncRequest } from "../AssetDesign/AssetRequest";

/**
 * 场景管理员。
 */
export class SceneManager {
  /**
   * 场景数量。
   */
  get sceneCount(): number {
    return 0;
  }

  /**
   * 通过索引获取场景。
   * @param index - 索引
   * @returns 场景
   */
  getScene(index: number): Scene {
    return null;
  }

  /**
   * 添加场景。
   * @param scene - 场景
   */
  addScene(scene: Scene): void {}

  /**
   * 移除场景。
   * @param scene - 场景
   */
  removeScene(scene: Scene): void {}

  /**
   * 加载并添加场景。
   * @param url - 场景路径
   * @param isAdditive - 是否为叠加模式，true 会叠加到当前场景集合,false 会关闭当前所有场景并切换载入场景
   * @returns 场景请求
   */
  loadScene(url: string, isAdditive: boolean = false): AsyncRequest<Scene> {
    return null;
  }
}
