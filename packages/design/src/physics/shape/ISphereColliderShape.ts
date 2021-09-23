import { IColliderShape } from "./IColliderShape";

/**
 * Interface of physics sphere collider shape.
 */
export interface ISphereColliderShape extends IColliderShape {
  /**
   * Set radius of sphere.
   * @param radius - The radius
   */
  setRadius(radius: number): void;
}
