import { vec3 } from '@alipay/r3-math';

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
export function intersectBox2Box( boxA, boxB ) {

  return ( boxA.min[0] <= boxB.max[0] && boxA.max[0] >= boxB.min[0] ) &&
    ( boxA.min[1] <= boxB.max[1] && boxA.max[1] >= boxB.min[1] ) &&
    ( boxA.min[2] <= boxB.max[2] && boxA.max[2] >= boxB.min[2] );

}

/**
 * 两个球体是否相交
 * @private
 */
export function intersectSphere2Sphere( sphereA, sphereB ) {

  const distance = vec3.distance( sphereA.center, sphereB.center );
  return distance < ( sphereA.radius + sphereA.radius );

}

/**
 * 球体和AABBox是否相交
 * @private
 */
export function intersectSphere2Box( sphere, box ) {

  const center = sphere.center;

  const closestPoint = [];
  closestPoint[0] = Math.max( box.min[0], Math.min( center[0], box.max[0] ) );
  closestPoint[1] = Math.max( box.min[1], Math.min( center[1], box.max[1] ) );
  closestPoint[2] = Math.max( box.min[2], Math.min( center[2], box.max[2] ) );

  const distance = vec3.distance( center, closestPoint );
  return distance < sphere.radius;

}
