import { Ray } from "./Ray";
import { vec3 } from "@alipay/o3-math";
import { Scene } from "@alipay/o3-core";
import { RaycastHit } from "./RaycastHit";
import { ColliderFeature, ABoxCollider, APlaneCollider, ASphereCollider } from "@alipay/o3-collider";
import { MaskList } from "@alipay/o3-base";

/**
 * 对场景中所有 Collider 进行射线检测，返回离射线起点最近的一个
 * @param {Ray} _ray 使用的射线，对于点击拾取，这个设想可以调用 CameraComponent.screenPointToRay() 方法获得
 * @param {vec3} _outPos 射线和碰撞体的交点
 * @return {ACollider} 射线检测结果
 */
(Scene.prototype as any).raycast = function(
  _ray,
  _outPos: number[] | Float32Array,
  tag: MaskList = MaskList.EVERYTHING
) {
  const ray = new Ray(_ray.origin, _ray.direction);
  const cf = this.findFeature(ColliderFeature);
  const colliders = cf.colliders;

  let nearestHit = new RaycastHit();

  for (let i = 0, len = colliders.length; i < len; i++) {
    const collider = colliders[i];
    if (!(collider.tag & tag)) {
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
    vec3.copy(_outPos, nearestHit.point);
  }

  return nearestHit.collider;
};

/**
 * 执行射线检测
 * @param {Ray} ray
 * @param {RaycastHit} hit
 */
(ABoxCollider.prototype as any).raycast = function(ray, hit) {
  const localRay = _getLocalRay(this, ray);
  const intersect = localRay.intersectAABB(this.boxMax, this.boxMin);
  if (intersect) {
    _updateHitResult(this, localRay, intersect, hit, ray.origin);
    return true;
  } else {
    return false;
  } // end of else
};

(ASphereCollider.prototype as any).raycast = function(ray, hit) {
  const localRay = _getLocalRay(this, ray);
  const intersect = localRay.intersectSphere(this.center, this.radius);
  if (intersect) {
    _updateHitResult(this, localRay, intersect, hit, ray.origin);
    return true;
  } else {
    return false;
  } // end of else
};

(APlaneCollider.prototype as any).raycast = function(ray, hit) {
  const localRay = _getLocalRay(this, ray);
  const intersect = localRay.intersectPlane(this.planePoint, this.normal);
  if (intersect) {
    _updateHitResult(this, localRay, intersect, hit, ray.origin);
    return true;
  } else {
    return false;
  } // end of else
};

/**
 * 计算世界坐标系中的碰撞点
 * @param {Ray} ray
 * @param {number} distance
 * @param {RaycastHit} outHit
 * @private
 */
function _updateHitResult(collider, ray, distance, outHit, origin) {
  const hitPos = ray.getPoint(distance);
  vec3.transformMat4(hitPos, hitPos, collider.node.getModelMatrix());

  outHit.distance = vec3.distance(origin, hitPos);
  outHit.collider = collider;
  outHit.point = hitPos;
}

/**
 * transform ray to local space
 * @param {Ray} ray
 * @private
 */
function _getLocalRay(collider, ray) {
  const worldToLocal = collider.node.getInvModelMatrix();

  // o = worldToLocal * vec4(ray.origin, 1)
  const o = vec3.create();
  vec3.transformMat4(o, ray.origin, worldToLocal);

  // d = worldToLocal * vec4(ray.direction, 0)
  const d = vec3.create();
  _transformDirection(d, ray.direction, worldToLocal);

  return new Ray(o, d);
}

// a: vec3
// m: mat4
// return m * vec3(a, 0)
function _transformDirection(out, a, m) {
  const x = a[0];
  const y = a[1];
  const z = a[2];
  out[0] = x * m[0] + y * m[4] + z * m[8];
  out[1] = x * m[1] + y * m[5] + z * m[9];
  out[2] = x * m[2] + y * m[6] + z * m[10];
  return out;
}
