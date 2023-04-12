import { IJoint } from "./IJoint";
import { Vector3 } from "@galacean/engine-math";

/**
 * A joint which behaves in a similar way to a hinge or axle.
 */
export interface IHingeJoint extends IJoint {
  /**
   * The anchor rotation.
   */
  setAxis(value: Vector3): void;

  /**
   * The swing offset.
   */
  setSwingOffset(value: Vector3): void;

  /**
   * The current angle in degrees of the joint relative to its rest position.
   */
  getAngle(): number;

  /**
   * The angular velocity of the joint in degrees per second.
   */
  getVelocity(): Readonly<Vector3>;

  /**
   * Set a cone hard limit.
   * @param lowerLimit The lower angle of the limit
   * @param upperLimit The upper angle of the limit
   * @param contactDist The distance from the limit at which it becomes active. Default is the lesser of 0.1 radians, and 0.49 * the lower of the limit angles
   */
  setHardLimit(lowerLimit: number, upperLimit: number, contactDist: number): void;

  /**
   * Set a cone soft limit.
   * @param lowerLimit The lower angle of the limit
   * @param upperLimit The upper angle of the limit
   * @param stiffness the spring strength of the drive
   * @param damping the damping strength of the drive
   */
  setSoftLimit(lowerLimit: number, upperLimit: number, stiffness: number, damping: number): void;

  /**
   * set the target velocity for the drive model.
   * @param velocity the drive target velocity
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
