import { Ray, Vector3 } from "@oasis-engine/math";
import { ICollider } from "./ICollider";

/**
 * Interface for physics manager.
 */
export interface IPhysicsManager {
  /**
   * Set gravity.
   * @param gravity - Physics gravity
   */
  setGravity(gravity: Vector3): void;

  /**
   * Add ICollider into the manager.
   * @param collider - StaticCollider or DynamicCollider.
   */
  addCollider(collider: ICollider): void;

  /**
   * Remove ICollider.
   * @param collider - StaticCollider or DynamicCollider.
   */
  removeCollider(collider: ICollider): void;

  /**
   * Call on every frame to update pose of objects.
   * @param elapsedTime - Step time of update.
   */
  update(elapsedTime: number): void;

  /**
   * Casts a ray through the Scene and returns the first hit.
   * @param ray - The ray
   * @param distance - The max distance the ray should check
   * @param outHitResult - If true is returned, outHitResult will contain more detailed collision information
   * @returns Returns True if the ray intersects with a collider, otherwise false
   */
  raycast(
    ray: Ray,
    distance: number,
    outHitResult?: (shapeUniqueID: number, distance: number, point: Vector3, normal: Vector3) => void
  ): boolean;
}
