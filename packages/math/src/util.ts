import { Matrix } from "./Matrix";
import { Vector3 } from "./Vector3";
import { Vector4 } from "./Vector4";

/**
 * 一个点到一个平面的距离
 * @param {Vector4} plane - 平面方程
 * @param {Vector3} pt - 点的位置矢量
 * @private
 */
export function pointDistanceToPlane(plane: Vector4, pt: Vector3) {
  return plane.x * pt.x + plane.y * pt.y + plane.z * pt.z + plane.w;
}

/**
 * 从列主序矩阵获取最大轴向的 scale
 * @param {Matrix} modelMatrix - Local to World矩阵
 * */
export function getMaxScaleByModelMatrix(modelMatrix: Matrix): number {
  let m = modelMatrix.elements;
  let scaleXSq = m[0] * m[0] + m[1] * m[1] + m[2] * m[2];
  let scaleYSq = m[4] * m[4] + m[5] * m[5] + m[6] * m[6];
  let scaleZSq = m[8] * m[8] + m[9] * m[9] + m[10] * m[10];
  return Math.sqrt(Math.max(scaleXSq, scaleYSq, scaleZSq));
}
