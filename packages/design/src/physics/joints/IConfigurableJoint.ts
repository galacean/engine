import { IJoint } from "./IJoint";
import { Vector3, Quaternion } from "@oasis-engine/math";

export interface IConfigurableJoint extends IJoint {
  setMotion(axis: number, type: number);

  setHardDistanceLimit(extent: number, contactDist: number);

  setSoftDistanceLimit(extent: number, stiffness: number, damping: number);

  setHardLinearLimit(axis: number, lowerLimit: number, upperLimit: number, contactDist: number);

  setSoftLinearLimit(axis: number, lowerLimit: number, upperLimit: number, stiffness: number, damping: number);

  setHardTwistLimit(lowerLimit: number, upperLimit: number, contactDist: number);

  setSoftTwistLimit(lowerLimit: number, upperLimit: number, stiffness: number, damping: number);

  setHardSwingLimit(yLimitAngle: number, zLimitAngle: number, contactDist: number);

  setSoftSwingLimit(yLimitAngle: number, zLimitAngle: number, stiffness: number, damping: number);

  setHardPyramidSwingLimit(
    yLimitAngleMin: number,
    yLimitAngleMax: number,
    zLimitAngleMin: number,
    zLimitAngleMax: number,
    contactDist: number
  );

  setSoftPyramidSwingLimit(
    yLimitAngleMin: number,
    yLimitAngleMax: number,
    zLimitAngleMin: number,
    zLimitAngleMax: number,
    stiffness: number,
    damping: number
  );

  setDrive(index: number, driveStiffness: number, driveDamping: number, driveForceLimit: number);

  setDrivePosition(position: Vector3, rotation: Quaternion);

  setDriveVelocity(linear: Vector3, angular: Vector3);

  setProjectionLinearTolerance(tolerance: number);

  setProjectionAngularTolerance(tolerance: number);
}
