import { Collider } from "./Collider";
import { Vector3 } from "@oasis-engine/math";
import { Entity } from "../Entity";
/**
 * A bounding sphere.
 */
export class ASphereCollider extends Collider {
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
}
