import { IColliderShape } from "./shape";
import { Quaternion, Vector3 } from "@oasis-engine/math";

/**
 * Interface of physical collider.
 */
export interface ICollider {
  /**
   * Attach collider shape on collider.
   * @param shape - The collider shape attached
   */
  addShape(shape: IColliderShape): void;

  /**
   * Remove collider shape on collider.
   * @param shape - The collider shape attached
   */
  removeShape(shape: IColliderShape): void;

  /**
   * Set global transform of collider.
   * @param position - The global position
   * @param rotation - The global rotation
   */
  setWorldTransform(position: Vector3, rotation: Quaternion): void;

  /**
   * Get global transform of collider.
   * @param outPosition - The global position
   * @param outRotation - The global rotation
   */
  getWorldTransform(outPosition: Vector3, outRotation: Quaternion): void;
}
