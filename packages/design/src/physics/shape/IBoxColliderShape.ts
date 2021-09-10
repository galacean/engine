import { IColliderShape } from "./IColliderShape";
import { Quaternion, Vector3 } from "@oasis-engine/math";

/**Interface of PhysXPhysics Shape for Box */
export interface IBoxColliderShape extends IColliderShape {
  /** extents of Box Shape */
  setExtents(size: Vector3): void;
}
