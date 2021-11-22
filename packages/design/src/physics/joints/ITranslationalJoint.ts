import { IJoint } from "./IJoint";

export interface ITranslationalJoint extends IJoint {
  setHardLimit(lowerLimit: number, upperLimit: number, contactDist: number): void;

  setSoftLimit(lowerLimit: number, upperLimit: number, stiffness: number, damping: number): void;

  setPrismaticJointFlag(flag: number, value: boolean): void;

  setProjectionLinearTolerance(tolerance: number): void;

  setProjectionAngularTolerance(tolerance: number): void;
}
