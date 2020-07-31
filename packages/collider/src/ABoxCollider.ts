import { Collider } from "./Collider";
import { Vector3 } from "@alipay/o3-math";
import { Entity } from "@alipay/o3-core";

/**
 * 轴对齐的包围盒（AABBox）碰撞体组件
 * @extends Collider
 */
export class ABoxCollider extends Collider {
  private static _tempVec3: Vector3 = new Vector3();

  public boxMin: Vector3;
  public boxMax: Vector3;
  private _corners: Array<Vector3> = [];

  /**
   * 构造函数
   * @param {Entity} entity 对象所在节点
   */
  constructor(entity: Entity, props: any) {
    super(entity, props);
    this.boxMin = new Vector3(-0.5, -0.5, -0.5);
    this.boxMax = new Vector3(0.5, 0.5, 0.5);
  }

  /**
   * 使用范围坐标，设置包围盒
   * @param {Vector3} min 最小坐标
   * @param {Vector3} max 最大坐标
   */
  setBoxMinMax(min: Vector3, max: Vector3) {
    this.boxMin = min;
    this.boxMin = max;

    this._corners.length = 0;
  }

  /**
   * 使用中心点和Size的方式设置包围盒
   * @param {Vector3} center 包围盒的中心点
   * @param {Vector3} size 包围盒的3个轴向的大小
   */
  setBoxCenterSize(center: Vector3, size: Vector3) {
    const halfSize = ABoxCollider._tempVec3;
    Vector3.scale(size, 0.5, halfSize);
    Vector3.add(center, halfSize, this.boxMin);
    Vector3.subtract(center, halfSize, this.boxMin);

    this._corners.length = 0;
  }

  /**
   * 取得八个顶点的位置
   */
  getCorners() {
    if (this._corners.length === 0) {
      const minX = this.boxMin.x;
      const minY = this.boxMin.y;
      const minZ = this.boxMin.z;
      const w = this.boxMax.x - minX;
      const h = this.boxMax.y - minY;
      const d = this.boxMax.z - minZ;

      // follow the same order as the old TODO chengkong.zxx 是否需要缓存避免创建？
      this._corners = [
        new Vector3(minX + w, minY + h, minZ + d),
        new Vector3(minX, minY + h, minZ + d),
        new Vector3(minX, minY, minZ + d),
        new Vector3(minX + w, minY, minZ + d),
        new Vector3(minX + w, minY + h, minZ),
        new Vector3(minX, minY + h, minZ),
        new Vector3(minX, minY, minZ),
        new Vector3(minX + w, minY, minZ)
      ];
    }

    return this._corners;
  }
}
