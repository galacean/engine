import { SceneFeature } from "../SceneFeature";
import { Collider } from "./Collider";

export class ColliderFeature extends SceneFeature {
  colliders: Collider[];
  constructor() {
    super();

    this.colliders = [];
  }

  /**
   * 添加一个 Collider 组件
   * @param {Collider} collider 碰撞体对象
   * @private
   */
  attachCollider(collider: Collider) {
    this.colliders.push(collider);
  }

  /**
   * 移除一个Collider组件
   * @param {Collider} collider 碰撞体对象
   * @private
   */
  detachCollider(collider: Collider) {
    const index = this.colliders.indexOf(collider);
    if (index != -1) {
      this.colliders.splice(index, 1);
    }
  }
}
