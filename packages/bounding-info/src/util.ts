/**
 * 一个点到一个平面的距离
 * @param {Vec4} plane - 平面方程
 * @param {Vec3} pt - 点的位置矢量
 * @private
 */
export function pointDistanceToPlane(plane, pt) {
  return plane[0] * pt[0] + plane[1] * pt[1] + plane[2] * pt[2] + plane[3];
}
