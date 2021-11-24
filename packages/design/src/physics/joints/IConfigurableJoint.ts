import { IJoint } from "./IJoint";
import { Vector3, Quaternion } from "@oasis-engine/math";

/**
 * A Configurable joint is a general constraint between two actors.
 */
export interface IConfigurableJoint extends IJoint {
  /**
   * Set the motion type around the specified axis.
   * @param axis the axis around which motion is specified
   * @param type the motion type around the specified axis
   */
  setMotion(axis: number, type: number): void;

  /**
   * Set the distance limit for the joint.
   * @param extent The extent of the limit
   * @param contactDist The distance from the limit at which it becomes active.
   */
  setHardDistanceLimit(extent: number, contactDist: number): void;

  /**
   * Set the distance limit for the joint.
   * @param extent the extent of the limit
   * @param stiffness the spring strength of the drive
   * @param damping the damping strength of the drive
   */
  setSoftDistanceLimit(extent: number, stiffness: number, damping: number): void;

  /**
   * Set the linear limit for a given linear axis.
   * @param axis The limited linear axis
   * @param lowerLimit The lower distance of the limit
   * @param upperLimit The upper distance of the limit
   * @param contactDist The distance from the limit at which it becomes active.
   */
  setHardLinearLimit(axis: number, lowerLimit: number, upperLimit: number, contactDist: number): void;

  /**
   * Set the linear limit for a given linear axis.
   * @param axis The limited linear axis
   * @param lowerLimit The lower distance of the limit
   * @param upperLimit The upper distance of the limit
   * @param stiffness the spring strength of the drive
   * @param damping the damping strength of the drive
   */
  setSoftLinearLimit(axis: number, lowerLimit: number, upperLimit: number, stiffness: number, damping: number): void;

  /**
   * Set the twist limit for the joint.
   * @param lowerLimit The lower angle of the limit
   * @param upperLimit The upper angle of the limit
   * @param contactDist The distance from the limit at which it becomes active.
   */
  setHardTwistLimit(lowerLimit: number, upperLimit: number, contactDist: number): void;

  /**
   *  Set the twist limit for the joint.
   * @param lowerLimit The lower angle of the limit
   * @param upperLimit The upper angle of the limit
   * @param stiffness the spring strength of the drive
   * @param damping the damping strength of the drive
   */
  setSoftTwistLimit(lowerLimit: number, upperLimit: number, stiffness: number, damping: number): void;

  /**
   * Set the swing cone limit for the joint.
   * @param yLimitAngle The limit angle from the Y-axis of the constraint frame
   * @param zLimitAngle The limit angle from the Z-axis of the constraint frame
   * @param contactDist The distance from the limit at which it becomes active.
   */
  setHardSwingLimit(yLimitAngle: number, zLimitAngle: number, contactDist: number): void;

  /**
   * Set the swing cone limit for the joint.
   * @param yLimitAngle The limit angle from the Y-axis of the constraint frame
   * @param zLimitAngle The limit angle from the Z-axis of the constraint frame
   * @param stiffness the spring strength of the drive
   * @param damping the damping strength of the drive
   */
  setSoftSwingLimit(yLimitAngle: number, zLimitAngle: number, stiffness: number, damping: number): void;

  /**
   * Set a pyramidal swing limit for the joint.
   * @param yLimitAngleMin The minimum limit angle from the Y-axis of the constraint frame
   * @param yLimitAngleMax The maximum limit angle from the Y-axis of the constraint frame
   * @param zLimitAngleMin The minimum limit angle from the Z-axis of the constraint frame
   * @param zLimitAngleMax The maximum limit angle from the Z-axis of the constraint frame
   * @param contactDist The distance from the limit at which it becomes active.
   */
  setHardPyramidSwingLimit(
    yLimitAngleMin: number,
    yLimitAngleMax: number,
    zLimitAngleMin: number,
    zLimitAngleMax: number,
    contactDist: number
  ): void;

  /**
   * Set a pyramidal swing limit for the joint.
   * @param yLimitAngleMin The minimum limit angle from the Y-axis of the constraint frame
   * @param yLimitAngleMax The maximum limit angle from the Y-axis of the constraint frame
   * @param zLimitAngleMin The minimum limit angle from the Z-axis of the constraint frame
   * @param zLimitAngleMax The maximum limit angle from the Z-axis of the constraint frame
   * @param stiffness the spring strength of the drive
   * @param damping the damping strength of the drive
   */
  setSoftPyramidSwingLimit(
    yLimitAngleMin: number,
    yLimitAngleMax: number,
    zLimitAngleMin: number,
    zLimitAngleMax: number,
    stiffness: number,
    damping: number
  ): void;

  /**
   *  Set the drive parameters for the specified drive type.
   * @param index the type of drive being specified
   * @param driveStiffness The stiffness of the drive spring.
   * @param driveDamping The damping of the drive spring
   * @param driveForceLimit The maximum impulse or force that can be exerted by the drive
   */
  setDrive(index: number, driveStiffness: number, driveDamping: number, driveForceLimit: number): void;

  /**
   * Set the drive goal pose
   * @param position The goal drive pose if positional drive is in use.
   * @param rotation The goal drive rotation if positional drive is in use.
   */
  setDrivePosition(position: Vector3, rotation: Quaternion): void;

  /**
   * Set the target goal velocity for drive.
   * @param linear The goal velocity for linear drive
   * @param angular The goal velocity for angular drive
   */
  setDriveVelocity(linear: Vector3, angular: Vector3): void;

  /**
   * Set the linear tolerance threshold for projection.
   * @param tolerance the linear tolerance threshold
   */
  setProjectionLinearTolerance(tolerance: number): void;

  /**
   * Set the angular tolerance threshold for projection.
   * @param tolerance the angular tolerance threshold in radians
   */
  setProjectionAngularTolerance(tolerance: number): void;
}
