"use strict";

import { mat4 } from "@alipay/o3-math";

/**
 * 视锥体（平截头体）
 * @class
 */
export class Frustum {
  private _planes;
  /**
   * 构造函数
   */
  constructor() {
    this._planes = [];
    for (let i = 0; i < 6; i++) this._planes[i] = [];
  }

  /**
   * 从摄像机矩阵中提取出平截头体的六个平面
   * @param {ACamera} camera
   */
  update(camera) {
    const planes = this._planes;

    const vpm = mat4.create();
    mat4.mul(vpm, camera.projectionMatrix, camera.viewMatrix);

    // Extract the numbers for the RIGHT plane
    planes[0][0] = vpm[3] - vpm[0];
    planes[0][1] = vpm[7] - vpm[4];
    planes[0][2] = vpm[11] - vpm[8];
    planes[0][3] = vpm[15] - vpm[12];
    // Normalize the result
    let t = Math.sqrt(planes[0][0] * planes[0][0] + planes[0][1] * planes[0][1] + planes[0][2] * planes[0][2]);
    planes[0][0] /= t;
    planes[0][1] /= t;
    planes[0][2] /= t;
    planes[0][3] /= t;

    // Extract the numbers for the LEFT plane
    planes[1][0] = vpm[3] + vpm[0];
    planes[1][1] = vpm[7] + vpm[4];
    planes[1][2] = vpm[11] + vpm[8];
    planes[1][3] = vpm[15] + vpm[12];
    // Normalize the result
    t = Math.sqrt(planes[1][0] * planes[1][0] + planes[1][1] * planes[1][1] + planes[1][2] * planes[1][2]);
    planes[1][0] /= t;
    planes[1][1] /= t;
    planes[1][2] /= t;
    planes[1][3] /= t;

    // Extract the BOTTOM plane
    planes[2][0] = vpm[3] + vpm[1];
    planes[2][1] = vpm[7] + vpm[5];
    planes[2][2] = vpm[11] + vpm[9];
    planes[2][3] = vpm[15] + vpm[13];
    // Normalize the result
    t = Math.sqrt(planes[2][0] * planes[2][0] + planes[2][1] * planes[2][1] + planes[2][2] * planes[2][2]);
    planes[2][0] /= t;
    planes[2][1] /= t;
    planes[2][2] /= t;
    planes[2][3] /= t;

    // Extract the TOP plane
    planes[3][0] = vpm[3] - vpm[1];
    planes[3][1] = vpm[7] - vpm[5];
    planes[3][2] = vpm[11] - vpm[9];
    planes[3][3] = vpm[15] - vpm[13];
    // Normalize the result
    t = Math.sqrt(planes[3][0] * planes[3][0] + planes[3][1] * planes[3][1] + planes[3][2] * planes[3][2]);
    planes[3][0] /= t;
    planes[3][1] /= t;
    planes[3][2] /= t;
    planes[3][3] /= t;

    // Extract the FAR plane
    planes[4][0] = vpm[3] - vpm[2];
    planes[4][1] = vpm[7] - vpm[6];
    planes[4][2] = vpm[11] - vpm[10];
    planes[4][3] = vpm[15] - vpm[14];
    // Normalize the result
    t = Math.sqrt(planes[4][0] * planes[4][0] + planes[4][1] * planes[4][1] + planes[4][2] * planes[4][2]);
    planes[4][0] /= t;
    planes[4][1] /= t;
    planes[4][2] /= t;
    planes[4][3] /= t;

    // Extract the NEAR plane
    planes[5][0] = vpm[3] + vpm[2];
    planes[5][1] = vpm[7] + vpm[6];
    planes[5][2] = vpm[11] + vpm[10];
    planes[5][3] = vpm[15] + vpm[14];
    // Normalize the result
    t = Math.sqrt(planes[5][0] * planes[5][0] + planes[5][1] * planes[5][1] + planes[5][2] * planes[5][2]);
    planes[5][0] /= t;
    planes[5][1] /= t;
    planes[5][2] /= t;
    planes[5][3] /= t;
  }

  /**
   * 与AABBox(轴对齐的包围盒)的相交测试
   * @param {vec3} boxMax 包围盒的最大坐标
   * @param {vec3} boxMin 包围盒的最小坐标
   * @return {boolean} 返回 true 代表相交（部分或全部在视锥体内）
   */
  intersectsBox(boxMax, boxMin) {
    const planes = this._planes;
    const p1 = [],
      p2 = [];

    for (let i = 0; i < 6; i++) {
      const plane = planes[i];
      p1[0] = plane[0] > 0 ? boxMin[0] : boxMax[0];
      p2[0] = plane[0] > 0 ? boxMax[0] : boxMin[0];
      p1[1] = plane[1] > 0 ? boxMin[1] : boxMax[1];
      p2[1] = plane[1] > 0 ? boxMax[1] : boxMin[1];
      p1[2] = plane[2] > 0 ? boxMin[2] : boxMax[2];
      p2[2] = plane[2] > 0 ? boxMax[2] : boxMin[2];

      const d1 = pointDistanceToPlane(plane, p1);
      const d2 = pointDistanceToPlane(plane, p2);

      // 是否在Plane的外侧
      if (d1 < 0 && d2 < 0) {
        return false;
      }
    }

    return true;
  }

  /**
   * 与球体的相交测试
   * @param {vec3} center
   * @param {number} radius
   */
  intersectsSphere(center, radius) {
    const planes = this._planes;

    for (let i = 0; i < 6; i++) {
      const distance = pointDistanceToPlane(planes[i], center);
      if (distance > radius) {
        return false;
      }
    } // end of for

    return true;
  }
}

/**
 * 一个点到一个平面的距离
 * @param {vec4} plane
 * @param {vec3} pt
 * @private
 */
function pointDistanceToPlane(plane, pt) {
  return plane[0] * pt[0] + plane[1] * pt[1] + plane[2] * pt[2] + plane[3];
}
