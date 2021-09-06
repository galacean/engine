import { Entity, Vector3 } from "oasis-engine";
import { Collider } from "./Collider";

/**
 * Structure used to get information back from a raycast or a sweep.
 */
export class HitResult {
  /** The entity that was hit. */
  entity: Entity;
  /** The distance from the ray's origin to the impact point. */
  distance: number;
  /** The impact point in world space where the ray hit the collider. */
  point: Vector3;
  /** The normal of the surface the ray hit. */
  normal: Vector3;
}
