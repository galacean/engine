import { Joint } from "./Joint";
import { IConfigurableJoint } from "@oasis-engine/design";
import { Collider } from "../Collider";
import { PhysicsManager } from "../PhysicsManager";
import { Quaternion, Vector3 } from "@oasis-engine/math";
import { ConfigurableJointAxis, ConfigurableJointDrive, ConfigurableJointMotion } from "../enums";

/**
 * A Configurable joint is a general constraint between two actors.
 */
export class ConfigurableJoint extends Joint {
  private _projectionLinearTolerance: number = 0;
  private _projectionAngularTolerance: number = 0;

  /**
   * The linear tolerance threshold.
   */
  get projectionLinearTolerance(): number {
    return this._projectionLinearTolerance;
  }

  set projectionLinearTolerance(newValue: number) {
    this._projectionLinearTolerance = newValue;
    (<IConfigurableJoint>this._nativeJoint).setProjectionLinearTolerance(newValue);
  }

  /**
   * The angular tolerance threshold in radians.
   */
  get projectionAngularTolerance(): number {
    return this._projectionAngularTolerance;
  }

  set projectionAngularTolerance(newValue: number) {
    this._projectionAngularTolerance = newValue;
    (<IConfigurableJoint>this._nativeJoint).setProjectionAngularTolerance(newValue);
  }

  constructor(collider0: Collider, collider1: Collider) {
    super();
    const jointActor0 = this._jointActor0;
    const jointActor1 = this._jointActor1;
    jointActor0._collider = collider0;
    jointActor1._collider = collider1;
    this._nativeJoint = PhysicsManager._nativePhysics.createConfigurableJoint(
      collider0?._nativeCollider,
      jointActor0._localPosition,
      jointActor0._localRotation,
      collider1?._nativeCollider,
      jointActor1._localPosition,
      jointActor1._localRotation
    );
  }

  /**
   * Set the motion type around the specified axis.
   * @param axis the axis around which motion is specified
   * @param type the motion type around the specified axis
   */
  setMotion(axis: ConfigurableJointAxis, type: ConfigurableJointMotion): void {
    (<IConfigurableJoint>this._nativeJoint).setMotion(axis, type);
  }

  /**
   * Set the distance limit for the joint.
   * @param extent The extent of the limit
   * @param contactDist The distance from the limit at which it becomes active.
   */
  setHardDistanceLimit(extent: number, contactDist: number = -1.0): void {
    (<IConfigurableJoint>this._nativeJoint).setHardDistanceLimit(extent, contactDist);
  }

  /**
   * Set the distance limit for the joint.
   * @param extent the extent of the limit
   * @param stiffness the spring strength of the drive
   * @param damping the damping strength of the drive
   */
  setSoftDistanceLimit(extent: number, stiffness: number, damping: number): void {
    (<IConfigurableJoint>this._nativeJoint).setSoftDistanceLimit(extent, stiffness, damping);
  }

  /**
   * Set the linear limit for a given linear axis.
   * @param axis The limited linear axis
   * @param lowerLimit The lower distance of the limit
   * @param upperLimit The upper distance of the limit
   * @param contactDist The distance from the limit at which it becomes active.
   */
  setHardLinearLimit(
    axis: ConfigurableJointAxis,
    lowerLimit: number,
    upperLimit: number,
    contactDist: number = -1.0
  ): void {
    (<IConfigurableJoint>this._nativeJoint).setHardLinearLimit(axis, lowerLimit, upperLimit, contactDist);
  }

  /**
   * Set the linear limit for a given linear axis.
   * @param axis The limited linear axis
   * @param lowerLimit The lower distance of the limit
   * @param upperLimit The upper distance of the limit
   * @param stiffness the spring strength of the drive
   * @param damping the damping strength of the drive
   */
  setSoftLinearLimit(
    axis: ConfigurableJointAxis,
    lowerLimit: number,
    upperLimit: number,
    stiffness: number,
    damping: number
  ): void {
    (<IConfigurableJoint>this._nativeJoint).setSoftLinearLimit(axis, lowerLimit, upperLimit, stiffness, damping);
  }

  /**
   * Set the twist limit for the joint.
   * @param lowerLimit The lower angle of the limit
   * @param upperLimit The upper angle of the limit
   * @param contactDist The distance from the limit at which it becomes active.
   */
  setHardTwistLimit(lowerLimit: number, upperLimit: number, contactDist: number = -1.0): void {
    (<IConfigurableJoint>this._nativeJoint).setHardTwistLimit(lowerLimit, upperLimit, contactDist);
  }

  /**
   *  Set the twist limit for the joint.
   * @param lowerLimit The lower angle of the limit
   * @param upperLimit The upper angle of the limit
   * @param stiffness the spring strength of the drive
   * @param damping the damping strength of the drive
   */
  setSoftTwistLimit(lowerLimit: number, upperLimit: number, stiffness: number, damping: number): void {
    (<IConfigurableJoint>this._nativeJoint).setSoftTwistLimit(lowerLimit, upperLimit, stiffness, damping);
  }

  /**
   * Set the swing cone limit for the joint.
   * @param yLimitAngle The limit angle from the Y-axis of the constraint frame
   * @param zLimitAngle The limit angle from the Z-axis of the constraint frame
   * @param contactDist The distance from the limit at which it becomes active.
   */
  setHardSwingLimit(yLimitAngle: number, zLimitAngle: number, contactDist: number = -1.0): void {
    (<IConfigurableJoint>this._nativeJoint).setHardSwingLimit(yLimitAngle, zLimitAngle, contactDist);
  }

  /**
   * Set the swing cone limit for the joint.
   * @param yLimitAngle The limit angle from the Y-axis of the constraint frame
   * @param zLimitAngle The limit angle from the Z-axis of the constraint frame
   * @param stiffness the spring strength of the drive
   * @param damping the damping strength of the drive
   */
  setSoftSwingLimit(yLimitAngle: number, zLimitAngle: number, stiffness: number, damping: number): void {
    (<IConfigurableJoint>this._nativeJoint).setSoftSwingLimit(yLimitAngle, zLimitAngle, stiffness, damping);
  }

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
    contactDist: number = -1.0
  ): void {
    (<IConfigurableJoint>this._nativeJoint).setHardPyramidSwingLimit(
      yLimitAngleMin,
      yLimitAngleMax,
      zLimitAngleMin,
      zLimitAngleMax,
      contactDist
    );
  }

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
  ): void {
    (<IConfigurableJoint>this._nativeJoint).setSoftPyramidSwingLimit(
      yLimitAngleMin,
      yLimitAngleMax,
      zLimitAngleMin,
      zLimitAngleMax,
      stiffness,
      damping
    );
  }

  /**
   * Set the drive parameters for the specified drive type.
   * @param index the type of drive being specified
   * @param driveStiffness The stiffness of the drive spring.
   * @param driveDamping The damping of the drive spring
   * @param driveForceLimit The maximum impulse or force that can be exerted by the drive
   */
  setDrive(index: ConfigurableJointDrive, driveStiffness: number, driveDamping: number, driveForceLimit: number): void {
    (<IConfigurableJoint>this._nativeJoint).setDrive(index, driveStiffness, driveDamping, driveForceLimit);
  }

  /**
   * Set the drive goal pose
   * @param position The goal drive pose if positional drive is in use.
   * @param rotation The goal drive rotation if positional drive is in use.
   */
  setDrivePosition(position: Vector3, rotation: Quaternion): void {
    (<IConfigurableJoint>this._nativeJoint).setDrivePosition(position, rotation);
  }

  /**
   * Set the target goal velocity for drive.
   * @param linear The goal velocity for linear drive
   * @param angular The goal velocity for angular drive
   */
  setDriveVelocity(linear: Vector3, angular: Vector3): void {
    (<IConfigurableJoint>this._nativeJoint).setDriveVelocity(linear, angular);
  }
}
