import { Vector3, Quaternion } from "@oasis-engine/math";
import { ICollider } from "../ICollider";

/**
 * a base interface providing common functionality for joints.
 */
export interface IJoint {
  /**
   * Set the actors for this joint.
   * @param actor0 the first actor.
   * @param actor1 the second actor
   */
  setActors(actor0?: ICollider, actor1?: ICollider): void;

  /**
   * Set the joint local pose for an actor.
   * @param actor 0 for the first actor, 1 for the second actor.
   * @param position the local position for the actor this joint
   * @param rotation the local rotation for the actor this joint
   */
  setLocalPose(actor: number, position: Vector3, rotation: Quaternion): void;

  /**
   * set the break force for this joint.
   * @param force the maximum force the joint can apply before breaking
   * @param torque the maximum torque the joint can apply before breaking
   */
  setBreakForce(force: number, torque: number): void;

  /**
   * set a constraint flags for this joint to a specified value.
   * @param flags the constraint flag
   * @param value the value to which to set the flag
   */
  setConstraintFlag(flags: number, value: boolean): void;

  /**
   * set the inverse mass scale for actor0.
   * @param invMassScale the scale to apply to the inverse mass of actor 0 for resolving this constraint
   */
  setInvMassScale0(invMassScale: number): void;

  /**
   * set the inverse inertia scale for actor0.
   * @param invInertiaScale the scale to apply to the inverse inertia of actor0 for resolving this constraint
   */
  setInvInertiaScale0(invInertiaScale: number): void;

  /**
   * set the inverse mass scale for actor1.
   * @param invMassScale the scale to apply to the inverse mass of actor 1 for resolving this constraint
   */
  setInvMassScale1(invMassScale: number): void;

  /**
   * set the inverse inertia scale for actor1.
   * @param invInertiaScale the scale to apply to the inverse inertia of actor1 for resolving this constraint
   */
  setInvInertiaScale1(invInertiaScale: number): void;
}
