import { Quaternion, Vector3 } from "@galacean/engine-math";
import { ICharacterController, CharacterControllerOptions } from "./ICharacterController";
import { IDynamicActor } from "./IDynamicActor";
import { IPhysicsActor } from "./IPhysicsActor";
import { IPhysicsEvents } from "./IPhysicsEvents";
import { IFixedJoint, IHingeJoint, ISpringJoint } from "./joints";

/** @internal Positions, rotations and sleep flags in eight Float32 lanes per Rigidbody. */
interface IPhysicsBodyPoses {
  /** Current memory, which may change on WASM growth during writeback. */
  readonly values: Float32Array;
  /** Float32 offset. Valid until the next capture or scene destruction. */
  readonly offset: number;
}

/**
 * A native simulation scene with joints, scene queries, and buffered events.
 * @remarks
 * - Scene queries include shapes enabled for queries (including trigger shapes) matching the `layerMask`.
 * - Casts ignore initial overlaps (hits at distance <= 0) and backfaces.
 * - Cast results are borrowed records of nine floats in order: collider ID, distance, point XYZ, normal XYZ, face index.
 *   Consume them synchronously before another physics operation.
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
   * Create a character controller attached to this scene.
   * @param options - Initial settings consumed synchronously.
   * @returns The attached controller, or null if creation fails.
   */
  createCharacterController(options: CharacterControllerOptions): ICharacterController | null;

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

  /** @internal Set or append a writeback slot. Passing null removes the last slot. */
  setBodyPoseActor(index: number, actor: IDynamicActor | null): void;

  /** @internal Capture the completed step's poses by writeback slot. */
  readBodyPoses(): IPhysicsBodyPoses;

  /**
   * Enable contact event delivery.
   * @param enabled - Whether collision contact events should be delivered for dispatch.
   */
  setContactEventEnabled(enabled: boolean): void;

  /**
   * Collect buffered collision and trigger events for the completed step.
   * @remarks Call once per step, after reading the new poses from physics.
   * @param reportTriggerStay - Include unchanged overlaps for Stay listeners.
   * @returns Borrowed event records for immediate dispatch, including rediscovered pairs after shape changes.
   */
  updateEvents(reportTriggerStay: boolean): IPhysicsEvents;

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
   * @returns Zero or one hit record.
   */
  raycast(origin: Vector3, direction: Vector3, distance: number, layerMask: number): Readonly<Float64Array>;

  /**
   * Casts a ray and reports all hits with a positive distance, in unspecified order.
   * @param origin - The world-space ray origin
   * @param direction - The normalized world-space ray direction
   * @param distance - The maximum query distance
   * @param layerMask - The collision layers to include
   * @returns The hit records.
   */
  raycastAll(origin: Vector3, direction: Vector3, distance: number, layerMask: number): Readonly<Float64Array>;

  /**
   * Sweeps a box and reports the nearest hit with a positive distance.
   * @param center - The world-space box center
   * @param orientation - The world-space box rotation
   * @param halfExtents - The half size along each box axis
   * @param direction - The normalized world-space sweep direction
   * @param distance - The maximum sweep distance
   * @param layerMask - The collision layers to include
   * @returns Zero or one hit record.
   */
  boxCast(
    center: Vector3,
    orientation: Quaternion,
    halfExtents: Vector3,
    direction: Vector3,
    distance: number,
    layerMask: number
  ): Readonly<Float64Array>;

  /**
   * Sweeps a sphere and reports the nearest hit with a positive distance.
   * @param center - The world-space sphere center
   * @param radius - The sphere radius
   * @param direction - The normalized world-space sweep direction
   * @param distance - The maximum sweep distance
   * @param layerMask - The collision layers to include
   * @returns Zero or one hit record.
   */
  sphereCast(
    center: Vector3,
    radius: number,
    direction: Vector3,
    distance: number,
    layerMask: number
  ): Readonly<Float64Array>;

  /**
   * Sweeps a capsule and reports the nearest hit with a positive distance.
   * @param center - The world-space capsule center
   * @param radius - Strictly positive capsule radius
   * @param halfHeight - Strictly positive half cylindrical height between the capsule's hemisphere centers; degenerate spheres use {@link sphereCast}
   * @param orientation - World-space rotation of the capsule, whose local long axis is Y
   * @param direction - The normalized world-space sweep direction
   * @param distance - The maximum sweep distance
   * @param layerMask - The collision layers to include
   * @returns Zero or one hit record.
   */
  capsuleCast(
    center: Vector3,
    radius: number,
    halfHeight: number,
    orientation: Quaternion,
    direction: Vector3,
    distance: number,
    layerMask: number
  ): Readonly<Float64Array>;

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
