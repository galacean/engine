import { Collider } from "./Collider";
import { Vector3 } from "@oasis-engine/math";
import { Entity } from "../Entity";

/**
 * Represents a plane in three dimensional space.
 */
export class PlaneCollider extends Collider {
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
}
