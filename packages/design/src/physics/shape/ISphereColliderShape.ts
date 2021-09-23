import { IColliderShape } from "./IColliderShape";

/**
 * Interface of physical shape for Sphere.
 */
export interface ISphereColliderShape extends IColliderShape {
  /**
   * Set radius of sphere.
   * @param radius the radius
   */
  setRadius(radius: number): void;
}
