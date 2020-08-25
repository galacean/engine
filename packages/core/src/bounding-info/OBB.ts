import { Vector3, Vector4, Matrix } from "@alipay/o3-math";

import { pointDistanceToPlane } from "./util";
import { IntersectInfo } from "../base/Constant";

/**
 * 方向包围盒(Oriented Bounding Box)
 * */
export class OBB {
  private static _tempVec3: Vector3 = new Vector3();

  /** 本地坐标系 */
  public min: Vector3 = new Vector3();
  public max: Vector3 = new Vector3();
  public corners: Vector3[] = [];
  /** 世界坐标系 */
  public minWorld: Vector3 = new Vector3();
  public maxWorld: Vector3 = new Vector3();
  public cornersWorld: Vector3[] = [];

  /**
   * 初始化 OBB, 之后可以通过 modelMatrix 缓存计算
   * @param {Vector3} minLocal - 本地坐标系的最小坐标
   * @param {Vector3} maxLocal - 本地坐标系的最大坐标
   * @param {Matrix} modelMatrix - Local to World矩阵
   * */
  constructor(minLocal: Vector3, maxLocal: Vector3, modelMatrix: Matrix) {
    minLocal.cloneTo(this.min);
    maxLocal.cloneTo(this.max);

    this.corners = this.getCornersFromMinMax(minLocal, maxLocal);

    // world
    this.updateByModelMatrix(modelMatrix);
  }

  /**
   * 根据 min/max ,取得八个顶点的位置
   * @param {Vector3} min - 最小坐标
   * @param {Vector3} max - 最大坐标
   */
  getCornersFromMinMax(min: Vector3, max: Vector3) {
    const minX = min.x,
      minY = min.y,
      minZ = min.z,
      maxX = max.x,
      maxY = max.y,
      maxZ = max.z;
    const corners = [
      new Vector3(minX, minY, minZ),
      new Vector3(maxX, maxY, maxZ),
      new Vector3(maxX, minY, minZ),
      new Vector3(minX, maxY, minZ),
      new Vector3(minX, minY, maxZ),
      new Vector3(maxX, maxY, minZ),
      new Vector3(minX, maxY, maxZ),
      new Vector3(maxX, minY, maxZ)
    ];
    return corners;
  }

  /**
   * 通过模型矩阵，和缓存的本地坐标系 OBB，获取新的世界坐标系 OBB
   * @param {Matrix} modelMatrix - Local to World矩阵
   * */
  updateByModelMatrix(modelMatrix: Matrix) {
    const min = this.minWorld;
    const max = this.maxWorld;
    min.setValue(Infinity, Infinity, Infinity);
    max.setValue(-Infinity, -Infinity, -Infinity);

    for (let i = 0; i < 8; ++i) {
      const corner: Vector3 = this.corners[i];
      const cornerWorld: Vector3 = OBB._tempVec3;

      Vector3.transformCoordinate(corner, modelMatrix, cornerWorld);
      Vector3.min(min, cornerWorld, min);
      Vector3.max(max, cornerWorld, max);

      this.cornersWorld[i] = new Vector3();
      cornerWorld.cloneTo(this.cornersWorld[i]);
    }
  }

  /**
   * 获取与视锥体的 具体相交状态
   * @param { Vector4[] } frustumPlanes - Oasis 视锥体的6个平面方程
   * @return {IntersectInfo} 返回相交状态
   * */
  intersectsFrustum(frustumPlanes: Vector4[]): IntersectInfo {
    const cornersWorld = this.cornersWorld;

    for (let i = 0; i < 6; i++) {
      const plane = frustumPlanes[i];
      let isInPlane = false;
      for (let j = 0; j < 8; j++) {
        if (pointDistanceToPlane(plane, cornersWorld[j]) > 0) {
          isInPlane = true;
        } else if (isInPlane) {
          return IntersectInfo.INTERSECT;
        }
      }
      if (!isInPlane) {
        return IntersectInfo.EXCLUDE;
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
    const cornersWorld = this.cornersWorld;

    for (let i = 0; i < 6; i++) {
      const plane = frustumPlanes[i];
      let isInPlane = false;
      for (let j = 0; j < 8; j++) {
        if (pointDistanceToPlane(plane, cornersWorld[j]) > 0) {
          isInPlane = true;
          break;
        }
      }
      if (!isInPlane) {
        return false;
      }
    }

    return true;
  }
}
