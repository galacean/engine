import { Vector3 } from "@alipay/o3-math";
import { ACollider } from "../collider";

/**
 * Raycast检测的结果记录
 * @class
 */
export class RaycastHit {
  public distance: number;
  public collider: ACollider;
  public point: Vector3;
  /**
   * 构造函数
   */
  constructor() {
    /**
     * 碰撞点离射线起点的距离
     * @member {float}
     */
    this.distance = Number.MAX_VALUE;

    /**
     * 与射线相交的碰撞体
     * @member {ACollider}
     */
    this.collider = null;

    /**
     * 碰撞体与射线的相交点
     * @member {vec3}
     */
    this.point = null;
  }
}
