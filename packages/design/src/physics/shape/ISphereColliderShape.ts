import { IColliderShape } from "./IColliderShape";

/**
 * Interface of physics sphere collider shape.
 */
export interface ISphereColliderShape extends IColliderShape {
  /**
   * Set the scaled radius of the sphere.
   */
  setRadius(radius: number): void;
}
