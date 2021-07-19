import { Collider } from "./Collider";
import { BoundingSphere, Ray, Vector3 } from "@oasis-engine/math";
import { Entity } from "../Entity";
import { HitResult } from "../PhysicsManager";

/**
 * A bounding sphere.
 */
export class ASphereCollider extends Collider {
  /** @internal */
  _tempShpere: BoundingSphere = new BoundingSphere();

  center: Vector3;

  radius: number;

  /**
   * Constructor of ASphereCollider.
   * @param  entity - Entity which the sphere belongs to
   */
  constructor(entity: Entity) {
    super(entity);

    /** The center point of the sphere. */
    this.center = new Vector3();

    /** The radius of the sphere. */
    this.radius = 1;
  }

  /**
   * Set the center and radius of the sphere.
   * @param center - The center point of the sphere
   * @param radius - The radius of the sphere
   */
  setSphere(center: Vector3, radius: number) {
    this.center = center;
    this.radius = radius;
  }

  _raycast(ray: Ray, hit: HitResult): boolean {
    const { transform } = this.entity;
    Vector3.transformCoordinate(this.center, transform.worldMatrix, this._tempShpere.center);
    const lossyScale = transform.lossyWorldScale;
    this._tempShpere.radius = this.radius * Math.max(lossyScale.x, lossyScale.y, lossyScale.z);
    const intersect = ray.intersectSphere(this._tempShpere);
    if (intersect !== -1) {
      this._updateHitResult(ray, intersect, hit, ray.origin, true);
      return true;
    } else {
      return false;
    }
  }
}
