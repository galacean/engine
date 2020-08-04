import { Vector3 } from "@alipay/o3-math";
import { Logger } from "@alipay/o3-core";
import { Ray } from "./Ray";
import { getNormal, distanceTo, fromBufferAttribute } from "./util";

const _intersectPoint = new Vector3();
const _intersectPointWorld = new Vector3();

export function raycast(meshRenderer, ray) {
  const intersects = [];
  const invModelMatrix = meshRenderer.invModelMatrix;
  const localRay = new Ray(undefined, undefined);
  localRay.copy(ray).applyMatrix4(invModelMatrix);
  let primitives;
  if (meshRenderer.geometry) {
    Logger.error("模型必须是mesh");
  }
  if (meshRenderer.mesh) {
    primitives = meshRenderer.mesh.primitives;
  }
  let intersection;
  for (let i = 0; i < primitives.length; i += 1) {
    const primitive = primitives[i];
    const positionAttributeIndex = primitive.vertexAttributes.POSITION.vertexBufferIndex;
    const positionAttribute = primitive.vertexBuffers[positionAttributeIndex];
    const indexAttribute = primitive.indexBuffer;
    for (let i = 0; i < indexAttribute.length; i += 3) {
      const a = indexAttribute[i];
      const b = indexAttribute[i + 1];
      const c = indexAttribute[i + 2];
      intersection = checkBufferGeometryIntersection(
        meshRenderer.node, // 父节点
        ray,
        localRay,
        positionAttribute,
        a,
        b,
        c,
        primitive
      );
      if (intersection) {
        intersection.faceIndex = Math.floor(i / 3);
        intersects.push(intersection);
      }
    }
  }
  return intersects;
}

function checkBufferGeometryIntersection(node, ray, localRay, positionAttribute, a, b, c, primitive) {
  const vA = fromBufferAttribute(positionAttribute, a);
  const vB = fromBufferAttribute(positionAttribute, b);
  const vC = fromBufferAttribute(positionAttribute, c);
  const intersection = checkIntersection(node, ray, localRay, vA, vB, vC, _intersectPoint, primitive);

  if (intersection) {
    const normal = getNormal(vA, vB, vC);
    intersection.normal = normal;
  }
  return intersection;
}

function checkIntersection(node, ray, localRay, pA, pB, pC, point, primitive) {
  const intersect = localRay.intersectTriangle(pA, pB, pC, false, point);
  if (intersect === null) {
    return null;
  }
  const temp = new Vector3();
  point.cloneTo(_intersectPointWorld);
  Vector3.transformMat4x4(_intersectPointWorld, node.getModelMatrix(), temp);
  const distance = distanceTo(ray.origin, temp);

  return {
    node,
    distance,
    point: _intersectPointWorld.clone(),
    normal: null,
    materialName: primitive.material.name,
    primitive
  };
}
