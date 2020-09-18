import { Vector3 } from "@alipay/o3-math";
import { Logger, Entity } from "@alipay/o3-core";
import { Ray } from "./Ray";
import { getNormal, distanceTo, fromBufferAttribute } from "./util";

const _intersectPoint = new Vector3();
const _intersectPointWorld = new Vector3();

export function raycast(meshRenderer, ray) {
  const intersects = [];
  const invModelMatrix = meshRenderer.entity.getInvModelMatrix();
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
    const vertexBuffers = primitive.vertexBuffers;
    const positionBuffer = vertexBuffers.find((item) => item.semanticList[0] === "POSITION");
    const positionData = positionBuffer.getData("POSITION");
    const indexBuffer = primitive.indexBuffers[0];
    const indexData = indexBuffer.getData();
    for (let i = 0; i < indexData.length; i += 3) {
      const a = indexData[i];
      const b = indexData[i + 1];
      const c = indexData[i + 2];
      intersection = checkBufferGeometryIntersection(
        meshRenderer.entity, // 父节点
        ray,
        localRay,
        positionData,
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

function checkBufferGeometryIntersection(entity, ray, localRay, positionData, a, b, c, primitive) {
  const vA = fromBufferAttribute(positionData, a);
  const vB = fromBufferAttribute(positionData, b);
  const vC = fromBufferAttribute(positionData, c);
  const intersection = checkIntersection(entity, ray, localRay, vA, vB, vC, _intersectPoint, primitive);

  if (intersection) {
    const normal = getNormal(vA, vB, vC);
    intersection.normal = normal;
  }
  return intersection;
}

function checkIntersection(
  entity: Entity,
  ray: Ray,
  localRay: Ray,
  pA: Vector3,
  pB: Vector3,
  pC: Vector3,
  point: Vector3,
  primitive
) {
  const intersect = localRay.intersectTriangle(pA, pB, pC, false, point);
  if (intersect === null) {
    return null;
  }
  const temp = new Vector3();
  point.cloneTo(_intersectPointWorld);
  Vector3.transformCoordinate(_intersectPointWorld, entity.transform.worldMatrix, temp);
  const distance = distanceTo(ray.origin, temp);

  return {
    entity,
    distance,
    point: _intersectPointWorld.clone(),
    normal: null,
    materialName: primitive.material.name,
    primitive
  };
}
