import { Vector3 } from "@oasis-engine/math";
import { ICollider } from "./ICollider";

export interface IDynamicCollider extends ICollider {
  /**
   * Moves the kinematic Rigidbody towards position.
   * @param value Provides the new position for the Rigidbody object.
   */
  MovePosition(value: Vector3);
}
