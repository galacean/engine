import { Collider } from "./Collider";
import { vec3 } from "@alipay/o3-math";
import { Node } from "@alipay/o3-core";

/**
 * 轴对齐的包围盒（AABBox）碰撞体组件
 * @extends Collider
 */
export class ABoxCollider extends Collider {
  public boxMin: number[] | Float32Array;

  public boxMax: number[] | Float32Array;

  private _corners: Array<number[] | Float32Array>;
  /**
   * 构造函数
   * @param {Node} node 对象所在节点
   */
  constructor(node: Node, props: any) {
    super(node, props);
    this.boxMin = vec3.fromValues(-0.5, -0.5, -0.5);
    this.boxMax = vec3.fromValues(0.5, 0.5, 0.5);
  }

  /**
   * 使用范围坐标，设置包围盒
   * @param {vec3} min 最小坐标
   * @param {vec3} max 最大坐标
   */
  setBoxMinMax(min: number[] | Float32Array, max: number[] | Float32Array) {
    this.boxMin = min;
    this.boxMax = max;

    this._corners = null;
  }

  /**
   * 使用中心点和Size的方式设置包围盒
   * @param {vec3} center 包围盒的中心点
   * @param {vec3} size 包围盒的3个轴向的大小
   */
  setBoxCenterSize(center: number[] | Float32Array, size: number[] | Float32Array) {
    const halfSize = vec3.create();
    vec3.scale(halfSize, size, 0.5);
    vec3.add(this.boxMax, center, halfSize);

    vec3.scale(halfSize, size, -0.5);
    vec3.add(this.boxMin, center, halfSize);
    // clear corners as boxMin & boxMax changed
    this._corners = null;
  }

  /**
   * 取得八个顶点的位置
   */
  getCorners() {
    if (!this._corners) {
      const minX = this.boxMin[0];
      const minY = this.boxMin[1];
      const minZ = this.boxMin[2];
      const w = this.boxMax[0] - minX;
      const h = this.boxMax[1] - minY;
      const d = this.boxMax[2] - minZ;

      // follow the same order as the old
      this._corners = [
        vec3.fromValues(minX + w, minY + h, minZ + d),
        vec3.fromValues(minX, minY + h, minZ + d),
        vec3.fromValues(minX, minY, minZ + d),
        vec3.fromValues(minX + w, minY, minZ + d),
        vec3.fromValues(minX + w, minY + h, minZ),
        vec3.fromValues(minX, minY + h, minZ),
        vec3.fromValues(minX, minY, minZ),
        vec3.fromValues(minX + w, minY, minZ)
      ];
    }

    return this._corners;
  }
}
