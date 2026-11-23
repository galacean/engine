import { IPhysicsShape } from "./IPhysicsShape";

/**
 * Interface of a physics sphere shape.
 */
export interface ISphereShape extends IPhysicsShape {
  /**
   * Set the radius of the sphere with entity scale applied.
   */
  setRadius(radius: number): void;
}
