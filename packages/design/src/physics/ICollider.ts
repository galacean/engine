import { IColliderShape } from "./shape";

/**
 * Interface of a native rigid actor that holds collider shapes.
 * @remarks Each shape carries its own collision layer, so attaching or moving a shape never changes another shape's layer.
 */
export interface ICollider {
  /**
   * Attach a shape.
   * @param shape - Shape to attach
   * @returns Whether the shape was accepted
   * @remarks On failure, returns false and leaves the actor unchanged.
   */
  addShape(shape: IColliderShape): boolean;

  /**
   * Detach an attached shape.
   * @param shape - The attached shape
   */
  removeShape(shape: IColliderShape): void;

  /**
   * Atomically replace an attached shape with the same logical identity.
   * @param previousShape - The currently attached shape
   * @param newShape - The replacement shape
   * @returns Whether the replacement succeeded
   * @remarks On failure, returns false and leaves the previous shape and its event state unchanged.
   */
  replaceShape(previousShape: IColliderShape, newShape: IColliderShape): boolean;

  /**
   * Deletes the actor.
   */
  destroy(): void;
}
