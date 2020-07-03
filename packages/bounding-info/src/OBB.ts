import { vec3 } from "@alipay/o3-math";
import { IntersectInfo } from "@alipay/o3-base";
import { Matrix4, Vector3, Vector4 } from "@alipay/o3-math/types/type";
import { pointDistanceToPlane } from "./util";

/**
 * 方向包围盒(Oriented Bounding Box)
 * */
export class OBB {
  /** 本地坐标系 */
  public min: Vector3 = vec3.create();
  public max: Vector3 = vec3.create();
  public corners: Vector3[] = [];
  /** 世界坐标系 */
  public minWorld: Vector3 = vec3.create();
  public maxWorld: Vector3 = vec3.create();
  public cornersWorld: Vector3[] = [];

  /**
   * 初始化 OBB, 之后可以通过 modelMatrix 缓存计算
   * @param {Vector3} minLocal - 本地坐标系的最小坐标
   * @param {Vector3} maxLocal - 本地坐标系的最大坐标
   * @param {Matrix4} modelMatrix - Local to World矩阵
   * */
  constructor(minLocal: Vector3, maxLocal: Vector3, modelMatrix: Readonly<Matrix4>) {
    vec3.copy(this.min, minLocal);
    vec3.copy(this.max, maxLocal);
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
    const minX = min[0],
      minY = min[1],
      minZ = min[2],
      maxX = max[0],
      maxY = max[1],
      maxZ = max[2];
    const corners = [
      vec3.fromValues(minX, minY, minZ),
      vec3.fromValues(maxX, maxY, maxZ),
      vec3.fromValues(maxX, minY, minZ),
      vec3.fromValues(minX, maxY, minZ),
      vec3.fromValues(minX, minY, maxZ),
      vec3.fromValues(maxX, maxY, minZ),
      vec3.fromValues(minX, maxY, maxZ),
      vec3.fromValues(maxX, minY, maxZ)
    ];
    return corners;
  }

  /**
   * 通过模型矩阵，和缓存的本地坐标系 OBB，获取新的世界坐标系 OBB
   * @param {Matrix4} modelMatrix - Local to World矩阵
   * */
  updateByModelMatrix(modelMatrix: Readonly<Matrix4>) {
    let min = [Infinity, Infinity, Infinity];
    let max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < 8; ++i) {
      const corner: Vector3 = this.corners[i];
      const cornerWorld: Vector3 = vec3.create();
      vec3.transformMat4(cornerWorld, corner, modelMatrix);
      vec3.min(min, min, cornerWorld);
      vec3.max(max, max, cornerWorld);
      this.minWorld = min;
      this.maxWorld = max;
      this.cornersWorld[i] = cornerWorld;
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
