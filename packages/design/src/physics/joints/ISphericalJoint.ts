import { IJoint } from "./IJoint";

/**
 * A joint which behaves in a similar way to a ball and socket.
 */
export interface ISphericalJoint extends IJoint {
  /**
   * Set a cone hard limit.
   * @param yLimitAngle The limit angle from the Y-axis of the constraint frame
   * @param zLimitAngle The limit angle from the Z-axis of the constraint frame
   * @param contactDist The distance from the limit at which it becomes active. Default is the lesser of 0.1 radians, and 0.49 * the lower of the limit angles
   */
  setHardLimitCone(yLimitAngle: number, zLimitAngle: number, contactDist: number): void;

  /**
   * Set a cone soft limit.
   * @param yLimitAngle The limit angle from the Y-axis of the constraint frame
   * @param zLimitAngle The limit angle from the Z-axis of the constraint frame
   * @param stiffness the spring strength of the drive
   * @param damping the damping strength of the drive
   */
  setSoftLimitCone(yLimitAngle: number, zLimitAngle: number, stiffness: number, damping: number): void;

  /**
   * Set a single flag specific to a Spherical Joint to true or false.
   * @param flag The flag to set or clear.
   * @param value the value to which to set the flag
   */
  setSphericalJointFlag(flag: number, value: boolean): void;

  /**
   * Set the linear tolerance threshold for projection.
   * @param tolerance the linear tolerance threshold
   */
  setProjectionLinearTolerance(tolerance: number): void;
}
