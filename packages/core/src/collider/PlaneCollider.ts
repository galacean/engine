import { Collider } from "./Collider";
import { Vector3 } from "@alipay/o3-math";
import { Entity } from "../Entity";

/**
 * 平面（无限大）碰撞体组件，平面的位置和朝向与SceneObject一致
 * @extends Collider
 */
export class PlaneCollider extends Collider {
  planePoint: Vector3;

  normal: Vector3;
  /**
   * @constructor
   * @param {Entity} entity
   */
  constructor(entity: Entity) {
    super(entity);

    /**
     * 平面经过点的坐标(在Local坐标系)
     * @member {Vector3}
     */
    this.planePoint = new Vector3();

    /**
     * 平面法线的方向
     * @member {Vector3}
     */
    this.normal = new Vector3(0, 1, 0);
  }

  /**
   * 使用Local坐标，设置point
   * @param {Vector3} point 平面上的一个点：(p-p0)·n = 0
   * @param {Vector3} normal 平面的法线
   */
  setPlane(point: Vector3, normal: Vector3) {
    this.planePoint = point;
    this.normal = normal;
  }
}
