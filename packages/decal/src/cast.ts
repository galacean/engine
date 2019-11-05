import { vec3 } from '@alipay/o3-math';
import { Ray } from './Ray';
import {
  getNormal,
  distanceTo,
  getXFromIndex,
  fromBufferAttribute,
} from './util';

const _intersectPoint = vec3.create();
const _intersectPointWorld = vec3.create();

export function raycast(meshRenderer, ray) {
  const intersects = [];
  const invModelMatrix = meshRenderer.invModelMatrix;
  const localRay = new Ray(null, null);
  localRay.copy(ray).applyMatrix4(invModelMatrix);
  let primitive;
  if (meshRenderer.mesh) {
    primitive = meshRenderer.mesh.primitives[0];
  }
  if (meshRenderer.geometry) {
    primitive = meshRenderer.geometry.primitive;
  }
  const positionAttributeIndex = primitive.vertexAttributes.POSITION.vertexBufferIndex;
  const positionAttribute = primitive.vertexBuffers[positionAttributeIndex];
  const indexAttribute = primitive.indexBuffer;
  const count = primitive.vertexCount;
  let intersection;
  for (let i = 0; i < indexAttribute.length; i += 3) {
    const a = getXFromIndex(indexAttribute, i);
    const b = getXFromIndex(indexAttribute, i + 1);
    const c = getXFromIndex(indexAttribute, i + 2);
    intersection = checkBufferGeometryIntersection(
      meshRenderer.node, // 父节点
      ray,
      localRay,
      positionAttribute,
      a,
      b,
      c,
    );
    if (intersection) {
      intersection.faceIndex = Math.floor( i / 3 );
      intersects.push(intersection);

    }
  }
  return intersects;
}

function checkBufferGeometryIntersection(
  node, 
  ray,
  localRay,
  positionAttribute,
  a, 
  b, 
  c,
) {
  const vA = fromBufferAttribute(positionAttribute, a);
	const vB = fromBufferAttribute(positionAttribute, b);
  const vC = fromBufferAttribute(positionAttribute, c);
  const intersection = checkIntersection(
    node, 
    ray, 
    localRay,
    vA, 
    vB, 
    vC, 
    _intersectPoint,
  );

  if (intersection) {
    const normal = getNormal(vA, vB, vC);
    intersection.normal = normal;
  }
  return intersection;

}

function checkIntersection(
  node,
  ray, 
  localRay,
  pA, 
  pB,
  pC, 
  point,
) {
  const intersect = localRay.intersectTriangle(
    pA, pB, pC, false, point,
  );
  if (intersect === null) {
    return null;
  }
  const temp = vec3.create();
  const pointCopy = vec3.copy(_intersectPointWorld, point);
  const intersectPointWorld = vec3.transformMat4(temp, pointCopy, node.getModelMatrix());
  const distance = distanceTo(ray.origin, intersectPointWorld);
  
  return {
    node,
    distance,
    point: intersectPointWorld.slice(0),
    normal: null,
  }
}