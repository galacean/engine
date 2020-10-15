import { Script } from "@alipay/o3-core";
import { Machine } from "./StateMachine";

/**
 * 有限状态机类
 */
export class FSM extends Script {
  private _machine;

  /**
   * @constructor
   * @param {Entity} entity 所属的Node对象
   * @param {Object} props 资源配置
   * @param {string} props.name 名称
   */
  constructor(entity) {
    super(entity);
    this._machine = new Machine("machine");
  }

  /** 当前的 Machine 对象
   * @member {Machine}
   * @readonly
   */
  get machine() {
    return this._machine;
  }

  /**
   * 更新状态机中的状态
   * @param {number} deltaTime 两帧之间的时间
   * @private
   */
  onUpdate(deltaTime) {
    this.machine.onUpdate(deltaTime);
  }
}
