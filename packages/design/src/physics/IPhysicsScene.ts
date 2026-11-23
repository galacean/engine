import { Quaternion, Vector3 } from "@galacean/engine-math";
import { ICharacterController } from "./ICharacterController";
import { IPhysicsActor } from "./IPhysicsActor";
import { IPhysicsEvents } from "./IPhysicsEvents";
import { IFixedJoint, IHingeJoint, ISpringJoint } from "./joints";

/**
 * A native simulation scene with joints, scene queries, and buffered events.
 * @remarks
 * - Hit callbacks receive scratch vectors. Copy them before retaining the values or starting another query.
 * - Scene queries include shapes enabled for queries (including trigger shapes) matching the `layerMask`.
 * - Casts ignore initial overlaps (hits at distance <= 0) and backfaces.
 */
export interface IPhysicsScene {
  /**
   * Set gravity.
   * @param gravity - Physics gravity
   */
  setGravity(gravity: Vector3): void;

  /**
   * Add a native actor and its attached shapes to the scene.
   * @param actor - The native static or dynamic actor
   */
  addActor(actor: IPhysicsActor): void;

  /**
   * Remove a native actor and its attached shapes from the scene.
   * @param actor - The native static or dynamic actor
   */
  removeActor(actor: IPhysicsActor): void;

  /**
   * Add a character controller to the scene.
   * @param characterController - The controller configured for this scene
   */
  addCharacterController(characterController: ICharacterController): void;

  /**
   * Remove a character controller from the scene.
   * @param characterController - The controller to remove
   */
  removeCharacterController(characterController: ICharacterController): void;

  /**
   * Create a fixed joint bound to this scene.
   * @param actor - Owning actor of the joint
   */
  createFixedJoint(actor: IPhysicsActor): IFixedJoint;

  /**
   * Create a hinge joint bound to this scene.
   * @param actor - Owning actor of the joint
   */
  createHingeJoint(actor: IPhysicsActor): IHingeJoint;

  /**
   * Create a spring joint bound to this scene.
   * @param actor - Owning actor of the joint
   */
  createSpringJoint(actor: IPhysicsActor): ISpringJoint;

  /**
   * Advance the simulation by one step.
   * @param elapsedTime - The step duration in seconds
   */
  update(elapsedTime: number): void;

  /**
   * Enable contact event delivery.
   * @param enabled - Whether collision contact events should be delivered for dispatch.
   */
  setContactEventEnabled(enabled: boolean): void;

  /**
   * Collect buffered collision and trigger events for the completed step.
   * @remarks Call once per step, after reading the new poses from physics.
   * @returns Borrowed event records for immediate dispatch
   */
  updateEvents(): IPhysicsEvents;

  /**
   * Get whether two collision layers can collide with each other.
   * @param layer1 - The first collision layer index
   * @param layer2 - The second collision layer index
   * @returns Whether the layers should collide
   */
  getColliderLayerCollision(layer1: number, layer2: number): boolean;

  /**
   * Set whether two collision layers can collide with each other.
   * @param layer1 - The first collision layer index
   * @param layer2 - The second collision layer index
   * @param isCollide - Whether the layers should collide
   */
  setColliderLayerCollision(layer1: number, layer2: number, isCollide: boolean): void;

  /**
   * Casts a ray and reports the nearest hit with a positive distance.
   * @param origin - The world-space ray origin
   * @param direction - The normalized world-space ray direction
   * @param distance - The maximum query distance
   * @param layerMask - The collision layers to include
   * @param outHitResult - The optional hit callback receiving the hit point and normal
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
   * @param onHit - The callback invoked for each hit
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
   * @param outHitResult - The optional hit callback receiving the hit point and normal
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
   * @param outHitResult - The optional hit callback receiving the hit point and normal
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
   * @param radius - Strictly positive capsule radius
   * @param halfHeight - Strictly positive half cylindrical height between the capsule's hemisphere centers; degenerate spheres use {@link sphereCast}
   * @param orientation - World-space rotation of the capsule, whose local long axis is Y
   * @param direction - The normalized world-space sweep direction
   * @param distance - The maximum sweep distance
   * @param layerMask - The collision layers to include
   * @param outHitResult - The optional hit callback receiving the hit point and normal
   * @returns Whether an enabled query shape was hit
   */
  capsuleCast(
    center: Vector3,
    radius: number,
    halfHeight: number,
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
   * @param radius - Strictly positive capsule radius
   * @param halfHeight - Strictly positive half cylindrical height between the capsule's hemisphere centers; degenerate spheres use {@link overlapSphereAll}
   * @param orientation - World-space rotation of the capsule, whose local long axis is Y
   * @param layerMask - The collision layers to include
   * @returns Borrowed shape IDs; consume them before the next physics operation
   */
  overlapCapsuleAll(
    center: Vector3,
    radius: number,
    halfHeight: number,
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
