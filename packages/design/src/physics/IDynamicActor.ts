import { Quaternion, Vector3 } from "@galacean/engine-math";
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
   * Writes the world-space velocity at a world-space point.
   */
  getPointVelocity(point: Vector3, out: Vector3): Vector3;

  /**
   * Writes the world-space velocity at a point in actor-local space.
   */
  getRelativePointVelocity(point: Vector3, out: Vector3): Vector3;

  /**
   *  Sets the mass of a dynamic actor.
   * @param value - New mass value for the actor
   */
  setMass(value: number): void;

  /**
   * Sets the center of mass relative to the actor.
   * @param value - Mass frame offset transform relative to the actor frame
   */
  setCenterOfMass(value: Vector3): void;

  /**
   * Gets the center of mass relative to the actor.
   * @param out - The center of mass of the actor
   */
  getCenterOfMass(out: Vector3): Vector3;

  /**
   * Sets the inertia tensor, using a parameter specified in mass space coordinates.
   * @param value - New mass space inertia tensor for the actor
   */
  setInertiaTensor(value: Vector3): void;

  /**
   * Gets the inertia tensor of the actor.
   * @param out - The mass space inertia tensor of the actor
   */
  getInertiaTensor(out: Vector3): Vector3;

  /** Writes the rotation of the inertia frame relative to the actor. */
  getInertiaTensorRotation(out: Quaternion): void;

  /** Sets the rotation of the inertia frame relative to the actor. */
  setInertiaTensorRotation(rotation: Quaternion): void;

  /**
   * Sets the mass of a dynamic actor and automatically updates its inertia tensor.
   * @param mass - New mass value for the actor
   * @remarks This differs from setMass() by automatically updating
   * the inertia tensor and center of mass based on the new mass value.
   */
  setMassAndUpdateInertia(mass: number): void;

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

  /** Sets the scene registration ID for sleep and wake notifications. Use zero to unsubscribe. */
  setSleepEventId(id: number): void;

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
   * Toggle simulation while retaining the actor and its query shapes in the scene.
   */
  setSimulationEnabled(value: boolean): void;

  /**
   * Applies the kinematic state and CCD together so the backend can select the supported detection method.
   * @param isKinematic - Whether the dynamic actor is kinematic
   * @param useCCD - Whether to use continuous collision detection
   */
  setMotionState(isKinematic: boolean, useCCD: boolean): void;

  /**
   * Raises or clears a particular rigid dynamic lock flag.
   * @param flags - the flag to raise(set) or clear
   */
  setConstraints(flags: number): void;

  /**
   * Applies a world-space force at the center of mass.
   * @param force - Value in the units of the selected mode
   * @param mode - The force application mode
   */
  addForce(force: Vector3, mode: number): void;

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
  addTorque(torque: Vector3, mode: number): void;

  /** Applies a body-local force at the center of mass using the selected mode. */
  addRelativeForce(force: Vector3, mode: number): void;

  /** Applies a body-local torque using the selected mode. */
  addRelativeTorque(torque: Vector3, mode: number): void;

  /**
   * Applies a radial force with linear falloff at the nearest surface point, or at the center of mass.
   * @returns Whether the force was applied.
   */
  addExplosionForce(strength: number, origin: Vector3, radius: number, upwardOffset: number, mode: number): boolean;

  /**
   * Set a world-space target pose for the next simulation step.
   * @param positionOrRotation - The target position or rotation
   * @param rotation - The target rotation when passing both position and rotation
   * @remarks A partial update preserves the other component of the pending target, or of the current pose if there is no target.
   */
  move(positionOrRotation: Vector3 | Quaternion, rotation?: Quaternion): void;

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
