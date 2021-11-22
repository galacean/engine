import { IJoint } from "./IJoint";

export interface IHingeJoint extends IJoint {
  setHardLimit(lowerLimit: number, upperLimit: number, contactDist: number);

  setSoftLimit(lowerLimit: number, upperLimit: number, stiffness: number, damping: number);

  setDriveVelocity(velocity: number);

  setDriveForceLimit(limit: number);

  setDriveGearRatio(ratio: number);

  setRevoluteJointFlag(flag: number, value: boolean);

  setProjectionLinearTolerance(tolerance: number);

  setProjectionAngularTolerance(tolerance: number);
}
