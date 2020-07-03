import { vec3 } from "@alipay/o3-math";
import { IntersectInfo } from "@alipay/o3-base";
import { Vector3, Vector4, Matrix4 } from "@alipay/o3-math/types/type";
import { pointDistanceToPlane, getMaxScaleByModelMatrix } from "./util";

/**
 * 包围球
 * */
export class BoundingSphere {
  /** 本地坐标系 */
  public center: Vector3 = vec3.create();
  public radius: number = 0;
  /** 世界坐标系 */
  public centerWorld: Vector3 = vec3.create();
  public radiusWorld: number = 0;

  /**
   * 初始化包围球, 之后可以通过 modelMatrix 缓存计算
   * @param {Vector3} minLocal - 本地坐标系的最小坐标
   * @param {Vector3} maxLocal - 本地坐标系的最大坐标
   * @param {Matrix4} modelMatrix - Local to World矩阵
   * */
  constructor(minLocal: Vector3, maxLocal: Vector3, modelMatrix: Readonly<Matrix4>) {
    // 先计算local
    let distance = vec3.distance(minLocal, maxLocal);
    this.radius = distance * 0.5;

    vec3.add(this.center, minLocal, maxLocal);
    vec3.scale(this.center, this.center, 0.5);

    // 计算world
    this.updateByModelMatrix(modelMatrix);
  }

  /**
   * 通过模型矩阵，和缓存的本地坐标系包围球，获取新的世界坐标系包围球
   * @param {Matrix4} modelMatrix - Local to World矩阵
   * */
  updateByModelMatrix(modelMatrix: Readonly<Matrix4>) {
    vec3.transformMat4(this.centerWorld, this.center, modelMatrix);
    this.radiusWorld = this.radius * getMaxScaleByModelMatrix(modelMatrix);
  }

  /**
   * 获取与视锥体的 具体相交状态
   * @param { Vector4[] } frustumPlanes - Oasis 视锥体的6个平面方程
   * @return {IntersectInfo} 返回相交状态
   * */
  intersectsFrustum(frustumPlanes: Vector4[]): IntersectInfo {
    for (let i = 0; i < 6; i++) {
      const distance = pointDistanceToPlane(frustumPlanes[i], this.centerWorld);
      if (distance < -this.radiusWorld) {
        return IntersectInfo.EXCLUDE;
      }
      if (distance < this.radiusWorld) {
        return IntersectInfo.INTERSECT;
      }
    }

    return IntersectInfo.INCLUDE;
  }

  /**
   * 是否在视锥体内部（包含或者交叉）
   * @param { Vector4[] } frustumPlanes - Oasis 视锥体的6个平面方程
   * @return {boolean}
   * */
  isInFrustum(frustumPlanes: Vector4[]): boolean {
    for (let i = 0; i < 6; i++) {
      const distance = pointDistanceToPlane(frustumPlanes[i], this.centerWorld);
      if (distance < -this.radiusWorld) {
        return false;
      }
    }

    return true;
  }
}
