import { PhysXCharacterController } from "./PhysXCharacterController";
import { ICapsuleCharacterController } from "@oasis-engine/design";

/**
 * A capsule character controller.
 */
export class PhysXCapsuleCharacterController extends PhysXCharacterController implements ICapsuleCharacterController {
  /**
   * {@inheritDoc ICapsuleCharacterController.setRadius }
   */
  setRadius(radius: number): boolean {
    return this._pxController.setRadius(radius);
  }

  /**
   * {@inheritDoc ICapsuleCharacterController.setHeight }
   */
  setHeight(height: number): boolean {
    return this._pxController.setHeight(height);
  }

  /**
   * {@inheritDoc ICapsuleCharacterController.setClimbingMode }
   */
  setClimbingMode(mode: number): boolean {
    return this._pxController.setClimbingMode(mode);
  }
}
