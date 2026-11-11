import { Quaternion, Vector3 } from "@galacean/engine-math";
import { ICharacterController } from "./ICharacterController";
import { ICollider } from "./ICollider";
import { IPhysicsEvents } from "./IPhysicsEvents";

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
   * Enable contact event delivery.
   * @param enabled - Whether collision contact events should be delivered for dispatch.
   */
  setContactEventEnabled(enabled: boolean): void;

  /**
   * Collect buffered collision and trigger events.
   * Must be called after update() and after syncing transforms back from physics.
   */
  updateEvents(): IPhysicsEvents;

  /**
   * Casts a ray and reports the nearest hit with a positive distance.
   * @param origin - The world-space ray origin
   * @param direction - The normalized world-space ray direction
   * @param distance - The maximum query distance
   * @param layerMask - The collision layers to include
   * @param outHitResult - The optional hit callback; copy its borrowed point and normal vectors before retaining them
   * @returns Whether an enabled query shape was hit
   */
  raycast(
    origin: Vector3,
    direction: Vector3,
    distance: number,
    layerMask: number,
    outHitResult?: (shapeUniqueID: number, distance: number, point: Vector3, normal: Vector3) => void
  ): boolean;

  /**
   * Casts a ray and reports all hits with a positive distance, in unspecified order.
   * @param origin - The world-space ray origin
   * @param direction - The normalized world-space ray direction
   * @param distance - The maximum query distance
   * @param layerMask - The collision layers to include
   * @param onHit - The per-hit callback; copy its borrowed point and normal vectors before retaining them
   */
  raycastAll(
    origin: Vector3,
    direction: Vector3,
    distance: number,
    layerMask: number,
    onHit: (shapeUniqueID: number, distance: number, point: Vector3, normal: Vector3) => void
  ): void;

  /**
   * Sweeps a box and reports the nearest hit with a positive distance.
   * @param center - The world-space box center
   * @param orientation - The world-space box rotation
   * @param halfExtents - The half size along each box axis
   * @param direction - The normalized world-space sweep direction
   * @param distance - The maximum sweep distance
   * @param layerMask - The collision layers to include
   * @param outHitResult - The optional hit callback; copy its borrowed point and normal vectors before retaining them
   * @returns Whether an enabled query shape was hit
   */
  boxCast(
    center: Vector3,
    orientation: Quaternion,
    halfExtents: Vector3,
    direction: Vector3,
    distance: number,
    layerMask: number,
    outHitResult?: (shapeUniqueID: number, distance: number, position: Vector3, normal: Vector3) => void
  ): boolean;

  /**
   * Sweeps a sphere and reports the nearest hit with a positive distance.
   * @param center - The world-space sphere center
   * @param radius - The sphere radius
   * @param direction - The normalized world-space sweep direction
   * @param distance - The maximum sweep distance
   * @param layerMask - The collision layers to include
   * @param outHitResult - The optional hit callback; copy its borrowed point and normal vectors before retaining them
   * @returns Whether an enabled query shape was hit
   */
  sphereCast(
    center: Vector3,
    radius: number,
    direction: Vector3,
    distance: number,
    layerMask: number,
    outHitResult?: (shapeUniqueID: number, distance: number, position: Vector3, normal: Vector3) => void
  ): boolean;

  /**
   * Sweeps a capsule and reports the nearest hit with a positive distance.
   * @param center - The world-space capsule center
   * @param radius - The capsule radius
   * @param height - The height between the capsule's hemisphere centers
   * @param orientation - The world-space capsule rotation
   * @param direction - The normalized world-space sweep direction
   * @param distance - The maximum sweep distance
   * @param layerMask - The collision layers to include
   * @param outHitResult - The optional hit callback; copy its borrowed point and normal vectors before retaining them
   * @returns Whether an enabled query shape was hit
   */
  capsuleCast(
    center: Vector3,
    radius: number,
    height: number,
    orientation: Quaternion,
    direction: Vector3,
    distance: number,
    layerMask: number,
    outHitResult?: (shapeUniqueID: number, distance: number, position: Vector3, normal: Vector3) => void
  ): boolean;

  /**
   * Finds query shapes overlapping a box, in unspecified order.
   * @param center - The world-space box center
   * @param orientation - The world-space box rotation
   * @param halfExtents - The half size along each box axis
   * @param layerMask - The collision layers to include
   * @returns Borrowed shape IDs; consume them before the next physics operation
   */
  overlapBoxAll(center: Vector3, orientation: Quaternion, halfExtents: Vector3, layerMask: number): ArrayLike<number>;

  /**
   * Finds query shapes overlapping a sphere, in unspecified order.
   * @param center - The world-space sphere center
   * @param radius - The sphere radius
   * @param layerMask - The collision layers to include
   * @returns Borrowed shape IDs; consume them before the next physics operation
   */
  overlapSphereAll(center: Vector3, radius: number, layerMask: number): ArrayLike<number>;

  /**
   * Finds query shapes overlapping a capsule, in unspecified order.
   * @param center - The world-space capsule center
   * @param radius - The capsule radius
   * @param height - The height between the capsule's hemisphere centers
   * @param orientation - The world-space capsule rotation
   * @param layerMask - The collision layers to include
   * @returns Borrowed shape IDs; consume them before the next physics operation
   */
  overlapCapsuleAll(
    center: Vector3,
    radius: number,
    height: number,
    orientation: Quaternion,
    layerMask: number
  ): ArrayLike<number>;

  /**
   * Trim internal object pools after a GC cycle.
   */
  gc(): void;

  /**
   * Destroy the physics scene.
   */
  destroy(): void;
}
