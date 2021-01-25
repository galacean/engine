import { Vector3 } from "@oasis-engine/math";

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
 * Check whether the boxes intersect.
 * @param boxA - The first box to check
 * @param boxB - The second box to check
 * @returns True if the boxes intersect, false otherwise
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
 * Check whether the spheres intersect.
 * @param sphereA - The first sphere to check
 * @param sphereB - The second sphere to check
 * @returns True if the spheres intersect, false otherwise
 */
export function intersectSphere2Sphere(sphereA, sphereB) {
  const distance = Vector3.distance(sphereA.center, sphereB.center);
  return distance < sphereA.radius + sphereA.radius;
}

/**
 * Check whether the sphere and the box intersect.
 * @param sphere - The sphere to check
 * @param box - The box to check
 * @returns True if the sphere and the box intersect, false otherwise
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
