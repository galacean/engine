"use strict";

import { mat4 } from "@alipay/o3-math";
import { Vec4 } from "@alipay/o3-math/types/type";
import { ACamera } from "@alipay/o3-core";

/**
 * 视锥体（平截头体）
 * @class
 */
export class Frustum {
  private _planes: Vec4[];
  /**
   * 构造函数
   */
  constructor() {
    this._planes = [];
    for (let i = 0; i < 6; i++) this._planes[i] = [];
  }

  /**
   * 获取视锥体的6个平面方程
   * */
  get planes() {
    return this._planes;
  }

  /**
   * 从摄像机矩阵中提取出平截头体的六个平面
   * @param {ACamera} camera
   */
  update(camera: ACamera) {
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
}
