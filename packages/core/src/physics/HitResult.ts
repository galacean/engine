import { Entity } from "../Entity";
import { Vector3 } from "@galacean/engine-math";

/**
 * Structure used to get information back from a raycast or a sweep.
 */
export class HitResult {
  /** The entity that was hit. */
  entity: Entity = null;
  /** The distance from the ray's origin to the impact point. */
  distance: number = 0;
  /** The impact point in world space where the ray hit the collider. */
  point: Vector3 = new Vector3();
  /** The normal of the surface the ray hit. */
  normal: Vector3 = new Vector3();
}
