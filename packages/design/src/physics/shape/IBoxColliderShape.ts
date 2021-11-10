import { IColliderShape } from "./IColliderShape";
import { Vector3 } from "@oasis-engine/math";

/**
 * Interface of physics box collider shape.
 */
export interface IBoxColliderShape extends IColliderShape {
  /**
   * Set size of Box Shape.
   * @param size - The size
   */
  setSize(size: Vector3): void;
}
