import { Quaternion, Ray, Vector3 } from "@galacean/engine-math";
import { ICharacterController } from "./ICharacterController";
import { ICollider } from "./ICollider";

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
   * @param onRaycast - The raycast result callback which pre filter result
   * @param outHitResult - If true is returned, outHitResult will contain more detailed collision information
   * @returns Returns True if the ray intersects with a collider, otherwise false
   */
  raycast(
    ray: Ray,
    distance: number,
    onRaycast: (obj: number) => boolean,
    outHitResult?: (shapeUniqueID: number, distance: number, point: Vector3, normal: Vector3) => void
  ): boolean;

  /**
   * Casts a box through the scene and returns true if there is any hit.
   */
  boxCast(
    center: Vector3,
    orientation: Quaternion,
    halfExtents: Vector3,
    direction: Vector3,
    distance: number,
    onSweep: (obj: number) => boolean,
    outHitResult?: (shapeUniqueID: number, distance: number, position: Vector3, normal: Vector3) => void
  ): boolean;

  /**
   * Casts a sphere through the scene and returns true if there is any hit.
   */
  sphereCast(
    center: Vector3,
    radius: number,
    direction: Vector3,
    distance: number,
    onSweep: (obj: number) => boolean,
    outHitResult?: (shapeUniqueID: number, distance: number, position: Vector3, normal: Vector3) => void
  ): boolean;

  /**
   * Casts a capsule through the scene and returns true if there is any hit.
   */
  capsuleCast(
    center: Vector3,
    radius: number,
    height: number,
    orientation: Quaternion,
    direction: Vector3,
    distance: number,
    onSweep: (obj: number) => boolean,
    outHitResult?: (shapeUniqueID: number, distance: number, position: Vector3, normal: Vector3) => void
  ): boolean;

  /**
   * Check if a box overlaps with any collider in the scene.
   */
  overlapBox(
    center: Vector3,
    orientation: Quaternion,
    halfExtents: Vector3,
    onOverlap: (obj: number) => boolean,
    outHitResult?: (shapeUniqueID: number) => void
  ): boolean;

  /**
   * Check if a sphere overlaps with any collider in the scene.
   */
  overlapSphere(
    center: Vector3,
    radius: number,
    onOverlap: (obj: number) => boolean,
    outHitResult?: (shapeUniqueID: number) => void
  ): boolean;

  /**
   * Check if a capsule overlaps with any collider in the scene.
   */
  overlapCapsule(
    center: Vector3,
    radius: number,
    height: number,
    orientation: Quaternion,
    onOverlap: (obj: number) => boolean,
    outHitResult?: (shapeUniqueID: number) => void
  ): boolean;

  /**
   * Destroy the physics scene.
   */
  destroy(): void;
}
