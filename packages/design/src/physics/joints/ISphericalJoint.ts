import { IJoint } from "./IJoint";

export interface ISphericalJoint extends IJoint {
  setHardLimitCone(yLimitAngle: number, zLimitAngle: number, contactDist: number): void;

  setSoftLimitCone(yLimitAngle: number, zLimitAngle: number, stiffness: number, damping: number): void;

  setSphericalJointFlag(flag: number, value: boolean): void;

  setProjectionLinearTolerance(tolerance: number): void;
}
