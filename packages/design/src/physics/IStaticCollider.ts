import { Quaternion, Vector3 } from "@galacean/engine-math";
import { ICollider } from "./ICollider";
import { IColliderShape } from "./shape";

/**
 * Interface of physics static collider.
 */
export interface IStaticCollider extends ICollider {
  /**
   * Atomically replace an attached shape with the same logical identity.
   * @param previousShape - The currently attached shape
   * @param newShape - The replacement shape
   * @returns Whether the replacement succeeded
   * @remarks On failure, returns false and leaves the previous shape and its event state unchanged.
   */
  replaceShape(previousShape: IColliderShape, newShape: IColliderShape): boolean;

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
