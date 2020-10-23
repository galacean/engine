import { IntersectInfo } from "./enums/IntersectInfo";
import { Matrix } from "./Matrix";
import { getMaxScaleByModelMatrix, pointDistanceToPlane } from "./util";
import { Vector3 } from "./Vector3";
import { Vector4 } from "./Vector4";

/**
 * 包围球
 * */
export class BoundingSphere {
  /** 本地坐标系 */
  public center: Vector3 = new Vector3();
  public radius: number = 0;
  /** 世界坐标系 */
  public centerWorld: Vector3 = new Vector3();
  public radiusWorld: number = 0;

  /**
   * 初始化包围球, 之后可以通过 modelMatrix 缓存计算
   * @param {Vector3} minLocal - 本地坐标系的最小坐标
   * @param {Vector3} maxLocal - 本地坐标系的最大坐标
   * @param {Matrix} modelMatrix - Local to World矩阵
   * */
  constructor(minLocal: Vector3, maxLocal: Vector3, modelMatrix: Matrix) {
    // 先计算local
    let distance = Vector3.distance(minLocal, maxLocal);
    this.radius = distance * 0.5;

    Vector3.add(minLocal, maxLocal, this.center);
    this.center.scale(0.5);

    // 计算world
    this.updateByModelMatrix(modelMatrix);
  }

  /**
   * 通过模型矩阵，和缓存的本地坐标系包围球，获取新的世界坐标系包围球
   * @param {Matrix} modelMatrix - Local to World矩阵
   * */
  updateByModelMatrix(modelMatrix: Matrix) {
    Vector3.transformCoordinate(this.center, modelMatrix, this.centerWorld);
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
