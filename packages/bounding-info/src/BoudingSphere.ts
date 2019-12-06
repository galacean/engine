import { vec3 } from "@alipay/o3-math";
import { Primitive } from "@alipay/o3-primitive";
import { AMeshRenderer } from "@alipay/o3-mesh";
import { AGeometryRenderer } from "@alipay/o3-geometry";
import { Frustum } from "@alipay/o3-renderer-cull";
import { IntersectInfo } from "@alipay/o3-base";
import { pointDistanceToPlane, getMaxScaleByModelMatrix, getMinMaxFromPrimitive } from "./util";
import { Vec3, Mat4 } from "./type";

/**
 * 包围球
 * */
export class BoundingSphere {
  /** 本地坐标系 */
  public center: Vec3 = [0, 0, 0];
  public radius: number = 0;
  /** 世界坐标系 */
  public centerWorld: Vec3 = [0, 0, 0];
  public radiusWorld: number = 0;

  /**
   * 通过 primitive 来计算包围球
   * @param {Primitive}  primitive - Oasis primitive
   * @param {Mat4} modelMatrix - Local to World矩阵
   * @param {boolean} littleEndian - 是否以小端字节序读取，默认true
   * */
  setFromPrimitive(primitive: Primitive, modelMatrix: Mat4, littleEndian = true) {
    let { min, max } = getMinMaxFromPrimitive(primitive, null, littleEndian);

    // 先计算local
    let distance = vec3.distance(min, max);
    this.radius = distance * 0.5;

    vec3.add(this.center, min, max);
    vec3.scale(this.center, this.center, 0.5);

    // 计算world
    this.updateByModelMatrix(modelMatrix);
  }

  /**
   * 通过 AMeshRenderer 来计算包围球
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
   * 通过 AGeometryRenderer 来计算包围球
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
   * 通过模型矩阵，和缓存的本地坐标系包围球，获取新的世界坐标系包围球
   * @param {Mat4} modelMatrix - Local to World矩阵
   * */
  updateByModelMatrix(modelMatrix: Mat4) {
    vec3.transformMat4(this.centerWorld, this.center, modelMatrix);
    this.radiusWorld = this.radius * getMaxScaleByModelMatrix(modelMatrix);
  }

  /**
   * 获取与视锥体的 具体相交状态
   * @param {Frustum} frustum - Oasis 视锥体
   * @return {IntersectInfo} 返回相交状态
   * */
  intersectsFrustum(frustum: Frustum): IntersectInfo {
    const planes = frustum.planes;

    for (let i = 0; i < 6; i++) {
      const distance = pointDistanceToPlane(planes[i], this.centerWorld);
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
   * 是否在视锥体内部
   * @param {Frustum} frustum - Oasis 视锥体
   * @return {boolean}
   * */
  isInFrustum(frustum: Frustum): boolean {
    const planes = frustum.planes;

    for (let i = 0; i < 6; i++) {
      const distance = pointDistanceToPlane(planes[i], this.centerWorld);
      if (distance < -this.radiusWorld) {
        return false;
      }
    }

    return true;
  }
}
