import { vec3 } from "@alipay/o3-math";
import { NodeAbility } from "@alipay/o3-core";
import { Event } from "@alipay/o3-base";
import { ColliderFeature, ACollider, ABoxCollider, ASphereCollider } from "@alipay/o3-collider";

import { intersectBox2Box, intersectSphere2Sphere, intersectSphere2Box } from "./intersect";

/**
 * 检测当前 Node 上的 Collider 与场景中其他 Collider 的碰撞
 * 发出事件：collision
 */
export class ACollisionDetection extends NodeAbility {
  private _colliderManager;
  private _myCollider;
  private _overlopCollider;
  private _sphere;
  private _box;

  /**
   * 构造函数
   * @param {Node} node 对象所在节点
   */
  constructor(node) {
    super(node);

    this._colliderManager = null;
    this._myCollider = null;
    this._overlopCollider = null;

    // this.addEventListener("start", this._onStart);
  }

  /**
   * 和当前 Node 上的 Collider 相交的 Collider 对象
   */
  get overlopCollider() {
    return this._overlopCollider;
  }

  /**
   * 每帧更新时，计算与其他 collider 的碰撞
   */
  update(deltaTime) {
    super.update(deltaTime);

    let overlopCollider = null;

    if (this._colliderManager && this._myCollider) {
      const colliders = this._colliderManager.colliders;

      if (this._myCollider instanceof ABoxCollider) {
        this._box = this._getWorldBox(this._myCollider);
        for (let i = 0, len = colliders.length; i < len; i++) {
          const collider = colliders[i];
          if (collider != this._myCollider && this._boxCollision(collider)) {
            overlopCollider = collider;
            this.trigger(new Event("collision", this, { collider }));
          }
        } // end of for
      } else if (this._myCollider instanceof ASphereCollider) {
        this._sphere = this._getWorldSphere(this._myCollider);
        for (let i = 0, len = colliders.length; i < len; i++) {
          const collider = colliders[i];
          if (collider != this._myCollider && this._sphereCollision(collider)) {
            overlopCollider = collider;
            this.trigger(new Event("collision", this, { collider }));
          }
        } // end of for
      }
    } // end of if

    //-- overlop events
    if (overlopCollider != null && this._overlopCollider != overlopCollider) {
      this.trigger(new Event("begin_overlop", this, { collider: overlopCollider }));
    }

    if (this._overlopCollider != null && this._overlopCollider != overlopCollider) {
      const e = this._overlopCollider;
      this.trigger(new Event("end_overlop", this, { collider: e }));
    }

    this._overlopCollider = overlopCollider;
  }

  /**
   * 获得世界空间中的 Box 坐标
   * @param {ABoxCollider} boxCollider
   */
  _getWorldBox(boxCollider) {
    const mat = boxCollider.node.getModelMatrix();
    const max = vec3.create();
    const min = vec3.create();
    vec3.transformMat4(max, boxCollider.boxMax, mat);
    vec3.transformMat4(min, boxCollider.boxMin, mat);

    //--
    const temp = vec3.create();
    const corners = boxCollider.getCorners();
    for (let i = 0; i < 8; i++) {
      vec3.transformMat4(temp, corners[i], mat);
      if (temp[0] > max[0]) max[0] = temp[0];
      if (temp[1] > max[1]) max[1] = temp[1];
      if (temp[2] > max[2]) max[2] = temp[2];
      if (temp[0] < min[0]) min[0] = temp[0];
      if (temp[1] < min[1]) min[1] = temp[1];
      if (temp[2] < min[2]) min[2] = temp[2];
    }

    return {
      min,
      max
    };
  }

  /**
   * 获得世界空间中的 Sphere 坐标
   * @param {ASphereCollider} sphereCollider
   */
  _getWorldSphere(sphereCollider) {
    const center = vec3.create();
    vec3.transformMat4(center, sphereCollider.center, sphereCollider.node.getModelMatrix());
    return {
      radius: sphereCollider.radius,
      center
    };
  }

  /**
   * 自身的 Collider 与另一个 Collider 做碰撞检测
   * @param {ABoxCollider|ASphereCollider} other
   */
  _boxCollision(other) {
    if (other instanceof ABoxCollider) {
      const box = this._getWorldBox(other);
      return intersectBox2Box(box, this._box);
    } else if (other instanceof ASphereCollider) {
      const sphere = this._getWorldSphere(other);
      return intersectSphere2Box(sphere, this._box);
    }
    return false;
  }

  /**
   * 自身的 Collider 与另一个 Collider 做碰撞检测
   * @param {ABoxCollider|ASphereCollider} other
   */
  _sphereCollision(other) {
    if (other instanceof ABoxCollider) {
      const box = this._getWorldBox(other);
      return intersectSphere2Box(this._sphere, box);
    } else if (other instanceof ASphereCollider) {
      const sphere = this._getWorldSphere(other);
      return intersectSphere2Sphere(sphere, this._sphere);
    }
    return false;
  }

  /**
   * 在 start 事件时，查找其他组件并记录下来
   */
  _onAwake() {
    this._colliderManager = this.scene.findFeature(ColliderFeature);
    this._myCollider = this.node.findAbilityByType(ACollider);
  }
}
