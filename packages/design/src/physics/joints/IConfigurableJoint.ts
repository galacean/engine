import { IJoint } from "./IJoint";
import { Vector3, Quaternion } from "@oasis-engine/math";

export interface IConfigurableJoint extends IJoint {
  setMotion(axis: number, type: number): void;

  setHardDistanceLimit(extent: number, contactDist: number): void;

  setSoftDistanceLimit(extent: number, stiffness: number, damping: number): void;

  setHardLinearLimit(axis: number, lowerLimit: number, upperLimit: number, contactDist: number): void;

  setSoftLinearLimit(axis: number, lowerLimit: number, upperLimit: number, stiffness: number, damping: number): void;

  setHardTwistLimit(lowerLimit: number, upperLimit: number, contactDist: number): void;

  setSoftTwistLimit(lowerLimit: number, upperLimit: number, stiffness: number, damping: number): void;

  setHardSwingLimit(yLimitAngle: number, zLimitAngle: number, contactDist: number): void;

  setSoftSwingLimit(yLimitAngle: number, zLimitAngle: number, stiffness: number, damping: number): void;

  setHardPyramidSwingLimit(
    yLimitAngleMin: number,
    yLimitAngleMax: number,
    zLimitAngleMin: number,
    zLimitAngleMax: number,
    contactDist: number
  ): void;

  setSoftPyramidSwingLimit(
    yLimitAngleMin: number,
    yLimitAngleMax: number,
    zLimitAngleMin: number,
    zLimitAngleMax: number,
    stiffness: number,
    damping: number
  ): void;

  setDrive(index: number, driveStiffness: number, driveDamping: number, driveForceLimit: number): void;

  setDrivePosition(position: Vector3, rotation: Quaternion): void;

  setDriveVelocity(linear: Vector3, angular: Vector3): void;

  setProjectionLinearTolerance(tolerance: number): void;

  setProjectionAngularTolerance(tolerance: number): void;
}
