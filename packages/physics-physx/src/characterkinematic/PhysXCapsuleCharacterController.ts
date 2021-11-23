import { PhysXCharacterController } from "./PhysXCharacterController";
import { ICapsuleCharacterController } from "@oasis-engine/design";

export class PhysXCapsuleCharacterController extends PhysXCharacterController implements ICapsuleCharacterController {
  setRadius(radius: number): boolean {
    return this._pxController.setRadius(radius);
  }

  setHeight(height: number): boolean {
    return this._pxController.setHeight(height);
  }

  setClimbingMode(mode: number): boolean {
    throw "";
    // this._pxController.setClimbingMode(CPxCapsuleClimbingMode(UInt32(mode)));
  }
}
