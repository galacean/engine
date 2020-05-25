import { NodeAbility } from "../NodeAbility";

/**
 * 脚本类，可进行逻辑编写。
 */
export class Script extends NodeAbility {
  /**
   * 脚本第一次被激活时调用,而且只调用一次。
   */
  onAwake(): void {}

  /**
   * 当节点触发为活动状态时调用。
   */
  onEnable(): void {}

  /**
   * 首次调用Update之前调用。
   */
  onStart(): void {}

  /**
   * 更新，在执行逻辑处理之前调用，逐帧调用。
   */
  onUpdate(): void {}

  /**
   * 延迟更新，在执行逻辑处理后调用，逐帧调用。
   */
  onLateUpdate(): void {}

  /**
   * 相机渲染前调用。
   */
  onPreRender(): void {}

  /**
   * 相机完成渲染后调用。
   */
  onPostRender(): void {}

  /**
   * 当节点触发为非活动状态时调用。
   */
  onDisable(): void {}

  /**
   * 销毁时调用。
   */
  onDestroy(): void {}
}
