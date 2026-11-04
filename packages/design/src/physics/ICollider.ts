import { IColliderShape } from "./shape";

/**
 * Interface of physics collider.
 */
export interface ICollider {
  /**
   * Add collider shape on collider.
   * @param shape - The collider shape attached
   * @returns Whether the shape was accepted
   * @remarks On failure, returns false and leaves the collider unchanged.
   */
  addShape(shape: IColliderShape): boolean;

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
