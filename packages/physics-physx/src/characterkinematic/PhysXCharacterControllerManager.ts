import { ICharacterControllerManager } from "@oasis-engine/design";
import { Vector3 } from "oasis-engine";
import { PhysXCapsuleCharacterController } from "./PhysXCapsuleCharacterController";
import { PhysXCapsuleCharacterControllerDesc } from "./PhysXCapsuleCharacterControllerDesc";

export class PhysXCharacterControllerManager implements ICharacterControllerManager {
  /** @internal */
  _pxControllerManager: any;

  purgeControllers() {
    this._pxControllerManager.purgeControllers();
  }

  createController(desc: PhysXCapsuleCharacterControllerDesc): PhysXCapsuleCharacterController {
    let pxController = this._pxControllerManager.createController(desc._pxControllerDesc);
    let controller = new PhysXCapsuleCharacterController();
    controller._pxController = pxController;
    return controller;
  }

  computeInteractions(elapsedTime: number) {
    this._pxControllerManager.computeInteractions(elapsedTime);
  }

  setTessellation(flag: boolean, maxEdgeLength: number) {
    this._pxControllerManager.setTessellation(flag, maxEdgeLength);
  }

  setOverlapRecoveryModule(flag: boolean) {
    this._pxControllerManager.setOverlapRecoveryModule(flag);
  }

  setPreciseSweeps(flag: boolean) {
    this._pxControllerManager.setPreciseSweeps(flag);
  }

  setPreventVerticalSlidingAgainstCeiling(flag: boolean) {
    this._pxControllerManager.setPreventVerticalSlidingAgainstCeiling(flag);
  }

  shiftOrigin(shift: Vector3) {
    this._pxControllerManager.shiftOrigin(shift);
  }
}