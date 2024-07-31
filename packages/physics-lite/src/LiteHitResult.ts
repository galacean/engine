import { Vector3 } from "@galacean/engine";

/**
 * Structure used to get information back from a raycast or a sweep.
 * @internal
 */
export class LiteHitResult {
  /** The collider that was hit. */
  shapeID: number = -1;
  /** The distance from the origin to the hit point. */
  distance: number = 0;
  /** The hit point of the collider that was hit in world space. */
  point: Vector3 = new Vector3();
  /** The hit normal of the collider that was hit in world space. */
  normal: Vector3 = new Vector3();
}
