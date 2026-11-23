import { Quaternion, Vector3 } from "@galacean/engine-math";
import { IPhysicsActor } from "../IPhysicsActor";

/**
 * Common configuration for native joints.
 */
export interface IJoint {
  /**
   * Connect the joint to a second actor, or to the world if the value is absent.
   */
  setConnectedActor(value: IPhysicsActor | null | undefined): void;

  /**
   * Set the anchor in the connected actor’s frame, or in world space for a world connection.
   */
  setConnectedAnchor(value: Vector3): void;

  /**
   * Set the anchor in the owning actor’s frame.
   */
  setAnchor(value: Vector3): void;

  /**
   * Set the connected actor’s mass multiplier for this constraint.
   */
  setConnectedMassScale(value: number): void;

  /**
   * Set the joint frame rotation relative to the connected actor, or in world space for a world connection.
   */
  setRotation(value: Quaternion): void;

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
   * The maximum force the joint can apply before breaking.
   */
  setBreakForce(value: number): void;

  /**
   * The maximum torque the joint can apply before breaking.
   */
  setBreakTorque(value: number): void;

  /**
   * Destroy the joint.
   */
  destroy(): void;
}
