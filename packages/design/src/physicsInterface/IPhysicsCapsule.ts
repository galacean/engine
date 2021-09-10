import { IPhysicsShape } from "./IPhysicsShape";
import { Quaternion, Vector3 } from "@oasis-engine/math";

/**Interface of Physics Shape for Capsule */
export interface IPhysicsCapsule extends IPhysicsShape {
  /** radius of capsule */
  radius: number;

  /** height of capsule */
  height: number;

  /**
   * init Collider and alloc PhysX objects.
   * @param index index mark collider
   * @param radius radius of CapsuleCollider
   * @param height height of CapsuleCollider
   * @param position position of Collider
   * @param rotation rotation of Collider
   * @remarks must call after this component add to Entity.
   */
  initWithRadiusHeight(index: number, radius: number, height: number, position: Vector3, rotation: Quaternion): void;
}
