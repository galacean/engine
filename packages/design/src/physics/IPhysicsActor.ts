import { Quaternion, Vector3 } from "@galacean/engine-math";
import { IPhysicsShape } from "./shape";

/**
 * Interface of a native rigid actor that holds physics shapes.
 * @remarks Collision layers belong to the shapes attached to the actor.
 */
export interface IPhysicsActor {
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

  /**
   * Attach a shape.
   * @param shape - Shape to attach
   * @returns Whether the shape was accepted
   * @remarks On failure, returns false and leaves the actor unchanged.
   */
  addShape(shape: IPhysicsShape): boolean;

  /**
   * Detach an attached shape.
   * @param shape - The attached shape
   */
  removeShape(shape: IPhysicsShape): void;

  /**
   * Replace an attached shape with one that carries the same collider ID.
   * @param previousShape - The currently attached shape
   * @param newShape - The replacement shape
   * @returns Whether the replacement succeeded
   * @remarks On failure, the previous shape and its event state stay intact.
   */
  replaceShape(previousShape: IPhysicsShape, newShape: IPhysicsShape): boolean;

  /**
   * Release the native actor.
   */
  destroy(): void;
}
