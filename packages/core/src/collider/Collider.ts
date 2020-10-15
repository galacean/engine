import { MaskList } from "../base/Constant";
import { Component } from "../Component";
import { Entity } from "../Entity";
import { ColliderFeature } from "./ColliderFeature";

/**
 * 碰撞体组件的基类, 定义碰撞体的数据
 */
export class Collider extends Component {
  /**
   * collider flg
   */
  tag: MaskList = MaskList.EVERYTHING;

  /**
   * @param {Entity} entity
   */
  constructor(entity: Entity) {
    super(entity);
  }

  /** 事件回调：在对象Enable的时候，挂载到当前的Scene
   * @private
   */
  _onEnable(): void {
    this.scene.findFeature(ColliderFeature).attachCollider(this);
  }

  /** 事件回调：在对象Disable的时候，从当前的Scene移除
   * @private
   */
  _onDisable(): void {
    this.scene.findFeature(ColliderFeature).detachCollider(this);
  }
}
