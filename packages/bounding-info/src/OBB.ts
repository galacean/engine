import { vec3 } from "@alipay/o3-math";
import { Primitive } from "@alipay/o3-primitive";
import { AMeshRenderer } from "@alipay/o3-mesh";
import { AGeometryRenderer } from "@alipay/o3-geometry";
import { Frustum } from "@alipay/o3-renderer-cull";
import { IntersectInfo } from "@alipay/o3-base";
import { getMinMaxFromPrimitive, pointDistanceToPlane } from "./util";
import { Mat4, Vec3 } from "./type";

/**
 * 方向包围盒(Oriented Bounding Box)
 * */
export class OBB {
  /** 本地坐标系 */
  public min: Vec3 = [0, 0, 0];
  public max: Vec3 = [0, 0, 0];
  public corners: Vec3[] = [];
  /** 世界坐标系 */
  public minWorld: Vec3 = [0, 0, 0];
  public maxWorld: Vec3 = [0, 0, 0];
  public cornersWorld: Vec3[] = [];

  /**
   * 根据 min/max 取得八个顶点的位置
   * @param {Vec3} min - 最小坐标
   * @param {Vec3} max - 最大坐标
   */
  getCornersFromMinMax(min: Vec3, max: Vec3) {
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
   * 通过 primitive 和模型矩阵来计算 OBB 包围盒
   * @param {Primitive}  primitive - Oasis primitive
   * @param {Mat4} modelMatrix - Local to World矩阵
   * @param {boolean} littleEndian - 是否以小端字节序读取，默认true
   * */
  setFromPrimitive(primitive: Primitive, modelMatrix: Mat4, littleEndian = true) {
    let { min, max } = getMinMaxFromPrimitive(primitive, null, littleEndian);

    // local
    this.min = min;
    this.max = max;
    this.corners = this.getCornersFromMinMax(min, max);

    // world
    this.updateByModelMatrix(modelMatrix);
  }

  /**
   * 通过 AMeshRenderer 来计算 OBB 包围盒
   * @param {AMeshRenderer} meshRenderer - Oasis AMeshRenderer
   * @param {boolean} littleEndian - 是否以小端字节序读取，默认true
   * */
  setFromMeshRenderer(meshRenderer: AMeshRenderer, littleEndian = true) {
    let {
      mesh: { primitives },
      node
    } = meshRenderer;
    let modelMatrix = node.getModelMatrix();

    primitives.forEach(p => {
      this.setFromPrimitive(p, modelMatrix, littleEndian);
    });
  }

  /**
   * 通过 AGeometryRenderer 来计算 OBB 包围盒
   * @param {AGeometryRenderer} geometryRenderer - Oasis AGeometryRenderer
   * @param {boolean} littleEndian - 是否以小端字节序读取，默认true
   * */
  setFromGeometryRenderer(geometryRenderer: AGeometryRenderer, littleEndian = true) {
    let {
      geometry: { primitive },
      node
    } = geometryRenderer;
    let modelMatrix = node.getModelMatrix();
    this.setFromPrimitive(primitive, modelMatrix, littleEndian);
  }

  /**
   * 通过模型矩阵，和缓存的本地坐标系 OBB，获取新的世界坐标系 OBB
   * @param {Mat4} modelMatrix - Local to World矩阵
   * */
  updateByModelMatrix(modelMatrix: Mat4) {
    let min = [Infinity, Infinity, Infinity];
    let max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < 8; ++i) {
      const corner: Vec3 = this.corners[i];
      const cornerWorld: Vec3 = vec3.create();
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
   * @param {Frustum} frustum - Oasis 视锥体
   * @return {IntersectInfo} 返回相交状态
   * */
  intersectsFrustum(frustum: Frustum): IntersectInfo {
    const planes = frustum.planes;
    const cornersWorld = this.cornersWorld;

    for (let i = 0; i < 6; i++) {
      const plane = planes[i];
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
   * 是否在视锥体内部
   * @param {Frustum} frustum - Oasis 视锥体
   * @return {boolean}
   * */
  isInFrustum(frustum: Frustum): boolean {
    const planes = frustum.planes;
    const cornersWorld = this.cornersWorld;

    for (let i = 0; i < 6; i++) {
      const plane = planes[i];
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
