import { Vector3 } from "@galacean/engine-math";
import { ICollider } from "../ICollider";

/**
 * a base interface providing common functionality for joints.
 */
export interface IJoint {
  /**
   * The connected collider.
   */
  setConnectedCollider(value: ICollider): void;

  /**
   * The connected anchor position.
   * @remarks If connectedCollider is set, this anchor is relative offset, or the anchor is world position.
   */
  setConnectedAnchor(value: Vector3): void;

  /**
   * The anchor position.
   */
  setAnchor(value: Vector3): void;

  /**
   *  The scale to apply to the inverse mass of collider 0 for resolving this constraint.
   */
  setConnectedMassScale(value: number): void;

  /**
   * The scale to apply to the inverse mass of collider 1 for resolving this constraint.
   */
  setMassScale(value: number): void;

  /**
   * The scale to apply to the inverse inertia of collider0 for resolving this constraint.
   */
  setConnectedInertiaScale(value: number): void;

  /**
   * The scale to apply to the inverse inertia of collider1 for resolving this constraint.
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
