import { Quaternion, Vector3 } from "@galacean/engine-math";
import { ICollider } from "./ICollider";

/**
 * Native static rigid actor.
 */
export interface IStaticCollider extends ICollider {
  /**
   * Set the world-space pose of the actor.
   * @param position - The world-space position
   * @param rotation - The world-space rotation
   */
  setWorldTransform(position: Vector3, rotation: Quaternion): void;

  /**
   * Write the current world-space pose of the actor.
   * @param outPosition - Receives the position
   * @param outRotation - Receives the rotation
   */
  getWorldTransform(outPosition: Vector3, outRotation: Quaternion): void;
}
