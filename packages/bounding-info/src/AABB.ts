import { vec3 } from "@alipay/o3-math";
import { IntersectInfo } from "@alipay/o3-base";
import { Vector3, Vector4 } from "@alipay/o3-math/types/type";
import { pointDistanceToPlane } from "./util";

/**
 * 轴对齐的包围盒(Axis Aligned Bound Box)
 * */
export class AABB {
  public min: Vector3 = vec3.create();
  public max: Vector3 = vec3.create();

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
    vec3.copy(this.min, minWorld);
    vec3.copy(this.max, maxWorld);
  }

  /**
   * 使用中心点和 Size 的方式来计算 AABB 包围盒
   * @param {Vector3} center - 包围盒的中心点
   * @param {Vector3} size - 包围盒的3个轴向的大小
   */
  setFromCenterAndSize(center: Vector3, size: Vector3) {
    let halfSize = vec3.create();
    vec3.scale(halfSize, size, 0.5);

    vec3.subtract(this.min, center, halfSize);
    vec3.add(this.max, center, halfSize);
  }

  /**
   * 获取与视锥体的 具体相交状态
   * @param { Vector4[] } frustumPlanes - Oasis 视锥体的6个平面方程
   * @return {IntersectInfo} 返回相交状态
   * */
  intersectsFrustum(frustumPlanes: Vector4[]): IntersectInfo {
    const min = this.min;
    const max = this.max;
    const p1 = [],
      p2 = [];

    for (let i = 0; i < 6; i++) {
      const plane = frustumPlanes[i];
      p1[0] = plane[0] > 0 ? min[0] : max[0];
      p2[0] = plane[0] > 0 ? max[0] : min[0];
      p1[1] = plane[1] > 0 ? min[1] : max[1];
      p2[1] = plane[1] > 0 ? max[1] : min[1];
      p1[2] = plane[2] > 0 ? min[2] : max[2];
      p2[2] = plane[2] > 0 ? max[2] : min[2];

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
    const p = [];

    for (let i = 0; i < 6; i++) {
      const plane = frustumPlanes[i];
      p[0] = plane[0] > 0 ? max[0] : min[0];
      p[1] = plane[1] > 0 ? max[1] : min[1];
      p[2] = plane[2] > 0 ? max[2] : min[2];

      if (pointDistanceToPlane(plane, p) < 0) {
        return false;
      }
    }

    return true;
  }
}
