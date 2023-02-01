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
  private static _tempVec32: Vector3 = new Vector3();

  /**
   * Calculate the intersection point of three plane.
   * @param  p1 - Plane 1
   * @param  p2 - Plane 2
   * @param  p3 - Plane 3
   * @param out - intersection point
   */
  static intersectionPointThreePlanes(p1: Plane, p2: Plane, p3: Plane, out: Vector3): void {
    const p1Nor = p1.normal;
    const p2Nor = p2.normal;
    const p3Nor = p3.normal;

    Vector3.cross(p2Nor, p3Nor, CollisionUtil._tempVec30);
    Vector3.cross(p3Nor, p1Nor, CollisionUtil._tempVec31);
    Vector3.cross(p1Nor, p2Nor, CollisionUtil._tempVec32);

    const a = -Vector3.dot(p1Nor, CollisionUtil._tempVec30);
    const b = -Vector3.dot(p2Nor, CollisionUtil._tempVec31);
    const c = -Vector3.dot(p3Nor, CollisionUtil._tempVec32);

    Vector3.scale(CollisionUtil._tempVec30, p1.distance / a, CollisionUtil._tempVec30);
    Vector3.scale(CollisionUtil._tempVec31, p2.distance / b, CollisionUtil._tempVec31);
    Vector3.scale(CollisionUtil._tempVec32, p3.distance / c, CollisionUtil._tempVec32);

    Vector3.add(CollisionUtil._tempVec30, CollisionUtil._tempVec31, out);
    Vector3.add(out, CollisionUtil._tempVec32, out);
  }

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
   * Check whether the boxes intersect.
   * @param boxA - The first box to check
   * @param boxB - The second box to check
   * @returns True if the boxes intersect, false otherwise
   */
  static intersectsBoxAndBox(boxA: BoundingBox, boxB: BoundingBox): boolean {
    if (boxA.min.x > boxB.max.x || boxB.min.x > boxA.max.x) {
      return false;
    }

    if (boxA.min.y > boxB.max.y || boxB.min.y > boxA.max.y) {
      return false;
    }

    return !(boxA.min.z > boxB.max.z || boxB.min.z > boxA.max.z);
  }

  /**
   * Check whether the spheres intersect.
   * @param sphereA - The first sphere to check
   * @param sphereB - The second sphere to check
   * @returns True if the spheres intersect, false otherwise
   */
  static intersectsSphereAndSphere(sphereA: BoundingSphere, sphereB: BoundingSphere): boolean {
    const radiisum = sphereA.radius + sphereB.radius;
    return Vector3.distanceSquared(sphereA.center, sphereB.center) < radiisum * radiisum;
  }

  /**
   * Check whether the sphere and the box intersect.
   * @param sphere - The sphere to check
   * @param box - The box to check
   * @returns True if the sphere and the box intersect, false otherwise
   */
  static intersectsSphereAndBox(sphere: BoundingSphere, box: BoundingBox): boolean {
    const center = sphere.center;
    const max = box.max;
    const min = box.min;

    const closestPoint = CollisionUtil._tempVec30;
    closestPoint.set(
      Math.max(min.x, Math.min(center.x, max.x)),
      Math.max(min.y, Math.min(center.y, max.y)),
      Math.max(min.z, Math.min(center.z, max.z))
    );

    const distance = Vector3.distanceSquared(center, closestPoint);
    return distance <= sphere.radius * sphere.radius;
  }

  /**
   * Get whether or not a specified bounding box intersects with this frustum (Contains or Intersects).
   * @param frustum - The frustum
   * @param box - The box
   * @returns True if bounding box intersects with this frustum, false otherwise
   */
  static intersectsFrustumAndBox(frustum: BoundingFrustum, box: BoundingBox): boolean {
    const { min, max } = box;
    const p = CollisionUtil._tempVec30;

    for (let i = 0; i < 6; ++i) {
      const plane = frustum.getPlane(i);
      const normal = plane.normal;

      p.set(normal.x >= 0 ? max.x : min.x, normal.y >= 0 ? max.y : min.y, normal.z >= 0 ? max.z : min.z);
      if (Vector3.dot(normal, p) < -plane.distance) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get the containment type between a frustum and a point.
   * @param frustum - The frustum
   * @param point - The point
   * @returns The containment type
   */
  static frustumContainsPoint(frustum: BoundingFrustum, point: Vector3): ContainmentType {
    let distance = CollisionUtil.distancePlaneAndPoint(frustum.near, point);
    if (Math.abs(distance) < MathUtil.zeroTolerance) {
      return ContainmentType.Intersects;
    } else if (distance < 0) {
      return ContainmentType.Disjoint;
    }
    distance = CollisionUtil.distancePlaneAndPoint(frustum.far, point);
    if (Math.abs(distance) < MathUtil.zeroTolerance) {
      return ContainmentType.Intersects;
    } else if (distance < 0) {
      return ContainmentType.Disjoint;
    }
    distance = CollisionUtil.distancePlaneAndPoint(frustum.left, point);
    if (Math.abs(distance) < MathUtil.zeroTolerance) {
      return ContainmentType.Intersects;
    } else if (distance < 0) {
      return ContainmentType.Disjoint;
    }
    distance = CollisionUtil.distancePlaneAndPoint(frustum.right, point);
    if (Math.abs(distance) < MathUtil.zeroTolerance) {
      return ContainmentType.Intersects;
    } else if (distance < 0) {
      return ContainmentType.Disjoint;
    }
    distance = CollisionUtil.distancePlaneAndPoint(frustum.top, point);
    if (Math.abs(distance) < MathUtil.zeroTolerance) {
      return ContainmentType.Intersects;
    } else if (distance < 0) {
      return ContainmentType.Disjoint;
    }
    distance = CollisionUtil.distancePlaneAndPoint(frustum.bottom, point);
    if (Math.abs(distance) < MathUtil.zeroTolerance) {
      return ContainmentType.Intersects;
    } else if (distance < 0) {
      return ContainmentType.Disjoint;
    }
    return ContainmentType.Contains;
  }

  /**
   * Get the containment type between a frustum and a box (AABB).
   * @param frustum - The frustum
   * @param box - The box
   * @returns The containment type
   */
  static frustumContainsBox(frustum: BoundingFrustum, box: BoundingBox): ContainmentType {
    const { min, max } = box;
    const p = CollisionUtil._tempVec30;
    const n = CollisionUtil._tempVec31;
    let result = ContainmentType.Contains;

    for (let i = 0; i < 6; ++i) {
      const plane = frustum.getPlane(i);
      const normal = plane.normal;

      if (normal.x >= 0) {
        p.x = max.x;
        n.x = min.x;
      } else {
        p.x = min.x;
        n.x = max.x;
      }
      if (normal.y >= 0) {
        p.y = max.y;
        n.y = min.y;
      } else {
        p.y = min.y;
        n.y = max.y;
      }
      if (normal.z >= 0) {
        p.z = max.z;
        n.z = min.z;
      } else {
        p.z = min.z;
        n.z = max.z;
      }

      if (CollisionUtil.intersectsPlaneAndPoint(plane, p) === PlaneIntersectionType.Back) {
        return ContainmentType.Disjoint;
      }

      if (CollisionUtil.intersectsPlaneAndPoint(plane, n) === PlaneIntersectionType.Back) {
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
      if (intersectionType === PlaneIntersectionType.Back) {
        return ContainmentType.Disjoint;
      } else if (intersectionType === PlaneIntersectionType.Intersecting) {
        result = ContainmentType.Intersects;
        break;
      }
    }

    return result;
  }
}
