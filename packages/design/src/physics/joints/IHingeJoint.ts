import { Vector3 } from "@galacean/engine-math";
import { IJoint } from "./IJoint";

/**
 * A joint that allows rotation around one axis.
 */
export interface IHingeJoint extends IJoint {
  /**
   * Set the normalized hinge axis in the owning actor’s frame.
   */
  setAxis(value: Vector3): void;

  /**
   * The current angle in radians of the joint relative to its rest position.
   */
  getAngle(): number;

  /**
   * The angular velocity of the joint in radians per second.
   */
  getVelocity(): number;

  /**
   * Set an angular hard limit.
   * @param lowerLimit - The lower angle in radians
   * @param upperLimit - The upper angle in radians
   * @param contactDist - How far inside the limit it becomes active, in radians
   */
  setHardLimit(lowerLimit: number, upperLimit: number, contactDist: number): void;

  /**
   * Set an angular limit with spring response.
   * @param lowerLimit - The lower angle in radians
   * @param upperLimit - The upper angle in radians
   * @param stiffness - The limit spring stiffness
   * @param damping - The limit spring damping
   */
  setSoftLimit(lowerLimit: number, upperLimit: number, stiffness: number, damping: number): void;

  /**
   * Set the drive target velocity.
   * @param velocity - Target angular velocity in radians per second.
   */
  setDriveVelocity(velocity: number): void;

  /**
   * Set the maximum torque the drive can exert.
   * @param limit - The maximum torque
   */
  setDriveForceLimit(limit: number): void;

  /**
   * Set the gear ratio for the drive.
   * @param ratio - The gear ratio
   */
  setDriveGearRatio(ratio: number): void;

  /**
   * Enable or disable angular limits.
   * @param enabled - Whether angular limits are enforced
   */
  setLimitEnabled(enabled: boolean): void;

  /**
   * Enable or disable the angular drive motor.
   * @param enabled - Whether the drive motor is active
   */
  setDriveEnabled(enabled: boolean): void;

  /**
   * Enable or disable free spin when exceeding target drive velocity.
   * @param enabled - Whether free spin is allowed
   */
  setDriveFreeSpin(enabled: boolean): void;
}
