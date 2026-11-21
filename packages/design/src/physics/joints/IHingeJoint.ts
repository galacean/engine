import { IJoint } from "./IJoint";
import { Vector3 } from "@galacean/engine-math";

/**
 * A joint that allows rotation around one axis.
 */
export interface IHingeJoint extends IJoint {
  /**
   * Set the hinge axis in the owning actor’s frame.
   */
  setAxis(value: Vector3): void;

  /**
   * The current angle in degrees of the joint relative to its rest position.
   */
  getAngle(): number;

  /**
   * The angular velocity of the joint in radians per second.
   */
  getVelocity(): Readonly<number>;

  /**
   * Set an angular hard limit.
   * @param lowerLimit - The lower angle in degrees
   * @param upperLimit - The upper angle in degrees
   * @param contactDist - How far inside the limit it becomes active, in radians
   */
  setHardLimit(lowerLimit: number, upperLimit: number, contactDist: number): void;

  /**
   * Set an angular limit with spring response.
   * @param lowerLimit - The lower angle in degrees
   * @param upperLimit - The upper angle in degrees
   * @param stiffness - The limit spring stiffness
   * @param damping - The limit spring damping
   */
  setSoftLimit(lowerLimit: number, upperLimit: number, stiffness: number, damping: number): void;

  /**
   * Set the drive target angular velocity in radians per second.
   */
  setDriveVelocity(velocity: number): void;

  /**
   * sets the maximum torque the drive can exert.
   * @param limit the maximum torque
   */
  setDriveForceLimit(limit: number): void;

  /**
   * sets the gear ratio for the drive.
   * @param ratio the gear ratio
   */
  setDriveGearRatio(ratio: number): void;

  /**
   * sets a single flag specific to a Hinge Joint.
   * @param flag The flag to set or clear.
   * @param value the value to which to set the flag
   */
  setHingeJointFlag(flag: number, value: boolean): void;
}
