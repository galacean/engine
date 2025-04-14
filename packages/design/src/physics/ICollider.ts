import { IColliderShape } from "./shape";

/**
 * Interface of physics collider.
 */
export interface ICollider {
  /**
   * Add collider shape on collider.
   * @param shape - The collider shape attached
   */
  addShape(shape: IColliderShape): void;

  /**
   * Remove collider shape on collider.
   * @param shape - The collider shape attached
   */
  removeShape(shape: IColliderShape): void;

  /**
   * Set the collision group of the collider.
   * @param layer - The layer of the entity which the collider belongs to
   */
  setCollisionGroup(layer: number): void;

  /**
   * Deletes the collider.
   */
  destroy(): void;
}
