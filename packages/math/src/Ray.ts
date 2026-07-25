import { BoundingBox } from "./BoundingBox";
import { BoundingSphere } from "./BoundingSphere";
import { CollisionUtil } from "./CollisionUtil";
import { IClone } from "./IClone";
import { ICopy } from "./ICopy";
import { Plane } from "./Plane";
import { Vector3 } from "./Vector3";

/**
 * Represents a ray with an origin and a direction in 3D space.
 */
export class Ray implements IClone<Ray>, ICopy<Ray, Ray> {
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

  /**
   * Creates a clone of this ray.
   * @returns A clone of this ray
   */
  clone(): Ray {
    const out = new Ray();
    out.copyFrom(this);
    return out;
  }

  /**
   * Copy this ray from the specified ray.
   * @param source - The specified ray
   * @returns This ray
   */
  copyFrom(source: Ray): Ray {
    this.origin.copyFrom(source.origin);
    this.direction.copyFrom(source.direction);
    return this;
  }
}
