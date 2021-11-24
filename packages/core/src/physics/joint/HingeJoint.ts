import { Joint } from "./Joint";
import { IHingeJoint } from "@oasis-engine/design";
import { Collider } from "../Collider";
import { PhysicsManager } from "../PhysicsManager";
import { Vector3, Quaternion } from "@oasis-engine/math";

enum HingeJointFlag {
  /// enable the limit
  LIMIT_ENABLED = 1,
  /// enable the drive
  DRIVE_ENABLED = 2,
  /// if the existing velocity is beyond the drive velocity, do not add force
  DRIVE_FREESPIN = 4
}

/**
 * A joint which behaves in a similar way to a hinge or axle.
 */
export class HingeJoint extends Joint {
  private _driveVelocity: number = 0;
  private _driveForceLimit: number = 0;
  private _driveGearRatio: number = 0;
  private _projectionLinearTolerance: number = 0;
  private _projectionAngularTolerance: number = 0;

  /**
   * the drive target velocity
   */
  get driveVelocity(): number {
    return this._driveVelocity;
  }

  set driveVelocity(newValue: number) {
    this._driveVelocity = newValue;
    (<IHingeJoint>this._nativeJoint).setDriveVelocity(newValue);
  }

  /**
   * the maximum torque
   */
  get driveForceLimit(): number {
    return this._driveForceLimit;
  }

  set driveForceLimit(newValue: number) {
    this._driveForceLimit = newValue;
    (<IHingeJoint>this._nativeJoint).setDriveForceLimit(newValue);
  }

  /**
   * the gear ratio
   */
  get driveGearRatio(): number {
    return this._driveGearRatio;
  }

  set driveGearRatio(newValue: number) {
    this._driveGearRatio = newValue;
    (<IHingeJoint>this._nativeJoint).setDriveGearRatio(newValue);
  }

  /**
   * the linear tolerance threshold
   */
  get projectionLinearTolerance(): number {
    return this._projectionLinearTolerance;
  }

  set projectionLinearTolerance(newValue: number) {
    this._projectionLinearTolerance = newValue;
    (<IHingeJoint>this._nativeJoint).setProjectionLinearTolerance(newValue);
  }

  /**
   * the angular tolerance threshold in radians
   */
  get projectionAngularTolerance(): number {
    return this._projectionAngularTolerance;
  }

  set projectionAngularTolerance(newValue: number) {
    this._projectionAngularTolerance = newValue;
    (<IHingeJoint>this._nativeJoint).setProjectionAngularTolerance(newValue);
  }

  constructor(collider0: Collider, collider1: Collider) {
    super();
    this._nativeJoint = PhysicsManager._nativePhysics.createHingeJoint(
      collider0?._nativeCollider,
      new Vector3(),
      new Quaternion(),
      collider1?._nativeCollider,
      new Vector3(),
      new Quaternion()
    );
  }

  /**
   * Set a cone hard limit.
   * @param lowerLimit The lower angle of the limit
   * @param upperLimit The upper angle of the limit
   * @param contactDist The distance from the limit at which it becomes active. Default is the lesser of 0.1 radians, and 0.49 * the lower of the limit angles
   */
  setHardLimit(lowerLimit: number, upperLimit: number, contactDist: number) {
    (<IHingeJoint>this._nativeJoint).setHardLimit(lowerLimit, upperLimit, contactDist);
  }

  /**
   * Set a cone soft limit.
   * @param lowerLimit The lower angle of the limit
   * @param upperLimit The upper angle of the limit
   * @param stiffness the spring strength of the drive
   * @param damping the damping strength of the drive
   */
  setSoftLimit(lowerLimit: number, upperLimit: number, stiffness: number, damping: number) {
    (<IHingeJoint>this._nativeJoint).setSoftLimit(lowerLimit, upperLimit, stiffness, damping);
  }

  /**
   * sets a single flag specific to a Revolute Joint.
   * @param flag The flag to set or clear.
   * @param value the value to which to set the flag
   */
  setHingeJointFlag(flag: HingeJointFlag, value: boolean) {
    (<IHingeJoint>this._nativeJoint).setRevoluteJointFlag(flag, value);
  }
}
