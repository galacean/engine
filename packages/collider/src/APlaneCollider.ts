import { ACollider } from "./ACollider";
import { vec3 } from "@alipay/o3-math";
import { Node } from "@alipay/o3-core";

/**
 * 平面（无限大）碰撞体组件，平面的位置和朝向与SceneObject一致
 * @extends ACollider
 */
export class APlaneCollider extends ACollider {
  planePoint: Float32Array | number[];

  normal: Float32Array | number[];
  /**
   * @constructor
   * @param {Node} node
   */
  constructor(node: Node, props: any) {
    super(node, props);

    /**
     * 平面经过点的坐标(在Local坐标系)
     * @member {vec3}
     */
    this.planePoint = vec3.fromValues(0, 0, 0);

    /**
     * 平面法线的方向
     * @member {vec3}
     */
    this.normal = vec3.fromValues(0, 1, 0);
  }

  /**
   * 使用Local坐标，设置point
   * @param {vec3} point 平面上的一个点：(p-p0)·n = 0
   * @param {vec3} normal 平面的法线
   */
  setPlane(point: Float32Array | number[], normal: Float32Array | number[]) {
    this.planePoint = point;
    this.normal = normal;
  }
}
