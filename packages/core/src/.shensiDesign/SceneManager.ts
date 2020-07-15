import { SceneManager as Basic } from "../SceneDesign/SceneManager";
import { Scene } from "./Scene";

/**
 * 场景管理员。
 */
export declare class SceneManager extends Basic {
  /**
   * 通过名字获取场景。
   * @param name - 场景名字
   */
  public getSceneByName(name: string): Scene;
}
