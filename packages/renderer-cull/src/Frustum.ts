"use strict";

import { Matrix, Vector4 } from "@alipay/o3-math";
import { Camera } from "@alipay/o3-core";

/**
 * 视锥体（平截头体）
 * @class
 */
export class Frustum {
  private _planes: Vector4[];
  /**
   * 构造函数
   */
  constructor() {
    this._planes = [];
    for (let i = 0; i < 6; i++) this._planes[i] = new Vector4();
  }

  /**
   * 获取视锥体的6个平面方程
   * */
  get planes() {
    return this._planes;
  }

  /**
   * 从摄像机矩阵中提取出平截头体的六个平面
   * @param {Camera} camera
   */
  update(camera: Camera) {
    const planes = this._planes;

    const vpm = new Matrix();
    Matrix.multiply(camera.projectionMatrix, camera.viewMatrix, vpm);
    const vpme = vpm.elements;

    // Extract the numbers for the RIGHT plane
    planes[0].x = vpme[3] - vpme[0];
    planes[0].y = vpme[7] - vpme[4];
    planes[0].z = vpme[11] - vpme[8];
    planes[0].w = vpme[15] - vpme[12];
    // Normalize the result
    let t = Math.sqrt(planes[0].x * planes[0].x + planes[0].y * planes[0].y + planes[0].z * planes[0].z);
    planes[0].x /= t;
    planes[0].y /= t;
    planes[0].z /= t;
    planes[0].w /= t;

    // Extract the numbers for the LEFT plane
    planes[1].x = vpme[3] + vpme[0];
    planes[1].y = vpme[7] + vpme[4];
    planes[1].z = vpme[11] + vpme[8];
    planes[1].w = vpme[15] + vpme[12];
    // Normalize the result
    t = Math.sqrt(planes[1].x * planes[1].x + planes[1].y * planes[1].y + planes[1].z * planes[1].z);
    planes[1].x /= t;
    planes[1].y /= t;
    planes[1].z /= t;
    planes[1].w /= t;

    // Extract the BOTTOM plane
    planes[2].x = vpme[3] + vpme[1];
    planes[2].y = vpme[7] + vpme[5];
    planes[2].z = vpme[11] + vpme[9];
    planes[2].w = vpme[15] + vpme[13];
    // Normalize the result
    t = Math.sqrt(planes[2].x * planes[2].x + planes[2].y * planes[2].y + planes[2].z * planes[2].z);
    planes[2].x /= t;
    planes[2].y /= t;
    planes[2].z /= t;
    planes[2].w /= t;

    // Extract the TOP plane
    planes[3].x = vpme[3] - vpme[1];
    planes[3].y = vpme[7] - vpme[5];
    planes[3].z = vpme[11] - vpme[9];
    planes[3].w = vpme[15] - vpme[13];
    // Normalize the result
    t = Math.sqrt(planes[3].x * planes[3].x + planes[3].y * planes[3].y + planes[3].z * planes[3].z);
    planes[3].x /= t;
    planes[3].y /= t;
    planes[3].z /= t;
    planes[3].w /= t;

    // Extract the FAR plane
    planes[4].x = vpme[3] - vpme[2];
    planes[4].y = vpme[7] - vpme[6];
    planes[4].z = vpme[11] - vpme[10];
    planes[4].w = vpme[15] - vpme[14];
    // Normalize the result
    t = Math.sqrt(planes[4].x * planes[4].x + planes[4].y * planes[4].y + planes[4].z * planes[4].z);
    planes[4].x /= t;
    planes[4].y /= t;
    planes[4].z /= t;
    planes[4].w /= t;

    // Extract the NEAR plane
    planes[5].x = vpme[3] + vpme[2];
    planes[5].y = vpme[7] + vpme[6];
    planes[5].z = vpme[11] + vpme[10];
    planes[5].w = vpme[15] + vpme[14];
    // Normalize the result
    t = Math.sqrt(planes[5].x * planes[5].x + planes[5].y * planes[5].y + planes[5].z * planes[5].z);
    planes[5].x /= t;
    planes[5].y /= t;
    planes[5].z /= t;
    planes[5].w /= t;
  }
}
