import { IJoint } from "./IJoint";

export interface IFixedJoint extends IJoint {
  setProjectionLinearTolerance(tolerance: number);

  setProjectionAngularTolerance(tolerance: number);
}
