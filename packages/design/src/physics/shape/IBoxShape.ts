import { IPhysicsShape } from "./IPhysicsShape";
import { Vector3 } from "@galacean/engine-math";

/**
 * Interface of a physics box shape.
 */
export interface IBoxShape extends IPhysicsShape {
  /**
   * Set the half extents of the box with entity scale applied.
   */
  setHalfExtents(halfExtents: Vector3): void;
}
