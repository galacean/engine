import { IJoint } from "./IJoint";

/**
 * A translational joint permits relative translational movement between two bodies along
 * an axis, but no relative rotational movement.
 */
export interface ITranslationalJoint extends IJoint {
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
   * Set a single flag specific to a Prismatic Joint to true or false.
   * @param flag The flag to set or clear.
   * @param value The value to which to set the flag
   */
  setPrismaticJointFlag(flag: number, value: boolean): void;

  /**
   * Set the linear tolerance threshold for projection.
   * @param tolerance the linear tolerance threshold
   */
  setProjectionLinearTolerance(tolerance: number): void;

  /**
   * Set the angular tolerance threshold for projection.
   * @param tolerance the linear tolerance threshold
   */
  setProjectionAngularTolerance(tolerance: number): void;
}
