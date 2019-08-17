import { ACollider } from "./ACollider";
import { vec3 } from "@alipay/o3-math";
import { Node } from "@alipay/o3-core";
/**
 * 球型碰撞体组件
 * @extends ACollider
 */
export class ASphereCollider extends ACollider {
  center: number[] | Float32Array;

  radius: number;
  /**
   * @constructor
   * @param {Node} node
   */
  constructor(node: Node, props: any) {
    super(node, props);

    /**
     * 球心的坐标(在Local坐标系)
     * @member {vec3}
     */
    this.center = vec3.fromValues(0, 0, 0);

    /**
     * 球体的半径
     * @member {float}
     */
    this.radius = 1;
  }

  /**
   * 设置球体的属性数据
   * @param {vec3} center 球心坐标
   * @param {number} radius 球的半径
   */
  setSphere(center, radius: number) {
    this.center = center;
    this.radius = radius;
  }
}
