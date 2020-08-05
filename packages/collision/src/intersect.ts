import { Vector3 } from "@alipay/o3-math";

/**
 * AABBox = {
 *  min: [-1,-1,-1],
 *  max: [1,1,1]
 * };
 *
 * Sphere = {
 *  center: [0,0,0],
 *  radius: 1
 * };
 */

/**
 * 两个 AABBox 是否相交
 * @private
 */
export function intersectBox2Box(boxA, boxB) {
  return (
    boxA.min.x <= boxB.max.x &&
    boxA.max.x >= boxB.min.x &&
    boxA.min.y <= boxB.max.y &&
    boxA.max.y >= boxB.min.y &&
    boxA.min.z <= boxB.max.z &&
    boxA.max.z >= boxB.min.z
  );
}

/**
 * 两个球体是否相交
 * @private
 */
export function intersectSphere2Sphere(sphereA, sphereB) {
  const distance = Vector3.distance(sphereA.center, sphereB.center);
  return distance < sphereA.radius + sphereA.radius;
}

/**
 * 球体和AABBox是否相交
 * @private
 */
export function intersectSphere2Box(sphere, box) {
  const center: Vector3 = sphere.center;

  const closestPoint: Vector3 = new Vector3(
    Math.max(box.min.x, Math.min(center.x, box.max.x)),
    Math.max(box.min.y, Math.min(center.y, box.max.y)),
    Math.max(box.min.z, Math.min(center.z, box.max.z))
  );

  const distance = Vector3.distance(center, closestPoint);
  return distance < sphere.radius;
}
