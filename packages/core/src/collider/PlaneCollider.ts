import { Collider } from "./Collider";
import { Plane, Ray, Vector3 } from "@oasis-engine/math";
import { Entity } from "../Entity";
import { HitResult } from "../PhysicsManager";

/**
 * Represents a plane in three dimensional space.
 */
export class PlaneCollider extends Collider {
  /** @internal */
  _tempPlane: Plane = new Plane();

  planePoint: Vector3;

  normal: Vector3;

  /**
   * Constructor of PlaneCollider.
   * @param entity - Entity which the plane belongs to
   */
  constructor(entity: Entity) {
    super(entity);

    /** The point through the plane. */
    this.planePoint = new Vector3();

    /** The normal direction of the plane. */
    this.normal = new Vector3(0, 1, 0);
  }

  /**
   * Set a plane from point and normal.
   * @param  point - The point through the plane
   * @param  normal - The normal direction of the plane
   */
  setPlane(point: Vector3, normal: Vector3) {
    this.planePoint = point;
    this.normal = normal;
  }

  _raycast(ray: Ray, hit: HitResult): boolean {
    const localRay = this._getLocalRay(ray);
    // TODO
    this.normal.cloneTo(this._tempPlane.normal);
    this._tempPlane.distance = -Vector3.dot(this.planePoint, this._tempPlane.normal);
    const intersect = localRay.intersectPlane(this._tempPlane);
    if (intersect !== -1) {
      this._updateHitResult(localRay, intersect, hit, ray.origin);
      return true;
    } else {
      return false;
    } // end of else
  }
}
