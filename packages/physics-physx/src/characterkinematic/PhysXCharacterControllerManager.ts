import { ICharacterControllerManager } from "@oasis-engine/design";
import { Vector3 } from "oasis-engine";
import { PhysXCharacterController } from "./PhysXCharacterController";
import { PhysXPhysics } from "../PhysXPhysics";
import { PhysXColliderShape } from "../shape/PhysXColliderShape";
import { PhysXBoxColliderShape } from "../shape/PhysXBoxColliderShape";
import { PhysXCapsuleColliderShape } from "../shape/PhysXCapsuleColliderShape";

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
  createController(shape: PhysXColliderShape): PhysXCharacterController {
    let desc: any;
    if (shape instanceof PhysXBoxColliderShape) {
      desc = new PhysXPhysics._physX.PxBoxControllerDesc();
      desc.halfHeight = shape._halfSize.x;
      desc.halfSideExtent = shape._halfSize.y;
      desc.halfForwardExtent = shape._halfSize.z;
    } else if (shape instanceof PhysXCapsuleColliderShape) {
      desc = new PhysXPhysics._physX.PxCapsuleControllerDesc();
      desc.radius = shape._radius;
      desc.height = shape._halfHeight * 2;
      desc.climbingMode = 1; // constraint mode
    } else {
      throw "unsupported shape type";
    }

    desc.setMaterial(shape._pxMaterials[0]);
    let pxController = this._pxControllerManager.createController(desc);
    let controller = new PhysXCharacterController();
    controller._pxController = pxController;
    controller._setShape(shape);
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
