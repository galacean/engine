import { BoundingBox, BoundingSphere, Matrix, Plane, Ray, Vector3 } from "@oasis-engine/math";
import { ABoxCollider } from "../collider/ABoxCollider";
import { ASphereCollider } from "../collider/ASphereCollider";
import { ColliderFeature } from "../collider/ColliderFeature";
import { PlaneCollider } from "../collider/PlaneCollider";
import { Layer } from "../Layer";
import { Scene } from "../Scene";
import { RaycastHit } from "./RaycastHit";

// TODO
/** @internal */
const _tempVec3 = new Vector3();
/** @internal */
const _tempPlane = new Plane();
/** @internal */
const _tepmBox = new BoundingBox();
/** @internal */
const _tempShpere = new BoundingSphere();

/**
 * Perform ray detection on all Colliders in the scene and return to the one closest to the beginning of the ray.
 * @param _ray - The ray to perform
 * @param _outPos - The point where the ray intersects
 * @return The collider that has been intersecting
 */
(Scene.prototype as any).raycast = function (ray: Ray, _outPos: Vector3, tag: Layer = Layer.Everything) {
  const cf = this.findFeature(ColliderFeature);
  const colliders = cf.colliders;

  let nearestHit = new RaycastHit();

  for (let i = 0, len = colliders.length; i < len; i++) {
    const collider = colliders[i];
    if (!collider.entity.isActiveInHierarchy) {
      continue;
    }

    if (!(collider.entity.layer & tag)) {
      continue;
    }
    const hit = new RaycastHit();
    if (collider.raycast(ray, hit)) {
      if (hit.distance < nearestHit.distance) {
        nearestHit = hit;
      }
    }
  } // end of for

  if (_outPos && nearestHit.collider) {
    nearestHit.point.cloneTo(_outPos);
  }

  return nearestHit.collider;
};

/**
 * Perform ray cast.
 * @param ray - The ray
 * @param hit - The raycasthit
 */
(ABoxCollider.prototype as any).raycast = function (ray, hit) {
  const localRay = _getLocalRay(this, ray);
  // TODO
  this.boxMin.cloneTo(_tepmBox.min);
  this.boxMax.cloneTo(_tepmBox.max);
  const intersect = localRay.intersectBox(_tepmBox);
  if (intersect !== -1) {
    _updateHitResult(this, localRay, intersect, hit, ray.origin);
    return true;
  } else {
    return false;
  } // end of else
};

(ASphereCollider.prototype as any).raycast = function (ray, hit) {
  const localRay = _getLocalRay(this, ray);
  // TODO
  this.center.cloneTo(_tempShpere.center);
  _tempShpere.radius = this.radio;
  const intersect = localRay.intersectSphere(_tempShpere);
  if (intersect !== -1) {
    _updateHitResult(this, localRay, intersect, hit, ray.origin);
    return true;
  } else {
    return false;
  } // end of else
};

(PlaneCollider.prototype as any).raycast = function (ray, hit) {
  const localRay = _getLocalRay(this, ray);
  // TODO
  this.normal.cloneTo(_tempPlane.normal);
  _tempPlane.distance = -Vector3.dot(this.planePoint, _tempPlane.normal);
  const intersect = localRay.intersectPlane(_tempPlane);
  if (intersect !== -1) {
    _updateHitResult(this, localRay, intersect, hit, ray.origin);
    return true;
  } else {
    return false;
  } // end of else
};

/**
 * Calculate the raycasthit in world space.
 * @param ray - The ray
 * @param distance - The distance
 * @param outHit - The raycasthit
 */
function _updateHitResult(collider, ray: Ray, distance: number, outHit: RaycastHit, origin: Vector3) {
  const hitPos = _tempVec3;
  ray.getPoint(distance, hitPos);
  Vector3.transformCoordinate(hitPos, collider.entity.transform.worldMatrix, hitPos);

  outHit.distance = Vector3.distance(origin, hitPos);
  outHit.collider = collider;
  outHit.point = hitPos;
}

/**
 * transform ray to local space
 * @param {Ray} ray
 * @private
 */

function _getLocalRay(collider, ray) {
  const worldToLocal = collider.entity.getInvModelMatrix();

  // o = worldToLocal * vec4(ray.origin, 1)
  const o = new Vector3();
  Vector3.transformCoordinate(ray.origin, worldToLocal, o);

  // d = worldToLocal * vec4(ray.direction, 0)
  const d = new Vector3();
  _transformDirection(d, ray.direction, worldToLocal);

  return new Ray(o, d);
}

// a: vec3
// m: mat4
// return m * vec3(a, 0)
function _transformDirection(out: Vector3, a: Vector3, m: Matrix) {
  const x = a.x;
  const y = a.y;
  const z = a.z;
  const e = m.elements;
  out.x = x * e[0] + y * e[4] + z * e[8];
  out.y = x * e[1] + y * e[5] + z * e[9];
  out.z = x * e[2] + y * e[6] + z * e[10];
  return out;
}
