import { Vector3 } from "@alipay/o3-math";
import { Entity } from "../Entity";
import { Collider } from "./Collider";

const _tempVec30 = new Vector3();
const _tempVec31 = new Vector3();
const _tempVec32 = new Vector3();
const _tempVec33 = new Vector3();
const _tempVec34 = new Vector3();
const _tempVec35 = new Vector3();
const _tempVec36 = new Vector3();
const _tempVec37 = new Vector3();

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
  constructor(entity: Entity) {
    super(entity);
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
    Vector3.add(center, halfSize, this.boxMax);
    Vector3.subtract(center, halfSize, this.boxMin);

    this._corners.length = 0;
  }

  /**
   * 取得八个顶点的位置
   */
  getCorners(): Vector3[] {
    if (this._corners.length === 0) {
      const minX = this.boxMin.x;
      const minY = this.boxMin.y;
      const minZ = this.boxMin.z;
      const w = this.boxMax.x - minX;
      const h = this.boxMax.y - minY;
      const d = this.boxMax.z - minZ;

      // follow the same order as the old
      _tempVec30.setValue(minX + w, minY + h, minZ + d);
      _tempVec31.setValue(minX, minY + h, minZ + d);
      _tempVec32.setValue(minX, minY, minZ + d);
      _tempVec33.setValue(minX + w, minY, minZ + d);
      _tempVec34.setValue(minX + w, minY + h, minZ);
      _tempVec35.setValue(minX, minY + h, minZ);
      _tempVec36.setValue(minX, minY, minZ);
      _tempVec37.setValue(minX + w, minY, minZ);

      this._corners = [_tempVec30, _tempVec31, _tempVec32, _tempVec33, _tempVec34, _tempVec35, _tempVec36, _tempVec37];
    }

    return this._corners;
  }
}
