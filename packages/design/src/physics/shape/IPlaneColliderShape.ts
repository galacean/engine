import { IColliderShape } from "./IColliderShape";
import { Vector3 } from "@oasis-engine/math";

/**
 * Interface of physics plane collider shape.
 */
export interface IPlaneColliderShape extends IColliderShape {
  /**
   * Set local rotation.
   * @param normal - The local rotation
   */
  setRotation(normal: Vector3): void;
}
