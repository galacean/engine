import { IJoint } from "./IJoint";

export interface IFixedJoint extends IJoint {
  setProjectionLinearTolerance(tolerance: number): void;

  setProjectionAngularTolerance(tolerance: number): void;
}
