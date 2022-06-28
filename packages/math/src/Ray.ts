import { BoundingBox } from "./BoundingBox";
import { BoundingSphere } from "./BoundingSphere";
import { CollisionUtil } from "./CollisionUtil";
import { Plane } from "./Plane";
import { Vector3 } from "./Vector3";

/**
 * Represents a ray with an origin and a direction in 3D space.
 */
export class Ray {
  /** The origin of the ray. */
  readonly origin: Vector3 = new Vector3();
  /** The normalized direction of the ray. */
  readonly direction: Vector3 = new Vector3();

  /**
   * Constructor of Ray.
   * @param origin - The origin vector
   * @param direction - The direction vector
   */
  constructor(origin: Vector3 = null, direction: Vector3 = null) {
    origin && this.origin.copyFrom(origin);
    direction && this.direction.copyFrom(direction);
  }

  /**
   * Check if this ray intersects the specified plane.
   * @param plane - The specified plane
   * @returns The distance from this ray to the specified plane if intersecting, -1 otherwise
   */
  intersectPlane(plane: Plane): number {
    return CollisionUtil.intersectsRayAndPlane(this, plane);
  }

  /**
   * Check if this ray intersects the specified sphere.
   * @param sphere - The specified sphere
   * @returns The distance from this ray to the specified sphere if intersecting, -1 otherwise
   */
  intersectSphere(sphere: BoundingSphere): number {
    return CollisionUtil.intersectsRayAndSphere(this, sphere);
  }

  /**
   * Check if this ray intersects the specified box (AABB).
   * @param box - The specified box
   * @returns The distance from this ray to the specified box if intersecting, -1 otherwise
   */
  intersectBox(box: BoundingBox): number {
    return CollisionUtil.intersectsRayAndBox(this, box);
  }

  /**
   * The coordinates of the specified distance from the origin in the ray direction.
   * @param distance - The specified distance
   * @param out - The coordinates as an output parameter
   * @returns The out
   */
  getPoint(distance: number, out: Vector3): Vector3 {
    Vector3.scale(this.direction, distance, out);
    return out.add(this.origin);
  }
}
