import { Vector3 } from "@oasis-engine/math";

/**
 * The result of raycast test.
 */
export class RaycastHit {
  public distance: number;
  public collider: any;
  public point: Vector3;
  /**
   * Constructor of RaycastHit.
   */
  constructor() {
    /** The distance from the collider point to the origin of the ray. */
    this.distance = Number.MAX_VALUE;

    /** The collider that has been intersecting. */
    this.collider = null;

    /** The point where the ray intersects.  */
    this.point = null;
  }
}
