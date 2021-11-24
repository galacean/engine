import { PhysXCharacterControllerDesc } from "./PhysXCharacterControllerDesc";
import { ICapsuleCharacterControllerDesc } from "@oasis-engine/design";
import { PhysXPhysics } from "../PhysXPhysics";

/**
 * A descriptor for a capsule character controller.
 */
export class PhysXCapsuleCharacterControllerDesc
  extends PhysXCharacterControllerDesc
  implements ICapsuleCharacterControllerDesc
{
  constructor() {
    super();
    this._pxControllerDesc = PhysXPhysics._physX.PxCapsuleControllerDesc();
  }

  /**
   * {@inheritDoc ICapsuleCharacterControllerDesc.setToDefault }
   */
  setToDefault() {
    this._pxControllerDesc.setToDefault();
  }

  /**
   * {@inheritDoc ICapsuleCharacterControllerDesc.setRadius }
   */
  setRadius(radius: number) {
    this._pxControllerDesc.radius = radius;
  }

  /**
   * {@inheritDoc ICapsuleCharacterControllerDesc.setHeight }
   */
  setHeight(height: number) {
    this._pxControllerDesc.height = height;
  }

  /**
   * {@inheritDoc ICapsuleCharacterControllerDesc.setClimbingMode }
   */
  setClimbingMode(climbingMode: number) {
    this._pxControllerDesc.setClimbingMode(climbingMode);
  }
}
