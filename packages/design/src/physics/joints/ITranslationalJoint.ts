import { IJoint } from "./IJoint";

export interface ITranslationalJoint extends IJoint {
  setHardLimit(lowerLimit: number, upperLimit: number, contactDist: number);

  setSoftLimit(lowerLimit: number, upperLimit: number, stiffness: number, damping: number);

  setPrismaticJointFlag(flag: number, value: boolean);

  setProjectionLinearTolerance(tolerance: number);

  setProjectionAngularTolerance(tolerance: number);
}
