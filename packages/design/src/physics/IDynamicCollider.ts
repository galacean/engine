import { Vector3 } from "@oasis-engine/math";
import { ICollider } from "./ICollider";

export interface IDynamicCollider extends ICollider {
  linearVelocity: Vector3;

  angularVelocity: Vector3;

  linearDamping: number;

  angularDamping: number;

  mass: number;

  isKinematic: boolean;

  addForce(force: Vector3): void;

  addTorque(torque: Vector3): void;

  /**
   * Moves the kinematic Rigidbody towards position.
   * @param value Provides the new position for the Rigidbody object.
   */
  MovePosition(value: Vector3);
}
