import { Vector3 } from "@oasis-engine/math";
import { ICollider } from "./ICollider";

/**
 * Interface of physical dynamic collider
 */
export interface IDynamicCollider extends ICollider {
  /** The linear velocity vector of the dynamic collider measured in world unit per second. */
  linearVelocity: Vector3;
  /** The angular velocity vector of the dynamic collider measured in radians per second. */
  angularVelocity: Vector3;
  /** The linear damping of the dynamic collider. */
  linearDamping: number;
  /** The angular damping of the dynamic collider. */
  angularDamping: number;
  /** The mass of the dynamic collider. */
  mass: number;
  /** Controls whether physics affects the dynamic collider. */
  isKinematic: boolean;

  /**
   * apply a force to the dynamic collider.
   * @param force the force make the collider move
   */
  addForce(force: Vector3): void;

  /**
   * apply a torque to the dynamic collider.
   * @param torque the force make the collider rotate
   */
  addTorque(torque: Vector3): void;
}
