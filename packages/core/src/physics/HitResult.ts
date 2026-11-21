import { Vector3 } from "@galacean/engine-math";
import { Entity } from "../Entity";
import { Collider } from "./Collider";

/**
 * The hit data written by a raycast or shape cast.
 */
export class HitResult {
  /** The entity that was hit. */
  entity: Entity | null = null;
  /** The distance the ray or cast shape traveled before impact, in world units. */
  distance: number = 0;
  /** The impact point in world space. */
  point: Vector3 = new Vector3();
  /** The surface normal at the impact point, in world space. */
  normal: Vector3 = new Vector3();
  /** The collider that was hit. */
  collider: Collider | null = null;
}
