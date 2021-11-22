import { Quaternion, Vector3 } from "@oasis-engine/math";
import { ICollider } from "./ICollider";

/**
 * Interface of physics dynamic collider.
 */
export interface IDynamicCollider extends ICollider {
  /// The linear damping of the dynamic collider.
  setLinearDamping(value: number): void;

  /// The angular damping of the dynamic collider.
  setAngularDamping(value: number): void;

  /// The linear velocity vector of the dynamic collider measured in world unit per second.
  setLinearVelocity(value: Vector3): void;

  /// The angular velocity vector of the dynamic collider measured in radians per second.
  setAngularVelocity(value: Vector3): void;

  /// The mass of the dynamic collider.
  setMass(value: number): void;

  /// The center of mass relative to the transform's origin.
  setCenterOfMass(value: Vector3): void;

  /// The diagonal inertia tensor of mass relative to the center of mass.
  setInertiaTensor(value: Vector3): void;

  /// The maximum angular velocity of the collider measured in radians per second. (Default 7) range { 0, infinity }.
  setMaxAngularVelocity(value: number): void;

  /// Maximum velocity of a collider when moving out of penetrating state.
  setMaxDepenetrationVelocity(value: number): void;

  /// The mass-normalized energy threshold, below which objects start going to sleep.
  setSleepThreshold(value: number): void;

  /// The solverIterations determines how accurately collider joints and collision contacts are resolved.
  setSolverIterations(value: number): void;

  /// The colliders' collision detection mode.
  setCollisionDetectionMode(value: number): void;

  /// Controls whether physics affects the dynamic collider.
  setIsKinematic(value: boolean): void;

  /// Controls whether physics will change the rotation of the object.
  setFreezeRotation(value: boolean): void;

  /**
   * Apply a force to the dynamic collider.
   * @param force - The force make the collider move
   */
  addForce(force: Vector3): void;

  /**
   * Apply a torque to the dynamic collider.
   * @param torque - The force make the collider rotate
   */
  addTorque(torque: Vector3): void;

  /// Applies force at position. As a result this will apply a torque and force on the object.
  addForceAtPosition(force: Vector3, pos: Vector3): void;

  /// Moves the kinematic collider towards position.
  movePosition(value: Vector3): void;

  /// Rotates the collider to rotation.
  moveRotation(value: Quaternion): void;

  /// Forces a collider to sleep at least one frame.
  putToSleep(): void;

  /// Forces a collider to wake up.
  wakeUp(): void;
}
