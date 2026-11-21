import { IColliderShape } from "./IColliderShape";

/**
 * Interface of physics sphere collider shape.
 */
export interface ISphereColliderShape extends IColliderShape {
  /**
   * Set the radius of the sphere with entity scale applied.
   */
  setRadius(radius: number): void;
}
