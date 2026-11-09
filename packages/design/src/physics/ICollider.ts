import { IColliderShape } from "./shape";

/**
 * Interface of physics collider.
 */
export interface ICollider {
  /**
   * Attaches a shape and initializes its collision layer.
   * @param shape - Shape to attach
   * @param layer - Collision layer index, from 0 to 31
   */
  addShape(shape: IColliderShape, layer: number): void;

  /**
   * Remove collider shape on collider.
   * @param shape - The collider shape attached
   */
  removeShape(shape: IColliderShape): void;

  /**
   * Set the collision group of the collider.
   * @param layer - The layer of the collider which the collider belongs to
   */
  setCollisionLayer(layer: number): void;

  /**
   * Deletes the collider.
   */
  destroy(): void;
}
