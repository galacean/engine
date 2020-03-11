import { NodeAbility, Node } from "@alipay/o3-core";
import { ColliderFeature } from "./ColliderFeature";
import { MaskList } from "@alipay/o3-base";

/**
 * 碰撞体组件的基类, 定义碰撞体的数据
 * @extends NodeAbility
 */
export class ACollider extends NodeAbility {
  /**
   * collider flg
   */
  tag: MaskList;
  /**
   * @constructor
   * @param {Node} node
   */
  constructor(node: Node, props?: any) {
    super(node, props);

    this.tag = props.tag || MaskList.EVERYTHING;

    this.addEventListener("enabled", this.onEnable);
    this.addEventListener("disabled", this.onDisable);
  }

  /** 事件回调：在对象Enable的时候，挂载到当前的Scene
   * @private
   */
  onEnable(): void {
    this.scene.findFeature(ColliderFeature).attachCollider(this);
  }

  /** 事件回调：在对象Disable的时候，从当前的Scene移除
   * @private
   */
  onDisable(): void {
    this.scene.findFeature(ColliderFeature).detachCollider(this);
  }
}
