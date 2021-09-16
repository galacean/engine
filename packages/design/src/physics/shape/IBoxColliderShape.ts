import { IColliderShape } from "./IColliderShape";
import { Vector3 } from "@oasis-engine/math";

/**
 * Interface of physical Shape for Box
 */
export interface IBoxColliderShape extends IColliderShape {
  /** size of Box Shape */
  setSize(size: Vector3): void;
}
