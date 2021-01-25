import { BoundingBox } from "./BoundingBox";
import { BoundingFrustum } from "./BoundingFrustum";
import { BoundingSphere } from "./BoundingSphere";
import { ContainmentType } from "./enums/ContainmentType";
import { PlaneIntersectionType } from "./enums/PlaneIntersectionType";
import { MathUtil } from "./MathUtil";
import { Plane } from "./Plane";
import { Ray } from "./Ray";
import { Vector3 } from "./Vector3";

/**
 * Contains static methods to help in determining intersections, containment, etc.
 */
export class CollisionUtil {
  private static _tempVec30: Vector3 = new Vector3();
  private static _tempVec31: Vector3 = new Vector3();

  /**
   * Calculate the distance from a point to a plane.
   * @param plane - The plane
   * @param point - The point
   * @returns The distance from a point to a plane
   */
  static distancePlaneAndPoint(plane: Plane, point: Vector3): number {
    return Vector3.dot(plane.normal, point) + plane.distance;
  }

  /**
   * Get the intersection type between a plane and a point.
   * @param plane - The plane
   * @param point - The point
   * @returns The intersection type
   */
  static intersectsPlaneAndPoint(plane: Plane, point: Vector3): PlaneIntersectionType {
    const distance = CollisionUtil.distancePlaneAndPoint(plane, point);
    if (distance > 0) {
      return PlaneIntersectionType.Front;
    }
    if (distance < 0) {
      return PlaneIntersectionType.Back;
    }
    return PlaneIntersectionType.Intersecting;
  }

  /**
   * Get the intersection type between a plane and a box (AABB).
   * @param plane - The plane
   * @param box - The box
   * @returns The intersection type
   */
  static intersectsPlaneAndBox(plane: Plane, box: BoundingBox): PlaneIntersectionType {
    const { min, max } = box;
    const { normal } = plane;
    const front = CollisionUtil._tempVec30;
    const back = CollisionUtil._tempVec31;

    if (normal.x >= 0) {
      front.x = max.x;
      back.x = min.x;
    } else {
      front.x = min.x;
      back.x = max.x;
    }
    if (normal.y >= 0) {
      front.y = max.y;
      back.y = min.y;
    } else {
      front.y = min.y;
      back.y = max.y;
    }
    if (normal.z >= 0) {
      front.z = max.z;
      back.z = min.z;
    } else {
      front.z = min.z;
      back.z = max.z;
    }

    if (CollisionUtil.distancePlaneAndPoint(plane, front) < 0) {
      return PlaneIntersectionType.Back;
    }

    if (CollisionUtil.distancePlaneAndPoint(plane, back) > 0) {
      return PlaneIntersectionType.Front;
    }

    return PlaneIntersectionType.Intersecting;
  }

  /**
   * Get the intersection type between a plane and a sphere.
   * @param plane - The plane
   * @param sphere - The sphere
   * @returns The intersection type
   */
  static intersectsPlaneAndSphere(plane: Plane, sphere: BoundingSphere): PlaneIntersectionType {
    const { center, radius } = sphere;
    const distance = CollisionUtil.distancePlaneAndPoint(plane, center);
    if (distance > radius) {
      return PlaneIntersectionType.Front;
    }
    if (distance < -radius) {
      return PlaneIntersectionType.Back;
    }
    return PlaneIntersectionType.Intersecting;
  }

  /**
   * Get the intersection type between a ray and a plane.
   * @param ray - The ray
   * @param plane - The plane
   * @returns The distance from ray to plane if intersecting, -1 otherwise
   */
  static intersectsRayAndPlane(ray: Ray, plane: Plane): number {
    const { normal } = plane;
    const { zeroTolerance } = MathUtil;

    const dir = Vector3.dot(normal, ray.direction);
    // Parallel
    if (Math.abs(dir) < zeroTolerance) {
      return -1;
    }

    const position = Vector3.dot(normal, ray.origin);
    let distance = (-plane.distance - position) / dir;

    if (distance < 0) {
      if (distance < -zeroTolerance) {
        return -1;
      }

      distance = 0;
    }

    return distance;
  }

  /**
   * Get the intersection type between a ray and a box (AABB).
   * @param ray - The ray
   * @param box - The box
   * @returns The distance from ray to box if intersecting, -1 otherwise
   */
  static intersectsRayAndBox(ray: Ray, box: BoundingBox): number {
    const { zeroTolerance } = MathUtil;
    const { origin, direction } = ray;
    const { min, max } = box;
    const dirX = direction.x;
    const dirY = direction.y;
    const dirZ = direction.z;
    const oriX = origin.x;
    const oriY = origin.y;
    const oriZ = origin.z;
    let distance = 0;
    let tmax = Number.MAX_VALUE;

    if (Math.abs(dirX) < zeroTolerance) {
      if (oriX < min.x || oriX > max.x) {
        return -1;
      }
    } else {
      const inverse = 1.0 / dirX;
      let t1 = (min.x - oriX) * inverse;
      let t2 = (max.x - oriX) * inverse;

      if (t1 > t2) {
        const temp = t1;
        t1 = t2;
        t2 = temp;
      }

      distance = Math.max(t1, distance);
      tmax = Math.min(t2, tmax);

      if (distance > tmax) {
        return -1;
      }
    }

    if (Math.abs(dirY) < zeroTolerance) {
      if (oriY < min.y || oriY > max.y) {
        return -1;
      }
    } else {
      const inverse = 1.0 / dirY;
      let t1 = (min.y - oriY) * inverse;
      let t2 = (max.y - oriY) * inverse;

      if (t1 > t2) {
        const temp = t1;
        t1 = t2;
        t2 = temp;
      }

      distance = Math.max(t1, distance);
      tmax = Math.min(t2, tmax);

      if (distance > tmax) {
        return -1;
      }
    }

    if (Math.abs(dirZ) < zeroTolerance) {
      if (oriZ < min.z || oriZ > max.z) {
        return -1;
      }
    } else {
      const inverse = 1.0 / dirZ;
      let t1 = (min.z - oriZ) * inverse;
      let t2 = (max.z - oriZ) * inverse;

      if (t1 > t2) {
        const temp = t1;
        t1 = t2;
        t2 = temp;
      }

      distance = Math.max(t1, distance);
      tmax = Math.min(t2, tmax);

      if (distance > tmax) {
        return -1;
      }
    }

    return distance;
  }

  /**
   * Get the intersection type between a ray and a sphere.
   * @param ray - The ray
   * @param sphere - The sphere
   * @returns The distance from ray to sphere if intersecting, -1 otherwise
   */
  static intersectsRayAndSphere(ray: Ray, sphere: BoundingSphere): number {
    const { origin, direction } = ray;
    const { center, radius } = sphere;

    const m = CollisionUtil._tempVec30;
    Vector3.subtract(origin, center, m);
    const b = Vector3.dot(m, direction);
    const c = Vector3.dot(m, m) - radius * radius;

    if (b > 0 && c > 0) {
      return -1;
    }

    let discriminant = b * b - c;
    if (discriminant < 0) {
      return -1;
    }

    let distance = -b - Math.sqrt(discriminant);
    if (distance < 0) {
      distance = 0;
    }

    return distance;
  }

  /**
   * Get whether or not a specified bounding box intersects with this frustum (Contains or Intersects).
   * @param frustum - The frustum
   * @param box - The box
   * @returns True if bounding box intersects with this frustum, false otherwise
   */
  static intersectsFrustumAndBox(frustum: BoundingFrustum, box: BoundingBox): boolean {
    const { min, max } = box;
    const back = CollisionUtil._tempVec30;

    for (let i = 0; i < 6; ++i) {
      const plane = frustum.getPlane(i);
      const normal = plane.normal;

      back.x = normal.x >= 0 ? min.x : max.x;
      back.y = normal.y >= 0 ? min.y : max.y;
      back.z = normal.z >= 0 ? min.z : max.z;
      if (Vector3.dot(plane.normal, back) > -plane.distance) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get the containment type between a frustum and a box (AABB).
   * @param frustum - The frustum
   * @param box - The box
   * @returns The containment type
   */
  static frustumContainsBox(frustum: BoundingFrustum, box: BoundingBox): ContainmentType {
    const { min, max } = box;
    const front = CollisionUtil._tempVec30;
    const back = CollisionUtil._tempVec31;
    let result = ContainmentType.Contains;

    for (let i = 0; i < 6; ++i) {
      const plane = frustum.getPlane(i);
      const normal = plane.normal;

      if (normal.x >= 0) {
        front.x = max.x;
        back.x = min.x;
      } else {
        front.x = min.x;
        back.x = max.x;
      }
      if (normal.y >= 0) {
        front.y = max.y;
        back.y = min.y;
      } else {
        front.y = min.y;
        back.y = max.y;
      }
      if (normal.z >= 0) {
        front.z = max.z;
        back.z = min.z;
      } else {
        front.z = min.z;
        back.z = max.z;
      }

      if (CollisionUtil.intersectsPlaneAndPoint(plane, back) === PlaneIntersectionType.Front) {
        return ContainmentType.Disjoint;
      }

      if (CollisionUtil.intersectsPlaneAndPoint(plane, front) === PlaneIntersectionType.Front) {
        result = ContainmentType.Intersects;
      }
    }

    return result;
  }

  /**
   * Get the containment type between a frustum and a sphere.
   * @param frustum - The frustum
   * @param sphere - The sphere
   * @returns The containment type
   */
  static frustumContainsSphere(frustum: BoundingFrustum, sphere: BoundingSphere): ContainmentType {
    let result = ContainmentType.Contains;

    for (let i = 0; i < 6; ++i) {
      const plane = frustum.getPlane(i);
      const intersectionType = CollisionUtil.intersectsPlaneAndSphere(plane, sphere);
      if (intersectionType === PlaneIntersectionType.Front) {
        return ContainmentType.Disjoint;
      } else if (intersectionType === PlaneIntersectionType.Intersecting) {
        result = ContainmentType.Intersects;
        break;
      }
    }

    return result;
  }
}
