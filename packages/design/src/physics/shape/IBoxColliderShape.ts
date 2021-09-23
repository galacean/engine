import { IColliderShape } from "./IColliderShape";
import { Vector3 } from "@oasis-engine/math";

/**
 * Interface of physical Shape for Box.
 */
export interface IBoxColliderShape extends IColliderShape {
  /**
   * Set size of Box Shape.
   * @param size - The extents
   */
  setSize(size: Vector3): void;
}
