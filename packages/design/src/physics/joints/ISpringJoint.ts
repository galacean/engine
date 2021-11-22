import { IJoint } from "./IJoint";

export interface ISpringJoint extends IJoint {
  setMinDistance(distance: number);

  setMaxDistance(distance: number);

  setTolerance(tolerance: number);

  setStiffness(stiffness: number);

  setDamping(damping: number);

  setDistanceJointFlag(flag: number, value: boolean);
}
