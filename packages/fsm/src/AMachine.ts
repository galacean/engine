import {NodeAbility} from '@alipay/o3-core';
import {Machine} from './Machine';

/**
 * 有限状态机类
 * @extends NodeAbility
 */
class AMachine extends NodeAbility {

  private _machine;

  /**
   * @constructor
   * @param {Node} node 所属的Node对象
   * @param {Object} props 资源配置
   * @param {string} props.name 名称
   */
  constructor(node, props: { name? } = {}) {

    super(node, props);

    this._machine = new Machine(props.name);

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
  update(deltaTime) {

    this.machine.update(deltaTime);

  }

}

export {AMachine};
