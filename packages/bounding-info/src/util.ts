import { Mat4 } from "./type";

/**
 * 一个点到一个平面的距离
 * @param {Vec4} plane - 平面方程
 * @param {Vec3} pt - 点的位置矢量
 * @private
 */
export function pointDistanceToPlane(plane, pt) {
  return plane[0] * pt[0] + plane[1] * pt[1] + plane[2] * pt[2] + plane[3];
}

/**
 * 从列主序矩阵获取最大轴向的 scale
 * @param {Mat4} modelMatrix - Local to World矩阵
 * */
export function getMaxScaleByModelMatrix(modelMatrix: Mat4): number {
  let m = modelMatrix;
  let scaleXSq = m[0] * m[0] + m[1] * m[1] + m[2] * m[2];
  let scaleYSq = m[4] * m[4] + m[5] * m[5] + m[6] * m[6];
  let scaleZSq = m[8] * m[8] + m[9] * m[9] + m[10] * m[10];
  return Math.sqrt(Math.max(scaleXSq, scaleYSq, scaleZSq));
}
