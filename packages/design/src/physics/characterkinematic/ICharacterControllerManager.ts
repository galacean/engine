import { Vector3 } from "@oasis-engine/math";
import { ICharacterControllerDesc } from "./ICharacterControllerDesc";
import { ICharacterController } from "./ICharacterController";

export interface ICharacterControllerManager {
  purgeControllers(): void;

  createController(desc: ICharacterControllerDesc): ICharacterController;

  computeInteractions(elapsedTime: number): void;

  setTessellation(flag: boolean, maxEdgeLength: number): void;

  setOverlapRecoveryModule(flag: boolean): void;

  setPreciseSweeps(flag: boolean): void;

  setPreventVerticalSlidingAgainstCeiling(flag: boolean): void;

  shiftOrigin(shift: Vector3): void;
}
