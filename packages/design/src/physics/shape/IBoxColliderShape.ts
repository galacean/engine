import { IColliderShape } from "./IColliderShape";
import { Vector3 } from "@galacean/engine-math";

/**
 * Interface of physics box collider shape.
 */
export interface IBoxColliderShape extends IColliderShape {
  /**
   * Set the half extents of the box with entity scale applied.
   */
  setHalfExtents(halfExtents: Vector3): void;
}
