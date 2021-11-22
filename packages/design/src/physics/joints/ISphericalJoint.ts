import { IJoint } from "./IJoint";

export interface ISphericalJoint extends IJoint {
  setHardLimitCone(yLimitAngle: number, zLimitAngle: number, contactDist: number);

  setSoftLimitCone(yLimitAngle: number, zLimitAngle: number, stiffness: number, damping: number);

  setSphericalJointFlag(flag: number, value: boolean);

  setProjectionLinearTolerance(tolerance: number);
}
