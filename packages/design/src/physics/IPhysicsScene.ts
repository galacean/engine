import { Ray, Vector3 } from "@galacean/engine-math";
import { ICharacterController } from "./ICharacterController";
import { ICollider } from "./ICollider";
import { IColliderShape } from "./shape";

/**
 * Interface for physics manager.
 */
export interface IPhysicsScene {
  /**
   * Set gravity.
   * @param gravity - Physics gravity
   */
  setGravity(gravity: Vector3): void;

  /**
   * Add IColliderShape into the manager.
   * @param colliderShape - The Collider Shape.
   */
  addColliderShape(colliderShape: IColliderShape): void;

  /**
   * Remove IColliderShape.
   * @param colliderShape - The Collider Shape.
   */
  removeColliderShape(colliderShape: IColliderShape): void;

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
   * Add ICharacterController into the manager.
   * @param characterController The Character Controller.
   */
  addCharacterController(characterController: ICharacterController): void;

  /**
   * Remove ICharacterController.
   * @param characterController The Character Controller.
   */
  removeCharacterController(characterController: ICharacterController): void;

  /**
   * Call on every frame to update pose of objects.
   * @param elapsedTime - Step time of update.
   */
  update(elapsedTime: number): void;

  /**
   * Casts a ray through the Scene and returns the first hit.
   * @param ray - The ray
   * @param distance - The max distance the ray should check
   * @param onRaycast - The raycast result callback which prefilter result
   * @param outHitResult - If true is returned, outHitResult will contain more detailed collision information
   * @returns Returns True if the ray intersects with a collider, otherwise false
   */
  raycast(
    ray: Ray,
    distance: number,
    onRaycast: (obj: number) => boolean,
    outHitResult?: (shapeUniqueID: number, distance: number, point: Vector3, normal: Vector3) => void
  ): boolean;
}
