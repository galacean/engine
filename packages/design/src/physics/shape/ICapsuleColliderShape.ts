import { IColliderShape } from "./IColliderShape";
import { Quaternion, Vector3 } from "@oasis-engine/math";

/**Interface of PhysXPhysics Shape for Capsule */
export interface ICapsuleColliderShape extends IColliderShape {
  /** radius of capsule */
  setRadius(radius: number): void;

  /** height of capsule */
  setHeight(height: number): void;
}
