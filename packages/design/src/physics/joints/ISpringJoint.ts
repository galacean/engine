import { IJoint } from "./IJoint";

export interface ISpringJoint extends IJoint {
  setMinDistance(distance: number): void;

  setMaxDistance(distance: number): void;

  setTolerance(tolerance: number): void;

  setStiffness(stiffness: number): void;

  setDamping(damping: number): void;

  setDistanceJointFlag(flag: number, value: boolean): void;
}
