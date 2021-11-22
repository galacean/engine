import { IJoint } from "./IJoint";

export interface IHingeJoint extends IJoint {
  setHardLimit(lowerLimit: number, upperLimit: number, contactDist: number): void;

  setSoftLimit(lowerLimit: number, upperLimit: number, stiffness: number, damping: number): void;

  setDriveVelocity(velocity: number): void;

  setDriveForceLimit(limit: number): void;

  setDriveGearRatio(ratio: number): void;

  setRevoluteJointFlag(flag: number, value: boolean): void;

  setProjectionLinearTolerance(tolerance: number): void;

  setProjectionAngularTolerance(tolerance: number): void;
}
