import { Quaternion, Vector3 } from "@galacean/engine-math";
import { ForceMode, RigidbodyConstraints } from "./enums/index";
import { IPhysicsActor } from "./IPhysicsActor";

/**
 * Native dynamic rigid actor.
 */
export interface IDynamicActor extends IPhysicsActor {
  /**
   * Set the actor pose immediately and update any pending kinematic target to match.
   * @param position - The world-space position
   * @param rotation - The world-space rotation
   */
  setWorldTransform(position: Vector3, rotation: Quaternion): void;

  /**
   * Sets the linear damping coefficient.
   * @param value - Linear damping coefficient
   */
  setLinearDamping(value: number): void;

  /**
   * Sets the angular damping coefficient.
   * @param value - Angular damping coefficient
   */
  setAngularDamping(value: number): void;

  /**
   * Get the linear velocity of the actor.
   * @param out - The linear velocity of the actor
   */
  getLinearVelocity(out: Vector3): Vector3;

  /**
   * Sets the linear velocity of the actor.
   * @param value - New linear velocity of actor
   */
  setLinearVelocity(value: Vector3): void;

  /**
   * Gets the actor's angular velocity in radians per second.
   * @param out - The angular velocity of the actor
   */
  getAngularVelocity(out: Vector3): Vector3;

  /**
   * Sets the actor's angular velocity in radians per second.
   * @param value - New angular velocity of actor
   */
  setAngularVelocity(value: Vector3): void;

  /**
   * Sets any supplied explicit mass, center of mass, diagonal inertia tensor, and inertia rotation without
   * recomputing automatic properties from attached shapes. Omitted properties remain unchanged.
   */
  setMassProperties(
    mass?: number,
    centerOfMass?: Vector3,
    inertiaTensor?: Vector3,
    inertiaTensorRotation?: Quaternion
  ): void;

  /**
   * Updates the mass and recomputes automatic center of mass and/or inertia properties from attached solid shapes,
   * preserving any non-null manual overrides.
   * @param mass - Mass to apply. Zero gives infinite translational mass and uses unit mass for automatic inertia.
   * @param centerOfMass - Manual center of mass to preserve, or null to compute automatically
   * @param inertiaTensor - Manual diagonal inertia tensor to preserve, or null to compute automatically
   * @param inertiaTensorRotation - Manual principal-axis rotation matching `inertiaTensor`, or null when automatic
   */
  updateMassAndInertia(
    mass: number,
    centerOfMass: Vector3 | null,
    inertiaTensor: Vector3 | null,
    inertiaTensorRotation: Quaternion | null
  ): void;

  /**
   * Gets the center of mass relative to the actor.
   * @param out - The center of mass of the actor
   */
  getCenterOfMass(out: Vector3): Vector3;

  /**
   * Gets the inertia tensor of the actor.
   * @param out - The mass space inertia tensor of the actor
   */
  getInertiaTensor(out: Vector3): Vector3;

  /** Writes the rotation of the inertia frame relative to the actor. */
  getInertiaTensorRotation(out: Quaternion): Quaternion;

  /** Applies mass derived from solid volume. Returns the new mass or zero when no properties were changed. */
  setDensity(density: number, automaticCenterOfMass: boolean, automaticInertiaTensor: boolean): number;

  /** Sets the actor's maximum linear speed in world units per second before solving. */
  setMaxLinearVelocity(value: number): void;

  /**
   * Sets the actor's maximum angular velocity in radians per second.
   * @param value - Max allowable angular velocity for actor
   */
  setMaxAngularVelocity(value: number): void;

  /**
   * Sets the maximum depenetration velocity permitted to be introduced by the solver.
   * @param value - The maximum velocity to de-penetrate
   */
  setMaxDepenetrationVelocity(value: number): void;

  /**
   * Sets the mass-normalized kinetic energy threshold below which an actor may go to sleep.
   * @param value - Energy below which an actor may go to sleep
   */
  setSleepThreshold(value: number): void;

  /**
   * Sets the solver iteration counts for the body.
   * @param positionIterations - Number of position iterations
   * @param velocityIterations - Number of velocity iterations
   */
  setSolverIterations(positionIterations: number, velocityIterations: number): void;

  /**
   * Whether the actor is affected by gravity.
   */
  setUseGravity(value: boolean): void;

  /**
   * Applies the kinematic state and CCD together so the backend can select the supported detection method.
   * @param isKinematic - Whether the dynamic actor is kinematic
   * @param useCCD - Whether to use continuous collision detection
   */
  setMotionState(isKinematic: boolean, useCCD: boolean): void;

  /**
   * Sets rigid dynamic lock flags.
   * @param flags - The constraint flags to apply
   */
  setConstraints(flags: RigidbodyConstraints): void;

  /**
   * Applies a world-space force at the center of mass.
   * @param force - Value in the units of the selected mode
   * @param mode - The force application mode
   */
  addForce(force: Vector3, mode: ForceMode): void;

  /**
   * Applies a world-space force or impulse at a world-space position.
   * @param force - World-space force or impulse vector
   * @param position - The world-space position where the force is applied
   * @param impulse - Whether to apply an impulse instead of a force
   */
  addForceAtPosition(force: Vector3, position: Vector3, impulse: boolean): void;

  /**
   * Applies a world-space torque to the dynamic actor.
   * @param torque - Value in the units of the selected mode
   * @param mode - The force application mode
   */
  addTorque(torque: Vector3, mode: ForceMode): void;

  /**
   * Set a world-space target pose for the next simulation step.
   * @param position - The target position, or null to preserve the pending or current position
   * @param rotation - The target rotation, or null to preserve the pending or current rotation
   */
  move(position: Vector3 | null, rotation: Quaternion | null): void;

  /**
   * Forces an actor to sleep at least one frame.
   */
  sleep(): void;

  /**
   * Returns whether the actor is sleeping.
   */
  isSleeping(): boolean;

  /**
   * Forces an actor to wake up.
   */
  wakeUp(): void;
}
