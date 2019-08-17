import { SceneFeature } from "@alipay/o3-core";
import { ACollider } from "./ACollider";

export class ColliderFeature extends SceneFeature {
  colliders: ACollider[];
  constructor() {
    super();

    this.colliders = [];
  }

  /**
   * 添加一个 Collider 组件
   * @param {ACollider} collider 碰撞体对象
   * @private
   */
  attachCollider(collider: ACollider) {
    this.colliders.push(collider);
  }

  /**
   * 移除一个Collider组件
   * @param {ACollider} collider 碰撞体对象
   * @private
   */
  detachCollider(collider: ACollider) {
    const index = this.colliders.indexOf(collider);
    if (index != -1) {
      this.colliders.splice(index, 1);
    }
  }
}
