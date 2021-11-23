import { Joint } from "./Joint";
import { IConfigurableJoint } from "@oasis-engine/design";
import { Collider } from "../Collider";
import { PhysicsManager } from "../PhysicsManager";
import { Quaternion, Vector3 } from "@oasis-engine/math";

enum ConfigurableJointAxis {
  /// motion along the X axis
  X = 0,
  /// motion along the Y axis
  Y = 1,
  /// motion along the Z axis
  Z = 2,
  /// motion around the X axis
  TWIST = 3,
  /// motion around the Y axis
  SWING1 = 4,
  /// motion around the Z axis
  SWING2 = 5
}

enum ConfigurableJointMotion {
  /// The DOF is locked, it does not allow relative motion.
  LOCKED = 0,
  /// The DOF is limited, it only allows motion within a specific range.
  LIMITED = 1,
  /// The DOF is free and has its full range of motion.
  FREE = 2
}

enum ConfigurableJointDrive {
  /// drive along the X-axis
  X = 0,
  /// drive along the Y-axis
  Y = 1,
  /// drive along the Z-axis
  Z = 2,
  /// drive of displacement from the X-axis
  SWING = 3,
  /// drive of the displacement around the X-axis
  TWIST = 4,
  /// drive of all three angular degrees along a SLERP-path
  SLERP = 5
}

export class ConfigurableJoint extends Joint {
  private _projectionLinearTolerance: number = 0;
  private _projectionAngularTolerance: number = 0;

  get projectionLinearTolerance(): number {
    return this._projectionLinearTolerance;
  }

  set projectionLinearTolerance(newValue: number) {
    this._projectionLinearTolerance = newValue;
    (<IConfigurableJoint>this._nativeJoint).setProjectionLinearTolerance(newValue);
  }

  get projectionAngularTolerance(): number {
    return this._projectionAngularTolerance;
  }

  set projectionAngularTolerance(newValue: number) {
    this._projectionAngularTolerance = newValue;
    (<IConfigurableJoint>this._nativeJoint).setProjectionAngularTolerance(newValue);
  }

  constructor(collider0: Collider, collider1: Collider) {
    super();
    this._nativeJoint = PhysicsManager._nativePhysics.createConfigurableJoint(
      collider0?._nativeCollider,
      new Vector3(),
      new Quaternion(),
      collider1?._nativeCollider,
      new Vector3(),
      new Quaternion()
    );
  }

  setMotion(axis: ConfigurableJointAxis, type: ConfigurableJointMotion) {
    (<IConfigurableJoint>this._nativeJoint).setMotion(axis, type);
  }

  setHardDistanceLimit(extent: number, contactDist: number) {
    (<IConfigurableJoint>this._nativeJoint).setHardDistanceLimit(extent, contactDist);
  }

  setSoftDistanceLimit(extent: number, stiffness: number, damping: number) {
    (<IConfigurableJoint>this._nativeJoint).setSoftDistanceLimit(extent, stiffness, damping);
  }

  setHardLinearLimit(axis: ConfigurableJointAxis, lowerLimit: number, upperLimit: number, contactDist: number) {
    (<IConfigurableJoint>this._nativeJoint).setHardLinearLimit(axis, lowerLimit, upperLimit, contactDist);
  }

  setSoftLinearLimit(
    axis: ConfigurableJointAxis,
    lowerLimit: number,
    upperLimit: number,
    stiffness: number,
    damping: number
  ) {
    (<IConfigurableJoint>this._nativeJoint).setSoftLinearLimit(axis, lowerLimit, upperLimit, stiffness, damping);
  }

  setHardTwistLimit(lowerLimit: number, upperLimit: number, contactDist: number) {
    (<IConfigurableJoint>this._nativeJoint).setHardTwistLimit(lowerLimit, upperLimit, contactDist);
  }

  setSoftTwistLimit(lowerLimit: number, upperLimit: number, stiffness: number, damping: number) {
    (<IConfigurableJoint>this._nativeJoint).setSoftTwistLimit(lowerLimit, upperLimit, stiffness, damping);
  }

  setHardSwingLimit(yLimitAngle: number, zLimitAngle: number, contactDist: number) {
    (<IConfigurableJoint>this._nativeJoint).setHardSwingLimit(yLimitAngle, zLimitAngle, contactDist);
  }

  setSoftSwingLimit(yLimitAngle: number, zLimitAngle: number, stiffness: number, damping: number) {
    (<IConfigurableJoint>this._nativeJoint).setSoftSwingLimit(yLimitAngle, zLimitAngle, stiffness, damping);
  }

  setHardPyramidSwingLimit(
    yLimitAngleMin: number,
    yLimitAngleMax: number,
    zLimitAngleMin: number,
    zLimitAngleMax: number,
    contactDist: number
  ) {
    (<IConfigurableJoint>this._nativeJoint).setHardPyramidSwingLimit(
      yLimitAngleMin,
      yLimitAngleMax,
      zLimitAngleMin,
      zLimitAngleMax,
      contactDist
    );
  }

  setSoftPyramidSwingLimit(
    yLimitAngleMin: number,
    yLimitAngleMax: number,
    zLimitAngleMin: number,
    zLimitAngleMax: number,
    stiffness: number,
    damping: number
  ) {
    (<IConfigurableJoint>this._nativeJoint).setSoftPyramidSwingLimit(
      yLimitAngleMin,
      yLimitAngleMax,
      zLimitAngleMin,
      zLimitAngleMax,
      stiffness,
      damping
    );
  }

  setDrive(index: ConfigurableJointDrive, driveStiffness: number, driveDamping: number, driveForceLimit: number) {
    (<IConfigurableJoint>this._nativeJoint).setDrive(index, driveStiffness, driveDamping, driveForceLimit);
  }

  setDrivePosition(position: Vector3, rotation: Quaternion) {
    (<IConfigurableJoint>this._nativeJoint).setDrivePosition(position, rotation);
  }

  setDriveVelocity(linear: Vector3, angular: Vector3) {
    (<IConfigurableJoint>this._nativeJoint).setDriveVelocity(linear, angular);
  }
}
