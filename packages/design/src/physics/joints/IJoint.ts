import { Quaternion, Vector3 } from "@galacean/engine-math";
import { IPhysicsActor } from "../IPhysicsActor";

/**
 * Common configuration for native joints.
 */
export interface IJoint {
  /**
   * Bind both actors. A null connected actor connects the owning actor to the world.
   */
  setActors(actor: IPhysicsActor, connectedActor: IPhysicsActor | null): void;

  /**
   * Set the anchor and optionally the rotation in the connected actor's frame or in world space.
   */
  setConnectedAnchor(value: Vector3, rotation?: Quaternion): void;

  /**
   * Set the anchor in the owning actor’s frame.
   */
  setAnchor(value: Vector3): void;

  /**
   * Set the connected actor’s mass multiplier for this constraint.
   */
  setConnectedMassScale(value: number): void;

  /**
   * Set the owning actor’s mass multiplier for this constraint.
   */
  setMassScale(value: number): void;

  /**
   * The scale to apply to the inverse inertia of the connected actor for resolving this constraint.
   */
  setConnectedInertiaScale(value: number): void;

  /**
   * The scale to apply to the inverse inertia of the owning actor for resolving this constraint.
   */
  setInertiaScale(value: number): void;

  /**
   * Set the maximum force and torque the joint can apply before breaking.
   */
  setBreakForce(force: number, torque: number): void;

  /**
   * Destroy the joint.
   */
  destroy(): void;
}
