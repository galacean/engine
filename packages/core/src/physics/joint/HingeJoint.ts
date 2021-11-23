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

export class HingeJoint extends Joint {
  private _driveVelocity: number = 0;
  private _driveForceLimit: number = 0;
  private _driveGearRatio: number = 0;
  private _projectionLinearTolerance: number = 0;
  private _projectionAngularTolerance: number = 0;

  get driveVelocity(): number {
    return this._driveVelocity;
  }

  set driveVelocity(newValue: number) {
    this._driveVelocity = newValue;
    (<IHingeJoint>this._nativeJoint).setDriveVelocity(newValue);
  }

  get driveForceLimit(): number {
    return this._driveForceLimit;
  }

  set driveForceLimit(newValue: number) {
    this._driveForceLimit = newValue;
    (<IHingeJoint>this._nativeJoint).setDriveForceLimit(newValue);
  }

  get driveGearRatio(): number {
    return this._driveGearRatio;
  }

  set driveGearRatio(newValue: number) {
    this._driveGearRatio = newValue;
    (<IHingeJoint>this._nativeJoint).setDriveGearRatio(newValue);
  }

  get projectionLinearTolerance(): number {
    return this._projectionLinearTolerance;
  }

  set projectionLinearTolerance(newValue: number) {
    this._projectionLinearTolerance = newValue;
    (<IHingeJoint>this._nativeJoint).setProjectionLinearTolerance(newValue);
  }

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

  setHardLimit(lowerLimit: number, upperLimit: number, contactDist: number) {
    (<IHingeJoint>this._nativeJoint).setHardLimit(lowerLimit, upperLimit, contactDist);
  }

  setSoftLimit(lowerLimit: number, upperLimit: number, stiffness: number, damping: number) {
    (<IHingeJoint>this._nativeJoint).setSoftLimit(lowerLimit, upperLimit, stiffness, damping);
  }

  setHingeJointFlag(flag: HingeJointFlag, value: boolean) {
    (<IHingeJoint>this._nativeJoint).setRevoluteJointFlag(flag, value);
  }
}
