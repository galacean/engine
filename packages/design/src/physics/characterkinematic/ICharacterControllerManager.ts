import { Vector3 } from "@oasis-engine/math";
import { ICharacterControllerDesc } from "./ICharacterControllerDesc";
import { ICharacterController } from "./ICharacterController";

export interface ICharacterControllerManager {
  purgeControllers();

  createController(desc: ICharacterControllerDesc): ICharacterController;

  computeInteractions(elapsedTime: number);

  setTessellation(flag: boolean, maxEdgeLength: number);

  setOverlapRecoveryModule(flag: boolean);

  setPreciseSweeps(flag: boolean);

  setPreventVerticalSlidingAgainstCeiling(flag: boolean);

  shiftOrigin(shift: Vector3);
}
