import { IColliderShape } from "./IColliderShape";

/**
 * Interface of physics capsule collider shape.
 */
export interface ICapsuleColliderShape extends IColliderShape {
  /**
   * Set the scaled dimensions and up axis of the capsule.
   * @param radius - Scaled radius
   * @param halfHeight - Scaled half height of the cylinder, excluding caps
   * @param upAxis - The local up axis
   */
  setDimensions(radius: number, halfHeight: number, upAxis: number): void;
}
