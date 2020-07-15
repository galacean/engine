import { Scene as Basic } from "../SceneDesign/Scene";
import { Engine } from "./Engine";
import { Camera } from "../Camera";

interface SceneOption {
  autoGC?: boolean;
}

export declare class Scene extends Basic {
  constructor(engine: Engine, option: SceneOption);

  /** 场景中的每个或某个摄像机执行一次渲染  */
  public render(camera?: Camera): void;

  /**
   * 向当前场景注册一个摄像机对象
   * @param {CameraComponent} camera 摄像机对象
   */
  public attachRenderCamera(camera: Camera): void;

  /**
   * 从当前场景移除一个摄像机对象
   * @param {CameraComponent} camera 摄像机对象
   */
  public detachRenderCamera(camera: Camera): void;
}
