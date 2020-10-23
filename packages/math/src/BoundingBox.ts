import { IntersectInfo } from "./enums/IntersectInfo";
import { pointDistanceToPlane } from "./util";
import { Vector3 } from "./Vector3";
import { Vector4 } from "./Vector4";

/**
 * 轴对齐的包围盒(Axis Aligned Bound Box)
 * */
export class BoundingBox {
  public min: Vector3 = new Vector3();
  public max: Vector3 = new Vector3();

  /**
   * AABB 的 min/max 基于世界坐标系，且不能通过 modelMatrix 缓存计算
   * @param {Vector3} minWorld - 世界坐标系的最小坐标
   * @param {Vector3} maxWorld - 世界坐标系的最大坐标
   * */
  constructor(minWorld: Vector3, maxWorld: Vector3) {
    this.update(minWorld, maxWorld);
  }

  /**
   * 更新 AABB
   * @param {Vector3} minWorld - 世界坐标系的最小坐标
   * @param {Vector3} maxWorld - 世界坐标系的最大坐标
   * */
  update(minWorld: Vector3, maxWorld: Vector3) {
    minWorld.cloneTo(this.min);
    maxWorld.cloneTo(this.max);
  }

  /**
   * 使用中心点和 Size 的方式来计算 AABB 包围盒
   * @param {Vector3} center - 包围盒的中心点
   * @param {Vector3} size - 包围盒的3个轴向的大小
   */
  setFromCenterAndSize(center: Vector3, size: Vector3) {
    let halfSize = new Vector3();
    Vector3.scale(size, 0.5, halfSize);

    Vector3.subtract(center, halfSize, this.min);
    Vector3.add(center, halfSize, this.max);
  }

  /**
   * 获取与视锥体的 具体相交状态
   * @param { Vector4[] } frustumPlanes - Oasis 视锥体的6个平面方程
   * @return {IntersectInfo} 返回相交状态
   * */
  intersectsFrustum(frustumPlanes: Vector4[]): IntersectInfo {
    const { min, max } = this;
    const p1: Vector3 = new Vector3();
    const p2: Vector3 = new Vector3();

    for (let i = 0; i < 6; i++) {
      const plane: Vector4 = frustumPlanes[i];
      p1.x = plane.x > 0 ? min.x : max.x;
      p2.x = plane.x > 0 ? max.x : min.x;
      p1.y = plane.y > 0 ? min.y : max.y;
      p2.y = plane.y > 0 ? max.y : min.y;
      p1.z = plane.z > 0 ? min.z : max.z;
      p2.z = plane.z > 0 ? max.z : min.z;

      const d1 = pointDistanceToPlane(plane, p1);
      const d2 = pointDistanceToPlane(plane, p2);

      // 视锥体外
      if (d1 < 0 && d2 < 0) {
        return IntersectInfo.EXCLUDE;
      }
      // 相交视锥体
      if (d1 < 0 || d2 < 0) {
        return IntersectInfo.INTERSECT;
      }
    }

    return IntersectInfo.INCLUDE;
  }

  /**
   * 是否在视锥体内部（包含或者交叉）
   * @param { Vector4[] } frustumPlanes -  Oasis 视锥体的6个平面方程
   * @return {boolean}
   * */
  isInFrustum(frustumPlanes: Vector4[]): boolean {
    const min = this.min;
    const max = this.max;
    const p: Vector3 = new Vector3();

    for (let i = 0; i < 6; i++) {
      const plane: Vector4 = frustumPlanes[i];
      p.x = plane.x > 0 ? max.x : min.x;
      p.y = plane.y > 0 ? max.y : min.y;
      p.z = plane.z > 0 ? max.z : min.z;

      if (pointDistanceToPlane(plane, p) < 0) {
        return false;
      }
    }

    return true;
  }
}
