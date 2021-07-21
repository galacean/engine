import { Collider } from "./collider/Collider";
import { Vector3 } from "@oasis-engine/math";

/**
 * Structure used to get information back from a raycast or a sweep.
 */
export class HitResult {
  /** The collider that was hit. */
  collider: Collider = null;
  /** The distance from the origin to the hit point. */
  distance: number = 0;
  /** The hit point of the collider that was hit in world space. */
  point: Vector3 = new Vector3();
  /** The hit normal of the collider that was hit in world space. */
  normal: Vector3 = new Vector3();
}
