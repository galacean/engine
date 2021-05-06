import { BoundingBox, BoundingSphere, Plane, Ray, Vector3 } from "@oasis-engine/math";
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
/** @internal */
const _ray = new Ray();

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
  const hit = new RaycastHit();

  for (let i = 0, len = colliders.length; i < len; i++) {
    const collider = colliders[i];
    if (!collider.entity.isActiveInHierarchy) {
      continue;
    }

    if (!(collider.entity.layer & tag)) {
      continue;
    }

    if (collider.raycast(ray, hit)) {
      if (hit.distance < nearestHit.distance) {
        nearestHit = hit;
      }
    }
  }

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
  const { transform } = this.entity;
  Vector3.transformCoordinate(this.center, transform.worldMatrix, _tempShpere.center);
  const lossyScale = transform.lossyWorldScale;
  _tempShpere.radius = this.radius * Math.max(lossyScale.x, lossyScale.y, lossyScale.z);
  const intersect = ray.intersectSphere(_tempShpere);
  if (intersect !== -1) {
    _updateHitResult(this, ray, intersect, hit, ray.origin, true);
    return true;
  } else {
    return false;
  }
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
function _updateHitResult(
  collider,
  ray: Ray,
  distance: number,
  outHit: RaycastHit,
  origin: Vector3,
  isWorldRay: boolean = false
) {
  const hitPos = _tempVec3;
  ray.getPoint(distance, hitPos);
  if (!isWorldRay) {
    Vector3.transformCoordinate(hitPos, collider.entity.transform.worldMatrix, hitPos);
  }

  outHit.distance = Vector3.distance(origin, hitPos);
  outHit.collider = collider;
  outHit.point = hitPos;
}

/**
 * transform ray to local space
 * @param {Ray} ray
 * @private
 */

function _getLocalRay(collider, ray): Ray {
  const worldToLocal = collider.entity.getInvModelMatrix();
  const outRay = _ray;

  Vector3.transformCoordinate(ray.origin, worldToLocal, outRay.origin);
  Vector3.transformNormal(ray.direction, worldToLocal, outRay.direction);
  outRay.direction.normalize();

  return outRay;
}
