import { ICharacterControllerManager } from "@oasis-engine/design";
import { Vector3 } from "oasis-engine";
import { PhysXCapsuleCharacterController } from "./PhysXCapsuleCharacterController";
import { PhysXCapsuleCharacterControllerDesc } from "./PhysXCapsuleCharacterControllerDesc";

/**
 * Manages an array of character controllers.
 */
export class PhysXCharacterControllerManager implements ICharacterControllerManager {
  /** @internal */
  _pxControllerManager: any;

  /**
   * {@inheritDoc ICharacterControllerManager.purgeControllers }
   */
  purgeControllers() {
    this._pxControllerManager.purgeControllers();
  }

  /**
   * {@inheritDoc ICharacterControllerManager.createController }
   */
  createController(desc: PhysXCapsuleCharacterControllerDesc): PhysXCapsuleCharacterController {
    let pxController = this._pxControllerManager.createController(desc._pxControllerDesc);
    let controller = new PhysXCapsuleCharacterController();
    controller._pxController = pxController;
    return controller;
  }

  /**
   * {@inheritDoc ICharacterControllerManager.computeInteractions }
   */
  computeInteractions(elapsedTime: number) {
    this._pxControllerManager.computeInteractions(elapsedTime);
  }

  /**
   * {@inheritDoc ICharacterControllerManager.setTessellation }
   */
  setTessellation(flag: boolean, maxEdgeLength: number) {
    this._pxControllerManager.setTessellation(flag, maxEdgeLength);
  }

  /**
   * {@inheritDoc ICharacterControllerManager.setOverlapRecoveryModule }
   */
  setOverlapRecoveryModule(flag: boolean) {
    this._pxControllerManager.setOverlapRecoveryModule(flag);
  }

  /**
   * {@inheritDoc ICharacterControllerManager.setPreciseSweeps }
   */
  setPreciseSweeps(flag: boolean) {
    this._pxControllerManager.setPreciseSweeps(flag);
  }

  /**
   * {@inheritDoc ICharacterControllerManager.setPreventVerticalSlidingAgainstCeiling }
   */
  setPreventVerticalSlidingAgainstCeiling(flag: boolean) {
    this._pxControllerManager.setPreventVerticalSlidingAgainstCeiling(flag);
  }

  /**
   * {@inheritDoc ICharacterControllerManager.shiftOrigin }
   */
  shiftOrigin(shift: Vector3) {
    this._pxControllerManager.shiftOrigin(shift);
  }
}
