import { vec3 } from "@alipay/o3-math";
import { Primitive } from "@alipay/o3-primitive";
import { AMeshRenderer } from "@alipay/o3-mesh";
import { AGeometryRenderer } from "@alipay/o3-geometry";
import { Frustum } from "@alipay/o3-renderer-cull";
import { IntersectInfo } from "@alipay/o3-base";
import { pointDistanceToPlane, getMinMaxFromPrimitive } from "./util";
import { Vec3, Mat4 } from "./type";

/**
 * 轴对齐的包围盒(Axis Aligned Bound Box)
 * */
export class AABB {
  public min: Vec3 = [0, 0, 0];
  public max: Vec3 = [0, 0, 0];

  /**
   * 使用中心点和 Size 的方式来计算 AABB 包围盒
   * @param {Vec3} center - 包围盒的中心点
   * @param {Vec3} size - 包围盒的3个轴向的大小
   */
  setFromCenterAndSize(center: Vec3, size: Vec3) {
    let halfSize = vec3.create();
    vec3.scale(halfSize, size, 0.5);

    vec3.subtract(this.min, center, halfSize);
    vec3.add(this.max, center, halfSize);
  }

  /**
   * 通过 primitive 和模型矩阵来计算 AABB 包围盒
   * @param {Primitive}  primitive - Oasis primitive
   * @param {Mat4} modelMatrix - Local to World矩阵
   * @param {boolean} littleEndian - 是否以小端字节序读取，默认true
   * */
  setFromPrimitive(primitive: Primitive, modelMatrix: Mat4, littleEndian = true) {
    let { min, max } = getMinMaxFromPrimitive(primitive, modelMatrix, littleEndian);

    this.min = min;
    this.max = max;
  }

  /**
   * 通过 AMeshRenderer 来计算 AABB 包围盒
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
   * 通过 AGeometryRenderer 来计算 AABB 包围盒
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
   * 获取与视锥体的 具体相交状态
   * @param {Frustum} frustum - Oasis 视锥体
   * @return {IntersectInfo} 返回相交状态
   * */
  intersectsFrustum(frustum: Frustum): IntersectInfo {
    const planes = frustum.planes;
    const min = this.min;
    const max = this.max;
    const p1 = [],
      p2 = [];

    for (let i = 0; i < 6; i++) {
      const plane = planes[i];
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
   * 是否在视锥体内部
   * @param {Frustum} frustum - Oasis 视锥体
   * @return {boolean}
   * */
  isInFrustum(frustum: Frustum): boolean {
    const planes = frustum.planes;
    const min = this.min;
    const max = this.max;
    const p = [];

    for (let i = 0; i < 6; i++) {
      const plane = planes[i];
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
