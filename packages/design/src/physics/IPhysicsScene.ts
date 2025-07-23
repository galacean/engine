import { Quaternion, Ray, Vector3 } from "@galacean/engine-math";
import { ICharacterController } from "./ICharacterController";
import { ICollider } from "./ICollider";
import { IGeometry } from "./geometry";

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
   * Sweep a geometry through the Scene and returns true if there is any hit.
   * @param geometry - The geometry to sweep
   * @param center - The center of the geometry
   * @param orientation - The orientation of the geometry
   * @param direction - The direction to sweep along
   * @param distance - The max distance to sweep
   * @param onSweep - Callback to pre filter objects
   * @param outHitResult - Callback to get hit result
   * @returns True if the sweep intersects with a collider, otherwise false
   */
  sweep(
    geometry: IGeometry,
    pose: { translation: Vector3; rotation: Quaternion },
    direction: Vector3,
    distance: number,
    onSweep: (obj: number) => boolean,
    outHitResult?: (shapeUniqueID: number, distance: number, position: Vector3, normal: Vector3) => void
  ): boolean;

  /**
   * Check if a geometry overlaps with any collider in the scene.
   * @param geometry - The geometry to check
   * @param pose - The pose of the geometry
   * @param onOverlap - Callback to pre filter objects
   * @returns True if the geometry overlaps with any collider, otherwise false
   */
  overlapAny(
    geometry: IGeometry,
    pose: { translation: Vector3; rotation: Quaternion },
    onOverlap: (obj: number) => boolean,
    outHitResult?: (shapeUniqueID: number) => void
  ): boolean;

  /**
   * Destroy the physics scene.
   */
  destroy(): void;
}
