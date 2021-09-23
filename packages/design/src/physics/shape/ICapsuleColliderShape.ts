import { IColliderShape } from "./IColliderShape";

/**
 * Interface of physical shape for capsule.
 */
export interface ICapsuleColliderShape extends IColliderShape {
  /**
   * Set radius of capsule.
   * @param radius - The radius
   */
  setRadius(radius: number): void;

  /**
   * Set height of capsule.
   * @param height - The height
   */
  setHeight(height: number): void;

  /**
   * Set direction of capsule.
   * @param dir - The up axis
   */
  setDirection(dir: number): void;
}
